-- The historical staging rehearsal is no longer an admissible prospective producer:
-- it inserts unbound S11 CPA rows. Prove its exact native guard denial twice,
-- complete rollback and restored triggers; do not manufacture historical native receipts.
\set rehearsal `cat scripts/staging/artifact-backfill-rehearsal.sql`
begin;
create temporary table artifact_backfill_rehearsal_text(body text not null) on commit drop;
insert into artifact_backfill_rehearsal_text values(:'rehearsal');
do $$
declare body text;outcome text;state text;before jsonb:='{}';after jsonb:='{}';t regclass;n bigint;run integer;
begin
 select x.body into strict body from artifact_backfill_rehearsal_text x;
 if position('artifact_backfill_rehearsal_passed:' in body)=0 or body ~* '(^|\n)\s*(begin|commit|rollback|start transaction)\s*;' or body ~ '(^|\n)\s*\\[a-z]' then
  raise exception 'the rehearsal text must be one self-contained statement without psql meta-commands or transaction control';
 end if;
 for t in select c.oid::regclass from pg_class c join pg_namespace s on s.oid=c.relnamespace
  where c.relkind in ('r','p') and (s.nspname in ('public','private') or c.oid='auth.users'::regclass) order by 1 loop
  execute format('select count(*) from %s',t) into n;before:=before||jsonb_build_object(t::text,n);
 end loop;
 for run in 1..2 loop
  outcome:=null;state:=null;
  begin execute body; exception when others then outcome:=sqlerrm;state:=sqlstate; end;
  if state is distinct from '42501' or outcome is distinct from 'capital_s11_native_commit_required' then
   raise exception 'retired raw rehearsal run % did not fail with its native guard: %',run,coalesce(outcome,'it raised nothing');
  end if;
  raise notice 'PASS: retired raw rehearsal run % denied: %',run,outcome;
 end loop;
 for t in select c.oid::regclass from pg_class c join pg_namespace s on s.oid=c.relnamespace
  where c.relkind in ('r','p') and (s.nspname in ('public','private') or c.oid='auth.users'::regclass) order by 1 loop
  execute format('select count(*) from %s',t) into n;after:=after||jsonb_build_object(t::text,n);
 end loop;
 if after<>before then
  raise exception 'staging rehearsal left rows behind: %',(select jsonb_object_agg(k,after->k) from jsonb_object_keys(after) k where after->k is distinct from before->k);
 end if;
 if (select count(*) from pg_trigger g where g.tgname='artifact_revision_projection' and g.tgenabled='O'
  and g.tgrelid in ('public.capital_project_artifacts'::regclass,'public.case_artifact_manifests'::regclass,'private.institutional_model_results'::regclass,'public.deal_state_objects'::regclass))<>4 then
  raise exception 'staging rehearsal left a projection trigger disabled';
 end if;
 raise notice 'PASS: staging rehearsal leaves every table as it found it (% tables) and the four projection triggers enabled',(select count(*) from jsonb_object_keys(before));
end $$;
rollback;
