-- Stage 7. A right restricts an existing authorization; it never grants access.
set search_path='';
create table private.source_rights_versions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 source_version_id uuid not null, revision integer not null check(revision>0),
 operations text[] not null check(operations <@ array['read','process','store','derive','export']::text[]),
 purposes text[] not null check(cardinality(purposes)>0 and purposes <@ array['analysis','retrieval','publication','export']::text[]),
 audience text not null check(audience='authorized_workspace'),
 valid_from timestamptz not null, expires_at timestamptz, store_until timestamptz,
 evidence_kind text not null check(evidence_kind in ('information_rights_acceptance','human_declaration')),
 evidence_reference uuid not null, evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,source_version_id,revision),unique(organization_id,source_version_id,id),
 foreign key(organization_id,source_version_id) references public.source_versions(organization_id,id),
 check(expires_at is null or expires_at>valid_from),check(store_until is null or store_until>valid_from)
);
create index source_rights_actor_idx on private.source_rights_versions(created_by);
create table private.resource_dependencies (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 derived_version_id uuid not null,source_version_id uuid not null,source_rights_version_id uuid not null,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,derived_version_id,source_version_id),
 foreign key(organization_id,derived_version_id) references public.source_versions(organization_id,id),
 foreign key(organization_id,source_version_id,source_rights_version_id) references private.source_rights_versions(organization_id,source_version_id,id),
 check(derived_version_id<>source_version_id)
);
create index resource_dependencies_source_idx on private.resource_dependencies(organization_id,source_version_id,source_rights_version_id);
create index resource_dependencies_actor_idx on private.resource_dependencies(created_by);
alter table private.source_rights_versions enable row level security;
alter table private.source_rights_versions force row level security;
alter table private.resource_dependencies enable row level security;
alter table private.resource_dependencies force row level security;
revoke all on private.source_rights_versions,private.resource_dependencies from public,anon,authenticated,service_role;
create policy source_rights_versions_deny_clients on private.source_rights_versions as restrictive for all to anon,authenticated using(false) with check(false);
create policy resource_dependencies_deny_clients on private.resource_dependencies as restrictive for all to anon,authenticated using(false) with check(false);
create trigger source_rights_versions_immutable before update or delete on private.source_rights_versions for each row execute function private.reject_source_version_mutation_v1();
create trigger resource_dependencies_immutable before update or delete on private.resource_dependencies for each row execute function private.reject_source_version_mutation_v1();

-- One protected event (and its audit/outbox row) for every append, including the backfill.
create function private.capture_source_rights_event_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.append_domain_event_v1(new.id,new.organization_id,'access_policy',
 (to_jsonb(new)->>case when tg_table_name='source_rights_versions' then 'source_version_id' else 'derived_version_id' end)::uuid,
 'changed',jsonb_build_object('source',tg_table_name,'record_id',new.id));
 return new;
end $$;
revoke all on function private.capture_source_rights_event_v1() from public,anon,authenticated,service_role;
create trigger source_rights_event after insert on private.source_rights_versions for each row execute function private.capture_source_rights_event_v1();
create trigger resource_dependency_event after insert on private.resource_dependencies for each row execute function private.capture_source_rights_event_v1();

-- Exact historical clickwrap evidence only: same actor and tenant, before the upload.
create function private.initialize_source_rights_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare acceptance public.organization_legal_acceptances;
begin
 select * into acceptance from public.organization_legal_acceptances a
 where a.organization_id=new.organization_id and a.accepted_by=new.created_by
 and a.information_rights_declared is true and a.terms_agreed is true and a.accepted_at<=new.created_at
 order by a.accepted_at desc,a.id limit 1;
 if found then
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 values(new.organization_id,new.id,1,array['read','process','store','derive','export'],array['analysis','retrieval','export'],'authorized_workspace',acceptance.accepted_at,'information_rights_acceptance',acceptance.id,
 encode(extensions.digest(jsonb_build_object('document',acceptance.legal_document_id,'version',acceptance.document_version,'assent',acceptance.acceptance_statement,'informationRights',acceptance.information_rights_statement)::text,'sha256'),'hex'),new.created_by);
 end if;
 return new;
end $$;
revoke all on function private.initialize_source_rights_v1() from public,anon,authenticated,service_role;
create trigger source_versions_initialize_rights after insert on public.source_versions for each row execute function private.initialize_source_rights_v1();
insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 select v.organization_id,v.id,1,array['read','process','store','derive','export'],array['analysis','retrieval','export'],'authorized_workspace',a.accepted_at,'information_rights_acceptance',a.id,
 encode(extensions.digest(jsonb_build_object('document',a.legal_document_id,'version',a.document_version,'assent',a.acceptance_statement,'informationRights',a.information_rights_statement)::text,'sha256'),'hex'),v.created_by
 from public.source_versions v join lateral(select * from public.organization_legal_acceptances a where a.organization_id=v.organization_id and a.accepted_by=v.created_by and a.information_rights_declared is true and a.terms_agreed is true and a.accepted_at<=v.created_at order by a.accepted_at desc,a.id limit 1) a on true;

