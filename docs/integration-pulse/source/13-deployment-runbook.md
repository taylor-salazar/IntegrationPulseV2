# Deployment, Support, And Operational Runbook

## Verified build and local run commands

| Area | Command |
|---|---|
| Frontend install | `npm install` |
| Frontend mock start | `npm start` or `npm run start:mock` |
| Destination mode | `npm run start:destination` |
| Proxy mode | `npm run start:proxy` |
| UI build | `npm run build` |
| Backend local run | `uvicorn main:app --reload --port 8000` from `backend/` |

## SAP BTP prerequisites to validate

- Destination routing for Integration Suite OData API if using destination mode.
- Backend deployment for FastAPI proxy and payload API if using proxy/payload features.
- PostgreSQL service binding or DSN environment variable.
- CORS and frame ancestor settings for the hosting domain.
- Authentication and authorization model.

## Production readiness checklist

- [ ] Confirm final hosting architecture.
- [ ] Confirm /api route behavior.
- [ ] Confirm /payload-api route behavior.
- [ ] Bind PostgreSQL and test payload write/read/download.
- [ ] Implement and test role enforcement.
- [ ] Validate BTP destination or OAuth credentials.
- [ ] Test configuration update and deployment in non-production.
- [ ] Validate schedule parameter behavior with representative timer integrations.
- [ ] Confirm privacy policy and payload summary templates.
- [ ] Capture final screenshots for this guide.

## Operational handover checklist

- [ ] Identify application owner.
- [ ] Identify integration support owner.
- [ ] Identify SAP BTP platform owner.
- [ ] Document support hours and escalation paths.
- [ ] Document backup and retention expectations.
- [ ] Document release and rollback process.
- [ ] Review open items before production go-live.
