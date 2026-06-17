"""OAuth2 client-credentials token acquisition for the SAP BTP Integration Suite API.

This is the ONLY place the client secret is used, and it stays server-side — the
browser never sees it. The token is cached in-memory until shortly before expiry.

>>> PLACEHOLDER <<<  Wire this to your real BTP OAuth token endpoint. The shape
below matches SAP BTP / XSUAA client-credentials. Nothing here is called while
SETTINGS.use_mock is True.
"""
from __future__ import annotations

import time
from typing import Optional

import httpx

from config import SETTINGS

# Simple in-process token cache: (access_token, expires_at_epoch)
_token_cache: dict[str, object] = {"token": None, "exp": 0.0}


async def get_access_token() -> str:
    """Return a cached or freshly fetched OAuth2 bearer token for the IS API."""
    now = time.time()
    if _token_cache["token"] and float(_token_cache["exp"]) - 60 > now:
        return str(_token_cache["token"])

    if not SETTINGS.oauth_token_url or not SETTINGS.client_id:
        raise RuntimeError(
            "BTP OAuth is not configured. Set INTEGRATION_PULSE_* env vars "
            "(see .env.example) or run with use_mock=True."
        )

    # >>> PLACEHOLDER: real client-credentials token request <<<
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            SETTINGS.oauth_token_url,
            data={"grant_type": "client_credentials"},
            auth=(SETTINGS.client_id, SETTINGS.client_secret),
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        payload = resp.json()

    token = payload["access_token"]
    expires_in = float(payload.get("expires_in", 3600))
    _token_cache["token"] = token
    _token_cache["exp"] = now + expires_in
    return token
