# Bug Summary

## User-visible problem

When the user clicks an integration from the Integrations page and opens the detail/configuration page, the app fails to load externalized parameters.

The visible toast/dialog error has appeared as:

```text
Failed to load configuration: Integration design time artifact not found
```

At one point, after a broad fallback was added, the error changed to:

```html
Failed to load configuration:
<!DOCTYPE html><html><head><title></title></head><body><h1>Internal Server Error</h1></body></html>
```

That HTML 500 was addressed by removing the broad unfiltered design-time catalog call, but the original "Integration design time artifact not found" problem is still present.

## Current behavior

The integration is visible on the Integrations/search screen because the app loads deployed/runtime artifacts from:

```text
GET /api/v1/IntegrationRuntimeArtifacts
```

However, when the user opens the detail page, the app attempts to load externalized parameters from:

```text
GET /api/v1/IntegrationDesigntimeArtifacts(Id='...',Version='...')/Configurations
```

The detail page cannot find a design-time artifact ID/version combination that BTP accepts for the selected runtime artifact.

## Expected behavior

When the user clicks a deployed integration, the detail page should load:

- integration metadata
- externalized parameters
- runtime/detail actions like Save Draft, Deploy, and Run Immediately when supported

The app should correctly resolve the selected deployed/runtime artifact to the corresponding design-time artifact required by the `IntegrationDesigntimeArtifacts(...)/Configurations` API.

## Reproduction

Known reproduction path:

1. Run the app in live destination mode.
2. Open the Integrations page.
3. Select/click an integration that appears in the deployed/runtime list.
4. The detail page attempts to load parameters.
5. The parameter load fails with "Integration design time artifact not found".

Current app configuration defaults to live destination mode:

```js
useMock: false
liveMode: "destination"
destinationBaseUrl: "/api/v1"
```

Important condition: this has been observed against a real SAP BTP Integration Suite tenant, not mock mode.

## Determinism

Observed as deterministic for at least one selected integration. It is not known whether every integration fails or only integrations whose runtime ID/name does not map cleanly to the design-time artifact ID/version.

# Relevant Project Context

This is an SAPUI5/OpenUI5 app with two possible live API modes:

- Destination mode: browser calls same-origin `/api/v1`; `fiori-tools-proxy` routes `/api` to the BTP destination named `Integration-Suite-Dev`.
- Proxy mode: browser calls the optional FastAPI backend at `backendBaseUrl`.

Current `webapp/service/config.js` uses destination mode by default:

```js
useMock: false
liveMode: "destination"
destinationBaseUrl: "/api/v1"
backendBaseUrl: "http://localhost:8000"
```

Current `ui5.yaml` has:

```yaml
backend:
  - destination: Integration-Suite-Dev
    path: /api
  - destination: Integration-Suite-Dev-RT
    path: /http
```

Relevant API distinction:

- The integration catalog comes from runtime artifacts: `IntegrationRuntimeArtifacts`.
- Externalized parameters come from design-time artifacts: `IntegrationDesigntimeArtifacts(Id='...',Version='...')/Configurations`.

That separation is the center of this bug. A deployed/runtime artifact can appear in the catalog while the app still fails to derive the exact design-time ID/version required for configuration APIs.

# Relevant Files

## `webapp/service/BackendClient.js`

Main frontend data-access boundary. This is the most important file for destination-mode behavior.

Relevant functions:

- `mapIntegration(oRaw)`: normalizes runtime artifact records into UI integration objects.
- `mapDesignTimeMetadata(oRaw)`: normalizes design-time artifact records.
- `getDestinationIntegration(sId)`: loads runtime artifacts and enriches one item with design-time metadata.
- `getDesignTimeIdCandidates(sId, oIntegration)`: builds possible design-time IDs.
- `getDesignTimeVersionCandidates(oIntegration)`: builds possible design-time versions.
- `getDesignTimeEntityForCandidate(sDesignTimeId, sVersion)`: direct design-time artifact lookup.
- `tryGetDesignTimeMetadata(...)`: tries direct metadata candidates.
- `withDesignTimeMetadata(oRuntimeItem)`: enriches runtime item with design-time metadata/cache.
- `getDestinationDesignTimeMatches(sCandidate)`: targeted fallback using `$filter=Id eq ... or Name eq ...`.
- `getDestinationDesignTimePackageMatches(sPackageId)`: package-scoped fallback using `$filter=PackageId eq ...`.
- `getFallbackConfigurationCandidates(sId, oIntegration)`: combines direct, filtered, and package-scoped candidates.
- `getConfigurationsForCandidate(sDesignTimeId, sVersion)`: calls `/Configurations`.
- `tryGetConfigurations(...)` and `tryGetConfigurationsForVersions(...)`: recursive fallback through candidate IDs/versions.
- `getDestinationConfigurations(sId, oIntegration)`: destination-mode configuration loader.
- `updateDestinationConfigurations(...)` and `deployDestinationIntegration(...)`: also rely on design-time identity resolution.

