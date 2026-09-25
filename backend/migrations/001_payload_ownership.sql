-- Run explicitly against the existing PostgreSQL database before Step 2A.
-- Never infer tenant ownership from integration_id or an ingestion body.
BEGIN;
ALTER TABLE integration_payloads ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE integration_payloads ADD COLUMN IF NOT EXISTS ingested_by_client_id TEXT;
-- NULL legacy ownership is deliberately quarantined by every read predicate.
-- A separately reviewed provenance backfill can populate both fields later.
CREATE INDEX IF NOT EXISTS idx_integration_payloads_tenant_lookup
    ON integration_payloads (tenant_id, integration_id, created_at DESC);
COMMIT;
