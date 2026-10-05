-- Stage 21: a final export hash is separate from the logical revision identity.
set search_path = '';

create table public.artifact_export_receipts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 work_id uuid not null,
 artifact_id uuid not null,
 revision_id uuid not null,
 revision_manifest_fingerprint text not null check(revision_manifest_fingerprint ~ '^[a-f0-9]{64}$'),
 roundtrip_manifest jsonb not null check(jsonb_typeof(roundtrip_manifest)='object'),
 logical_manifest_fingerprint text not null check(logical_manifest_fingerprint ~ '^[a-f0-9]{64}$'),
 format text not null check(format in ('xlsx','docx','pptx','pdf')),
 variant text not null default 'default' check(variant in ('default','teaser','credit_profile','package','credit_memo','term_sheet','financial_model','diligence_qa','data_room_index')),
 locale text not null check(locale in ('pt-BR','en-US')),
 renderer_version text not null check(length(renderer_version) between 1 and 120),
 template_fingerprint text check(template_fingerprint ~ '^[a-f0-9]{64}$'),
 content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
 byte_length bigint not null check(byte_length between 1 and 104857600),
 bucket_id text not null check(bucket_id='case-artifacts'),
 object_path text not null check(length(object_path) between 1 and 1024),
 storage_object_id uuid not null references storage.objects(id),
 issued_at timestamptz not null,
 created_by uuid not null references auth.users(id),
 command_id uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,work_id,command_id),
 unique nulls not distinct(organization_id,revision_id,format,locale,variant,renderer_version,template_fingerprint),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,artifact_id) references public.artifacts(organization_id,id),
 foreign key(organization_id,artifact_id,revision_id) references public.artifact_revisions(organization_id,artifact_id,id)
);
create index artifact_export_receipts_work_idx on public.artifact_export_receipts(organization_id,work_id);
create index artifact_export_receipts_actor_idx on public.artifact_export_receipts(created_by);
create index artifact_export_receipts_storage_idx on public.artifact_export_receipts(storage_object_id);
alter table public.artifact_export_receipts enable row level security;
alter table public.artifact_export_receipts force row level security;
revoke all on public.artifact_export_receipts from public,anon,authenticated,service_role;
create policy artifact_export_receipts_select on public.artifact_export_receipts for select to authenticated using(false);
create policy artifact_export_receipts_insert on public.artifact_export_receipts for insert to authenticated with check(false);
create policy artifact_export_receipts_update on public.artifact_export_receipts for update to authenticated using(false) with check(false);
create policy artifact_export_receipts_delete on public.artifact_export_receipts for delete to authenticated using(false);

create function private.artifact_roundtrip_logical_fingerprint_v1(p_manifest jsonb)
returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(jsonb_build_object('schemaVersion','artifact-roundtrip-logical.2026.10.05-v1',
 'manifest',p_manifest-array['format','bytes','exportReceipt','exportReceipts'])::text,'utf8'),'sha256'),'hex');
$$;
revoke all on function private.artifact_roundtrip_logical_fingerprint_v1(jsonb) from public,anon,authenticated,service_role;

create function private.reject_artifact_export_receipt_mutation_v1() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'artifact_export_receipt_immutable' using errcode='55000';end;
$$;
revoke all on function private.reject_artifact_export_receipt_mutation_v1() from public,anon,authenticated,service_role;
create trigger artifact_export_receipts_immutable before update or delete on public.artifact_export_receipts
 for each row execute function private.reject_artifact_export_receipt_mutation_v1();
create trigger artifact_export_receipts_audit after insert or update or delete on public.artifact_export_receipts
 for each row execute function private.capture_identity_audit_v1();