## `webapp/controller/IntegrationDetail.controller.js`

Controller for the detail/configuration page.

Relevant functions:

- `_onMatched(oEvent)`: reads route parameter `{id}` into `this._sId`.
- `_load()`: calls `BackendClient.getIntegration(this._sId)`, then `BackendClient.getConfigurations(this._sId, oIntegration)`.
- `_getConfigurationArtifactId()`: returns `integration>/designTimeId` or `this._sId`.
- `onSaveDraft()` and `_doDeploy()`: update/deploy using `_getConfigurationArtifactId()`.

Important: `_load()` now loads integration metadata first, then configurations. This was intentional so configuration lookup can use enriched design-time metadata.

## `backend/btp_client.py`

FastAPI proxy client for Integration Suite. Relevant if running with `?mock=false&api=proxy`.

Relevant functions:

- `list_integrations()`: loads runtime artifacts from `/IntegrationRuntimeArtifacts`.
- `get_integration(integration_id)`: finds a runtime artifact by ID.
- `_design_time_candidates(integration_id)`: builds design-time candidate IDs/versions.
- `_design_time_matches_for_candidate(candidate)`: targeted design-time lookup by Id/Name.
- `_design_time_matches_for_package(package_id)`: package-scoped fallback.
- `_matched_design_time_items(integration_id, item)`: exact/fuzzy matching.
- `get_configurations(integration_id)`: calls `/IntegrationDesigntimeArtifacts(...)/Configurations`.
- `_resolve_design_time_identity(integration_id)`: used before update/deploy.
- `update_configurations(...)` and `deploy_integration(...)`: write/deploy design-time artifact configuration.

## `backend/models.py`

Defines shared API models for proxy mode.

Relevant class:

- `Integration`: currently includes `designTimeId` and `designTimeVersion`, added while debugging this issue.

## `webapp/manifest.json`

Defines the route:

```json
"integrationDetail": {
  "pattern": "integrations/{id}"
}
```

The route passes only one path parameter, `id`. If an artifact ID contains route-sensitive characters, route encoding/decoding may matter.

## `ui5.yaml`

Defines destination proxy behavior for local UI5 serve.

Relevant section:

```yaml
- destination: Integration-Suite-Dev
  path: /api
```

The failing configuration call in destination mode goes through this route.

# Execution / Data Flow

Current destination-mode flow:

1. User opens Integrations page.
2. `webapp/controller/Integrations.controller.js` calls `BackendClient.getIntegrations()`.
3. `BackendClient.getDestinationIntegrations()` calls:

   ```text
   GET /api/v1/IntegrationRuntimeArtifacts
   ```

4. Runtime artifacts are normalized by `mapIntegration`.
5. Some metadata enrichment occurs via `withDesignTimeMetadata`, but enrichment can fail silently and return the runtime item with empty sender/receiver/design-time metadata.
6. User clicks an integration tile/list row.
7. `Integrations.controller.js -> onOpenIntegration()` navigates to:

   ```js
   this.navTo("integrationDetail", { id: sId });
   ```

8. `IntegrationDetail.controller.js -> _onMatched()` stores the route `id` in `this._sId`.
9. `IntegrationDetail.controller.js -> _load()` calls:

   ```js
   BackendClient.getIntegration(this._sId)
   ```

10. In destination mode, `BackendClient.getDestinationIntegration(sId)` reloads runtime artifacts, finds item by runtime ID, and tries `withDesignTimeMetadata`.
11. `_load()` then calls:

   ```js
   BackendClient.getConfigurations(this._sId, oIntegration)
   ```

12. Destination mode calls `getDestinationConfigurations(sId, oIntegration)`.
13. It tries configuration URLs like:

   ```text
   /api/v1/IntegrationDesigntimeArtifacts(Id='<candidate>',Version='<candidate>')/Configurations
   ```

