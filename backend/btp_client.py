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

import asyncio
import json
import os
import re
from typing import List
from urllib.parse import quote

import httpx

from config import SETTINGS
from auth import get_access_token
from models import (
    Configuration,
    ConfigurationUpdate,
    DeployResponse,
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
        return resp.json()


def _odata_results(data: dict) -> List[dict]:
    return data.get("d", {}).get("results", [])


def _map_design_time_metadata(raw: dict) -> dict:
    return {
        "id": raw.get("Id", ""),
        "name": raw.get("Name", ""),
        "packageName": raw.get("PackageId", ""),
        "version": raw.get("Version", ""),
        "sender": raw.get("Sender", "") or "",
        "receiver": raw.get("Receiver", "") or "",
    }


async def _design_time_metadata_for_artifact(integration_id: str) -> dict:
    path = (
        f"/IntegrationDesigntimeArtifacts(Id={_odata_literal(integration_id)},"
        f"Version={_odata_literal('Active')})"
    )
    try:
        data = await _is_get(path)
    except httpx.HTTPStatusError:
        return {}
    return _map_design_time_metadata(data.get("d", data))


# --------------------------------------------------------------------------- #
# Integrations
# --------------------------------------------------------------------------- #
async def list_integrations() -> List[Integration]:
    if SETTINGS.use_mock:
        return [Integration(**o) for o in _load_mock("integrations.json")["value"]]

    # >>> PLACEHOLDER: GET /IntegrationRuntimeArtifacts <<<
    data = await _is_get("/IntegrationRuntimeArtifacts")
    results = _odata_results(data)
    design_time_items = await asyncio.gather(
        *[_design_time_metadata_for_artifact(r.get("Id", "")) for r in results]
    )
    return [
        Integration(
            id=r.get("Id", ""),
            name=r.get("Name", r.get("Id", "")),
            packageName=r.get("PackageId", ""),
            version=r.get("Version", ""),
            status=r.get("Status", "STOPPED"),
            description=r.get("Description", ""),
            parameterCount=0,  # filled by a follow-up Configurations call if needed
            lastDeployed=r.get("DeployedOn"),
            isRuntimeArtifact=True,
            sender=design_time_items[i].get("sender", ""),
            receiver=design_time_items[i].get("receiver", ""),
        )
        for i, r in enumerate(results)
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

    # >>> PLACEHOLDER: GET .../IntegrationDesigntimeArtifacts(Id='..',Version='Active')/Configurations <<<
    version = "Active"
    path = (
        f"/IntegrationDesigntimeArtifacts(Id={_odata_literal(integration_id)},"
        f"Version={_odata_literal(version)})"
        f"/Configurations"
    )
    data = await _is_get(path)
    results = data.get("d", {}).get("results", [])
    return [
        Configuration(
            key=r.get("ParameterKey", ""),
            label=r.get("ParameterKey", ""),
            value=r.get("ParameterValue", ""),
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

    version = "Active"
    batch_boundary = "batch_integration_pulse"
    changeset_boundary = "all_parameters"
    lines = [
        f"--{batch_boundary}",
        f"Content-Type: multipart/mixed; boundary={changeset_boundary}",
        "",
    ]
    for upd in updates:
        path = (
            f"IntegrationDesigntimeArtifacts(Id={_odata_literal(integration_id)},"
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
    version = "Active"
    token = await get_access_token()
    path = (
        f"/DeployIntegrationDesigntimeArtifact?Id={_odata_literal(integration_id)}"
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


# --------------------------------------------------------------------------- #
# Monitoring
# --------------------------------------------------------------------------- #
async def list_monitoring() -> List[MonitoringItem]:
    if SETTINGS.use_mock:
        return [MonitoringItem(**o) for o in _load_mock("runtimeStatus.json")["value"]]

    # >>> PLACEHOLDER: GET /IntegrationRuntimeArtifacts + MessageProcessingLogs aggregation <<<
    data = await _is_get("/IntegrationRuntimeArtifacts")
    results = data.get("d", {}).get("results", [])
    return [
        MonitoringItem(
            id=r.get("Id", ""),
            name=r.get("Name", r.get("Id", "")),
            packageName=r.get("PackageId", ""),
            status=r.get("Status", "STOPPED"),
            sender=r.get("Sender", ""),
            receiver=r.get("Receiver", ""),
            lastDeployed=r.get("DeployedOn"),
        )
        for r in results
    ]


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
    filter_expr = f"IntegrationFlowName eq {_odata_literal(integration_id)}"
    encoded_filter = quote(filter_expr, safe="=$'()")
    path = (
        f"/MessageProcessingLogs?$filter={encoded_filter}"
        "&$orderby=LogEnd%20desc&$top=50&$format=json"
    )
    data = await _is_get(path)
    results = data.get("d", {}).get("results", [])
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
