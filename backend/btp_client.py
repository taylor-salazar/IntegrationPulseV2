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
from errors import InvalidRuntimeEndpoint, InvalidUpstreamResponse
from models import (
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


async def _is_get(path: str) -> dict:
    """Authenticated GET against the Integration Suite OData API (JSON)."""
    token = await get_access_token()
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(
            SETTINGS.is_api_base + path,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
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
    except httpx.HTTPStatusError:
        return []
    return _odata_results(data)


async def _design_time_matches_for_package(package_id: str) -> List[dict]:
    if not package_id:
        return []
    filter_expression = f"PackageId eq {_odata_filter_literal(package_id)}"
    path = f"/IntegrationDesigntimeArtifacts?$filter={quote(filter_expression, safe='')}"
    try:
        data = await _is_get(path)
    except httpx.HTTPStatusError:
        return []
    return _odata_results(data)


async def _matched_design_time_items(integration_id: str, item: Integration | None) -> List[dict]:
    candidates = [
        item.designTimeId if item else "",
        integration_id,
        item.name if item else "",
    ]
    normalized_candidates = {_normalize_match_value(value) for value in candidates if value}
    matches = []
    for candidate in _unique_values(candidates):
        for raw in await _design_time_matches_for_candidate(candidate):
            raw_values = {
                _normalize_match_value(raw.get("Id", "")),
                _normalize_match_value(raw.get("Name", "")),
            }
            if normalized_candidates.intersection(raw_values):
                matches.append(raw)
    if matches:
        return matches
    package_items = await _design_time_matches_for_package(item.packageName if item else "")
    for raw in package_items:
        raw_values = {
            _normalize_match_value(raw.get("Id", "")),
            _normalize_match_value(raw.get("Name", "")),
        }
        if any(
            raw_value
            and candidate
            and (raw_value in candidate or candidate in raw_value)
            for raw_value in raw_values
            for candidate in normalized_candidates
        ):
            matches.append(raw)
    if not matches and len(package_items) == 1:
        matches = package_items
    return matches


async def _design_time_candidates(integration_id: str) -> tuple[List[str], List[str]]:
    item = await get_integration(integration_id)
    try:
        matches = await _matched_design_time_items(integration_id, item)
    except httpx.HTTPStatusError:
        matches = []
    ids = _unique_values(
        [
            item.designTimeId if item else "",
            integration_id,
            item.name if item else "",
        ]
        + [match.get("Id", "") for match in matches]
    )
    versions = _unique_values(
        [
            "Active",
            "active",
            item.designTimeVersion if item else "",
            item.version if item else "",
        ]
        + [match.get("Version", "") for match in matches]
    )
    return ids, versions


async def _resolve_design_time_identity(integration_id: str) -> tuple[str, str]:
    ids, versions = await _design_time_candidates(integration_id)
    for candidate_id in ids:
        for version in versions:
            path = (
                f"/IntegrationDesigntimeArtifacts(Id={_odata_literal(candidate_id)},"
                f"Version={_odata_literal(version)})"
            )
            try:
                data = await _is_get(path)
                entity = data.get("d", data)
                if not isinstance(entity, dict) or not isinstance(entity.get("Id"), str) or not entity["Id"]:
                    raise InvalidUpstreamResponse("Integration Suite returned an invalid artifact identity.")
                return candidate_id, version
            except httpx.HTTPStatusError:
                continue
    raise RuntimeError("Integration design time artifact not found")


# --------------------------------------------------------------------------- #
# Integrations
# --------------------------------------------------------------------------- #
async def list_integrations() -> List[Integration]:
    if SETTINGS.use_mock:
        return [Integration(**{**o, "sender": o.get("sender") or "", "receiver": o.get("receiver") or ""})
                for o in _load_mock("integrations.json")["value"]]

    # >>> PLACEHOLDER: GET /IntegrationRuntimeArtifacts <<<
    data = await _is_get("/IntegrationRuntimeArtifacts")
    results = _odata_results(data)
    return [
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


async def get_integration(integration_id: str) -> Integration | None:
    items = await list_integrations()
    for item in items:
        if item.id == integration_id:
            return item
    return None


async def get_configurations(integration_id: str) -> List[Configuration]:
    if SETTINGS.use_mock:
        raw = _load_mock("configurations.json").get(integration_id, [])
        return [Configuration(**o) for o in raw]

    ids, versions = await _design_time_candidates(integration_id)
    data = None
    for candidate_id in ids:
        for version in versions:
            path = (
                f"/IntegrationDesigntimeArtifacts(Id={_odata_literal(candidate_id)},"
                f"Version={_odata_literal(version)})"
                f"/Configurations"
            )
            try:
                data = await _is_get(path)
                break
            except httpx.HTTPStatusError:
                continue
        if data is not None:
            break
    if data is None:
        raise RuntimeError("Integration design time artifact not found")
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
    integration_id: str, updates: List[ConfigurationUpdate]
) -> dict:
    if SETTINGS.use_mock:
        return {"id": integration_id, "updated": len(updates)}

    if not updates:
        return {"id": integration_id, "updated": 0}

    design_time_id, version = await _resolve_design_time_identity(integration_id)
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

    token = await get_access_token()
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            SETTINGS.is_api_base + "/$batch",
            headers={
                "Authorization": f"Bearer {token}",
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
    integration_id: str, updates: List[ConfigurationUpdate]
) -> DeployResponse:
    # Persist edits first, then trigger deployment.
    await update_configurations(integration_id, updates)

    if SETTINGS.use_mock:
        return DeployResponse(
            id=integration_id, status="STARTING", taskId=f"mock-task-{integration_id}"
        )

    # >>> PLACEHOLDER: POST /DeployIntegrationDesigntimeArtifact for the selected artifact only <<<
    design_time_id, version = await _resolve_design_time_identity(integration_id)
    token = await get_access_token()
    path = (
        f"/DeployIntegrationDesigntimeArtifact?Id={_odata_literal(design_time_id)}"
        f"&Version={_odata_literal(version)}"
    )
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            SETTINGS.is_api_base + path,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        resp.raise_for_status()
        task_id = resp.text.strip() or None
    return DeployResponse(id=integration_id, status="STARTING", taskId=task_id)


def _tenant_runtime_base() -> str:
    """Base URL for HTTPS sender endpoints, separate from the OData /api/v1 root."""
    if SETTINGS.immediate_run_base:
        return SETTINGS.immediate_run_base.rstrip("/")
    return re.sub(r"/api/v1/?$", "", SETTINGS.is_api_base).rstrip("/")


def _join_runtime_endpoint(endpoint: str) -> str:
    """Only send tenant credentials to the configured HTTPS runtime origin."""
    raw = str(endpoint or "").strip()
    def origin(parts):
        return (parts.scheme.lower(), (parts.hostname or "").lower(), parts.port or 443)
    try:
        base = urlsplit(_tenant_runtime_base())
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

    resolved_endpoint = endpoint
    if not resolved_endpoint:
        item = await get_integration(integration_id)
        resolved_endpoint = item.endpoint if item else ""
    if not resolved_endpoint:
        raise RuntimeError("No HTTPS sender endpoint is available for this integration.")

    runtime_url = _join_runtime_endpoint(resolved_endpoint)
    if any(any(ord(char) < 32 or ord(char) > 126 for char in value) for value in [entity, pulse_query]):
        raise InvalidRuntimeEndpoint("Immediate-run headers require printable ASCII; percent-encode query values.")
    token = await get_access_token()
    headers = {
        "Authorization": f"Bearer {token}",
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
    async with httpx.AsyncClient(timeout=120) as client:
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
            full = urlsplit(urljoin(SETTINGS.is_api_base + path, next_url))
            base = urlsplit(SETTINGS.is_api_base)
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
            messageId=r.get("MessageGuid", ""),
            status=r.get("Status", ""),
            sender=r.get("Sender", ""),
            logEnd=r.get("LogEnd"),
            durationMs=0,
            errorMessage=r.get("CustomStatus", ""),
        )
        for r in results
    ]
