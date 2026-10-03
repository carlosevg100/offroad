-- Prospective 3V: consume only already licensed, physically retained public
-- sources in this work. Never collect raw URL content or create a publication.
set search_path='';
alter table private.assessment_input_snapshots drop constraint assessment_input_snapshots_origin_check;
alter table private.assessment_input_snapshots add constraint assessment_input_snapshots_origin_check check(origin in('case_input','case_effective_input','preliminary_input','retrieval','institutional_context','public_research','m07_final'));
create table private.assessment_research_source_links(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),snapshot_id uuid not null,
 delivery_id uuid not null,license_id uuid not null,retained_payload_id uuid not null,payload_fingerprint text not null check(payload_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,snapshot_id,delivery_id),unique(organization_id,snapshot_id,retained_payload_id),
 foreign key(organization_id,snapshot_id) references private.assessment_input_snapshots(organization_id,id),
 foreign key(organization_id,delivery_id) references private.capital_public_deliveries(organization_id,id),
 foreign key(organization_id,license_id) references private.capital_public_delivery_licenses(organization_id,id),
 foreign key(organization_id,retained_payload_id) references private.capital_public_retained_payloads(organization_id,id)
);
create index assessment_research_license_fk on private.assessment_research_source_links(organization_id,license_id);
create index assessment_research_retained_fk on private.assessment_research_source_links(organization_id,retained_payload_id);
create function private.assessment_research_source_scope_v1(p_org uuid,p_work uuid,p_delivery uuid,p_retained uuid,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare d private.capital_public_deliveries;l private.capital_public_delivery_licenses;a private.capital_public_payload_allocations;r private.capital_public_retained_payloads;deadline timestamptz;margin integer;
begin
 if not private.resource_access_as_subject_v1(p_org,p_work,p_actor,'read')or not private.resource_access_as_subject_v1(p_org,p_work,p_actor,'work')then return null;end if;
 select x.* into d from private.capital_public_deliveries x join private.capital_public_input_snapshots s on(s.organization_id,s.id)=(x.organization_id,x.capture_id)
 where x.organization_id=p_org and x.id=p_delivery and s.work_id=p_work and x.origin_kind='published_public_payload';
 select * into l from private.capital_public_delivery_licenses where organization_id=p_org and delivery_id=d.id;
 select * into r from private.capital_public_retained_payloads where organization_id=p_org and id=p_retained;
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=r.allocation_id and delivery_id=d.id and license_id=l.id;
 if d.id is null or l.id is null or r.id is null or a.id is null or a.payload_fingerprint<>d.payload_fingerprint or r.verified_sha256<>d.payload_fingerprint
 or not private.capital_body_physical_receipt_v1(p_org,r.id)or not private.capital_public_retention_healthy_v1(a.worker_token_id,a.policy_id)
 or not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=p_org and allocation_id=a.id and status='pending')then return null;end if;
 deadline:=private.capital_public_retention_deadline_v1(l.id,p_org,a.retained_at,a.policy_id);
 select purge_margin_seconds into margin from private.capital_public_retention_policies where id=a.policy_id;
 if deadline is null or least(a.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp()then return null;end if;
 return jsonb_build_object('schemaVersion','capital-public-storage-scope.v1','retainedPayloadId',r.id,'allocationId',a.id,'bucket',a.bucket_id,'path',a.object_path,
 'payloadFingerprint',r.verified_sha256,'byteLength',r.verified_size,'storageObjectId',r.storage_object_id,'storageVersion',r.storage_version,'deliveryId',d.id,'retainedAt',a.retained_at,'uploadExpiresAt',a.upload_expires_at,
 'expiresAt',least(a.expires_at,deadline),'purgeAt',least(a.purge_at,deadline-make_interval(secs=>margin)),'state','complete');
end$$;
revoke all on function private.assessment_research_source_scope_v1(uuid,uuid,uuid,uuid,uuid)from public,anon,authenticated,service_role;
create function private.worker_prepare_assessment_research_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;work uuid;item record;scope jsonb;refs jsonb:='[]';body jsonb;sid uuid;fp text;s private.assessment_input_snapshots;
begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if j.kind not in('case_analysis','preliminary_analysis')then raise exception 'assessment_research_job_denied'using errcode='42501';end if;
 select capital_project_id into work from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
 perform 1 from public.capital_projects where organization_id=j.organization_id and id=work for no key update;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||j.organization_id::text,0));
 select * into s from private.assessment_input_snapshots where organization_id=j.organization_id and job_id=j.id and origin='public_research';
 if s.id is not null then
  for item in select * from private.assessment_research_source_links where organization_id=j.organization_id and snapshot_id=s.id order by delivery_id loop
   scope:=private.assessment_research_source_scope_v1(j.organization_id,work,item.delivery_id,item.retained_payload_id,j.authorization_subject_id);
   if scope is null or scope->>'payloadFingerprint'<>item.payload_fingerprint then raise exception 'assessment_research_source_denied'using errcode='42501';end if;
   refs:=refs||jsonb_build_array(jsonb_build_object('deliveryId',item.delivery_id,'retainedPayloadId',item.retained_payload_id,'payloadFingerprint',item.payload_fingerprint));
  end loop;
  if jsonb_array_length(refs)<>s.public_source_count then raise exception 'assessment_research_closure_unresolved'using errcode='42501';end if;
  perform private.job_for_capability(j.id,p_capability_token);
  return jsonb_build_object('schemaVersion','assessment-research-capture.v1','snapshotId',s.id,'status',case when s.public_source_count=0 then 'abstained'else 'succeeded'end,'sources',refs);
 end if;
 -- Only physical sources already admitted for this exact work are eligible. A
 -- URL found by an old collector is not a candidate for this query.
 for item in select d.id delivery_id,l.id license_id,r.id retained_payload_id,d.payload_fingerprint
 from private.capital_public_deliveries d join private.capital_public_input_snapshots c on(c.organization_id,c.id)=(d.organization_id,d.capture_id)
 join private.capital_public_delivery_licenses l on(l.organization_id,l.delivery_id)=(d.organization_id,d.id)
 join private.capital_public_payload_allocations a on(a.organization_id,a.delivery_id,a.license_id)=(d.organization_id,d.id,l.id)
 join private.capital_public_retained_payloads r on(r.organization_id,r.allocation_id)=(a.organization_id,a.id)
 where d.organization_id=j.organization_id and c.work_id=work order by d.delivered_at desc,d.id limit 25 loop
  scope:=private.assessment_research_source_scope_v1(j.organization_id,work,item.delivery_id,item.retained_payload_id,j.authorization_subject_id);
  if scope is not null then refs:=refs||jsonb_build_array(jsonb_build_object('deliveryId',item.delivery_id,'licenseId',item.license_id,'retainedPayloadId',item.retained_payload_id,'payloadFingerprint',item.payload_fingerprint));end if;
 end loop;
 select coalesce(jsonb_agg(value order by value->>'deliveryId'),'[]')into refs from jsonb_array_elements(refs);
 body:=jsonb_build_object('schemaVersion','assessment-research-capture.v1','status',case when jsonb_array_length(refs)=0 then'abstained'else'succeeded'end,'sources',refs);
 fp:=private.institutional_config_hash(body);
 insert into private.assessment_input_snapshots(organization_id,work_id,job_id,human_subject_id,origin,content_fingerprint,source_count,corpus_count,public_source_count)
 values(j.organization_id,work,j.id,j.authorization_subject_id,'public_research',fp,0,0,jsonb_array_length(refs))returning id into sid;
 insert into private.assessment_research_source_links(organization_id,snapshot_id,delivery_id,license_id,retained_payload_id,payload_fingerprint)
 select j.organization_id,sid,(value->>'deliveryId')::uuid,(value->>'licenseId')::uuid,(value->>'retainedPayloadId')::uuid,value->>'payloadFingerprint'from jsonb_array_elements(refs);
 perform private.job_for_capability(j.id,p_capability_token);
 return jsonb_build_object('schemaVersion','assessment-research-capture.v1','snapshotId',sid,'status',body->>'status','sources',coalesce((select jsonb_agg(value-'licenseId'order by value->>'deliveryId')from jsonb_array_elements(refs)),'[]'));
