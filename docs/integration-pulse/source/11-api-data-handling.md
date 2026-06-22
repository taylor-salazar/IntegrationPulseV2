# API And Backend Reference

## Frontend destination-mode routes

| Capability | Route called by frontend | SAP API target |
|---|---|---|
| List integrations | /api/v1/IntegrationRuntimeArtifacts | IntegrationRuntimeArtifacts |
| Design-time metadata | /api/v1/IntegrationDesigntimeArtifacts(Id=...,Version=...) | IntegrationDesigntimeArtifacts |
| Configurations | /api/v1/IntegrationDesigntimeArtifacts(...)/Configurations | Configurations |
| Batch configuration update | /api/v1/ | OData batch |
| Deployment | /api/v1/DeployIntegrationDesigntimeArtifact?... | DeployIntegrationDesigntimeArtifact |
| Message logs | /api/v1/MessageProcessingLogs?... | MessageProcessingLogs |

## Optional FastAPI proxy routes

| Method | Route | Purpose |
|---|---|---|
| GET | /health | Health and mock-mode status |
| GET | /api/integrations | List integrations |
| GET | /api/integrations/{integration_id} | Get integration detail |
| GET | /api/integrations/{integration_id}/configurations | Get externalized parameters |
| PUT | /api/integrations/{integration_id}/configurations | Update parameters |
| POST | /api/integrations/{integration_id}/deploy | Deploy integration |
| GET | /api/monitoring | List monitoring items |
| GET | /api/monitoring/{integration_id} | Get monitoring item |
| GET | /api/monitoring/{integration_id}/logs | Get message logs |
| POST | /payload-api/v1/payloads | Receive payload summary |
| GET | /payload-api/v1/payloads?integrationId=... | List payload summaries |
| GET | /payload-api/v1/payloads/{payload_id} | Get payload detail when previewable |
| GET | /payload-api/v1/payloads/{payload_id}/download | Download raw payload text |

## Payload submission request

Raw text body with query metadata:

`	ext
POST /payload-api/v1/payloads?integrationId=ExampleIntegration&messageId=ExampleMessage&fileName=Results06222026.json
Content-Type: application/json
`

Or wrapper body:

`json
{
  "integrationId": "ExampleIntegration",
  "messageId": "ExampleMessage",
  "fileName": "Results06222026.json",
  "contentType": "application/json",
  "payload": "{\"status\":\"Success\"}"
}
`

## Error handling notes

The frontend shows toast or dialog errors for failed loading, save, deploy, and payload loading operations. The FastAPI runtime error handler returns HTTP 502 for runtime configuration failures such as missing backend configuration.
