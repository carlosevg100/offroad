-- Local integration fixture only. The caller supplies a synthetic basis in a session setting.
-- Build it through the real definition and hypothesis commands, not direct immutable-row writes.
create temporary table capital_consumer_basis_receipt(receipt jsonb);
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
do $$
declare
 original jsonb:=current_setting('offroad.synthetic_capital_basis')::jsonb;
 dossier uuid;entity uuid;definition uuid;previous uuid;version uuid;decision uuid;
 entry jsonb; dims jsonb; mapping jsonb:='{}';definitions jsonb:='{}';envelope jsonb;
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
  version:=public.propose_assumption_revision_v1(jsonb_build_object('requestId',gen_random_uuid(),'workId','a11b0000-0000-4000-9000-000000000002',
   'purpose',original->>'purpose','contextKey','synthetic-capital-consumer','expectedVersionId',previous,'reason',entry->>'reason',
   'fieldPath',entry->>'fieldPath','dimensions',dims,'value',entry->'value','referenceObservationId',null));
  select i.decision_id into strict decision from private.assumption_version_items i where i.version_id=version
   and not exists(select 1 from private.assumption_version_items p where p.version_id=previous and p.decision_id=i.decision_id);
  mapping:=mapping||jsonb_build_object(entry->>'decisionId',decision,entry#>>'{dimensions,entityId}',entity);
  previous:=version;
 end loop;
 envelope:=public.read_adoption_basis_v1(version);
 mapping:=mapping||definitions||jsonb_build_object(original->>'workId','a11b0000-0000-4000-9000-000000000002',original->>'versionId',version);
 insert into capital_consumer_basis_receipt values(jsonb_build_object('mapping',mapping,'envelope',envelope,'purpose',original->>'purpose',
  'pins',(select jsonb_agg(jsonb_build_object('id',i.decision_id,'assumptionVersionId',version,'fingerprint',envelope->>'fingerprint')) from private.assumption_version_items i where i.version_id=version)));
end $$;
