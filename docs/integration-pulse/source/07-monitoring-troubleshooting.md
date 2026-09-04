# Monitoring And Troubleshooting Guide

| Symptom | Likely cause | Where to investigate | Recommended action | Escalation owner |
|---|---|---|---|---|
| Integration missing from catalog | Runtime artifact is undeployed, draft, or missing from IntegrationRuntimeArtifacts | Integrations page and BTP Integration Suite | Confirm deployment status and runtime artifact availability | Integration Support |
| Configuration cannot be loaded for a visible integration | The latest design-time version does not match the deployed runtime version | Integration Suite artifact version, deployed version, and the failed Configurations request | If the intended design-time version is saved and valid, deploy that version, wait for STARTED status, then hard-refresh Integration Pulse | Integration Support |
| No monitoring data displayed | Destination/proxy unavailable, mock/live mode mismatch, or API error | Browser console, BackendClient mode, /api/v1 or /api/monitoring | Verify runtime mode and route mapping | SAP BTP Administrator |
| Source/Target grouping unexpected | Sender/Receiver metadata missing or stale cached metadata | IntegrationDesigntimeArtifacts metadata and local storage cache | Refresh and validate design-time metadata | Integration Support |
| Failed or warning totals unexpected | Runtime status or Message Processing Log aggregation differs from business expectation | Monitoring controller logic and MessageProcessingLogs | Compare logs to Integration Suite | Integration Support |
| Message logs unavailable | MessageProcessingLogs API not reachable or filter mismatch | Monitoring detail, Integration Suite logs | Confirm integration ID and API permissions | Integration Developer |
| Payload Results link missing | No payload with matching messageId was captured | Payload API, PostgreSQL storage, iFlow HTTP call | Send messageId from SAP_MessageProcessingLogID | Integration Developer |
| Payload preview unavailable | Payload exceeds 100 KB or preview flag is false | Payload dialog and payload summary | Download file if permitted | HRIS / Support |
| Payload no longer available | Retention expired or database cleanup ran | PostgreSQL payload table | Re-run integration if business-approved | Application Owner |
| Configuration update fails | BTP API error, invalid parameter, or batch failure | BackendClient batch response, Integration Suite | Validate parameter key/value and retry | Integration Support |
| Redeployment fails | DeployIntegrationDesigntimeArtifact error or token/destination issue | Deploy response, backend logs | Check tenant API permissions | SAP BTP Administrator |
| Schedule update fails | Invalid schedule mapping or unsupported target parameter | Integration Detail schedule field | Validate generated cron-like value | Integration Developer |
| User cannot edit | Role model may be handled outside code or not implemented | Identity provider, BTP, app deployment | Confirm production authorization model | Application Owner |

## Live triage: application bug or environment state?

Before reporting a live behavior as an Integration Pulse defect, record and verify the following. These checks do not prove that the app is correct; they eliminate common tenant-state, deployment, access, and browser-state causes so that an application defect can be reproduced reliably.

- Confirm that Integration Pulse is connected to the intended tenant and environment. Check the active live mode, BTP destination, route, and tenant rather than relying only on the page title.
- Confirm that the affected artifact is deployed and appears in `IntegrationRuntimeArtifacts`. The Integrations catalog intentionally shows deployed runtime artifacts, not every draft or undeployed design-time artifact.
- Compare the latest design-time artifact version with the deployed runtime version. For example, if Integration Suite shows design-time version `1.0.2` while the deployed runtime artifact is `1.0.1`, Integration Pulse can encounter a version mismatch when loading version-specific configurations.
- When the newer version is the intended production version, save and validate it in Integration Suite, deploy that exact version, wait until its runtime status is `STARTED`, and then hard-refresh Integration Pulse. Do not create another version solely to resolve the mismatch.
- Do not redeploy merely to hide an unexplained error. First confirm that the version difference is expected and that deploying the newer version follows the environment's change-control process.
- Confirm that the expected parameters are actually externalized in the selected design-time version. A valid configuration response cannot contain parameters that were not externalized in the iFlow.
- Confirm that the browser is running the latest deployed Integration Pulse build. Use a hard refresh after an application deployment and compare the displayed error with the current build's diagnostic format.
- Capture the exact failed request URL, HTTP status, and response body for `IntegrationDesigntimeArtifacts(...)/Configurations`. A `400`, `401`, `403`, `404`, `429`, or `500` indicates a different investigation path; do not treat all of them as an artifact-not-found defect.
- Confirm destination or OAuth permissions for both runtime and design-time APIs. Being able to list runtime artifacts does not by itself prove that the same credentials can read or update design-time configurations.
- Reproduce against one named integration and record its runtime ID, runtime version, design-time ID, design-time version, package, tenant, and time of failure. Compare these values character-for-character rather than relying on display names.

Escalate as a likely Integration Pulse bug when the correct tenant and current app build are in use, the intended version is deployed and started, the exact design-time configuration endpoint succeeds with the same credentials outside the app, and Pulse still generates a different request or handles the successful response incorrectly.

## Practical escalation packet

When escalating an issue, include: environment and tenant, Integration Pulse build or commit, integration name and IDs, design-time and deployed runtime versions, Source System, Target System, Message ID, time, status, exact failed URL and HTTP status, sanitized response details, whether Results payload was present, and any recent configuration or deployment changes. Do not include credentials, access tokens, detailed employee data, or prohibited PII.
