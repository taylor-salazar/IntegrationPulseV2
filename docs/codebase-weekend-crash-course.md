# Integration Pulse Codebase Weekend Crash Course

This file is the durable learning plan for understanding the Integration Pulse codebase. It is written for a UCSD Computer Engineering graduate who wants to understand the system deeply rather than rely on generated code without review.

The intended format is a weekend crash course: 8 hours on Saturday and 8 hours on Sunday. The focus is the local codebase, with SAP BTP concepts explained only when they appear directly in code.

## Learning Objective

By the end of this crash course, you should be able to open a controller, service, XML view, backend route, or config file and explain:

- what layer it belongs to
- what data flows through it
- what user action triggers it
- what external system or local service it talks to
- what could break
- how you would safely change it

The core system shape is:

```text
Browser UI
  -> SAPUI5 views/controllers/models
  -> BackendClient service layer
  -> mock data, BTP destination API, or FastAPI backend
  -> FastAPI routes/services
  -> optional PostgreSQL payload storage
```

## Day 1: Frontend And System Design

### Hour 1: Big Picture Architecture

Goal: understand what kind of app this is before reading individual code.

Topics:

- single-page applications
- SAPUI5/OpenUI5
- MVC: Model, View, Controller
- routing and pages
- service layer abstraction
- mock mode vs live mode
- why controllers should not each call `fetch()` directly

Code to read:

```text
package.json
ui5.yaml
webapp/manifest.json
webapp/Component.js
webapp/view/App.view.xml
webapp/controller/App.controller.js
```

Key example:

```json
{
  "name": "monitoringDetail",
  "pattern": "monitoring/{id}",
  "target": "monitoringDetail"
}
```

When code calls:

```js
this.navTo("monitoringDetail", { id: sId });
```

UI5 loads the Monitoring Detail view and passes the `id`.

Exercise: draw the navigation map:

```text
Home
 -> Integrations
 -> Integration Detail

Home
 -> Monitoring
 -> Monitoring Detail
```

Checkpoint:

- Where are routes defined?
- What is the difference between a view and a controller?
- Why does the app use `BackendClient`?

### Hour 2: SAPUI5 From First Principles

Goal: understand how XML views, controllers, and models work together.

Topics:

- XML views
- controllers
- `JSONModel`
- data binding
- named models
- event handlers
- formatters
- i18n text

Code to read:

```text
webapp/controller/BaseController.js
webapp/model/formatter.js
webapp/i18n/i18n.properties
webapp/view/Home.view.xml
webapp/controller/Home.controller.js
```

Examples:

```xml
<Text text="{i18n>homeLastRunsTitle}"/>
```

This reads:

```properties
homeLastRunsTitle=Latest integration runs
```

And:

```xml
<Table items="{path: 'home>/lastRuns'}">
```

This means:

- use the named model `home`
- read `/lastRuns`
- create one row per item

The controller creates that model:

```js
this.setModel(new JSONModel({
  busy: false,
  lastRuns: []
}), "home");
```

Exercise: find every `home>` binding in `Home.view.xml`, then find where that property is populated in `Home.controller.js`.

Checkpoint: explain this chain:

```text
Controller loads data
 -> puts it into JSONModel
 -> XML binding reads it
 -> UI updates automatically
```

### Hour 3: Home Page Deep Dive

Goal: understand the Home page latest-runs table.

Code to read:

```text
webapp/controller/Home.controller.js
webapp/view/Home.view.xml
webapp/service/ReviewStore.js
```

Important functions:

```js
_loadLastRuns()
```

Purpose:

- loads deployed integrations
- fetches message logs for each integration
- builds table rows
- sorts latest runs first

```js
_toLastRunRow(oIntegration, oLog, aLogs)
```

Purpose:

- converts raw integration/log data into UI-friendly table data

Example row:

```js
{
  id: "Some_Integration",
  vendor: "Success Factors -> UKG",
  integrationName: "Employee Data to UKG",
  status: "FAILED",
  time: "2026-06-29T10:15:00Z",
  underReview: true,
  reviewDescription: "Waiting on vendor response",
  unresolvedIssues: 2
}
```

