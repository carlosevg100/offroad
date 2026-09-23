-- Stage 17: serialize R01 release reads and writes, including the first pause.
-- Existing grants remain unchanged; no R01 execution activation.
set search_path='';

create function private.guard_receivables_release_write_v1() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare relevant boolean:=true;
begin
 -- Other capabilities retain their existing publication concurrency protocol.
 if tg_table_name='platform_capability_releases' and tg_level='ROW' then
  if tg_op='INSERT' then relevant:=new.capability_key='finance.receivables-released-analysis';
  elsif tg_op='DELETE' then relevant:=old.capability_key='finance.receivables-released-analysis';
  else relevant:=old.capability_key='finance.receivables-released-analysis' or new.capability_key='finance.receivables-released-analysis';end if;
  if not relevant then
   if tg_op='DELETE' then return old;else return new;end if;
  end if;
 end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'receivables_release_isolation_unsupported' using errcode='25000';
 end if;
 -- Never wait on this advisory after a tuple/policy/session lock. Retry the WHOLE
 -- transaction on 40001; a conflicting pause has not been committed or applied.
 if not pg_try_advisory_xact_lock(hashtextextended('r01-release-authority:v1',0)) then
  raise exception 'receivables_release_concurrent_change' using errcode='40001';
 end if;
 if tg_level='STATEMENT' then return null;end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function private.guard_receivables_release_write_v1() from public,anon,authenticated,service_role;

create trigger receivables_release_pause_write_guard
 before insert or update or delete or truncate on private.receivables_analytical_release_grants
 for each statement execute function private.guard_receivables_release_write_v1();
create trigger receivables_release_capability_write_guard
 before insert or update or delete on private.platform_capability_releases
 for each row execute function private.guard_receivables_release_write_v1();
create trigger receivables_release_capability_truncate_guard
 before truncate on private.platform_capability_releases
 for each statement execute function private.guard_receivables_release_write_v1();

create or replace function private.receivables_analytical_release_enabled(p_organization_id uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare enabled boolean;
begin
 if p_organization_id is null then return false;end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'receivables_release_isolation_unsupported' using errcode='25000';
 end if;
 if not pg_try_advisory_xact_lock_shared(hashtextextended('r01-release-authority:v1',0)) then
  raise exception 'receivables_release_concurrent_change' using errcode='40001';
 end if;
 -- Separate VOLATILE query: fresh READ COMMITTED snapshot AFTER acquiring the gate.
 -- A row lock on a missing organization pause would not protect its first INSERT.
 select exists(select 1 from private.platform_capability_releases r
  where r.capability_key='finance.receivables-released-analysis' and r.released and r.exposure='universal')
 and not exists(select 1 from private.receivables_analytical_release_grants p
  where p.organization_id=p_organization_id and not p.enabled) into enabled;
 return enabled;
end $$;
