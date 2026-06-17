"""Integration Pulse — FastAPI proxy in front of SAP BTP Integration Suite.

This is the only tier that holds tenant credentials and talks to BTP. The SAPUI5
frontend calls this proxy; this proxy calls the Integration Suite OData API.

Run locally:
    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

By default it runs in mock mode (no BTP access needed). Set
INTEGRATION_PULSE_USE_MOCK=false plus the OAuth/IS env vars to go live.
"""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import SETTINGS
from routers import integrations, monitoring, payloads

app = FastAPI(
    title="Integration Pulse API",
    version="0.1.0",
    description="Proxy for operating and monitoring SAP Integration Suite integrations.",
)

# CORS — allow the SAPUI5 dev server (and the SuccessFactors host) to call us.
app.add_middleware(
    CORSMiddleware,
    allow_origins=SETTINGS.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Allow embedding inside SuccessFactors via CSP frame-ancestors.

    X-Frame-Options is deliberately NOT set to DENY so the app can be iframed
    by the configured SuccessFactors / Work Zone domains.
    """
    response = await call_next(request)
    frame_ancestors = " ".join(SETTINGS.frame_ancestors)
    response.headers["Content-Security-Policy"] = f"frame-ancestors {frame_ancestors};"
    return response


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok", "mock": SETTINGS.use_mock}


@app.exception_handler(RuntimeError)
async def runtime_error_handler(_request: Request, exc: RuntimeError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


app.include_router(integrations.router)
app.include_router(monitoring.router)
app.include_router(payloads.router)
