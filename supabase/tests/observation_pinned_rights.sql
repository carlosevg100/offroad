-- A widened current license cannot erase the expiry fixed on an existing contribution.
begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare d uuid; v uuid; o uuid;
begin
 select id into strict d from public.dossiers where resource_id='a11b0000-0000-4000-9000-000000000003';
 perform public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',0,array['read','process','store','derive'],array['analysis'],clock_timestamp()+interval '2 seconds',null,gen_random_uuid(),repeat('a',64));
 v:=public.record_definition_version_v1(d,'synthetic_pinned_metric','contractual','Synthetic expiring contract','a11b0000-0000-4000-9000-000000000004','{"page":1}',null,0,gen_random_uuid());
 o:=public.record_observation_v1(jsonb_build_object('requestId',gen_random_uuid(),'dossierId',d,'fieldPath','synthetic.pinned_metric','dimensions',jsonb_build_object('entityId',null,'perimeter',null,'periodStart',null,'periodEnd',null,'currency','BRL','unit','currency','scale','1','scenario',null,'definitionVersionId',v),'value','{"type":"number","value":"10"}'::jsonb,'sourceVersionId','a11b0000-0000-4000-9000-000000000004','anchor','{"page":1}'::jsonb,'supersedesId',null));
 if not exists(select 1 from public.observations where id=o) then raise exception 'unexpired observation unavailable'; end if;
 perform public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',1,array['read','process','store','derive'],array['analysis'],null,null,gen_random_uuid(),repeat('b',64));
 perform pg_sleep(2.1);
 if not exists(select 1 from public.source_versions where id='a11b0000-0000-4000-9000-000000000004') then raise exception 'current widened source should remain readable'; end if;
 if exists(select 1 from public.observations where id=o) or exists(select 1 from public.definition_versions where id=v) or exists(select 1 from public.metric_definitions where metric_key='synthetic_pinned_metric') then raise exception 'widened license erased pinned restriction'; end if;
end $$;
reset role;
select 'observation_pinned_rights' as test,'PASS' as result;
rollback;