Design principle: controllers should prepare data in the shape the view needs. XML should mostly display model properties.

Exercise: temporarily add `console.log(aRows)` in `_loadLastRuns()` and inspect the row shape in the browser console. Then remove it.

Checkpoint:

- Why does Home fetch message logs?
- Why is there a concurrency limit?
- What does `unresolvedIssues` count?
- Where is the review note stored?

### Hour 4: Service Layer And API Abstraction

Goal: understand how the frontend talks to data sources.

Code to read:

```text
webapp/service/config.js
webapp/service/BackendClient.js
webapp/localService/mockdata/
```

Topics:

- mock mode
- destination mode
- proxy mode
- OData response shapes
- mapping raw API data into app data
- why `mapIntegration()` exists
- why `mapMessageLog()` exists

Example raw data:

```js
{
  Id: "Employee_Data",
  Name: "Employee Data",
  Sender: "SAPSuccessFactors",
  Receiver: "UKG"
}
```

Mapped app data:

```js
{
  id: "Employee_Data",
  name: "Employee Data",
  sender: "SAPSuccessFactors",
  receiver: "UKG"
}
```

Why: the rest of the app should not care whether the source uses `Id`, `id`, `Name`, or `name`.

Exercise: find these functions and write one sentence for each:

```text
mapIntegration()
mapMessageLog()
getIntegrationsWithMetadata()
getMessageLogs()
```

Checkpoint:

- What is the difference between mock, destination, and proxy?
- What is the job of `BackendClient.js`?
- Why do we normalize API data?

### Hour 5: Integrations Page

Goal: understand how deployed integrations are listed, grouped, searched, and opened.

Code to read:

```text
webapp/controller/Integrations.controller.js
webapp/view/Integrations.view.xml
```

Topics:

- deployed/runtime artifact filtering
- Source System grouping
- Target System grouping
- tiles vs lists
- search
- navigation to Integration Detail

Mental model:

```text
The Integrations page answers:
What deployed integrations exist?
Who sends data?
Who receives data?
Which integration do I want to inspect/configure?
```

Exercise: trace:

```text
User clicks Source System tile
 -> controller receives event
 -> model changes selected category
 -> UI switches to integrations in that category
 -> user clicks an integration
 -> route navigates to Integration Detail
```

Checkpoint:

- Why are undeployed artifacts filtered out?
- How does Source/Target grouping work?
- What metadata is cached?
- Why does Unknown System appear?

### Hour 6: Integration Detail Page

Goal: understand parameters, schedule UI, save, batch update, and deploy.

Code to read:

```text
webapp/controller/IntegrationDetail.controller.js
webapp/view/IntegrationDetail.view.xml
```

Topics:

- externalized parameters
- dirty state
- reset
- save draft
- batch update
- deploy
- timer/schedule editor

Important flow:

```text
Open integration
 -> load configurations
 -> display parameter inputs
 -> user edits values
 -> Save sends batch update
 -> Deploy redeploys integration
```

Why batch update exists: batching is faster and more consistent than sending one request per parameter.

Exercise: find the function that builds the changed parameter list. Answer: how does the app know which parameters changed?

Checkpoint:

- What is an externalized parameter?
- Why do timer fields need a custom UI?
- What does save do?
- What does deploy do?
- Why are save and deploy separate actions?

### Hour 7: Monitoring Page

Goal: understand monitoring as a health dashboard.

Code to read:

```text
webapp/controller/Monitoring.controller.js
webapp/view/Monitoring.view.xml
```

Topics:

- Source/Target system monitoring
- vendor tiles
- Passed/Failed/Warning counts
- recent runs vs deployed integrations
- navigation to monitoring detail

Key distinction:

```text
Integrations page asks: What integrations exist?
Monitoring page asks: What happened recently?
```

Exercise: trace:

```text
Monitoring page loads
 -> get integration metadata
 -> get runtime monitoring data
 -> combine them by integration ID
 -> group by Source or Target system
 -> render vendor tiles
```

Checkpoint:

- Why does Monitoring need both metadata and runtime data?
- Why group by Source/Target system instead of technical integration name?
- How does a tile know its passed/failed/warning counts?

