# Payload ownership migration

For an existing database, stop writes, take the platform's database backup, and
run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/migrations/001_payload_ownership.sql`.
The SQL is transactional and repeatable. It does not backfill or delete records.
Both trusted ownership columns remain NULL for legacy records, which the new
tenant-qualified queries exclude. Do not assign them based on submitted JSON,
integration names, or an assumed customer. Any later provenance backfill requires
independent evidence identifying both the owning tenant and ingestion client.

For a fresh database, the application creates the full table. First-access storage
initialization checks for the ownership columns and will fail on an old schema
until this explicit migration has been applied. There is no automatic destructive
down-migration. Returning to the checkpoint code leaves these additive columns
intact but also returns to its old, unprotected access model: isolate the service
before reverting application code.

Live PostgreSQL validation is required: apply twice, insert two tenants, verify
foreign-ID reads return no row, verify NULL-provenance records are inaccessible,
and verify capture, expiry and filename behavior. Mocked SQL tests do not replace
this database check.

Legacy NULL-provenance rows are excluded from tenant-scoped expiry cleanup as well.
Manage their retention through a separately authorized database maintenance job;
this migration deliberately does not delete or assign ownership to them.
