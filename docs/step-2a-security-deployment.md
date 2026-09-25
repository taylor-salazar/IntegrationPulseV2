# Step 2A — security, deployment and recovery

Status: implementation and local verification; not deployed or live-certified.
This is a dedicated single-customer beta. It does not implement SaaS onboarding,
subscriptions or customer-selected destinations. This runbook supersedes older
production instructions that expose SAP destinations or unauthenticated payload APIs.

## Architecture and trust

The production build follows browser → managed BTP application router/XSUAA →
FastAPI → Destination service → Integration Suite. `webapp/xs-app.json` routes only
application APIs to `pulse-api`; it never exposes a general SAP management or
runtime destination. Static content is also authenticated. `mta.yaml` prepares
HTML5 repository content, managed-router destination content, the Python backend,
two XSUAA applications, Destination service and an existing PostgreSQL binding.
It does not add a standalone application router.

The router forwards the human access token only to FastAPI. FastAPI verifies its
signature with SAP `sap-xssec`, restricts issuer, resource audience, expiration,
zone and grant type, then checks fully qualified scopes. `sap.custom` is an identity
provider origin, not a privilege or tenant signal. The trusted tenant identifier
comes from server configuration, not a request header, query, body or integration ID.
Direct backend API calls require the same valid bearer token; router authentication
alone never grants backend access. API responses include `Cache-Control: no-store`.

| Principal | Authority | Access |
| --- | --- | --- |
| Human Viewer | `$XSAPPNAME.Viewer` | Catalog, ordinary configuration values, monitoring and logs |
| Human Administrator | `$XSAPPNAME.Administrator` | Viewer access plus save, deploy, Immediate Run and payload list/detail/download |
| Registered client-credentials machine | `$XSAPPNAME.Payload.Ingest` | Payload ingestion only |

Human scopes never authorize ingestion. Client-credentials tokens never acquire
human privileges, even if they contain Viewer/Administrator scopes. An ingest
token additionally needs its validated client ID registered in the backend.
The UI loads `/api/session` capabilities before initializing routes. Its hidden
controls are convenience; every protected operation has backend authorization.

## Required deployment configuration

Supply an environment-specific MTA extension outside the repository, setting the
parameters below. Do not commit service keys, tokens, filled environment files or
destination passwords. Blank trust settings fail closed. Cloud Foundry startup
rejects mock mode and the legacy-development SAP transport.

| MTA parameter / environment | Required value |
| --- | --- |
| `tenant-id` / `PULSE_TENANT_ID` | Stable administrator-selected identifier for this deployment's customer |
| `jwt-issuer` / `PULSE_JWT_ISSUER` | Exact trusted XSUAA token issuer, including its path; verify against the bound zone |
| `management-destination` / `PULSE_MANAGEMENT_DESTINATION` | Management destination name, selected on the server |
| `runtime-destination` / `PULSE_RUNTIME_DESTINATION` | Different runtime destination name, selected on the server |
| `ingest-client-ids` / `PULSE_INGEST_CLIENT_IDS` | Comma-separated registered machine client IDs; empty disables ingestion |
| `sensitive-fields` / `PULSE_SENSITIVE_FIELDS` | JSON array of case-sensitive parameter-key glob rules; default `[]` |
| `postgres-service-name` | Existing PostgreSQL service; default `pulse-postgres` |
| `PULSE_RUNTIME_ENDPOINTS` | Optional JSON map of exact runtime integration ID to approved HTTPS sender path |
| `PULSE_PAYLOAD_MAX_BYTES` | Positive ingestion body limit; default 1048576 bytes, including JSON wrapper overhead |

The backend requires the named `pulse-auth` XSUAA and `pulse-destination`
Destination bindings in `VCAP_SERVICES`. If instance names change, also change
`PULSE_XSUAA_SERVICE` and `PULSE_DESTINATION_SERVICE` and the content descriptors.
Only one PostgreSQL binding should be attached; the current database resolver
selects the first PostgreSQL binding. Local database overrides remain server-only.
Set allowed frame ancestors for the real SuccessFactors/Work Zone origins.
Configure the managed host's embedding/session policy as well; backend CSP alone
does not configure the HTML5 host or browser third-party cookie behavior.

### SAP destinations

Create two distinct destinations accessible to the backend's Destination service:

