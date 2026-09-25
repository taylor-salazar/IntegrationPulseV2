"""Integration routes: list, detail, configurations, deploy.

These handlers intentionally stay thin. They translate HTTP requests into calls
to btp_client, which owns the mock/live Integration Suite behavior.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException, Query, Depends

import btp_client
from security import viewer, administrator, Principal
from configuration_policy import for_principal
from models import (
    Configuration,
    ConfigurationUpdateRequest,
    DeployResponse,
    ImmediateRunRequest,
    ImmediateRunResponse,
    Integration,
)

router = APIRouter(prefix="/api/integrations", tags=["integrations"], dependencies=[Depends(viewer)])


# Query identity is unambiguous even when an artifact ID contains slash or a
# reserved suffix such as /configurations. Keep existing paths compatible.
@router.get("/by-id", response_model=Integration)
async def integration_by_id(integrationId: str = Query(...)):
    return await get_integration(integrationId)


@router.get("/by-id/configurations", response_model=List[Configuration])
async def configurations_by_id(integrationId: str = Query(...), principal: Principal = Depends(viewer)):
    return await get_configurations(integrationId, principal)


@router.put("/by-id/configurations", dependencies=[Depends(administrator)])
async def update_by_id(body: ConfigurationUpdateRequest, integrationId: str = Query(...)):
    return await update_configurations(integrationId, body)


@router.post("/by-id/deploy", response_model=DeployResponse, dependencies=[Depends(administrator)])
async def deploy_by_id(body: ConfigurationUpdateRequest, integrationId: str = Query(...)):
    return await deploy_integration(integrationId, body)


@router.post("/by-id/trigger", response_model=ImmediateRunResponse, dependencies=[Depends(administrator)])
async def trigger_by_id(body: ImmediateRunRequest, integrationId: str = Query(...)):
    return await trigger_immediate_run(integrationId, body)


@router.get("", response_model=List[Integration])
async def list_integrations():
    return await btp_client.list_integrations(enrich=True)


async def get_integration(integration_id: str):
    item = await btp_client.get_integration(integration_id, enrich=True)
    if not item:
        raise HTTPException(status_code=404, detail="Integration not found")
    return item


@router.get("/{integration_id}/configurations", response_model=List[Configuration])
async def get_configurations(integration_id: str, principal: Principal = Depends(viewer)):
    return for_principal(await btp_client.get_configurations(integration_id), principal)


@router.put("/{integration_id}/configurations", dependencies=[Depends(administrator)])
async def update_configurations(integration_id: str, body: ConfigurationUpdateRequest):
    # Configuration updates are passed as one request so btp_client can send them
    # through the Integration Suite batch endpoint.
    return await btp_client.update_configurations(integration_id, body.configurations, body.identity)


@router.post("/{integration_id}/deploy", response_model=DeployResponse, dependencies=[Depends(administrator)])
async def deploy_integration(integration_id: str, body: ConfigurationUpdateRequest):
    return await btp_client.deploy_integration(integration_id, body.configurations, body.identity)


@router.post("/{integration_id}/trigger", response_model=ImmediateRunResponse, dependencies=[Depends(administrator)])
async def trigger_immediate_run(integration_id: str, body: ImmediateRunRequest):
    return await btp_client.trigger_immediate_run(
        integration_id,
        body.endpoint,
        entity=body.entity,
        pulse_query=body.pulseQuery or body.filterQuery,
    )


router.add_api_route("/{integration_id:path}", get_integration, methods=["GET"], response_model=Integration)
