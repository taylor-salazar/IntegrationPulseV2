"""PostgreSQL-backed storage for captured integration payloads.

This module is the persistence boundary for payload capture. Route handlers pass
plain dictionaries in and receive plain dictionaries out; SQL details stay here.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote

import psycopg
from psycopg.rows import dict_row


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS integration_payloads (
    id UUID PRIMARY KEY,
    integration_id TEXT NOT NULL,
    message_id TEXT,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    preview_available BOOLEAN NOT NULL,
    download_only BOOLEAN NOT NULL,
    payload TEXT NOT NULL
);
"""

CREATE_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_integration_payloads_lookup
ON integration_payloads (integration_id, created_at DESC);
"""

_INITIALIZED = False


def _credential_dsn(credentials: dict) -> str:
    """Build a PostgreSQL DSN from common BTP service-binding credential shapes."""
    for key in ("uri", "url", "dsn"):
        if credentials.get(key):
            return credentials[key]

    host = credentials.get("hostname") or credentials.get("host")
    database = credentials.get("dbname") or credentials.get("database") or credentials.get("db_name")
    username = credentials.get("username") or credentials.get("user")
    password = credentials.get("password")
    port = credentials.get("port") or 5432
    if not all([host, database, username, password]):
        return ""

    return (
        "postgresql://"
        f"{quote(str(username), safe='')}:{quote(str(password), safe='')}@"
        f"{host}:{port}/{quote(str(database), safe='')}"
        "?sslmode=require"
    )


def _vcap_postgres_dsn() -> str:
    """Find a PostgreSQL binding in VCAP_SERVICES when deployed to Cloud Foundry."""
    raw = os.getenv("VCAP_SERVICES")
    if not raw:
        return ""

    try:
        services = json.loads(raw)
    except json.JSONDecodeError:
        return ""

    for service_entries in services.values():
        for service in service_entries:
            tags = service.get("tags", [])
            tag_text = " ".join(tags) if isinstance(tags, list) else str(tags)
            searchable = " ".join(
                str(value).lower()
                for value in [
                    service.get("name"),
                    service.get("label"),
                    service.get("service"),
                    service.get("plan"),
                    tag_text,
                ]
                if value
            )
            if "postgres" not in searchable:
                continue
            dsn = _credential_dsn(service.get("credentials") or {})
            if dsn:
                return dsn
    return ""


def get_database_url() -> str:
    return (
        os.getenv("INTEGRATION_PULSE_PAYLOAD_DATABASE_URL")
        or os.getenv("DATABASE_URL")
        or os.getenv("POSTGRES_DSN")
        or _vcap_postgres_dsn()
    )


def _connect():
    dsn = get_database_url()
    if not dsn:
        raise RuntimeError(
            "Payload PostgreSQL database is not configured. Bind a PostgreSQL "
            "service or set INTEGRATION_PULSE_PAYLOAD_DATABASE_URL."
        )
    return psycopg.connect(dsn, row_factory=dict_row)


def _to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _row_to_payload(row: dict, include_payload: bool = True) -> dict:
    payload = {
        "id": str(row["id"]),
        "integrationId": row["integration_id"],
        "messageId": row["message_id"],
        "fileName": row["file_name"],
        "contentType": row["content_type"],
        "sizeBytes": row["size_bytes"],
        "createdAt": _to_iso(row["created_at"]),
        "expiresAt": _to_iso(row["expires_at"]),
        "previewAvailable": row["preview_available"],
        "downloadOnly": row["download_only"],
    }
    if include_payload:
        payload["payload"] = row["payload"]
    return payload


def init_db() -> None:
    """Create the payload table/index once per process before storage access."""
    global _INITIALIZED
    if _INITIALIZED:
        return
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_TABLE_SQL)
            cur.execute(CREATE_INDEX_SQL)
        conn.commit()
    _INITIALIZED = True


def prune_expired() -> None:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM integration_payloads WHERE expires_at <= NOW()")
        conn.commit()


def create_payload(item: dict) -> dict:
    init_db()
    prune_expired()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO integration_payloads (
                    id, integration_id, message_id, file_name, content_type,
                    size_bytes, created_at, expires_at, preview_available,
                    download_only, payload
                )
                VALUES (
                    %(id)s, %(integrationId)s, %(messageId)s, %(fileName)s,
                    %(contentType)s, %(sizeBytes)s, %(createdAt)s, %(expiresAt)s,
                    %(previewAvailable)s, %(downloadOnly)s, %(payload)s
                )
                RETURNING *
                """,
                item,
            )
            row = cur.fetchone()
        conn.commit()
    return _row_to_payload(row, include_payload=False)


def list_payloads(integration_id: str) -> list[dict]:
    init_db()
    prune_expired()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM integration_payloads
                WHERE integration_id = %s AND expires_at > NOW()
                ORDER BY created_at DESC
                """,
                (integration_id,),
            )
            rows = cur.fetchall()
    return [_row_to_payload(row, include_payload=False) for row in rows]


def get_payload(payload_id: str) -> Optional[dict]:
    init_db()
    prune_expired()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM integration_payloads
                WHERE id = %s AND expires_at > NOW()
                """,
                (payload_id,),
            )
            row = cur.fetchone()
    return _row_to_payload(row, include_payload=True) if row else None