-- A task authorizes one deterministic render/comparison. It grants neither model calls nor an execution job.
create table private.artifact_roundtrip_tasks (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 work_id uuid not null, revision_id uuid, operation text not null check(operation in ('export','import','import_scan')),
 format text not null check(format in ('xlsx','docx','pptx','pdf')),
 variant text not null default 'default' check(variant in ('default','teaser','credit_profile','package','credit_memo','term_sheet','financial_model','diligence_qa','data_room_index')), locale text not null check(locale in ('pt-BR','en-US')),
 requested_by uuid not null references auth.users(id), command_id uuid not null,
 state text not null default 'queued' check(state in ('queued','leased','completed','failed','cancelled')),
 worker_token_id uuid references private.worker_tokens(id), worker_account_id uuid references auth.users(id),
 capability_sha256 bytea, lease_expires_at timestamptz, attempts integer not null default 0 check(attempts between 0 and 3),
 output_sha256 text check(output_sha256 ~ '^[a-f0-9]{64}$'), output_byte_length bigint check(output_byte_length between 1 and 104857600),
 output_path text, receipt_id uuid, failure_code text check(failure_code in ('source_revoked','unsupported_producer','invalid_file','missing_base','renderer_error')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,work_id,command_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,revision_id) references public.artifact_revisions(organization_id,id),
 foreign key(organization_id,receipt_id) references public.artifact_export_receipts(organization_id,id),
 check((output_sha256 is null)=(output_byte_length is null)),
 check((output_sha256 is null)=(output_path is null))
);
create index artifact_roundtrip_tasks_queue_idx on private.artifact_roundtrip_tasks(state,created_at) where state in ('queued','leased');
create index artifact_roundtrip_tasks_work_idx on private.artifact_roundtrip_tasks(organization_id,work_id);
create index artifact_roundtrip_tasks_requester_idx on private.artifact_roundtrip_tasks(requested_by);
create index artifact_roundtrip_tasks_worker_idx on private.artifact_roundtrip_tasks(worker_account_id,worker_token_id);
alter table private.artifact_roundtrip_tasks enable row level security;
alter table private.artifact_roundtrip_tasks force row level security;
revoke all on private.artifact_roundtrip_tasks from public,anon,authenticated,service_role;
create policy artifact_roundtrip_tasks_deny on private.artifact_roundtrip_tasks for all to authenticated using(false) with check(false);
create trigger artifact_roundtrip_tasks_updated before update on private.artifact_roundtrip_tasks for each row execute function private.set_updated_at();
create trigger artifact_roundtrip_tasks_audit after insert or update or delete on private.artifact_roundtrip_tasks for each row execute function private.capture_identity_audit_v1();

create function private.artifact_roundtrip_revision_allowed_v1(p_org uuid,p_revision uuid,p_subject uuid,p_export boolean)
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
  if not exists(select 1 from public.artifact_revisions where organization_id=p_org and id=node)
   or exists(select 1 from private.artifact_dependency_links l where l.organization_id=p_org and l.revision_id=node
    and ((l.link_kind='artifact_revision' and not(l.derived_from_revision_id=any(ids)))
    or (l.link_kind='source_version' and not private.source_use_allowed_v1(p_org,l.source_version_id,p_subject,case when p_export then 'export' else 'read' end,case when p_export then 'export' else 'analysis' end))))
  then return false;end if;
 end loop;
 return true;
end;
$$;

