begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('test.observation.dossier',(select id::text from public.dossiers where resource_id='a11b0000-0000-4000-9000-000000000003'),true);
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
<<probe>>
declare d uuid:=current_setting('test.observation.dossier')::uuid; v uuid; m uuid; e uuid; id uuid; revised uuid; payload jsonb; dims jsonb;
begin
 e:=public.review_dossier_identity_v1(d,null,'Synthetic observation entity','BR:CNPJ','00000000000272','Synthetic observation identity');
 perform public.link_dossier_entity_v1(d,e,'subject','{"basis":"consolidated"}','2020-01-01',null,'Synthetic observation perimeter',gen_random_uuid());
 v:=public.record_definition_version_v1(d,'net_debt','contractual','Synthetic covenant excludes restricted cash.','a11b0000-0000-4000-9000-000000000004','{"page":1,"clause":"5.1"}',null,0,'a8880000-0000-4000-9000-000000000001');
 select metric_definition_id into m from public.definition_versions where definition_versions.id=v;
 if public.record_definition_version_v1(d,'net_debt','contractual','Synthetic covenant excludes restricted cash.','a11b0000-0000-4000-9000-000000000004','{"page":1,"clause":"5.1"}',null,0,v)<>v then raise exception 'definition retry duplicated'; end if;
 begin perform public.record_definition_version_v1(d,'net_debt','managerial','Replaced with a managerial formula',null,null,m,1,gen_random_uuid()); raise exception 'managerial definition replaced contractual identity'; exception when check_violation then null; end;
 begin perform public.record_definition_version_v1(d,'net_debt','contractual','Missing contract',null,null,null,0,gen_random_uuid()); raise exception 'contract definition omitted version'; exception when check_violation then null; end;
 dims:=jsonb_build_object('entityId',e,'perimeter','consolidated','periodStart','2025-01-01','periodEnd','2025-12-31','currency','BRL','unit','currency','scale','1','scenario','actual','definitionVersionId',v);
 payload:=jsonb_build_object('requestId','a8880000-0000-4000-9000-000000000002','dossierId',d,'fieldPath','financials.net_debt','dimensions',dims,'value',jsonb_build_object('type','number','value','9007199254740993.123456789'),'sourceVersionId','a11b0000-0000-4000-9000-000000000004','anchor',jsonb_build_object('page',1,'row','net debt'),'supersedesId',null);
 id:=public.record_observation_v1(payload);
 if public.record_observation_v1(payload)<>id then raise exception 'observation retry duplicated'; end if;
 if (select asserted_value#>>'{}' from public.observations where observations.id=probe.id)<>'9007199254740993.123456789' then raise exception 'decimal precision lost'; end if;
 if (select cardinality(incomplete_reasons) from public.observations where observations.id=probe.id)<>0 then raise exception 'complete observation lost dimension'; end if;
 begin perform public.record_observation_v1(jsonb_set(payload,'{value,value}','"10"')); raise exception 'changed retry overwrote assertion'; exception when serialization_failure then null; end;
 revised:=public.record_observation_v1(payload||jsonb_build_object('requestId',gen_random_uuid(),'supersedesId',id,'value',jsonb_build_object('type','number','value','10')));
 if (select count(*) from public.observations where observations.id in (probe.id,revised))<>2 then raise exception 'contribution replaced previous assertion'; end if;
 perform set_config('test.observation.id',id::text,true);
 perform set_config('test.observation.definition',v::text,true);
 perform set_config('test.observation.payload',payload::text,true);
 -- Distinct dimensions coexist; there is no official/adopted bit to win by rank.
 for dims in select value from jsonb_array_elements('[{"perimeter":"standalone"},{"periodEnd":"2026-01-01"},{"currency":"USD"},{"unit":"thousands"},{"scale":"1000"},{"scenario":"budget"},{"definitionVersionId":null}]') loop
  perform public.record_observation_v1(payload||jsonb_build_object('requestId',gen_random_uuid(),'dimensions',(payload->'dimensions')||dims));
 end loop;
 if (select count(*) from public.observations)<>9 then raise exception 'dimensions collided'; end if;
 perform public.record_observation_v1(payload||jsonb_build_object('requestId',gen_random_uuid(),'dimensions',(payload->'dimensions')||'{"entityId":null,"perimeter":null,"unit":null,"scale":null}'));
 if not exists(select 1 from public.observations where incomplete_reasons @> array['entity','perimeter','unit','scale']) then raise exception 'missing dimensions guessed'; end if;
 begin update public.observations set asserted_value='"0"'; raise exception 'direct assertion overwrite'; exception when insufficient_privilege then null; end;
 begin delete from public.observations; raise exception 'direct history deletion'; exception when insufficient_privilege then null; end;
 begin perform public.accept_intake_candidates('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','{}'); raise exception 'legacy confidence batch remained callable'; exception when insufficient_privilege then null; end;
 begin perform public.record_observation_v1(payload||jsonb_build_object('requestId',gen_random_uuid(),'value','{"type":"number","value":1}'::jsonb)); raise exception 'floating JSON number admitted by exact command'; exception when invalid_parameter_value then null; end;
 begin perform public.record_observation_v1(payload||jsonb_build_object('requestId',gen_random_uuid(),'value','{"type":"date","value":"2025-02-30"}'::jsonb)); raise exception 'invalid calendar date admitted'; exception when invalid_parameter_value then null; end;
 for dims in select value from jsonb_array_elements('[{"scale":1000},{"scale":"1e3"},{"scale":"0"},{"scale":"NaN"},{"periodStart":"infinity"},{"periodEnd":"2025-02-30"},{"perimeter":{}},{"unit":""},{"scenario":true}]') loop
  begin
   perform public.record_observation_v1(payload||jsonb_build_object('requestId',gen_random_uuid(),'dimensions',(payload->'dimensions')||dims));
   raise exception 'invalid observation dimension admitted: %',dims;
  exception when invalid_parameter_value then null; end;
 end loop;
end $$;
reset role;
-- The immutable boundary also protects accidental privileged writes.
do $$ begin
 begin update public.observations set asserted_value='"0"' where id=current_setting('test.observation.id')::uuid; raise exception 'privileged update replaced history'; exception when object_not_in_prerequisite_state then null; end;
 if exists(select 1 from public.observations o where not exists(select 1 from private.domain_events e join private.event_outbox q on q.event_id=e.id join public.audit_events a on a.id=e.audit_event_id where e.id=o.id)) then raise exception 'assertion missing atomic audit/outbox'; end if;
end $$;
-- Membership, creator history, and source license cannot bypass current authority.
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.observations) or exists(select 1 from public.definition_versions) or exists(select 1 from public.metric_definitions) then raise exception 'membership disclosed observation'; end if;
 begin perform public.record_observation_v1(current_setting('test.observation.payload')::jsonb||jsonb_build_object('requestId',gen_random_uuid())); raise exception 'membership wrote observation'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',1,'{}',array['analysis'],null,null,gen_random_uuid(),repeat('f',64));
do $$ begin
 if exists(select 1 from public.observations) or exists(select 1 from public.definition_versions) or exists(select 1 from public.metric_definitions) then raise exception 'revoked source retained derivative or contract metadata'; end if;
 begin perform public.record_observation_v1(current_setting('test.observation.payload')::jsonb||jsonb_build_object('requestId',gen_random_uuid())); raise exception 'revoked source allowed new assertion'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'observation_definition_contract' as test,'PASS' as result;
rollback;
