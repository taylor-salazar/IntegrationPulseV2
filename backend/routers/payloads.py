"""Payload receiver and viewer routes."""
from __future__ import annotations

import asyncio
import json
import re
import os
from urllib.parse import quote
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request, Depends
from fastapi.responses import PlainTextResponse

from models import PayloadCreateRequest, PayloadDetail, PayloadSummary
import payload_storage
from security import administrator, ingestion, Principal

router = APIRouter(prefix="/payload-api/v1/payloads", tags=["payloads"])

RETENTION_DAYS = 7
PREVIEW_LIMIT_BYTES = 100 * 1024


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _summary(item: dict) -> PayloadSummary:
    return PayloadSummary(**{k: item[k] for k in PayloadSummary.model_fields})


@router.post("", response_model=PayloadSummary, dependencies=[Depends(ingestion)])
async def create_payload(
    request: Request,
    principal: Principal = Depends(ingestion),
    integrationId: Optional[str] = Query(None),
    messageId: Optional[str] = Query(None),
    fileName: Optional[str] = Query(None),
):
    """Receive a text payload from an Integration Suite HTTP receiver step.

    Supports either the original JSON wrapper contract or a raw text body
    (JSON, CSV, XML, plain text) with metadata supplied by query parameters
    or HTTP headers.
    """
    # Accept both old JSON wrapper payloads and raw text bodies. This keeps the
    # endpoint flexible for Integration Suite HTTP receiver calls.
    try:
        limit = int(os.getenv("PULSE_PAYLOAD_MAX_BYTES", "1048576"))
        if limit < 1:
            raise ValueError()
    except ValueError:
        raise HTTPException(503, "Payload size limit is not configured correctly") from None
    if request.headers.get("content-encoding", "identity") != "identity":
        raise HTTPException(415, "Compressed ingestion is not supported")
    try:
        length = int(request.headers.get("content-length", "0"))
        if length < 0:
            raise ValueError()
    except ValueError:
        raise HTTPException(400, "Invalid Content-Length") from None
    if length > limit:
        raise HTTPException(413, "Payload exceeds configured upload limit")
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise HTTPException(413, "Payload exceeds configured upload limit")
        chunks.append(chunk)
    raw_body = b"".join(chunks)
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
    if any(ord(char) < 32 or ord(char) == 127 for char in body.fileName):
        raise HTTPException(status_code=400, detail="File name cannot contain control characters")
    payload_bytes = body.payload.encode("utf-8")
    size_bytes = len(payload_bytes)
    # Large text payloads are stored but not rendered inline in the browser.
    download_only = size_bytes > PREVIEW_LIMIT_BYTES
    item = {
        "id": str(uuid4()),
        "tenantId": principal.tenant_id,
        "ingestedByClientId": principal.client_id,
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


@router.get("", response_model=List[PayloadSummary], dependencies=[Depends(administrator)])
async def list_payloads(integrationId: str = Query(...), principal: Principal = Depends(administrator)):
    """List unexpired payloads for one integration."""
    items = await asyncio.to_thread(payload_storage.list_payloads, integrationId, principal.tenant_id)
    return [_summary(item) for item in items]


@router.get("/{payload_id}", response_model=PayloadDetail, dependencies=[Depends(administrator)])
async def get_payload(payload_id: str, principal: Principal = Depends(administrator)):
    """Return payload content when it is small enough for inline preview."""
    item = await asyncio.to_thread(payload_storage.get_payload, payload_id, principal.tenant_id)
    if item:
        detail = PayloadDetail(**item)
        if item["downloadOnly"]:
            detail.payload = None
        return detail
    raise HTTPException(status_code=404, detail="Payload not found")


@router.get("/{payload_id}/download", dependencies=[Depends(administrator)])
async def download_payload(payload_id: str, principal: Principal = Depends(administrator)):
    """Download the raw text payload."""
    item = await asyncio.to_thread(payload_storage.get_payload, payload_id, principal.tenant_id)
    if item:
        # Also sanitize older stored names, not only new receiver input.
        name = re.sub(r'[\x00-\x1f\x7f"\\/]', '_', item["fileName"]) or "payload.txt"
        fallback = name.encode("ascii", errors="replace").decode("ascii").replace("?", "_")
        return PlainTextResponse(
            item["payload"],
            media_type=item["contentType"],
            headers={
                "Content-Disposition": f'attachment; filename="{fallback}"; filename*=UTF-8\'\'{quote(name, safe="")}',
                "X-Content-Type-Options": "nosniff",
            },
        )
    raise HTTPException(status_code=404, detail="Payload not found")
