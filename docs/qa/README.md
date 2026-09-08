# Integration Pulse release QA

Updated 2026-09-08 after approval and implementation. **QA-01 through QA-22 are fixed and protected by ordinary passing regression tests.** Local confidence is high for exercised behavior. Release sign-off still requires the [manual BAS/SAP plan](manual-bas-sap.md); SAP, BAS, browser rendering and PostgreSQL were not exercised live.

Read the [approved implementation](approved-fixes.md), [validation results](validation.md), [coverage matrix](coverage-matrix.md), [historical defect evidence](defects.md), and [performance/UI review](performance-ui.md).

## Evidence and test setup

**VERIFIED:** actual JavaScript service/controller methods with UI5 boundaries replaced; real FastAPI routes, OAuth/BTP clients and models with intercepted HTTP; payload routes with isolated storage and separate SQL construction tests. Unexpected backend HTTP is denied, dotenv is disabled, and credentials/settings are synthetic.

**INFERRED:** browser layout/accessibility, deployment authorization, remaining lifecycle risks, database performance and tenant-scale behavior. Historical source-repo files are outside the active app's suite.

**MANUAL BAS/SAP VALIDATION REQUIRED:** destination setup, identity/version, known artifact lookup error, actual parameters, DEV Save/Deploy/Run, CPI headers, real MPL pagination, payload storage, UI interactions and ingress authorization.

Use Node 22+ and Python with backend/requirements.txt installed. Tests use Node's built-in runner and Python unittest. The XML test adapter explicitly declares the already locked @xmldom/xmldom 0.8.10 dev dependency; production uses browser DOMParser.

~~~powershell
npm.cmd test
npm.cmd run build
python -m py_compile backend\models.py backend\btp_client.py backend\routers\integrations.py
~~~

Run only the original defect assertions with:

~~~powershell
node --test --test-name-pattern='QA-.*regression' tests/js/*.test.cjs
python tests/backend/verify_defects.py
~~~

All assertions now expect correct behavior. No expected failures, skipped defects or special environment switches remain. Additional boundaries are in tests/js/approved-fixes.test.cjs and tests/backend/test_approved_fixes.py.

## Known SAP issue

Local tests establish encoding, request construction, candidate fallback and rejection when no artifact resolves. Malformed responses fail explicitly; the proxy no longer deploys a guessed Active identity. The separate message-log filter double-encoding defect is fixed.

This does not establish the live cause of **Integration design time artifact not found**. Candidate precedence, crossed ID/version candidates and first plausible matches remain assumptions. Compare the exact failed URL/candidates with a working tenant request as described in M05. No speculative extra lookup fallback was added.

## Delivery

Fixes, tests and documentation are delivered on codex/release-readiness-audit. Logs, PIDs, tunnels, credentials, builds and unrelated study notes are excluded. The final response records commit/push outcome. No merge or deployment is included.
