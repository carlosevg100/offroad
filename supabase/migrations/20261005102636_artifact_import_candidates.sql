-- Stage 21: uploaded bytes are a source; comparison is written only by a bounded trusted processor.
set search_path='';
create table public.artifact_import_candidates (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id),work_id uuid not null,artifact_id uuid not null,
 export_receipt_id uuid,base_revision_id uuid,base_manifest_fingerprint text check(base_manifest_fingerprint ~ '^[a-f0-9]{64}$'),
 head_revision_id_at_submit uuid not null,source_version_id uuid not null,
 format text not null check(format in ('xlsx','docx','pptx')),locale text not null check(locale in ('pt-BR','en-US')),
 upload_sha256 text not null check(upload_sha256 ~ '^[a-f0-9]{64}$'),byte_length bigint not null check(byte_length between 1 and 52428800),
 status text not null check(status in ('queued','candidate','unmatched','stale','applied','discarded')),
 comparison jsonb,contributions jsonb,comparison_fingerprint text check(comparison_fingerprint ~ '^[a-f0-9]{64}$'),
 compared_head_revision_id uuid,reason text check(reason in ('source_revoked','manifest_unmatched','head_changed','missing_base')),
 submitted_by uuid not null references auth.users(id),command_id uuid not null,
 pending_contributions jsonb,pending_configuration_ids uuid[] not null default '{}',
 decision_id uuid,applied_revision_id uuid,continuation_request_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,work_id,command_id),unique(organization_id,artifact_id,upload_sha256),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,artifact_id) references public.artifacts(organization_id,id),
 foreign key(organization_id,artifact_id,base_revision_id) references public.artifact_revisions(organization_id,artifact_id,id),
 foreign key(organization_id,artifact_id,head_revision_id_at_submit) references public.artifact_revisions(organization_id,artifact_id,id),
 foreign key(organization_id,artifact_id,compared_head_revision_id) references public.artifact_revisions(organization_id,artifact_id,id),
 foreign key(organization_id,source_version_id) references public.source_versions(organization_id,id),
 foreign key(organization_id,export_receipt_id) references public.artifact_export_receipts(organization_id,id),
 foreign key(organization_id,decision_id) references public.work_decisions(organization_id,id),
 foreign key(organization_id,applied_revision_id) references public.artifact_revisions(organization_id,id),
 foreign key(organization_id,continuation_request_id) references public.work_continuation_requests(organization_id,id),
 check((base_revision_id is null)=(export_receipt_id is null)),
 check((base_revision_id is null)=(base_manifest_fingerprint is null)),
 check(status<>'applied' or (decision_id is not null and applied_revision_id is not null)),
 check((comparison is null)=(comparison_fingerprint is null)),
 check(comparison is null or (jsonb_typeof(comparison)='object' and octet_length(comparison::text)<=8388608)),
 check(contributions is null or (jsonb_typeof(contributions)='object' and octet_length(contributions::text)<=1048576))
);
create index artifact_import_candidates_work_idx on public.artifact_import_candidates(organization_id,work_id,status);
create index artifact_import_candidates_source_idx on public.artifact_import_candidates(organization_id,source_version_id);
create index artifact_import_candidates_actor_idx on public.artifact_import_candidates(submitted_by);
create index artifact_import_candidates_decision_idx on public.artifact_import_candidates(organization_id,decision_id) where decision_id is not null;
alter table public.artifact_import_candidates enable row level security;
alter table public.artifact_import_candidates force row level security;
revoke all on public.artifact_import_candidates from public,anon,authenticated,service_role;
create policy artifact_import_candidates_select on public.artifact_import_candidates for select to authenticated using(false);
create policy artifact_import_candidates_insert on public.artifact_import_candidates for insert to authenticated with check(false);
create policy artifact_import_candidates_update on public.artifact_import_candidates for update to authenticated using(false) with check(false);
create policy artifact_import_candidates_delete on public.artifact_import_candidates for delete to authenticated using(false);
create trigger artifact_import_candidates_updated before update on public.artifact_import_candidates for each row execute function private.set_updated_at();
create trigger artifact_import_candidates_audit after insert or update or delete on public.artifact_import_candidates for each row execute function private.capture_identity_audit_v1();
alter table private.artifact_roundtrip_tasks add column import_candidate_id uuid;
alter table private.artifact_roundtrip_tasks add foreign key(organization_id,import_candidate_id) references public.artifact_import_candidates(organization_id,id);
create index artifact_roundtrip_tasks_import_idx on private.artifact_roundtrip_tasks(organization_id,import_candidate_id) where import_candidate_id is not null;

create table private.artifact_import_events (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,candidate_id uuid not null,
 command_id uuid not null,kind text not null check(kind in ('submitted','compared','recompare','adopted','discarded','matched','as_source')),
 actor_id uuid not null references auth.users(id),payload jsonb not null check(jsonb_typeof(payload)='object'),created_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,candidate_id,command_id),
 foreign key(organization_id,candidate_id) references public.artifact_import_candidates(organization_id,id)
);
alter table private.artifact_import_events enable row level security;
alter table private.artifact_import_events force row level security;
revoke all on private.artifact_import_events from public,anon,authenticated,service_role;
create policy artifact_import_events_deny on private.artifact_import_events for all to authenticated using(false) with check(false);
create trigger artifact_import_events_immutable before update or delete on private.artifact_import_events for each row execute function private.reject_artifact_export_receipt_mutation_v1();
create trigger artifact_import_events_audit after insert on private.artifact_import_events for each row execute function private.capture_identity_audit_v1();

create function private.guard_artifact_import_candidate_v1()returns trigger language plpgsql set search_path=''as $$
begin
 if tg_op='DELETE' or old.status in ('applied','discarded') then raise exception 'artifact_import_immutable' using errcode='55000';end if;
 if (new.organization_id,new.work_id,new.artifact_id,new.source_version_id,new.upload_sha256,new.byte_length,new.submitted_by,new.command_id,new.head_revision_id_at_submit,new.format,new.locale)
 is distinct from (old.organization_id,old.work_id,old.artifact_id,old.source_version_id,old.upload_sha256,old.byte_length,old.submitted_by,old.command_id,old.head_revision_id_at_submit,old.format,old.locale)
 then raise exception 'artifact_import_identity_immutable' using errcode='55000';end if;
 return new;
end;$$;
create trigger artifact_import_candidates_immutable before update or delete on public.artifact_import_candidates for each row execute function private.guard_artifact_import_candidate_v1();

create function private.artifact_import_source_bound_v1(p_org uuid,p_work uuid,p_source uuid,p_actor uuid,p_operation text)
returns boolean language sql volatile security definer set search_path=''as $$
 select private.source_use_allowed_v1(p_org,p_source,p_actor,p_operation,'analysis') and exists(
 select 1 from public.source_versions v join public.source_bindings b on b.organization_id=v.organization_id and b.source_version_id=v.id
 join public.document_intake_sessions session on session.organization_id=b.organization_id and session.id=b.resource_id
 where v.organization_id=p_org and v.id=p_source and b.revoked_at is null and session.capital_project_id=p_work
 and v.byte_size between 1 and 52428800 and v.declared_sha256 ~ '^[a-f0-9]{64}$');
$$;

create function private.artifact_import_source_allowed_v1(p_org uuid,p_work uuid,p_source uuid,p_actor uuid,p_operation text)
returns boolean language sql volatile security definer set search_path=''as $$
 select private.source_use_allowed_v1(p_org,p_source,p_actor,p_operation,'analysis') and exists(
 select 1 from public.source_versions v join private.source_version_verifications proof on proof.organization_id=v.organization_id and proof.source_version_id=v.id
 where v.organization_id=p_org and v.id=p_source and proof.observed_sha256=v.declared_sha256 and proof.observed_byte_size=v.byte_size
 and exists(select 1 from public.source_bindings b join public.document_intake_sessions s on s.organization_id=b.organization_id and s.id=b.resource_id
 where b.organization_id=p_org and b.source_version_id=v.id and b.revoked_at is null and s.capital_project_id=p_work));
$$;

create function private.submit_artifact_import_v1(p_candidate_id uuid,p_work_id uuid,p_artifact_id uuid,p_export_receipt_id uuid,
 p_source_version_id uuid,p_expected_head_revision_id uuid,p_format text,p_locale text,p_command_id uuid)
returns jsonb language plpgsql security definer set search_path=''as $$
declare org uuid;a public.artifacts;receipt public.artifact_export_receipts;v public.source_versions;c public.artifact_import_candidates;t private.artifact_roundtrip_tasks;
 state text;reason text;
begin
 org:=private.lock_review_work_v1(p_work_id);
 if p_candidate_id is null or p_command_id is null or p_format is null or p_format not in ('xlsx','docx','pptx') or p_locale is null or p_locale not in ('pt-BR','en-US') then raise exception 'artifact_import_invalid' using errcode='22023';end if;
 select * into a from public.artifacts where organization_id=org and id=p_artifact_id and work_id=p_work_id for update;
 if a.id is null then raise exception 'artifact_import_denied' using errcode='42501';end if;
 if not private.artifact_import_source_bound_v1(org,p_work_id,p_source_version_id,auth.uid(),'process') then raise exception 'artifact_import_source_denied' using errcode='42501';end if;
 select * into strict v from public.source_versions where organization_id=org and id=p_source_version_id;
 select * into c from public.artifact_import_candidates where organization_id=org and
 (id=p_candidate_id or (work_id=p_work_id and command_id=p_command_id) or (artifact_id=a.id and upload_sha256=v.declared_sha256));
 if c.id is not null then
 if (c.work_id,c.artifact_id,c.source_version_id,c.format,c.locale,c.submitted_by,c.export_receipt_id) is distinct from
 (p_work_id,p_artifact_id,p_source_version_id,p_format,p_locale,auth.uid(),p_export_receipt_id) then raise exception 'artifact_import_command_conflict' using errcode='23505';end if;
 return jsonb_build_object('candidateId',c.id,'status',c.status,'replayed',true);
 end if;
 if a.head_revision_id is distinct from p_expected_head_revision_id then raise exception 'artifact_import_stale' using errcode='40001';end if;
 if p_export_receipt_id is not null then
 select * into receipt from public.artifact_export_receipts where organization_id=org and id=p_export_receipt_id and artifact_id=a.id and work_id=p_work_id and format=p_format and locale=p_locale;
 if receipt.id is null then raise exception 'artifact_import_denied' using errcode='42501';end if;
 end if;
 state:=case when receipt.id is null then 'unmatched' when not private.artifact_roundtrip_revision_allowed_v1(org,receipt.revision_id,auth.uid(),false) then 'stale' else 'queued' end;
 reason:=case when state='unmatched' then 'manifest_unmatched' when state='stale' then 'source_revoked' end;
 insert into public.artifact_import_candidates(id,organization_id,work_id,artifact_id,export_receipt_id,base_revision_id,base_manifest_fingerprint,
 head_revision_id_at_submit,source_version_id,format,locale,upload_sha256,byte_length,status,reason,submitted_by,command_id)
 values(p_candidate_id,org,p_work_id,a.id,receipt.id,receipt.revision_id,receipt.logical_manifest_fingerprint,a.head_revision_id,v.id,p_format,p_locale,
 v.declared_sha256,v.byte_size,state,reason,auth.uid(),p_command_id) returning * into c;
 if state in ('queued','unmatched','stale') then
 insert into private.artifact_roundtrip_tasks(organization_id,work_id,revision_id,operation,format,locale,variant,requested_by,command_id,import_candidate_id)
 values(org,p_work_id,receipt.revision_id,'import_scan',p_format,p_locale,coalesce(receipt.variant,'default'),auth.uid(),p_command_id,c.id) returning * into t;
 end if;
 insert into private.artifact_import_events(organization_id,candidate_id,command_id,kind,actor_id,payload)
 values(org,c.id,p_command_id,'submitted',auth.uid(),jsonb_build_object('sourceVersionId',v.id,'status',state,'headRevisionId',a.head_revision_id));
 return jsonb_build_object('candidateId',c.id,'status',c.status,'taskId',t.id,'replayed',false);
end;$$;
create function public.submit_artifact_import_v1(p_candidate_id uuid,p_work_id uuid,p_artifact_id uuid,p_export_receipt_id uuid,
 p_source_version_id uuid,p_expected_head_revision_id uuid,p_format text,p_locale text,p_command_id uuid)
returns jsonb language sql security invoker set search_path=''as $$select private.submit_artifact_import_v1(p_candidate_id,p_work_id,p_artifact_id,p_export_receipt_id,p_source_version_id,p_expected_head_revision_id,p_format,p_locale,p_command_id);$$;