| Setting | Management | Runtime |
| --- | --- | --- |
| Type / ProxyType | HTTP / Internet | HTTP / Internet |
| Authentication | OAuth2ClientCredentials | OAuth2ClientCredentials |
| URL | HTTPS management root ending `/api/v1` | HTTPS runtime origin, without a path |
| Technical credentials | Management API client with required read/configure/deploy permissions | Separate runtime client allowed to invoke the approved HTTPS sender |

Configure each destination's OAuth token service URL/client credentials in BTP.
Never use user-token exchange or a human bearer token for these SAP calls. The
backend obtains a Destination-service token from its binding, resolves only the
configured names, and uses returned, unexpired bearer `authTokens`. Unexpected
authentication types, malformed URLs, token errors and redirects fail closed.
The distinct names are enforced in code; operators must verify that the underlying
technical clients really are different and have the appropriate least privileges.

`pulse-api` is a third, application-only destination generated by the MTA. Its
`NoAuthentication` plus `HTML5.ForwardAuthToken` settings mean the router forwards
the logged-in user's token to FastAPI, which validates it. This is not either SAP
technical destination. Do not publish those technical destinations as browser routes.

### Human and machine setup

Create role collections for the Viewer and Administrator role templates from
`xs-security.json`. Assign the relevant users/groups from the intended identity
provider, including `sap.custom` users. Do not infer roles from origin or email.
Test an unassigned user, Viewer and Administrator separately.

`xs-security-ingest.json` defines a separate client-credentials XSUAA application.
The human application's `Payload.Ingest` scope grants authority to this application;
the machine application requests that authority. There is no human ingestion role
template. Create a service key for the machine application in the secure BTP tooling,
store its credentials in the iFlow's security material, and register its actual
client ID in `PULSE_INGEST_CLIENT_IDS`. Restart/restage after configuration changes.
Use its OAuth token endpoint with `grant_type=client_credentials`, then POST the
bearer token to the backend `/payload-api/v1/payloads`. The backend URL is appropriate
for machine ingestion; browser router session/CSRF endpoints are not a machine login.
Verify the actual token contains the resource audience and cross-application ingest
authority before enabling capture. Never copy the token into a URL or this repository.

### Configuration edits and runtime requests

Ordinary configuration values remain visible to Viewers by default. Explicit
sensitive-key rules redact both current and default values on the server and mark
the field redacted/read-only. Administrators may read/edit those values. No live SAP
sensitivity metadata was available for inspection during this implementation;
unverified SAP field names are deliberately not treated as authoritative metadata.
Review real parameter keys and configure rules before production access.

Save and deploy submit changed fields only. Untouched secure, redacted and read-only
values are omitted. `action: clear` with an empty value explicitly clears a field;
empty `set`, nulls, masks, duplicate keys and unknown mutation fields are rejected.
The server resolves a concrete design-time ID/version from runtime identity, using
only 404 as a fallback signal and rejecting ambiguous results. Returned `Active`
metadata must identify a concrete version. UI mutations include the displayed
identity; a changed identity produces 409 and requires a reload. Save-before-deploy
retains the resolved identity and never triggers Immediate Run implicitly.

Immediate Run retains the entity and query aliases, including `filter.query`,
without rebuilding the query or deploying the artifact. It uses only the runtime
destination token. The submitted endpoint must match a server-approved endpoint
from `PULSE_RUNTIME_ENDPOINTS`, the `pulse.immediateRunEndpoint` configuration,
or runtime metadata. Foreign origins, substitutions, traversal and redirects fail.
Queries must be representable safely as HTTP headers; non-ASCII/control characters
are rejected explicitly instead of being rewritten.

The browser fetches/caches the managed-router CSRF token and refreshes once only
after an explicit 403 `X-CSRF-Token: Required` rejection. Network failures, timeouts
and ambiguous deployment/runtime outcomes are never automatically retried. Inspect
SAP state before manually repeating a mutation whose outcome is unknown.
Payload downloads use authenticated fetch, validate status and download a Blob
using the response filename. Credentials never appear in the download URL.

## Database migration and retention

