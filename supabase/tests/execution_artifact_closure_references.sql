begin;
\ir support/execution_adopted_result_setup.sql
create function pg_temp.expect_true(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end $$;
-- Three independent origins: observation, observation definition, adopted hypothesis definition.
do $$declare source_a uuid;source_b uuid;source_c uuid;def_b uuid;def_c uuid;obs uuid;dims jsonb;version uuid:=gen_random_uuid();closure jsonb;req jsonb;
begin
 source_a:=pg_temp.source_version('closure-observation');source_b:=pg_temp.source_version('closure-observation-definition');source_c:=pg_temp.source_version('closure-hypothesis-definition');
 def_b:=public.record_definition_version_v1(current_setting('test.adoption.dossier')::uuid,'financials.net_debt','reported','Synthetic observed definition',source_b,'{"page":1}',null,0,gen_random_uuid());
 def_c:=public.record_definition_version_v1(current_setting('test.adoption.dossier')::uuid,'financials.net_debt','reported','Synthetic alternative definition',source_c,'{"page":1}',null,0,gen_random_uuid());
 dims:=current_setting('test.adoption.dimensions')::jsonb||jsonb_build_object('definitionVersionId',def_b);
 obs:=public.record_observation_v1(jsonb_build_object('requestId',gen_random_uuid(),'dossierId',current_setting('test.adoption.dossier'),'fieldPath','financials.net_debt','dimensions',dims,'value',jsonb_build_object('type','number','value','300'),'sourceVersionId',source_a,'anchor',jsonb_build_object('page',1),'supersedesId',null));
 perform public.propose_assumption_revision_v1(jsonb_build_object('requestId',version,'workId','a11b0000-0000-4000-9000-000000000002','purpose','capital structure decision','contextKey','synthetic-three-origins','expectedVersionId',null,'reason','Synthetic interpretation','referenceObservationId',obs,'fieldPath','financials.net_debt','dimensions',dims||jsonb_build_object('definitionVersionId',def_c),'value',jsonb_build_object('type','number','value','301')));
 -- Same source version, a second license used by the direct pin; neither license may be collapsed.
 perform private.set_source_rights_v1(source_a,1,array['read','process','store','derive','export'],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('a',64));
 req:=pg_temp.commit_adopted('a4171000-0000-4000-9000-000000000022',version,'{}',jsonb_build_array(jsonb_build_object('resourceId','a11b0000-0000-4000-9000-000000000003','sourceVersionId',source_a,'contentHash',(select declared_sha256 from public.source_versions where id=source_a),'rightsRevision','2')));
 closure:=private.execution_result_source_closure_v1('a11b0000-0000-4000-9000-000000000001','a4171000-0000-4000-9000-000000000022');
 perform pg_temp.expect_true(jsonb_array_length(closure->'sources')=4,'three origins plus second license all preserved');
 perform pg_temp.expect_true((select jsonb_array_length(manifest->'sources')=4 from public.artifact_revisions where id=pg_temp.revision_of('a4171000-0000-4000-9000-000000000022')),'producer preserves every version/license pair');
 perform private.set_source_rights_v1(source_b,1,array['process','store','derive','export'],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('b',64));
 perform pg_temp.expect_true(private.read_artifact_revision_v1(pg_temp.revision_of('a4171000-0000-4000-9000-000000000022'))#>>'{restriction,kind}'='source_rights','observation definition exclusive source revokes result');
end $$;
-- A standalone observation outside the adopted base still carries its dossier and definition.
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb);
do $$declare sv uuid;def uuid;obs uuid;dims jsonb;closure jsonb;
begin
 sv:=pg_temp.source_version('closure-standalone');
 def:=public.record_definition_version_v1(current_setting('test.adoption.dossier')::uuid,'financials.net_debt','reported','Synthetic standalone definition',sv,'{"page":2}',null,0,gen_random_uuid());
 dims:=current_setting('test.adoption.dimensions')::jsonb||jsonb_build_object('definitionVersionId',def);
 obs:=public.record_observation_v1(jsonb_build_object('requestId',gen_random_uuid(),'dossierId',current_setting('test.adoption.dossier'),'fieldPath','financials.net_debt','dimensions',dims,'value',jsonb_build_object('type','number','value','302'),'sourceVersionId',sv,'anchor',jsonb_build_object('page',2),'supersedesId',null));
 perform pg_temp.commit_adopted('a4171000-0000-4000-9000-000000000032','a9990000-0000-4000-9000-000000000003',jsonb_build_object('observationId',obs));
 closure:=private.execution_result_source_closure_v1('a11b0000-0000-4000-9000-000000000001','a4171000-0000-4000-9000-000000000032');
 perform pg_temp.expect_true(jsonb_array_length(closure->'sources')=2,'standalone snapshot reference contributes source');
 perform private.set_source_rights_v1(sv,1,array['process','store','derive','export'],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('b',64));
 perform pg_temp.expect_true(private.read_work_execution_v1('a4171000-0000-4000-9000-000000000032')#>>'{result,withheld}'='inputs_not_current','standalone source revocation reaches raw result');
 perform pg_temp.expect_true(private.execution_snapshot_reference_closure_v1('a11b0000-0000-4000-9000-000000000001',jsonb_build_object('observationId',gen_random_uuid()),'[]') is null,'unresolved snapshot reference denies closure');
end $$;
-- A broader current license never replaces an expired fixed license.
do $$declare sv uuid;pin uuid;closure jsonb;
begin
 sv:=pg_temp.source_version('closure-fixed-expiry');
 perform private.set_source_rights_v1(sv,1,array['read','process','store','derive','export'],array['analysis','retrieval'],clock_timestamp()+interval '2 seconds',null,gen_random_uuid(),repeat('e',64));
 select id into pin from private.source_rights_versions where source_version_id=sv and revision=2;
 closure:=jsonb_build_object('state','closed','resources',jsonb_build_array('a11b0000-0000-4000-9000-000000000002'),'sources',jsonb_build_array(jsonb_build_object('sourceVersionId',sv,'rightsVersionId',pin,'declaredSha256',(select declared_sha256 from public.source_versions where id=sv))));
 perform private.set_source_rights_v1(sv,2,array['read','process','store','derive','export'],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('f',64));
 perform pg_sleep(2.1);
 perform pg_temp.expect_true(not private.execution_closure_read_allowed_v1('a11b0000-0000-4000-9000-000000000001',closure,auth.uid()),'expired fixed license denied despite broad current license');
end $$;
select 'execution_artifact_closure_references: PASS' result;
rollback;