create function private.read_artifact_import_candidate_v1(p_candidate_id uuid)
returns jsonb language plpgsql security definer set search_path=''as $$
declare c public.artifact_import_candidates;a public.artifacts;events jsonb;allowed boolean;policy jsonb;groups jsonb;history_revision uuid;
begin
 select * into c from public.artifact_import_candidates where id=p_candidate_id;
 if c.id is null or not private.evaluate_resource_policy_v1(c.organization_id,c.work_id,auth.uid(),'read','analysis') then raise exception 'artifact_import_denied' using errcode='42501';end if;
 if private.artifact_import_source_bound_v1(c.organization_id,c.work_id,c.source_version_id,auth.uid(),'read') and not exists(select 1 from private.source_version_verifications where organization_id=c.organization_id and source_version_id=c.source_version_id)then return jsonb_build_object('candidateId',c.id,'workId',c.work_id,'artifactId',c.artifact_id,'status','queued','reason','verification_pending','withheld',true);end if;
 allowed:=private.artifact_import_source_allowed_v1(c.organization_id,c.work_id,c.source_version_id,auth.uid(),'read') and
 (c.base_revision_id is null or private.artifact_roundtrip_revision_allowed_v1(c.organization_id,c.base_revision_id,auth.uid(),false))
 and(c.compared_head_revision_id is null or private.artifact_roundtrip_revision_allowed_v1(c.organization_id,c.compared_head_revision_id,auth.uid(),false));
 -- The response includes immutable comparison history: every recorded basis must remain readable.
 -- A newer head may introduce sources absent from the original export; base-only checks leak it.
 if allowed then
 for history_revision in
 select distinct value::uuid from private.artifact_import_events e
 cross join lateral jsonb_array_elements_text(jsonb_build_array(
 e.payload#>>'{previousComparison,baseRevisionId}',e.payload#>>'{previousComparison,headRevisionId}',
 e.payload#>>'{request,expectedHeadRevisionId}',e.payload->>'appliedRevisionId'))q(value)
 where e.organization_id=c.organization_id and e.candidate_id=c.id and value is not null
 loop
 if not private.artifact_roundtrip_revision_allowed_v1(c.organization_id,history_revision,auth.uid(),false)then allowed:=false;exit;end if;
 end loop;
 end if;
 if not allowed then return jsonb_build_object('candidateId',c.id,'workId',c.work_id,'artifactId',c.artifact_id,'status','stale','reason','source_revoked','withheld',true);end if;
 select * into a from public.artifacts where organization_id=c.organization_id and id=c.artifact_id;
 policy:=private.review_policy_snapshot_v1(c.organization_id,c.work_id,auth.uid());
 select coalesce(jsonb_agg(jsonb_build_object('configurationId',ic.id,'label',coalesce(nullif(ic.configuration#>>'{assumptionBook,scenarioName}',''),'Alternativa sem nome'),'requiresRebase',ic.id is distinct from(select id from private.institutional_model_configurations where organization_id=c.organization_id and capital_project_id=c.work_id and status='approved'order by revision desc limit 1))order by ic.revision),'[]')into groups from private.institutional_model_configurations ic where ic.organization_id=c.organization_id and ic.capital_project_id=c.work_id and exists(select 1 from jsonb_array_elements(coalesce(c.contributions->'assumptionChanges','[]'))x where x->>'configurationId'=ic.id::text);
 select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'createdAt',created_at,'actorId',actor_id,'payload',payload) order by created_at,id),'[]') into events from private.artifact_import_events where organization_id=c.organization_id and candidate_id=c.id;
 return jsonb_build_object('candidateId',c.id,'workId',c.work_id,'artifactId',c.artifact_id,'status',c.status,'reason',c.reason,'withheld',false,
 'groups',groups,'pendingContributions',c.pending_contributions,'pendingConfigurationIds',to_jsonb(c.pending_configuration_ids),'baseRevisionId',c.base_revision_id,'baseManifestFingerprint',c.base_manifest_fingerprint,'headRevisionIdAtSubmit',c.head_revision_id_at_submit,
 'currentHeadRevisionId',a.head_revision_id,'comparedHeadRevisionId',c.compared_head_revision_id,'sourceVersionId',c.source_version_id,'format',c.format,
 'comparison',c.comparison,'contributions',c.contributions,'comparisonFingerprint',c.comparison_fingerprint,'submittedBy',c.submitted_by,
 'viewerId',auth.uid(),'preparedBy',c.submitted_by,'policy',policy,'canApply',c.status='candidate'and a.head_revision_id=c.compared_head_revision_id and private.evaluate_resource_policy_v1(c.organization_id,c.work_id,auth.uid(),'work','analysis'),'canDiscard',c.status not in('applied','discarded')and private.evaluate_resource_policy_v1(c.organization_id,c.work_id,auth.uid(),'work','analysis'),
 'decisionId',c.decision_id,'appliedRevisionId',c.applied_revision_id,'continuationRequestId',c.continuation_request_id,'events',events);
end;$$;
create function public.read_artifact_import_candidate_v1(p_candidate_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.read_artifact_import_candidate_v1(p_candidate_id);$$;

create or replace function private.artifact_roundtrip_task_allowed_v1(t private.artifact_roundtrip_tasks)
returns boolean language plpgsql volatile security definer set search_path=''as $$
declare c public.artifact_import_candidates;
begin
 if t.operation='export' then return private.artifact_roundtrip_revision_allowed_v1(t.organization_id,t.revision_id,t.requested_by,true);end if;
 select * into c from public.artifact_import_candidates where organization_id=t.organization_id and id=t.import_candidate_id;
 if c.id is null or c.status in ('applied','discarded') or not private.evaluate_resource_policy_v1(t.organization_id,t.work_id,t.requested_by,'work','analysis')then return false;end if;
 if t.operation='import_scan'then return private.artifact_import_source_bound_v1(t.organization_id,t.work_id,c.source_version_id,t.requested_by,'process');end if;
 return c.status in ('queued','unmatched')and private.artifact_import_source_allowed_v1(t.organization_id,t.work_id,c.source_version_id,t.requested_by,'process')
 and(c.base_revision_id is null or private.artifact_roundtrip_revision_allowed_v1(t.organization_id,c.base_revision_id,t.requested_by,false))
 and private.artifact_roundtrip_revision_allowed_v1(t.organization_id,coalesce(c.compared_head_revision_id,c.head_revision_id_at_submit),t.requested_by,false);
end;$$;

-- Exact version-19 template pins, evaluated for the task requester rather than the worker account.
create function private.artifact_roundtrip_template_context_v1(p_revision uuid,p_subject uuid)
returns jsonb language plpgsql stable security definer set search_path=''as $$
declare r public.artifact_revisions;v public.presentation_template_versions;t public.presentation_templates;pin jsonb;canonical text;
begin
 select*into strict r from public.artifact_revisions where id=p_revision;pin:=r.manifest->'template';
 if pin is null or pin='null'::jsonb then return null;end if;
 -- Non-UUID builtin pins are checked against the renderer's exact builtin contract and fingerprint.
 if pin->>'templateVersionId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'then return null;end if;
 select*into v from public.presentation_template_versions where organization_id=r.organization_id and id=(pin->>'templateVersionId')::uuid;
 select*into t from public.presentation_templates where organization_id=r.organization_id and id=v.template_id;
 canonical:=jsonb_build_object('definition',v.definition,'structure',v.structure)::text;
 if v.id is null or t.id is null or v.fingerprint is distinct from pin->>'fingerprint'
 or v.fingerprint is distinct from encode(extensions.digest(canonical,'sha256'),'hex')
 or not exists(select 1 from public.organization_memberships where organization_id=r.organization_id and user_id=p_subject and status='active')
 or(t.capital_project_id is not null and not private.evaluate_resource_policy_v1(r.organization_id,t.capital_project_id,p_subject,'read','analysis'))
 then raise exception 'artifact_roundtrip_template_denied'using errcode='42501';end if;
 return jsonb_build_object('versionId',v.id,'fingerprint',v.fingerprint,'definition',v.definition,'structure',v.structure,'canonicalFingerprintInput',canonical);
end;$$;
revoke all on function private.artifact_roundtrip_template_context_v1(uuid,uuid)from public,anon,authenticated,service_role;

create or replace function private.artifact_roundtrip_revision_allowed_v1(p_org uuid,p_revision uuid,p_subject uuid,p_export boolean)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare r public.artifact_revisions;a public.artifacts;ids uuid[];node uuid;
begin
 select * into r from public.artifact_revisions where organization_id=p_org and id=p_revision;
 select * into a from public.artifacts where organization_id=p_org and id=r.artifact_id;
 if r.id is null or a.id is null or not private.evaluate_resource_policy_v1(p_org,a.work_id,p_subject,'read',case when p_export then 'export' else 'analysis' end)
  or not private.artifact_review_sources_allowed_v1(p_org,r.id,p_subject)
  or private.artifact_revision_release_v1(r)='blocked' then return false;end if;
 with recursive ancestry(id,depth) as(select r.id,0 union
 select l.derived_from_revision_id,c.depth+1 from ancestry c join private.artifact_dependency_links l
 on l.organization_id=p_org and l.revision_id=c.id and l.link_kind='artifact_revision' where c.depth<64)
 select array_agg(distinct id) into ids from ancestry;
 foreach node in array ids loop
  begin
   perform private.artifact_roundtrip_template_context_v1(node,p_subject);
  exception when insufficient_privilege then return false;end;
  if not exists(select 1 from public.artifact_revisions where organization_id=p_org and id=node)
   or exists(select 1 from private.artifact_dependency_links l where l.organization_id=p_org and l.revision_id=node
    and ((l.link_kind='artifact_revision' and not(l.derived_from_revision_id=any(ids)))
    or (l.link_kind='source_version' and not private.source_use_allowed_v1(p_org,l.source_version_id,p_subject,case when p_export then 'export' else 'read' end,case when p_export then 'export' else 'analysis' end))))
  then return false;end if;
 end loop;
 return true;
end;
$$;


create function private.artifact_import_processor_context_v1(t private.artifact_roundtrip_tasks)
returns jsonb language plpgsql security definer set search_path=''as $$
declare c public.artifact_import_candidates;v public.source_versions;receipt public.artifact_export_receipts;r public.artifact_revisions;blocks jsonb;
begin
 if t.operation not in ('import','import_scan') then return '{}'::jsonb;end if;
 select * into strict c from public.artifact_import_candidates where organization_id=t.organization_id and id=t.import_candidate_id;
 select * into strict v from public.source_versions where organization_id=t.organization_id and id=c.source_version_id;
 if t.operation='import_scan' then return jsonb_build_object('importCandidate',jsonb_build_object('id',c.id,'artifactId',c.artifact_id,'expectedHeadRevisionId',coalesce(c.compared_head_revision_id,c.head_revision_id_at_submit),'manualMappings',c.manual_mappings,'source',jsonb_build_object('versionId',v.id,'bucket',v.bucket_id,'path',v.object_path,'sha256',v.declared_sha256,'byteLength',v.byte_size,'mimeType',v.mime_type,'originalName',v.original_name,'documentVersion',v.legacy_document_version,'operationId',t.id,'verification','pending_scan','binding',jsonb_build_object('organizationId',v.organization_id,'sourceDocumentId',v.id,'documentVersion',v.legacy_document_version,'expectedSha256',v.declared_sha256,'expectedByteSize',v.byte_size,'originalName',v.original_name,'declaredMediaType',v.mime_type,'operationId',t.id))));end if;
 select * into receipt from public.artifact_export_receipts where organization_id=t.organization_id and id=c.export_receipt_id;
 select * into strict r from public.artifact_revisions where organization_id=t.organization_id and id=coalesce(c.compared_head_revision_id,c.head_revision_id_at_submit);
 select coalesce(jsonb_agg(jsonb_build_object('blockKey',block_key,'kind',kind,'content',content,'claims',claims) order by block_no),'[]') into blocks from public.artifact_blocks where organization_id=t.organization_id and revision_id=r.id;
 return jsonb_build_object('importCandidate',jsonb_build_object('id',c.id,'artifactId',c.artifact_id,'expectedHeadRevisionId',coalesce(c.compared_head_revision_id,c.head_revision_id_at_submit),'manualMappings',c.manual_mappings,
 'source',jsonb_build_object('versionId',v.id,'bucket',v.bucket_id,'path',v.object_path,'sha256',v.declared_sha256,'byteLength',v.byte_size,'mimeType',v.mime_type,
 'verification','clean_observed'),
 'baseReceipt',case when receipt.id is null then null else jsonb_build_object('id',receipt.id,'revisionId',receipt.revision_id,'revisionManifestFingerprint',receipt.revision_manifest_fingerprint,
 'logicalManifestFingerprint',receipt.logical_manifest_fingerprint,'rendererVersion',receipt.renderer_version,'sha256',receipt.content_sha256,'byteLength',receipt.byte_length,
 'roundtripManifest',receipt.roundtrip_manifest,'variant',receipt.variant,'format',receipt.format,'locale',receipt.locale,'issuedAt',receipt.issued_at,'storage',jsonb_build_object('bucket',receipt.bucket_id,'path',receipt.object_path))end,
 'headRevision',jsonb_build_object('id',r.id,'artifactId',r.artifact_id,'revisionNo',r.revision_no,'manifest',r.manifest,'manifestFingerprint',r.manifest_fingerprint,
 'logicalManifestFingerprint',private.artifact_roundtrip_logical_fingerprint_v1(r.manifest),'issuedAt',date_trunc('milliseconds',r.created_at)),'headBlocks',blocks,'headProducer',private.artifact_roundtrip_producer_context_v1(r.id),'headTemplateBody',private.artifact_roundtrip_template_context_v1(r.id,t.requested_by)));
end;$$;
alter function private.worker_claim_artifact_roundtrip_v1(text)rename to worker_claim_artifact_roundtrip_before_import_v1;
revoke all on function private.worker_claim_artifact_roundtrip_before_import_v1(text)from public,anon,authenticated,service_role;
create function private.worker_claim_artifact_roundtrip_v1(p_worker_token text)returns jsonb language plpgsql security definer set search_path=''as $$
declare result jsonb;t private.artifact_roundtrip_tasks;
begin
 result:=private.worker_claim_artifact_roundtrip_before_import_v1(p_worker_token);
 if result->>'claimed'='true' then
 select * into strict t from private.artifact_roundtrip_tasks where id=(result->>'taskId')::uuid;
 result:=private.artifact_roundtrip_claim_context_v1(t,result->>'capabilityToken');
 end if;
 return result;
end;$$;
-- SQL-language wrapper must be replaced after the rename, so it calls the import-aware entry.
create or replace function public.worker_claim_artifact_roundtrip_v1(p_worker_token text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_claim_artifact_roundtrip_v1(p_worker_token);$$;

create function private.worker_revalidate_artifact_roundtrip_v1(p_task_id uuid,p_capability_token text)returns jsonb language plpgsql security definer set search_path=''as $$
declare t private.artifact_roundtrip_tasks:=private.require_artifact_roundtrip_task_v1(p_task_id,p_capability_token);
begin return jsonb_build_object('taskId',t.id,'valid',true,'leaseExpiresAt',t.lease_expires_at)||private.artifact_import_processor_context_v1(t);end;$$;
create function public.worker_revalidate_artifact_roundtrip_v1(p_task_id uuid,p_capability_token text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_revalidate_artifact_roundtrip_v1(p_task_id,p_capability_token);$$;

create function private.validate_artifact_import_comparison_v1(p_comparison jsonb,p_contributions jsonb)
returns void language plpgsql immutable set search_path=''as $$
declare d jsonb;b jsonb;a jsonb;
begin
 if p_comparison is null or jsonb_typeof(p_comparison)<>'object' or coalesce(p_comparison->>'status','') not in ('candidate','unmatched')
 or jsonb_typeof(p_comparison->'differences')is distinct from'array' or jsonb_array_length(p_comparison->'differences')>15000
 or octet_length(p_comparison::text)>8388608 or p_contributions is null or jsonb_typeof(p_contributions)<>'object'
 or not(p_contributions ?& array['assumptionChanges','blockProposals','observations','conflicts'])
 or p_contributions-array['assumptionChanges','blockProposals','observations','conflicts']<>'{}'
 or octet_length(p_contributions::text)>1048576 then raise exception 'artifact_import_comparison_invalid'using errcode='22023';end if;
 for d in select value from jsonb_array_elements(p_comparison->'differences')loop
 if jsonb_typeof(d)<>'object' or length(coalesce(d->>'key',''))not between 1 and 300
 or d->>'classification' not in ('unchanged','edited','conflict','missing','unmatched','formula_changed','recorded_edited')
 or jsonb_typeof(d->'alreadyPresent')<>'boolean' then raise exception 'artifact_import_comparison_invalid'using errcode='22023';end if;
 end loop;
 if (select count(*)<>count(distinct value->>'key')from jsonb_array_elements(p_comparison->'differences'))then raise exception 'artifact_import_comparison_invalid'using errcode='22023';end if;
 foreach a in array array[p_contributions->'assumptionChanges',p_contributions->'blockProposals',p_contributions->'observations',p_contributions->'conflicts']loop
 if jsonb_typeof(a)is distinct from'array' or jsonb_array_length(a)>1000 then raise exception 'artifact_import_contributions_invalid'using errcode='22023';end if;end loop;
 for d in select value from jsonb_array_elements(p_contributions->'assumptionChanges')loop
 if d-array['assumptionId','period','approved','proposed','configurationId']<>'{}' or length(coalesce(d->>'assumptionId',''))not between 1 and 160 or length(coalesce(d->>'period',''))not between 1 and 80
 or length(coalesce(d->>'approved',''))>100 or length(coalesce(d->>'proposed',''))>100 or(d?'configurationId'and coalesce(d->>'configurationId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
 or coalesce(d->>'approved','')!~'^-?[0-9]+(\.[0-9]+)?$' or coalesce(d->>'proposed','')!~'^-?[0-9]+(\.[0-9]+)?$' or d->>'approved'=d->>'proposed'
 then raise exception 'artifact_import_contributions_invalid'using errcode='22023';end if;end loop;
 for b in select value from jsonb_array_elements(p_contributions->'blockProposals')loop
 if b-array['blockKey','content','claims','supportIds','detachedClaimIds']<>'{}' or coalesce(b->>'blockKey','')!~'^[^[:space:]]{1,160}$'
 or b->'claims' is distinct from '[]'::jsonb or b->'supportIds' is distinct from '[]'::jsonb or jsonb_typeof(b->'content')<>'object'
 or (b->'content')-array['text']<>'{}'or jsonb_typeof(b#>'{content,text}')is distinct from'string'or length(b#>>'{content,text}')>200000
 or jsonb_typeof(b->'detachedClaimIds')<>'array' then raise exception 'artifact_import_contributions_invalid'using errcode='22023';end if;end loop;
end;$$;

create function private.worker_commit_artifact_import_comparison_v1(p_task_id uuid,p_capability_token text,p_comparison jsonb,p_contributions jsonb)
returns jsonb language plpgsql security definer set search_path=''as $$
declare t private.artifact_roundtrip_tasks:=private.require_artifact_roundtrip_task_v1(p_task_id,p_capability_token);c public.artifact_import_candidates;a public.artifacts;fp text;
begin
 if t.operation<>'import'then raise exception 'artifact_import_worker_denied'using errcode='42501';end if;
 perform private.validate_artifact_import_comparison_v1(p_comparison,p_contributions);
 select * into strict c from public.artifact_import_candidates where organization_id=t.organization_id and id=t.import_candidate_id for update;
 select * into strict a from public.artifacts where organization_id=t.organization_id and id=c.artifact_id for update;
 if a.head_revision_id is distinct from coalesce(c.compared_head_revision_id,c.head_revision_id_at_submit) then
 update public.artifact_import_candidates set status='stale',reason='head_changed'where id=c.id;
 update private.artifact_roundtrip_tasks set state='completed',capability_sha256=null,lease_expires_at=null where id=t.id;
 return jsonb_build_object('candidateId',c.id,'status','stale','reason','head_changed');end if;
 if p_comparison->>'status'='candidate'and(p_comparison->>'baseRevisionId'is distinct from c.base_revision_id::text
 or p_comparison->>'headRevisionId'is distinct from a.head_revision_id::text
 or p_comparison#>>'{baseManifest,logicalManifestFingerprint}'is distinct from c.base_manifest_fingerprint
 or p_comparison->'baseManifest'is distinct from(select roundtrip_manifest from public.artifact_export_receipts where id=c.export_receipt_id))
 then raise exception 'artifact_import_comparison_basis_invalid'using errcode='22023';end if;
 -- Preserve pending groups when recomparing the original upload after a partial adoption.
 -- A committed human event, not an Office cache, proves an exact proposal was already accepted.
 p_contributions:=jsonb_set(p_contributions,'{assumptionChanges}',(select coalesce(jsonb_agg(x),'[]')from jsonb_array_elements(p_contributions->'assumptionChanges')x
 where not exists(select 1 from private.artifact_import_events e cross join lateral jsonb_array_elements(coalesce(e.payload->'adoptedChanges','[]'))accepted
 where e.organization_id=c.organization_id and e.candidate_id=c.id and e.kind='adopted'and accepted=x)));
 fp:=encode(extensions.digest(convert_to(jsonb_build_object('comparison',p_comparison,'contributions',p_contributions)::text,'utf8'),'sha256'),'hex');
 update public.artifact_import_candidates set comparison=p_comparison,contributions=p_contributions,comparison_fingerprint=fp,compared_head_revision_id=a.head_revision_id,
 status=case when p_comparison->>'status'='unmatched'then'unmatched'else'candidate'end,reason=case when p_comparison->>'status'='unmatched'then'manifest_unmatched'end where id=c.id returning*into c;
 update private.artifact_roundtrip_tasks set state='completed',capability_sha256=null,lease_expires_at=null where id=t.id;
 insert into private.artifact_import_events(organization_id,candidate_id,command_id,kind,actor_id,payload)
 values(c.organization_id,c.id,t.id,'compared',auth.uid(),jsonb_build_object('comparisonFingerprint',fp,'headRevisionId',a.head_revision_id,'status',c.status));
 return jsonb_build_object('candidateId',c.id,'status',c.status,'comparisonFingerprint',fp);
end;$$;
create function public.worker_commit_artifact_import_comparison_v1(p_task_id uuid,p_capability_token text,p_comparison jsonb,p_contributions jsonb)
returns jsonb language sql security invoker set search_path=''as $$select private.worker_commit_artifact_import_comparison_v1(p_task_id,p_capability_token,p_comparison,p_contributions);$$;

-- Only this task's verified upload, historical export and current revision are readable by its leased worker.
create or replace function private.artifact_roundtrip_storage_allowed_v1(p_bucket text,p_path text,p_write boolean)
returns boolean language plpgsql volatile security definer set search_path=''as $$
declare t private.artifact_roundtrip_tasks;receipt public.artifact_export_receipts;r public.artifact_revisions;c public.artifact_import_candidates;template_body jsonb;
begin
 if auth.uid()is null then return false;end if;
 if not p_write and p_bucket='case-artifacts'then
 for receipt in select*from public.artifact_export_receipts where bucket_id=p_bucket and object_path=p_path loop
 if private.artifact_roundtrip_revision_allowed_v1(receipt.organization_id,receipt.revision_id,auth.uid(),true)then return true;end if;end loop;end if;
 for t in select x.*from private.artifact_roundtrip_tasks x join private.worker_tokens w on w.id=x.worker_token_id join auth.users u on u.id=x.worker_account_id
 where x.state='leased'and x.worker_account_id=auth.uid()and x.lease_expires_at>clock_timestamp()and w.status='active'and w.revoked_at is null
 and w.execution_account_user_id=auth.uid()and u.deleted_at is null and(u.banned_until is null or u.banned_until<=clock_timestamp())loop
 if not private.artifact_roundtrip_task_allowed_v1(t)then continue;end if;
 if p_bucket='case-artifacts'and t.operation='export'and t.output_path=p_path then return true;end if;
 if not p_write then
 if t.operation<>'import_scan'and p_bucket='brand-templates'then
 template_body:=private.artifact_roundtrip_template_context_v1(t.revision_id,t.requested_by);
 if template_body#>>'{definition,logo,object_path}'=p_path then return true;end if;
 if t.operation='import'then
 select*into c from public.artifact_import_candidates where organization_id=t.organization_id and id=t.import_candidate_id;
 template_body:=private.artifact_roundtrip_template_context_v1(coalesce(c.compared_head_revision_id,c.head_revision_id_at_submit),t.requested_by);
 if template_body#>>'{definition,logo,object_path}'=p_path then return true;end if;
 end if;end if;
 if t.operation<>'import_scan'and private.artifact_roundtrip_material_storage_allowed_v1(t.organization_id,t.revision_id,t.requested_by,p_bucket,p_path)then return true;end if;
 select*into r from public.artifact_revisions where organization_id=t.organization_id and id=t.revision_id;
 if t.operation<>'import_scan'and r.manifest#>>'{bytes,storage,bucket}'=p_bucket and r.manifest#>>'{bytes,storage,path}'=p_path then return true;end if;
 if t.operation in('import','import_scan')then
 select*into c from public.artifact_import_candidates where organization_id=t.organization_id and id=t.import_candidate_id;
 if exists(select 1 from public.source_versions where organization_id=t.organization_id and id=c.source_version_id and bucket_id=p_bucket and object_path=p_path)
 or(t.operation='import'and exists(select 1 from public.artifact_export_receipts where organization_id=t.organization_id and id=c.export_receipt_id and bucket_id=p_bucket and object_path=p_path))
 then return true;end if;
 select*into r from public.artifact_revisions where organization_id=t.organization_id and id=coalesce(c.compared_head_revision_id,c.head_revision_id_at_submit);
 if t.operation='import'and private.artifact_roundtrip_material_storage_allowed_v1(t.organization_id,r.id,t.requested_by,p_bucket,p_path)then return true;end if;
 if t.operation='import'and r.manifest#>>'{bytes,storage,bucket}'=p_bucket and r.manifest#>>'{bytes,storage,path}'=p_path then return true;end if;
 end if;end if;end loop;
 return false;
end;$$;

create function private.recompare_artifact_import_v1(p_candidate_id uuid,p_expected_head_revision_id uuid,p_command_id uuid)
returns jsonb language plpgsql security definer set search_path=''as $$
declare c public.artifact_import_candidates;a public.artifacts;t private.artifact_roundtrip_tasks;e private.artifact_import_events;
begin
 select*into c from public.artifact_import_candidates where id=p_candidate_id;
 perform private.lock_review_work_v1(c.work_id);
 select*into c from public.artifact_import_candidates where id=p_candidate_id for update;
 if c.status in('applied','discarded')or p_command_id is null or c.base_revision_id is null then raise exception 'artifact_import_recompare_invalid'using errcode='22023';end if;
 select*into a from public.artifacts where organization_id=c.organization_id and id=c.artifact_id for update;
 if a.head_revision_id is distinct from p_expected_head_revision_id then raise exception 'artifact_import_stale'using errcode='40001';end if;
 if not private.artifact_import_source_allowed_v1(c.organization_id,c.work_id,c.source_version_id,auth.uid(),'process')
 or not private.artifact_roundtrip_revision_allowed_v1(c.organization_id,c.base_revision_id,auth.uid(),false)
 or not private.artifact_roundtrip_revision_allowed_v1(c.organization_id,a.head_revision_id,auth.uid(),false)then raise exception 'artifact_import_source_denied'using errcode='42501';end if;
 select*into e from private.artifact_import_events where organization_id=c.organization_id and candidate_id=c.id and command_id=p_command_id;
 if e.id is not null then
 if e.kind<>'recompare'or e.payload->>'headRevisionId'is distinct from a.head_revision_id::text then raise exception 'artifact_import_command_conflict'using errcode='23505';end if;
 return jsonb_build_object('candidateId',c.id,'status',c.status,'taskId',e.payload->>'taskId','replayed',true);end if;
 update private.artifact_roundtrip_tasks set state='cancelled',capability_sha256=null,lease_expires_at=null where organization_id=c.organization_id and import_candidate_id=c.id and state in('queued','leased');
 insert into private.artifact_roundtrip_tasks(organization_id,work_id,revision_id,operation,format,locale,variant,requested_by,command_id,import_candidate_id)
 select c.organization_id,c.work_id,c.base_revision_id,'import',c.format,c.locale,r.variant,auth.uid(),p_command_id,c.id from public.artifact_export_receipts r where organization_id=c.organization_id and id=c.export_receipt_id returning*into t;
 insert into private.artifact_import_events(organization_id,candidate_id,command_id,kind,actor_id,payload)
 values(c.organization_id,c.id,p_command_id,'recompare',auth.uid(),jsonb_build_object('taskId',t.id,'headRevisionId',a.head_revision_id,'previousComparison',c.comparison,'previousContributions',c.contributions,'previousFingerprint',c.comparison_fingerprint));
 update public.artifact_import_candidates set status='queued',reason=null,compared_head_revision_id=a.head_revision_id where id=c.id;
 return jsonb_build_object('candidateId',c.id,'status','queued','taskId',t.id,'replayed',false);
end;$$;
create function public.recompare_artifact_import_v1(p_candidate_id uuid,p_expected_head_revision_id uuid,p_command_id uuid)
returns jsonb language sql security invoker set search_path=''as $$select private.recompare_artifact_import_v1(p_candidate_id,p_expected_head_revision_id,p_command_id);$$;

create function private.discard_artifact_import_v1(p_candidate_id uuid,p_command_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''as $$
declare c public.artifact_import_candidates;e private.artifact_import_events;
begin
 select*into c from public.artifact_import_candidates where id=p_candidate_id;
 perform private.lock_review_work_v1(c.work_id);
 select*into c from public.artifact_import_candidates where id=p_candidate_id for update;
 if p_command_id is null or length(coalesce(btrim(p_reason),''))not between 1 and 2000 then raise exception 'artifact_import_discard_invalid'using errcode='22023';end if;
 select*into e from private.artifact_import_events where organization_id=c.organization_id and candidate_id=c.id and command_id=p_command_id;
 if e.id is not null then
 if e.kind<>'discarded'or e.actor_id<>auth.uid()or e.payload->>'reason'is distinct from btrim(p_reason)then raise exception 'artifact_import_command_conflict'using errcode='23505';end if;
 return jsonb_build_object('candidateId',c.id,'status','discarded','replayed',true);end if;
 if c.status in('applied','discarded')then raise exception 'artifact_import_immutable'using errcode='55000';end if;
 insert into private.artifact_import_events(organization_id,candidate_id,command_id,kind,actor_id,payload)values(c.organization_id,c.id,p_command_id,'discarded',auth.uid(),jsonb_build_object('reason',btrim(p_reason)));
 update public.artifact_import_candidates set status='discarded'where id=c.id;
 update private.artifact_roundtrip_tasks set state='cancelled',capability_sha256=null,lease_expires_at=null where organization_id=c.organization_id and import_candidate_id=c.id and state in('queued','leased');
 return jsonb_build_object('candidateId',c.id,'status','discarded','replayed',false);
end;$$;
create function public.discard_artifact_import_v1(p_candidate_id uuid,p_command_id uuid,p_reason text)returns jsonb language sql security invoker set search_path=''as $$select private.discard_artifact_import_v1(p_candidate_id,p_command_id,p_reason);$$;

-- The scan operation is this authoritative task, not a fabricated processing job. job_id in the
-- append-only source verification is historical operation provenance and intentionally has no job FK.
create function private.worker_record_artifact_import_quarantine_v1(p_task_id uuid,p_capability_token text,p_receipt jsonb)
returns jsonb language plpgsql security definer set search_path=''as $$
declare t private.artifact_roundtrip_tasks:=private.require_artifact_roundtrip_task_v1(p_task_id,p_capability_token);
 c public.artifact_import_candidates;v public.source_versions;
begin
 if t.operation<>'import_scan'then raise exception 'artifact_import_scan_denied'using errcode='42501';end if;
 select*into strict c from public.artifact_import_candidates where organization_id=t.organization_id and id=t.import_candidate_id for update;
 select*into strict v from public.source_versions where organization_id=t.organization_id and id=c.source_version_id;
 if not coalesce(jsonb_typeof(p_receipt)='object'and p_receipt->>'verdict'='clean'and p_receipt->>'organizationId'=v.organization_id::text
 and p_receipt->>'sourceDocumentId'=v.id::text and p_receipt->>'operationId'=t.id::text
 and p_receipt->>'documentVersion'=v.legacy_document_version::text
 and p_receipt->>'observedSha256'=v.declared_sha256 and p_receipt->>'expectedSha256'=v.declared_sha256
 and p_receipt->>'observedByteSize'=v.byte_size::text and p_receipt->>'expectedByteSize'=v.byte_size::text
 and p_receipt->>'receiptId'~'^sha256:[a-f0-9]{64}$',false)then raise exception 'artifact_import_scan_receipt_invalid'using errcode='22023';end if;
 insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
 values(v.organization_id,v.id,t.id,v.declared_sha256,v.byte_size,p_receipt->>'receiptId')on conflict(organization_id,job_id,receipt_id)do nothing;
 if c.base_revision_id is not null and not private.artifact_roundtrip_revision_allowed_v1(c.organization_id,c.base_revision_id,t.requested_by,false)then
 update public.artifact_import_candidates set status='stale',reason='source_revoked'where id=c.id;
 update private.artifact_roundtrip_tasks set state='completed',capability_sha256=null,lease_expires_at=null where id=t.id;
 return jsonb_build_object('candidateId',c.id,'status','stale','reason','source_revoked');end if;
 update private.artifact_roundtrip_tasks set operation='import'where id=t.id returning*into t;
 perform private.require_artifact_roundtrip_task_v1(t.id,p_capability_token);
 return jsonb_build_object('taskId',t.id,'candidateId',c.id,'status','clean','operation','import')||private.artifact_import_processor_context_v1(t);
end;$$;
create function public.worker_record_artifact_import_quarantine_v1(p_task_id uuid,p_capability_token text,p_receipt jsonb)returns jsonb language sql security invoker set search_path=''as $$select private.worker_record_artifact_import_quarantine_v1(p_task_id,p_capability_token,p_receipt);$$;
create function public.request_artifact_import_upload_v1(p_candidate_id uuid,p_work_id uuid,p_artifact_id uuid,p_export_receipt_id uuid,p_source_version_id uuid,p_expected_head_revision_id uuid,p_format text,p_locale text,p_command_id uuid)
returns jsonb language sql security invoker set search_path=''as $$select private.submit_artifact_import_v1(p_candidate_id,p_work_id,p_artifact_id,p_export_receipt_id,p_source_version_id,p_expected_head_revision_id,p_format,p_locale,p_command_id);$$;

-- Discovery exposes only authorized head identities; content stays in the revision reader.
create function private.list_work_artifact_heads_v1(p_work_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare org uuid;items jsonb;
begin
 select organization_id into org from public.capital_projects where id=p_work_id and status<>'archived';
 if org is null or not private.evaluate_resource_policy_v1(org,p_work_id,auth.uid(),'read','analysis')then raise exception 'artifact_work_denied'using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',visible.id,'headRevisionId',visible.head_revision_id)order by visible.created_at desc,visible.id),'[]')into items from(
 select a.id,a.head_revision_id,a.created_at from public.artifacts a where a.organization_id=org and a.work_id=p_work_id and a.head_revision_id is not null
 and private.artifact_roundtrip_revision_allowed_v1(org,a.head_revision_id,auth.uid(),false)order by a.created_at desc,a.id limit 100)visible;
 return jsonb_build_object('workId',p_work_id,'artifacts',items);
end;$$;
create function public.list_work_artifact_heads_v1(p_work_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.list_work_artifact_heads_v1(p_work_id);$$;
revoke all on function private.list_work_artifact_heads_v1(uuid),public.list_work_artifact_heads_v1(uuid)from public,anon,authenticated,service_role;
grant execute on function private.list_work_artifact_heads_v1(uuid),public.list_work_artifact_heads_v1(uuid)to authenticated;

create function private.list_artifact_export_receipts_v1(p_artifact_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare a public.artifacts;r public.artifact_export_receipts;items jsonb:='[]';
begin
 select*into a from public.artifacts where id=p_artifact_id;
 if a.id is null or not private.evaluate_resource_policy_v1(a.organization_id,a.work_id,auth.uid(),'read','export')then raise exception 'artifact_export_denied'using errcode='42501';end if;
 for r in select*from public.artifact_export_receipts where organization_id=a.organization_id and artifact_id=a.id order by created_at desc,id limit 100 loop
 if private.artifact_roundtrip_revision_allowed_v1(r.organization_id,r.revision_id,auth.uid(),true)then items:=items||jsonb_build_array(private.read_artifact_export_receipt_v1(r.id));end if;end loop;
 return jsonb_build_object('artifactId',a.id,'receipts',items);
end;$$;
create function public.list_artifact_export_receipts_v1(p_artifact_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.list_artifact_export_receipts_v1(p_artifact_id);$$;
create function private.list_work_artifact_imports_v1(p_work_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare org uuid;c public.artifact_import_candidates;items jsonb:='[]';
begin
 select organization_id into org from public.capital_projects where id=p_work_id;
 if org is null or not private.evaluate_resource_policy_v1(org,p_work_id,auth.uid(),'read','analysis')then raise exception 'artifact_import_denied'using errcode='42501';end if;
 for c in select*from public.artifact_import_candidates where organization_id=org and work_id=p_work_id order by created_at desc,id limit 100 loop
 items:=items||jsonb_build_array(private.read_artifact_import_candidate_v1(c.id));end loop;
 return jsonb_build_object('workId',p_work_id,'candidates',items);
end;$$;
create function public.list_work_artifact_imports_v1(p_work_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.list_work_artifact_imports_v1(p_work_id);$$;

create function private.artifact_roundtrip_claim_context_v1(t private.artifact_roundtrip_tasks,p_capability_token text)
returns jsonb language plpgsql security definer set search_path=''as $$
declare r public.artifact_revisions;blocks jsonb:='[]';producer jsonb;object_id uuid;
begin
 if t.operation<>'import_scan'and t.revision_id is not null then
 select*into r from public.artifact_revisions where organization_id=t.organization_id and id=t.revision_id;
 select coalesce(jsonb_agg(jsonb_build_object('blockKey',block_key,'kind',kind,'content',content,'claims',claims)order by block_no),'[]')into blocks from public.artifact_blocks where organization_id=t.organization_id and revision_id=r.id;
 if r.id is not null then producer:=private.artifact_roundtrip_producer_context_v1(r.id);end if;end if;
 select id into object_id from storage.objects where bucket_id='case-artifacts'and name=t.output_path;
 return jsonb_build_object('claimed',true,'taskId',t.id,'organizationId',t.organization_id,'workId',t.work_id,'operation',t.operation,'format',t.format,'variant',t.variant,'locale',t.locale,
 'capabilityToken',p_capability_token,'leaseExpiresAt',t.lease_expires_at,'requestedBy',t.requested_by,'commandId',t.command_id,'storageObjectId',object_id,
 'revision',case when r.id is not null then jsonb_build_object('id',r.id,'artifactId',r.artifact_id,'revisionNo',r.revision_no,'manifest',r.manifest,'manifestFingerprint',r.manifest_fingerprint,
 'logicalManifestFingerprint',private.artifact_roundtrip_logical_fingerprint_v1(r.manifest),'issuedAt',date_trunc('milliseconds',r.created_at))end,'blocks',blocks,'producer',producer,'templateBody',case when r.id is not null then private.artifact_roundtrip_template_context_v1(r.id,t.requested_by)else null end)||private.artifact_import_processor_context_v1(t);
end;$$;
create or replace function private.worker_revalidate_artifact_roundtrip_v1(p_task_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path=''as $$
declare t private.artifact_roundtrip_tasks:=private.require_artifact_roundtrip_task_v1(p_task_id,p_capability_token);ctx jsonb;
begin ctx:=private.artifact_roundtrip_claim_context_v1(t,p_capability_token);return jsonb_build_object('valid',true,'context',ctx,'storageObjectId',ctx->'storageObjectId');end;$$;

create table private.institutional_artifact_import_receipts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,import_candidate_id uuid not null,
 configuration_id uuid not null,parent_configuration_id uuid not null,source_configuration_id uuid not null,rebase_declared boolean not null,parent_fingerprint text not null,candidate_fingerprint text not null,
 source_version_id uuid not null,rights_version_id uuid not null,author_id uuid not null references auth.users(id),changes jsonb not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),unique(organization_id,configuration_id),
 foreign key(organization_id,work_id)references public.capital_projects(organization_id,id),
 foreign key(organization_id,import_candidate_id)references public.artifact_import_candidates(organization_id,id),
 foreign key(organization_id,configuration_id)references private.institutional_model_configurations(organization_id,id),
 foreign key(organization_id,parent_configuration_id)references private.institutional_model_configurations(organization_id,id),
 foreign key(organization_id,source_configuration_id)references private.institutional_model_configurations(organization_id,id),
 foreign key(organization_id,source_version_id,rights_version_id)references private.source_rights_versions(organization_id,source_version_id,id),
 check(parent_fingerprint~'^[a-f0-9]{64}$'and candidate_fingerprint~'^[a-f0-9]{64}$'),check(configuration_id<>parent_configuration_id),
 check(jsonb_typeof(changes)='array'and jsonb_array_length(changes)between 1 and 500)
);
alter table private.institutional_artifact_import_receipts enable row level security;
alter table private.institutional_artifact_import_receipts force row level security;
revoke all on private.institutional_artifact_import_receipts from public,anon,authenticated,service_role;
create policy institutional_artifact_import_deny on private.institutional_artifact_import_receipts for all to authenticated using(false)with check(false);
create trigger institutional_artifact_import_immutable before update or delete on private.institutional_artifact_import_receipts for each row execute function private.reject_artifact_export_receipt_mutation_v1();
create trigger institutional_artifact_import_audit after insert on private.institutional_artifact_import_receipts for each row execute function private.capture_identity_audit_v1();
create index institutional_artifact_import_parent_idx on private.institutional_artifact_import_receipts(organization_id,parent_configuration_id);
create index institutional_artifact_import_candidate_idx on private.institutional_artifact_import_receipts(organization_id,import_candidate_id);
create index institutional_artifact_import_author_idx on private.institutional_artifact_import_receipts(author_id);

-- Office roundtrip intake is an attested contribution, not a new model input.
-- Preserve the original source-context and approval guards for all actual model evidence.
create or replace function private.institutional_source_context(p_org uuid,p_session uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sources jsonb;candidates jsonb;body jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('sourceDocument',d.id,'version',d.document_version::text,'hash',d.sha256,'hashVerified',d.sha256_verified_at is not null and d.processing_status='ready' and d.scan_result->>'verdict'='clean','originalName',d.original_name) order by d.id),'[]'::jsonb) into sources from public.source_documents d where d.organization_id=p_org and d.intake_session_id=p_session
 and (
  not exists(select 1 from public.artifact_import_candidates imp where imp.organization_id=p_org and imp.source_version_id=d.id)
  or exists(select 1 from private.artifact_import_events e join public.artifact_import_candidates imp on imp.organization_id=e.organization_id and imp.id=e.candidate_id where imp.organization_id=p_org and imp.source_version_id=d.id and e.kind='as_source')
  -- A technical import cannot hide a source already reviewed for a model or accepted as financial evidence.
  or exists(select 1 from private.institutional_model_setup_submissions ss cross join lateral jsonb_array_elements(ss.source_reviews)sr(value) where ss.organization_id=p_org and ss.intake_session_id=p_session and sr.value->>'sourceDocument'=d.id::text)
  or exists(select 1 from public.intake_field_candidates accepted where accepted.organization_id=p_org and accepted.source_document_id=d.id and accepted.review_state='accepted' and accepted.anchor_verified and accepted.value_type='number' and accepted.field_group in('historical_financials','interim_financials'))
 );
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'label',c.label,'field_path',c.field_path,'normalized_value',c.normalized_value#>>'{}','value_type',c.value_type,'source_document_id',c.source_document_id,'evidence_rank',c.evidence_rank,'information_class',c.information_class,'confidence',c.confidence,'period_start',c.period_start,'period_end',c.period_end,'entity_name',c.entity_name,'entity_scope',c.entity_scope,'source_anchor',c.source_anchor,'anchor_verified',c.anchor_verified,'review_state',c.review_state,'reviewed_by',c.reviewed_by,'reviewed_at',c.reviewed_at,'currency',c.currency,'unit',c.unit,'value_scale',c.value_scale,'extraction_document_version',d.document_version,'extraction_source_sha256',d.sha256) order by c.id),'[]'::jsonb) into candidates
 from public.intake_field_candidates c join public.source_documents d on d.organization_id=c.organization_id and d.id=c.source_document_id and d.intake_session_id=c.intake_session_id
 where c.organization_id=p_org and c.intake_session_id=p_session and c.review_state='accepted' and c.anchor_verified and c.value_type='number' and c.field_group in ('historical_financials','interim_financials') and c.entity_name is not null and c.entity_scope in ('consolidated','standalone','segment') and c.period_end is not null and d.sha256_verified_at is not null and d.processing_status='ready' and d.scan_result->>'verdict'='clean'
 and exists(select 1 from public.processing_jobs j where j.organization_id=c.organization_id and j.intake_session_id=c.intake_session_id and j.source_document_id=c.source_document_id and j.processing_run_id=c.processing_run_id and j.kind='document_pipeline' and j.status='succeeded' and j.payload->>'sha256'=d.sha256 and j.payload->>'document_version'=d.document_version::text);
 if jsonb_array_length(sources)>1000 or jsonb_array_length(candidates)>5000 then raise exception 'institutional_source_scope_refinement_required';end if;
 body:=jsonb_build_object('currentSources',sources,'candidates',candidates);
 return body||jsonb_build_object('sourceManifestFingerprint',private.institutional_config_hash(body));
end $$;
revoke all on function private.institutional_source_context(uuid,uuid)from public,anon,authenticated,service_role;

-- Extend the immutable proof with an import receipt; all established origin handlers remain unchanged.
alter function private.institutional_configuration_ancestry_before_review_projection_v1(uuid,uuid,uuid)rename to institutional_configuration_ancestry_before_artifact_import_v1;
revoke all on function private.institutional_configuration_ancestry_before_artifact_import_v1(uuid,uuid,uuid)from public,anon,authenticated,service_role;
create function private.institutional_configuration_ancestry_before_review_projection_v1(p_org uuid,p_work uuid,p_configuration uuid)
returns jsonb language plpgsql stable security definer set search_path=''as $$
declare current_id uuid:=p_configuration;visited uuid[]:='{}';nodes jsonb:='[]';pins jsonb:='[]';proof jsonb;
 c private.institutional_model_configurations;parent private.institutional_model_configurations;source_config private.institutional_model_configurations;r private.institutional_artifact_import_receipts;
 imp public.artifact_import_candidates;rights private.source_rights_versions;v public.source_versions;config jsonb;change jsonb;pos integer;depth integer;
begin
 for depth in 1..128 loop
 if current_id=any(visited)then return jsonb_build_object('state','unresolved','reason','artifact_import_cycle');end if;visited:=array_append(visited,current_id);
 select*into c from private.institutional_model_configurations where organization_id=p_org and capital_project_id=p_work and id=current_id;
 if c.id is null then return jsonb_build_object('state','unresolved','reason','artifact_import_configuration_missing');end if;
 select*into r from private.institutional_artifact_import_receipts where organization_id=p_org and configuration_id=c.id;
 if r.id is null then
 proof:=private.institutional_configuration_ancestry_before_artifact_import_v1(p_org,p_work,c.id);
 if proof->>'state'is distinct from'captured_lineage'then return proof;end if;
 return jsonb_build_object('state','captured_lineage','authorization','not_evaluated','organizationId',p_org,'workId',p_work,'configurationId',p_configuration,
 'nodes',nodes||(proof->'nodes'),'sources',(select coalesce(jsonb_agg(value order by value->>'sourceVersionId',value->>'rightsVersionId'),'[]')from(select distinct value from jsonb_array_elements(pins||(proof->'sources')))u));end if;
 select*into imp from public.artifact_import_candidates where organization_id=p_org and id=r.import_candidate_id;
 select*into parent from private.institutional_model_configurations where organization_id=p_org and id=r.parent_configuration_id;
 select*into source_config from private.institutional_model_configurations where organization_id=p_org and capital_project_id=p_work and id=r.source_configuration_id;
 if source_config.id is null or source_config.configuration_fingerprint is distinct from private.institutional_config_hash(source_config.configuration)or(source_config.id<>parent.id and not r.rebase_declared)then return jsonb_build_object('state','unresolved','reason','artifact_import_rebase_unproven');end if;
 select*into rights from private.source_rights_versions where organization_id=p_org and id=r.rights_version_id and source_version_id=r.source_version_id;
 select*into v from public.source_versions where organization_id=p_org and id=r.source_version_id;
 if (r.work_id,imp.work_id,imp.source_version_id,imp.submitted_by,r.candidate_fingerprint,r.parent_fingerprint)
 is distinct from(p_work,p_work,r.source_version_id,r.author_id,c.configuration_fingerprint,c.parent_fingerprint)
 or c.configuration_fingerprint is distinct from private.institutional_config_hash(c.configuration)
 or parent.configuration_fingerprint is distinct from r.parent_fingerprint
 or parent.configuration_fingerprint is distinct from private.institutional_config_hash(parent.configuration)
 or c.answer_evidence is distinct from jsonb_build_object('kind','imported_workbook_proposal','importCandidateId',imp.id,'uploadFingerprint',imp.upload_sha256,'changes',r.changes,'sourceConfigurationId',source_config.id,'rebaseDeclared',r.rebase_declared)
 or rights.id is null or not exists(select 1 from private.source_version_verifications where organization_id=p_org and source_version_id=v.id and observed_sha256=v.declared_sha256 and observed_byte_size=v.byte_size)
 then return jsonb_build_object('state','unresolved','reason','artifact_import_receipt_mismatch');end if;
 config:=source_config.configuration;
 if source_config.id<>parent.id then
 proof:=private.institutional_configuration_ancestry_v1(p_org,p_work,source_config.id);
 if proof->>'state'is distinct from'captured_lineage'or not private.institutional_configuration_review_effective_v1(p_org,source_config.id)then return jsonb_build_object('state','unresolved','reason','artifact_import_rebase_source_denied');end if;
 pins:=pins||(proof->'sources');nodes:=nodes||(proof->'nodes');end if;
 for change in select value from jsonb_array_elements(r.changes)loop
 select ord-1 into pos from jsonb_array_elements(config#>'{assumptionBook,assumptions}')with ordinality a(value,ord)where value->>'id'=change->>'assumptionId';
 if pos is null or config#>>array['assumptionBook','assumptions',pos::text,'values',change->>'period']is distinct from change->>'approved'then return jsonb_build_object('state','unresolved','reason','artifact_import_assumption_mismatch');end if;
 config:=jsonb_set(config,array['assumptionBook','assumptions',pos::text],(config#>array['assumptionBook','assumptions',pos::text])||jsonb_build_object('values',(config#>array['assumptionBook','assumptions',pos::text,'values'])||jsonb_build_object(change->>'period',change->>'proposed'),
 'sourceType','offroad_scenario','evidence','[]'::jsonb,'confidence','low','rationale','Human contribution imported from an exported workbook.','methodology','artifact-import:'||imp.id::text));end loop;
 if config is distinct from c.configuration then return jsonb_build_object('state','unresolved','reason','artifact_import_application_mismatch');end if;
 nodes:=nodes||jsonb_build_array(jsonb_build_object('kind','artifact_import','configurationId',c.id,'configurationFingerprint',c.configuration_fingerprint,'importCandidateId',imp.id,'receiptId',r.id));
 pins:=pins||jsonb_build_array(jsonb_build_object('sourceVersionId',v.id,'rightsVersionId',rights.id,'declaredSha256',v.declared_sha256));
 current_id:=parent.id;
 end loop;
 return jsonb_build_object('state','unresolved','reason','artifact_import_ancestry_bound');
end;$$;

create function private.apply_institutional_artifact_import_v1(p_candidate uuid,p_changes jsonb,p_command_id uuid,p_locale text,p_self_approval_declared boolean,p_configuration_id uuid,p_rebase_declared boolean)
returns jsonb language plpgsql security definer set search_path=''as $$
declare imp public.artifact_import_candidates;ar public.artifact_revisions;m private.institutional_model_results;c private.institutional_model_configurations;parent private.institutional_model_configurations;
 conf jsonb;change jsonb;pos integer;new_configuration_id uuid:=gen_random_uuid();fp text;rights uuid;proof jsonb;next_revision integer;result jsonb;native_command uuid:=gen_random_uuid();
begin
 select*into strict imp from public.artifact_import_candidates where id=p_candidate;
 select*into strict ar from public.artifact_revisions where organization_id=imp.organization_id and id=imp.compared_head_revision_id;
 select*into m from private.institutional_model_results where organization_id=imp.organization_id and capital_project_id=imp.work_id and id=(ar.manifest#>>'{institutionalResult,id}')::uuid;
 select*into c from private.institutional_model_configurations where organization_id=imp.organization_id and capital_project_id=imp.work_id and id=coalesce(p_configuration_id,m.configuration_id)and status='approved'for update;
 select*into parent from private.institutional_model_configurations where organization_id=imp.organization_id and capital_project_id=imp.work_id and status='approved'order by revision desc limit 1 for update;
 if c.id<>parent.id and not p_rebase_declared then raise exception 'artifact_import_explicit_rebase_required'using errcode='40001';end if;
 if not exists(select 1 from jsonb_array_elements((select roundtrip_manifest from public.artifact_export_receipts where id=imp.export_receipt_id)->'inputs')i where i->>'configurationId'=c.id::text)and c.id<>m.configuration_id then raise exception 'artifact_import_configuration_scope_invalid'using errcode='22023';end if;
 if c.id is null or jsonb_array_length(p_changes)not between 1 and 500 then raise exception 'artifact_import_institutional_basis_invalid'using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_changes)changeset(value)where changeset.value->>'configurationId'is not null and changeset.value->>'configurationId'<>c.id::text)then raise exception 'artifact_import_configuration_scope_stale'using errcode='40001';end if;
 proof:=private.institutional_configuration_ancestry_v1(imp.organization_id,imp.work_id,c.id);
 if proof->>'state'is distinct from'captured_lineage'then raise exception 'institutional_configuration_capture_required'using errcode='42501';end if;
 conf:=c.configuration;
 for change in select value from jsonb_array_elements(p_changes)loop
 select ord-1 into pos from jsonb_array_elements(conf#>'{assumptionBook,assumptions}')with ordinality a(value,ord)where value->>'id'=change->>'assumptionId';
 if pos is null or conf#>>array['assumptionBook','assumptions',pos::text,'values',change->>'period']is distinct from change->>'approved'then raise exception 'artifact_import_stale'using errcode='40001';end if;
 conf:=jsonb_set(conf,array['assumptionBook','assumptions',pos::text],(conf#>array['assumptionBook','assumptions',pos::text])||jsonb_build_object('values',(conf#>array['assumptionBook','assumptions',pos::text,'values'])||jsonb_build_object(change->>'period',change->>'proposed'),
 'sourceType','offroad_scenario','evidence','[]'::jsonb,'confidence','low','rationale','Human contribution imported from an exported workbook.','methodology','artifact-import:'||imp.id::text));end loop;
 fp:=private.institutional_config_hash(conf);
 select coalesce(max(revision),0)+1 into next_revision from private.institutional_model_configurations where organization_id=imp.organization_id and capital_project_id=imp.work_id;
 insert into private.institutional_model_configurations(id,organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_evidence)
 values(new_configuration_id,imp.organization_id,imp.work_id,next_revision,conf,fp,parent.configuration_fingerprint,'review_required',jsonb_build_object('kind','imported_workbook_proposal','importCandidateId',imp.id,'uploadFingerprint',imp.upload_sha256,'changes',p_changes,'sourceConfigurationId',c.id,'rebaseDeclared',p_rebase_declared));
 select r.id into rights from private.source_rights_versions r where organization_id=imp.organization_id and source_version_id=imp.source_version_id order by revision desc limit 1;
 insert into private.institutional_artifact_import_receipts(organization_id,work_id,import_candidate_id,configuration_id,parent_configuration_id,source_configuration_id,rebase_declared,parent_fingerprint,candidate_fingerprint,source_version_id,rights_version_id,author_id,changes)
 values(imp.organization_id,imp.work_id,imp.id,new_configuration_id,parent.id,c.id,p_rebase_declared,parent.configuration_fingerprint,fp,imp.source_version_id,rights,imp.submitted_by,p_changes);
 proof:=private.institutional_configuration_ancestry_before_review_projection_v1(imp.organization_id,imp.work_id,new_configuration_id);
 result:=private.review_institutional_configuration_and_calculate_v2(imp.work_id,new_configuration_id,parent.configuration_fingerprint,'approved',fp,private.institutional_config_hash(proof),native_command,p_locale,p_self_approval_declared);
 return result||jsonb_build_object('configurationId',new_configuration_id,'configurationFingerprint',fp,'resultId',native_command);
end;$$;

-- The complete native v2 command, unchanged except its prospective import preparer receipt.
create or replace function private.review_institutional_configuration_and_calculate_v2(
 p_project_id uuid,p_candidate_id uuid,p_expected_parent_fingerprint text,p_decision text,p_expected_candidate_fingerprint text,
 p_expected_lineage_fingerprint text,p_command_id uuid,p_locale text,p_self_approval_declared boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); org uuid;c private.institutional_model_configurations;p private.institutional_configuration_review_projections;
 proof jsonb;pin jsonb;rights private.source_rights_versions;policy jsonb;mode text;preparer uuid;versions uuid[];basis jsonb;receipt uuid;
 decision jsonb;result jsonb;op text;rows_before integer;rows_after integer;node jsonb;precedence jsonb;
begin
 if p_command_id is null or p_self_approval_declared is null or p_decision is null or p_decision not in ('approved','rejected')
  or p_locale is null or p_locale not in ('pt-BR','en-US') or p_expected_candidate_fingerprint is null or p_expected_candidate_fingerprint !~ '^[a-f0-9]{64}$'
  or p_expected_lineage_fingerprint is null or p_expected_lineage_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'institutional_native_review_invalid' using errcode='22023';end if;
 select organization_id into org from public.capital_projects where id=p_project_id and status<>'archived';
 -- Check before taking a foreign work lock; administrator/member status is not authority.
 if org is null or not private.can_access_resource_v1(org,p_project_id,'read') then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 perform 1 from auth.users where id=actor and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=org and id=p_project_id and status<>'archived' for no key update;
 if not found then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||org::text,0));
 perform 1 from public.organization_memberships where organization_id=org and user_id=actor and status='active' for share nowait;
 if not found or not private.can_access_resource_v1(org,p_project_id,'read') then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 policy:=private.review_policy_snapshot_v1(org,p_project_id,actor);
 if ((policy->>'assignmentRequired')::boolean and not (policy->'roles' ? 'approver' or (p_decision='rejected' and policy->'roles' ? 'reviewer')))
  or (not (policy->>'assignmentRequired')::boolean and not private.can_access_resource_v1(org,p_project_id,'work'))
 then raise exception 'review_assignment_required' using errcode='42501';end if;
 mode:=case when (policy->>'assignmentRequired')::boolean then 'assigned' when (policy->>'selfApprovalAllowed')::boolean then 'individual' else 'open' end;
 select * into c from private.institutional_model_configurations where organization_id=org and capital_project_id=p_project_id and id=p_candidate_id for share nowait;
 if c.id is null or c.configuration_fingerprint is distinct from p_expected_candidate_fingerprint or c.parent_fingerprint is distinct from p_expected_parent_fingerprint then raise exception 'institutional_review_stale' using errcode='40001';end if;
 -- Lock mutable evidence before evaluating the immutable configuration chain.
 perform m.id from public.agent_messages m join private.institutional_contribution_receipts cr on (cr.organization_id,cr.message_id)=(m.organization_id,m.id)
 where cr.organization_id=org and cr.work_id=p_project_id order by m.id for share of m nowait;
 proof:=private.institutional_configuration_ancestry_before_review_projection_v1(org,p_project_id,c.id);
 if proof->>'state' is distinct from 'captured_lineage' then raise exception 'institutional_configuration_capture_required' using errcode='42501';end if;
 for node in select value from jsonb_array_elements(proof->'nodes') loop
  if node->>'configurationId'<>c.id::text and not private.institutional_configuration_review_effective_v1(org,(node->>'configurationId')::uuid)
   then raise exception 'institutional_configuration_ancestor_review_required' using errcode='42501';end if;
 end loop;
 if private.institutional_config_hash(proof) is distinct from p_expected_lineage_fingerprint then raise exception 'institutional_review_lineage_changed' using errcode='40001';end if;
 select coalesce((select author_id from private.institutional_contribution_receipts where organization_id=org and candidate_id=c.id),
  (select submitted_by from private.institutional_model_setup_submissions where organization_id=org and candidate_id=c.id),
  (select author_id from private.institutional_artifact_import_receipts where organization_id=org and configuration_id=c.id)) into preparer;
 if preparer is null then raise exception 'institutional_review_preparer_unproven' using errcode='42501';end if;
 if p_decision='approved' and preparer=actor and (not (policy->>'selfApprovalAllowed')::boolean or not p_self_approval_declared) then raise exception 'capital_project_self_approval_forbidden' using errcode='42501';end if;
 for pin in select value from jsonb_array_elements(proof->'sources') order by value->>'sourceVersionId',value->>'rightsVersionId' loop
  select rr.* into rights from private.source_rights_versions rr join public.source_versions sv on (sv.organization_id,sv.id)=(rr.organization_id,rr.source_version_id)
   where rr.organization_id=org and rr.id=(pin->>'rightsVersionId')::uuid and rr.source_version_id=(pin->>'sourceVersionId')::uuid and sv.declared_sha256=pin->>'declaredSha256' for share of rr nowait;
  if rights.id is null or not (array['read','process','store','derive']::text[] <@ rights.operations) or not ('analysis'=any(rights.purposes))
   or rights.valid_from>clock_timestamp() or rights.expires_at<=clock_timestamp() or rights.store_until<=clock_timestamp() then raise exception 'institutional_review_source_denied' using errcode='42501';end if;
  foreach op in array array['read','process','store','derive'] loop
   if not private.source_use_allowed_v1(org,rights.source_version_id,actor,op,'analysis') then raise exception 'institutional_review_source_denied' using errcode='42501';end if;
  end loop;
 end loop;
 select * into p from private.institutional_configuration_review_projections where organization_id=org and command_id=p_command_id;
 if p.id is not null then
  if (p.work_id,p.configuration_id,p.actor_id,p.outcome,p.locale,p.self_approval_declared,p.lineage_fingerprint)
   is distinct from (p_project_id,c.id,actor,p_decision,p_locale,p_self_approval_declared,p_expected_lineage_fingerprint) then raise exception 'institutional_native_review_replay_mismatch' using errcode='23505';end if;
  precedence:=private.work_decision_precedence_v1(org,p_project_id,'configuration:'||c.id::text);
  if precedence->>'state'<>'current' or precedence->>'currentId'<>p.decision_id::text then raise exception 'institutional_configuration_review_not_effective' using errcode='42501';end if;
  return jsonb_build_object('candidateId',c.id,'status',p.outcome,'decisionId',p.decision_id,'requestId',p.command_id,'replayed',true);
 end if;
 if c.status<>'review_required' or exists(select 1 from private.institutional_configuration_review_projections where organization_id=org and configuration_id=c.id) then raise exception 'institutional_review_stale' using errcode='40001';end if;
 select coalesce(array_agg(distinct (value->>'sourceVersionId')::uuid order by (value->>'sourceVersionId')::uuid),'{}'::uuid[]) into versions from jsonb_array_elements(proof->'sources');
 basis:=jsonb_build_object('configurationFingerprint',c.configuration_fingerprint,'structureFingerprint',null,'uploadFingerprint',null);
 receipt:=private.record_review_basis_receipt_v1(org,p_project_id,'configuration',basis,versions,'institutional_configuration');
 decision:=private.append_work_decision_v1(org,p_project_id,'configuration:'||c.id::text,'approve_configuration',
  jsonb_build_object('artifacts','[]'::jsonb,'milestones','[]'::jsonb,'assessments','[]'::jsonb,'decisions','[]'::jsonb,'execution',null,'configuration',basis),
  case p_decision when 'approved' then array['recompute']::text[] else array['none']::text[] end,'in_product',null,null,actor,null,p_command_id,mode,policy,
  jsonb_build_object('table','institutional_model_configurations','id',c.id),p_outcome=>p_decision);
 if (decision->>'contested')::boolean then raise exception 'institutional_native_review_contested' using errcode='40001';end if;
 insert into private.institutional_configuration_review_projections(organization_id,work_id,configuration_id,decision_id,basis_receipt_id,command_id,actor_id,prepared_by,self_approval_declared,outcome,locale,lineage_fingerprint)
 values(org,p_project_id,c.id,(decision->>'decisionId')::uuid,receipt,p_command_id,actor,preparer,p_self_approval_declared,p_decision,p_locale,p_expected_lineage_fingerprint);
 select count(*) into rows_before from private.institutional_model_results where organization_id=org and id=p_command_id;
 if rows_before<>0 then raise exception 'institutional_native_review_request_reused' using errcode='23505';end if;
 result:=private.apply_institutional_configuration_calculation_before_projection_v1(p_project_id,c.id,p_expected_parent_fingerprint,p_decision,c.configuration_fingerprint,p_command_id,p_locale);
 select count(*) into rows_after from private.institutional_model_results where organization_id=org and id=p_command_id and configuration_id=c.id and requested_by=actor;
 if rows_after<>(case p_decision when 'approved' then 1 else 0 end) then raise exception 'institutional_native_review_effect_missing' using errcode='23514';end if;
 -- Recheck source access after the queue and canonical projection; exception rolls back everything.
 for pin in select value from jsonb_array_elements(proof->'sources') loop
  foreach op in array array['read','process','store','derive'] loop
   if not private.source_use_allowed_v1(org,(pin->>'sourceVersionId')::uuid,actor,op,'analysis') then raise exception 'institutional_review_source_denied' using errcode='42501';end if;
  end loop;
 end loop;
 return result||jsonb_build_object('decisionId',decision->'decisionId','basisReceiptId',receipt,'lineageFingerprint',p_expected_lineage_fingerprint,'replayed',false);
end $$;

alter table public.artifact_import_candidates add column manual_mappings jsonb not null default '[]'check(jsonb_typeof(manual_mappings)='array'and jsonb_array_length(manual_mappings)<=1000);
create function private.keep_artifact_import_as_source_v1(p_candidate_id uuid,p_command_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''as $$
declare c public.artifact_import_candidates;e private.artifact_import_events;
begin
 select*into c from public.artifact_import_candidates where id=p_candidate_id;perform private.lock_review_work_v1(c.work_id);
 select*into c from public.artifact_import_candidates where id=p_candidate_id for update;
 if p_command_id is null or length(coalesce(btrim(p_reason),''))not between 1 and 2000 then raise exception 'artifact_import_source_choice_invalid'using errcode='22023';end if;
 if not private.artifact_import_source_allowed_v1(c.organization_id,c.work_id,c.source_version_id,auth.uid(),'read')then raise exception 'artifact_import_source_denied'using errcode='42501';end if;
 select*into e from private.artifact_import_events where organization_id=c.organization_id and candidate_id=c.id and command_id=p_command_id;
 if e.id is not null then
 if e.kind<>'as_source'or e.actor_id<>auth.uid()or e.payload->>'reason'is distinct from btrim(p_reason)then raise exception 'artifact_import_command_conflict'using errcode='23505';end if;
 return jsonb_build_object('candidateId',c.id,'status','discarded','sourceVersionId',c.source_version_id,'replayed',true);end if;
 if c.status in('applied','discarded')then raise exception 'artifact_import_immutable'using errcode='55000';end if;
 insert into private.artifact_import_events(organization_id,candidate_id,command_id,kind,actor_id,payload)values(c.organization_id,c.id,p_command_id,'as_source',auth.uid(),jsonb_build_object('sourceVersionId',c.source_version_id,'reason',btrim(p_reason)));
 update public.artifact_import_candidates set status='discarded'where id=c.id;
 update private.artifact_roundtrip_tasks set state='cancelled',capability_sha256=null,lease_expires_at=null where organization_id=c.organization_id and import_candidate_id=c.id and state in('queued','leased');
 return jsonb_build_object('candidateId',c.id,'status','discarded','sourceVersionId',c.source_version_id,'replayed',false);
end;$$;
create function public.keep_artifact_import_as_source_v1(p_candidate_id uuid,p_command_id uuid,p_reason text)returns jsonb language sql security invoker set search_path=''as $$select private.keep_artifact_import_as_source_v1(p_candidate_id,p_command_id,p_reason);$$;

create function private.match_artifact_import_v1(p_candidate_id uuid,p_export_receipt_id uuid,p_expected_head_revision_id uuid,p_mappings jsonb,p_command_id uuid)
returns jsonb language plpgsql security definer set search_path=''as $$
declare c public.artifact_import_candidates;r public.artifact_export_receipts;a public.artifacts;m jsonb;e private.artifact_import_events;t private.artifact_roundtrip_tasks;
begin
 select*into c from public.artifact_import_candidates where id=p_candidate_id;perform private.lock_review_work_v1(c.work_id);
 select*into c from public.artifact_import_candidates where id=p_candidate_id for update;
 select*into a from public.artifacts where organization_id=c.organization_id and id=c.artifact_id for update;
 select*into r from public.artifact_export_receipts where organization_id=c.organization_id and artifact_id=c.artifact_id and format=c.format and locale=c.locale and id=p_export_receipt_id;
 if r.id is null or not private.artifact_roundtrip_revision_allowed_v1(c.organization_id,r.revision_id,auth.uid(),false)or not private.artifact_import_source_allowed_v1(c.organization_id,c.work_id,c.source_version_id,auth.uid(),'process')then raise exception 'artifact_import_denied'using errcode='42501';end if;
 if a.head_revision_id is distinct from p_expected_head_revision_id then raise exception 'artifact_import_stale'using errcode='40001';end if;
 if p_command_id is null or p_mappings is null or jsonb_typeof(p_mappings)<>'array'or jsonb_array_length(p_mappings)not between 1 and 1000 then raise exception 'artifact_import_mapping_invalid'using errcode='22023';end if;
 for m in select value from jsonb_array_elements(p_mappings)loop
 if m-array['receivedKey','blockKey']<>'{}'or length(coalesce(m->>'receivedKey',''))not between 1 and 300
 or not exists(select 1 from jsonb_array_elements(c.comparison->'differences')d where d->>'key'=m->>'receivedKey'and d->>'classification'='unmatched'and d#>>'{received,role}'='text')
 or not(exists(select 1 from public.artifact_blocks where organization_id=c.organization_id and revision_id=r.revision_id and block_key=m->>'blockKey'and kind in('section','paragraph'))
 or exists(select 1 from jsonb_array_elements(r.roundtrip_manifest->'blocks')b where b->>'blockKey'=m->>'blockKey'and b->>'kind'in('section','paragraph')and b->>'recorded'='false'))
 then raise exception 'artifact_import_mapping_invalid'using errcode='22023';end if;end loop;
 if(select count(*)<>count(distinct value->>'receivedKey')or count(*)<>count(distinct value->>'blockKey')from jsonb_array_elements(p_mappings))then raise exception 'artifact_import_mapping_invalid'using errcode='22023';end if;
 select*into e from private.artifact_import_events where organization_id=c.organization_id and candidate_id=c.id and command_id=p_command_id;
 if e.id is not null then
 if e.kind<>'matched'or e.actor_id<>auth.uid()or e.payload->'mappings'is distinct from p_mappings or e.payload->>'exportReceiptId'is distinct from r.id::text then raise exception 'artifact_import_command_conflict'using errcode='23505';end if;
 return jsonb_build_object('candidateId',c.id,'status',c.status,'taskId',e.payload->>'taskId','replayed',true);end if;
 if c.status not in('unmatched','candidate')then raise exception 'artifact_import_mapping_invalid'using errcode='22023';end if;
 update public.artifact_import_candidates set export_receipt_id=r.id,base_revision_id=r.revision_id,base_manifest_fingerprint=r.logical_manifest_fingerprint,
 compared_head_revision_id=a.head_revision_id,status='queued',reason=null,manual_mappings=p_mappings where id=c.id;
 insert into private.artifact_roundtrip_tasks(organization_id,work_id,revision_id,operation,format,locale,variant,requested_by,command_id,import_candidate_id)
 values(c.organization_id,c.work_id,r.revision_id,'import',c.format,c.locale,r.variant,auth.uid(),p_command_id,c.id)returning*into t;
 insert into private.artifact_import_events(organization_id,candidate_id,command_id,kind,actor_id,payload)values(c.organization_id,c.id,p_command_id,'matched',auth.uid(),jsonb_build_object('mappings',p_mappings,'exportReceiptId',r.id,'taskId',t.id,'previousComparison',c.comparison,'previousContributions',c.contributions));
 return jsonb_build_object('candidateId',c.id,'status','queued','taskId',t.id,'replayed',false);
end;$$;
create function public.match_artifact_import_v1(p_candidate_id uuid,p_export_receipt_id uuid,p_expected_head_revision_id uuid,p_mappings jsonb,p_command_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.match_artifact_import_v1(p_candidate_id,p_export_receipt_id,p_expected_head_revision_id,p_mappings,p_command_id);$$;

create function private.adopt_artifact_import_v1(p_candidate_id uuid,p_expected_head_revision_id uuid,p_expected_comparison_fingerprint text,p_resolutions jsonb,
 p_command_id uuid,p_locale text,p_self_approval_declared boolean,p_base_milestone_id uuid,p_base_decision_id uuid,p_base_revision integer,p_configuration_id uuid,p_rebase_declared boolean)
returns jsonb language plpgsql security definer set search_path=''as $$
declare c public.artifact_import_candidates;a public.artifacts;head public.artifact_revisions;policy jsonb;resolution jsonb;diff jsonb;binding jsonb;
 changes jsonb;proposals jsonb;blocks jsonb;block jsonb;claims jsonb;manifest jsonb;links jsonb;refs jsonb;rights uuid;written jsonb;decision jsonb;continuation jsonb;institutional jsonb;
 event private.artifact_import_events;content text;proposed_value text;pending jsonb;pending_ids uuid[];
begin
 select*into c from public.artifact_import_candidates where id=p_candidate_id;perform private.lock_review_work_v1(c.work_id);
 select*into c from public.artifact_import_candidates where id=p_candidate_id for update;
 select*into a from public.artifacts where organization_id=c.organization_id and id=c.artifact_id for update;
 if p_command_id is null or p_locale not in('pt-BR','en-US')or p_rebase_declared is null or p_self_approval_declared is null or p_resolutions is null or jsonb_typeof(p_resolutions)<>'array'or jsonb_array_length(p_resolutions)>1000 then raise exception 'artifact_import_adoption_invalid'using errcode='22023';end if;
 select*into event from private.artifact_import_events where organization_id=c.organization_id and candidate_id=c.id and command_id=p_command_id;
 if event.id is not null then
 if event.kind<>'adopted'or event.actor_id<>auth.uid()or event.payload->'resolutions'is distinct from p_resolutions or event.payload->'request'is distinct from jsonb_build_object('expectedHeadRevisionId',p_expected_head_revision_id,'expectedComparisonFingerprint',p_expected_comparison_fingerprint,'locale',p_locale,'selfApprovalDeclared',p_self_approval_declared,'baseMilestoneId',p_base_milestone_id,'baseDecisionId',p_base_decision_id,'baseRevision',p_base_revision,'configurationId',p_configuration_id,'rebaseDeclared',p_rebase_declared) then raise exception 'artifact_import_command_conflict'using errcode='23505';end if;
 if not private.artifact_roundtrip_revision_allowed_v1(c.organization_id,c.applied_revision_id,auth.uid(),false)then raise exception 'artifact_import_source_denied'using errcode='42501';end if;
 return jsonb_build_object('candidateId',c.id,'status',c.status,'pendingConfigurationIds',to_jsonb(c.pending_configuration_ids),'decisionId',c.decision_id,'appliedRevisionId',c.applied_revision_id,'continuationRequestId',c.continuation_request_id,'replayed',true);end if;
 if c.status<>'candidate'or a.head_revision_id is distinct from p_expected_head_revision_id or c.compared_head_revision_id is distinct from a.head_revision_id
 or c.comparison_fingerprint is distinct from p_expected_comparison_fingerprint then raise exception 'artifact_import_stale'using errcode='40001';end if;
 if not private.artifact_import_source_allowed_v1(c.organization_id,c.work_id,c.source_version_id,auth.uid(),'derive')or not private.artifact_roundtrip_revision_allowed_v1(c.organization_id,c.base_revision_id,auth.uid(),false)
 or not private.artifact_roundtrip_revision_allowed_v1(c.organization_id,a.head_revision_id,auth.uid(),false)then raise exception 'artifact_import_source_denied'using errcode='42501';end if;
 policy:=private.review_policy_snapshot_v1(c.organization_id,c.work_id,auth.uid());
 perform private.assert_capital_project_review_action(c.organization_id,c.work_id,'approve',c.submitted_by);
 if auth.uid()=c.submitted_by and(not(policy->>'selfApprovalAllowed')::boolean or not p_self_approval_declared)then raise exception 'capital_project_self_approval_forbidden'using errcode='42501';end if;
 for resolution in select value from jsonb_array_elements(p_resolutions)loop
 if resolution-array['key','choice']<>'{}'or resolution->>'choice'not in('received','current')
 or not exists(select 1 from jsonb_array_elements(c.comparison->'differences')d where d->>'key'=resolution->>'key'and d->>'classification'in('conflict','missing','unmatched'))then raise exception 'artifact_import_resolution_invalid'using errcode='22023';end if;end loop;
 if(select count(*)<>count(distinct value->>'key')from jsonb_array_elements(p_resolutions))then raise exception 'artifact_import_resolution_invalid'using errcode='22023';end if;
 changes:=c.contributions->'assumptionChanges';proposals:=c.contributions->'blockProposals';
 for diff in select value from jsonb_array_elements(c.comparison->'differences')where value->>'classification'in('conflict','missing','unmatched')loop
 select value into resolution from jsonb_array_elements(p_resolutions)where value->>'key'=diff->>'key';
 if resolution is null then raise exception 'artifact_import_resolution_required'using errcode='22023';end if;
 if resolution->>'choice'='current'then continue;end if;
 if diff->>'classification'<>'conflict'then raise exception 'artifact_import_manual_mapping_required'using errcode='22023';end if;
 if diff#>>'{received,role}'='input'then
 select value into binding from jsonb_array_elements(c.comparison#>'{baseManifest,inputs}')where 'in:'||(value->>'name')=diff->>'key';
 proposed_value:=diff#>>'{received,value}';
 if binding is null or proposed_value is null or length(proposed_value)>100 or proposed_value!~'^-?[0-9]+(\.[0-9]+)?$'then raise exception 'artifact_import_resolution_invalid'using errcode='22023';end if;
 changes:=changes||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('assumptionId',binding->>'assumptionId','period',binding->>'period','configurationId',binding->>'configurationId','approved',coalesce(binding->>'approved',diff#>>'{base,value}'),'proposed',proposed_value)));
 elsif diff#>>'{received,role}'='text'then
 proposals:=proposals||jsonb_build_array(jsonb_build_object('blockKey',diff#>>'{base,blockKey}','content',jsonb_build_object('text',diff#>>'{received,value}'),'claims','[]'::jsonb,'supportIds','[]'::jsonb,'detachedClaimIds',coalesce(diff#>'{base,claimIds}','[]')));
 else raise exception 'artifact_import_resolution_invalid'using errcode='22023';end if;end loop;
 if jsonb_array_length(changes)=0 and jsonb_array_length(proposals)=0 then raise exception 'artifact_import_no_contribution'using errcode='22023';end if;
 select*into strict head from public.artifact_revisions where organization_id=c.organization_id and id=a.head_revision_id;

 if a.kind='model_result'then
 if p_configuration_id is null and(select count(distinct value->>'configurationId')from jsonb_array_elements(changes))>1 then raise exception 'artifact_import_group_selection_required'using errcode='22023';end if;
 if p_configuration_id is not null then
 select coalesce(jsonb_agg(value),'[]')into pending from jsonb_array_elements(changes)where value->>'configurationId'is distinct from p_configuration_id::text;
 select coalesce(jsonb_agg(value),'[]')into changes from jsonb_array_elements(changes)where value->>'configurationId'=p_configuration_id::text;
 select coalesce(array_agg(distinct(value->>'configurationId')::uuid),'{}')into pending_ids from jsonb_array_elements(pending);
 end if;
 institutional:=private.apply_institutional_artifact_import_v1(c.id,changes,p_command_id,p_locale,p_self_approval_declared,p_configuration_id,p_rebase_declared);end if;
 select coalesce(jsonb_agg(jsonb_build_object('blockKey',ab.block_key,'kind',ab.kind,'content',ab.content,'claims',ab.claims)order by ab.block_no),'[]')into blocks from public.artifact_blocks ab where ab.organization_id=c.organization_id and ab.revision_id=head.id;
 for block in select value from jsonb_array_elements(proposals)loop
 -- A new captured export block is a contribution, not fabricated legacy authority.
 if exists(select 1 from jsonb_array_elements(blocks)b where b->>'blockKey'=block->>'blockKey')then
 select jsonb_agg(case when b->>'blockKey'=block->>'blockKey'then jsonb_build_object('blockKey',b->>'blockKey','kind',b->>'kind','content',block->'content','claims','[]'::jsonb)else b end)into blocks from jsonb_array_elements(blocks)b;
 else blocks:=blocks||jsonb_build_array(jsonb_build_object('blockKey',block->>'blockKey','kind','paragraph','content',block->'content','claims','[]'::jsonb));end if;end loop;
 if jsonb_array_length(changes)>0 then blocks:=blocks||jsonb_build_array(jsonb_build_object('blockKey','import.inputs.'||c.id::text,'kind','cell_region','content',jsonb_build_object('origin','human_assumption_proposal','assumptionChanges',changes,'requiresRecalculation',true),'claims','[]'::jsonb));end if;
 select coalesce(jsonb_agg(jsonb_build_object('blockKey',b->>'blockKey','claimIds',(select jsonb_agg(cl->'claimId')from jsonb_array_elements(b->'claims')cl))),'[]')into claims from jsonb_array_elements(blocks)b where jsonb_array_length(b->'claims')>0;
 select id into rights from private.source_rights_versions where organization_id=c.organization_id and source_version_id=c.source_version_id order by revision desc limit 1;
 -- Sources are rederived from immutable database dependencies plus the verified human upload,
 -- never from received-file citations; changed blocks carry no inherited claim/support identity.
 select coalesce(jsonb_agg(distinct jsonb_build_object('sourceVersionId',source_version_id,'rightsVersionId',source_rights_version_id)),'[]')into refs from private.artifact_dependency_links where organization_id=c.organization_id and revision_id in(head.id,c.base_revision_id) and link_kind='source_version';
 if not exists(select 1 from jsonb_array_elements(refs)r where r->>'sourceVersionId'=c.source_version_id::text)then refs:=refs||jsonb_build_array(jsonb_build_object('sourceVersionId',c.source_version_id,'rightsVersionId',rights));end if;
 manifest:=head.manifest||jsonb_build_object('kind',case when a.kind='execution_result'then'answer'else a.kind end,'audience','internal','bytes',null,'execution',null,'inputSnapshot',null,'legacy',null,'sources',refs,'claims',claims,'traces','[]'::jsonb,
 'provenance',jsonb_build_object('producer','artifact-import','jobId',null,'taskRunId',null,'messageId',null,'capability',null),
 'institutionalResult',case when institutional is not null then jsonb_build_object('id',institutional->>'resultId','configurationFingerprint',institutional->>'configurationFingerprint')else null end);
 links:=jsonb_build_array(jsonb_build_object('kind','artifact_revision','derivedFromRevisionId',head.id));
 if c.base_revision_id is distinct from head.id then links:=links||jsonb_build_array(jsonb_build_object('kind','artifact_revision','derivedFromRevisionId',c.base_revision_id));end if;
 written:=private.create_artifact_revision_v1(c.organization_id,c.work_id,case when a.kind='execution_result'then'answer'else a.kind end,case when a.kind='execution_result'then'artifact-import:'||c.id::text else a.subject end,'internal','person',manifest,blocks,links,null,null,null,auth.uid(),auth.uid(),null,true);
 decision:=private.record_work_decision_v1(c.work_id,'artifact-import:'||c.id::text||':'||p_command_id::text,'adopt_import',jsonb_build_object('artifacts',jsonb_build_array(jsonb_build_object('artifactRevisionId',head.id,'manifestFingerprint',head.manifest_fingerprint)),'milestones','[]'::jsonb,'assessments','[]'::jsonb,'decisions','[]'::jsonb,'execution',null,'configuration',null),array['recompute'],'in_product',null,null,null,p_command_id);
 if(decision->>'contested')::boolean then raise exception 'artifact_import_decision_contested'using errcode='40001';end if;
 if institutional is null then
 content:='Continue the work from the accepted human contribution in artifact import candidate '||c.id::text||'. Recalculate economic outputs with the pinned deterministic method; do not accept workbook formula caches as results.';
 continuation:=private.request_work_continuation_v1(p_command_id,c.work_id,p_locale,content,p_base_milestone_id,p_base_decision_id,p_base_revision);end if;
 insert into private.artifact_import_events(organization_id,candidate_id,command_id,kind,actor_id,payload)values(c.organization_id,c.id,p_command_id,'adopted',auth.uid(),jsonb_build_object('request',jsonb_build_object('expectedHeadRevisionId',p_expected_head_revision_id,'expectedComparisonFingerprint',p_expected_comparison_fingerprint,'locale',p_locale,'selfApprovalDeclared',p_self_approval_declared,'baseMilestoneId',p_base_milestone_id,'baseDecisionId',p_base_decision_id,'baseRevision',p_base_revision,'configurationId',p_configuration_id,'rebaseDeclared',p_rebase_declared),'resolutions',p_resolutions,'selfApprovalDeclared',p_self_approval_declared,'policy',policy,'decisionId',decision->>'decisionId','appliedRevisionId',written->>'revision_id','continuationRequestId',continuation->>'requestId','institutional',institutional,'adoptedChanges',changes,'adoptedBlockProposals',proposals,'pendingContributions',pending,'pendingConfigurationIds',to_jsonb(pending_ids)));
 update public.artifact_import_candidates set status=case when coalesce(cardinality(pending_ids),0)>0 then'stale'else'applied'end,reason=case when coalesce(cardinality(pending_ids),0)>0 then'head_changed'else null end,pending_contributions=pending,pending_configuration_ids=coalesce(pending_ids,'{}'),decision_id=(decision->>'decisionId')::uuid,applied_revision_id=(written->>'revision_id')::uuid,continuation_request_id=(continuation->>'requestId')::uuid where id=c.id;
 return jsonb_build_object('candidateId',c.id,'status',case when coalesce(cardinality(pending_ids),0)>0 then'stale'else'applied'end,'pendingConfigurationIds',to_jsonb(coalesce(pending_ids,'{}')),'decisionId',decision->>'decisionId','appliedRevisionId',written->>'revision_id','continuationRequestId',continuation->>'requestId','institutional',institutional,'replayed',false);
end;$$;
create function public.adopt_artifact_import_v1(p_candidate_id uuid,p_expected_head_revision_id uuid,p_expected_comparison_fingerprint text,p_resolutions jsonb,
 p_command_id uuid,p_locale text,p_self_approval_declared boolean,p_base_milestone_id uuid,p_base_decision_id uuid,p_base_revision integer)
returns jsonb language sql security invoker set search_path=''as $$select private.adopt_artifact_import_v1(p_candidate_id,p_expected_head_revision_id,p_expected_comparison_fingerprint,p_resolutions,p_command_id,p_locale,p_self_approval_declared,p_base_milestone_id,p_base_decision_id,p_base_revision,null,false);$$;

create function public.adopt_artifact_import_group_v1(p_candidate_id uuid,p_expected_head_revision_id uuid,p_expected_comparison_fingerprint text,p_resolutions jsonb,
 p_command_id uuid,p_locale text,p_self_approval_declared boolean,p_base_milestone_id uuid,p_base_decision_id uuid,p_base_revision integer,p_configuration_id uuid,p_rebase_declared boolean)
returns jsonb language sql security invoker set search_path=''as $$select private.adopt_artifact_import_v1(p_candidate_id,p_expected_head_revision_id,p_expected_comparison_fingerprint,p_resolutions,p_command_id,p_locale,p_self_approval_declared,p_base_milestone_id,p_base_decision_id,p_base_revision,p_configuration_id,p_rebase_declared);$$;
-- A human revision reuses its exact parent renderer inputs with explicit text overlays.
alter function private.artifact_roundtrip_producer_context_v1(uuid)rename to artifact_roundtrip_producer_before_import_v1;
revoke all on function private.artifact_roundtrip_producer_before_import_v1(uuid)from public,anon,authenticated,service_role;
create function private.artifact_roundtrip_producer_chain_v1(p_revision uuid,p_visited uuid[])
returns jsonb language plpgsql security definer set search_path=''as $$
declare r public.artifact_revisions;c public.artifact_import_candidates;event private.artifact_import_events;blocks jsonb;parent jsonb;parent_id uuid;
begin
 if p_revision=any(p_visited)or cardinality(p_visited)>=64 then raise exception 'artifact_roundtrip_producer_ancestry_bound'using errcode='42501';end if;
 select*into strict r from public.artifact_revisions where id=p_revision;
 select*into event from private.artifact_import_events where organization_id=r.organization_id and kind='adopted'and payload->>'appliedRevisionId'=r.id::text;
 select*into c from public.artifact_import_candidates where id=event.candidate_id;
 parent_id:=(event.payload#>>'{request,expectedHeadRevisionId}')::uuid;
 if c.id is null then return private.artifact_roundtrip_producer_before_import_v1(r.id);end if;
 if jsonb_typeof(r.manifest->'institutionalResult')='object'then parent:=private.artifact_roundtrip_producer_before_import_v1(r.id);
 else parent:=private.artifact_roundtrip_producer_chain_v1(parent_id,array_append(p_visited,r.id));end if;
 select coalesce(jsonb_agg(jsonb_build_object('blockKey',block_key,'kind',kind,'content',content,'claims',claims)order by block_no),'[]')into blocks from public.artifact_blocks where organization_id=r.organization_id and revision_id=r.id;
 return jsonb_build_object('kind','composite','parentRevisionId',parent_id,'parent',parent,'overlays',blocks,'importCandidateId',c.id);
end;$$;
create function private.artifact_roundtrip_producer_context_v1(p_revision uuid)returns jsonb language sql security definer set search_path=''as $$select private.artifact_roundtrip_producer_chain_v1(p_revision,'{}');$$;

-- An exact export captures a structural map for legacy renderers without rewriting the historical
-- revision. This trusted map has no authority until the final bytes/receipt pair exists.


create or replace function private.read_artifact_roundtrip_task_v1(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path=''as $$
declare t private.artifact_roundtrip_tasks;artifact_id uuid;
begin
 select*into t from private.artifact_roundtrip_tasks where id=p_task_id;
 if t.id is null or not private.evaluate_resource_policy_v1(t.organization_id,t.work_id,auth.uid(),'read','analysis')then raise exception 'artifact_roundtrip_denied'using errcode='42501';end if;
 if t.revision_id is not null and not private.artifact_roundtrip_revision_allowed_v1(t.organization_id,t.revision_id,auth.uid(),t.operation='export')then raise exception 'artifact_roundtrip_denied'using errcode='42501';end if;
 if t.import_candidate_id is not null then select c.artifact_id into artifact_id from public.artifact_import_candidates c where c.id=t.import_candidate_id;
 else select r.artifact_id into artifact_id from public.artifact_revisions r where r.id=t.revision_id;end if;
 return jsonb_build_object('taskId',t.id,'artifactId',artifact_id,'operation',t.operation,'status',t.state,'receiptId',t.receipt_id,'failureCode',t.failure_code);
end;$$;

-- No SQL comparison, captured producer, quarantine proof or adoption helper is a public shortcut.
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in('public','private')and p.proname in('adopt_artifact_import_v1','apply_institutional_artifact_import_v1','artifact_import_processor_context_v1','artifact_import_source_allowed_v1','artifact_import_source_bound_v1','artifact_roundtrip_claim_context_v1','artifact_roundtrip_producer_chain_v1','artifact_roundtrip_producer_context_v1','artifact_roundtrip_storage_allowed_v1','artifact_roundtrip_task_allowed_v1','discard_artifact_import_v1','guard_artifact_import_candidate_v1','institutional_configuration_ancestry_before_review_projection_v1','keep_artifact_import_as_source_v1','list_artifact_export_receipts_v1','list_work_artifact_imports_v1','match_artifact_import_v1','read_artifact_import_candidate_v1','read_artifact_roundtrip_task_v1','recompare_artifact_import_v1','request_artifact_import_upload_v1','review_institutional_configuration_and_calculate_v2','submit_artifact_import_v1','validate_artifact_import_comparison_v1','worker_claim_artifact_roundtrip_v1','worker_commit_artifact_import_comparison_v1','worker_record_artifact_import_quarantine_v1','worker_revalidate_artifact_roundtrip_v1')loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 if f.proname in('submit_artifact_import_v1','read_artifact_import_candidate_v1','worker_claim_artifact_roundtrip_v1','worker_revalidate_artifact_roundtrip_v1','worker_commit_artifact_import_comparison_v1','artifact_roundtrip_storage_allowed_v1','recompare_artifact_import_v1','discard_artifact_import_v1','worker_record_artifact_import_quarantine_v1','request_artifact_import_upload_v1','list_artifact_export_receipts_v1','list_work_artifact_imports_v1','keep_artifact_import_as_source_v1','match_artifact_import_v1','adopt_artifact_import_v1','read_artifact_roundtrip_task_v1','review_institutional_configuration_and_calculate_v2')then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end;$$;

revoke all on function public.adopt_artifact_import_group_v1(uuid,uuid,text,jsonb,uuid,text,boolean,uuid,uuid,integer,uuid,boolean)from public,anon,authenticated,service_role;
grant execute on function public.adopt_artifact_import_group_v1(uuid,uuid,text,jsonb,uuid,text,boolean,uuid,uuid,integer,uuid,boolean)to authenticated;

create function private.read_artifact_export_options_v1(p_revision_id uuid)
returns jsonb language plpgsql security definer set search_path=''as $$
declare r public.artifact_revisions;producer jsonb;depth integer:=0;formats jsonb;variants jsonb;options jsonb;
begin
 select*into r from public.artifact_revisions where id=p_revision_id;
 if r.id is null or not private.artifact_roundtrip_revision_allowed_v1(r.organization_id,r.id,auth.uid(),true)then raise exception 'artifact_export_denied'using errcode='42501';end if;
 producer:=private.artifact_roundtrip_producer_context_v1(r.id);
 while producer->>'kind'='composite'loop depth:=depth+1;if depth>64 then raise exception 'artifact_roundtrip_producer_ancestry_bound'using errcode='42501';end if;producer:=producer->'parent';end loop;
 formats:=case producer->>'kind'when'institutional'then'["xlsx","docx","pptx","pdf"]'::jsonb when'stored'then jsonb_build_array(producer->>'sourceFormat')else'["docx","pptx","pdf"]'::jsonb end;
 if producer->>'kind'='native_material'then variants:=producer->'variants';
 elsif producer->>'kind'='material_package'then
 select coalesce(jsonb_agg(kind order by kind),'[]')into variants from(select distinct value->>'kind'as kind from jsonb_array_elements(producer->'materials')where value->>'kind'in('teaser','credit_profile','package','credit_memo','term_sheet','financial_model','diligence_qa','data_room_index'))m;
 else variants:='["default"]';end if;
 select coalesce(jsonb_agg(jsonb_build_object('variant',value,'formats',case when producer->>'kind'in('material_package','native_material')and value='financial_model'then'["xlsx"]'::jsonb else formats end)order by value),'[]')into options from jsonb_array_elements_text(variants)v(value);
 return jsonb_build_object('revisionId',r.id,'formats',formats,'variants',variants,'options',options);
end;$$;
create function public.read_artifact_export_options_v1(p_revision_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.read_artifact_export_options_v1(p_revision_id);$$;
revoke all on function private.read_artifact_export_options_v1(uuid),public.read_artifact_export_options_v1(uuid)from public,anon,authenticated,service_role;
grant execute on function private.read_artifact_export_options_v1(uuid),public.read_artifact_export_options_v1(uuid)to authenticated;

create function private.artifact_roundtrip_material_storage_allowed_v1(p_org uuid,p_revision uuid,p_subject uuid,p_bucket text,p_path text)
returns boolean language plpgsql security definer set search_path=''as $$
declare body record;
begin
 if p_bucket<>'capital-input-capture'or p_revision is null then return false;end if;
 for body in
 with recursive chain(id,depth)as(select p_revision,0 union select l.derived_from_revision_id,c.depth+1 from chain c join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=c.id and l.link_kind='artifact_revision'where c.depth<64)
 select q.id as payload_id,a.id as allocation_id from chain c join private.material_production_bindings b on b.organization_id=p_org and b.revision_id=c.id
 join private.capital_public_retained_payloads q on q.organization_id=p_org and q.id in(b.package_retained_payload_id,b.state_retained_payload_id)
 join private.capital_public_payload_allocations a on a.organization_id=p_org and a.id=q.allocation_id where a.bucket_id=p_bucket and a.object_path=p_path loop
 if private.material_production_allocation_deadline_v1(p_org,body.allocation_id,p_subject)is not null and private.capital_body_physical_receipt_v1(p_org,body.payload_id)then return true;end if;
 end loop;
 return false;
end;$$;
revoke all on function private.artifact_roundtrip_material_storage_allowed_v1(uuid,uuid,uuid,text,text)from public,anon,authenticated,service_role;

-- Extend the existing restrictive export barrier with the same narrow task check used by
-- the permissive policy. No account-level bucket exception is introduced.
create or replace function private.storage_export_purpose_allowed_v1(p_bucket text,p_path text)
returns boolean language sql volatile security definer set search_path=''as $$
 select case
 when p_bucket='capital-input-capture'then private.worker_can_access_capital_public_payload_v1(p_bucket,p_path,'read')
 or private.worker_can_access_capital_public_payload_v1(p_bucket,p_path,'purge_select')
 or private.artifact_roundtrip_storage_allowed_v1(p_bucket,p_path,false)
 when not storage.allow_any_operation(array['object.get_authenticated','object.copy'])then true
 when p_bucket='brand-templates'then true
 else private.evaluate_resource_policy_v1(private.storage_organization_id(p_path),private.storage_opportunity_id(p_path),auth.uid(),'read','export')
 or private.worker_can_access_document_storage_v1(p_bucket,p_path,false)
 or(p_bucket='case-artifacts'and private.worker_can_access_capital_project_material(p_path,false))
 or private.worker_can_rotate_storage_v1(p_bucket,p_path)
 or private.artifact_roundtrip_storage_allowed_v1(p_bucket,p_path,false)
 end;
$$;
revoke all on function private.storage_export_purpose_allowed_v1(text,text)from public,anon,authenticated,service_role;
grant execute on function private.storage_export_purpose_allowed_v1(text,text)to authenticated;

create or replace function private.source_storage_read_v1(p_bucket text,p_path text)
returns boolean language sql volatile security definer set search_path=''as $$
 select(not exists(select 1 from public.source_versions where bucket_id=p_bucket and object_path=p_path)and not exists(select 1 from public.document_layers where bucket_id=p_bucket and object_path=p_path))
 or exists(select 1 from public.document_layers where bucket_id=p_bucket and object_path=p_path and private.can_export_source_version_v1(organization_id,source_document_id))
 or exists(select 1 from public.source_versions where bucket_id=p_bucket and object_path=p_path and private.can_export_source_version_v1(organization_id,id))
 or private.worker_can_access_document_storage_v1(p_bucket,p_path,false)
 or private.artifact_roundtrip_storage_allowed_v1(p_bucket,p_path,false);
$$;
revoke all on function private.source_storage_read_v1(text,text)from public,anon,authenticated,service_role;
grant execute on function private.source_storage_read_v1(text,text)to authenticated;
