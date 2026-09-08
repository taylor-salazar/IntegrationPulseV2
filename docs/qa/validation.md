# Validation record

Final local audit validation: **2026-09-08**, Windows PowerShell; Node **24.13.1**, Python **3.14.6**, FastAPI **0.139.0**, httpx **0.28.1**, Pydantic **2.13.4**, OpenUI5 **1.120.20**.

| Command/check | Result |
|---|---|
| `npm.cmd test` | Exit 0. **96 JavaScript cases:** 80 ordinary assertions pass, 15 confirmed-defect assertion reproductions and 1 provisional QA-22 contract reproduction explicitly accounted for. **31 Python cases:** 22 ordinary tests pass, 9 expected failures. **127 total cases; 102 ordinary passing cases; 25 preserved reproductions.** Parameterized subcases are not inflated into this count. |
| `npm.cmd run build` | Exit 0; UI5 minification and Component preload generation completed. Build was run initially and again after test additions. |
| `python -m py_compile backend\models.py backend\btp_client.py backend\routers\integrations.py` | Exit 0. |
| JavaScript strict reproduction with `QA_VERIFY_FIXES=1` and pattern `known defect\|provisional contract` | Exit 1 as intended: **16 failed behavior assertions**, no unrelated runtime failure. |
| `python tests/backend/verify_defects.py` | Exit 1 as intended: **9 failed behavior assertions**, no errors. |
| `git diff --check` / staged whitespace review | No whitespace errors. Windows Git emits LF→CRLF informational warnings for new text files. |
| Production diff (`webapp/`, `backend/`) | Empty. Production code/configuration, SAP semantics and shipped fixtures unchanged. |
| Test files and artifacts | Tests use in-memory/synthetic data and intercepted transports. No test logs, credentials, tunnel files, PIDs, build output or unrelated study notes staged. |

The local FastAPI/Starlette install emits a deprecation warning about TestClient's httpx integration. It is not suppressed and did not fail validation. No production dependencies were changed to silence it. The added CI workflow specifies Node 22 / Python 3.12; **that runner combination has not been executed locally or confirmed on GitHub**. Existing backend dependency ranges remain unpinned, so future dependency resolution is a reproducibility risk.

Findings: **21 confirmed local defects + 1 provisional product-contract question**. There are more reproduction cases than finding IDs because query encoding, navigation and duplicate submissions each have multiple scenarios. Normal-suite success explicitly does not mean these defects are fixed or release approved.

Git delivery branch: `codex/release-readiness-audit`. Commit hash and push outcome are reported in the task's final response; this avoids a self-referential commit hash in the committed document. No merge or deployment is part of this audit.
