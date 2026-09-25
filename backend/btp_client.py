"""SAP BTP Integration Suite client — the ONLY module that talks to the tenant.

Every public function has two branches:

  * mock  (SETTINGS.use_mock is True)  -> returns local fixtures, no network.
  * live  (SETTINGS.use_mock is False) -> calls the real Cloud Integration OData
            API. Those calls are PLACEHOLDERS marked `>>> PLACEHOLDER <<<`; the
            URL/shape is filled in from SAP's API but the response mapping needs
            verifying against your tenant.

Reference endpoints (Cloud Integration OData API v1):
  GET  /IntegrationRuntimeArtifacts
  GET  /IntegrationDesigntimeArtifacts(Id='..',Version='..')/Configurations
  POST /$batch for configuration changes
  POST /DeployIntegrationDesigntimeArtifact?Id='..'&Version='..'
  GET  /MessageProcessingLogs?$filter=IntegrationFlowName eq '..'
"""
from __future__ import annotations

import json
import os
import re
import asyncio
from datetime import datetime, timedelta, timezone
from typing import List
from urllib.parse import quote
from urllib.parse import urljoin, urlsplit, urlunsplit, unquote

import httpx

from config import SETTINGS
from auth import get_access_token
import destination_client
from errors import InvalidRuntimeEndpoint, InvalidUpstreamResponse
from models import (
    ArtifactIdentity,
    Configuration,
    ConfigurationUpdate,
    DeployResponse,
    ImmediateRunResponse,
    Integration,
    MessageLog,
    MonitoringItem,
)

# Fixtures are shared with the frontend so demo data stays in one place.
_MOCK_DIR = os.path.join(
    os.path.dirname(__file__), "..", "webapp", "localService", "mockdata"
)
def _load_mock(name: str):
    with open(os.path.join(_MOCK_DIR, name), "r", encoding="utf-8") as fh:
        return json.load(fh)


def _odata_literal(value: str) -> str:
    """Return a URL-safe quoted OData string literal."""
    escaped = str(value).replace("'", "''")
    return f"'{quote(escaped, safe='')}'"


async def _management_connection():
    if SETTINGS.sap_transport == "destination":
        destination = await destination_client.resolve("management")
        return destination.url, destination.authorization
    if SETTINGS.sap_transport != "legacy-development" or os.getenv("VCAP_APPLICATION"):
        raise InvalidUpstreamResponse("Legacy SAP transport is development-only")
    return SETTINGS.is_api_base, "Bearer " + await get_access_token()


async def _is_get(path: str) -> dict:
    """Authenticated GET against the Integration Suite OData API (JSON)."""
    try:
        api_base, authorization = await _management_connection()
    except httpx.HTTPStatusError as error:
        # A token/destination lookup 404 is not an artifact lookup 404.
        # Keep it out of identity fallback, without exposing response secrets.
        from fastapi import HTTPException
        status = error.response.status_code
        raise HTTPException(
            503 if status in (429, 503) else 502,
            f"SAP management credential resolution failed (HTTP {status})"
        ) from None
    async with httpx.AsyncClient(timeout=60, follow_redirects=False) as client:
        resp = await client.get(
            api_base + path,
            headers={"Authorization": authorization, "Accept": "application/json"},
        )
        resp.raise_for_status()
        try:
            data = resp.json()
        except ValueError as exc:
            raise InvalidUpstreamResponse("Integration Suite returned invalid JSON.") from exc
        if not isinstance(data, dict):
            raise InvalidUpstreamResponse("Integration Suite returned an invalid response object.")
        return data


def _odata_results(data: dict) -> List[dict]:
    envelope = data.get("d") if isinstance(data, dict) else None
    rows = envelope.get("results") if isinstance(envelope, dict) else None
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise InvalidUpstreamResponse("Integration Suite returned an invalid collection response.")
    return rows


def _unique_values(values: List[str]) -> List[str]:
    seen = set()
    unique = []
    for value in values:
        text = str(value or "").strip()
        if text and text not in seen:
            seen.add(text)
            unique.append(text)
    return unique


def _normalize_match_value(value: str) -> str:
    return re.sub(r"[\s_-]+", "", str(value or "")).lower()


def _odata_filter_literal(value: str) -> str:
    return "'" + str(value or "").replace("'", "''") + "'"


