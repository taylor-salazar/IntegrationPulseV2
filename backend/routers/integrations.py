"""Integration routes: list, detail, configurations, deploy.

These handlers intentionally stay thin. They translate HTTP requests into calls
to btp_client, which owns the mock/live Integration Suite behavior.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException

import btp_client
from models import (
    Configuration,
    ConfigurationUpdateRequest,
    DeployResponse,
    ImmediateRunRequest,
    ImmediateRunResponse,
    Integration,
)

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


@router.get("", response_model=List[Integration])
async def list_integrations():
    return await btp_client.list_integrations()


@router.get("/{integration_id}", response_model=Integration)
async def get_integration(integration_id: str):
    item = await btp_client.get_integration(integration_id)
    if not item:
        raise HTTPException(status_code=404, detail="Integration not found")
    return item


@router.get("/{integration_id}/configurations", response_model=List[Configuration])
async def get_configurations(integration_id: str):
    return await btp_client.get_configurations(integration_id)


@router.put("/{integration_id}/configurations")
async def update_configurations(integration_id: str, body: ConfigurationUpdateRequest):
    # Configuration updates are passed as one request so btp_client can send them
    # through the Integration Suite batch endpoint.
    return await btp_client.update_configurations(integration_id, body.configurations)


@router.post("/{integration_id}/deploy", response_model=DeployResponse)
async def deploy_integration(integration_id: str, body: ConfigurationUpdateRequest):
    return await btp_client.deploy_integration(integration_id, body.configurations)


@router.post("/{integration_id}/trigger", response_model=ImmediateRunResponse)
async def trigger_immediate_run(integration_id: str, body: ImmediateRunRequest):
    return await btp_client.trigger_immediate_run(
        integration_id,
        body.endpoint,
        select_query=body.selectQuery,
        expand_query=body.expandQuery,
    )