-- The private predicate accepts a subject only from a validated command or worker capability.
-- It is not executable by clients. The closure is bounded and cycles fail closed.
create function private.source_use_allowed_v1(p_org uuid,p_version uuid,p_subject uuid,p_operation text,p_purpose text)
returns boolean language sql volatile security definer set search_path='' as $$
 with recursive dependencies(id) as (
 select p_version union
 select d.source_version_id from dependencies g join private.resource_dependencies d on d.organization_id=p_org and d.derived_version_id=g.id
 ), evaluated as (
 select g.id,v.id as existing_version,r.id as rights_id,r.operations,r.purposes,r.valid_from,r.expires_at,r.store_until,
 private.evaluate_resource_policy_v1(p_org,s.origin_resource_id,p_subject,'read',p_purpose)
 and exists(select 1 from public.source_bindings b where b.organization_id=p_org and b.source_version_id=g.id and b.revoked_at is null
 and private.evaluate_resource_policy_v1(p_org,b.resource_id,p_subject,'read',p_purpose)) as authorized
 from dependencies g left join public.source_versions v on v.organization_id=p_org and v.id=g.id
 left join public.sources s on s.organization_id=v.organization_id and s.id=v.source_id
 left join lateral(select * from private.source_rights_versions r where r.organization_id=p_org and r.source_version_id=g.id order by r.revision desc limit 1) r on true
 ), pinned as (
 select r.* from dependencies g join private.resource_dependencies d on d.organization_id=p_org and d.derived_version_id=g.id
 join private.source_rights_versions r on r.organization_id=d.organization_id and r.id=d.source_rights_version_id
 )
 select p_subject is not null and p_operation=any(array['read','process','store','derive','export'])
 and (select count(*)<=1000 from dependencies)
 and not exists(select 1 from pinned where not(p_operation=any(operations) and p_purpose=any(purposes) and valid_from<=clock_timestamp()
 and (expires_at is null or expires_at>clock_timestamp()) and (store_until is null or store_until>clock_timestamp())))
 and coalesce(bool_and(existing_version is not null and rights_id is not null and authorized
 and p_operation=any(operations) and p_purpose=any(purposes) and valid_from<=clock_timestamp()
 and (expires_at is null or expires_at>clock_timestamp()) and (store_until is null or store_until>clock_timestamp())),false)
 from evaluated;
