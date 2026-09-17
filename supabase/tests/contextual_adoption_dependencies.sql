begin;
\ir support/contextual_adoption_setup.sql
set local role authenticated;
select set_config('test.adoption.version',public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb)::text,true);
do $$ declare e uuid; begin
 e:=public.ensure_basis_entity_v1(current_setting('test.adoption.dossier')::uuid,'Synthetic second identity','BR:CNPJ','00000000000191','Synthetic explicit identity review');
 if public.ensure_basis_entity_v1(current_setting('test.adoption.dossier')::uuid,'Synthetic second identity','BR:CNPJ','00000000000191','Synthetic explicit identity review')<>e then raise exception 'identity retry duplicated'; end if;
 begin perform public.ensure_basis_entity_v1(current_setting('test.adoption.dossier')::uuid,'Different claimed identity','BR:CNPJ','00000000000191','Synthetic conflicting identity review'); raise exception 'conflicting identity was overwritten'; exception when serialization_failure then null; end;
end $$;
-- Retain read while removing derive/store: a derivative must still become unavailable.
select public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',1,array['read'],array['analysis'],null,null,gen_random_uuid(),repeat('f',64));
do $$ begin
 if not exists(select 1 from public.observations where id=current_setting('test.adoption.observation')::uuid) then raise exception 'source read unexpectedly removed'; end if;
 if exists(select 1 from public.assumption_versions where id=current_setting('test.adoption.version')::uuid) then raise exception 'derivative survived removal of derivation rights'; end if;
 begin perform public.read_adoption_basis_v1(current_setting('test.adoption.version')::uuid); raise exception 'derivative reader bypassed rights'; exception when insufficient_privilege then null; end;
 begin perform public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb||jsonb_build_object('contextKey','another','requestId',gen_random_uuid())); raise exception 'new derivative bypassed rights'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'contextual_adoption_dependencies' as test,'PASS' as result;
rollback;
