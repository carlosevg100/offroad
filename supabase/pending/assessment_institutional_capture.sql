-- 3V: capture the additional institutional input actually delivered to the case
-- engine. Metadata only; no historical closure or permission backfill.
set search_path='';
create table private.assessment_institutional_configuration_links(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),snapshot_id uuid not null,
 work_id uuid not null,configuration_id uuid not null,configuration_revision integer not null,
 configuration_fingerprint text not null check(configuration_fingerprint~'^[a-f0-9]{64}$'),
 lineage_fingerprint text not null check(lineage_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,snapshot_id,configuration_id),
 foreign key(organization_id,work_id,snapshot_id) references private.assessment_input_snapshots(organization_id,work_id,id),
 foreign key(organization_id,configuration_id) references private.institutional_model_configurations(organization_id,id)
);
create index assessment_institutional_configuration_fk on private.assessment_institutional_configuration_links(organization_id,configuration_id);
create table private.assessment_institutional_fixed_rights(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),snapshot_id uuid not null,
 source_version_id uuid not null,rights_version_id uuid not null,content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,snapshot_id,source_version_id,rights_version_id),
 foreign key(organization_id,snapshot_id) references private.assessment_input_snapshots(organization_id,id),
 foreign key(organization_id,source_version_id,rights_version_id) references private.source_rights_versions(organization_id,source_version_id,id)
);
create index assessment_institutional_rights_fk on private.assessment_institutional_fixed_rights(organization_id,source_version_id,rights_version_id);
alter function private.assessment_input_snapshot_authority_v1(uuid,uuid,uuid) rename to assessment_input_snapshot_before_institutional_v1;
revoke all on function private.assessment_input_snapshot_before_institutional_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function private.assessment_input_snapshot_authority_v1(p_org uuid,p_snapshot uuid,p_actor uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare s private.assessment_input_snapshots;l private.assessment_institutional_configuration_links;
 pin private.assessment_institutional_fixed_rights;r private.source_rights_versions;proof jsonb;state text;op text;
begin
 state:=private.assessment_input_snapshot_before_institutional_v1(p_org,p_snapshot,p_actor);
 if state<>'allowed' then return state;end if;
 select * into strict s from private.assessment_input_snapshots where organization_id=p_org and id=p_snapshot;
 if s.origin<>'institutional_context' then return state;end if;
 for l in select * from private.assessment_institutional_configuration_links where organization_id=p_org and snapshot_id=s.id order by configuration_id loop
  perform 1 from private.institutional_model_configurations c where c.organization_id=p_org and c.id=l.configuration_id
   and c.capital_project_id=s.work_id and c.status='approved' and c.revision=l.configuration_revision
   and c.configuration_fingerprint=l.configuration_fingerprint and private.institutional_config_hash(c.configuration)=l.configuration_fingerprint for share nowait;
  if not found then return 'denied';end if;
  proof:=private.institutional_configuration_ancestry_v1(p_org,s.work_id,l.configuration_id);
  if proof->>'state' is distinct from 'captured_lineage' or private.institutional_config_hash(proof)<>l.lineage_fingerprint then return 'denied';end if;
 end loop;
 for pin in select * from private.assessment_institutional_fixed_rights where organization_id=p_org and snapshot_id=s.id loop
  select * into r from private.source_rights_versions where organization_id=p_org and id=pin.rights_version_id and source_version_id=pin.source_version_id for share nowait;
  if r.id is null or r.valid_from>clock_timestamp() or r.expires_at<=clock_timestamp() or r.store_until<=clock_timestamp()
   or not(array['read','process','store','derive']::text[]<@r.operations) or not('analysis'=any(r.purposes))
   or not exists(select 1 from public.source_versions where organization_id=p_org and id=pin.source_version_id and declared_sha256=pin.content_hash) then return 'denied';end if;
  foreach op in array array['read','process','store','derive']loop
   if not private.source_use_allowed_v1(p_org,pin.source_version_id,p_actor,op,'analysis')then return 'denied';end if;
  end loop;
 end loop;
 return 'allowed';
exception when lock_not_available then raise exception 'assessment_capture_retry'using errcode='40001';
end $$;
revoke all on function private.assessment_input_snapshot_authority_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
-- Existing case consumers also cross the same capture boundary after their
-- primary input is captured; the original institutional authority stays intact.
alter function private.worker_load_institutional_model_context_v3(uuid,text) rename to worker_load_institutional_before_assessment_v3;
revoke all on function private.worker_load_institutional_before_assessment_v3(uuid,text)from public,anon,authenticated,service_role;
create function private.worker_load_assessment_institutional_context_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;body jsonb;item jsonb;proof jsonb;pins jsonb:='[]';versions uuid[]:='{}';sid uuid;work uuid;c private.institutional_model_configurations;v public.source_versions;
begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if j.kind not in('case_analysis')then raise exception 'assessment_context_job_denied'using errcode='42501';end if;
 body:=private.worker_load_institutional_before_assessment_v3(j.id,p_capability_token);
 if jsonb_typeof(body->'currentSources')is distinct from 'array' or jsonb_typeof(body->'approvedConfigurations')is distinct from 'array'
 or jsonb_array_length(body->'approvedConfigurations')>12 then raise exception 'assessment_institutional_context_unresolved'using errcode='42501';end if;
 select capital_project_id into work from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
 if body->>'projectId'is distinct from work::text then raise exception 'assessment_institutional_work_mismatch'using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=j.organization_id and id=work for no key update;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||j.organization_id::text,0));
 for item in select value from jsonb_array_elements(body->'currentSources')loop
  select * into v from public.source_versions where organization_id=j.organization_id and id=(item->>'sourceDocument')::uuid
   and legacy_document_version::text=item->>'version' and declared_sha256=item->>'hash' for share nowait;
  if v.id is null then raise exception 'assessment_institutional_source_unresolved'using errcode='42501';end if;
  versions:=array_append(versions,v.id);
 end loop;
 for item in select value from jsonb_array_elements(body->'approvedConfigurations')order by value->>'id'loop
  select * into c from private.institutional_model_configurations where organization_id=j.organization_id and id=(item->>'id')::uuid
   and capital_project_id=work and status='approved' and revision::text=item->>'revision' and configuration_fingerprint=item->>'fingerprint'
   and configuration=item->'configuration' for share nowait;
  if c.id is null then raise exception 'assessment_institutional_configuration_unresolved'using errcode='42501';end if;
  proof:=private.institutional_configuration_ancestry_v1(j.organization_id,work,c.id);
  if proof->>'state'is distinct from 'captured_lineage'then raise exception 'assessment_institutional_ancestry_unresolved'using errcode='42501';end if;
  pins:=pins||(proof->'sources');
 end loop;
 versions:=versions||array(select(value->>'sourceVersionId')::uuid from jsonb_array_elements(pins));
 sid:=private.capture_assessment_document_input_v1(j.id,p_capability_token,'institutional_context',body,versions);
 for item in select value from jsonb_array_elements(body->'approvedConfigurations')loop
  proof:=private.institutional_configuration_ancestry_v1(j.organization_id,work,(item->>'id')::uuid);
  insert into private.assessment_institutional_configuration_links(organization_id,snapshot_id,work_id,configuration_id,configuration_revision,configuration_fingerprint,lineage_fingerprint)
   values(j.organization_id,sid,work,(item->>'id')::uuid,(item->>'revision')::integer,item->>'fingerprint',private.institutional_config_hash(proof))on conflict(organization_id,snapshot_id,configuration_id)do nothing;
 end loop;
 for item in select distinct value from jsonb_array_elements(pins)loop
  insert into private.assessment_institutional_fixed_rights(organization_id,snapshot_id,source_version_id,rights_version_id,content_hash)
   values(j.organization_id,sid,(item->>'sourceVersionId')::uuid,(item->>'rightsVersionId')::uuid,item->>'declaredSha256')on conflict(organization_id,snapshot_id,source_version_id,rights_version_id)do nothing;
 end loop;
 if private.assessment_input_snapshot_authority_v1(j.organization_id,sid,j.authorization_subject_id)<>'allowed'then raise exception 'assessment_institutional_authority_denied'using errcode='42501';end if;
 perform private.job_for_capability(j.id,p_capability_token);
 return body||jsonb_build_object('assessmentInputSnapshotId',sid);