14. If no candidate works, the UI catches the error and shows:

   ```text
   Failed to load configuration: Integration design time artifact not found
   ```

# Debugging Evidence

## Observed facts

- The integration is visible on the Integrations/search screen.
- Clicking the integration can fail to load parameters with:

  ```text
  Failed to load configuration: Integration design time artifact not found
  ```

- A broad unfiltered call to `/IntegrationDesigntimeArtifacts` caused or coincided with:

  ```html
  <!DOCTYPE html><html><head><title></title></head><body><h1>Internal Server Error</h1></body></html>
  ```

- Replacing the broad design-time catalog fetch with targeted filtered calls removed that specific HTML 500 symptom, but did not fix the original not-found issue.
- SAP's Cloud Integration OData API reads configuration parameters from:

  ```text
  IntegrationDesigntimeArtifacts(Id='{Id}',Version='{Version}')/Configurations
  ```

- The app currently displays deployed/runtime artifacts from:

  ```text
  IntegrationRuntimeArtifacts
  ```

## Observations from user screenshots

- The most recent screenshot still shows:

  ```text
  Failed to load configuration:
  Integration design time artifact not found
  ```

- No screenshot has yet provided the exact failing Network tab URL after the latest fixes.

## Hypotheses, not facts

- The runtime artifact `Id` may not equal the design-time artifact `Id`.
- The runtime artifact `Name` may not equal the design-time artifact `Name`.
- The design-time artifact version may not be `Active`, `active`, or the runtime version.
- The design-time API may require a different ID visible in Integration Suite Web UI under the artifact General tab.
- The app may be losing/altering the integration ID in routing if it contains special route characters.
- The BTP destination/proxy may not support the exact filtered OData query syntax currently generated.

# Things Already Tried

## 1. Sequential detail loading

What changed:

- `IntegrationDetail.controller.js -> _load()` was changed from parallel `Promise.all([getIntegration, getConfigurations])` to:
  1. load integration metadata
  2. pass the resolved integration object into `getConfigurations`

Why:

- The configuration call needs design-time metadata, so it should not run before metadata resolution.

Result:

- Should remain in the code.
- Did not fully fix the bug.

## 2. Try multiple direct ID/version candidates

What changed:

- `BackendClient.js` added candidate resolution using:
  - `oIntegration.designTimeId`
  - route/runtime ID
  - `oIntegration.name`
  - versions `Active`, `active`, and runtime version

Why:

- Runtime ID/name/version may differ from design-time identity.

Result:

- Useful and should remain.
- Did not fully fix the bug.

## 3. Add `designTimeId` and `designTimeVersion` to normalized models

What changed:

- `mapIntegration()` began capturing possible design-time fields from runtime payloads.
- `backend/models.py -> Integration` now has `designTimeId` and `designTimeVersion`.

Why:

- If Integration Suite returns design-time identity fields in the runtime payload, the app should preserve them.

Result:

- Useful and should remain.
- Did not fully fix the bug, likely because the runtime payload did not include enough usable metadata for the failing artifact.

## 4. Broad design-time catalog fallback

What changed:

- The app queried:

  ```text
  /IntegrationDesigntimeArtifacts
  ```

  and attempted to match the full catalog by normalized ID/name.

Why:

- If direct candidates fail, the full design-time catalog might reveal the correct artifact.

Result:

- Failed or was too heavy.
- User saw an HTML "Internal Server Error".
- This approach should not be repeated unless there is strong evidence the tenant can safely handle the full catalog request.
- The broad catalog fetch was removed.

## 5. Targeted filtered design-time fallback

What changed:

- Replaced broad catalog fetch with targeted queries:

  ```text
  /IntegrationDesigntimeArtifacts?$filter=Id eq '<candidate>' or Name eq '<candidate>'
  ```

Why:

- Avoid loading the entire design-time catalog while still finding exact matches.

Result:

- Removed the HTML 500 symptom.
- Did not fully fix the not-found issue.
- Should probably remain, but the exact OData filter syntax should be verified in the Network tab/Postman.

## 6. Package-scoped fallback

What changed:

- If exact filtered lookup fails, the app queries:

  ```text
  /IntegrationDesigntimeArtifacts?$filter=PackageId eq '<packageName>'
  ```

