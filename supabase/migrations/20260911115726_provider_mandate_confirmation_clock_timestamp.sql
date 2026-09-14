-- Reconciliation of an applied migration whose file never reached main.
--
-- Applied to production as version 20260911115726 and to staging as 20260911115723
-- (name: provider_mandate_confirmation_clock_timestamp), both on 11 September 2026.
-- The SQL below is the exact statement recovered from
-- supabase_migrations.schema_migrations.statements in both environments. Re-running it
-- is idempotent (it only sets a column default).
--
-- Two confirmation events written inside one transaction shared the same `now()`, so the
-- "last confirmation" of a mandate was decided by a random uuid tiebreaker. The event's timestamp
-- now records the instant the row was written (`clock_timestamp()`), which is strictly increasing
-- within a transaction, so the newest event is always the last one. Nothing else changes: the
-- mandate copies the event's timestamp exactly as before.
alter table public.provider_mandate_confirmations
  alter column confirmed_at set default clock_timestamp();
