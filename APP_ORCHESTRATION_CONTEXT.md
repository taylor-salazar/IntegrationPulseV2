# Integration Pulse App Context for Task Orchestration

This file gives an external orchestration model enough context to generate useful implementation prompts for Codex. It is intentionally focused on what the app does, how it is structured, and what constraints matter when planning work.

## Product Purpose

Integration Pulse is an SAPUI5 operations console for deployed SAP Integration Suite integrations. It is intended for HR/admin users who need to operate integrations without working directly inside SAP Integration Suite.

The app focuses on these jobs:

- Browse deployed integration flows.
- Group integrations by source or target system so business users can understand interface ownership.
- View and edit externalized parameters.
- Save draft configuration updates.
- Deploy/redeploy integrations.
- Trigger a separate immediate-run HTTPS sender endpoint without changing timer parameters.
- Monitor integration runtime status and message processing logs.
- View payload/result files sent back from Integration Suite.
- Track review/resolution state for failed runs.

The app is designed to feel similar to SAP Fiori/Integration Suite: restrained, operational, dense enough for repeated use, and friendly to HR administrators.

## Current Architecture

The project has three major parts:

- `webapp/`: SAPUI5/OpenUI5 frontend using XML views, MVC controllers, JSON models, and Horizon/Fiori styling.
- `backend/`: optional FastAPI proxy for live SAP BTP calls, OAuth token handling, payload storage, and API boundaries.
- `webapp/localService/mockdata/`: mock data used for local/demo mode.

The frontend can run in three modes:

- Mock mode: reads local fixtures.
- Destination live mode: browser calls same-origin `/api/v1`; UI5/Fiori tooling or BTP destination routing forwards to SAP Integration Suite.
- Proxy live mode: browser calls the FastAPI backend, which then calls SAP Integration Suite.

Current frontend config is in `webapp/service/config.js`.

Current local destination routing is in `ui5.yaml`:

- `/api` routes to destination `Integration-Suite-Dev`.
- `/http` routes to destination `Integration-Suite-Dev-RT`.

## Core User Screens

### Home

The Home screen is the landing page. It contains tiles for main areas and a latest integration runs table.

Current behavior:

- Shows entry points for Integrations and Monitoring.
- Shows latest run details for currently deployed integrations.
- Latest run table presents vendor-friendly naming as `Source System -> Target System`, with the technical integration name underneath.
- Includes status, time, unresolved issue count, under-review controls, review comment viewing, and a `See Details` link into monitoring detail.

Relevant files:

- `webapp/view/Home.view.xml`
- `webapp/controller/Home.controller.js`

### Integrations

The Integrations page shows deployed/runtime artifacts only. It should not show undeployed design-time-only artifacts.

Current behavior:

- Loads runtime artifacts from Integration Suite.
- Enriches them with design-time metadata where possible.
- Groups them as source systems or target systems.
- Displays category tiles.
- Clicking a category changes the main content area to show integrations for that category.
- Clicking an integration opens the integration detail/configuration page.

Relevant files:

- `webapp/view/Integrations.view.xml`
- `webapp/controller/Integrations.controller.js`
- `webapp/service/BackendClient.js`

### Integration Detail

The Integration Detail page is where users view and edit externalized parameters.

Current behavior:

- Loads one integration.
- Loads externalized parameters.
- Groups parameters by prefix.
- Displays parameters in a compact multi-column layout.
- Timer/cron-like parameters are shown with a user-friendly schedule UI.
- Supports Reset, Save Draft, Deploy, and Run Immediately.
- Shows payloads associated with the integration where supported.

Important current bug:

- Parameter loading for some deployed integrations is failing with `Integration design time artifact not found`.
- See `DEBUG_HANDOFF.md` for the detailed debugging handoff.

Relevant files:

- `webapp/view/IntegrationDetail.view.xml`
- `webapp/controller/IntegrationDetail.controller.js`
- `webapp/service/BackendClient.js`
- `backend/btp_client.py`

### Run Immediately

Run Immediately is intentionally separate from Deploy.

Purpose:

- Trigger a separate HTTPS sender endpoint for a single run.
- Avoid changing timer parameters.
- Allow SuccessFactors users to generate an additive one-run query.

Important externalized parameters:

- `pulse.immediateRunSupported`: controls whether Run Immediately appears.
- `pulse.immediateRunEndpoint`: sender endpoint used for immediate runs.
- `pulse.Source`: controls source-specific UI behavior.
- `SFResourcePath`: SuccessFactors entity/resource path for EDMX-based field selection.
- `filter.query`: original saved SuccessFactors query.
- `filter.pulseQuery`: Integration Pulse generated immediate-run query.
- `filter.SFQuery`: final query used by the SuccessFactors adapter.

Behavior:

- If `pulse.immediateRunSupported` is not true, the Run Immediately button should not show.
- If `pulse.Source` is not `SuccessFactors`, EDMX upload/SuccessFactors-specific query UI should not show.
- `filter.query` is the baseline saved query.
- Pulse must not generate a `filter.pulseQuery` with fewer fields/navs than `filter.query`.
- Existing fields/navs from `filter.query` should be selected/disabled in the UI.
- If the user makes no changes, Pulse sends no pulse query header.
- If the user adds fields/navs/filters, Pulse sends the merged additive query in headers:
  - `filter.pulseQuery`
  - `filter-pulseQuery`
  - `X-Pulse-Query`

Relevant files:

- `webapp/controller/IntegrationDetail.controller.js`
- `webapp/service/BackendClient.js`
- `docs/externalized-parameters.md`

### Monitoring

The Monitoring screen summarizes runtime health and lets users drill into runs.

Current behavior:

- Shows a compact status bar for totals such as started/errors/warnings.
- Groups vendor tiles by source or target system, not raw integration names.
- Tiles summarize passed, failed, and warning counts.
- Shows integrations that ran within the last 24 hours.
- Shows all deployed vendor integrations in a collapsible section.
- Clicking a vendor/system tile opens monitoring logs for that system.

Monitoring detail behavior:

- Shows message processing logs.
- Filters out discarded entries.
- Formats dates in readable form.
- Includes result/payload links where a payload exists.
- Allows failed message runs to be marked resolved.

Relevant files:

- `webapp/view/Monitoring.view.xml`
- `webapp/controller/Monitoring.controller.js`
- `webapp/view/MonitoringDetail.view.xml`
- `webapp/controller/MonitoringDetail.controller.js`
- `webapp/service/BackendClient.js`

### Payload Results

Integration Pulse has a payload receiver API for JSON, CSV, XML, and readable text payloads sent from Integration Suite.

Current behavior:

- Integration Suite can POST a payload to Pulse.
- Payload records are linked to message processing logs by `messageId`.
- Monitoring detail shows a Results link when a payload exists for a run.
- Small readable payloads open in a dialog.
- Large payloads are download-only.
- Payloads expire after one week.

Storage:

- PostgreSQL is the intended BTP storage.
- Local explicit config can use `INTEGRATION_PULSE_PAYLOAD_DATABASE_URL`.
- BTP Cloud Foundry can discover PostgreSQL via `VCAP_SERVICES`.

Relevant files:

- `backend/payload_store.py`
- `backend/routers/payloads.py`
- `webapp/view/PayloadDialog.fragment.xml`
- `webapp/service/BackendClient.js`

## Important Data/API Concepts

### Runtime vs Design-Time Artifacts

This distinction is critical.

Runtime/deployed artifact list:

```text
GET /api/v1/IntegrationRuntimeArtifacts
```

Externalized parameter configuration:

```text
GET /api/v1/IntegrationDesigntimeArtifacts(Id='...',Version='...')/Configurations
```

An integration can appear in runtime search while still failing parameter loading if Pulse does not resolve the correct design-time artifact ID/version.

The current active bug is in this area. See `DEBUG_HANDOFF.md`.

### SAP BTP Destination Mode

Destination mode keeps browser calls same-origin:

```text
/api/v1/...   -> Integration Suite OData API
/http/...     -> Integration Suite HTTPS sender runtime endpoint
```

This is currently the default frontend live mode.

### FastAPI Proxy Mode

Proxy mode is available with:

```text
?mock=false&api=proxy
```

The backend owns OAuth token handling and calls SAP APIs server-side.

## Important Repository Files

### Root

- `README.md`: general project overview, quick start, architecture, and live-mode notes.
- `DEBUG_HANDOFF.md`: focused debugging handoff for the current parameter-loading bug.
- `APP_ORCHESTRATION_CONTEXT.md`: this file.
- `package.json`: UI5 scripts.
- `ui5.yaml`: local UI5 server and destination proxy config.
- `.env.example`: backend environment template.