- It then tries fuzzy ID/name matching inside that package.
- If the package returns exactly one design-time artifact, it uses that as a last-resort candidate.

Why:

- Runtime/design-time names can differ, but the package may narrow the search safely.

Result:

- Still not confirmed to fix the bug.
- Should remain only if the package query is valid for the tenant and does not create performance issues.
- Needs Network tab confirmation.

## 7. Better final error text

What changed:

- `tryGetConfigurationsForVersions()` now includes tried IDs and versions in the final error.

Why:

- Future debugging needs the exact candidate list.

Result:

- Should remain.
- User's latest screenshot still shows the generic phrase; unclear if the browser was refreshed to latest code or if the UI truncates/wraps the longer message.

# Current Code Changes

Current tracked working tree state before creating this handoff:

```text
git diff --stat
```

returned no tracked diffs.

Current `git status --short` showed only untracked local artifacts:

```text
?? backend-8010.pid
?? cloudflared-tunnel.log
?? cloudflared.exe
?? docs/notebooklm-part-1-app-shape-and-startup.md
?? docs/part-1-app-shape-startup-quiz.md
?? docs/part-1-weekend-review.md
?? integration-pulse-backend.err.log
?? integration-pulse-backend.log
?? integration-pulse-backend.out.log
?? localtunnel-8010.err.log
?? localtunnel-8010.out.log
?? localtunnel-8010.pid
?? localtunnel-active.log
?? localtunnel-alt.log
?? localtunnel.err.log
?? localtunnel.out.log
?? tunnelmole.log
```

Those files appear to be local logs, tunnel binaries, PID files, and older untracked learning docs. They should not be assumed related to this bug and should not be committed unless separately reviewed.

Recent commits related to this bug:

```text
7087b59 Add package-scoped artifact fallback
764f809 Use targeted design-time fallback lookups
c501fd4 Add design-time catalog fallback
1c0daa3 Resolve design-time artifacts for configurations
```

Potentially experimental changes that may need review:

- Package-scoped fallback using `PackageId eq '<packageName>'`.
- Last-resort behavior that uses the single artifact in a package if exactly one is returned.
- Destination-mode save/deploy resolving design-time identity independently.

No active debugging instrumentation was found in tracked files at the time this handoff was created.

# Current Hypotheses

## 1. Incorrect design-time ID/version mapping remains the root cause

Evidence supporting:

- Runtime artifact is visible, but design-time configuration lookup fails.
- SAP APIs require design-time artifact ID/version for `/Configurations`.
- The error text specifically says design-time artifact not found.

Evidence against:

- None strong yet.
- Several ID/name/version fallbacks have failed, suggesting either the actual design-time identity is not among available runtime fields or the requests are malformed.

Test to confirm/eliminate:

- In browser Network tab, capture the exact failing `IntegrationDesigntimeArtifacts(...)/Configurations` URLs and the candidate IDs/versions from the error.
- In Integration Suite Web UI, open the same iFlow and copy the exact artifact ID from the General tab.
- Manually test:

  ```text
  /api/v1/IntegrationDesigntimeArtifacts(Id='<exact ID>',Version='Active')/Configurations
  ```

  and any known concrete version.

## 2. Version is wrong

Evidence supporting:

- Current candidates are `Active`, `active`, and runtime version.
- SAP examples sometimes use a concrete version like `1.0.1`; some APIs distinguish `active` vs `Active`.

Evidence against:

- The app does try runtime `Version` if present.
- Unknown whether runtime version equals design-time version for this failing artifact.

Test:

- In Integration Suite, identify the exact active design-time artifact version.
- Test direct configuration URL with that exact version.

## 3. OData URL encoding is wrong for key predicates

Evidence supporting:

- `odataLiteral()` currently encodes the value inside quotes:

  ```js
  return "'" + encodeURIComponent(odataString(sValue)) + "'";
  ```

- In OData examples, key predicates often appear as raw quoted strings with only quotes escaped, not percent-encoded inside the quotes.
- If an ID contains spaces or special characters, percent-encoding inside the key literal may cause the backend to search for a different literal value.

Evidence against:

- Many earlier calls may have worked with simple IDs.
- Percent-encoding may be accepted by the proxy/server in some cases.

Test:

- Compare Network tab URL to a working Postman/browser URL using the exact artifact ID.
- Try both:

  ```text
  Id='My Integration Flow'
  Id='My%20Integration%20Flow'
  ```

  through the same destination/proxy path.

