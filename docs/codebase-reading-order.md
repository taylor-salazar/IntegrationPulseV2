# Integration Pulse Codebase Reading Order

Use this file as the durable map for learning the codebase. It is ordered from
the broadest system concepts to the deepest implementation details.

## Part 1: App Shape And Startup

Start here to understand what kind of app this is and how it boots.

1. `README.md`
2. `package.json`
3. `ui5.yaml`
4. `webapp/index.html`
5. `webapp/manifest.json`
6. `webapp/Component.js`
7. `webapp/model/models.js`

What to learn:

- how the app is started and built
- what SAPUI5/OpenUI5 libraries are used
- where the root view is declared
- how routes and targets are defined
- what global models exist at startup

## Part 2: Shell, Navigation, And Shared UI Helpers

Read these next to understand the app frame.

1. `webapp/view/App.view.xml`
2. `webapp/controller/App.controller.js`
3. `webapp/controller/BaseController.js`
4. `webapp/model/formatter.js`
5. `webapp/i18n/i18n.properties`
6. `webapp/css/style.css`

What to learn:

- how the top bar and sidebar are rendered
- how sidebar clicks become route navigation
- how every controller gets router/model/text helpers
- how values are formatted for display
- how labels are centralized in i18n
- where visual polish lives

## Part 3: Frontend Data Boundary

Read this before studying feature pages.

1. `webapp/service/config.js`
2. `webapp/service/BackendClient.js`
3. `webapp/service/ReviewStore.js`
4. `webapp/localService/mockdata/integrations.json`
5. `webapp/localService/mockdata/messageLogs.json`
6. `webapp/localService/mockdata/payloads.json`
7. `webapp/localService/mockdata/configurations.json`

What to learn:

- how mock, destination, and proxy modes are selected
- why controllers call `BackendClient` instead of `fetch`
- how raw API shapes are normalized
- how design-time metadata is cached
- why review/resolution state is currently browser-local

## Part 4: Home Page

Read Home after the service layer because it combines several concepts.

1. `webapp/view/Home.view.xml`
2. `webapp/controller/Home.controller.js`

What to learn:

- how Home tiles navigate
- how the latest-runs table is loaded
- how latest run status is calculated
- how unresolved failed runs are counted
- how Under Review and Review Note use `ReviewStore`

## Part 5: Integrations Catalog

Read these to understand deployed integration browsing.

1. `webapp/view/Integrations.view.xml`
2. `webapp/controller/Integrations.controller.js`

What to learn:

- how runtime artifacts are loaded
- how design-time Sender/Receiver metadata is added
- how Source/Target system grouping works
- how search and card/list modes work
- how quick deploy and integration navigation are triggered

## Part 6: Integration Detail And Configuration Editing

Read these to understand parameter operations.

1. `webapp/view/IntegrationDetail.view.xml`
2. `webapp/controller/IntegrationDetail.controller.js`
3. `webapp/view/PayloadDialog.fragment.xml`

What to learn:

- how an integration detail page is routed by ID
- how externalized parameters are loaded and grouped
- how dirty state is tracked
- how timer-like parameters use a user-friendly scheduler
- how batch configuration updates are built
- how deployment is triggered
- how captured payloads are displayed

## Part 7: Monitoring Overview

Read these to understand operational health.

1. `webapp/view/Monitoring.view.xml`
2. `webapp/controller/Monitoring.controller.js`

What to learn:

- how integration metadata and runtime status are merged
- how Source/Target system health tiles are built
- how pass/fail/warning counts are calculated
- how recent and deployed system sections differ
- how auto-refresh works

## Part 8: Monitoring Detail, Logs, Payloads, And Resolution

Read these to understand run history.

1. `webapp/view/MonitoringDetail.view.xml`
2. `webapp/controller/MonitoringDetail.controller.js`
3. `webapp/service/ReviewStore.js`
4. `webapp/view/PayloadDialog.fragment.xml`

What to learn:

- how a single integration's logs are loaded
- how a Source/Target system's combined logs are loaded
- how payload summaries are joined to logs by `messageId`
- why resolved state is keyed by `messageId`
- how failed runs become unresolved issues on Home

## Part 9: Backend Entry, Settings, And Security Boundary

Read these before backend route details.

1. `backend/main.py`
2. `backend/config.py`
3. `backend/auth.py`
4. `backend/models.py`
5. `backend/requirements.txt`

What to learn:

- how FastAPI starts
- how CORS and frame-ancestor headers are configured
- where environment variables are read
- where OAuth client credentials are handled
- why secrets stay backend-side
- what Pydantic models define the API shape

## Part 10: Backend Integration Suite Client

Read this as the backend equivalent of `BackendClient.js`.

1. `backend/btp_client.py`

What to learn:

- how mock/live backend behavior is separated
- where Integration Suite OData calls are made
- how configurations, deployment, monitoring, and logs are represented
- which live branches are placeholders that need tenant validation

## Part 11: Backend Routes

Read the thin HTTP layer.

1. `backend/routers/integrations.py`
2. `backend/routers/monitoring.py`
3. `backend/routers/payloads.py`
4. `backend/routers/__init__.py`

What to learn:

- how HTTP requests map to backend service functions
- which frontend calls each router supports
- how payload upload, preview, and download work
- where error responses are produced

## Part 12: Payload Persistence

Read this to understand data storage.

1. `backend/payload_storage.py`

What to learn:

- how PostgreSQL connection information is discovered
- how the payload table is created
- how payload rows are inserted/listed/read
- how retention pruning works
- why large payloads become download-only

## Part 13: Documentation And Evidence

Read these to understand the intended operating model.

1. `docs/codebase-weekend-crash-course.md`
2. `docs/integration-pulse/README.md`
3. `docs/integration-pulse/Evidence_and_Open_Items.md`
4. `docs/integration-pulse/source/*.md`

What to learn:

- what has been verified in code
- what is planned but not implemented
- how the PDF guide is generated
- what still needs production validation

## Files To Treat As Reference, Not Primary Learning Material

- `source-repo/**`: original/source comparison material, not the active app.
- `docs/integration-pulse/output/rendered/*.png`: generated PDF render previews.
- `docs/integration-pulse/Integration_Pulse_Operations_Guide.pdf`: final generated guide.
- `package-lock.json`: dependency lock file; useful later, not for first-pass comprehension.

## Suggested Learning Loop

For each part:

1. Read the files in order.
2. Write a one-sentence responsibility for each file.
3. Trace one user action through the files.
4. Identify what state changes.
5. Identify what API or storage call happens.
6. Explain the flow back in plain English.
7. Ask what would break if the API failed.

