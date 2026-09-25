"""Monitoring routes: runtime status list, detail, message processing logs.

The frontend combines this runtime/log data with integration metadata so users
can see business-friendly Source/Target system health.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException, Query, Depends

import btp_client
from security import viewer, administrator
from models import MessageLog, MonitoringItem

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"], dependencies=[Depends(viewer)])


@router.get("/by-id", response_model=MonitoringItem)
async def monitoring_by_id(integrationId: str = Query(...)):
    return await get_monitoring_item(integrationId)


@router.get("/by-id/logs", response_model=List[MessageLog])
async def logs_by_id(integrationId: str = Query(...)):
    return await get_message_logs(integrationId)


@router.get("", response_model=List[MonitoringItem])
async def list_monitoring():
    return await btp_client.list_monitoring()


async def get_monitoring_item(integration_id: str):
    item = await btp_client.get_monitoring_item(integration_id)
    if not item:
        raise HTTPException(status_code=404, detail="Integration not found")
    return item


@router.get("/{integration_id}/logs", response_model=List[MessageLog])
async def get_message_logs(integration_id: str):
    return await btp_client.get_message_logs(integration_id)


router.add_api_route("/{integration_id:path}", get_monitoring_item, methods=["GET"], response_model=MonitoringItem)
