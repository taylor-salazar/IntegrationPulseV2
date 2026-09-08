# Validation record

Approved-fix validation: **2026-09-08**, Windows PowerShell; Node **24.13.1**, Python **3.14.6**, FastAPI **0.139.0**, httpx **0.28.1**, Pydantic **2.13.4**, OpenUI5 **1.120.20**.

| Command/check | Result |
|---|---|
| npm.cmd test | Exit 0: **105 JavaScript + 38 Python = 143 passing tests**, no expected failures/skips/provisional assertions. Parameterized subcases are not inflated into the total. |
| npm.cmd run build | Exit 0; UI5 minification and Component preload complete. |
| Required py_compile plus all changed Python modules | Exit 0. |
| git diff --check / staged whitespace review | No whitespace errors; LF→CRLF notices are informational. |
| Scope review | QA-01–QA-22 implemented; defect markers converted to ordinary assertions; 16 additional boundary cases. Unrelated study notes, credentials, logs, PIDs, tunnels and builds excluded. |

Original audit commit 14ec739 had 127 cases, including 25 preserved failing assertions across 21 confirmed findings and provisional QA-22. That green result explicitly accounted for known failures. Current tests execute those intended assertions normally and pass. No assertion was removed to hide a defect. Proxy route expectations/performance counts changed with the approved behavior. Invalid-response tests expect typed errors. A monitoring fixture timestamp is captured before the snapshot so it does not accidentally become a future event.

New tests cover endpoint trust before OAuth, malformed identity blocking, structured gateway errors, reserved/slash identities, inclusive UTC counts/pagination/deduplication, invalid/repeating pages, bounded concurrency, encoded query options, cron fields, stale Save/Deploy/payload completion, retry guards and XML identities.

Local Starlette emits an unsuppressed TestClient/httpx deprecation warning; validation passes. No production dependency changed to silence it. XML test tooling declares the already locked @xmldom/xmldom 0.8.10 dev dependency. CI specifies Node 22/Python 3.12; that combination is not locally executed or confirmed on GitHub. Existing Python dependency ranges remain unpinned.

All HTTP is synthetic/intercepted. SAP, BAS, browser rendering and PostgreSQL remain unverified. Passing tests are not release sign-off; follow the [manual plan](manual-bas-sap.md) and [implementation notes](approved-fixes.md).

Delivery branch: codex/release-readiness-audit. The final response records commit/push outcome. No merge/deployment is included.
