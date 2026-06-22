# Open Items And Planned Enhancements

| Item | Status | Notes |
|---|---|---|
| Final role model | Planned | Read Only and Editable are documented as planned, not enforced |
| Future role types | Planned | Payload Viewer, Deployment Operator, and Administrator may be considered |
| Production authentication | Validation needed | No complete XSUAA/approuter/SSO configuration is present |
| Deployment architecture | Validation needed | No MTA, approuter, HTML5 repo, or CI/CD descriptor is present |
| Screenshot package | Needed | Real screenshots should be generated from a sanitized running environment |
| Payload PII enforcement | Not implemented | No automatic PII detection or redaction is verified |
| Retention cleanup job | Not present | Cleanup occurs during storage access, not through a scheduled job in repo |
| Monitoring message counts in destination mode | Limited | Destination mode currently sets messages24h/errors24h to zero unless enriched elsewhere |
| Read-only/secure parameter UI behavior | Validation needed | Data model contains fields, but full enforcement needs confirmation |
| Production support model | Needed | Owners, escalation paths, and SLAs must be defined |

## Missing screenshots

- Home page with sidebar.
- Integrations page grouped by Source System.
- Integration Detail externalized parameters.
- Schedule UI for timer parameters.
- Monitoring page grouped by Source System.
- Monitoring Detail with Results column.
- Payload preview dialog and download-only message.