### Hour 8: Monitoring Detail And Review Workflow

Goal: understand message logs, payload results, resolved state, and review state.

Code to read:

```text
webapp/controller/MonitoringDetail.controller.js
webapp/view/MonitoringDetail.view.xml
webapp/service/ReviewStore.js
webapp/view/PayloadDialog.fragment.xml
```

Topics:

- Message Processing Logs
- failed run details
- Results payload link
- Resolved checkbox
- `messageId` as the key
- local review state

Key concept: `messageId` identifies a specific run.

That is why resolved state is stored by message ID:

```js
ReviewStore.setResolved(sMessageId, true);
```

If an integration fails five times, those are five different message IDs.

Exercise: find where the resolved checkbox is added to each log row. Explain why resolved state should attach to `messageId`, not `integrationId`.

Checkpoint:

- Why can failed logs be resolved individually?
- Why does Home unresolved count depend on failed logs?
- Why is review state currently localStorage?
- What would need to change to make it shared across users?

## Day 2: Backend And Full-System Reasoning

### Hour 1: Backend Architecture

Goal: understand the FastAPI backend as an optional proxy/API service.

Code to read:

```text
backend/main.py
backend/config.py
backend/auth.py
backend/btp_client.py
backend/routers/
```

Topics:

- FastAPI app startup
- routers
- environment config
- CORS
- CSP/frame ancestors
- OAuth client credentials
- mock vs live backend behavior

Mental model:

```text
The backend has two jobs:
1. Proxy/mediate calls to SAP Integration Suite
2. Store and serve payload result data
```

Exercise: open `backend/main.py` and identify:

- where the app is created
- where routers are included
- where CORS/security headers are configured

Checkpoint:

- What does FastAPI do here?
- Is the backend required for all frontend features?
- Which frontend mode talks to the backend?

### Hour 2: Backend Routes

Goal: understand each backend route group.

Code to read:

```text
backend/routers/integrations.py
backend/routers/monitoring.py
backend/routers/payloads.py
```

Topics:

- route handlers
- request/response shape
- delegation to services
- error handling
- payload API

Exercise: for each router file, write:

```text
This router exposes...
This router delegates to...
This router returns...
```

Checkpoint:

- Which routes support integrations?
- Which routes support monitoring?
- Which routes support payload upload/download?
- Which routes are frontend-facing?

### Hour 3: BTP Client Layer

Goal: understand how the backend would talk to SAP Integration Suite.

Code to read:

```text
backend/btp_client.py
backend/auth.py
```

Topics:

- OAuth token fetching
- token caching
- API client responsibilities
- mock/live placeholder behavior
- why credentials should remain server-side

Key principle:

```text
Browser
 -> your backend
 -> SAP Integration Suite API
```

is safer than:

```text
Browser
 -> SAP Integration Suite with secret exposed
```

Exercise: find where the auth token is requested. Explain where a bad implementation could leak secrets.

Checkpoint:

- Why does `auth.py` exist?
- What do client credentials mean?
- Why is backend token handling safer than frontend token handling?

### Hour 4: Payload Storage

Goal: understand PostgreSQL-backed payload storage and preview/download behavior.

Code to read:

```text
backend/payload_storage.py
backend/routers/payloads.py
```

Topics:

- payload upload
- metadata
- preview size limit
- download-only behavior
- one-week retention
- PostgreSQL persistence
- why payloads are linked by `messageId`

Flow:

```text
Integration Suite sends payload result
 -> backend receives it
 -> stores metadata + payload
 -> Home/Monitoring can link it to a message log
 -> user views preview or downloads file
```

Exercise: trace a payload from POST request to stored row.

Checkpoint:

- Where are payloads stored?
- How do payloads connect to monitoring logs?
- Why should large payloads not render in the browser?
- Why do privacy rules matter here?

### Hour 5: End-To-End Data Flow Lab

Exercise 1: Latest Runs Table

```text
Home page loads
 -> Home.controller.js
 -> BackendClient.getIntegrationsWithMetadata()
 -> BackendClient.getMessageLogs(id)
 -> ReviewStore.countUnresolvedFailed(logs)
 -> Home.view.xml table
```

