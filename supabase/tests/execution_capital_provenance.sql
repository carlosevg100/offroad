-- Authorization predicate proofs; disposable data, always rolled back.
begin;
\ir support/contextual_adoption_setup.sql
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb);
create temporary table capital_provenance_fixture(c jsonb,p jsonb);
insert into capital_provenance_fixture
select jsonb_build_object('organizationId',v.organization_id,'workId',s.work_id,'purpose',s.purpose,
 'method',jsonb_build_object('methodId','prepare-capital-structure-decision','methodVersion','2026.09.21-v4','manifestHash','2c023cf7b7ec7e35b7f59d363a9b287cb245d3196cd431fc0c2bf1fc937f8478'),
 'inputs',jsonb_build_object('adoptions',(select jsonb_agg(jsonb_build_object('id',i.decision_id,'assumptionVersionId',v.id,'fingerprint',v.content_fingerprint)) from private.assumption_version_items i where i.organization_id=v.organization_id and i.version_id=v.id),'hypotheses','[]'::jsonb,
 'sources',jsonb_build_array(jsonb_build_object('sourceVersionId','a11b0000-0000-4000-9000-000000000004')))),
 jsonb_build_object('schemaVersion','capital-procedure-packet-input.v2','adoptionLinks','[]'::jsonb,
 'decision',jsonb_build_object('envelope',jsonb_build_object('canonical',v.canonical_snapshot,'fingerprint',v.content_fingerprint),'scope',jsonb_build_object('versionId',v.id,'workId',s.work_id,'purpose',s.purpose)))
from public.assumption_versions v join public.assumption_sets s on s.organization_id=v.organization_id and s.id=v.set_id where v.id='a9990000-0000-4000-9000-000000000003';
create function pg_temp.check_capital_provenance(c jsonb,p jsonb,want boolean,label text) returns void language plpgsql as $$begin
 if private.execution_capital_payload_current_v1(c,p,auth.uid()) is distinct from want then raise exception 'capital provenance assertion failed: %',label;end if;
 raise notice 'PASS: %',label;
end $$;
select pg_temp.check_capital_provenance(c,p,true,'persisted exact basis and complete pins accepted') from capital_provenance_fixture;
select pg_temp.check_capital_provenance(jsonb_set(c,'{inputs,adoptions}','[]'),p,false,'omitted decision denied') from capital_provenance_fixture;
select pg_temp.check_capital_provenance(jsonb_set(c,'{inputs,sources}','[]'),p,false,'source inside canonical envelope cannot be omitted') from capital_provenance_fixture;
select pg_temp.check_capital_provenance(c,jsonb_set(p,'{decision,scope,workId}',to_jsonb(gen_random_uuid())),false,'scope from another work denied') from capital_provenance_fixture;
select pg_temp.check_capital_provenance(c,jsonb_set(p,'{decision,scope,purpose}','"another purpose"'),false,'another purpose denied') from capital_provenance_fixture;
select pg_temp.check_capital_provenance(c,jsonb_set(p,'{decision,scope,versionId}',to_jsonb(gen_random_uuid())),false,'scope from another version denied') from capital_provenance_fixture;
do $$declare f capital_provenance_fixture; changed text;begin
 select * into strict f from capital_provenance_fixture;
 changed:=jsonb_set((f.p#>>'{decision,envelope,canonical}')::jsonb,'{entries,0,value,value}','"900"')::text;
 f.p:=jsonb_set(f.p,'{decision,envelope}',jsonb_build_object('canonical',changed,'fingerprint',encode(extensions.digest(changed,'sha256'),'hex')));
 perform pg_temp.check_capital_provenance(f.c,f.p,false,'rehashed invented basis bytes denied');
end $$;
select pg_temp.check_capital_provenance(c,p||jsonb_build_object('anchor',jsonb_build_object('sourceVersionId',gen_random_uuid(),'locator','Synthetic hidden clause')),false,'source hidden in nested anchor denied') from capital_provenance_fixture;
select pg_temp.check_capital_provenance(c,p||jsonb_build_object('recommendation',jsonb_build_object('basisDecisionIds',jsonb_build_array(gen_random_uuid()))),false,'recommendation decision omitted from pins denied') from capital_provenance_fixture;
select pg_temp.check_capital_provenance(c,p||jsonb_build_object('selection',jsonb_build_object('decisionId',null,'definitionVersionId',gen_random_uuid(),'missingReason','Synthetic gap')),false,'missing value does not authorize an unknown definition') from capital_provenance_fixture;
select pg_temp.check_capital_provenance(c,jsonb_set(p,'{adoptionLinks}','[{"origins":[{"calculationFingerprint":"unverified"}]}]'),false,'claimed origin without authoritative receipt denied') from capital_provenance_fixture;
select pg_temp.check_capital_provenance(c,p||jsonb_build_object('sources',jsonb_build_array(jsonb_build_object('document','Synthetic','sourceVersionId',gen_random_uuid(),'observationIds',jsonb_build_array(current_setting('test.adoption.observation'))))),false,'observation attached to another source denied') from capital_provenance_fixture;
-- A newer broad rights revision cannot replace the rights fixed in an older observation
-- or contractual definition. These references deliberately do not belong to any adoption.
do $$declare dossier uuid:=current_setting('test.adoption.dossier')::uuid;definition uuid;observation uuid;begin
 perform private.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',1,array['read','process','store','derive','export'],array['analysis','retrieval','export'],clock_timestamp()+interval '1 second',null,gen_random_uuid(),repeat('c',64));
 definition:=public.record_definition_version_v1(dossier,'synthetic.expiring_contract','contractual','Synthetic contractual definition','a11b0000-0000-4000-9000-000000000004','{"page":1,"clause":"1"}',null,0,gen_random_uuid());
 observation:=public.record_observation_v1(jsonb_build_object('requestId',gen_random_uuid(),'dossierId',dossier,'fieldPath','synthetic.expiring_observation',
  'dimensions',current_setting('test.adoption.dimensions')::jsonb,'value',jsonb_build_object('type','number','value','30'),'sourceVersionId','a11b0000-0000-4000-9000-000000000004','anchor','{"page":1}'::jsonb,'supersedesId',null));
 if not private.execution_capital_reference_current_v1('a11b0000-0000-4000-9000-000000000001',auth.uid(),observation,definition) then raise exception 'live standalone references denied';end if;
 perform private.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',2,array['read','process','store','derive','export'],array['analysis','retrieval','export'],null,null,gen_random_uuid(),repeat('d',64));
 perform pg_sleep(1.05);
 if private.execution_capital_reference_current_v1('a11b0000-0000-4000-9000-000000000001',auth.uid(),observation,null) then raise exception 'expired observation rights laundered';end if;
 if private.execution_capital_reference_current_v1('a11b0000-0000-4000-9000-000000000001',auth.uid(),null,definition) then raise exception 'expired definition rights laundered';end if;
 raise notice 'PASS: standalone observation and definition retain expired pinned rights';
end $$;
select private.revoke_resource_access_v1('a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000001');
select pg_temp.check_capital_provenance(c,p,false,'current dossier revocation denies embedded basis') from capital_provenance_fixture;
select 'execution_capital_provenance: PASS' result;
rollback;
