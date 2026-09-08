# Approved fixes — 2026-09-08

The user approved the proposed fixes after the audit. This implements all 21 confirmed findings and adopts lossless query preservation for QA-22. The defect register retains original reproduction evidence and historical line numbers.

| Findings | Implemented behavior | Regression evidence |
|---|---|---|
| QA-01/02/20 | Failed/empty enrichment retains runtime source/target; collection and identity responses require valid envelopes; nullable mock source/target are normalized. | backend-client.test.cjs; test_contracts.py; test_approved_fixes.py |
| QA-03/11 | Cron edits retain untouched fields, step divisors, weekdays and timezone absence; malformed schedules require explicit replacement. Read-only timer handlers do not write values; Reset refreshes flags. | controllers.test.cjs; approved-fixes.test.cjs |
| QA-04/05/22 | Decode/merge/encode query values once; retain every baseline option, duplicate unknown pairs and bare flags. Prototype-named fields survive. No change sends no query override. | controllers.test.cjs; backend-client.test.cjs; reliability.test.cjs; approved-fixes.test.cjs |
| QA-06/07/08 | Detail captures identity/generation and rejects stale responses. Save/Deploy acknowledge submitted values and retain later edits. Save/Deploy/Run share per-artifact in-flight guards. Confirmation/card Deploy guards prevent duplicates. Payloads/fragments and EDMX uploads guard stale completion. | controllers.test.cjs; reliability.test.cjs; approved-fixes.test.cjs |
| QA-09 | DOMParser validates XML before cache replacement; rejects malformed XML, DTD/entity declarations and duplicate identities/properties. Prefixes and escaped attributes work. | controllers.test.cjs; approved-fixes.test.cjs (xmldom adapter; native UI manual) |
| QA-10/17 | SAP/ISO timestamp parsing; dated/paginated 24-hour counts in both live modes; latest-run sorting accepts SAP dates. | controllers.test.cjs; test_contracts.py; both approved-fixes suites |
| QA-12/14 | Log filters receive one URL encoding pass after OData escaping. Unresolved/malformed identity blocks mutation, with no guessed Active fallback. | test_contracts.py; test_approved_fixes.py |
| QA-13 | Runtime endpoint must be on configured HTTPS sender origin. Reject alternate origin/port/scheme, userinfo, fragments, traversal/nested encoding before OAuth. Reject nonprintable/non-ASCII header input with controlled 400. | test_contracts.py; test_approved_fixes.py |
| QA-15 | Timeout → 504; upstream 429/503 → 503; other upstream HTTP/transport failures → 502. Invalid JSON/envelopes/token responses → controlled 502. HTTP mapping omits raw upstream bodies/credentials. | test_contracts.py; test_approved_fixes.py |
| QA-16 | Proxy item/actions use query identity for slash/reserved-suffix IDs. Ordinary legacy routes remain. | backend-client.test.cjs; test_contracts.py; test_approved_fixes.py |
| QA-18/19 | Reject filename controls at ingestion; sanitize old names on download, add ASCII fallback/UTF-8 filename* and nosniff. | test_payloads.py |
| QA-21 | Detail requests payloads for captured integration; explicit error state distinguishes failure from empty; stale lists cannot replace current data. | reliability.test.cjs; approved-fixes.test.cjs |

## Monitoring decisions

The window includes snapshot UTC time minus 24 hours through snapshot time. Each nonempty message ID counts once across pages; rows without IDs count individually. DISCARDED, invalid timestamps and out-of-window rows are excluded. Only FAILED contributes to errors24h.

Both modes cap simultaneous per-flow log reads at six, request up to 1,000 rows/page and traverse next pages. Failed/malformed pages reject the load instead of reporting fabricated zeros. Repeated links fail. Proxy links must match configured API origin/MPL path. Destination tenant links are rebased onto the configured browser destination route with their query; other paths, userinfo and fragments fail.

SAP documents the datetime filter form and UTC interpretation without a timezone suffix in [Cloud Integration query options](https://help.sap.com/docs/cloud-integration/sap-cloud-integration/query-options). Millisecond boundaries are enforced locally after retrieval. Actual destination permissions and pagination remain unverified.

Monitoring shares its runtime snapshot: one-flow cold destination load now uses one runtime GET, one metadata GET and one dated MPL query. Review counting reads/parses storage once for 1,000 failed rows. Payload list SQL fetches summary columns without bodies. These are deterministic operation counts, not latency benchmarks.

## Compatibility and rollout

Proxy uses /api/integrations/by-id?integrationId=... with /configurations, /deploy or /trigger appended to by-id for actions. Monitoring uses /api/monitoring/by-id and /by-id/logs with the same query argument. **Update frontend and backend together for proxy mode.** Legacy ordinary paths remain; the reserved literal by-id must use query identity. UI5 hash routing is separate and remains manual.

Set the existing immediate-run base to the actual HTTPS sender origin when it differs from the management API host. Arbitrary caller-supplied hosts are now rejected. Query builder output percent-encodes non-ASCII values; direct proxy callers must do the same. Verify CPI interprets encoded filters/options correctly in DEV.

## Remaining external work and inferred risks

Execute the existing BAS/SAP checklist, especially M05 identity, M06 cron/controls, M07–M09 DEV mutations, M11–M13 MPL/payloads and M16 authorization. Compare exact-window/multi-page counts against real MPL; verify failed MPL permissions show an error, encoded baseline options survive CPI, Unicode filenames download correctly and navigation/dialog dismissal during requests remains stable.

No live browser, destination, SAP mutation or PostgreSQL execution occurred. The known tenant artifact error is not claimed fixed. Broader inferred architectural work remains: SSO/ingress, ambiguous artifact matches, catalog/history pagination beyond new 24-hour summaries, tenant cache scoping, other controllers' lifecycle behavior, ingestion limits and database retention/index tuning. Those need external evidence/design decisions; this patch implements concrete defect fixes without inventing those contracts.
