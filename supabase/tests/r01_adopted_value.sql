begin;
\ir support/contextual_adoption_setup.sql
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.propose_assumption_revision_v1(jsonb_build_object(
 'requestId','a9990000-0000-4000-9000-000000000083','workId','a11b0000-0000-4000-9000-000000000002',
 'purpose','receivables underwriting','contextKey','r01:'||repeat('a',64),'expectedVersionId',null,
 'reason','Synthetic explicitly adopted facility input','fieldPath','/structure/requestedFacility',
 'dimensions',current_setting('test.adoption.dimensions')::jsonb,'value','{"type":"number","value":"300"}'::jsonb,'referenceObservationId',null));
reset role;
create temporary table r01_adoption_fixture as select a.id as decision,v.id as version,a.asserted_value
from public.adoption_decisions a join private.assumption_version_items i on i.organization_id=a.organization_id and i.decision_id=a.id
join public.assumption_versions v on v.organization_id=i.organization_id and v.id=i.version_id
where v.id='a9990000-0000-4000-9000-000000000083';
create function pg_temp.r01_adoption_probe(dataset text default repeat('a',64),path text default '/structure/requestedFacility',
 version uuid default 'a9990000-0000-4000-9000-000000000083',subject uuid default 'a11b0000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select private.r01_adopted_value_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002',dataset,version,
 (select decision from r01_adoption_fixture),path,subject);
$$;
create function pg_temp.r01_adoption_denied(label text,command text) returns void language plpgsql as $$begin
 begin execute command;exception when insufficient_privilege then raise notice 'PASS: %',label;return;end;
 raise exception 'Missing adoption denial: %',label;
end $$;
do $$declare result jsonb;begin
 result:=pg_temp.r01_adoption_probe();
 if result->>'sourceClass' is distinct from 'project_context' or result->'value' is distinct from '"300"'::jsonb
 or result->>'path' is distinct from '/structure/requestedFacility' or result->>'anchor' is distinct from 'assumption_version:a9990000-0000-4000-9000-000000000083'
 then raise exception 'typed adoption was not preserved';end if;
 raise notice 'PASS: exact typed adoption preserves its value and immutable version';
end $$;
select pg_temp.r01_adoption_denied('other dataset cannot borrow adoption',$q$select pg_temp.r01_adoption_probe(dataset=>repeat('b',64))$q$);
select pg_temp.r01_adoption_denied('other field cannot borrow adoption',$q$select pg_temp.r01_adoption_probe(path=>'/structure/advanceRate')$q$);
select pg_temp.r01_adoption_denied('decision not in pinned version denied',$q$select pg_temp.r01_adoption_probe(version=>gen_random_uuid())$q$);
select pg_temp.r01_adoption_denied('another subject cannot borrow adoption',$q$select pg_temp.r01_adoption_probe(subject=>gen_random_uuid())$q$);
select private.revoke_resource_access_v1('a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000001');
select pg_temp.r01_adoption_denied('underlying dossier revocation denies adoption',$q$select pg_temp.r01_adoption_probe()$q$);
select 'r01_adopted_value: PASS' result;
rollback;
