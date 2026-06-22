# Roles And Responsibilities

## Current verified authorization behavior

The current repository does not contain an enforced Read Only or Editable role model in the SAPUI5 application, FastAPI routes, XSUAA configuration, approuter configuration, or deployment descriptor. The UI exposes edit and deploy controls based on application flow, not verified role checks.

This means the role model below is a planned/proposed model and must be implemented through the target identity provider, BTP security configuration, backend authorization checks, frontend control visibility, or a combination of those controls.

## Planned / Proposed Role Model

| Planned role | Intended access | Enforcement status |
|---|---|---|
| Read Only | View integrations, Source/Target grouping, monitoring, run history, logs, and permitted payload details | Planned - not enforced in current codebase |
| Editable | All Read Only activities plus edit supported configuration values and redeploy integrations | Planned - not enforced in current codebase |

## Responsibility matrix

| Group | Responsibilities |
|---|---|
| HR Operations | Monitor integration health, review business-readable statuses, escalate failures, avoid downloading or sharing restricted payload content |
| HRIS Administrators | Review parameters, understand schedule behavior, coordinate approved changes, validate run outcomes |
| Integration Support | Investigate failed or warning runs, review Message Processing Logs, troubleshoot connectivity or payload capture issues |
| Integration Developers | Maintain iFlows, configure payload summary calls, ensure payloads do not include prohibited data, support deployment issues |
| SAP BTP Administrators | Maintain destinations, service bindings, environment variables, PostgreSQL access, deployment routes, and production security controls |
| Application Owners | Own release readiness, role model, documentation review, support model, and privacy guardrails |

## Future role expansion placeholder

Future roles may include Payload Viewer, Configuration Editor, Deployment Operator, Administrator, and Audit Viewer. These must be validated against the production authorization architecture before documentation can describe them as enforced.