async def _design_time_matches_for_candidate(candidate: str) -> List[dict]:
    filter_expression = (
        f"Id eq {_odata_filter_literal(candidate)} "
        f"or Name eq {_odata_filter_literal(candidate)}"
    )
    path = f"/IntegrationDesigntimeArtifacts?$filter={quote(filter_expression, safe='')}"
    try:
        data = await _is_get(path)
    except httpx.HTTPStatusError as error:
        if error.response.status_code != 404:
            raise
        return []
    return _odata_results(data)


async def _design_time_matches_for_package(package_id: str) -> List[dict]:
    if not package_id:
        return []
    filter_expression = f"PackageId eq {_odata_filter_literal(package_id)}"
    path = f"/IntegrationDesigntimeArtifacts?$filter={quote(filter_expression, safe='')}"
    try:
        data = await _is_get(path)
    except httpx.HTTPStatusError as error:
        if error.response.status_code != 404:
            raise
        return []
    return _odata_results(data)


async def resolve_identity(integration_id: str, item: Integration | None = None) -> ArtifactIdentity:
    item = item or await get_integration(integration_id)
    if item is None:
        raise RuntimeError("Integration design time artifact not found")
    explicit = item.designTimeId
    ids = _unique_values([explicit, integration_id, item.name])
    versions = _unique_values(["Active", "active", item.designTimeVersion, item.version])
    async def lookup(candidate_ids, candidate_versions):
        found = {}
        for candidate in candidate_ids:
            for version in candidate_versions:
                try:
                    data = await _is_get(f"/IntegrationDesigntimeArtifacts(Id={_odata_literal(candidate)},Version={_odata_literal(version)})")
                except httpx.HTTPStatusError as error:
                    if error.response.status_code != 404:
                        raise
                    continue
                raw = data.get("d", data)
                if not isinstance(raw, dict) or not raw.get("Id") or not raw.get("Version") or str(raw["Version"]).lower() == "active":
                    raise InvalidUpstreamResponse("SAP did not return a concrete artifact identity")
                identity = ArtifactIdentity(runtimeId=integration_id, designTimeId=raw["Id"],
                    designTimeVersion=raw["Version"], packageId=raw.get("PackageId") or item.packageName)
                found[identity.designTimeId] = identity
                break
        if len(found) > 1:
            raise InvalidUpstreamResponse("Ambiguous design-time artifact identity")
        return next(iter(found.values()), None)
    if explicit:
        result = await lookup([explicit], versions)
        if result:
            return result
    result = await lookup(ids, versions)
    if result:
        return result
    matches = []
    for candidate in ids:
        matches.extend(await _design_time_matches_for_candidate(candidate))
    unique = {row.get("Id"): row for row in matches if row.get("Id")}
    if not unique:
        package = await _design_time_matches_for_package(item.packageName)
        normalized = {_normalize_match_value(v) for v in ids}
        exact = [r for r in package if normalized.intersection({_normalize_match_value(r.get("Id")), _normalize_match_value(r.get("Name"))})]
        candidates = exact or package
        unique = {r.get("Id"):r for r in candidates if r.get("Id")}
    if len(unique) > 1:
        raise InvalidUpstreamResponse("Ambiguous design-time artifact identity")
    if unique:
        raw = next(iter(unique.values()))
        result = await lookup([raw['Id']], _unique_values(versions + [raw.get('Version', '')]))
        if result:
            return result
    raise RuntimeError("Integration design time artifact not found")


