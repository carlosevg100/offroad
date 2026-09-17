-- Explicit version bindings. Old producers retain a labelled historical reference, not adoption.
set search_path='';
create function private.create_legacy_adoption_basis_v1(p_org uuid,p_work uuid,p_table text,p_record jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.assumption_sets; version_id uuid:=gen_random_uuid(); canonical text; fingerprint text; context text;
begin
 if p_table not in ('calculation_runs','structure_scenarios','scenario_versions','claim_decisions') or p_work is null
 or not exists(select 1 from private.access_resources where organization_id=p_org and id=p_work)
 then raise exception 'legacy_basis_scope_missing' using errcode='23514'; end if;
 context:=p_table||':'||(p_record->>'id');
 select * into s from public.assumption_sets where organization_id=p_org and work_reference=p_work and purpose='legacy_execution' and context_key=context;
 if s.id is not null then
  select id into version_id from public.assumption_versions where organization_id=p_org and set_id=s.id order by revision desc limit 1;
  if version_id is null then raise exception 'legacy_basis_incomplete' using errcode='23514'; end if;
  return version_id;
 end if;
 insert into public.assumption_sets(organization_id,work_id,work_reference,purpose,context_key,created_by)
 values(p_org,p_work,p_work,'legacy_execution',context,(coalesce(p_record->>'created_by',p_record->>'decided_by'))::uuid) returning * into s;
 -- Reference metadata only: no reconstruction of unknown inputs, source rights or approvals.
 canonical:=jsonb_build_object('schemaVersion','legacy-execution.v1','versionId',version_id,'setId',s.id,'workId',p_work,'purpose','legacy_execution',
 'contextKey',context,'classification','legacy_execution','legacyTable',p_table,'legacyRecordId',p_record->>'id',
 'inputHash',p_record->>'input_hash','engineVersion',p_record->>'engine_version','policyVersion',p_record->>'policy_version',
 'legacyResourceId',private.execution_source_resource_v1(p_org,p_table,p_record),'sourceManifestId',p_record->>'source_manifest_id','claimFingerprint',p_record->>'claim_fingerprint','inputAvailability','not_reconstructed')::text;
 fingerprint:=encode(extensions.digest(canonical,'sha256'),'hex');
 insert into public.assumption_versions(id,organization_id,set_id,revision,classification,canonical_snapshot,content_fingerprint,request_fingerprint,created_by)
 values(version_id,p_org,s.id,1,'legacy_execution',canonical,fingerprint,fingerprint,(coalesce(p_record->>'created_by',p_record->>'decided_by'))::uuid);
 return version_id;
end $$;
revoke all on function private.create_legacy_adoption_basis_v1(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;

create function private.execution_source_resource_v1(p_org uuid,p_table text,p_record jsonb) returns uuid language plpgsql stable security definer set search_path='' as $$
declare work uuid;
begin
 if p_table in ('calculation_runs','structure_scenarios') then work:=(p_record->>'opportunity_id')::uuid;
 elsif p_table='scenario_versions' then select opportunity_id into work from public.structure_scenarios where organization_id=p_org and id=(p_record->>'structure_scenario_id')::uuid;
 elsif p_table='claim_decisions' then
  select id into work from public.document_intake_sessions where organization_id=p_org and id=(p_record->>'intake_session_id')::uuid;
 end if;
 return work;
end $$;
revoke all on function private.execution_source_resource_v1(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function private.execution_work_resource_v1(p_org uuid,p_table text,p_record jsonb) returns uuid language sql stable security definer set search_path='' as $$
 select coalesce(r.parent_resource_id,r.id) from private.access_resources r where r.organization_id=p_org and r.id=private.execution_source_resource_v1(p_org,p_table,p_record);
$$;
revoke all on function private.execution_work_resource_v1(uuid,text,jsonb) from public,anon,authenticated,service_role;

create function private.bind_execution_adoption_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare work uuid; v public.assumption_versions; s public.assumption_sets;
begin
 if tg_op='UPDATE' then
  if old.adoption_basis_version_id is not null and (old.adoption_basis_version_id is distinct from new.adoption_basis_version_id or old.adoption_basis_fingerprint is distinct from new.adoption_basis_fingerprint)
  then raise exception 'execution_basis_immutable' using errcode='55000'; end if;
  if old.adoption_basis_version_id is not null then
   if old.organization_id is distinct from new.organization_id
   or private.execution_source_resource_v1(old.organization_id,tg_table_name,to_jsonb(old)) is distinct from private.execution_source_resource_v1(new.organization_id,tg_table_name,to_jsonb(new))
   then raise exception 'execution_basis_scope_immutable' using errcode='55000'; end if;
   return new;
  end if;
 end if;
 work:=private.execution_work_resource_v1(new.organization_id,tg_table_name,to_jsonb(new));
 if new.adoption_basis_version_id is null then
  new.adoption_basis_version_id:=private.create_legacy_adoption_basis_v1(new.organization_id,work,tg_table_name,to_jsonb(new));
  select content_fingerprint into new.adoption_basis_fingerprint from public.assumption_versions where organization_id=new.organization_id and id=new.adoption_basis_version_id;
 else
  select * into v from public.assumption_versions where organization_id=new.organization_id and id=new.adoption_basis_version_id;
  select * into s from public.assumption_sets where organization_id=new.organization_id and id=v.set_id;
  if v.id is null or s.work_id is distinct from work or v.classification<>'working_basis'
  or v.content_fingerprint is distinct from new.adoption_basis_fingerprint or not private.can_read_assumption_version_v1(new.organization_id,v.id)
  then raise exception 'execution_basis_binding_denied' using errcode='42501'; end if;
 end if;
 return new;
end $$;
revoke all on function private.bind_execution_adoption_v1() from public,anon,authenticated,service_role;

do $$ declare t text; begin
 foreach t in array array['calculation_runs','structure_scenarios','scenario_versions','claim_decisions'] loop
  execute format('alter table public.%I add column adoption_basis_version_id uuid, add column adoption_basis_fingerprint text',t);
  execute format('alter table public.%I add constraint %I foreign key(organization_id,adoption_basis_version_id) references public.assumption_versions(organization_id,id)',t,t||'_adoption_basis_fk');
  execute format('alter table public.%I add constraint %I check(adoption_basis_fingerprint ~ ''^[a-f0-9]{64}$'')',t,t||'_adoption_fingerprint');
  execute format('create index %I on public.%I(organization_id,adoption_basis_version_id)',t||'_adoption_basis_idx',t);
  execute format('create trigger %I before insert or update on public.%I for each row execute function private.bind_execution_adoption_v1()',t||'_bind_adoption',t);
  execute format('update public.%I set adoption_basis_version_id=null where adoption_basis_version_id is null',t);
  execute format('alter table public.%I alter column adoption_basis_version_id set not null, alter column adoption_basis_fingerprint set not null',t);
 end loop;
end $$;
