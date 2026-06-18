# Integration Pulse

An operations console for **deployed SAP Integration Suite integrations**, built
as a **SAPUI5 (XML/MVC, Horizon/Fiori)** front end with a thin **FastAPI** proxy
in front of the SAP BTP Integration Suite OData API.

Where SWIFT *designs and builds* integrations, Integration Pulse *operates* them:

- **Integrations** — browse deployed iFlows (cards or list), open one, **edit its
  externalized parameters**, and **redeploy** to the tenant.
- **Monitoring** — runtime status of every integration plus **message processing
  logs** and error details.

It is designed to be **embedded inside SuccessFactors** (iframe / Work Zone tile).

> **Demo mode is on by default.** `npm install && npm start` gives you a fully
> working app driven by local fixtures — **no BTP tenant access required**. The
> real SAP BTP API calls are clearly marked placeholders in the backend.

---

## Architecture

```
 SuccessFactors (iframe)
        │
        ▼
 ┌──────────────────────┐      ┌───────────────────────────┐      ┌──────────────────────┐
 │  SAPUI5 frontend     │ ───► │  FastAPI proxy (backend/)  │ ───► │ SAP BTP Integration  │
 │  webapp/             │ HTTP │  holds OAuth secret        │ HTTPS│ Suite OData API       │
 │  (mock OR live)      │      │  btp_client.py = the stubs │      │ (Cloud Integration)  │
 └──────────────────────┘      └───────────────────────────┘      └──────────────────────┘
```

**Why a backend at all?** The BTP Integration Suite API needs an OAuth client
secret and does not send CORS headers — neither is safe or possible from a
browser. The proxy holds the credential and is also where SuccessFactors
embedding (CSP `frame-ancestors`) is configured.

---

## Quick start

### 1. Frontend (works standalone in mock mode)

```bash
# from this folder
npm install
npm start            # opens http://localhost:8080 with mock data
```

Requires Node 18+. UI5 is served **locally** by the UI5 tooling (pinned in
`ui5.yaml` → `framework`), not from a public CDN — so the app works behind a
corporate firewall and inside SuccessFactors. `ui5 serve` resolves the UI5
libraries on first run (needs internet once; cached thereafter). To use your
corporate SAPUI5 CDN instead, point the bootstrap `src` in `webapp/index.html`
at it and drop the `framework` block.

