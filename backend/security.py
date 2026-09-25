"""Fail-closed XSUAA authentication and single-deployment authorization.

No browser header, query parameter, or body field can select the trust/tenant.
SAP xssec validates signatures and XSUAA resource semantics; explicit issuer,
zone, expiry and grant checks narrow that trust to the configured beta tenant.
"""
from dataclasses import dataclass
import asyncio
import json
import os
from urllib.parse import urlsplit

import jwt
from sap import xssec
from fastapi import Depends, HTTPException, Request


def binding(label: str, name: str) -> dict:
    try:
        services = json.loads(os.getenv("VCAP_SERVICES", "{}"))
        matches = [s["credentials"] for s in services.get(label, [])
                   if s.get("name") == name]
        if len(matches) != 1:
            raise ValueError()
        return matches[0]
    except (ValueError, KeyError, TypeError):
        raise HTTPException(503, "Required service binding is unavailable") from None


def trust_configuration() -> tuple[dict, str, str, str]:
    credentials = binding("xsuaa", os.getenv("PULSE_XSUAA_SERVICE", "pulse-auth"))
    issuer = os.getenv("PULSE_JWT_ISSUER", "")
    tenant = os.getenv("PULSE_TENANT_ID", "")
    zone = credentials.get("identityzoneid") or credentials.get("identityzone")
    parsed = urlsplit(issuer)
    if not (tenant and zone and parsed.scheme == "https" and parsed.hostname
            and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment):
        raise HTTPException(503, "Authentication trust is not configured")
    return credentials, issuer, zone, tenant


@dataclass(frozen=True)
class Principal:
    tenant_id: str
    client_id: str
    machine: bool
    viewer: bool = False
    administrator: bool = False
    ingest: bool = False

    def capabilities(self):
        return {"viewIntegrations": self.viewer, "viewMonitoring": self.viewer,
                "readConfigurations": self.viewer, "administer": self.administrator,
                "readPayloads": self.administrator}


def validate_token(token: str) -> Principal:
    credentials, issuer, zone, tenant = trust_configuration()
    try:
        # Preflight restricts key acquisition to the trusted zone. No decision
        # grants access until xssec has validated the original signed token.
        claims = jwt.decode(token, options={"verify_signature": False})
        if claims.get("iss") != issuer or claims.get("zid") != zone:
            raise ValueError()
        if not isinstance(claims.get("exp"), (int, float)) or not claims.get("aud"):
            raise ValueError()
        audiences = claims['aud'] if isinstance(claims['aud'], list) else [claims['aud']]
        resources = {credentials['xsappname'], credentials['clientid']}
        if not any(isinstance(a, str) and any(a == r or a.startswith(r + '.') for r in resources) for a in audiences):
            raise ValueError()
        context = xssec.create_security_context(token, credentials)
        client = context.get_clientid()
        if not client or (claims.get("client_id") and claims["client_id"] != client):
            raise ValueError()
        machine = claims.get("grant_type") == "client_credentials"
        if not machine and (claims.get("grant_type") not in {"authorization_code", "refresh_token", "password"}
                            or not claims.get("user_name")):
            raise ValueError()
        prefix = credentials["xsappname"] + "."
        registered = {v.strip() for v in os.getenv("PULSE_INGEST_CLIENT_IDS", "").split(",") if v.strip()}
        admin = not machine and context.check_scope(prefix + "Administrator")
        viewer = not machine and (admin or context.check_scope(prefix + "Viewer"))
        ingest = machine and client in registered and context.check_scope(prefix + "Payload.Ingest")
        return Principal(tenant, client, machine, bool(viewer), bool(admin), bool(ingest))
    except Exception:
        # Never return/log token contents or validator errors containing claims.
        raise HTTPException(401, "Invalid access token", headers={"WWW-Authenticate": "Bearer"}) from None


async def authenticated(request: Request) -> Principal:
    authorization = request.headers.get("authorization", "")
    kind, _, token = authorization.partition(" ")
    if kind.lower() != "bearer" or not token or len(token) > 32768:
        raise HTTPException(401, "Bearer authentication required", headers={"WWW-Authenticate": "Bearer"})
    return await asyncio.to_thread(validate_token, token)


def viewer(principal: Principal = Depends(authenticated)) -> Principal:
    if not principal.viewer:
        raise HTTPException(403, "Viewer permission required")
    return principal


def administrator(principal: Principal = Depends(authenticated)) -> Principal:
    if not principal.administrator:
        raise HTTPException(403, "Administrator permission required")
    return principal


def ingestion(principal: Principal = Depends(authenticated)) -> Principal:
    if not principal.ingest:
        raise HTTPException(403, "Registered ingestion client required")
    return principal
