"""Integration Pulse — FastAPI proxy in front of SAP BTP Integration Suite.

This is the only tier that holds tenant credentials and talks to BTP. The SAPUI5
frontend calls this proxy; this proxy calls the Integration Suite OData API.

Run locally:
    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

Local mock mode replaces SAP calls, but never disables API authentication.
Production uses live mode, XSUAA and Destination service bindings; see the
Step 2A runbook for deployment and local development prerequisites.
"""
from __future__ import annotations

from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx

from config import SETTINGS
from routers import integrations, monitoring, payloads
from errors import InvalidRuntimeEndpoint
from security import Principal, viewer

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
    if request.url.path.startswith(("/api/", "/payload-api/")):
        response.headers["Cache-Control"] = "no-store"
    frame_ancestors = " ".join(SETTINGS.frame_ancestors)
    response.headers["Content-Security-Policy"] = f"frame-ancestors {frame_ancestors};"
    return response


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok", "mock": SETTINGS.use_mock}


@app.get("/api/session")
async def session(principal: Principal = Depends(viewer)):
    return {"capabilities": principal.capabilities()}


@app.exception_handler(RuntimeError)
async def runtime_error_handler(_request: Request, exc: RuntimeError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(InvalidRuntimeEndpoint)
async def invalid_runtime_endpoint(_request: Request, exc: InvalidRuntimeEndpoint):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(httpx.HTTPError)
async def upstream_error_handler(_request: Request, exc: httpx.HTTPError):
    if isinstance(exc, httpx.TimeoutException):
        return JSONResponse(status_code=504, content={"detail": "Integration Suite request timed out."})
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        return JSONResponse(status_code=503 if status in (429, 503) else 502,
                            content={"detail": f"Integration Suite request failed (HTTP {status})."})
    return JSONResponse(status_code=502, content={"detail": "Unable to connect to Integration Suite."})


app.include_router(integrations.router)
app.include_router(monitoring.router)
app.include_router(payloads.router)
