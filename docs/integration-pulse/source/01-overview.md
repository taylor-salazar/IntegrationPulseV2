# Executive Overview

Integration Pulse is an operations application for deployed SAP BTP Integration Suite integrations. It gives HR operations and integration support teams a cleaner way to view deployed integrations, understand which Source System and Target System each integration supports, review configuration values, redeploy supported integrations, and investigate monitoring activity.

SAP Integration Suite is powerful, but routine HR operations work can be difficult for nontechnical users because important information is spread across runtime artifacts, design-time artifacts, externalized parameters, deployment actions, and Message Processing Logs. Integration Pulse presents that information in a guided business-readable interface.

The application helps answer practical questions:

1. Which integrations are deployed?
2. Which Source Systems or Target Systems are affected?
3. Which integrations failed or have warnings?
4. What configuration may need adjustment?
5. What schedule is configured for a timer-driven integration?
6. What summary result data was sent for a run?
7. Which vendor, HR platform, payroll system, or third-party service is impacted?

## What Integration Pulse is and is not

| Integration Pulse is | Integration Pulse is not |
|---|---|
| A SAPUI5 operations console for deployed Integration Suite runtime artifacts | A full Integration Suite design-time replacement |
| A business-readable monitoring and configuration interface | A data warehouse for employee, payroll, benefits, or transactional records |
| A tool for reviewing externalized parameters and redeploying supported integrations | A source-code editor for iFlows |
| A way to capture integration-run payload summaries for support review | A place to store detailed PII or full transactional payloads |
| A frontend with optional FastAPI proxy and PostgreSQL-backed payload storage | A fully implemented enterprise role model in the current codebase |

## Current implementation summary

The repository implements a SAPUI5 XML/MVC frontend with routes for Home, Integrations, Integration Detail, Monitoring, and Monitoring Detail. It includes BTP destination live mode for Integration Suite OData calls, an optional FastAPI proxy backend, and PostgreSQL-backed payload capture. Authorization roles are planned but not enforced in code.
