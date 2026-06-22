# Monitoring And Troubleshooting Guide

| Symptom | Likely cause | Where to investigate | Recommended action | Escalation owner |
|---|---|---|---|---|
| Integration missing from catalog | Runtime artifact is undeployed, draft, or missing from IntegrationRuntimeArtifacts | Integrations page and BTP Integration Suite | Confirm deployment status and runtime artifact availability | Integration Support |
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

## Practical escalation packet

When escalating an issue, include: environment, integration name, Source System, Target System, Message ID, time, status, error details, whether Results payload was present, and any recent configuration changes. Do not include detailed employee data or prohibited PII.
