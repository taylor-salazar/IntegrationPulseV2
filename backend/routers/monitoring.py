"""Monitoring routes: runtime status list, detail, message processing logs.

The frontend combines this runtime/log data with integration metadata so users
can see business-friendly Source/Target system health.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException

import btp_client
from models import MessageLog, MonitoringItem

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])


@router.get("", response_model=List[MonitoringItem])
async def list_monitoring():
    return await btp_client.list_monitoring()


@router.get("/{integration_id}", response_model=MonitoringItem)
async def get_monitoring_item(integration_id: str):
    item = await btp_client.get_monitoring_item(integration_id)
    if not item:
        raise HTTPException(status_code=404, detail="Integration not found")
    return item


@router.get("/{integration_id}/logs", response_model=List[MessageLog])
async def get_message_logs(integration_id: str):
    return await btp_client.get_message_logs(integration_id)
