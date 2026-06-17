"""Payload receiver and viewer routes.

This is a starter implementation for text-readable payload capture. It stores
metadata and text payloads in a local JSON file so the UI contract can be tested.
For production, keep the route shape but move storage to a database plus object
storage for large payloads, with role-based access in front of every route.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import List
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse

from models import PayloadCreateRequest, PayloadDetail, PayloadSummary

router = APIRouter(prefix="/payload-api/v1/payloads", tags=["payloads"])

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
DATA_FILE = os.path.join(DATA_DIR, "payloads.json")
RETENTION_DAYS = 7
PREVIEW_LIMIT_BYTES = 100 * 1024


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _load_all() -> list[dict]:
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _save_all(items: list[dict]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as fh:
        json.dump(items, fh, indent=2)


def _prune_expired(items: list[dict]) -> list[dict]:
    current = _now()
    return [item for item in items if _parse_iso(item["expiresAt"]) > current]


def _load_current() -> list[dict]:
    items = _load_all()
    current = _prune_expired(items)
    if len(current) != len(items):
        _save_all(current)
    return current


def _summary(item: dict) -> PayloadSummary:
    return PayloadSummary(**{k: item[k] for k in PayloadSummary.model_fields})


@router.post("", response_model=PayloadSummary)
async def create_payload(body: PayloadCreateRequest):
    """Receive a text payload from an Integration Suite HTTP receiver step."""
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
    items = _load_current()
    items.append(item)
    _save_all(items)
    return _summary(item)


@router.get("", response_model=List[PayloadSummary])
async def list_payloads(integrationId: str = Query(...)):
    """List unexpired payloads for one integration."""
    items = [
        _summary(item)
        for item in _load_current()
        if item["integrationId"] == integrationId
    ]
    return sorted(items, key=lambda item: item.createdAt, reverse=True)


@router.get("/{payload_id}", response_model=PayloadDetail)
async def get_payload(payload_id: str):
    """Return payload content when it is small enough for inline preview."""
    for item in _load_current():
        if item["id"] == payload_id:
            detail = PayloadDetail(**item)
            if item["downloadOnly"]:
                detail.payload = None
            return detail
    raise HTTPException(status_code=404, detail="Payload not found")


@router.get("/{payload_id}/download")
async def download_payload(payload_id: str):
    """Download the raw text payload."""
    for item in _load_current():
        if item["id"] == payload_id:
            return PlainTextResponse(
                item["payload"],
                media_type=item["contentType"],
                headers={
                    "Content-Disposition": f'attachment; filename="{item["fileName"]}"'
                },
            )
    raise HTTPException(status_code=404, detail="Payload not found")