Existing databases require the explicit additive migration
`backend/migrations/001_payload_ownership.sql`; it is not automatically applied.
Stop writes, take a platform database backup, and run with a securely supplied DSN:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/migrations/001_payload_ownership.sql
```

Apply it twice on a staging copy to check idempotence before production. Legacy
rows retain NULL tenant/client provenance and are inaccessible through the API.
Do not backfill ownership from submitted JSON, integration names or an assumed
customer. A later backfill requires independently verified tenant and client provenance.
Fresh databases create the complete schema on first storage access. Old schemas
fail that initialization until migrated. Every list, detail, download and expiry
query is tenant-qualified; unknown and foreign IDs both return 404 at the API.
New rows store the validated tenant and machine client. Ingestion authenticates
before buffering, bounds both declared and streamed bodies, and rejects compression.
Existing wrapper/raw formats, preview behavior, filenames and seven-day expiry remain.
Tenant-scoped cleanup does not remove quarantined legacy rows; separately authorize
retention maintenance for those rows. There is no destructive automatic down-migration.

## Local development and verification

`npm start` prepares an ignored `.ui5/development/webapp` tree for mock development.
`npm run start:destination` preserves the local destination reference and its existing
UI5 proxy configuration. `npm run start:proxy` prepares a local proxy UI, but backend
authentication still requires a real trusted development XSUAA setup. No bypass is
provided. `npm run build` uses the production source, never that generated dev tree.
Production ignores `?mock=true` and `?api=destination`.

Install Python requirements in a virtual environment. New dependencies are
`sap-xssec>=4.5,<5` and `PyJWT[crypto]>=2.10,<3`; local validation used sap-xssec 4.5.0
and PyJWT 2.15.0. Tests generate synthetic RSA keys and signed tokens in memory and
run the real JWT validator; no production dependency override weakens authentication.

```powershell
npm run test:frontend
python -B -m unittest discover -s tests/backend -p 'test_*.py' -v
npm run build
git diff --check
```

For this workstation the installed test dependencies are under ignored
`.venv/step2a-libs`, so prefix backend commands with
`$env:PYTHONPATH='.venv/step2a-libs'`. This is test dependency discovery, not an auth mode.
The signed-token, destination, identity-policy, payload-security and shared-parity
test files run in the full backend suite. Shared `identity-parity.json` scenarios
cover Active/concrete versions, version mismatches, package fallback, ambiguity,
missing artifacts, apostrophes/slashes and upstream 401/403/429/503 in both paths.
`parity.json` checks catalog metadata and log mapping. Existing concurrency, date,
discarded-log, pagination, lossless query and batch-order regressions remain covered.

Final local verification (2026-09-24): `npm run test:frontend` passed 121 tests;
the backend discovery command above passed 56 tests, including security and parity;
`npm run build` passed; MTA YAML and deployment JSON parsed successfully. No actual
PostgreSQL migration or MTA compilation/deployment was run. The complete suites have
no skipped or expected-failing tests. During the final review the shared fixture
needed its mock OAuth endpoint completed, and a credential-error wrapper initially
changed two outage statuses to 502; those regressions were fixed and the suite rerun.

## Reviewable implementation stages

| Stage | Principal files | Behavior and impact |
| --- | --- | --- |
| 1 | `backend/security.py`, `backend/main.py`, routers, `xs-security*.json`, `test_security.py` | Signed JWT boundary, human/machine separation, capabilities; adds SAP xssec and PyJWT dependencies |
| 2 | `backend/destination_client.py`, `backend/config.py`, `backend/btp_client.py`, `test_destinations.py` | Server-selected technical destinations; user tokens stop at FastAPI |
| 3 | `backend/models.py`, `backend/configuration_policy.py`, `backend/btp_client.py`, `BackendClient.js`, `IntegrationDetail.controller.js`, identity tests | Concrete identity, server redaction, changed-only mutations and explicit clears |
| 4 | `backend/btp_client.py`, Home/MonitoringDetail controllers, parity fixtures/tests | Runtime-only catalog with design metadata, monitoring/log parity; failed loads are visibly reported |
| 5 | `backend/btp_client.py`, parity/runtime tests | Runtime destination, approved endpoint binding, unchanged query/header contract |
| 6 | `backend/routers/payloads.py`, `backend/payload_storage.py`, `backend/migrations/*`, payload tests | Machine-only bounded ingestion, trusted ownership and tenant SQL; additive explicit migration |
| 7 | `webapp/Component.js`, `webapp/service/*`, controllers/views, `webapp/xs-app.json`, manifest, `mta.yaml`, `scripts/prepare-development.cjs`, `package.json` | Session-gated routes/controls, CSRF, authenticated downloads, locked production and separate dev tree |
| 8 | `tests/backend/*`, `tests/js/*`, `.env.example`, README and this runbook | Security/parity regression expansion, deployment and recovery instructions |

Old tests expecting full-form saves or first-success identity resolution were
updated to the intentional safer contract. Monitoring tests now require visible
errors instead of silently fabricated empty histories. An initial build could not
read the sandboxed UI5 cache; rerunning with access to the installed cache succeeded.
No SAP permissions were reduced or auth bypass added to satisfy tests.

## Git checkpoint and recovery

Original HEAD: `bca80cdad69ee1348fc8e7d064b7a20ff08f7e59`.
Pre-application-migration checkpoint: `3711f6104f2789d3b8b0cae4af6431baded419c9`.
Backup branch: `backup/pre-fastapi-centralization`.
Implementation branch: `feature/fastapi-centralization`.
The checkpoint added only four reviewed documentation files; no tracked application
changes preceded it. Pre-existing local logs, PIDs and `cloudflared.exe` were retained
and excluded from the implementation. No push, history rewrite or checkpoint deletion.

The safest exact recovery command creates a separate checkout without disturbing
implementation changes or local machine files (choose a new path if this exists):

```powershell
git worktree add --detach "../IntegrationPulse-pre-fastapi" 3711f6104f2789d3b8b0cae4af6431baded419c9
```

To return the current checkout, first preserve any later legitimate source edits
in a reviewed commit. With tracked changes clean:

```powershell
git switch backup/pre-fastapi-centralization
```

Return to the implementation with `git switch feature/fastapi-centralization`.
These commands do not reset or delete files. Database ownership columns remain
additive. An application rollback restores the older insecure API behavior: isolate
the backend from public access before deploying the checkpoint and do not expose
legacy payloads. Git rollback is not a reversal of already accepted SAP mutations.

## Required live acceptance and limitations

No BTP credentials, live SAP calls, deployment or real PostgreSQL migration were
used for this implementation. `cf`, `mbt` and `psql` are unavailable on this machine.
Local build success is UI5 build success, not proof that the MTA deploys successfully.
Before launch, complete all of the following in a controlled tenant:

1. Build/deploy the MTA with the environment extension; validate bound names,
   cross-application authority creation/order, Python runtime, managed HTML5 content
   discovery, authenticated API destination, CSRF fetch/refresh and same-origin routes.
2. Sign in through the actual custom `sap.custom` provider. Verify unassigned-user
   denial, Viewer ordinary configuration visibility and redaction, Administrator
   mutations/payload access, and backend denial for direct unauthorized calls.
3. Compare the real runtime catalog, design metadata/configuration entity shapes,
   returned concrete Active version, package fallback and sensitivity evidence.
   Test exact apostrophe/slash IDs through the real router. Confirm monitoring
   latest-50 history, discarded filtering, 24-hour counts and bounded concurrency.
4. Verify separate management/runtime technical clients and permissions; run a
   changed-only save, deliberate clear, deploy and explicit Immediate Run on a safe
   artifact. Confirm each preserved query/header alias in its receiver trace.
5. Obtain a real registered machine OAuth token. Verify accepted ingestion, rejected
   human/unregistered/wrong-audience tokens, body limits and raw/wrapper formats.
6. On actual PostgreSQL, apply the migration twice, verify NULL legacy quarantine,
   insert two tenants, prove foreign list/detail/download isolation, and validate
   capture, expiry and filenames. Mocked SQL assertions are not real DB validation.
7. Validate SuccessFactors launch/SSO, embedding, browser cookie policies, role changes,
   authorized Blob downloads and absence of direct SAP credentials/routes in the browser.

Destination credentials are resolved per request (no shared token cache); this
favors correctness and rotation but adds latency and service traffic. Metadata has
no persistent production cache. SAP mutations cannot be made atomic with deployment;
a save may succeed before deployment fails, and ambiguous results require inspection.
UI roles refresh at session initialization while server authorization applies to every
request. The retained development destination metadata enrichment remains a legacy
reference with best-effort caching; production authorization, redaction and ownership
guarantees apply to the FastAPI path. Single-customer trust is intentional, not SaaS isolation.

Implementation references: [SAP Python security library](https://github.com/SAP/cloud-pysec)
and [SAP managed routing configuration](https://help.sap.com/docs/cloud-portal-service/sap-cloud-portal-service-on-cloud-foundry/configure-application-routing-xs-app-json).