end$$;
create function public.worker_prepare_assessment_research_v1(p_job_id uuid,p_capability_token text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_prepare_assessment_research_v1(p_job_id,p_capability_token);$$;
create function private.worker_read_assessment_research_source_v1(p_job_id uuid,p_capability_token text,p_snapshot_id uuid,p_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''as $$
declare j public.processing_jobs;s private.assessment_input_snapshots;l private.assessment_research_source_links;answer jsonb;
begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 select * into s from private.assessment_input_snapshots where organization_id=j.organization_id and id=p_snapshot_id and job_id=j.id and origin='public_research'and human_subject_id=j.authorization_subject_id;
 select * into l from private.assessment_research_source_links where organization_id=j.organization_id and snapshot_id=s.id and retained_payload_id=p_retained_payload_id;
 if s.id is null or l.id is null then raise exception 'assessment_research_source_denied'using errcode='42501';end if;
 answer:=private.assessment_research_source_scope_v1(j.organization_id,s.work_id,l.delivery_id,l.retained_payload_id,j.authorization_subject_id);
 if answer is null or answer->>'payloadFingerprint'<>l.payload_fingerprint then raise exception 'assessment_research_source_denied'using errcode='42501';end if;
 perform private.job_for_capability(j.id,p_capability_token);return answer;
end$$;
create function public.worker_read_assessment_research_source_v1(p_job_id uuid,p_capability_token text,p_snapshot_id uuid,p_retained_payload_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_read_assessment_research_source_v1(p_job_id,p_capability_token,p_snapshot_id,p_retained_payload_id);$$;
revoke all on function private.worker_prepare_assessment_research_v1(uuid,text),public.worker_prepare_assessment_research_v1(uuid,text),private.worker_read_assessment_research_source_v1(uuid,text,uuid,uuid),public.worker_read_assessment_research_source_v1(uuid,text,uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function private.worker_prepare_assessment_research_v1(uuid,text),public.worker_prepare_assessment_research_v1(uuid,text),private.worker_read_assessment_research_source_v1(uuid,text,uuid,uuid),public.worker_read_assessment_research_source_v1(uuid,text,uuid,uuid)to authenticated;
-- Closed supplemental authority; retained source IDs can never be mistaken for
-- M07 components or omitted from proposal cardinalities.
alter function private.assessment_input_snapshot_authority_v1(uuid,uuid,uuid)rename to assessment_input_snapshot_before_research_v1;
revoke all on function private.assessment_input_snapshot_before_research_v1(uuid,uuid,uuid)from public,anon,authenticated,service_role;
create function private.assessment_input_snapshot_authority_v1(p_org uuid,p_snapshot uuid,p_actor uuid)returns text language plpgsql volatile security definer set search_path=''as $$
declare s private.assessment_input_snapshots;l private.assessment_research_source_links;scope jsonb;
begin
 select * into s from private.assessment_input_snapshots where organization_id=p_org and id=p_snapshot;
 if s.id is null then return'unresolved';end if;
 if s.origin<>'public_research'then return private.assessment_input_snapshot_before_research_v1(p_org,p_snapshot,p_actor);end if;
 if s.source_count<>0 or s.corpus_count<>0 or s.public_source_count<>(select count(*)from private.assessment_research_source_links where organization_id=p_org and snapshot_id=s.id)then return'unresolved';end if;
 if not private.resource_access_as_subject_v1(p_org,s.work_id,p_actor,'read')then return'denied';end if;
 for l in select * from private.assessment_research_source_links where organization_id=p_org and snapshot_id=s.id loop
  scope:=private.assessment_research_source_scope_v1(p_org,s.work_id,l.delivery_id,l.retained_payload_id,p_actor);
  if scope is null or scope->>'payloadFingerprint'<>l.payload_fingerprint then return'denied';end if;
 end loop;
 return'allowed';
end$$;
revoke all on function private.assessment_input_snapshot_authority_v1(uuid,uuid,uuid)from public,anon,authenticated,service_role;
alter table private.assessment_research_source_links enable row level security;alter table private.assessment_research_source_links force row level security;
revoke all on private.assessment_research_source_links from public,anon,authenticated,service_role;
create policy assessment_research_deny on private.assessment_research_source_links for all to anon,authenticated using(false)with check(false);
create trigger assessment_research_immutable before update or delete on private.assessment_research_source_links for each row execute function private.reject_review_history_mutation_v1();
create trigger assessment_research_no_truncate before truncate on private.assessment_research_source_links for each statement execute function private.reject_review_history_mutation_v1();
create trigger assessment_research_audit after insert on private.assessment_research_source_links for each row execute function private.capture_audit_event();

-- Native M07 publication and its review index are one transaction. A failed
-- index/authority check rolls back the artifact commit too. Recovery never
-- impersonates the original producer or manufactures an index for old releases.
create or replace function private.worker_commit_capital_m07_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,
 p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_m07_recipes:=private.require_capital_m07_recipe_v1(p_job_id,p_capability_token,p_recipe_id);result jsonb;
begin
 result:=private.capital_m07_commit_result_core_v1(r.organization_id,r.id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results);
 if not private.capital_public_capture_clock_current_v1(p_job_id,p_capability_token)then raise exception 'capital_m07_denied'using errcode='42501';end if;
 perform private.worker_record_m07_assessment_index_v1(p_job_id,p_capability_token,p_recipe_id,p_final_retained_payload_id);
 return result;
end$$;
revoke all on function private.worker_commit_capital_m07_result_v1(uuid,text,uuid,uuid,uuid,uuid,text,jsonb)from public,anon,authenticated,service_role;
grant execute on function private.worker_commit_capital_m07_result_v1(uuid,text,uuid,uuid,uuid,uuid,text,jsonb)to authenticated;
