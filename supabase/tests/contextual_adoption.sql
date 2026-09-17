begin;
\ir support/contextual_adoption_setup.sql
set local role authenticated;
do $$
declare a jsonb:=current_setting('test.adoption.payload')::jsonb; dims jsonb:=current_setting('test.adoption.dimensions')::jsonb;
 v1 uuid; v2 uuid; v3 uuid; old jsonb; current_basis jsonb; proposal jsonb; cv uuid;
begin
 v1:=public.adopt_observation_for_work_v1(a);
 old:=public.read_adoption_basis_v1(v1);
 if public.adopt_observation_for_work_v1(a)<>v1 then raise exception 'adoption retry duplicated'; end if;
 if ((old->>'canonical')::jsonb->'entries'->0->'value'->>'value')<>'300' then raise exception 'selected value changed'; end if;
 begin perform public.adopt_observation_for_work_v1(a-'expectedVersionId'); raise exception 'omitted base accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.adopt_observation_for_work_v1(a||'{"reason":"Changed retry"}'); raise exception 'changed retry accepted'; exception when serialization_failure then null; end;
 v2:=public.adopt_observation_for_work_v1(a||jsonb_build_object('requestId',gen_random_uuid(),'observationId',current_setting('test.adoption.budget')::uuid,'expectedVersionId',v1));
 current_basis:=(public.read_adoption_basis_v1(v2)->>'canonical')::jsonb;
 if jsonb_array_length(current_basis->'entries')<>2 then raise exception 'budget replaced actual'; end if;
 begin perform public.adopt_observation_for_work_v1(a||jsonb_build_object('requestId',gen_random_uuid(),'expectedVersionId',v1)); raise exception 'stale revision overwrote concurrent work'; exception when serialization_failure then null; end;
 proposal:=jsonb_build_object('requestId',gen_random_uuid(),'workId',a->'workId','purpose',a->'purpose','contextKey',a->'contextKey','expectedVersionId',v2,
 'reason','Synthetic user assumption distinct from the source','fieldPath','financials.net_debt','dimensions',dims,'value',jsonb_build_object('type','number','value','9007199254740993.123456789'),'referenceObservationId',current_setting('test.adoption.observation')::uuid);
 v3:=public.propose_assumption_revision_v1(proposal);
 if public.read_adoption_basis_v1(v1)<>old then raise exception 'old calculation basis changed'; end if;
 current_basis:=(public.read_adoption_basis_v1(v3)->>'canonical')::jsonb;
 if not exists(select 1 from jsonb_array_elements(current_basis->'entries') e where e->>'kind'='hypothesis' and e->'value'->>'value'='9007199254740993.123456789' and e->'referenceValue'->>'value'='300') then raise exception 'hypothesis lost precision or reference'; end if;
 if (select asserted_value#>>'{}' from public.observations where id=current_setting('test.adoption.observation')::uuid)<>'300' then raise exception 'hypothesis rewrote source'; end if;
 if public.compare_adoption_bases_v1(v1,v3)->'left'<>old then raise exception 'comparison did not preserve old base'; end if;
 begin update public.adoption_decisions set asserted_value='"0"'; raise exception 'direct adoption overwrite allowed'; exception when insufficient_privilege then null; end;
 begin update public.assumption_versions set content_fingerprint=repeat('0',64); raise exception 'direct version overwrite allowed'; exception when insufficient_privilege then null; end;
 begin perform public.propose_assumption_revision_v1(proposal||jsonb_build_object('requestId',gen_random_uuid(),'expectedVersionId',v3,'dimensions',dims||'{"scenario":null}')); raise exception 'unknown scenario was inferred'; exception when invalid_parameter_value then null; end;
 cv:=public.record_definition_version_v1(current_setting('test.adoption.dossier')::uuid,'financials.net_debt','contractual','Synthetic covenant formula pinned to a contract.','a11b0000-0000-4000-9000-000000000004','{"page":1,"clause":"5.1"}',null,0,gen_random_uuid());
 begin perform public.propose_assumption_revision_v1(proposal||jsonb_build_object('requestId',gen_random_uuid(),'expectedVersionId',v3,'dimensions',dims||jsonb_build_object('definitionVersionId',cv))); raise exception 'reported metric substituted for covenant'; exception when check_violation then null; end;
 perform set_config('test.adoption.v1',v1::text,true);
 perform set_config('test.adoption.v3',v3::text,true);
end $$;
reset role;
do $$ begin
 begin update public.assumption_versions set canonical_snapshot=canonical_snapshot where id=current_setting('test.adoption.v1')::uuid; raise exception 'privileged overwrite erased history'; exception when object_not_in_prerequisite_state then null; end;
 if exists(select 1 from public.adoption_decisions d where not exists(select 1 from private.domain_events e join private.event_outbox q on q.event_id=e.id join public.audit_events a on a.id=e.audit_event_id where e.id=d.id)) then raise exception 'adoption audit/outbox absent'; end if;
 if exists(select 1 from public.assumption_versions v where not exists(select 1 from private.domain_events e join private.event_outbox q on q.event_id=e.id join public.audit_events a on a.id=e.audit_event_id where e.id=v.id)) then raise exception 'version audit/outbox absent'; end if;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.assumption_sets) or exists(select 1 from public.assumption_versions) or exists(select 1 from public.adoption_decisions) then raise exception 'membership disclosed a working basis'; end if;
 begin perform public.read_adoption_basis_v1(current_setting('test.adoption.v1')::uuid); raise exception 'unauthorized reader obtained snapshot'; exception when insufficient_privilege then null; end;
 begin perform public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb||jsonb_build_object('requestId',gen_random_uuid())); raise exception 'membership could adopt'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',1,'{}',array['analysis'],null,null,gen_random_uuid(),repeat('f',64));
do $$ begin
 if exists(select 1 from public.assumption_versions) or exists(select 1 from public.adoption_decisions) then raise exception 'source revocation left adopted copies readable'; end if;
 begin perform public.read_adoption_basis_v1(current_setting('test.adoption.v1')::uuid); raise exception 'old snapshot bypassed revoked source'; exception when insufficient_privilege then null; end;
 begin perform public.compare_adoption_bases_v1(current_setting('test.adoption.v1')::uuid,current_setting('test.adoption.v3')::uuid); raise exception 'diff disclosed revoked source'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'contextual_adoption' as test,'PASS' as result;
rollback;
