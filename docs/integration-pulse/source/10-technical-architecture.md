# Technical Architecture

## Logical architecture based on current repository evidence

The implemented repository contains:

- SAPUI5 XML/MVC frontend under `webapp/`.
- OpenUI5 dependencies declared in `manifest.json` and `ui5.yaml`.
- Runtime client logic in `webapp/service/BackendClient.js`.
- Optional FastAPI backend under `backend/`.
- SAP BTP Integration Suite API client placeholder/live implementation in `backend/btp_client.py`.
- PostgreSQL-backed payload storage in `backend/payload_storage.py`.
- Payload API routes in `backend/routers/payloads.py`.
- UI5 dev-server destination proxy mapping `/api` to a destination named `Integration-Suite-Dev` in `ui5.yaml`.

No MTA descriptor, approuter configuration, XSUAA descriptor, CI/CD pipeline, or HTML5 Applications Repository deployment descriptor is present in the repository.

## Component responsibilities

| Component | Responsibility | Authentication evidence | Data handled |
|---|---|---|---|
| Browser/SAPUI5 frontend | User interface, routing, grouping, scheduling UI, monitoring views | No frontend auth enforcement verified | Integration metadata, parameters, logs, payload summaries |
| BTP destination route | Same-origin routing to Integration Suite API in destination mode | Destination configuration external to repo | Integration Suite OData requests |
| FastAPI proxy | Optional proxy, health, CORS, CSP, BTP client, payload API | OAuth client credentials in backend auth module | Integration data, logs, payload summaries |
| SAP Integration Suite | Runtime artifacts, design-time configs, Message Processing Logs | External to repo | Integration runtime and design-time data |
| PostgreSQL | Payload storage | Service binding or DSN env var | Payload summary text, metadata, expiration |

## Diagram source

See `assets/diagrams/logical_architecture.mmd` for Mermaid source.
