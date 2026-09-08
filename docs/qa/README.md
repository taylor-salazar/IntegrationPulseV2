# Integration Pulse release audit

Audit date: 2026-09-08. **Release readiness: not ready for sign-off.** Confidence is high in the reproduced local failures and tested request construction, moderate in overall repository behavior, and unavailable for BAS/SAP/browser/PostgreSQL integration. Production fixes require approval.

Start with [coverage matrix](coverage-matrix.md), [defect register](defects.md), [manual BAS/SAP plan](manual-bas-sap.md), and [performance/UI review](performance-ui.md). The matrix is the audit's coverage source of truth.

## Scope and evidence

**VERIFIED:** real JavaScript services/controller methods loaded unchanged; their UI5 model/control boundaries are test doubles, not a UI5 browser. Real FastAPI routes, Pydantic models, OAuth/BTP clients run against intercepted HTTP. Payload routes use an isolated dictionary storage boundary; separate tests exercise actual SQL construction and row conversion with mocked connections. No test uses tenant credentials, a real destination, a tunnel, or the local running backend. Dotenv is disabled before imports, settings are synthetic, and unexpected backend HTTP is denied. Shared fixtures include realistic runtime/design metadata, SF parameters, EDMX, logs, and sensitive identifiers.

**INFERRED:** browser layout/accessibility, actual routing semantics in UI5, broader lifecycle/authorization exposure, database throughput and tenant-scale performance. No deployed browser, SAP operation or real PostgreSQL execution was performed. `source-repo/integrationpulsetest-main` contains historical UI/mock bootstrap files, not an existing regression suite for the active root app; it was excluded.

**MANUAL BAS/SAP VALIDATION REQUIRED:** app startup/rendering, actual destination identity/version support, known design-time issue, safe DEV Save/Deploy/Run, real metadata/MPL/payload services, storage retention, and deployment authorization.

## Run tests

Use Node 22+ for the new suite (Node 24.13.1 locally) and a Python environment with `backend/requirements.txt` installed (Python 3.14.6 locally). Test tooling adds no npm/Python dependency or second framework. `package.json` changes only add test scripts; lockfile dependencies are unchanged.

```powershell
npm.cmd test
npm.cmd run build
python -m py_compile backend\models.py backend\btp_client.py backend\routers\integrations.py
```

Individual suites:

```powershell
npm.cmd run test:frontend
python -m unittest discover -s tests/backend -p test_*.py -v
```

The normal suite stays green **with explicit known-failure accounting**. A successful command is not a release approval. JavaScript `defect()` executes the intended assertion and requires an AssertionError; a changed outcome fails the test so it cannot silently become an obsolete exception. Python expected failures use unittest conventions; unexpected success requires removing the marker. Once approved fixes land, convert each case to an ordinary regression test.

For raw defect reproduction (expected nonzero exits until fixed):

```powershell
$env:QA_VERIFY_FIXES='1'
node --test --test-name-pattern='known defect|provisional contract' tests/js/*.test.cjs
Remove-Item Env:QA_VERIFY_FIXES
python tests/backend/verify_defects.py
```

QA-22 is a provisional contract assertion. It remains visibly distinguished in the defect register pending a product decision.

## Automated tests added

| Files | Main protection |
|---|---|
| `tests/js/backend-client.test.cjs` | Three modes, runtime-only catalog, SAP URLs/encoding, resolution candidates, batch+Deploy sequence, inner/outer failures, immediate-run headers, real query-to-client chain, payload/log mapping, capped enrichment |
| `tests/js/controllers.test.cjs` | Parameter values/grouping/reset/dirty, additive SF queries, EDMX, schedules, action state/separation, review consistency, catalog/monitoring mapping, known races and transformation failures |
| `tests/js/reliability.test.cjs` | Component initialization, formatters, partial failures, response ordering/destruction, candidate ambiguity evidence, request/storage operation counts, payload load omission |
| `tests/backend/test_contracts.py` | Real routes → BTP/OAuth → mocked HTTP, Pydantic validation, modes, methods/headers/bodies, batch abort, token cache expiry, failure propagation, proxy defects |
| `tests/backend/test_payloads.py` | Raw/wrapped JSON/CSV/XML/text, preview byte threshold, Unicode/empty/large payloads, seven-day timestamps, association IDs/filenames, failures, SQL parameterization, expiry predicates, DSN/configuration |
| `tests/backend/test_static.py` | Manifest routes resolve to well-formed XML files; all shipped fixture files parse |
| `tests/js/helpers.cjs`, `tests/backend/support.py`, `tests/fixtures/*`, `tests/backend/verify_defects.py` | Isolated loaders/models/transports/shared fixtures and explicit defect reproduction |
| `.github/workflows/qa.yml` | New CI job for tests, UI5 build, required Python compilation; CI execution on GitHub not claimed by local validation |

## Known SAP design-time issue

The live `Integration design time artifact not found` failure remains **unresolved**. `DEBUG_HANDOFF.md` describes real observations supplied before this audit. This audit did not reproduce it against SAP.

Local evidence: runtime and design-time IDs/versions map correctly for the realistic happy fixture; sensitive key literals decode once to the original escaped value; runtime-version fallback and missing-match diagnostics execute; catalog lookup stays runtime-only. JavaScript leaves doubled apostrophes literal while Python percent-encodes them, but both decode once to the same OData string. This does **not** establish destination decoding behavior. There is no local evidence justifying removal of all key-literal percent encoding.

Suspicious assumptions: malformed successful metadata/configuration envelopes are treated as valid, identity/version candidates are crossed, candidate precedence differs by mode, multiple plausible matches select first success, and proxy may proceed with an unresolved identity. A separate proxy **message-log filter** double-encoding bug is reproduced; it does not establish why destination Configurations fails. UI5 navigation passes IDs raw; BAS route/hash handling is still unverified. The ASGI slash-path failure is local proof limited to proxy mode.

To resolve the live issue, compare the exact app-generated failed URL and candidate list with the same destination's working URL using the actual design-time ID/version from the tenant. Record runtime ID/name/version/package and active artifact identity. Do not invent additional fallback requests.

## Validation results

Results are finalized in [validation record](validation.md). Strict reproduction intentionally fails and is tracked separately from the ordinary test/build result. No pre-existing tests were removed or weakened. Initial incorrect test assumptions (group ordering and an incomplete `isMock` test double) were corrected; production failures remain preserved.

## Changes and remaining approval

Only `package.json` test scripts, `tests/`, `.github/workflows/qa.yml`, and `docs/qa/` belong to this audit. Production modules and shipped mock fixtures are unchanged. Unrelated study notes, logs, PIDs and tunnel executables are excluded from the commit.

Approve fixes using the IDs and minimal proposals in the defect register. Resolve QA-22's baseline option contract and identity ambiguity/count semantics before dependent implementation. Prioritize credential forwarding, action/identity isolation, schedule/query loss, and misleading monitoring totals before any release sign-off.