# --------------------------------------------------------------------------- #
# Integrations
# --------------------------------------------------------------------------- #
async def list_integrations(enrich: bool = False) -> List[Integration]:
    if SETTINGS.use_mock:
        return [Integration(**{**o, "sender": o.get("sender") or "", "receiver": o.get("receiver") or ""})
                for o in _load_mock("integrations.json")["value"]]

    # >>> PLACEHOLDER: GET /IntegrationRuntimeArtifacts <<<
    data = await _is_get("/IntegrationRuntimeArtifacts")
    results = _odata_results(data)
    items = [
        Integration(
            id=r.get("Id", ""),
            name=r.get("Name", r.get("Id", "")),
            designTimeId=(
                r.get("IntegrationDesigntimeArtifactId")
                or r.get("DesigntimeArtifactId")
                or r.get("DesignTimeArtifactId")
                or r.get("ArtifactId")
                or ""
            ),
            designTimeVersion=r.get("IntegrationDesigntimeArtifactVersion", "") or "",
            packageName=r.get("PackageId", ""),
            version=r.get("Version", ""),
            status=r.get("Status", "STOPPED"),
            description=r.get("Description", ""),
            parameterCount=0,  # filled by a follow-up Configurations call if needed
            lastDeployed=r.get("DeployedOn"),
            isRuntimeArtifact=True,
            sender=r.get("Sender", "") or "",
            receiver=r.get("Receiver", "") or "",
            endpoint=r.get("Endpoint", "") or r.get("Url", "") or "",
        )
        for r in results
    ]
    if enrich:
        semaphore = asyncio.Semaphore(6)
        async def enrich_one(item):
            async with semaphore:
                return await enrich_integration(item)
        return await asyncio.gather(*(enrich_one(item) for item in items))
    return items


async def enrich_integration(item: Integration) -> Integration:
    try:
        identity = await resolve_identity(item.id, item)
    except RuntimeError as error:
        if str(error) == "Integration design time artifact not found":
            return item
        raise
    raw = (await _is_get(f"/IntegrationDesigntimeArtifacts(Id={_odata_literal(identity.designTimeId)},Version={_odata_literal(identity.designTimeVersion)})"))
    raw = raw.get('d', raw)
    return item.model_copy(update={
        'designTimeId': identity.designTimeId, 'designTimeVersion': identity.designTimeVersion,
        'packageName': item.packageName or identity.packageId,
        'sender': raw.get('Sender') or item.sender, 'receiver': raw.get('Receiver') or item.receiver,
        'identity': identity.model_dump(),
    })



async def get_integration(integration_id: str, enrich: bool = False) -> Integration | None:
    items = await list_integrations()
    for item in items:
        if item.id == integration_id:
            return await enrich_integration(item) if enrich and not SETTINGS.use_mock else item
    return None


async def get_configurations(integration_id: str) -> List[Configuration]:
    if SETTINGS.use_mock:
        raw = _load_mock("configurations.json").get(integration_id, [])
        return [Configuration(**o) for o in raw]

    identity = await resolve_identity(integration_id)
    data = await _is_get(f"/IntegrationDesigntimeArtifacts(Id={_odata_literal(identity.designTimeId)},Version={_odata_literal(identity.designTimeVersion)})/Configurations")
    results = _odata_results(data)
    return [
        Configuration(
            key=r.get("ParameterKey", ""),
            label=r.get("ParameterKey", ""),
            value=r.get("ParameterValue") if r.get("ParameterValue") is not None else "",
            dataType=r.get("DataType", "xsd:string"),
        )
        for r in results
    ]


async def update_configurations(
    integration_id: str, updates: List[ConfigurationUpdate], identity: ArtifactIdentity | None = None
) -> dict:
    if SETTINGS.use_mock:
        return {"id": integration_id, "updated": len(updates)}

    if not updates:
        return {"id": integration_id, "updated": 0}

    resolved = await resolve_identity(integration_id)
    if identity and identity != resolved:
        from fastapi import HTTPException
        raise HTTPException(409, "Artifact identity changed; reload before saving")
    design_time_id, version = resolved.designTimeId, resolved.designTimeVersion
    batch_boundary = "batch_integration_pulse"
    changeset_boundary = "all_parameters"
    lines = [
        f"--{batch_boundary}",
        f"Content-Type: multipart/mixed; boundary={changeset_boundary}",
        "",
    ]
    for upd in updates:
        path = (
            f"IntegrationDesigntimeArtifacts(Id={_odata_literal(design_time_id)},"
            f"Version={_odata_literal(version)})/$links/Configurations"
            f"({_odata_literal(upd.key)})"
        )
        body = {
            "ParameterKey": upd.key,
            "ParameterValue": upd.value,
            "DataType": upd.dataType or "xsd:string",
        }
        lines.extend(
            [
                f"--{changeset_boundary}",
                "Content-Type: application/http",
                "Content-Transfer-Encoding: binary",
                "",
                f"PUT {path} HTTP/1.1",
                "Accept: application/json",
                "Content-Type: application/json",
                "",
                json.dumps(body),
                "",
            ]
        )
    lines.extend(
        [
            f"--{changeset_boundary}--",
            f"--{batch_boundary}--",
            "",
        ]
    )

    api_base, authorization = await _management_connection()
    async with httpx.AsyncClient(timeout=60, follow_redirects=False) as client:
        resp = await client.post(
            api_base + "/$batch",
            headers={
                "Authorization": authorization,
                "Accept": "application/json",
                "Content-Type": f"multipart/mixed; boundary={batch_boundary}",
            },
            content="\r\n".join(lines),
        )
        resp.raise_for_status()
        if re.search(r"HTTP/1\.1\s+[45]\d\d", resp.text or ""):
            raise httpx.HTTPStatusError(
                "One or more configuration batch updates failed",
                request=resp.request,
                response=resp,
            )
    return {"id": integration_id, "updated": len(updates)}


