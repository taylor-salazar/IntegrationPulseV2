# Product Capabilities At A Glance

| Capability | Business purpose | Audience | Status | Application area | Notes |
|---|---|---|---|---|---|
| Runtime artifact discovery | Show deployed integrations | HR Ops, HRIS, support | Implemented | Integrations | Filters deployed/runtime-like artifacts in frontend |
| Source System grouping | Organize integrations by originating system | HR Ops, support | Implemented | Integrations, Monitoring | Uses Sender metadata where available |
| Target System grouping | Organize integrations by receiving system | HR Ops, support | Implemented | Integrations, Monitoring | Uses Receiver metadata where available |
| Search integrations | Find integrations quickly | All users | Implemented | Integrations | Searches names, IDs, packages, and system labels |
| Externalized parameter review | Review configurable values | HRIS, support | Implemented | Integration Detail | Values are loaded from IntegrationDesigntimeArtifacts Configurations |
| Configuration editing | Update supported externalized values | HRIS, support | Implemented | Integration Detail | No role enforcement currently verified |
| Redeployment | Redeploy after changes | Integration support | Implemented | Integration Detail, cards | Confirmation dialog is present |
| Schedule management | Make timer values easier to edit | HRIS, support | Implemented | Integration Detail | Converts UI selections to cron-like expression strings |
| Monitoring overview | Show system-level health | HR Ops, support | Implemented | Monitoring | Passed, Failed, Warning counts by Source/Target System |
| Run history | Review recent executions | Support | Implemented | Monitoring Detail | Message logs loaded by integration ID |
| Payload capture | Store run result payload summaries | Support, HRIS | Implemented backend/API | Payload API | PostgreSQL required outside mock mode |
| Payload preview | Preview small JSON/CSV/XML/text summaries | Support | Implemented | Monitoring Detail, payload dialog | Payloads over 100 KB are download-only |
| Retention | Remove old payloads | Platform owners | Implemented on access | Backend payload storage | Expired rows pruned when payload storage functions run |
| Roles and permissions | Restrict view/edit actions | App owners | Planned | Security | Read Only and Editable are not enforced in the current codebase |