## 4. Route parameter ID is being altered

Evidence supporting:

- Route pattern is `integrations/{id}`.
- `onOpenIntegration()` passes `id: sId` directly without explicit `encodeURIComponent`.
- If runtime IDs contain `/`, `?`, `#`, parentheses, or other route-sensitive characters, routing may alter the value passed into `_onMatched`.

Evidence against:

- Most Integration Suite artifact IDs are often underscore-based and route-safe.
- No observed exact failing ID has been provided yet.

Test:

- Add temporary console logging or inspect with debugger:

  ```js
  sId in onOpenIntegration()
  this._sId in IntegrationDetail._onMatched()
  ```

- Compare the two values exactly.

## 5. Destination/proxy does not support the filtered fallback syntax

Evidence supporting:

- The full catalog fallback caused HTML 500.
- OData filter syntax support can be limited by endpoint/resource.

Evidence against:

- SAP docs indicate `IntegrationDesigntimeArtifacts` supports query parameters; exact supported filters on top-level artifact collection should be verified.

Test:

- Inspect Network calls for:

  ```text
  /IntegrationDesigntimeArtifacts?$filter=Id eq ...
  /IntegrationDesigntimeArtifacts?$filter=PackageId eq ...
  ```

- Test those exact URLs outside the app with the same destination/auth if possible.

# Important Constraints

- Do not make further speculative fixes without gathering stronger evidence.
- The Integrations page should continue showing only deployed/runtime artifacts; users should not see undeployed artifacts in the catalog.
- Externalized parameters must continue to load from the design-time configuration API.
- Save Draft and Deploy must preserve regular deployment behavior.
- Run Immediately must remain separate from Deploy and must not change timer parameters.
- User has a standing instruction: after every prompt that changes files, commit and push to GitHub with proper commit messages.
- Do not commit unrelated untracked local files/logs/tunnel artifacts.
- UI/UX changes should remain polished and HR-admin friendly, but this bug is primarily a data/API identity resolution issue.
- Avoid large tenant-wide calls that can hurt performance or trigger server errors.

# Recommended Next Investigation

Do evidence gathering before another patch.

1. Hard refresh/restart the local UI server to ensure the latest pushed code is running.
2. Reproduce the failure on one specific integration.
3. Record the exact integration values from the tile/detail context:
   - runtime `id`
   - runtime `name`
   - `designTimeId`
   - `designTimeVersion`
   - `packageName`
   - `version`
4. In the browser Network tab, capture every failing request to:

   ```text
   IntegrationDesigntimeArtifacts
   ```

   especially the final `/Configurations` request and any `$filter` fallback requests.
5. Confirm whether the final error includes the "Tried IDs" and "versions" text. If not, verify the latest build is actually served.
6. In Integration Suite Web UI, open the same integration flow and copy the exact artifact ID and version from the General/details area.
7. Manually test the exact configuration endpoint using the same destination/proxy path:

   ```text
   /api/v1/IntegrationDesigntimeArtifacts(Id='<exact artifact ID>',Version='<exact version>')/Configurations
   ```

8. If the manual exact endpoint works, compare it character-by-character with the app-generated URL.
9. If manual exact endpoint fails, the issue is likely permissions, wrong tenant/space/destination, or the artifact is not accessible via the credentials/destination being used.
10. Only after the exact failing and exact working URLs are known, patch the resolver.

# Definition of Done

The bug is fixed when:

1. Clicking the affected deployed integration opens the detail page successfully.
2. Externalized parameters are visible.
3. The loaded parameters include expected known keys, such as the user's current standardized parameters when applicable:

   ```text
   SFResourcePath
   filter.query
   pulse.immediateRunEndpoint
   pulse.immediateRunSupported
   pulse.Source
   filter.pulseQuery
   filter.SFQuery
   ```

4. The browser Network tab shows a successful `200` response for:

   ```text
   IntegrationDesigntimeArtifacts(...)/Configurations
   ```

5. Regression checks pass:
   - Integrations page still shows deployed/runtime artifacts only.
   - Search/category tiles still load.
   - Save Draft uses the correct design-time artifact.
   - Deploy still works for the same integration.
   - Run Immediately behavior remains unchanged and still uses the separate HTTPS sender endpoint.
   - Mock mode still loads mock configurations.