create function private.request_artifact_export_v1(p_revision_id uuid,p_format text,p_locale text,p_command_id uuid,p_variant text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.artifact_revisions;a public.artifacts;t private.artifact_roundtrip_tasks;receipt public.artifact_export_receipts;producer jsonb;producer_depth integer:=0;
begin
 select * into r from public.artifact_revisions where id=p_revision_id;
 select * into a from public.artifacts where organization_id=r.organization_id and id=r.artifact_id;
 if not private.artifact_roundtrip_revision_allowed_v1(r.organization_id,r.id,auth.uid(),true) then raise exception 'artifact_export_denied' using errcode='42501';end if;
 if p_command_id is null or p_format is null or p_format not in ('xlsx','docx','pptx','pdf') or p_locale is null or p_locale not in ('pt-BR','en-US') then raise exception 'artifact_export_invalid' using errcode='22023';end if;
 if p_variant is null or p_variant not in ('default','teaser','credit_profile','package','credit_memo','term_sheet','financial_model','diligence_qa','data_room_index') then raise exception 'artifact_export_variant_invalid' using errcode='22023';end if;
 producer:=private.artifact_roundtrip_producer_context_v1(r.id);
 while producer->>'kind'='composite'loop producer_depth:=producer_depth+1;if producer_depth>64 then raise exception 'artifact_roundtrip_producer_ancestry_bound'using errcode='42501';end if;producer:=producer->'parent';end loop;
 if (producer->>'kind'='material_package' and not exists(select 1 from jsonb_array_elements(producer->'materials')m where m->>'kind'=p_variant))
 or (producer->>'kind'='native_material'and not(producer->'variants'?p_variant))
 or (producer->>'kind'not in('material_package','native_material') and p_variant<>'default') then raise exception 'artifact_export_variant_invalid'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('artifact-roundtrip:'||a.organization_id::text||':'||a.work_id::text,0));
 select * into t from private.artifact_roundtrip_tasks where organization_id=a.organization_id and work_id=a.work_id and command_id=p_command_id;
 if t.id is not null then
  if (t.revision_id,t.format,t.locale,t.operation,t.requested_by,t.variant) is distinct from (r.id,p_format,p_locale,'export'::text,auth.uid(),p_variant) then raise exception 'artifact_roundtrip_command_conflict' using errcode='23505';end if;
  return jsonb_build_object('taskId',t.id,'status',t.state,'receiptId',t.receipt_id,'replayed',true);
 end if;
 select * into receipt from public.artifact_export_receipts where organization_id=a.organization_id and revision_id=r.id and format=p_format and locale=p_locale and variant=p_variant and renderer_version='artifact-roundtrip.2026.10.05-v1';
 if receipt.id is not null then return jsonb_build_object('status','completed','receiptId',receipt.id,'replayed',true);end if;
 if (select count(*) from private.artifact_roundtrip_tasks where organization_id=a.organization_id and requested_by=auth.uid() and state in ('queued','leased'))>=10 then raise exception 'artifact_roundtrip_capacity' using errcode='54000';end if;
 insert into private.artifact_roundtrip_tasks(organization_id,work_id,revision_id,operation,format,locale,variant,requested_by,command_id)
 values(a.organization_id,a.work_id,r.id,'export',p_format,p_locale,p_variant,auth.uid(),p_command_id) returning * into t;
 return jsonb_build_object('taskId',t.id,'status',t.state,'receiptId',null,'replayed',false);
end;
$$;
create function public.request_artifact_export_v1(p_revision_id uuid,p_format text,p_locale text,p_command_id uuid,p_variant text default 'default')
returns jsonb language sql security invoker set search_path='' as $$ select private.request_artifact_export_v1(p_revision_id,p_format,p_locale,p_command_id,p_variant);$$;