For each arrow, write:

```text
What data enters?
What data exits?
What could fail?
```

Exercise 2: Resolving A Failed Run

```text
User opens Monitoring Detail
 -> failed logs load
 -> user checks Resolved
 -> ReviewStore stores messageId
 -> Home unresolved count decreases on reload
```

Exercise 3: Payload Result

```text
Integration sends result payload
 -> backend stores it
 -> Monitoring Detail loads logs and payloads
 -> matching by messageId
 -> View Results opens dialog
```

Checkpoint: explain one full feature without notes.

### Hour 6: Code Review Training

Goal: review this app like an engineer, not a vibe coder.

For every change, ask:

```text
1. What user action starts this flow?
2. What model state changes?
3. What external API is called?
4. What happens if the API fails?
5. Is the data persisted? Where?
6. Is this user-specific or shared across users?
7. Does this expose secrets or sensitive data?
8. Does this scale if there are 200 integrations?
9. Does this break mock mode?
10. Does this need a test or manual verification?
```

Exercise: review the Under Review feature.

Expected answer:

```text
It is stored in localStorage.
It is keyed by messageId or integration fallback.
It persists in the same browser.
It does not sync across users.
Backend persistence would be needed for shared operational review state.
```

### Hour 7: Refactoring And Improvement Map

Goal: distinguish good-enough local behavior from production-grade behavior.

Good enough now:

```text
Review state in localStorage
Frontend grouping logic
Mock/destination/proxy modes
Payload preview/download
Batch parameter update
```

Needs future hardening:

```text
Shared review state in backend
Role enforcement
Backend persistence for resolved/review notes
Automated tests
Production auth model
Deployment descriptors
Better error boundaries
Pagination/log query limits
```

Exercise: pick one feature and propose a production-grade version.

Example:

```text
Feature: Under Review
Current: localStorage
Production: backend table keyed by messageId, integrationId, reviewer, status, description, timestamps
```

### Hour 8: Final Oral Exam

Prompt 1: explain the app in 3 minutes.

Expected structure:

```text
Integration Pulse is a SAPUI5 frontend with an optional FastAPI backend.
The frontend uses routed XML views/controllers.
BackendClient abstracts mock, destination, and proxy modes.
Integrations are loaded from runtime/design-time APIs.
Monitoring uses message logs.
Payloads are stored in PostgreSQL through the backend.
Review state is currently localStorage.
```

Prompt 2: explain what happens when a user clicks See Details on Home.

Prompt 3: explain how an unresolved issue count is calculated.

Prompt 4: explain how an externalized parameter update works.

Prompt 5: explain what you would change to make review comments shared across users.

## Suggested Study Artifacts

### File Responsibility Map

Create this for each major file:

```text
File:
Purpose:
Important models:
Important functions:
Calls:
Risks:
```

### Data Flow Diagrams

Draw:

```text
Integration catalog
Monitoring logs
Payload results
Review/resolution state
```

### Glossary

Write your own definitions for:

```text
JSONModel
binding
controller
route
formatter
service layer
mock mode
destination mode
proxy mode
messageId
payload
externalized parameter
batch request
localStorage
```

### I Can Explain Checklist

```text
[ ] How routing works
[ ] How XML views bind to models
[ ] How controllers load data
[ ] How BackendClient normalizes data
[ ] How integrations are grouped
[ ] How monitoring logs are loaded
[ ] How payload results are matched
[ ] How review/resolution state works
[ ] How backend routes are organized
[ ] How payload storage works
[ ] What is local-only vs shared
[ ] What needs production hardening
```

## Recommended Interactive Teaching Sequence

1. App architecture, routing, and UI5 first principles
2. Home page and latest-runs table
3. BackendClient and mock/live data
4. Integrations page
5. Integration Detail and parameter updates
6. Monitoring and message logs
7. Backend, FastAPI, and PostgreSQL
8. Code review simulation and production-hardening discussion

For each session, use this loop:

```text
I explain the concept.
We read the real file.
I trace one function line by line.
You explain it back.
I ask debugging questions.
You make one tiny safe change or answer a review prompt.
```
