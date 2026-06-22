# FAQ And Glossary

## Frequently asked questions

### What is an externalized parameter?
An externalized parameter is a configurable value exposed by an Integration Suite artifact so it can be changed without editing the iFlow design directly.

### What is a runtime artifact?
A runtime artifact is a deployed integration artifact available in the Integration Suite runtime.

### What is a Message Processing Log?
A Message Processing Log, or MPL, is the Integration Suite execution record for an integration run.

### What does warning mean?
In the application, warnings may represent states such as retry, processing, starting, deploying, or stopped, depending on runtime and log information.

### Why is my payload download-only?
Payloads over 100 KB are marked downloadOnly and cannot be previewed inline.

### Why is a payload no longer available?
Payloads expire after one week. The storage layer prunes expired records when accessed.

### Why can I see an integration but not edit it?
The current codebase does not enforce Read Only versus Editable roles. If editing is restricted in an environment, that restriction likely comes from deployment or identity-provider configuration outside the repository.

### How is a Source System different from a Target System?
The Source System is the sender or originating system. The Target System is the receiver or destination system.

### What data may be sent to Integration Pulse?
Only run summary information. User IDs may be included when approved. Detailed PII and transactional HR, payroll, benefits, or identity data must not be sent.

## Glossary

| Term | Definition |
|---|---|
| SAP BTP | SAP Business Technology Platform |
| SAP Integration Suite | SAP service used to design, deploy, and run integrations |
| iFlow | Integration flow in SAP Integration Suite |
| MPL | Message Processing Log for an integration run |
| Source System | The sender or originating system |
| Target System | The receiver or destination system |
| Payload summary | A small run-result payload intended for support review |
| downloadOnly | Payload state used when a file is too large for browser preview |
| Destination | SAP BTP configuration used to route calls to an external service |
| FastAPI proxy | Optional backend service included in the repository |
