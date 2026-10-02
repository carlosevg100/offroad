-- Dedicated disposable local database only. The baseline/normal fixture remain
-- rollback-only. This prepares genuine committed state for two human sessions.
do $$begin if current_database()not like 'offroad_s11_revision_race_%'then raise exception 's11_race_disposable_database_required';end if;end $$;
\ir capital_s11_native_revision_complete.sql
rollback to s11_second_return;
commit;