### Frontend

- `webapp/service/config.js`: frontend runtime mode and API base routes.
- `webapp/service/BackendClient.js`: frontend data-access boundary. Most SAP API mapping starts here in destination mode.
- `webapp/manifest.json`: routing, models, UI5 libraries.
- `webapp/controller/BaseController.js`: shared controller helpers.
- `webapp/i18n/i18n.properties`: UI text.
- `webapp/css/style.css`: app styling.

### Backend

- `backend/main.py`: FastAPI app setup, routing, CORS/CSP.
- `backend/config.py`: environment settings.
- `backend/auth.py`: OAuth client-credentials handling.
- `backend/btp_client.py`: SAP BTP Integration Suite client for proxy mode.
- `backend/models.py`: Pydantic API contracts.
- `backend/routers/integrations.py`: integration routes.
- `backend/routers/monitoring.py`: monitoring routes.
- `backend/routers/payloads.py`: payload receiver/read routes.
- `backend/payload_store.py`: payload persistence.

### Docs

- `docs/externalized-parameters.md`: parameter contract for CPI/iFlow configuration.
- `docs/codebase-reading-order.md`: suggested order for learning the codebase.
- `docs/codebase-teaching-chat-prompt.md`: prompt for teaching-oriented codebase walkthrough.
- `docs/codebase-weekend-crash-course.md`: long-form study plan.

## Current Known Issue

The most urgent active bug is:

```text
Failed to load configuration: Integration design time artifact not found
```

Do not blindly add more speculative fallbacks. The next best investigation is evidence gathering:

- Capture the exact failing Network tab URLs for `IntegrationDesigntimeArtifacts`.
- Compare runtime artifact ID/name/package/version against the exact design-time artifact ID/version visible in SAP Integration Suite.
- Verify whether OData key literal encoding is wrong.
- Verify whether route parameter encoding is altering the selected artifact ID.
- Verify whether the destination supports the filtered fallback syntax.

See `DEBUG_HANDOFF.md` for the detailed investigation sequence.

## Design and UX Expectations

When generating UI tasks, preserve these principles:

- Keep the UI Fiori/Horizon-like, operational, and clean.
- Avoid marketing-page layouts.
- Use compact, readable tables and tiles for admin workflows.
- Use cards/tiles only where they represent real repeated objects or dashboard summaries.
- Avoid clutter; collapsible sections are preferred for lower-priority large lists.
- Prefer source/target system names over technical integration names when the target user is HR/admin.
- Technical names should still be visible as secondary text.
- Use readable dates and statuses.
- Avoid exposing undeployed artifacts to normal users.

## Engineering Preferences

When generating prompts for Codex:

- Ask Codex to inspect the relevant files before patching.
- Ask for focused changes, not broad refactors.
- Preserve existing architecture and naming conventions.
- Use `apply_patch` for manual edits.
- Run validation after changes:

```text
npm.cmd run build
python -m py_compile backend\models.py backend\btp_client.py backend\routers\integrations.py
```

- Do not commit untracked local tunnel/log files.
- The user has a standing workflow preference: after code/documentation changes, commit and push to GitHub with a proper commit message.

## Useful Prompt Pattern for Orchestrating Codex

Use this style when sending work to Codex:

```text
We are working in the Integration Pulse repo. Read APP_ORCHESTRATION_CONTEXT.md first, and if the task touches parameter loading read DEBUG_HANDOFF.md too.

Task:
<specific desired behavior>

Constraints:
- Preserve destination and proxy modes unless impossible.
- Do not show undeployed artifacts in the Integrations catalog.
- Keep UI Fiori/Horizon-like and HR-admin friendly.
- Do not commit unrelated untracked local files.
- Run npm.cmd run build and relevant Python compile checks.
- Commit and push with a clear message.

Before coding, inspect:
<relevant file list>

After coding, summarize:
- what changed
- files changed
- validation run
- commit hash
```

## Suggested Task Breakdown Strategy

For large enhancements, split into small prompts:

1. Data contract and API behavior.
2. Frontend service mapping.
3. Controller state/data flow.
4. XML view/UI composition.
5. Styling polish.
6. Validation and regression check.
7. Documentation update.

This app has many cross-cutting flows, so small prompts reduce the chance of accidentally breaking Deploy, Run Immediately, or Monitoring while working on one screen.

