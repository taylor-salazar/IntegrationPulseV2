# Evidence And Open Items

## Verified implementation details

| Area | Evidence path | Verified detail |
|---|---|---|
| SAPUI5 app descriptor | webapp/manifest.json | Routes for Home, Integrations, Integration Detail, Monitoring, Monitoring System Detail, and Monitoring Detail |
| Runtime config | webapp/service/config.js | Mock, proxy, and destination modes; payload base URL /payload-api/v1 |
| Integration catalog | webapp/controller/Integrations.controller.js | Runtime artifact filtering, Source/Target grouping, search, category tiles, card/list mode |
| Design-time metadata | webapp/service/BackendClient.js | IntegrationDesigntimeArtifacts metadata fetch and localStorage cache |
| Configuration update | `webapp/service/BackendClient.js`, `backend/btp_client.py` | Batch update format for configurations |
| Redeploy | webapp/controller/IntegrationDetail.controller.js, BackendClient.js | Confirmation dialog and deployment call after configuration update |
| Schedule UI | IntegrationDetail.controller.js | Timer-like parameter detection and cron-like string generation |
| Monitoring grouping | Monitoring.controller.js | Source/Target system grouping with health counts |
| Logs | MonitoringDetail.controller.js, BackendClient.js | Message logs, discarded filtering, date formatting, Results linkage |
| Payload API | `backend/routers/payloads.py` | POST raw/wrapper payload, list, detail, and download routes |
| Payload storage | `backend/payload_storage.py` | PostgreSQL table, one-week expiry, 100 KB preview limit behavior |
| Optional proxy | `backend/main.py`, `backend/auth.py`, `backend/btp_client.py` | FastAPI proxy, CORS, CSP frame-ancestors, OAuth client credentials |
| UI labels | webapp/i18n/i18n.properties | Terminology for Monitoring, Results, Payloads, Deployment, Schedules |

## Assumptions avoided

- No production tenant URLs are documented.
- No secrets, client IDs, or credentials are documented.
- No role enforcement is claimed because it is not verified in the repository.
- No screenshots are fabricated.
- No automatic PII redaction is claimed.
- No MTA, approuter, XSUAA, HTML5 repo, or CI/CD setup is claimed because no such artifacts were found.

## Planned, incomplete, or unclear items

- Read Only and Editable roles are planned/proposed, not implemented in code.
- Production authentication and authorization architecture requires validation.
- Final SAP BTP deployment architecture requires validation.
- Sanitized screenshots are still needed.
- Retention cleanup is implemented as storage-access pruning, not as a scheduled job in repo.
- Payload privacy enforcement remains an integration-owner responsibility.
- Destination mode message counts may require additional aggregation if business 24-hour counts are required from live Message Processing Logs.

Generated: 2026-06-22