async def deploy_integration(
    integration_id: str, updates: List[ConfigurationUpdate], identity: ArtifactIdentity | None = None
) -> DeployResponse:
    # Persist edits first, then trigger deployment.
    if not SETTINGS.use_mock:
        resolved = await resolve_identity(integration_id)
        if identity and identity != resolved:
            from fastapi import HTTPException
            raise HTTPException(409, "Artifact identity changed; reload before deployment")
        identity = resolved
    await update_configurations(integration_id, updates, identity)

    if SETTINGS.use_mock:
        return DeployResponse(
            id=integration_id, status="STARTING", taskId=f"mock-task-{integration_id}"
        )

    # >>> PLACEHOLDER: POST /DeployIntegrationDesigntimeArtifact for the selected artifact only <<<
    design_time_id, version = identity.designTimeId, identity.designTimeVersion
    api_base, authorization = await _management_connection()
    path = (
        f"/DeployIntegrationDesigntimeArtifact?Id={_odata_literal(design_time_id)}"
        f"&Version={_odata_literal(version)}"
    )
    async with httpx.AsyncClient(timeout=120, follow_redirects=False) as client:
        resp = await client.post(
            api_base + path,
            headers={"Authorization": authorization, "Accept": "application/json"},
        )
        resp.raise_for_status()
        task_id = resp.text.strip() or None
    return DeployResponse(id=integration_id, status="STARTING", taskId=task_id)


def _tenant_runtime_base() -> str:
    """Base URL for HTTPS sender endpoints, separate from the OData /api/v1 root."""
    if SETTINGS.immediate_run_base:
        return SETTINGS.immediate_run_base.rstrip("/")
    return re.sub(r"/api/v1/?$", "", SETTINGS.is_api_base).rstrip("/")


def _join_runtime_endpoint(endpoint: str, runtime_base: str | None = None) -> str:
    """Only send tenant credentials to the configured HTTPS runtime origin."""
    raw = str(endpoint or "").strip()
    def origin(parts):
        return (parts.scheme.lower(), (parts.hostname or "").lower(), parts.port or 443)
    try:
        base = urlsplit(runtime_base or _tenant_runtime_base())
        target = urlsplit(raw)
        if base.scheme.lower() != "https" or not base.hostname or base.username or base.password:
            raise ValueError("Invalid runtime base")
        if not raw or raw.startswith("//") or target.username or target.password or target.fragment:
            raise ValueError("Invalid runtime address")
        if target.scheme or target.netloc:
            if origin(target) != origin(base):
                raise ValueError("Untrusted runtime origin")
            path = target.path
        else:
            path = target.path
            if path != "/http" and not path.startswith("/http/"):
                path = "/http/" + path.lstrip("/")
        # Reject nested encoding rather than letting later proxies reinterpret
        # escaped path separators, dot segments or control characters.
        decoded = unquote(path)
        if "%" in decoded or "\\" in decoded or any(ord(c) < 32 or ord(c) == 127 for c in raw + decoded):
            raise ValueError("Invalid runtime path")
        if any(segment in {".", ".."} for segment in decoded.split("/")):
            raise ValueError("Runtime path traversal")
        if not path.startswith("/http/") or not decoded.startswith("/http/") or decoded == "/http/":
            raise ValueError("HTTPS sender path required")
        return urlunsplit((base.scheme, base.netloc, path, target.query, ""))
    except ValueError as exc:
        raise InvalidRuntimeEndpoint("Immediate run requires an HTTPS sender path on the configured runtime host.") from exc


