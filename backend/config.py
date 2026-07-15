"""Runtime settings for the Integration Pulse proxy.

All values come from environment variables (see .env.example). When use_mock is
True (the default), no BTP credentials are required and the proxy serves the same
fixtures the frontend ships with — so a colleague can run the full stack with
zero tenant access.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import List

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # python-dotenv is optional at runtime
    pass


def _bool(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in {"1", "true", "yes", "on"}


def _list(name: str, default: List[str]) -> List[str]:
    val = os.getenv(name)
    if not val:
        return default
    return [v.strip() for v in val.split(",") if v.strip()]


@dataclass
class Settings:
    # Demo switch — when True the proxy returns local fixtures, no BTP calls.
    use_mock: bool = field(default_factory=lambda: _bool("INTEGRATION_PULSE_USE_MOCK", True))

    # SAP BTP Integration Suite (Cloud Integration) OData API base, e.g.
    # https://<tenant>.it-cpi0xx.cfapps.<region>.hana.ondemand.com/api/v1
    is_api_base: str = field(default_factory=lambda: os.getenv("INTEGRATION_PULSE_IS_API_BASE", ""))

    # Optional base URL for HTTPS sender endpoints. If omitted, the proxy derives
    # the tenant root from is_api_base by removing the trailing /api/v1.
    immediate_run_base: str = field(
        default_factory=lambda: os.getenv("INTEGRATION_PULSE_IMMEDIATE_RUN_BASE", "")
    )

    # OAuth2 client-credentials (XSUAA service key of the IS API plan)
    oauth_token_url: str = field(default_factory=lambda: os.getenv("INTEGRATION_PULSE_OAUTH_TOKEN_URL", ""))
    client_id: str = field(default_factory=lambda: os.getenv("INTEGRATION_PULSE_CLIENT_ID", ""))
    client_secret: str = field(default_factory=lambda: os.getenv("INTEGRATION_PULSE_CLIENT_SECRET", ""))

    # CORS / SuccessFactors embedding
    # Origins allowed to call this proxy (the SAPUI5 dev server, the SF domain).
    cors_origins: List[str] = field(
        default_factory=lambda: _list(
            "INTEGRATION_PULSE_CORS_ORIGINS",
            ["http://localhost:8080", "http://localhost:8081"],
        )
    )
    # Domains allowed to iframe-embed the app (SuccessFactors). Used for the
    # Content-Security-Policy: frame-ancestors header.
    frame_ancestors: List[str] = field(
        default_factory=lambda: _list("INTEGRATION_PULSE_FRAME_ANCESTORS", ["'self'"])
    )


SETTINGS = Settings()
