-- Local integration fixture only. The caller supplies a synthetic basis in a session setting.
-- Definitions and the first contribution use product commands. The remaining historical
-- contributions are seeded in one version: this tests the consumer over all 173 inputs,
-- without constructing 173 successive historical snapshots during test setup.
create temporary table capital_consumer_basis_receipt(receipt jsonb);
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
do $$
declare
 original jsonb:=current_setting('offroad.synthetic_capital_basis')::jsonb;
 dossier uuid;entity uuid;definition uuid;previous uuid;version uuid;decision uuid;set_id uuid;
 entry jsonb; dims jsonb; mapping jsonb:='{}';definitions jsonb:='{}';envelope jsonb;entries jsonb;canonical text;
 decisions uuid[]:='{}';slot text;started timestamptz:=clock_timestamp();
begin
 select id into strict dossier from public.dossiers where resource_id='a11b0000-0000-4000-9000-000000000003';
 entity:=public.review_dossier_identity_v1(dossier,null,'Synthetic capital integration entity','BR:CNPJ','00000000000272','Synthetic local calculation proof');
 perform public.link_dossier_entity_v1(dossier,entity,'subject','{"basis":"standalone"}','2020-01-01',null,'Synthetic local capital perimeter',gen_random_uuid());
 for entry in select value from jsonb_array_elements(original->'entries') loop
  if entry->>'kind'<>'hypothesis' or entry->>'observationId' is not null then raise exception 'synthetic_hypothesis_fixture_required';end if;
  definition:=(definitions->>(entry#>>'{dimensions,definitionVersionId}'))::uuid;
  if definition is null then
   definition:=public.record_definition_version_v1(dossier,'synthetic.capital.'||(entry#>>'{dimensions,definitionVersionId}'),entry->>'definitionKind','Synthetic capital definition',null,null,null,0,gen_random_uuid());
   definitions:=definitions||jsonb_build_object(entry#>>'{dimensions,definitionVersionId}',definition);
  end if;
  dims:=entry->'dimensions'||jsonb_build_object('entityId',entity,'definitionVersionId',definition);
  if previous is null then
  version:=public.propose_assumption_revision_v1(jsonb_build_object('requestId',gen_random_uuid(),'workId','a11b0000-0000-4000-9000-000000000002',
   'purpose',original->>'purpose','contextKey','synthetic-capital-consumer','expectedVersionId',previous,'reason',entry->>'reason',
   'fieldPath',entry->>'fieldPath','dimensions',dims,'value',entry->'value','referenceObservationId',null));
  select i.decision_id into strict decision from private.assumption_version_items i where i.version_id=version
   and not exists(select 1 from private.assumption_version_items p where p.version_id=previous and p.decision_id=i.decision_id);
  select av.set_id into strict set_id from public.assumption_versions av where av.id=version;
  previous:=version;
  else
   slot:=encode(extensions.digest(jsonb_build_array(entry->>'fieldPath',dims)::text,'sha256'),'hex');
   insert into public.adoption_decisions(organization_id,set_id,kind,field_path,slot_key,dimensions,value_type,asserted_value,reference_observation_id,definition_version_id,entity_id,reason,created_by)
   values('a11b0000-0000-4000-9000-000000000001',set_id,'hypothesis',entry->>'fieldPath',slot,dims,entry#>>'{value,type}',entry#>'{value,value}',null,definition,entity,entry->>'reason',auth.uid()) returning id into decision;
  end if;
  decisions:=array_append(decisions,decision);
  mapping:=mapping||jsonb_build_object(entry->>'decisionId',decision,entry#>>'{dimensions,entityId}',entity);
 end loop;
 version:=gen_random_uuid();
 select jsonb_agg(private.adoption_entry_json_v1(a.id) order by a.slot_key) into entries from public.adoption_decisions a where a.id=any(decisions);
 canonical:=jsonb_build_object('schemaVersion','contextual-adoption.v1','versionId',version,'setId',set_id,'workId','a11b0000-0000-4000-9000-000000000002','purpose',original->>'purpose','contextKey','synthetic-capital-consumer',
  'revision',2,'previousVersionId',previous,'classification','working_basis','entries',entries)::text;
 insert into public.assumption_versions(id,organization_id,set_id,revision,previous_version_id,classification,canonical_snapshot,content_fingerprint,request_fingerprint,created_by)
 values(version,'a11b0000-0000-4000-9000-000000000001',set_id,2,previous,'working_basis',canonical,encode(extensions.digest(canonical,'sha256'),'hex'),encode(extensions.digest('Synthetic bulk consumer fixture: '||version::text,'sha256'),'hex'),auth.uid());
 insert into private.assumption_version_items(organization_id,set_id,version_id,slot_key,decision_id)
 select a.organization_id,a.set_id,version,a.slot_key,a.id from public.adoption_decisions a where a.id=any(decisions);
 envelope:=public.read_adoption_basis_v1(version);
 mapping:=mapping||definitions||jsonb_build_object(original->>'workId','a11b0000-0000-4000-9000-000000000002',original->>'versionId',version);
 insert into capital_consumer_basis_receipt values(jsonb_build_object('mapping',mapping,'envelope',envelope,'purpose',original->>'purpose','preparationMs',floor(extract(epoch from clock_timestamp()-started)*1000),
  'pins',(select jsonb_agg(jsonb_build_object('id',i.decision_id,'assumptionVersionId',version,'fingerprint',envelope->>'fingerprint')) from private.assumption_version_items i where i.version_id=version)));
end $$;
