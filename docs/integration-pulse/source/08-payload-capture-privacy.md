# Payload Capture, Privacy, And Retention

## Business explanation

Payload capture lets an Integration Suite flow send a run result summary to Integration Pulse. The purpose is support visibility: users can see what summary result was produced for a run without opening Integration Suite or searching external logs.

## Supported formats

The backend API accepts JSON, CSV, XML, and plain text payload bodies. It also supports the original JSON wrapper contract.

## Endpoint

```text
POST /payload-api/v1/payloads?integrationId=<artifact-id>&messageId=<message-id>&fileName=<file-name>
Content-Type: application/json | text/csv | application/xml | text/plain
```

Metadata may also be sent as headers: X-Integration-Id, X-Message-Id, and X-File-Name.

## Message Processing Log association

The Monitoring Results column links payloads to Message Processing Logs by messageId. SAP Integration Suite flows should set this value from the Message Processing Log ID, for example by using the SAP_MessageProcessingLogID header in a Groovy script.

## Preview and download behavior

Payloads up to 100 KB are available for preview in the payload dialog. Payloads larger than 100 KB are stored but marked downloadOnly, and users must download them if permitted.

## Retention

Payloads are retained for one week. The PostgreSQL storage layer prunes expired rows when payload storage functions run. No separate scheduled cleanup job is present in the current repository.

## Privacy policy

Integration owners must ensure payloads contain only integration-run summaries. Payloads must not include PII other than permitted User IDs. They must not include employee names, emails, addresses, national IDs, payroll amounts, benefit elections, bank data, health data, or full transactional files.

## Implementation versus responsibility

| Topic | Current implementation | Responsibility remaining |
|---|---|---|
| Format support | Accepts text payloads including JSON, CSV, XML, and text | Integration owner chooses appropriate summary format |
| PII control | No automatic PII detection or redaction verified | Integration owner must prevent prohibited data from being sent |
| Retention | Seven-day expiration and pruning on storage access | Platform owner must confirm operational cleanup expectations |
| Access control | No role-based payload restriction verified in code | Application owner must implement production authorization model |

## Allowed payload example

```json
{
  "integrationName": "SuccessFactors to Payroll",
  "status": "Success",
  "recordsProcessed": 125,
  "userIdsAffected": ["U123456", "U123457"],
  "executionTimestamp": "2026-06-22T14:30:00Z"
}
```

## Prohibited content examples

- Employee names, personal emails, addresses, national IDs, bank details, compensation details, or benefit elections.
- Full payroll, benefits, or HR master-data extracts.
- Raw source or target payloads containing detailed employee data.

## Data lifecycle

See `assets/diagrams/payload_lifecycle.mmd` for the visual source.
