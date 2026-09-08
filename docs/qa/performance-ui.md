# Repository performance, UI and robustness review

No BAS/browser timing, real SAP latency or PostgreSQL benchmark was measured. Unit-test elapsed time is not application performance. The operation-count tests use deterministic synthetic work and no timing threshold.

## Measured locally

| Scenario / evidence | Result | Meaning / proposed optimization (approval required) |
|---|---|---|
| `backend-client.test.cjs`: 24 cold runtime entries enriched | 25 mocked HTTP reads; peak metadata concurrency 6 | Normal happy path is one runtime list plus one metadata GET per flow; concurrency cap works. Repeated matching identity uses cache without another metadata request. |
| `reliability.test.cjs`: one-flow cold Monitoring load | 2 runtime collection GETs + 1 metadata GET; zero MPL GETs | `getIntegrationsWithMetadata` and `getMonitoring` independently load the same collection. Share one load/snapshot per screen; counts also need QA-17 rather than assuming runtime data contains logs. |
| `controllers.test.cjs`: Home mapping of 100 entries | Peak 6 concurrent mapper promises; input order retained | Home cap is implemented; cost still scales per integration. Real SAP waterfall/latency remains manual. |
| `reliability.test.cjs`: 1,000 failed rows | 1,000 localStorage reads/JSON parses | `countUnresolvedFailed` rereads the entire resolved map per row. Read once per aggregation. Existing characterization records cost; replace its expectation when approving optimization. |
| Catalog 2,000 records; query additions 2,000 fields; EDMX 1,000 entities; payload 1 MiB | Correct asserted mapping/preservation/display-threshold behavior in those bounded samples | These are capacity edge tests, not throughput/latency SLAs or proof of tenant-scale performance. |

## Inferred from implementation

- Identity resolution performs sequential candidate/version probes. Configuration fallback can repeat failed direct probes after filtered/package discovery. 401/403/429 or malformed successful responses do not get a distinct fail-fast strategy. Cache-free identity checks occur again for Save and Deploy; backend performs runtime listing inside identity resolution, and Deploy resolves again after configuration updates.
- Backend creates an httpx AsyncClient per call rather than reusing a connection pool. OAuth caches valid tokens but has no lock/single-flight refresh; simultaneous cold calls can each request a token. The cache expiry test verifies the 60-second refresh margin, not concurrent refresh behavior.
- Catalog metadata enrichment is bounded at six. Background merging linearly searches the current catalog per completed item and repeatedly prepares/groups/sorts it. Home fetches logs for every flow; Monitoring system Detail uses unbounded `Promise.all` for both logs and payloads per selected integration.
- MPL queries are capped at `$top=50`, with no next-page traversal. Catalog does not consume OData `__next`. UI table `growing` only controls rendered rows; it cannot recover unrequested backend pages. Large-history unresolved counts and latest/aggregate data may be incomplete.
- Payload receiver buffers request bytes, decoded text and re-encoded bytes. Download and preview lookup load full DB text even for download-only entries. `list_payloads` issues `SELECT *` then removes payload in Python, transferring full bodies from PostgreSQL unnecessarily. Every operation prunes expired rows and opens separate connections; startup DDL is lazy with a process-global flag and no concurrency lock. `expires_at` lacks a dedicated index. No DB query plan or execution was measured.
- Design-time cache persists without expiry or tenant namespace; key includes runtime ID/version/designTimeId, but not sender/receiver metadata change or tenant. EDMX options are keyed only by resource path and retain entityTypes for the uploaded document; comments claiming only reduced choices/five levels are not sufficient proof of bounded memory.
- Most controllers attach route handlers in init without detaching on exit. Monitoring timer stops on exit, not necessarily when UI5 caches the view and navigates elsewhere. Repeated `onToggleAutoRefresh(true)` can overwrite the tracked timer handle. Dialog/FileReader and Fragment promises may outlive controls; several branches lack destroyed-view guards.

Proposed work: first fix correctness/credential issues, then share per-screen runtime data, prune duplicate identity calls without inventing fallbacks, bound system-detail concurrency, read review map once, select summary-only SQL columns, and design ingestion/retention limits. Each changes production behavior/performance and awaits approval.

## Static UI and accessibility (INFERRED)

XML files are well-formed and declared route targets exist; UI5 build passes. This does not verify control metadata/property support, bindings, rendering or keyboard behavior.

Positive indicators: FlexBox/HBox wrapping, catalog and Monitoring Detail table popins, growing catalog/log tables, semantic Buttons/ObjectStatus, tooltip text on many icon actions, busy bindings, password-type secure parameter Input, and read-only TextArea payload display rather than HTML injection.

Risks to inspect in BAS:

- Home declares approximately 76rem of fixed table columns; only timestamp uses a Tablet popin. Other small-screen table columns may overflow. Its 22rem scroll region can compound scrolling.
- Parameter cells vary 25%/33.333%/50%/100% with 16–20rem minimum widths. At tablet sizes the minimum plus margins can exceed available width. CSS reduces cells at 700px, but inner timer fields keep fixed widths (14–28rem). Long names/values need actual viewport checks.
- Payload dialog requests 70rem × 42rem, with 34rem TextArea; platform clamping is not visually verified. Immediate-run nested selectors and review dialogs need keyboard/focus/scroll checks.
- Parameter Labels do not provide explicit `labelFor`; timer subcontrols have incomplete read-only propagation. Presence of nearby text is not proof of accessibility association. Several generated field-tree rows use click handlers; keyboard equivalence needs inspection.
- Plain parameter Inputs are single-line and parameter events use `liveChange`; actual UI5 value/model update timing needs browser verification for dirty-state behavior.
- Hardcoded error/toast strings include upstream bodies in some branches and many generated UI strings are not i18n keys. Full raw errors may confuse HR/admin users; changing messaging requires approval.
- There is a `notFound` target but no manifest bypassed-route configuration. Invalid hash routing behavior is unverified.

## Security/input robustness evidence and limits

Verified locally: JSON/multipart serialization preserves script-like text rather than executing it; apostrophe escaping and query URL handling have tests; payload SQL uses bound parameters; path-like filenames are metadata rather than filesystem paths; CORS permits configured origin and omits permission for another origin; no `.env` or backend credential file is tracked. Test setup does not load existing backend `.env` or use its credentials.

Not an assurance of secure deployment: no application authentication enforcement, arbitrary immediate-run token forwarding (QA-13), unsafe attachment header input (QA-18/19), media-type acceptance, unbounded ingestion and local review/cache trust are material risks. Build-time dependencies were not audited for known vulnerabilities or license compliance; that would be a separate dependency-security audit. No attack/probe against SAP or another running service was performed.