### 2. Backend (optional for demo; required to go live)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000      # http://localhost:8000/docs
```

The backend also defaults to mock mode, so it serves the same fixtures with no
credentials.

### 3. Go live against a real tenant

1. `cp .env.example backend/.env` and fill in the BTP `IS_API_BASE`, OAuth token
   URL, client id/secret.
2. Set `INTEGRATION_PULSE_USE_MOCK=false` in `backend/.env`.
3. In the frontend, flip **one flag**: `webapp/service/config.js` → `useMock: false`
   (or just run `npm run start:live`, which appends `?mock=false`).
4. Implement/verify the placeholder calls in `backend/btp_client.py` against your
   tenant (they are written to SAP's documented shapes but should be tested).

---

## Where to plug in the real SAP BTP calls

**Everything lives in `backend/btp_client.py`.** Each function has a `mock`
branch and a `live` branch; the live branches are marked `>>> PLACEHOLDER <<<`.

| App action | Function | SAP BTP endpoint (placeholder target) |
|---|---|---|
| List integrations | `list_integrations` | `GET /IntegrationRuntimeArtifacts` |
| Get parameters | `get_configurations` | `GET /IntegrationDesigntimeArtifacts(Id='..',Version='..')/Configurations` |
| Save parameters | `update_configurations` | `PUT .../$links/Configurations('key')` |
| Deploy | `deploy_integration` | `POST /DeployIntegrationDesigntimeArtifact` |
| Runtime status | `list_monitoring` | `GET /IntegrationRuntimeArtifacts` |
| Message logs | `get_message_logs` | `GET /MessageProcessingLogs?$filter=…` |
| OAuth token | `auth.get_access_token` | `POST {oauth_token_url}` (client-credentials) |

The frontend never changes when you go live — it only talks to the proxy via
`webapp/service/BackendClient.js`.

---

## Payload storage

The payload receiver API stores captured payloads in PostgreSQL. In BTP Cloud
Foundry, bind the PostgreSQL service instance to the backend app; the backend
will discover the connection from `VCAP_SERVICES` and create the
`integration_payloads` table/indexes automatically on first use.

For local testing or explicit configuration, set:

```bash
INTEGRATION_PULSE_PAYLOAD_DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
```

Payloads are retained for seven days. Payloads over 100 KB are kept in the
database but are download-only in the UI.

---

## Embedding in SuccessFactors

1. Deploy the built frontend (`npm run build` → `dist/`) and the FastAPI proxy
   behind your corporate domain (typically same origin, proxy serving the static
   app and `/api`).
2. Set `INTEGRATION_PULSE_FRAME_ANCESTORS` to your SF domain(s) — this drives the
   `Content-Security-Policy: frame-ancestors` header in `backend/main.py`. The app
   intentionally does **not** send `X-Frame-Options: DENY`.
3. Add it in SuccessFactors as a **Custom Navigation** link or a Home Page tile
   (or surface it through SAP Build Work Zone), pointing at the app URL.
4. Use SAML/OAuth SSO between SF and the app; the proxy can validate the forwarded
   assertion before calling BTP. (SSO wiring is left as a placeholder — it depends
   on your IdP.)

---

## Project layout

```
Integration Pulse/
├── package.json            # @ui5/cli dev server (npm start / start:live / build)
├── ui5.yaml                # UI5 tooling config
├── .env.example            # backend env template (copy to backend/.env)
├── webapp/                 # SAPUI5 application
│   ├── index.html          # CDN bootstrap (Horizon theme)
│   ├── manifest.json       # app descriptor: routes, models, libs
│   ├── Component.js
│   ├── i18n/               # all UI text
│   ├── css/style.css       # light polish on Horizon
│   ├── model/              # device model + formatters
│   ├── service/
│   │   ├── config.js       # << flip useMock here >>
│   │   └── BackendClient.js# typed client: mock branch + live branch per call
│   ├── view/               # App shell + Integrations/Monitoring master & detail
│   ├── controller/
│   └── localService/mockdata/   # fixtures (shared with the backend)
└── backend/                # FastAPI proxy
    ├── main.py             # app, CORS, CSP for SF embedding, health
    ├── config.py           # env-driven settings
    ├── auth.py             # OAuth client-credentials (server-side only)
    ├── btp_client.py       # << ALL SAP BTP placeholders live here >>
    ├── models.py           # pydantic contract
    └── routers/            # /api/integrations, /api/monitoring
```

---

## Conventions for whoever builds on this

- **One place to go live:** `webapp/service/config.js` (frontend) and
  `backend/btp_client.py` (the calls). Don't scatter tenant URLs elsewhere.
- **Contract is in `backend/models.py`** and mirrored by the mock JSON. Keep them
  in sync — the frontend binds to these field names.
- **No secrets in git.** `backend/.env` is gitignored; only `.env.example` is
  committed.
- **All UI text in `webapp/i18n/i18n.properties`** — no hardcoded strings, so it
  localises cleanly inside SuccessFactors.
- **Deploy is guarded** by a confirm dialog (it's an irreversible tenant action).

---

## Status / not yet wired

These are deliberate placeholders for your colleague to complete:

- Real BTP OData calls in `btp_client.py` (verify response mapping per tenant).
- SSO / token forwarding from SuccessFactors to the proxy.
- Build & deployment pipeline for your landscape.
- Optional: pagination and date-range filters on message logs; start/stop runtime
  actions on the Monitoring detail page.