async def trigger_immediate_run(
    integration_id: str,
    endpoint: str | None = None,
    entity: str = "",
    pulse_query: str = "",
) -> ImmediateRunResponse:
    # This calls the separate HTTPS sender endpoint for the iFlow. It does not
    # update configurations, redeploy the artifact, or modify timer parameters.
    if SETTINGS.use_mock:
        return ImmediateRunResponse(
            id=integration_id,
            status="TRIGGERED",
            message="Mock immediate run started.",
        )

    if SETTINGS.sap_transport == "destination":
        destination = await destination_client.resolve("runtime")
        if urlsplit(destination.url).path not in {"", "/"}:
            raise InvalidRuntimeEndpoint("Runtime destination must identify the HTTPS runtime origin")
        try:
            endpoints = json.loads(os.getenv("PULSE_RUNTIME_ENDPOINTS", "{}"))
            if not isinstance(endpoints, dict):
                raise ValueError()
            approved = endpoints.get(integration_id)
        except ValueError:
            raise InvalidRuntimeEndpoint("Invalid server endpoint configuration") from None
        if not approved:
            configurations = await get_configurations(integration_id)
            approved = next((c.value for c in configurations if c.key == "pulse.immediateRunEndpoint" and c.value), None)
        if not approved:
            item = await get_integration(integration_id)
            approved = item.endpoint if item else ""
        if not approved:
            raise InvalidRuntimeEndpoint("Integration has no approved runtime endpoint")
        runtime_url = _join_runtime_endpoint(approved, destination.url)
        if endpoint and _join_runtime_endpoint(endpoint, destination.url) != runtime_url:
            raise InvalidRuntimeEndpoint("Runtime endpoint does not belong to the selected integration")
        authorization = destination.authorization
    else:
        if SETTINGS.sap_transport != "legacy-development" or os.getenv("VCAP_APPLICATION"):
            raise InvalidRuntimeEndpoint("Legacy runtime transport is development-only")
        resolved_endpoint = endpoint
        if not resolved_endpoint:
            item = await get_integration(integration_id)
            resolved_endpoint = item.endpoint if item else ""
        if not resolved_endpoint:
            raise RuntimeError("No HTTPS sender endpoint is available for this integration.")
        runtime_url = _join_runtime_endpoint(resolved_endpoint)
        # Validate all request input before acquiring/sending SAP credentials.
        authorization = None
    if any(any(ord(char) < 32 or ord(char) > 126 for char in value) for value in [entity, pulse_query]):
        raise InvalidRuntimeEndpoint("Immediate-run headers require printable ASCII; percent-encode query values.")
    if authorization is None:
        authorization = "Bearer " + await get_access_token()
    headers = {
        "Authorization": authorization,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if entity:
        headers["pulse.entity"] = entity
        headers["X-Pulse-Entity"] = entity
    if pulse_query:
        headers["filter.pulseQuery"] = pulse_query
        headers["filter-pulseQuery"] = pulse_query
        headers["X-Pulse-Query"] = pulse_query
    async with httpx.AsyncClient(timeout=120, follow_redirects=False) as client:
        resp = await client.post(
            runtime_url,
            headers=headers,
            content="{}",
        )
        resp.raise_for_status()
    return ImmediateRunResponse(
        id=integration_id,
        status="TRIGGERED",
        message="Immediate run request sent.",
    )


# --------------------------------------------------------------------------- #
# Monitoring
# --------------------------------------------------------------------------- #
async def list_monitoring() -> List[MonitoringItem]:
    if SETTINGS.use_mock:
        return [MonitoringItem(**o) for o in _load_mock("runtimeStatus.json")["value"]]

    data = await _is_get("/IntegrationRuntimeArtifacts")
    results = _odata_results(data)
    now = datetime.now(timezone.utc)
    semaphore = asyncio.Semaphore(6)
    async def summarize(raw):
        async with semaphore:
            logs = await _get_recent_logs(raw.get("Id", ""), now)
        return len(logs), sum(str(log.get("Status") or "").upper() == "FAILED" for log in logs)
    counts = await asyncio.gather(*(summarize(raw) for raw in results))
    return [
        MonitoringItem(
            id=r.get("Id", ""),
            name=r.get("Name", r.get("Id", "")),
            packageName=r.get("PackageId", ""),
            status=r.get("Status", "STOPPED"),
            endpoint=r.get("Endpoint") or r.get("Url") or "",
            sender=r.get("Sender") or "",
            receiver=r.get("Receiver") or "",
            messages24h=count[0],
            errors24h=count[1],
            lastDeployed=r.get("DeployedOn"),
        )
        for r, count in zip(results, counts)
    ]


def _log_time(value):
    match = re.fullmatch(r"/Date\((-?\d+)(?:[+-]\d+)?\)/", str(value or ""))
    try:
        if match:
            return datetime.fromtimestamp(int(match[1]) / 1000, tz=timezone.utc)
        result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result.astimezone(timezone.utc)
    except (ValueError, TypeError, OverflowError, OSError):
        return None


async def _get_recent_logs(integration_id: str, now: datetime) -> List[dict]:
    api_base, _ = await _management_connection()
    since = now - timedelta(hours=24)
    filter_expr = (f"IntegrationFlowName eq {_odata_filter_literal(integration_id)} and "
                   f"LogEnd ge datetime'{since.strftime('%Y-%m-%dT%H:%M:%S')}'")
    path = "/MessageProcessingLogs?$filter=" + quote(filter_expr, safe="") + "&$orderby=LogEnd%20desc&$top=1000&$format=json"
    rows, seen_pages, seen_ids = [], set(), set()
    while path:
        if path in seen_pages:
            raise InvalidUpstreamResponse("Integration Suite returned a repeated log page.")
        seen_pages.add(path)
        data = await _is_get(path)
        for log in _odata_results(data):
            stamp = _log_time(log.get("LogEnd"))
            message_id = log.get("MessageGuid")
            if stamp and since <= stamp <= now and str(log.get("Status") or "").upper() != "DISCARDED":
                if message_id and message_id in seen_ids:
                    continue
                if message_id:
                    seen_ids.add(message_id)
                rows.append(log)
        next_url = data["d"].get("__next")
        if not next_url:
            break
        if not isinstance(next_url, str):
            raise InvalidUpstreamResponse("Integration Suite returned an invalid log page link.")
        try:
            full = urlsplit(urljoin(api_base + path, next_url))
            base = urlsplit(api_base)
        except ValueError as exc:
            raise InvalidUpstreamResponse("Integration Suite returned an invalid log page link.") from exc
        expected_path = base.path.rstrip("/") + "/MessageProcessingLogs"
        if full.scheme != base.scheme or full.netloc != base.netloc or full.path != expected_path or full.fragment:
            raise InvalidUpstreamResponse("Integration Suite returned an invalid log page link.")
        path = "/MessageProcessingLogs" + ("?" + full.query if full.query else "")
    return rows


async def get_monitoring_item(integration_id: str) -> MonitoringItem | None:
    for item in await list_monitoring():
        if item.id == integration_id:
            return item
    return None


async def get_message_logs(integration_id: str) -> List[MessageLog]:
    if SETTINGS.use_mock:
        raw = _load_mock("messageLogs.json").get(integration_id, [])
        return [MessageLog(**o) for o in raw]

    # >>> PLACEHOLDER: GET /MessageProcessingLogs?$filter=IntegrationFlowName eq '..' <<<
    filter_expr = f"IntegrationFlowName eq {_odata_filter_literal(integration_id)}"
    encoded_filter = quote(filter_expr, safe="=$'()")
    path = (
        f"/MessageProcessingLogs?$filter={encoded_filter}"
        "&$orderby=LogEnd%20desc&$top=50&$format=json"
    )
    data = await _is_get(path)
    results = _odata_results(data)
    return [
        MessageLog(
            messageId=r.get("MessageGuid") or r.get("MessageId") or "",
            status=r.get("Status", ""),
            sender=r.get("Sender", ""),
            logEnd=r.get("LogEnd"),
            durationMs=r.get("Duration") or 0,
            errorMessage=r.get("CustomStatus") or r.get("ErrorMessage") or "",
        )
        for r in results if str(r.get("Status") or "").upper() != "DISCARDED"
    ]
