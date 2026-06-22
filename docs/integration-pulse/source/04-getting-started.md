# Getting Started

## Business explanation

Integration Pulse is intended to be opened by users who need to operate or monitor deployed integrations without working directly in low-level Integration Suite screens. The application navigation includes Home, Integrations, and Monitoring.

## Before you begin

- Confirm the application URL for the target environment.
- Confirm whether the environment is mock, BTP destination, or proxy mode.
- Confirm that the backend payload API is running if payload Results are expected.
- Confirm that PostgreSQL payload storage is configured for non-mock payload capture.
- Confirm whether the organization has implemented role restrictions outside the current repository.

## Access and environment behavior verified in code

The SAPUI5 frontend reads runtime settings from `webapp/service/config.js`. The current code defaults to `useMock: false`, `liveMode: destination`, `destinationBaseUrl: /api/v1`, `payloadBaseUrl: /payload-api/v1`, and `backendBaseUrl: http://localhost:8000`.

Runtime URL overrides are supported:

| URL parameter | Effect |
|---|---|
| ?mock=true | Uses local mock JSON fixtures |
| ?mock=false | Uses configured live mode |
| ?mock=false&api=proxy | Calls the optional FastAPI proxy |
| ?mock=false&api=destination | Calls same-origin destination routing |

## Supported browser assumptions

The manifest declares desktop, tablet, and phone device support. The application is built with OpenUI5 1.120.20 and SAPUI5-style XML/MVC views.