create function private.read_artifact_export_receipt_v1(p_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.artifact_export_receipts;
begin
 select * into r from public.artifact_export_receipts where id=p_receipt_id;
 if r.id is null or not private.artifact_roundtrip_revision_allowed_v1(r.organization_id,r.revision_id,auth.uid(),true) then raise exception 'artifact_export_denied' using errcode='42501';end if;
 return jsonb_build_object('id',r.id,'workId',r.work_id,'artifactId',r.artifact_id,'revisionId',r.revision_id,
 'revisionManifestFingerprint',r.revision_manifest_fingerprint,'logicalManifestFingerprint',r.logical_manifest_fingerprint,
 'format',r.format,'variant',r.variant,'locale',r.locale,'rendererVersion',r.renderer_version,'templateFingerprint',r.template_fingerprint,
 'roundtripManifest',r.roundtrip_manifest,'sha256',r.content_sha256,'byteLength',r.byte_length,'issuedAt',r.issued_at,'storage',jsonb_build_object('bucket',r.bucket_id,'path',r.object_path,'objectId',r.storage_object_id));
end;
$$;
create function public.read_artifact_export_receipt_v1(p_receipt_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.read_artifact_export_receipt_v1(p_receipt_id);$$;

create function private.read_artifact_roundtrip_task_v1(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.artifact_roundtrip_tasks;
begin
 select * into t from private.artifact_roundtrip_tasks where id=p_task_id;
 if t.id is null or not private.evaluate_resource_policy_v1(t.organization_id,t.work_id,auth.uid(),'read','analysis') then raise exception 'artifact_roundtrip_denied' using errcode='42501';end if;
 if t.revision_id is not null and not private.artifact_roundtrip_revision_allowed_v1(t.organization_id,t.revision_id,auth.uid(),t.operation='export') then raise exception 'artifact_roundtrip_denied' using errcode='42501';end if;
 return jsonb_build_object('taskId',t.id,'artifactId',(select artifact_id from public.artifact_revisions where id=t.revision_id),'operation',t.operation,'status',t.state,'receiptId',t.receipt_id,'failureCode',t.failure_code);
end;
$$;
create function public.read_artifact_roundtrip_task_v1(p_task_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.read_artifact_roundtrip_task_v1(p_task_id);$$;

create function private.artifact_roundtrip_task_allowed_v1(t private.artifact_roundtrip_tasks)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 return t.operation='export' and private.artifact_roundtrip_revision_allowed_v1(t.organization_id,t.revision_id,t.requested_by,true);
end;
$$;

create function private.require_artifact_roundtrip_task_v1(p_task_id uuid,p_capability_token text)
returns private.artifact_roundtrip_tasks language plpgsql security definer set search_path='' as $$
declare t private.artifact_roundtrip_tasks;
begin
 select * into t from private.artifact_roundtrip_tasks where id=p_task_id for update;
 if t.id is null or t.state<>'leased' or t.worker_account_id is distinct from auth.uid() or t.lease_expires_at<=clock_timestamp()
 or t.capability_sha256 is distinct from extensions.digest(coalesce(p_capability_token,''),'sha256')
 or not exists(select 1 from private.worker_tokens w join auth.users u on u.id=w.execution_account_user_id where w.id=t.worker_token_id
 and w.status='active'and w.revoked_at is null and w.execution_account_user_id=auth.uid() and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()))
 then raise exception 'artifact_roundtrip_worker_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||t.organization_id::text,0));
 if not private.artifact_roundtrip_task_allowed_v1(t) then raise exception 'artifact_roundtrip_source_revoked' using errcode='42501';end if;
 return t;
end;
$$;

create function private.worker_claim_artifact_roundtrip_v1(p_worker_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.artifact_roundtrip_tasks;worker uuid;cap text;r public.artifact_revisions;blocks jsonb;
begin
 worker:=private.worker_identity(p_worker_token);
 if not exists(select 1 from private.worker_tokens w join auth.users u on u.id=w.execution_account_user_id where w.id=worker and w.revoked_at is null
 and w.execution_account_user_id=auth.uid() and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())) then raise exception 'artifact_roundtrip_worker_denied' using errcode='42501';end if;
 select * into t from private.artifact_roundtrip_tasks where attempts<3 and (state='queued' or (state='leased' and lease_expires_at<=clock_timestamp())) order by created_at,id limit 1 for update skip locked;
 if t.id is null then return jsonb_build_object('claimed',false);end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||t.organization_id::text,0));
 if not private.artifact_roundtrip_task_allowed_v1(t) then
 update private.artifact_roundtrip_tasks set state='cancelled',capability_sha256=null,lease_expires_at=null,worker_token_id=null,worker_account_id=null,failure_code='source_revoked' where id=t.id;
 return jsonb_build_object('claimed',false,'cancelled',true);
 end if;
 cap:=encode(extensions.gen_random_bytes(32),'hex');
 update private.artifact_roundtrip_tasks set state='leased',attempts=attempts+1,worker_token_id=worker,worker_account_id=auth.uid(),capability_sha256=extensions.digest(cap,'sha256'),lease_expires_at=clock_timestamp()+interval '10 minutes' where id=t.id returning * into t;
 if t.operation='import_scan' then return jsonb_build_object('claimed',true,'taskId',t.id,'organizationId',t.organization_id,'workId',t.work_id,'operation',t.operation,'format',t.format,'variant',t.variant,'locale',t.locale,'capabilityToken',cap,'leaseExpiresAt',t.lease_expires_at,'requestedBy',t.requested_by,'commandId',t.command_id);end if;
 select * into r from public.artifact_revisions where organization_id=t.organization_id and id=t.revision_id;
 select coalesce(jsonb_agg(jsonb_build_object('blockKey',block_key,'kind',kind,'content',content,'claims',claims) order by block_no),'[]') into blocks from public.artifact_blocks where organization_id=t.organization_id and revision_id=r.id;
 return jsonb_build_object('claimed',true,'taskId',t.id,'organizationId',t.organization_id,'workId',t.work_id,'operation',t.operation,'format',t.format,'variant',t.variant,'locale',t.locale,
 'capabilityToken',cap,'leaseExpiresAt',t.lease_expires_at,'requestedBy',t.requested_by,'commandId',t.command_id,
 'revision',jsonb_build_object('id',r.id,'artifactId',r.artifact_id,'revisionNo',r.revision_no,'manifest',r.manifest,'manifestFingerprint',r.manifest_fingerprint,
 'logicalManifestFingerprint',private.artifact_roundtrip_logical_fingerprint_v1(r.manifest),'issuedAt',date_trunc('milliseconds',r.created_at)),'blocks',blocks,'producer',case when r.id is null then null else private.artifact_roundtrip_producer_context_v1(r.id)end);
end;
$$;
create function public.worker_claim_artifact_roundtrip_v1(p_worker_token text) returns jsonb language sql security invoker set search_path='' as $$select private.worker_claim_artifact_roundtrip_v1(p_worker_token);$$;

create function private.worker_prepare_artifact_export_storage_v1(p_task_id uuid,p_capability_token text,p_sha256 text,p_byte_length bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.artifact_roundtrip_tasks:=private.require_artifact_roundtrip_task_v1(p_task_id,p_capability_token);path text;
begin
 if t.operation<>'export' or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_byte_length is null or p_byte_length not between 1 and 104857600 then raise exception 'artifact_export_invalid' using errcode='22023';end if;
 path:=t.organization_id::text||'/'||t.work_id::text||'/roundtrip/'||t.id::text||'/'||p_sha256||'.'||t.format;
 if t.output_sha256 is not null and (t.output_sha256,t.output_byte_length) is distinct from (p_sha256,p_byte_length) then raise exception 'artifact_export_bytes_conflict' using errcode='23505';end if;
 update private.artifact_roundtrip_tasks set output_sha256=p_sha256,output_byte_length=p_byte_length,output_path=path where id=t.id;
 return jsonb_build_object('bucket','case-artifacts','path',path,'sha256',p_sha256,'byteLength',p_byte_length);
end;
$$;
create function public.worker_prepare_artifact_export_storage_v1(p_task_id uuid,p_capability_token text,p_sha256 text,p_byte_length bigint) returns jsonb language sql security invoker set search_path='' as $$select private.worker_prepare_artifact_export_storage_v1(p_task_id,p_capability_token,p_sha256,p_byte_length);$$;

create function private.worker_commit_artifact_export_v1(p_task_id uuid,p_capability_token text,p_storage_object_id uuid,p_template_fingerprint text,p_roundtrip_manifest jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.artifact_roundtrip_tasks:=private.require_artifact_roundtrip_task_v1(p_task_id,p_capability_token);r public.artifact_revisions;receipt public.artifact_export_receipts;
begin
 if t.operation<>'export' or t.output_path is null or p_template_fingerprint is not null and p_template_fingerprint !~ '^[a-f0-9]{64}$'
 or not exists(select 1 from storage.objects o where o.id=p_storage_object_id and o.bucket_id='case-artifacts' and o.name=t.output_path
 and coalesce(o.metadata->>'size','')=t.output_byte_length::text) then raise exception 'artifact_export_storage_invalid' using errcode='22023';end if;
 select * into strict r from public.artifact_revisions where organization_id=t.organization_id and id=t.revision_id;
 perform private.validate_artifact_export_manifest_v1(p_roundtrip_manifest,r,t);
 insert into public.artifact_export_receipts(organization_id,work_id,artifact_id,revision_id,revision_manifest_fingerprint,logical_manifest_fingerprint,roundtrip_manifest,
 format,locale,variant,renderer_version,template_fingerprint,content_sha256,byte_length,bucket_id,object_path,storage_object_id,issued_at,created_by,command_id)
 values(t.organization_id,t.work_id,r.artifact_id,r.id,r.manifest_fingerprint,private.artifact_roundtrip_logical_fingerprint_v1(r.manifest),p_roundtrip_manifest,t.format,t.locale,t.variant,
 'artifact-roundtrip.2026.10.05-v1',p_template_fingerprint,t.output_sha256,t.output_byte_length,'case-artifacts',t.output_path,p_storage_object_id,date_trunc('milliseconds',r.created_at),t.requested_by,t.command_id)
 on conflict do nothing returning * into receipt;
 if receipt.id is null then
 select * into receipt from public.artifact_export_receipts where organization_id=t.organization_id and revision_id=r.id and format=t.format and locale=t.locale and variant=t.variant
 and renderer_version='artifact-roundtrip.2026.10.05-v1' and template_fingerprint is not distinct from p_template_fingerprint;
 if receipt.id is null or receipt.roundtrip_manifest is distinct from p_roundtrip_manifest or (receipt.content_sha256,receipt.byte_length,receipt.logical_manifest_fingerprint) is distinct from
 (t.output_sha256,t.output_byte_length,private.artifact_roundtrip_logical_fingerprint_v1(r.manifest)) then raise exception 'artifact_export_bytes_conflict' using errcode='23505';end if;
 end if;
 update private.artifact_roundtrip_tasks set state='completed',receipt_id=receipt.id,capability_sha256=null,lease_expires_at=null where id=t.id;
 return jsonb_build_object('receiptId',receipt.id,'status','completed');
end;
$$;
create function public.worker_commit_artifact_export_v1(p_task_id uuid,p_capability_token text,p_storage_object_id uuid,p_template_fingerprint text,p_roundtrip_manifest jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.worker_commit_artifact_export_v1(p_task_id,p_capability_token,p_storage_object_id,p_template_fingerprint,p_roundtrip_manifest);$$;

create function private.worker_fail_artifact_roundtrip_v1(p_task_id uuid,p_capability_token text,p_failure_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.artifact_roundtrip_tasks:=private.require_artifact_roundtrip_task_v1(p_task_id,p_capability_token);
begin
 if p_failure_code is null or p_failure_code not in ('unsupported_producer','invalid_file','missing_base','renderer_error') then raise exception 'artifact_roundtrip_failure_invalid' using errcode='22023';end if;
 update private.artifact_roundtrip_tasks set state='failed',failure_code=p_failure_code,capability_sha256=null,lease_expires_at=null where id=t.id;
 return jsonb_build_object('taskId',t.id,'status','failed','failureCode',p_failure_code);
end;
$$;
create function public.worker_fail_artifact_roundtrip_v1(p_task_id uuid,p_capability_token text,p_failure_code text) returns jsonb language sql security invoker set search_path='' as $$select private.worker_fail_artifact_roundtrip_v1(p_task_id,p_capability_token,p_failure_code);$$;

create function private.artifact_roundtrip_storage_allowed_v1(p_bucket text,p_path text,p_write boolean)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare t private.artifact_roundtrip_tasks;receipt public.artifact_export_receipts;r public.artifact_revisions;
begin
 if auth.uid() is null or p_bucket<>'case-artifacts' then return false;end if;
 if not p_write then
 for receipt in select * from public.artifact_export_receipts where bucket_id=p_bucket and object_path=p_path loop
 if private.artifact_roundtrip_revision_allowed_v1(receipt.organization_id,receipt.revision_id,auth.uid(),true) then return true;end if;
 end loop;
 end if;
 for t in select x.* from private.artifact_roundtrip_tasks x join private.worker_tokens w on w.id=x.worker_token_id join auth.users u on u.id=x.worker_account_id
 where x.state='leased' and x.worker_account_id=auth.uid() and x.lease_expires_at>clock_timestamp() and w.revoked_at is null
 and w.execution_account_user_id=auth.uid() and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) loop
 if not private.artifact_roundtrip_task_allowed_v1(t) then continue;end if;
 if t.output_path=p_path then return true;end if;
 if not p_write then
 select * into r from public.artifact_revisions where organization_id=t.organization_id and id=t.revision_id;
 if r.manifest#>>'{bytes,storage,bucket}'=p_bucket and r.manifest#>>'{bytes,storage,path}'=p_path then return true;end if;
 end if;
 end loop;
 return false;
end;
$$;
create policy artifact_roundtrip_storage_select on storage.objects for select to authenticated using(private.artifact_roundtrip_storage_allowed_v1(bucket_id,name,false));
create policy artifact_roundtrip_storage_insert on storage.objects for insert to authenticated with check(private.artifact_roundtrip_storage_allowed_v1(bucket_id,name,true));

-- Only explicit wrappers and their directly called cores are API executable.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('private','public') and p.proname in ('artifact_roundtrip_revision_allowed_v1','request_artifact_export_v1','read_artifact_export_receipt_v1',
 'read_artifact_roundtrip_task_v1','artifact_roundtrip_task_allowed_v1','require_artifact_roundtrip_task_v1','worker_claim_artifact_roundtrip_v1',
 'worker_prepare_artifact_export_storage_v1','worker_commit_artifact_export_v1','worker_fail_artifact_roundtrip_v1','artifact_roundtrip_storage_allowed_v1') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 if f.proname in ('request_artifact_export_v1','read_artifact_export_receipt_v1','read_artifact_roundtrip_task_v1','worker_claim_artifact_roundtrip_v1',
 'worker_prepare_artifact_export_storage_v1','worker_commit_artifact_export_v1','worker_fail_artifact_roundtrip_v1','artifact_roundtrip_storage_allowed_v1') then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end;$$;

-- Renderer inputs are bound to this exact revision, never to a latest-result query.
create function private.artifact_roundtrip_producer_context_v1(p_revision uuid)
returns jsonb language plpgsql security definer set search_path=''as $$
declare r public.artifact_revisions;a public.artifacts;imr private.institutional_model_results;dso public.deal_state_objects;cpa public.capital_project_artifacts;binding private.material_production_bindings;recipe private.material_production_recipes;variants jsonb;
begin
 select*into strict r from public.artifact_revisions where id=p_revision;
 select*into strict a from public.artifacts where organization_id=r.organization_id and id=r.artifact_id;
 select*into binding from private.material_production_bindings where organization_id=r.organization_id and work_id=a.work_id and revision_id=r.id;
 if binding.id is not null then
 select*into strict recipe from private.material_production_recipes where organization_id=r.organization_id and id=binding.recipe_id;
 select coalesce(jsonb_agg(case value when'indicative_term_sheet'then'term_sheet'else value end order by value),'[]')into variants from public.deal_state_objects plan cross join lateral jsonb_array_elements_text(plan.payload->'artifacts')v(value)where plan.organization_id=r.organization_id and plan.id=recipe.production_plan_id and plan.object_fingerprint=recipe.production_plan_fingerprint;
 -- Descriptors expose no body. The task checks its actual requester on every storage read.
 return jsonb_build_object('kind','native_material','recipeId',recipe.id,'variants',variants,'archetypeId',(select archetype from public.document_intake_sessions where organization_id=r.organization_id and id=recipe.session_id),
 'filenames',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.original_name)order by v.id),'[]')from private.material_production_source_pins pin join public.source_versions v on(v.organization_id,v.id)=(pin.organization_id,pin.source_version_id)where pin.organization_id=r.organization_id and pin.recipe_id=recipe.id),
 'packageBody',private.artifact_roundtrip_material_body_v1(r.organization_id,binding.package_retained_payload_id,recipe.human_subject_id),
 'stateBody',private.artifact_roundtrip_material_body_v1(r.organization_id,binding.state_retained_payload_id,recipe.human_subject_id));end if;
 if jsonb_typeof(r.manifest->'institutionalResult')='object' or r.legacy_ref->>'table'='institutional_model_results' then
 select*into imr from private.institutional_model_results where organization_id=r.organization_id and capital_project_id=a.work_id
 and id=coalesce(nullif(r.manifest#>>'{institutionalResult,id}','')::uuid,nullif(r.legacy_ref->>'id','')::uuid);
 if imr.id is not null and (r.legacy_ref is null or r.legacy_ref->>'fingerprint'=imr.artifact->>'fingerprint') then
 return jsonb_build_object('kind','institutional','artifact',imr.artifact,'resultId',imr.id,'configurationId',imr.configuration_id);end if;
 end if;
 if jsonb_typeof(r.manifest#>'{bytes,storage}')='object' then
 return jsonb_build_object('kind','stored','storage',r.manifest#>'{bytes,storage}','sha256',r.content_sha256,'byteLength',r.byte_length,'sourceFormat',r.manifest->>'format');end if;
 if r.legacy_ref->>'table'='deal_state_objects' then
 select*into dso from public.deal_state_objects where organization_id=r.organization_id and id=(r.legacy_ref->>'id')::uuid
 and object_type='material_artifact' and object_fingerprint=r.legacy_ref->>'fingerprint';
 if dso.id is not null and exists(select 1 from public.document_intake_sessions where organization_id=r.organization_id and id=dso.intake_session_id and capital_project_id=a.work_id)then
 return jsonb_build_object('kind','material_package','materials',dso.payload->'materials','financialModel',dso.payload->'financialModel','materialTruth',dso.payload->'materialTruth','sourceRowId',dso.id);end if;
 elsif r.legacy_ref->>'table'='capital_project_artifacts' then
 select*into cpa from public.capital_project_artifacts where organization_id=r.organization_id and capital_project_id=a.work_id
 and id=(r.legacy_ref->>'id')::uuid and artifact_fingerprint=r.legacy_ref->>'fingerprint';
 if cpa.id is not null then return jsonb_build_object('kind','work_product','content',cpa.content,'artifactType',cpa.artifact_type,'sourceRowId',cpa.id);end if;
 end if;
 return jsonb_build_object('kind','blocks','blocks',(select coalesce(jsonb_agg(jsonb_build_object('blockKey',block_key,'kind',kind,'content',content,'claims',claims)order by block_no),'[]')from public.artifact_blocks where organization_id=r.organization_id and revision_id=r.id));
end;$$;
revoke all on function private.artifact_roundtrip_producer_context_v1(uuid)from public,anon,authenticated,service_role;

-- Only a processor holding the task lease can commit this captured structural map.
create function private.validate_artifact_export_manifest_v1(m jsonb,r public.artifact_revisions,t private.artifact_roundtrip_tasks)
returns void language plpgsql security definer set search_path=''as $$
declare item jsonb;field text;limit_count integer;
begin
 if m is null or jsonb_typeof(m)<>'object' or m-array['schemaVersion','artifactId','revisionId','revisionNo','logicalManifestFingerprint','format','variant','exportedAt','blocks','inputs','outputs','formulas']<>'{}'
 or m->>'schemaVersion'<>'artifact-roundtrip.2026.09.26-v1' or m->>'artifactId'is distinct from r.artifact_id::text or m->>'revisionId'is distinct from r.id::text
 or m->>'revisionNo'is distinct from r.revision_no::text or m->>'logicalManifestFingerprint'is distinct from private.artifact_roundtrip_logical_fingerprint_v1(r.manifest)
 or m->>'format'is distinct from t.format or coalesce(m->>'variant','default')is distinct from t.variant or (m->>'exportedAt')::timestamptz is distinct from date_trunc('milliseconds',r.created_at)
 then raise exception 'artifact_export_manifest_invalid'using errcode='22023';end if;
 foreach field in array array['blocks','inputs','outputs','formulas']loop
 limit_count:=case field when 'blocks'then 1000 when 'inputs'then 500 when 'outputs'then 2000 else 10000 end;
 if jsonb_typeof(m->field)is distinct from'array'or jsonb_array_length(m->field)>limit_count then raise exception 'artifact_export_manifest_invalid'using errcode='22023';end if;
 if(select count(*)<>count(distinct value->>case when field='blocks'then'blockKey'else'name'end)from jsonb_array_elements(m->field))then raise exception 'artifact_export_manifest_invalid'using errcode='22023';end if;
 end loop;
 for item in select value from jsonb_array_elements(m->'blocks')loop
 if length(coalesce(item->>'blockKey',''))not between 1 and 300 or jsonb_typeof(item->'region')is distinct from'object'or jsonb_typeof(item->'recorded')is distinct from'boolean'or jsonb_typeof(item->'claimIds')is distinct from'array'
 then raise exception 'artifact_export_manifest_invalid'using errcode='22023';end if;
 end loop;
end;$$;
revoke all on function private.validate_artifact_export_manifest_v1(jsonb,public.artifact_revisions,private.artifact_roundtrip_tasks)from public,anon,authenticated,service_role;
revoke all on function private.artifact_roundtrip_producer_context_v1(uuid)from public,anon,authenticated,service_role;
create function private.artifact_roundtrip_material_body_v1(p_org uuid,p_payload uuid,p_subject uuid)
returns jsonb language plpgsql security definer set search_path=''as $$
declare q private.capital_public_retained_payloads;a private.capital_public_payload_allocations;deadline timestamptz;
begin
 select*into q from private.capital_public_retained_payloads where organization_id=p_org and id=p_payload;
 select*into a from private.capital_public_payload_allocations where organization_id=p_org and id=q.allocation_id;
 deadline:=private.material_production_allocation_deadline_v1(p_org,a.id,p_subject);
 if q.id is null or a.id is null or deadline is null or not private.capital_body_physical_receipt_v1(p_org,q.id)then raise exception 'artifact_roundtrip_material_body_denied'using errcode='42501';end if;
 return jsonb_build_object('retainedPayloadId',q.id,'allocationId',a.id,'storage',jsonb_build_object('bucket',a.bucket_id,'path',a.object_path),'sha256',q.verified_sha256,'byteLength',q.verified_size,'storageObjectId',q.storage_object_id,'storageVersion',q.storage_version,'expiresAt',deadline);
end;$$;
revoke all on function private.artifact_roundtrip_material_body_v1(uuid,uuid,uuid)from public,anon,authenticated,service_role;