exception when lock_not_available then raise exception 'assessment_capture_retry'using errcode='40001';
end $$;
create function public.worker_load_assessment_institutional_context_v1(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_load_assessment_institutional_context_v1(p_job_id,p_capability_token);$$;
revoke all on function private.worker_load_assessment_institutional_context_v1(uuid,text),public.worker_load_assessment_institutional_context_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_load_assessment_institutional_context_v1(uuid,text),public.worker_load_assessment_institutional_context_v1(uuid,text)to authenticated;
do $$declare t text;begin foreach t in array array['assessment_institutional_configuration_links','assessment_institutional_fixed_rights']loop
 execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create policy %I on private.%I for all to anon,authenticated using(false)with check(false)',t||'_deny',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_review_history_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
 execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;end $$;

create function private.worker_load_institutional_model_context_v3(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path=''as $$
declare j public.processing_jobs;begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if j.kind='case_analysis'and exists(select 1 from private.assessment_input_snapshots where organization_id=j.organization_id and job_id=j.id and origin in('case_input','case_effective_input'))then
  return private.worker_load_assessment_institutional_context_v1(j.id,p_capability_token);
 end if;
 return private.worker_load_institutional_before_assessment_v3(j.id,p_capability_token);
end$$;
revoke all on function private.worker_load_institutional_model_context_v3(uuid,text)from public,anon,authenticated,service_role;
grant execute on function private.worker_load_institutional_model_context_v3(uuid,text)to authenticated;
