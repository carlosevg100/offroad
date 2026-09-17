-- Synthetic, isolated SQL fixture. Caller owns transaction and rollback (or disposable local CI).
\ir source_rights_fixture.sql
\ir legacy_workspace_capabilities.sql
\ir legacy_resource_fixture.sql
select set_config('test.adoption.dossier',(select id::text from public.dossiers where resource_id='a11b0000-0000-4000-9000-000000000003'),true);
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare d uuid:=current_setting('test.adoption.dossier')::uuid; e uuid; v uuid; o uuid; dims jsonb; payload jsonb;
begin
 e:=public.review_dossier_identity_v1(d,null,'Synthetic adoption entity','BR:CNPJ','00000000000272','Synthetic contextual adoption identity');
 perform public.link_dossier_entity_v1(d,e,'subject','{"basis":"standalone"}','2020-01-01',null,'Synthetic explicit perimeter',gen_random_uuid());
 v:=public.record_definition_version_v1(d,'financials.net_debt','reported','Synthetic net debt definition.',null,null,null,0,'a9990000-0000-4000-9000-000000000001');
 dims:=jsonb_build_object('entityId',e,'perimeter','standalone','periodStart','2025-01-01','periodEnd','2025-12-31','currency','BRL','unit','currency','scale','1','scenario','actual','definitionVersionId',v);
 payload:=jsonb_build_object('requestId','a9990000-0000-4000-9000-000000000002','dossierId',d,'fieldPath','financials.net_debt','dimensions',dims,'value',jsonb_build_object('type','number','value','300'),'sourceVersionId','a11b0000-0000-4000-9000-000000000004','anchor',jsonb_build_object('page',1,'row','net debt'),'supersedesId',null);
 o:=public.record_observation_v1(payload);
 perform set_config('test.adoption.observation',o::text,true);
 perform set_config('test.adoption.dimensions',dims::text,true);
 perform set_config('test.adoption.payload',jsonb_build_object('requestId','a9990000-0000-4000-9000-000000000003','workId','a11b0000-0000-4000-9000-000000000002','purpose','capital structure decision','contextKey','actual-2025','expectedVersionId',null,'reason','Synthetic explicit source selection','observationId',o)::text,true);
 o:=public.record_observation_v1(payload||jsonb_build_object('requestId','a9990000-0000-4000-9000-000000000004','dimensions',dims||'{"scenario":"budget"}','value',jsonb_build_object('type','number','value','450')));
 perform set_config('test.adoption.budget',o::text,true);
end $$;
reset role;
