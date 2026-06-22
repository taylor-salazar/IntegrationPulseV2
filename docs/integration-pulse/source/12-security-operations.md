# Security, Privacy, And Operations

## Authentication model

The frontend repository does not show a complete production authentication flow. The optional backend includes OAuth client-credentials handling for SAP Integration Suite API calls and keeps client secrets server-side. SuccessFactors embedding is supported through configurable Content-Security-Policy `frame-ancestors` values.

## Authorization model

Read Only and Editable roles are planned but not implemented in the current codebase. Production deployments must implement access control before claiming role enforcement.

## Credential handling

The backend reads secrets from environment variables. .env.example documents configuration categories; actual .env values must not be committed. The browser does not receive the BTP OAuth client secret in the optional proxy architecture.

## Payload privacy

Integration Pulse must not be used to store detailed employee data, payroll data, benefit elections, addresses, emails, national IDs, or other PII beyond permitted User IDs. The current implementation does not verify, redact, or reject PII automatically.

## Download controls

Download is available through the payload API for stored payloads. No role-based download control is verified in code. Organizations must control access through the application hosting and authorization layer.

## Operational safeguards

- Validate route mappings before production use.
- Confirm /payload-api points to the payload receiver service, not the Integration Suite destination.
- Bind PostgreSQL or set the DSN environment variable for payload storage.
- Confirm retention expectations and backup requirements.
- Implement role enforcement before production use.
- Review logs for sensitive data exposure.
