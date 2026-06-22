# Administration And Configuration

## Integration artifact discovery

The application lists deployed/runtime integrations through IntegrationRuntimeArtifacts in destination mode or through /api/integrations in proxy mode. The frontend filters out statuses such as undeployed, not deployed, and draft.

## Parameter metadata

Externalized parameters are loaded from IntegrationDesigntimeArtifacts(...)/Configurations in destination mode or /api/integrations/{id}/configurations in proxy mode. Parameters are grouped by naming prefix, including Extract, Filter, Include, Delivery, Audit, SFTP, and General.

## Editable and read-only fields

The configuration model includes eadOnly and secure fields, but the current documentation cannot confirm complete UI enforcement for every data source. Treat this as an area for validation before production.

## Parameter validation

The code tracks dirty state and collects parameter values. It does not implement full business validation for every parameter type. Integration owners remain responsible for validating tenant-specific parameter rules before redeployment.

## Redeployment workflow

Deployment first persists configuration values, then calls deployment. Destination mode uses a $batch request for configuration updates and then calls DeployIntegrationDesigntimeArtifact. The user receives confirmation and success/error feedback.

## Schedule transformation

Timer-like parameters are detected by text pattern and represented in a schedule UI. The selected schedule is transformed to a cron-like string. Time zone selections are appended using --tz=<time-zone>.

## Safe rollback considerations

The current code does not implement rollback or version restore. Before changing production parameters, capture current values, follow change-control procedures, and confirm a manual rollback path in SAP Integration Suite.