$$;
revoke all on function private.source_use_allowed_v1(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;

create function private.set_source_rights_v1(p_version_id uuid,p_expected_revision integer,p_operations text[],p_purposes text[],p_expires_at timestamptz,p_store_until timestamptz,p_evidence_id uuid,p_evidence_sha256 text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.source_versions;s public.sources;result uuid;revision integer;
begin
 select * into v from public.source_versions where id=p_version_id;
 if not found then raise exception 'source_rights_denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||v.organization_id::text,0));
 select * into s from public.sources where organization_id=v.organization_id and id=v.source_id;
 if not private.can_access_resource_v1(v.organization_id,s.origin_resource_id,'read') or not private.can_access_resource_v1(v.organization_id,s.origin_resource_id,'manage')
 then raise exception 'source_rights_denied' using errcode='42501'; end if;
 select coalesce(max(r.revision),0) into revision from private.source_rights_versions r where r.organization_id=v.organization_id and r.source_version_id=v.id;
 if p_expected_revision is distinct from revision then raise exception 'source_rights_revision_conflict' using errcode='40001'; end if;
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by)
 values(v.organization_id,v.id,revision+1,p_operations,p_purposes,'authorized_workspace',clock_timestamp(),p_expires_at,p_store_until,'human_declaration',p_evidence_id,p_evidence_sha256,auth.uid()) returning id into result;
 perform private.policy_invalidate_jobs_v1(v.organization_id);
 return result;
end $$;
create function public.set_source_rights_v1(p_version_id uuid,p_expected_revision integer,p_operations text[],p_purposes text[],p_expires_at timestamptz,p_store_until timestamptz,p_evidence_id uuid,p_evidence_sha256 text)
returns uuid language sql security invoker set search_path='' as $$select private.set_source_rights_v1(p_version_id,p_expected_revision,p_operations,p_purposes,p_expires_at,p_store_until,p_evidence_id,p_evidence_sha256);$$;
revoke all on function private.set_source_rights_v1(uuid,integer,text[],text[],timestamptz,timestamptz,uuid,text),public.set_source_rights_v1(uuid,integer,text[],text[],timestamptz,timestamptz,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.set_source_rights_v1(uuid,integer,text[],text[],timestamptz,timestamptz,uuid,text),public.set_source_rights_v1(uuid,integer,text[],text[],timestamptz,timestamptz,uuid,text) to authenticated;

create function private.add_source_dependency_v1(p_derived_version_id uuid,p_source_version_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.source_versions;s public.sources;r private.source_rights_versions;result uuid;
begin
 select * into v from public.source_versions where id=p_derived_version_id;
 if not found then raise exception 'source_dependency_denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||v.organization_id::text,0));
 select * into s from public.sources where organization_id=v.organization_id and id=v.source_id;
 if not private.can_access_resource_v1(v.organization_id,s.origin_resource_id,'work')
 or not private.source_use_allowed_v1(v.organization_id,p_source_version_id,auth.uid(),'derive','analysis')
 then raise exception 'source_dependency_denied' using errcode='42501'; end if;
 if p_derived_version_id=p_source_version_id or exists(with recursive walk(id) as (
 select p_source_version_id union select d.source_version_id from walk w join private.resource_dependencies d on d.organization_id=v.organization_id and d.derived_version_id=w.id
 ) select 1 from walk where id=p_derived_version_id) then raise exception 'source_dependency_cycle' using errcode='23514'; end if;
 -- Check every affected ancestor with the prospective edge included. A sibling union
 -- can overflow even when each individual parent fits within the read bound.
 if exists(with recursive ancestors(id) as (
 select p_derived_version_id union select d.derived_version_id from ancestors a join private.resource_dependencies d on d.organization_id=v.organization_id and d.source_version_id=a.id
 ), edges(derived,source) as (
 select derived_version_id,source_version_id from private.resource_dependencies where organization_id=v.organization_id
 union select p_derived_version_id,p_source_version_id
 ), closure(root,id) as (
 select id,id from ancestors union select c.root,e.source from closure c join edges e on e.derived=c.id
 ) select 1 from closure group by root having count(*)>1000)
 then raise exception 'source_dependency_limit' using errcode='54000'; end if;
 select * into r from private.source_rights_versions where organization_id=v.organization_id and source_version_id=p_source_version_id order by revision desc limit 1;
 insert into private.resource_dependencies(organization_id,derived_version_id,source_version_id,source_rights_version_id,created_by)
 values(v.organization_id,v.id,p_source_version_id,r.id,auth.uid()) on conflict(organization_id,derived_version_id,source_version_id) do nothing returning id into result;
 if result is null then select id into result from private.resource_dependencies where organization_id=v.organization_id and derived_version_id=v.id and source_version_id=p_source_version_id;
 else
 perform private.policy_invalidate_jobs_v1(v.organization_id);
 end if;
 return result;
end $$;
create function public.add_source_dependency_v1(p_derived_version_id uuid,p_source_version_id uuid)
returns uuid language sql security invoker set search_path='' as $$select private.add_source_dependency_v1(p_derived_version_id,p_source_version_id);$$;
revoke all on function private.add_source_dependency_v1(uuid,uuid),public.add_source_dependency_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.add_source_dependency_v1(uuid,uuid),public.add_source_dependency_v1(uuid,uuid) to authenticated;

-- Metadata, raw download and legacy source access converge on the same current right.
create or replace function private.can_read_source_version_v1(p_organization_id uuid,p_version_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 select private.source_use_allowed_v1(p_organization_id,p_version_id,auth.uid(),'read','analysis');
$$;
create or replace function private.can_export_source_version_v1(p_organization_id uuid,p_version_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 select private.source_use_allowed_v1(p_organization_id,p_version_id,auth.uid(),'export','export');
$$;
create policy source_documents_rights_select on public.source_documents as restrictive for select to authenticated
 using(private.can_read_source_version_v1(organization_id,id));
create policy sources_rights_select on public.sources as restrictive for select to authenticated
 using(exists(select 1 from public.source_versions v where v.organization_id=sources.organization_id and v.source_id=sources.id));
create policy case_chunks_rights_select on public.case_retrieval_chunks as restrictive for select to authenticated
 using(private.can_read_source_version_v1(organization_id,source_document_id));
create policy document_profiles_rights_select on public.document_profiles as restrictive for select to authenticated
 using(private.can_read_source_version_v1(organization_id,source_document_id));
create policy document_layers_rights_select on public.document_layers as restrictive for select to authenticated
 using(private.can_read_source_version_v1(organization_id,source_document_id));

-- Batch the same RLS predicates once per distinct source/scope. The private definer is
-- necessary to avoid re-running the recursive rights graph for every chunk; no caller may
-- supply a subject, and the public wrapper remains invoker. Direct table RLS stays unchanged.
create function private.search_authorized_resources_v1(p_organization_id uuid,p_resource_id uuid,p_query text,p_limit integer default 12,p_purpose text default 'analysis')
returns table(chunk_id uuid,content text,source_document_id uuid,source_anchor jsonb,citation_key text,score real)
language plpgsql volatile security definer set search_path='' as $$
begin
 if p_purpose is distinct from 'analysis' or p_query is null or char_length(trim(p_query)) not between 2 and 2000
 or not private.can_access_resource_v1(p_organization_id,p_resource_id,'read') then return; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||p_organization_id::text,0));
 if not private.can_access_resource_v1(p_organization_id,p_resource_id,'read') then return; end if;
 return query
 with scoped_versions as materialized (
 select distinct c.source_document_id,c.intake_session_id,c.opportunity_id from public.case_retrieval_chunks c
 where c.organization_id=p_organization_id and (c.opportunity_id=p_resource_id or c.intake_session_id=p_resource_id)
 ), eligible_versions as materialized (
 select v.* from scoped_versions v
 where private.can_access_intake_session(p_organization_id,v.intake_session_id)
 and (v.opportunity_id is null or private.can_access_opportunity(p_organization_id,v.opportunity_id,'evidence.read'))
 and private.can_read_source_version_v1(p_organization_id,v.source_document_id)
 ), eligible as materialized (
 select c.* from public.case_retrieval_chunks c join eligible_versions v on v.source_document_id=c.source_document_id
 and v.intake_session_id=c.intake_session_id and v.opportunity_id is not distinct from c.opportunity_id
 where c.organization_id=p_organization_id and (c.opportunity_id=p_resource_id or c.intake_session_id=p_resource_id)
 and c.content_hash=encode(extensions.digest(c.content,'sha256'),'hex')
 ),query as(select websearch_to_tsquery('simple'::regconfig,trim(p_query)) as value), selected as materialized (
 select c.id,c.content,c.source_document_id,c.source_anchor,c.chunk_key,ts_rank_cd(c.search_vector,q.value)::real as rank
 from eligible c cross join query q where c.search_vector@@q.value
 order by ts_rank_cd(c.search_vector,q.value) desc,c.id limit least(greatest(coalesce(p_limit,12),1),50)
 ) select c.id,c.content,c.source_document_id,c.source_anchor,c.chunk_key,c.rank from selected c
 where private.can_read_source_version_v1(p_organization_id,c.source_document_id) order by c.rank desc,c.id;
end;
$$;
create function public.search_authorized_resources_v1(p_organization_id uuid,p_resource_id uuid,p_query text,p_limit integer default 12,p_purpose text default 'analysis')
returns table(chunk_id uuid,content text,source_document_id uuid,source_anchor jsonb,citation_key text,score real)
language sql volatile security invoker set search_path='' as $$
 select * from private.search_authorized_resources_v1(p_organization_id,p_resource_id,p_query,p_limit,p_purpose);
$$;
revoke all on function private.search_authorized_resources_v1(uuid,uuid,text,integer,text),public.search_authorized_resources_v1(uuid,uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function private.search_authorized_resources_v1(uuid,uuid,text,integer,text),public.search_authorized_resources_v1(uuid,uuid,text,integer,text) to authenticated;
create or replace function public.search_case_retrieval(p_organization_id uuid,p_opportunity_id uuid,p_query text,p_limit integer default 12)
returns table(chunk_id uuid,content text,source_document_id uuid,source_anchor jsonb,citation_key text,score real)
language sql volatile security invoker set search_path='' as $$
 select * from public.search_authorized_resources_v1(p_organization_id,p_opportunity_id,p_query,p_limit,'analysis');
$$;

-- All capability consumers (including Storage and completion) already call this boundary.
-- Rights are checked as the bound human, never as the worker's own organization membership.
create function private.job_sources_rights_current_v1(p_job_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.processing_jobs j where j.id=p_job_id
 and (j.source_document_id is null or (private.source_use_allowed_v1(j.organization_id,j.source_document_id,j.authorization_subject_id,'process','analysis') and private.source_use_allowed_v1(j.organization_id,j.source_document_id,j.authorization_subject_id,'store','analysis')))
 and not exists(select 1 from public.source_documents d where d.organization_id=j.organization_id
 and ((j.source_document_id is not null and d.id=j.source_document_id) or (j.source_document_id is null and d.intake_session_id=j.intake_session_id))
 and (not private.source_use_allowed_v1(d.organization_id,d.id,j.authorization_subject_id,'process','analysis')
 or not private.source_use_allowed_v1(d.organization_id,d.id,j.authorization_subject_id,'store','analysis'))));
$$;
revoke all on function private.job_sources_rights_current_v1(uuid) from public,anon,authenticated,service_role;
do $$ declare body text; begin
 select pg_get_functiondef('private.job_authority_is_current_v1(uuid)'::regprocedure) into body;
 if position('where j.id=p_job_id' in body)=0 then raise exception 'job_authority_contract_changed'; end if;
 body:=replace(body,'where j.id=p_job_id','where j.id=p_job_id and private.job_sources_rights_current_v1(j.id)');execute body;
end $$;

-- Existing Offroad-authored library seed has an explicit internal-use license. Future versions
-- are closed by default and require their own reviewed license, not an inherited default.
alter table public.house_playbook_versions add column usage_license text;
alter table public.house_playbook_versions add column usage_expires_at timestamptz;
alter table public.house_playbook_versions add constraint house_usage_license_valid check(usage_license is null or usage_license='offroad_owned_private_analysis_v1');
update public.house_playbook_versions set usage_license='offroad_owned_private_analysis_v1'
 where semantic_version='2026.08.24-v2' and content_hash=encode(extensions.digest('credit-playbook:2026.08.24-v2','sha256'),'hex') and approval_basis='migration';
create function private.house_usage_allowed_v1(p_version uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.house_playbook_versions where id=p_version and status='approved' and usage_license='offroad_owned_private_analysis_v1' and (usage_expires_at is null or usage_expires_at>clock_timestamp()));
$$;
revoke all on function private.house_usage_allowed_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.house_usage_allowed_v1(uuid) to authenticated;
create policy house_chunks_usage_select on public.house_playbook_chunks as restrictive for select to authenticated using(private.house_usage_allowed_v1(playbook_version_id));

-- A mandate publication or precedent approval is not itself evidence of a source license.
-- No existing rows are licensed by this migration. Their source proof must be attached by a
-- governed publishing command; until then they are ineligible even for privileged retrieval.
alter table public.mandate_note_embeddings add column rights_organization_id uuid;
alter table public.mandate_note_embeddings add column source_rights_version_id uuid;
alter table public.mandate_note_embeddings add constraint mandate_note_rights_pair check((rights_organization_id is null)=(source_rights_version_id is null));
alter table public.mandate_note_embeddings add constraint mandate_note_source_rights_fk foreign key(rights_organization_id,source_rights_version_id) references private.source_rights_versions(organization_id,id);
create index mandate_note_source_rights_idx on public.mandate_note_embeddings(rights_organization_id,source_rights_version_id);
alter table public.governed_precedent_chunks add column rights_organization_id uuid;
alter table public.governed_precedent_chunks add column source_rights_version_id uuid;
alter table public.governed_precedent_chunks add constraint precedent_chunk_rights_pair check((rights_organization_id is null)=(source_rights_version_id is null));
alter table public.governed_precedent_chunks add constraint precedent_chunk_source_rights_fk foreign key(rights_organization_id,source_rights_version_id) references private.source_rights_versions(organization_id,id);
create index precedent_chunk_source_rights_idx on public.governed_precedent_chunks(rights_organization_id,source_rights_version_id);
create function private.licensed_corpus_use_v1(p_org uuid,p_rights uuid,p_subject uuid,p_purpose text)
returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from private.source_rights_versions r where r.organization_id=p_org and r.id=p_rights
 and 'read'=any(r.operations) and 'derive'=any(r.operations) and p_purpose=any(r.purposes)
 and r.valid_from<=clock_timestamp() and (r.expires_at is null or r.expires_at>clock_timestamp()) and (r.store_until is null or r.store_until>clock_timestamp())
 and private.source_use_allowed_v1(p_org,r.source_version_id,p_subject,'read',p_purpose)
 and private.source_use_allowed_v1(p_org,r.source_version_id,p_subject,'derive',p_purpose));
$$;
revoke all on function private.licensed_corpus_use_v1(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
create function private.can_read_licensed_corpus_v1(p_org uuid,p_rights uuid)
returns boolean language sql volatile security definer set search_path='' as $$select private.licensed_corpus_use_v1(p_org,p_rights,auth.uid(),'analysis');$$;
revoke all on function private.can_read_licensed_corpus_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_read_licensed_corpus_v1(uuid,uuid) to authenticated;
create policy mandate_notes_rights_select on public.mandate_note_embeddings as restrictive for select to authenticated using(private.can_read_licensed_corpus_v1(rights_organization_id,source_rights_version_id));
create policy precedent_chunks_rights_select on public.governed_precedent_chunks as restrictive for select to authenticated using(private.can_read_licensed_corpus_v1(rights_organization_id,source_rights_version_id));

create or replace function private.worker_load_retrieval_context(
  p_job_id uuid,
  p_capability_token text,
  p_query text,
  p_allowed_fund_ids uuid[] default '{}',
  p_precedent_purpose text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  query_value tsquery;
  active_playbook public.house_playbook_versions;
  result jsonb;
  result_ids jsonb;
  selected jsonb;
  still_allowed boolean;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;
  if p_query is null or char_length(trim(p_query)) < 2 then
    raise exception 'retrieval_query_required' using errcode = '22023';
  end if;
  query_value := websearch_to_tsquery('simple'::regconfig, trim(p_query));

  select * into active_playbook
  from public.house_playbook_versions version
  where version.status = 'approved' and private.house_usage_allowed_v1(version.id)
  order by version.created_at desc
  limit 1;

  with eligible_case_sources as materialized (
    select v.id,v.organization_id,v.original_name from public.source_versions v
    where v.organization_id=job_row.organization_id
    and exists(select 1 from public.case_retrieval_chunks c where c.organization_id=v.organization_id
      and c.source_document_id=v.id and c.intake_session_id=job_row.intake_session_id)
    and private.source_use_allowed_v1(v.organization_id,v.id,job_row.authorization_subject_id,'read','analysis')
    and private.source_use_allowed_v1(v.organization_id,v.id,job_row.authorization_subject_id,'derive','analysis')
  ), eligible_case as materialized (
    select chunk.*,document.original_name from public.case_retrieval_chunks chunk
    join eligible_case_sources document on document.organization_id=chunk.organization_id and document.id=chunk.source_document_id
    where chunk.organization_id=job_row.organization_id and chunk.intake_session_id=job_row.intake_session_id
    and chunk.content_hash=encode(extensions.digest(chunk.content,'sha256'),'hex')
  ), eligible_house as materialized (
    select * from public.house_playbook_chunks where playbook_version_id=active_playbook.id and private.house_usage_allowed_v1(playbook_version_id)
    and content_hash=encode(extensions.digest(content,'sha256'),'hex')
  ), eligible_notes as materialized (
    select * from public.mandate_note_embeddings n where n.rights_organization_id=job_row.organization_id
    and n.content_hash=encode(extensions.digest(n.content,'sha256'),'hex')
    and n.fund_id=any(coalesce(p_allowed_fund_ids,'{}'))
    and private.licensed_corpus_use_v1(n.rights_organization_id,n.source_rights_version_id,job_row.authorization_subject_id,'analysis')
  ), eligible_precedents as materialized (
    select * from public.governed_precedent_chunks c where c.rights_organization_id=job_row.organization_id
    and c.content_hash=encode(extensions.digest(c.content,'sha256'),'hex')
    and private.licensed_corpus_use_v1(c.rights_organization_id,c.source_rights_version_id,job_row.authorization_subject_id,'analysis')
  ), ranked as (
    select
      'case'::text as source,
      chunk.id,
      chunk.content,
      jsonb_build_object(
        'key', chunk.chunk_key,
        'label', chunk.original_name || ', ' || coalesce(chunk.source_anchor ->> 'id', chunk.chunk_key),
        'anchor', chunk.source_anchor,
        'sourceDocumentId', chunk.source_document_id
      ) as citation,
      ts_rank_cd(chunk.search_vector, query_value)::real as score
    from eligible_case chunk
    where chunk.organization_id = job_row.organization_id
      and chunk.intake_session_id = job_row.intake_session_id
      and chunk.search_vector @@ query_value

    union all

    select
      'house_playbook',
      chunk.id,
      chunk.content,
      jsonb_build_object('key', chunk.chunk_key, 'label', chunk.source_ref, 'anchor', jsonb_build_object('sourceRef', chunk.source_ref)),
      ts_rank_cd(chunk.search_vector, query_value)::real
    from eligible_house chunk
    where active_playbook.id is not null
      and chunk.playbook_version_id = active_playbook.id
      and chunk.search_vector @@ query_value

    union all

    select
      'mandate_note',
      note.id,
      note.content,
      note.citation,
      ts_rank_cd(to_tsvector('simple'::regconfig, note.content), query_value)::real
    from eligible_notes note
    where note.fund_id = any(coalesce(p_allowed_fund_ids, '{}'))
      and to_tsvector('simple'::regconfig, note.content) @@ query_value

    union all

    select
      'precedent',
      chunk.id,
      chunk.content,
      jsonb_build_object('key', chunk.citation_key, 'label', 'Precedente anonimizado', 'anchor', jsonb_build_object('citationKey', chunk.citation_key)),
      ts_rank_cd(chunk.search_vector, query_value)::real
    from eligible_precedents chunk
    join public.governed_precedents precedent on precedent.id = chunk.precedent_id
    join public.precedent_authorizations precedent_authorization
      on precedent_authorization.id = precedent.authorization_id
    where p_precedent_purpose is not null
      and precedent_authorization.status = 'active'
      and (precedent_authorization.expires_at is null or precedent_authorization.expires_at > now())
      and p_precedent_purpose = any(precedent_authorization.authorized_purposes)
      and precedent.anonymization_status = 'approved'
      and precedent.governance_status = 'approved'
      and chunk.search_vector @@ query_value
  ), source_ranked as (
    select
      ranked.*,
      row_number() over (partition by source order by score desc, id) as source_rank
    from ranked
    where score > 0
  ), limited as (
    -- Interleave sources so a large case index cannot crowd the approved playbook (or the
    -- allowed mandate notes) out of the bounded response. Relevance still orders each source.
    select source, id, content, citation, score
    from source_ranked
    order by source_rank, score desc, source, id
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'source', source,
      'id', id,
      'content', content,
      'citation', citation,
      'score', score
    ) order by score desc, source, id), '[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(id) order by score desc, source, id), '[]'::jsonb)
  into result, result_ids
  from limited;

  insert into private.retrieval_audit_events (
    organization_id, intake_session_id, processing_run_id, query_hash, playbook_version,
    allowed_fund_count, result_ids, actor_user_id
  ) values (
    job_row.organization_id, job_row.intake_session_id, job_row.processing_run_id,
    encode(extensions.digest(trim(p_query), 'sha256'), 'hex'), active_playbook.semantic_version,
    coalesce(cardinality(p_allowed_fund_ids), 0), result_ids, (select auth.uid())
  );

  perform private.job_for_capability(p_job_id,p_capability_token);
  -- Time may expire during ranking or audit. Validate every selected corpus again at
  -- delivery, using the real clock and the actual human subject, under the policy lock.
  for selected in select value from jsonb_array_elements(result) loop
    still_allowed:=false;
    case selected->>'source'
      when 'case' then select exists(select 1 from public.case_retrieval_chunks c
        where c.id=(selected->>'id')::uuid and c.organization_id=job_row.organization_id
        and c.intake_session_id=job_row.intake_session_id and c.content=selected->>'content'
        and private.source_use_allowed_v1(c.organization_id,c.source_document_id,job_row.authorization_subject_id,'read','analysis')
        and private.source_use_allowed_v1(c.organization_id,c.source_document_id,job_row.authorization_subject_id,'derive','analysis')) into still_allowed;
      when 'house_playbook' then select exists(select 1 from public.house_playbook_chunks c
        where c.id=(selected->>'id')::uuid and c.content=selected->>'content'
        and private.house_usage_allowed_v1(c.playbook_version_id)) into still_allowed;
      when 'mandate_note' then select exists(select 1 from public.mandate_note_embeddings n
        where n.id=(selected->>'id')::uuid and n.content=selected->>'content'
        and n.rights_organization_id=job_row.organization_id and n.fund_id=any(coalesce(p_allowed_fund_ids,'{}'))
        and private.licensed_corpus_use_v1(n.rights_organization_id,n.source_rights_version_id,job_row.authorization_subject_id,'analysis')) into still_allowed;
      when 'precedent' then select exists(select 1 from public.governed_precedent_chunks c
        join public.governed_precedents p on p.id=c.precedent_id
        join public.precedent_authorizations a on a.id=p.authorization_id
        where c.id=(selected->>'id')::uuid and c.content=selected->>'content'
        and c.rights_organization_id=job_row.organization_id
        and p.anonymization_status='approved' and p.governance_status='approved'
        and a.status='active' and p_precedent_purpose=any(a.authorized_purposes)
        and (a.expires_at is null or a.expires_at>clock_timestamp())
        and private.licensed_corpus_use_v1(c.rights_organization_id,c.source_rights_version_id,job_row.authorization_subject_id,'analysis')) into still_allowed;
      else still_allowed:=false;
    end case;
    if not still_allowed then raise exception 'retrieval_rights_changed' using errcode='42501'; end if;
  end loop;
  return jsonb_build_object(
    'playbook_version', active_playbook.semantic_version,
    'results', result,
    'abstained', jsonb_array_length(result) = 0
  );
end;
$$;

-- Global raw-memory reuse needs a distinct, explicit public license. Merely being available
-- at an HTTPS URL, or being returned by a search provider, is not a license to persist it.
alter table private.source_rights_versions drop constraint source_rights_versions_audience_check;
alter table private.source_rights_versions add constraint source_rights_audience_valid check(audience in ('authorized_workspace','public_raw_reuse'));
alter table private.source_rights_versions add column public_source_url text;
alter table private.source_rights_versions add column public_payload_sha256 text;
alter table private.source_rights_versions add constraint source_rights_public_evidence check(
 (audience='authorized_workspace' and public_source_url is null and public_payload_sha256 is null)
 or (audience='public_raw_reuse' and public_source_url is not null and public_payload_sha256 is not null and expires_at is not null and store_until is not null and public_source_url ~ '^https://' and public_payload_sha256 ~ '^[a-f0-9]{64}$'));
create index source_rights_public_payload_idx on private.source_rights_versions(public_payload_sha256,public_source_url) where audience='public_raw_reuse';
create function private.public_source_payload_sha256_v1(p_source jsonb) returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(jsonb_build_object('url',p_source->>'url','title',p_source->>'title','snippet',coalesce(p_source->>'snippet',''),'contentHash',p_source->>'contentHash')::text,'sha256'),'hex');
$$;
revoke all on function private.public_source_payload_sha256_v1(jsonb) from public,anon,authenticated,service_role;
create function private.declare_public_source_reuse_v1(p_version_id uuid,p_expected_revision integer,p_source_url text,p_payload_sha256 text,p_expires_at timestamptz,p_store_until timestamptz,p_evidence_id uuid,p_evidence_sha256 text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.source_versions;s public.sources;revision integer;result uuid;
begin
 select * into v from public.source_versions where id=p_version_id;
 if not found then raise exception 'public_source_rights_denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||v.organization_id::text,0));
 select * into s from public.sources where organization_id=v.organization_id and id=v.source_id;
 if not exists(select 1 from public.organizations where id=v.organization_id and organization_type='offroad')
 or not private.can_access_resource_v1(v.organization_id,s.origin_resource_id,'manage')
 or not private.can_access_resource_v1(v.organization_id,s.origin_resource_id,'read') then raise exception 'public_source_rights_denied' using errcode='42501'; end if;
 if not private.evaluate_resource_policy_v1(v.organization_id,s.origin_resource_id,auth.uid(),'work','publication')
 then raise exception 'public_source_publication_denied' using errcode='42501'; end if;
 if p_source_url is null or p_source_url !~ '^https://' or length(p_source_url)>2000 or p_payload_sha256 is null or p_payload_sha256 !~ '^[a-f0-9]{64}$'
 or p_expires_at is null or p_store_until is null then raise exception 'public_source_rights_evidence_required' using errcode='22023'; end if;
 select coalesce(max(r.revision),0) into revision from private.source_rights_versions r where r.organization_id=v.organization_id and r.source_version_id=v.id;
 if p_expected_revision is distinct from revision then raise exception 'source_rights_revision_conflict' using errcode='40001'; end if;
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256)
 values(v.organization_id,v.id,revision+1,array['read','process','store','derive','export'],array['analysis','retrieval','export'],'public_raw_reuse',clock_timestamp(),p_expires_at,p_store_until,'human_declaration',p_evidence_id,p_evidence_sha256,auth.uid(),p_source_url,p_payload_sha256) returning id into result;
 perform private.policy_invalidate_jobs_v1(v.organization_id);
 return result;
end $$;
create function public.declare_public_source_reuse_v1(p_version_id uuid,p_expected_revision integer,p_source_url text,p_payload_sha256 text,p_expires_at timestamptz,p_store_until timestamptz,p_evidence_id uuid,p_evidence_sha256 text)
returns uuid language sql security invoker set search_path='' as $$select private.declare_public_source_reuse_v1(p_version_id,p_expected_revision,p_source_url,p_payload_sha256,p_expires_at,p_store_until,p_evidence_id,p_evidence_sha256);$$;
revoke all on function private.declare_public_source_reuse_v1(uuid,integer,text,text,timestamptz,timestamptz,uuid,text),public.declare_public_source_reuse_v1(uuid,integer,text,text,timestamptz,timestamptz,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.declare_public_source_reuse_v1(uuid,integer,text,text,timestamptz,timestamptz,uuid,text),public.declare_public_source_reuse_v1(uuid,integer,text,text,timestamptz,timestamptz,uuid,text) to authenticated;

create function private.public_source_license_current_v1(p_org uuid,p_version uuid,p_through timestamptz)
returns boolean language sql volatile security definer set search_path='' as $$
 with recursive closure(id) as(select p_version union select d.source_version_id from closure c join private.resource_dependencies d on d.organization_id=p_org and d.derived_version_id=c.id),
 current_rights as(select c.id,r.* from closure c left join lateral(select r.* from private.source_rights_versions r where r.organization_id=p_org and r.source_version_id=c.id order by revision desc limit 1) r on true),
 pinned as(select r.* from closure c join private.resource_dependencies d on d.organization_id=p_org and d.derived_version_id=c.id join private.source_rights_versions r on r.organization_id=d.organization_id and r.id=d.source_rights_version_id)
 select (select count(*)<=1000 from closure)
 and not exists(select 1 from pinned where audience<>'public_raw_reuse' or not(array['read','store','derive']::text[]<@operations) or not('analysis'=any(purposes)) or valid_from>clock_timestamp() or expires_at is null or store_until is null or expires_at<=p_through or store_until<=p_through)
 and coalesce(bool_and(source_version_id is not null and audience='public_raw_reuse' and array['read','store','derive']::text[]<@operations and 'analysis'=any(purposes)
 and valid_from<=clock_timestamp() and expires_at>p_through and store_until>p_through),false) from current_rights;
$$;
revoke all on function private.public_source_license_current_v1(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
create function private.public_cache_sources_licensed_v1(p_sources jsonb,p_through timestamptz default clock_timestamp())
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare source jsonb; license_org uuid; locked_orgs uuid[] := '{}'; through_time timestamptz;
begin
 if p_through is null or jsonb_typeof(p_sources) is distinct from 'array' or jsonb_array_length(p_sources) not between 1 and 120 then return false; end if;
 -- Serialize with rights/dependency mutation in each licensing organization, including
 -- licenses owned outside the worker's organization. Re-read after waiting for the lock.
 for license_org in select distinct r.organization_id from jsonb_array_elements(p_sources) e
 join private.source_rights_versions r on r.public_source_url=e.value->>'url'
 and r.public_payload_sha256=private.public_source_payload_sha256_v1(e.value)
 join public.organizations o on o.id=r.organization_id and o.organization_type='offroad'
 order by r.organization_id loop
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||license_org::text,0));
 locked_orgs:=array_append(locked_orgs,license_org);
 end loop;
 through_time:=greatest(p_through,clock_timestamp());
 for source in select value from jsonb_array_elements(p_sources) loop
 if not exists(select 1 from private.source_rights_versions r where r.public_source_url=source->>'url'
 and r.organization_id=any(locked_orgs)
 and r.public_payload_sha256=private.public_source_payload_sha256_v1(source)
 and r.audience='public_raw_reuse'
 and exists(select 1 from public.source_versions v join public.sources s on s.organization_id=v.organization_id and s.id=v.source_id where v.organization_id=r.organization_id and v.id=r.source_version_id and s.origin_resource_id is not null
 and exists(select 1 from public.source_bindings b where b.organization_id=v.organization_id and b.source_version_id=v.id and b.revoked_at is null))
 and r.revision=(select max(x.revision) from private.source_rights_versions x where x.organization_id=r.organization_id and x.source_version_id=r.source_version_id)
 and private.public_source_license_current_v1(r.organization_id,r.source_version_id,through_time)) then return false; end if;
 end loop;
 return true;
end $$;
revoke all on function private.public_cache_sources_licensed_v1(jsonb,timestamptz) from public,anon,authenticated,service_role;

-- Preserve validated cache contracts and identity checks while requiring exact licensed payloads.
-- Every anchor is checked before replacement; a changed legacy body stops the migration.
do $$ declare body text; begin
 select pg_get_functiondef('private.worker_load_public_research_cache(uuid,text,text[])'::regprocedure) into body;
 if position('and cache.valid_until > now()' in body)=0 then raise exception 'research_cache_contract_changed'; end if;
 body:=replace(body,'and cache.valid_until > now()','and cache.valid_until > now() and private.public_cache_sources_licensed_v1(cache.sources)');execute body;
 select pg_get_functiondef('private.worker_store_public_research_cache(uuid,text,jsonb)'::regprocedure) into body;
 if position('    insert into private.public_research_query_cache (' in body)=0 then raise exception 'research_cache_contract_changed'; end if;
 body:=replace(body,'    insert into private.public_research_query_cache (',E'    if not private.public_cache_sources_licensed_v1(entry->''sources'',input_valid_until) then raise exception ''public_source_rights_required'' using errcode=''42501''; end if;\n    insert into private.public_research_query_cache (');execute body;
 select pg_get_functiondef('private.worker_load_public_company_memory(uuid,text,text)'::regprocedure) into body;
 if position('and memory.valid_until > now()' in body)=0 then raise exception 'company_memory_contract_changed'; end if;
 body:=replace(body,'and memory.valid_until > now()','and memory.valid_until > now() and private.public_cache_sources_licensed_v1(memory.sources)');execute body;
 select pg_get_functiondef('private.worker_store_public_company_memory(uuid,text,jsonb)'::regprocedure) into body;
 if position('  insert into private.public_company_source_memory (' in body)=0 then raise exception 'company_memory_contract_changed'; end if;
 body:=replace(body,'  insert into private.public_company_source_memory (',E'  if not private.public_cache_sources_licensed_v1(p_record->''sources'',input_valid_until) then raise exception ''public_source_rights_required'' using errcode=''42501''; end if;\n  insert into private.public_company_source_memory (');execute body;
end $$;
