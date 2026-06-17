# Source Repo Transfer Notes

Source repo inspected:

- `source-repo/integrationpulsetest-main`

Target UI:

- Current SAPUI5 app in `webapp/`
- Current FastAPI proxy in `backend/`

## Transfer Direction

Use the current app as the foundation. The source repo is an earlier/smaller UI5 app, not a separate backend service. Its useful functionality is the SAP Integration Suite endpoint knowledge:

- `GET /api/v1/IntegrationRuntimeArtifacts`
- `POST /api/v1/DeployIntegrationDesigntimeArtifact?Id='...'&Version='...'`

For the BTP import path, keep the source repo's destination-based auth model. The source repo does not store OAuth code or secrets in source control; it relies on a BTP/SAP destination named `Integration-Suite-Dev` and local `fiori-tools-proxy` routing during development.

Current target flow:

```text
SAPUI5 app -> /api/v1/... -> BTP destination -> SAP Integration Suite API
```

Keep the current FastAPI proxy as a local/mock fallback until we decide whether it is still needed. Do not introduce client secrets into the UI repo.

## Auth Decision

Resolved: preserve the source repo's auth approach for now.

| Concern | Decision |
|---|---|
| Where auth lives | In the BTP destination, not in frontend code |
| GitHub safety | No client secrets, OAuth secrets, or tokens in repo |
| Local development | Use UI5/Fiori proxy with a destination when live calls are needed |
| BTP import | Expect destination/app-router style routing for `/api/v1` |
| FastAPI backend | Keep only as optional fallback unless the deployment architecture changes |

## Source Features Already Covered

| Source repo feature | Current app equivalent | Decision |
|---|---|---|
| List integrations | Integrations page | Keep current UI |
| Search integrations | Integrations page search | Keep current UI |
| Deploy confirmation dialog | Detail page `MessageBox.confirm` | Keep current UI |
| Deploy integration by `Id` and `Version` | Source `/api/v1` destination path and current backend mapping | Prefer destination path for BTP import |

## Open UI Decisions

These source-repo behaviors do not exist exactly in the current UI.

| Source behavior | Current app state | Question |
|---|---|---|
| Deploy button directly on each integration card | Added as an icon quick action on cards | Resolved: keep quick deploy in cards |
| Expand/collapse list rows to show actions | Current list rows navigate to detail | Should rows expand inline, or should detail pages remain the main workflow? |
| Global header deploy button without a selected integration | Current global header has refresh and notifications | Should this be omitted? Recommended: omit because deploy needs a selected artifact. |
| Deploy without reviewing/editing parameters | Card deploy sends current saved parameters | Resolved: allow unchanged redeploy from cards |

## Recommended Next Implementation

1. Keep the current UI routes and layouts.
2. Use destination/live mode for `/api/v1` BTP calls.
3. Keep mock mode for local demos.
4. Keep the FastAPI proxy available only if a server-side proxy is later preferred.

## Destination Mode Added

The current UI now supports the source repo's destination flow:

- `webapp/service/config.js`
  - `useMock: true` by default
  - `liveMode: "destination"`
  - `destinationBaseUrl: "/api/v1"`
- `webapp/service/BackendClient.js`
  - maps SAP Integration Suite OData responses into the current UI models
  - calls `/api/v1/IntegrationRuntimeArtifacts`
  - calls `/api/v1/IntegrationDesigntimeArtifacts(...)/Configurations`
  - calls `/api/v1/DeployIntegrationDesigntimeArtifact`
  - calls `/api/v1/MessageProcessingLogs`
- `ui5.yaml`
  - routes `/api` through `fiori-tools-proxy`
  - expects destination `Integration-Suite-Dev`

Runtime URLs:

- Mock/demo: `index.html`
- Destination live: `index.html?mock=false&api=destination`
- FastAPI proxy live: `index.html?mock=false&api=proxy`

## GitHub And BTP Readiness

Not ready for final BTP import until these are confirmed:

| Item | Status |
|---|---|
| Destination-based `/api/v1` frontend mode | Done |
| No BTP secrets in frontend source | Done |
| Build succeeds locally | Needs final check after latest changes |
| Destination `Integration-Suite-Dev` exists in target BTP account/subaccount | User must confirm |
| Destination points at the SAP Integration Suite API base URL | User must confirm |
| Destination auth has permission for runtime artifacts, configurations, deploy, and message logs | User must confirm |
| BTP app router or HTML5 runtime route forwards `/api` to that destination | Must be configured for deployment |
| Live test against BTP destination | Still needed |
