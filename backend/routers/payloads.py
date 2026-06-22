"""Payload receiver and viewer routes."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from models import PayloadCreateRequest, PayloadDetail, PayloadSummary
import payload_storage

router = APIRouter(prefix="/payload-api/v1/payloads", tags=["payloads"])

RETENTION_DAYS = 7
PREVIEW_LIMIT_BYTES = 100 * 1024


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _summary(item: dict) -> PayloadSummary:
    return PayloadSummary(**{k: item[k] for k in PayloadSummary.model_fields})


@router.post("", response_model=PayloadSummary)
async def create_payload(
    request: Request,
    integrationId: Optional[str] = Query(None),
    messageId: Optional[str] = Query(None),
    fileName: Optional[str] = Query(None),
):
    """Receive a text payload from an Integration Suite HTTP receiver step.

    Supports either the original JSON wrapper contract or a raw text body
    (JSON, CSV, XML, plain text) with metadata supplied by query parameters
    or HTTP headers.
    """
    raw_body = await request.body()
    headers = request.headers
    content_type = headers.get("content-type", "text/plain").split(";")[0] or "text/plain"
    raw_text = raw_body.decode("utf-8", errors="replace")
    wrapper = None
    if "json" in content_type:
        try:
            candidate = json.loads(raw_text or "{}")
            if isinstance(candidate, dict) and "payload" in candidate:
                wrapper = PayloadCreateRequest(**candidate)
        except Exception:
            wrapper = None

    if wrapper:
        body = wrapper
    else:
        resolved_integration_id = (
            integrationId
            or headers.get("x-integration-id")
            or headers.get("x-integrationid")
        )
        if not resolved_integration_id:
            raise HTTPException(
                status_code=400,
                detail="integrationId is required as a query parameter, header, or JSON wrapper field",
            )
        body = PayloadCreateRequest(
            integrationId=resolved_integration_id,
            messageId=messageId or headers.get("x-message-id") or headers.get("x-messageid"),
            fileName=fileName or headers.get("x-file-name") or headers.get("x-filename") or "payload.txt",
            contentType=content_type,
            payload=raw_text,
        )

    created_at = _now()
    payload_bytes = body.payload.encode("utf-8")
    size_bytes = len(payload_bytes)
    download_only = size_bytes > PREVIEW_LIMIT_BYTES
    item = {
        "id": str(uuid4()),
        "integrationId": body.integrationId,
        "messageId": body.messageId,
        "fileName": body.fileName,
        "contentType": body.contentType,
        "sizeBytes": size_bytes,
        "createdAt": _iso(created_at),
        "expiresAt": _iso(created_at + timedelta(days=RETENTION_DAYS)),
        "previewAvailable": not download_only,
        "downloadOnly": download_only,
        "payload": body.payload,
    }
    saved = await asyncio.to_thread(payload_storage.create_payload, item)
    return _summary(saved)


@router.get("", response_model=List[PayloadSummary])
async def list_payloads(integrationId: str = Query(...)):
    """List unexpired payloads for one integration."""
    items = await asyncio.to_thread(payload_storage.list_payloads, integrationId)
    return [_summary(item) for item in items]


@router.get("/{payload_id}", response_model=PayloadDetail)
async def get_payload(payload_id: str):
    """Return payload content when it is small enough for inline preview."""
    item = await asyncio.to_thread(payload_storage.get_payload, payload_id)
    if item:
        detail = PayloadDetail(**item)
        if item["downloadOnly"]:
            detail.payload = None
        return detail
    raise HTTPException(status_code=404, detail="Payload not found")


@router.get("/{payload_id}/download")
async def download_payload(payload_id: str):
    """Download the raw text payload."""
    item = await asyncio.to_thread(payload_storage.get_payload, payload_id)
    if item:
        return PlainTextResponse(
            item["payload"],
            media_type=item["contentType"],
            headers={
                "Content-Disposition": f'attachment; filename="{item["fileName"]}"'
            },
        )
    raise HTTPException(status_code=404, detail="Payload not found")
