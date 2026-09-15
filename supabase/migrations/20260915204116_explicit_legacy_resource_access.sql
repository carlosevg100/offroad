-- Stage 1B. Draft until the complete surface and revocation tests pass in staging.
-- Provenance seeds grants once; authorization never consults created_by afterwards.
create table private.access_resources (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 resource_kind text not null check(resource_kind in ('capital_project','intake_session','opportunity','workspace_group','company')),
 parent_resource_id uuid,
 capital_project_id uuid,
 intake_session_id uuid,
 opportunity_id uuid,
 workspace_group_id uuid,
 company_id uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,parent_resource_id) references private.access_resources(organization_id,id) on delete cascade,
 foreign key(organization_id,capital_project_id) references public.capital_projects(organization_id,id) on delete cascade,
 foreign key(organization_id,intake_session_id) references public.document_intake_sessions(organization_id,id) on delete cascade,
 foreign key(organization_id,opportunity_id) references public.opportunities(organization_id,id) on delete cascade,
 foreign key(organization_id,workspace_group_id) references public.workspace_project_groups(organization_id,id) on delete cascade,
 foreign key(organization_id,company_id) references public.companies(organization_id,id) on delete cascade,
 check(num_nonnulls(capital_project_id,intake_session_id,opportunity_id,workspace_group_id,company_id)=1),
 check(id=coalesce(capital_project_id,intake_session_id,opportunity_id,workspace_group_id,company_id)),
 check((resource_kind='capital_project')=(capital_project_id is not null)),
 check((resource_kind='intake_session')=(intake_session_id is not null)),
 check((resource_kind='opportunity')=(opportunity_id is not null)),
 check((resource_kind='workspace_group')=(workspace_group_id is not null)),
 check((resource_kind='company')=(company_id is not null)),
 check(parent_resource_id is null or (parent_resource_id<>id and resource_kind in ('intake_session','opportunity')))
);
create index access_resources_parent_idx on private.access_resources(organization_id,parent_resource_id);
create table private.resource_access_grants (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 resource_id uuid not null,
 subject_user_id uuid references auth.users(id),
 subject_role text check(subject_role in ('owner','admin')),
 action text not null check(action in ('read','work','manage')),
 granted_by uuid references auth.users(id),
 grant_basis text not null check(grant_basis in ('creator_bootstrap','organization_administrator','historical_assignment','explicit')),
 valid_from timestamptz not null default now(),
 expires_at timestamptz,
 revoked_at timestamptz,
 revoked_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique nulls not distinct(organization_id,resource_id,subject_user_id,subject_role,action),
 foreign key(organization_id,resource_id) references private.access_resources(organization_id,id) on delete cascade,
 check(num_nonnulls(subject_user_id,subject_role)=1),
 check(subject_role is null or grant_basis='organization_administrator'),
 check(expires_at is null or expires_at>valid_from)
);
create index resource_access_grants_subject_idx on private.resource_access_grants(subject_user_id,organization_id,resource_id);
create table private.authorization_revisions (
 id uuid not null default gen_random_uuid(),
 organization_id uuid not null,
 resource_id uuid not null,
 subject_user_id uuid not null references auth.users(id),
 revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 primary key(organization_id,resource_id,subject_user_id),
 unique(organization_id,id),
 foreign key(organization_id,resource_id) references private.access_resources(organization_id,id) on delete cascade
);

alter table private.access_resources enable row level security;
alter table private.access_resources force row level security;
alter table private.resource_access_grants enable row level security;
alter table private.resource_access_grants force row level security;
alter table private.authorization_revisions enable row level security;
alter table private.authorization_revisions force row level security;
revoke all on private.access_resources,private.resource_access_grants,private.authorization_revisions from public,anon,authenticated,service_role;
create policy access_resources_deny_clients on private.access_resources for all to authenticated using(false) with check(false);
create policy resource_access_grants_deny_clients on private.resource_access_grants for all to authenticated using(false) with check(false);
create policy authorization_revisions_deny_clients on private.authorization_revisions for all to authenticated using(false) with check(false);

create function private.resource_root_v1(p_organization_id uuid,p_resource_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
 select coalesce(r.parent_resource_id,r.id) from private.access_resources r
 where r.organization_id=p_organization_id and r.id=p_resource_id;
$$;
create function private.resource_access_as_subject_v1(p_organization_id uuid,p_resource_id uuid,p_subject_user_id uuid,p_action text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_subject_user_id is not null and p_action in ('read','work','manage') and exists(
  select 1 from private.resource_access_grants g
  join public.organization_memberships m on m.organization_id=g.organization_id and m.user_id=p_subject_user_id and m.status='active'
  where g.organization_id=p_organization_id
  and g.resource_id=private.resource_root_v1(p_organization_id,p_resource_id)
  and (g.subject_user_id=p_subject_user_id or g.subject_role=m.role)
  and (g.action=p_action or g.action='manage' or (p_action='read' and g.action='work'))
  and g.revoked_at is null and g.valid_from<=now() and (g.expires_at is null or g.expires_at>now())
 );
$$;
-- VOLATILE observes grants seeded by a BEFORE trigger in this statement (legacy intake bootstrap).
create function private.can_access_resource_v1(p_organization_id uuid,p_resource_id uuid,p_action text default 'read')
returns boolean language sql volatile security definer set search_path='' as $$
 select private.resource_access_as_subject_v1(p_organization_id,p_resource_id,(select auth.uid()),p_action)
 and coalesce(nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-offroad-workspace',''),p_organization_id::text)=p_organization_id::text;
$$;
revoke all on function private.resource_root_v1(uuid,uuid),private.resource_access_as_subject_v1(uuid,uuid,uuid,text),private.can_access_resource_v1(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.can_access_resource_v1(uuid,uuid,text) to authenticated;

create function private.seed_resource_authority_v1(p_organization_id uuid,p_resource_id uuid,p_creator_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 -- Only an actual registered root receives grants. This function is not a client API.
 if private.resource_root_v1(p_organization_id,p_resource_id) is distinct from p_resource_id then return; end if;
 insert into private.resource_access_grants(organization_id,resource_id,subject_role,action,grant_basis)
 select p_organization_id,p_resource_id,r,'manage','organization_administrator' from unnest(array['owner','admin']) r
 on conflict do nothing;

 insert into private.resource_access_grants(organization_id,resource_id,subject_user_id,action,grant_basis,granted_by)
 select p_organization_id,p_resource_id,p_creator_id,'manage','creator_bootstrap',p_creator_id
 where exists(select 1 from public.organization_memberships where organization_id=p_organization_id and user_id=p_creator_id and status='active')
 on conflict do nothing;
end $$;
revoke all on function private.seed_resource_authority_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

insert into private.access_resources(id,organization_id,resource_kind,capital_project_id)
 select id,organization_id,'capital_project',id from public.capital_projects;
insert into private.access_resources(id,organization_id,resource_kind,company_id)
 select id,organization_id,'company',id from public.companies;
insert into private.access_resources(id,organization_id,resource_kind,workspace_group_id)
 select id,organization_id,'workspace_group',id from public.workspace_project_groups;
insert into private.access_resources(id,organization_id,resource_kind,intake_session_id,parent_resource_id)
 select id,organization_id,'intake_session',id,capital_project_id from public.document_intake_sessions;
insert into private.access_resources(id,organization_id,resource_kind,opportunity_id,parent_resource_id)
 select id,organization_id,'opportunity',id,capital_project_id from public.opportunities;
select private.seed_resource_authority_v1(organization_id,id,created_by) from public.capital_projects;
select private.seed_resource_authority_v1(organization_id,id,created_by) from public.companies;
select private.seed_resource_authority_v1(organization_id,id,created_by) from public.workspace_project_groups;
select private.seed_resource_authority_v1(organization_id,id,created_by) from public.opportunities;
select private.seed_resource_authority_v1(organization_id,id,started_by) from public.document_intake_sessions;

-- Review assignments grant reading, not administration. Existing review-role checks remain.
insert into private.resource_access_grants(organization_id,resource_id,subject_user_id,action,granted_by,grant_basis)
 select a.organization_id,a.capital_project_id,a.user_id,'read',a.assigned_by,'historical_assignment'
 from public.capital_project_review_assignments a join public.organization_memberships m
 on m.organization_id=a.organization_id and m.user_id=a.user_id and m.status='active'
 on conflict do nothing;
insert into private.resource_access_grants(organization_id,resource_id,subject_user_id,action,granted_by,grant_basis,expires_at)
 select a.organization_id,private.resource_root_v1(a.organization_id,a.opportunity_id),a.user_id,'read',a.assigned_by,'historical_assignment',a.expires_at
 from public.opportunity_assignments a join public.organization_memberships m
 on m.organization_id=a.organization_id and m.user_id=a.user_id and m.status='active'
 where (a.expires_at is null or a.expires_at>now()) and a.permissions && array['opportunity.read','opportunity.*','document.read','evidence.read']
 on conflict do nothing;


create function private.register_access_resource_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare kind text := tg_argv[0]; parent_id uuid; creator_id uuid;
begin
 if kind in ('intake_session','opportunity') then parent_id := new.capital_project_id; end if;
 if parent_id is not null and not exists(select 1 from private.access_resources where organization_id=new.organization_id and id=parent_id and resource_kind='capital_project' and parent_resource_id is null) then
  raise exception 'access_resource_parent_invalid' using errcode='23514';
 end if;
 if tg_op='UPDATE' then
  if new.id<>old.id or new.organization_id<>old.organization_id then raise exception 'access_resource_identity_immutable' using errcode='42501'; end if;
  if kind in ('intake_session','opportunity') then
   if new.capital_project_id is distinct from old.capital_project_id then
   if not private.can_access_resource_v1(new.organization_id,new.id,'manage') or (parent_id is not null and not private.can_access_resource_v1(new.organization_id,parent_id,'manage')) then
    raise exception 'access_resource_rebind_denied' using errcode='42501';
   end if;
   update private.access_resources set parent_resource_id=parent_id,updated_at=now() where organization_id=new.organization_id and id=new.id;
   end if;
  end if;
  return new;
 end if;
 creator_id := case when kind='intake_session' then (to_jsonb(new)->>'started_by')::uuid else (to_jsonb(new)->>'created_by')::uuid end;
 insert into private.access_resources(id,organization_id,resource_kind,parent_resource_id,capital_project_id,intake_session_id,opportunity_id,workspace_group_id,company_id)
 values(new.id,new.organization_id,kind,parent_id,case when kind='capital_project' then new.id end,case when kind='intake_session' then new.id end,case when kind='opportunity' then new.id end,case when kind='workspace_group' then new.id end,case when kind='company' then new.id end);
 perform private.seed_resource_authority_v1(new.organization_id,new.id,creator_id);
 return new;
end $$;
revoke all on function private.register_access_resource_v1() from public,anon,authenticated,service_role;
create trigger capital_projects_access_resource after insert or update on public.capital_projects for each row execute function private.register_access_resource_v1('capital_project');
create trigger companies_access_resource after insert or update on public.companies for each row execute function private.register_access_resource_v1('company');
create trigger workspace_groups_access_resource after insert or update on public.workspace_project_groups for each row execute function private.register_access_resource_v1('workspace_group');
create trigger intake_sessions_access_resource after insert or update on public.document_intake_sessions for each row execute function private.register_access_resource_v1('intake_session');
create trigger opportunities_access_resource after insert or update on public.opportunities for each row execute function private.register_access_resource_v1('opportunity');

create function private.advance_authorization_revision_v1(p_organization_id uuid,p_resource_id uuid,p_subject_user_id uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
 insert into private.authorization_revisions(organization_id,resource_id,subject_user_id) values(p_organization_id,p_resource_id,p_subject_user_id)
 on conflict(organization_id,resource_id,subject_user_id) do update set revision=private.authorization_revisions.revision+1,updated_at=now()
 returning revision into result;
 return result;
end $$;
revoke all on function private.advance_authorization_revision_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.grant_resource_access_v1(p_resource_id uuid,p_subject_user_id uuid,p_action text,p_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r private.access_resources; result uuid; caller uuid := auth.uid(); root_id uuid;
begin
 select * into r from private.access_resources where id=p_resource_id;
 if r.id is null or not private.can_access_resource_v1(r.organization_id,r.id,'manage') then raise exception 'resource_access_denied' using errcode='42501'; end if;
 if p_action not in ('read','work','manage') or p_action is null or (p_expires_at is not null and p_expires_at<=now()) then raise exception 'resource_grant_invalid' using errcode='22023'; end if;
 if not exists(select 1 from public.organization_memberships where organization_id=r.organization_id and user_id=p_subject_user_id and status='active') then raise exception 'resource_subject_inactive' using errcode='42501'; end if;
 root_id := coalesce(r.parent_resource_id,r.id);
 perform private.advance_authorization_revision_v1(r.organization_id,root_id,p_subject_user_id);
 insert into private.resource_access_grants(organization_id,resource_id,subject_user_id,action,granted_by,grant_basis,expires_at)
 values(r.organization_id,root_id,p_subject_user_id,p_action,caller,'explicit',p_expires_at)
 on conflict(organization_id,resource_id,subject_user_id,subject_role,action) do update set
 granted_by=caller,grant_basis='explicit',valid_from=now(),expires_at=p_expires_at,revoked_at=null,revoked_by=null,updated_at=now()
 returning id into result;
 return result;
end $$;
create function public.grant_resource_access_v1(p_resource_id uuid,p_subject_user_id uuid,p_action text,p_expires_at timestamptz default null)
returns uuid language sql security invoker set search_path='' as $$select private.grant_resource_access_v1(p_resource_id,p_subject_user_id,p_action,p_expires_at);$$;

create function private.revoke_resource_access_v1(p_resource_id uuid,p_subject_user_id uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare r private.access_resources; root_id uuid; result bigint;
begin
 select * into r from private.access_resources where id=p_resource_id;
 if r.id is null or not private.can_access_resource_v1(r.organization_id,r.id,'manage') then raise exception 'resource_access_denied' using errcode='42501'; end if;
 -- Organization administrators inherit explicit role grants. Remove that administrative
 -- role through the membership command; this endpoint never claims to revoke it.
 if exists(select 1 from public.organization_memberships where organization_id=r.organization_id and user_id=p_subject_user_id and status='active' and role in ('owner','admin')) then raise exception 'organization_administrator_role_must_be_changed' using errcode='22023'; end if;
 root_id := coalesce(r.parent_resource_id,r.id);
 result := private.advance_authorization_revision_v1(r.organization_id,root_id,p_subject_user_id);
 update private.resource_access_grants set revoked_at=now(),revoked_by=auth.uid(),updated_at=now()
 where organization_id=r.organization_id and resource_id=root_id and subject_user_id=p_subject_user_id and revoked_at is null;
 return result;
end $$;
create function public.revoke_resource_access_v1(p_resource_id uuid,p_subject_user_id uuid)
returns bigint language sql security invoker set search_path='' as $$select private.revoke_resource_access_v1(p_resource_id,p_subject_user_id);$$;
revoke all on function private.grant_resource_access_v1(uuid,uuid,text,timestamptz),public.grant_resource_access_v1(uuid,uuid,text,timestamptz),private.revoke_resource_access_v1(uuid,uuid),public.revoke_resource_access_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.grant_resource_access_v1(uuid,uuid,text,timestamptz),public.grant_resource_access_v1(uuid,uuid,text,timestamptz),private.revoke_resource_access_v1(uuid,uuid),public.revoke_resource_access_v1(uuid,uuid) to authenticated;

create or replace function private.can_access_capital_project(p_organization_id uuid,p_project_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.access_resources where organization_id=p_organization_id and id=p_project_id and resource_kind='capital_project') and private.can_access_resource_v1(p_organization_id,p_project_id,'read');
$$;
create or replace function private.can_access_intake_session(p_organization_id uuid,p_session_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.access_resources where organization_id=p_organization_id and id=p_session_id and resource_kind='intake_session') and private.can_access_resource_v1(p_organization_id,p_session_id,'read');
$$;
create or replace function private.can_access_workspace_project_group(p_organization_id uuid,p_group_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.access_resources where organization_id=p_organization_id and id=p_group_id and resource_kind='workspace_group') and private.can_access_resource_v1(p_organization_id,p_group_id,'read');
$$;
create or replace function private.can_access_opportunity(p_organization_id uuid,p_opportunity_id uuid,p_permission text default 'opportunity.read')
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.access_resources where organization_id=p_organization_id and id=p_opportunity_id and resource_kind='opportunity')
 and private.can_access_resource_v1(p_organization_id,p_opportunity_id,case when p_permission in ('opportunity.read','document.read','evidence.read','output.read') then 'read' when p_permission in ('opportunity.update','opportunity.write','document.write','document.upload','document.delete','evidence.write','output.write') then 'work' else 'manage' end);
$$;
create or replace function private.can_access_document_scope(p_organization_id uuid,p_scope_id uuid,p_permission text default 'document.read')
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.access_resources where organization_id=p_organization_id and id=p_scope_id and resource_kind in ('intake_session','opportunity','capital_project'))
 and private.can_access_resource_v1(p_organization_id,p_scope_id,case when p_permission='document.read' then 'read' when p_permission in ('document.write','document.upload','document.delete') then 'work' else 'manage' end);
$$;

drop policy document_intake_sessions_select on public.document_intake_sessions;
-- Use the checked parent FK directly so INSERT RETURNING does not depend on AFTER triggers.
create policy document_intake_sessions_select on public.document_intake_sessions for select to authenticated
 using((select private.can_access_resource_v1(organization_id,coalesce(capital_project_id,id),'read')));
drop policy document_intake_sessions_update on public.document_intake_sessions;
create policy document_intake_sessions_update on public.document_intake_sessions for update to authenticated
 using((select private.can_access_resource_v1(organization_id,id,'work')))
 with check((select private.can_access_resource_v1(organization_id,id,'work')) and (capital_project_id is null or (select private.can_access_resource_v1(organization_id,capital_project_id,'work'))));
-- Direct session insertion must not attach a session to somebody else's project.
drop policy document_intake_sessions_insert on public.document_intake_sessions;
create policy document_intake_sessions_insert on public.document_intake_sessions for insert to authenticated
 with check((((started_by = ( SELECT auth.uid() AS uid)) AND ((( SELECT private.is_org_type_member(document_intake_sessions.organization_id, ARRAY['company'::text, 'originator'::text, 'offroad'::text]) AS is_org_type_member) AND (journey = ANY (ARRAY['company'::text, 'originator'::text]))) OR (( SELECT private.is_org_type_member(document_intake_sessions.organization_id, ARRAY['capital_provider'::text]) AS is_org_type_member) AND (journey = 'capital_provider'::text))))) and (capital_project_id is null or (select private.can_access_resource_v1(organization_id,capital_project_id,'work'))));
drop policy case_retrieval_chunks_select_scoped on public.case_retrieval_chunks;
create policy case_retrieval_chunks_select_scoped on public.case_retrieval_chunks for select to authenticated
 using((select private.can_access_intake_session(organization_id,intake_session_id))
 and (opportunity_id is null or (select private.can_access_opportunity(organization_id,opportunity_id,'evidence.read'))));
drop policy source_documents_select on public.source_documents;
create policy source_documents_select on public.source_documents for select to authenticated
 using((opportunity_id is null or (select private.can_access_opportunity(organization_id,opportunity_id,'document.read')))
 and (intake_session_id is null or (select private.can_access_intake_session(organization_id,intake_session_id))));
drop policy source_documents_update on public.source_documents;
create policy source_documents_update on public.source_documents for update to authenticated
 using((select private.can_access_document_scope(organization_id,coalesce(intake_session_id,opportunity_id),'document.write')))
 with check((opportunity_id is null or (select private.can_access_opportunity(organization_id,opportunity_id,'document.write')))
 and (intake_session_id is null or (select private.can_access_resource_v1(organization_id,intake_session_id,'work'))));

create function private.can_access_company_v1(p_organization_id uuid,p_company_id uuid,p_action text default 'read')
returns boolean language sql stable security definer set search_path='' as $$
 select private.can_access_resource_v1(p_organization_id,p_company_id,p_action)
 or exists(select 1 from public.capital_projects p where p.organization_id=p_organization_id and p.company_id=p_company_id
 and private.can_access_resource_v1(p.organization_id,p.id,p_action));
$$;
revoke all on function private.can_access_company_v1(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.can_access_company_v1(uuid,uuid,text) to authenticated;
drop policy companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated using((select private.can_access_company_v1(organization_id,id,'read')));
drop policy companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated using((select private.can_access_company_v1(organization_id,id,'work'))) with check((select private.can_access_company_v1(organization_id,id,'work')));
create function private.can_access_capital_request_v1(p_organization_id uuid,p_request_id uuid,p_action text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.capital_requests r where r.organization_id=p_organization_id and r.id=p_request_id and (
 exists(select 1 from public.opportunities o where o.organization_id=r.organization_id and o.capital_request_id=r.id and private.can_access_resource_v1(o.organization_id,o.id,p_action))
 or (not exists(select 1 from public.opportunities o where o.organization_id=r.organization_id and o.capital_request_id=r.id) and private.can_access_resource_v1(r.organization_id,r.company_id,'manage'))));
$$;
revoke all on function private.can_access_capital_request_v1(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.can_access_capital_request_v1(uuid,uuid,text) to authenticated;
drop policy capital_requests_select on public.capital_requests;
create policy capital_requests_select on public.capital_requests for select to authenticated using((select private.can_access_capital_request_v1(organization_id,id,'read')));
drop policy capital_requests_update on public.capital_requests;
create policy capital_requests_update on public.capital_requests for update to authenticated using((select private.can_access_capital_request_v1(organization_id,id,'work'))) with check((select private.can_access_capital_request_v1(organization_id,id,'work')));
drop policy capital_requests_insert on public.capital_requests;
create policy capital_requests_insert on public.capital_requests for insert to authenticated with check(created_by=(select auth.uid()) and (select private.can_access_company_v1(organization_id,company_id,'work')));
drop policy intent_envelopes_select on public.intent_envelopes;
create policy intent_envelopes_select on public.intent_envelopes for select to authenticated using((select private.can_access_capital_project(organization_id,capital_project_id)));
drop policy case_execution_comparisons_select on public.case_execution_comparisons;
create policy case_execution_comparisons_select on public.case_execution_comparisons for select to authenticated using(
 exists(select 1 from public.controlled_case_executions e where e.organization_id=case_execution_comparisons.organization_id and e.id=case_execution_comparisons.baseline_execution_id and private.can_access_intake_session(e.organization_id,e.intake_session_id))
 and exists(select 1 from public.controlled_case_executions e where e.organization_id=case_execution_comparisons.organization_id and e.id=case_execution_comparisons.candidate_execution_id and private.can_access_intake_session(e.organization_id,e.intake_session_id)));

alter table public.processing_jobs add column authorization_subject_id uuid references auth.users(id),
 add column authorization_resource_id uuid,
 add column authorization_revision bigint,
 add column leased_account_user_id uuid references auth.users(id),
 add foreign key(organization_id,authorization_resource_id) references private.access_resources(organization_id,id) on delete cascade;
create index processing_jobs_authority_idx on public.processing_jobs(organization_id,authorization_resource_id,authorization_subject_id);
update public.processing_jobs j set authorization_subject_id=r.created_by,
 authorization_resource_id=private.resource_root_v1(j.organization_id,j.intake_session_id)
 from public.processing_runs r where r.organization_id=j.organization_id and r.id=j.processing_run_id;
insert into private.authorization_revisions(organization_id,resource_id,subject_user_id)
 select distinct organization_id,authorization_resource_id,authorization_subject_id from public.processing_jobs
 where authorization_resource_id is not null and authorization_subject_id is not null on conflict do nothing;
update public.processing_jobs j set authorization_revision=r.revision from private.authorization_revisions r
 where r.organization_id=j.organization_id and r.resource_id=j.authorization_resource_id and r.subject_user_id=j.authorization_subject_id;

create function private.job_authority_is_current_v1(p_job_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.processing_jobs j join private.authorization_revisions r
 on r.organization_id=j.organization_id and r.resource_id=j.authorization_resource_id and r.subject_user_id=j.authorization_subject_id
 where j.id=p_job_id and j.authorization_revision=r.revision
 and j.authorization_resource_id=private.resource_root_v1(j.organization_id,j.intake_session_id)
 and private.resource_access_as_subject_v1(j.organization_id,j.authorization_resource_id,j.authorization_subject_id,'work'));
$$;
create function private.lock_job_authority_v1(p_job_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 -- Revocation locks this same row exclusively. Publication and revocation have a
 -- defined order; a completed revocation cannot be followed by a stale publication.
 perform 1 from private.authorization_revisions r join public.processing_jobs j
 on r.organization_id=j.organization_id and r.resource_id=j.authorization_resource_id and r.subject_user_id=j.authorization_subject_id
 where j.id=p_job_id for share of r;
 return private.job_authority_is_current_v1(p_job_id);
end $$;
revoke all on function private.job_authority_is_current_v1(uuid),private.lock_job_authority_v1(uuid) from public,anon,authenticated,service_role;

create function private.bind_job_authority_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare subject_id uuid := auth.uid(); root_id uuid; parent_subject uuid;
begin
 root_id := private.resource_root_v1(new.organization_id,new.intake_session_id);
 if subject_id is null then
  select created_by into subject_id from public.processing_runs where organization_id=new.organization_id and id=new.processing_run_id;
 elsif not private.resource_access_as_subject_v1(new.organization_id,root_id,subject_id,'work') then
  -- Follow-up work inherits a currently leased parent or the parent just completed
  -- by this transaction. A completed job from an earlier transaction confers nothing.
  select j.authorization_subject_id into parent_subject from public.processing_jobs j
  where j.organization_id=new.organization_id and j.authorization_resource_id=root_id
  and exists(select 1 from public.processing_runs r where r.organization_id=new.organization_id and r.id=new.processing_run_id and r.created_by=j.authorization_subject_id)
  and j.leased_account_user_id=subject_id
  and ((j.status='leased' and j.lease_expires_at>now()) or (j.status='succeeded' and j.xmin=pg_current_xact_id()::xid))
  and private.job_authority_is_current_v1(j.id) order by j.created_at desc limit 1;
  subject_id:=parent_subject;
 end if;
 if not private.resource_access_as_subject_v1(new.organization_id,root_id,subject_id,'work') then raise exception 'job_authorization_denied' using errcode='42501'; end if;
 insert into private.authorization_revisions(organization_id,resource_id,subject_user_id) values(new.organization_id,root_id,subject_id) on conflict do nothing;
 new.authorization_subject_id:=subject_id;
 new.authorization_resource_id:=root_id;
 select revision into new.authorization_revision from private.authorization_revisions
 where organization_id=new.organization_id and resource_id=root_id and subject_user_id=subject_id for share;
 return new;
end $$;
revoke all on function private.bind_job_authority_v1() from public,anon,authenticated,service_role;
create trigger processing_jobs_bind_authority before insert on public.processing_jobs for each row execute function private.bind_job_authority_v1();

create function private.revoke_membership_resources_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_user uuid := old.user_id; target_org uuid := old.organization_id; r record;
begin
 if tg_op='UPDATE' and old.status is not distinct from new.status and old.role is not distinct from new.role then return new; end if;
 for r in select distinct id from private.access_resources where organization_id=target_org and parent_resource_id is null loop
  perform private.advance_authorization_revision_v1(target_org,r.id,target_user);
 end loop;
 if tg_op='DELETE' or new.status<>'active' then
  update private.resource_access_grants set revoked_at=now(),revoked_by=auth.uid(),updated_at=now()
  where organization_id=target_org and subject_user_id=target_user and revoked_at is null;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function private.revoke_membership_resources_v1() from public,anon,authenticated,service_role;
create trigger organization_memberships_resource_revocation after update or delete on public.organization_memberships for each row execute function private.revoke_membership_resources_v1();

update public.processing_jobs set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null,
 last_error=jsonb_build_object('reason','authorization_revoked')
 where status in ('queued','leased','awaiting_approval') and not private.job_authority_is_current_v1(id);

do $patch$
declare body text; item record;
begin
 select pg_get_functiondef('private.job_for_capability(uuid,text)'::regprocedure) into body;
 if position('if private.requires_execution_brief_approval(job_row.id)' in body)=0 then raise exception 'job_capability_contract_changed'; end if;
 body:=replace(body,'if private.requires_execution_brief_approval(job_row.id)',E'if not private.lock_job_authority_v1(job_row.id) then raise exception ''job_authorization_revoked'' using errcode=''42501''; end if;\n  if private.requires_execution_brief_approval(job_row.id)');
 execute body;
 for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('worker_claim_job','worker_claim_job_v2') loop
  body:=pg_get_functiondef(item.oid);
  if position('job_row.attempts + 1 > job_row.max_attempts' in body)=0 or position('leased_by = worker_id,' in body)=0 then raise exception 'worker_claim_contract_changed'; end if;
  body:=replace(body,'if job_row.attempts + 1 > job_row.max_attempts',E'if not private.lock_job_authority_v1(job_row.id) then\n update public.processing_jobs set status=''cancelled'',capability_sha256=null,leased_by=null,lease_expires_at=null,last_error=jsonb_build_object(''reason'',''authorization_revoked'') where id=job_row.id;\n return jsonb_build_object(''claimed'',false);\n end if;\n if job_row.attempts + 1 > job_row.max_attempts');
  body:=replace(body,'leased_by = worker_id,','leased_by = worker_id, leased_account_user_id = auth.uid(),');
  execute body;
 end loop;
end $patch$;

create or replace function private.intake_session_for_update(p_organization_id uuid,p_session_id uuid)
returns public.document_intake_sessions language plpgsql set search_path='' as $$
declare result public.document_intake_sessions;
begin
 if not private.can_access_resource_v1(p_organization_id,p_session_id,'work') then raise exception 'resource_access_denied' using errcode='42501'; end if;
 select * into result from public.document_intake_sessions where organization_id=p_organization_id and id=p_session_id for update;
 if not found then raise exception 'resource_access_denied' using errcode='42501'; end if;
 return result;
end $$;

create function private.require_resource_access_v1(p_resource_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare org_id uuid;
begin
 select organization_id into org_id from private.access_resources where id=p_resource_id;
 if org_id is null or not private.can_access_resource_v1(org_id,p_resource_id,p_action) then raise exception 'resource_access_denied' using errcode='42501'; end if;
end $$;
revoke all on function private.require_resource_access_v1(uuid,text) from public,anon,authenticated,service_role;

-- These live privileged commands resolve membership internally, so an RLS change alone
-- cannot protect them. Preserve their signatures and add the same resource boundary.
do $guards$
declare item record; body text; scope_arg text; access_action text;
begin
 for item in select n.nspname,p.proname,p.oid,pg_get_function_identity_arguments(p.oid) args
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in (
 'append_advisor_message_v1','authorize_capital_project_private_work','decide_advisor_preliminary_v1',
 'manage_workspace_project','manage_workspace_project_group','queue_advisor_initial_turn_v1','record_capital_project_plan',
 'request_documentary_work_revision_v1','save_project_company_context','set_workspace_project_job',
 'submit_advisor_artifact_revision_turn_v1','submit_advisor_execution_brief_edit_v1','submit_advisor_information_response_v1','submit_advisor_turn_v1',
 'update_workspace_project','save_guided_company_profile','save_project_company_profile',
 'read_capital_project_review_context_v1','read_institutional_configuration_reviews_v1','read_institutional_model_results_v1',
 'read_institutional_model_setup_v1','read_institutional_revision_proposals_v1','read_project_revision_history_v1',
 'read_presentation_template_v1','set_capital_project_review_assignment_v1'
 ) loop
  scope_arg:=case when item.args like '%p_project_id uuid%' then 'p_project_id' when item.args like '%p_session_id uuid%' then 'p_session_id' when item.args like '%p_group_id uuid%' then 'p_group_id' end;
  access_action:=case when item.proname like 'read_%' then 'read' when item.proname='set_capital_project_review_assignment_v1' then 'manage' else 'work' end;
  body:=pg_get_functiondef(item.oid);
  if scope_arg is null or body !~* '\mbegin\M' then raise exception 'resource_command_contract_changed: %',item.proname; end if;
  body:=regexp_replace(body,'\mbegin\M',format(E'begin\n perform private.require_resource_access_v1(%s,%L);',scope_arg,access_action),'i');
  execute body;
 end loop;
end $guards$;

create trigger access_resources_updated_at before update on private.access_resources for each row execute function private.set_updated_at();
create trigger resource_access_grants_updated_at before update on private.resource_access_grants for each row execute function private.set_updated_at();
create trigger authorization_revisions_updated_at before update on private.authorization_revisions for each row execute function private.set_updated_at();
create trigger access_resources_audit after insert or update or delete on private.access_resources for each row execute function private.capture_audit_event();
create trigger resource_access_grants_audit after insert or update or delete on private.resource_access_grants for each row execute function private.capture_audit_event();
create trigger authorization_revisions_audit after insert or update or delete on private.authorization_revisions for each row execute function private.capture_audit_event();

drop policy match_results_all on public.match_results;
create policy match_results_select_scoped on public.match_results for select to authenticated using(
 exists(select 1 from public.match_runs r where r.organization_id=match_results.organization_id and r.id=match_results.match_run_id and private.can_access_opportunity(r.organization_id,r.opportunity_id,'opportunity.read')));
create policy match_results_insert_scoped on public.match_results for insert to authenticated with check(
 exists(select 1 from public.match_runs r where r.organization_id=match_results.organization_id and r.id=match_results.match_run_id and private.can_access_resource_v1(r.organization_id,r.opportunity_id,'work')));
create policy match_results_update_scoped on public.match_results for update to authenticated using(
 exists(select 1 from public.match_runs r where r.organization_id=match_results.organization_id and r.id=match_results.match_run_id and private.can_access_resource_v1(r.organization_id,r.opportunity_id,'work')))
 with check(exists(select 1 from public.match_runs r where r.organization_id=match_results.organization_id and r.id=match_results.match_run_id and private.can_access_resource_v1(r.organization_id,r.opportunity_id,'work')));
create policy match_results_delete_scoped on public.match_results for delete to authenticated using(
 exists(select 1 from public.match_runs r where r.organization_id=match_results.organization_id and r.id=match_results.match_run_id and private.can_access_resource_v1(r.organization_id,r.opportunity_id,'work')));
drop policy scenario_versions_all on public.scenario_versions;
create policy scenario_versions_select_scoped on public.scenario_versions for select to authenticated using(
 exists(select 1 from public.structure_scenarios s where s.organization_id=scenario_versions.organization_id and s.id=scenario_versions.structure_scenario_id and private.can_access_opportunity(s.organization_id,s.opportunity_id,'opportunity.read')));
create policy scenario_versions_insert_scoped on public.scenario_versions for insert to authenticated with check(
 created_by=(select auth.uid()) and exists(select 1 from public.structure_scenarios s where s.organization_id=scenario_versions.organization_id and s.id=scenario_versions.structure_scenario_id and private.can_access_resource_v1(s.organization_id,s.opportunity_id,'work')));
create policy scenario_versions_update_scoped on public.scenario_versions for update to authenticated using(
 exists(select 1 from public.structure_scenarios s where s.organization_id=scenario_versions.organization_id and s.id=scenario_versions.structure_scenario_id and private.can_access_resource_v1(s.organization_id,s.opportunity_id,'work')))
 with check(exists(select 1 from public.structure_scenarios s where s.organization_id=scenario_versions.organization_id and s.id=scenario_versions.structure_scenario_id and private.can_access_resource_v1(s.organization_id,s.opportunity_id,'work')));
create policy scenario_versions_delete_scoped on public.scenario_versions for delete to authenticated using(
 exists(select 1 from public.structure_scenarios s where s.organization_id=scenario_versions.organization_id and s.id=scenario_versions.structure_scenario_id and private.can_access_resource_v1(s.organization_id,s.opportunity_id,'manage')));

drop policy workflow_runs_all on public.workflow_runs;
create policy workflow_runs_select_scoped on public.workflow_runs for select to authenticated using((select private.can_access_opportunity(organization_id,opportunity_id,'opportunity.read')));
create policy workflow_runs_insert_scoped on public.workflow_runs for insert to authenticated with check(started_by=(select auth.uid()) and (select private.can_access_resource_v1(organization_id,opportunity_id,'work')));
create policy workflow_runs_update_scoped on public.workflow_runs for update to authenticated using((select private.can_access_resource_v1(organization_id,opportunity_id,'work'))) with check((select private.can_access_resource_v1(organization_id,opportunity_id,'work')));
create policy workflow_runs_delete_scoped on public.workflow_runs for delete to authenticated using((select private.can_access_resource_v1(organization_id,opportunity_id,'manage')));

drop policy published_projections_select on public.published_opportunity_projections;
create policy published_projections_select on public.published_opportunity_projections for select to authenticated using(
 (status='published' and (expires_at is null or expires_at>now())) or (select private.can_access_opportunity(organization_id,opportunity_id,'opportunity.read')));
drop policy published_projections_insert on public.published_opportunity_projections;
create policy published_projections_insert on public.published_opportunity_projections for insert to authenticated with check((select private.can_access_resource_v1(organization_id,opportunity_id,'work')) and (status not in ('approved','published') or (select private.has_aal2())));
drop policy published_projections_update on public.published_opportunity_projections;
create policy published_projections_update on public.published_opportunity_projections for update to authenticated using((select private.can_access_resource_v1(organization_id,opportunity_id,'work'))) with check((select private.can_access_resource_v1(organization_id,opportunity_id,'work')) and (status not in ('approved','published') or (select private.has_aal2())));

create function private.worker_can_access_document_storage_v1(p_bucket text,p_object_path text,p_write boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.processing_jobs j
 join public.source_documents d on d.organization_id=j.organization_id and d.id=j.source_document_id
 where j.kind='document_pipeline' and j.status='leased' and j.lease_expires_at>now()
 and j.leased_account_user_id=auth.uid() and private.job_authority_is_current_v1(j.id)
 and ((not p_write and p_bucket='opportunity-documents' and p_object_path=d.object_path)
 or (p_bucket='document-layers' and p_object_path=j.payload->>'layer_object_path')));
$$;
create function private.worker_authorize_document_storage_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs := private.job_for_capability(p_job_id,p_capability_token); d public.source_documents; layer_path text;
begin
 if j.kind<>'document_pipeline' or auth.uid() is null or j.leased_account_user_id is distinct from auth.uid() then raise exception 'job_storage_denied' using errcode='42501'; end if;
 select * into d from public.source_documents where organization_id=j.organization_id and id=j.source_document_id and intake_session_id=j.intake_session_id;
 if not found then raise exception 'job_storage_denied' using errcode='42501'; end if;
 layer_path:=j.organization_id::text||'/'||j.intake_session_id::text||'/'||d.id::text||'/'||j.id::text||'.json';
 update public.processing_jobs set payload=(payload-'download_url'-'layer_upload_url')||jsonb_build_object('layer_object_path',layer_path) where id=j.id;
 return jsonb_build_object('source_bucket',d.bucket_id,'source_path',d.object_path,'layer_bucket','document-layers','layer_path',layer_path);
end $$;
create function public.worker_authorize_document_storage_v1(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_authorize_document_storage_v1(p_job_id,p_capability_token);$$;
revoke all on function private.worker_can_access_document_storage_v1(text,text,boolean),private.worker_authorize_document_storage_v1(uuid,text),public.worker_authorize_document_storage_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_can_access_document_storage_v1(text,text,boolean),private.worker_authorize_document_storage_v1(uuid,text),public.worker_authorize_document_storage_v1(uuid,text) to authenticated;

-- Normal authenticated Storage requests remain possible; bearer signing is not an
-- authorization mechanism. The API supplies storage.operation, not client metadata.
create function private.storage_operation_is_revocable_v1()
returns boolean language sql stable set search_path='' as $$
 select storage.allow_any_operation(array[
  'object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info',
  'object.list','object.list_v2','object.upload','object.upload_update','object.delete','object.delete_many','object.move','object.copy'
 ]);
$$;
revoke all on function private.storage_operation_is_revocable_v1() from public,anon,authenticated,service_role;
grant execute on function private.storage_operation_is_revocable_v1() to authenticated;
create policy private_storage_no_bearer_signing on storage.objects as restrictive for all to authenticated
 using((select private.storage_operation_is_revocable_v1())) with check((select private.storage_operation_is_revocable_v1()));
create policy job_document_storage_select on storage.objects for select to authenticated
 using((select private.worker_can_access_document_storage_v1(bucket_id,name,false)));
create policy job_document_layer_storage_insert on storage.objects for insert to authenticated
 with check(bucket_id='document-layers' and (select private.worker_can_access_document_storage_v1(bucket_id,name,true)));
create policy job_document_layer_storage_update on storage.objects for update to authenticated
 using(bucket_id='document-layers' and (select private.worker_can_access_document_storage_v1(bucket_id,name,true)))
 with check(bucket_id='document-layers' and (select private.worker_can_access_document_storage_v1(bucket_id,name,true)));

do $pipeline$
declare body text; start_at integer; end_at integer;
begin
 select pg_get_functiondef('private.begin_processing_run(uuid,uuid,text,jsonb,text,jsonb)'::regprocedure) into body;
 start_at:=position('download_url := document_entry' in body);
 end_at:=position('insert into public.processing_jobs (' in substring(body from start_at));
 if start_at=0 or end_at=0 then raise exception 'processing_document_contract_changed'; end if;
 body:=substring(body for start_at-1)||E'layer_object_path := p_organization_id::text||''/''||p_session_id::text||''/''||document_row.id::text||''/''||run_row.id::text||''.json'';\n    '||substring(body from start_at+end_at-1);
 body:=replace(body,E'        ''download_url'', download_url,\n','');
 body:=replace(body,E'        ''layer_upload_url'', layer_upload_url,\n','');
 execute body;
end $pipeline$;

-- Old binaries idle during the rollout instead of claiming work they cannot read.
-- The queue and its persisted jobs remain the same; only the claim contract advances.
create function public.worker_claim_job_v3(p_worker_token text,p_lease_seconds integer default 600)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_claim_job_v2(p_worker_token,p_lease_seconds);$$;
revoke all on function public.worker_claim_job_v3(text,integer) from public,anon,authenticated,service_role;
grant execute on function public.worker_claim_job_v3(text,integer) to authenticated;
create or replace function public.worker_claim_job_v2(p_worker_token text,p_lease_seconds integer default 600)
returns jsonb language sql security invoker set search_path='' as $$select jsonb_build_object('claimed',false);$$;
create or replace function public.worker_claim_job(p_worker_token text,p_lease_seconds integer default 600)
returns jsonb language sql security invoker set search_path='' as $$select jsonb_build_object('claimed',false);$$;

create function private.canonical_job_storage_payload_v1(p_job_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when j.kind='document_pipeline' then (j.payload-'download_url'-'layer_upload_url')||jsonb_build_object(
 'object_path',d.object_path,'layer_object_path',j.organization_id::text||'/'||j.intake_session_id::text||'/'||d.id::text||'/'||j.id::text||'.json') else j.payload end
 from public.processing_jobs j left join public.source_documents d on d.organization_id=j.organization_id and d.id=j.source_document_id where j.id=p_job_id;
$$;
revoke all on function private.canonical_job_storage_payload_v1(uuid) from public,anon,authenticated,service_role;
do $claim_payload$
declare body text;
begin
 select pg_get_functiondef('private.worker_claim_job_v2(text,integer)'::regprocedure) into body;
 if position('leased_by = worker_id,' in body)=0 then raise exception 'worker_claim_payload_contract_changed'; end if;
 body:=replace(body,'leased_by = worker_id,','payload = private.canonical_job_storage_payload_v1(id), leased_by = worker_id,');
 execute body;
end $claim_payload$;

-- Explicit workspace context, advanced from stage 2 by founder approval.
-- The request chooses a context, never authority. PostgreSQL validates current membership.
create or replace function private.workspace_membership_v1()
returns table(organization_id uuid,role text,organization_type text)
language plpgsql stable security definer set search_path='' as $$
declare selected text; selected_id uuid; memberships bigint;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
 selected := nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-offroad-workspace','');
 if selected is not null then
  begin selected_id := selected::uuid;
  exception when invalid_text_representation then raise exception 'workspace_context_invalid' using errcode='22023'; end;
  if not exists(select 1 from public.organization_memberships m where m.organization_id=selected_id and m.user_id=auth.uid() and m.status='active') then
   raise exception 'workspace_context_denied' using errcode='42501';
  end if;
 else
  select count(*) into memberships from public.organization_memberships m where m.user_id=auth.uid() and m.status='active';
  if memberships>1 then raise exception 'workspace_context_required' using errcode='P0001'; end if;
 end if;
 return query select m.organization_id,m.role,o.organization_type
 from public.organization_memberships m join public.organizations o on o.id=m.organization_id
 where m.user_id=auth.uid() and m.status='active' and (selected_id is null or m.organization_id=selected_id);
end $$;
create function private.list_my_workspaces_v1()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'role',m.role) order by o.name,o.id),'[]'::jsonb)
 from public.organization_memberships m join public.organizations o on o.id=m.organization_id
 where m.user_id=(select auth.uid()) and m.status='active';
$$;
create function public.list_my_workspaces_v1()
returns jsonb language sql stable security invoker set search_path='' as $$ select private.list_my_workspaces_v1(); $$;
revoke all on function private.list_my_workspaces_v1(),public.list_my_workspaces_v1() from public,anon,authenticated,service_role;
grant execute on function private.list_my_workspaces_v1(),public.list_my_workspaces_v1() to authenticated;

CREATE OR REPLACE FUNCTION private.job_for_failure_capability(p_job_id uuid, p_capability_token text)
 RETURNS processing_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.processing_jobs;
begin
  if p_capability_token is null or char_length(p_capability_token)<32 then raise exception 'job_capability_invalid' using errcode='42501'; end if;
  select * into j from public.processing_jobs where id=p_job_id and status='leased'
    and capability_sha256=extensions.digest(p_capability_token,'sha256') and lease_expires_at>now() for update;
  if not found then raise exception 'job_capability_invalid' using errcode='42501'; end if;
  if not private.lock_job_authority_v1(j.id) then raise exception 'job_authorization_revoked' using errcode='42501'; end if;
  return j;
end;
$function$;

CREATE OR REPLACE FUNCTION private.can_review_intake_claims(p_organization_id uuid, p_session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (select auth.uid()) is not null
    and private.can_access_resource_v1(p_organization_id,p_session_id,'read')
    and exists (
      select 1
      from public.document_intake_sessions session
      join public.organization_memberships membership
        on membership.organization_id = session.organization_id
      join public.organizations organization_record
        on organization_record.id = session.organization_id
      where session.organization_id = p_organization_id
        and session.id = p_session_id
        and session.status <> 'confirmed'
        -- Changed: allowlist.
        and organization_record.organization_type in ('company', 'originator', 'capital_provider', 'offroad')
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and membership.role in ('owner', 'admin', 'analyst', 'compliance')
    );
$function$;

CREATE OR REPLACE FUNCTION private.worker_can_access_capital_project_material(p_object_path text, p_write boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.capital_project_material_upload_grants grant_row
      join public.processing_jobs job on job.organization_id=grant_row.organization_id and job.id=grant_row.processing_job_id
      where job.status='leased' and job.lease_expires_at>now() and private.job_authority_is_current_v1(job.id)
        and grant_row.worker_account_id = (select auth.uid())
        and grant_row.object_path = p_object_path
        and grant_row.expires_at > now()
        and (
          (p_write and grant_row.state = 'authorized')
          or (not p_write and grant_row.state in ('authorized', 'stored'))
        )
    );
$function$;

-- Versions must never bypass their parent artifact's opportunity boundary.
drop policy output_versions_all on public.output_versions;
create policy output_versions_select_scoped on public.output_versions for select to authenticated using(
 exists(select 1 from public.output_artifacts a where a.organization_id=output_versions.organization_id and a.id=output_versions.output_artifact_id
 and private.can_access_opportunity(a.organization_id,a.opportunity_id,'output.read')));
create policy output_versions_insert_scoped on public.output_versions for insert to authenticated with check(
 exists(select 1 from public.output_artifacts a where a.organization_id=output_versions.organization_id and a.id=output_versions.output_artifact_id
 and private.can_access_opportunity(a.organization_id,a.opportunity_id,'output.write')));
create policy output_versions_update_scoped on public.output_versions for update to authenticated using(
 exists(select 1 from public.output_artifacts a where a.organization_id=output_versions.organization_id and a.id=output_versions.output_artifact_id
 and private.can_access_opportunity(a.organization_id,a.opportunity_id,'output.write')))
 with check(exists(select 1 from public.output_artifacts a where a.organization_id=output_versions.organization_id and a.id=output_versions.output_artifact_id
 and private.can_access_opportunity(a.organization_id,a.opportunity_id,'output.write')));
create policy output_versions_delete_scoped on public.output_versions for delete to authenticated using(
 exists(select 1 from public.output_artifacts a where a.organization_id=output_versions.organization_id and a.id=output_versions.output_artifact_id
 and private.can_access_opportunity(a.organization_id,a.opportunity_id,'output.write')));

-- Keep invitation history while allowing more than one revoked or accepted invitation.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.organization_invites'::regclass and contype='u' and pg_get_constraintdef(oid) like '%organization_id, email_hash, status%' loop
  execute format('alter table public.organization_invites drop constraint %I',c.conname);
 end loop;
end $$;
create unique index organization_invites_one_pending on public.organization_invites(organization_id,email_hash) where status='pending';
-- Customer-owned membership administration. Invitations are accepted only by their
-- verified recipient; knowing an invitation UUID is never sufficient authority.
create function private.invite_workspace_member_v1(p_email text,p_role text)
returns uuid language plpgsql security definer set search_path='' as $$
declare context record; result uuid; normalized text := lower(btrim(p_email));
begin
 select * into context from private.workspace_membership_v1();
 if context.organization_id is null or not private.can_assign_organization_role_v1(context.organization_id,p_role) then raise exception 'membership_administration_denied' using errcode='42501'; end if;
 if normalized is null or length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invite_email_invalid' using errcode='22023'; end if;
 -- Serialize duplicate invitations without keeping the recipient's email in a public table.
 perform pg_advisory_xact_lock(hashtextextended(context.organization_id::text||normalized,0));
 update public.organization_invites set status='revoked' where organization_id=context.organization_id and email_hash=extensions.digest(normalized,'sha256') and status='pending';
 insert into public.organization_invites(organization_id,email_hash,role,status,expires_at,invited_by)
 values(context.organization_id,extensions.digest(normalized,'sha256'),p_role,'pending',now()+interval '7 days',auth.uid()) returning id into result;
 return result;
end $$;
create function private.list_my_workspace_invites_v1()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'organization_name',o.name,'role',i.role,'expires_at',i.expires_at) order by i.created_at),'[]'::jsonb)
 from public.organization_invites i join public.organizations o on o.id=i.organization_id
 join auth.users u on u.id=(select auth.uid()) and u.email_confirmed_at is not null and i.email_hash=extensions.digest(lower(btrim(u.email)),'sha256')
 where i.status='pending' and i.expires_at>now();
$$;
create function private.accept_workspace_invite_v1(p_invite_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare invite public.organization_invites; caller uuid := auth.uid(); recipient_hash bytea;
begin
 select extensions.digest(lower(btrim(email)),'sha256') into recipient_hash from auth.users where id=caller and email_confirmed_at is not null;
 select * into invite from public.organization_invites where id=p_invite_id and email_hash=recipient_hash for update;
 if invite.id is null then raise exception 'invitation_unavailable' using errcode='42501'; end if;
 if invite.status='accepted' and invite.accepted_by=caller and private.is_org_member(invite.organization_id) then return invite.organization_id; end if;
 if invite.status<>'pending' or invite.expires_at<=now() or not exists(
  select 1 from public.organization_memberships m where m.organization_id=invite.organization_id and m.user_id=invite.invited_by and m.status='active'
  and (m.role='owner' or (m.role='admin' and invite.role not in ('owner','admin')))
 ) or invite.role='owner' then raise exception 'invitation_unavailable' using errcode='42501'; end if;
 if exists(select 1 from public.organization_memberships where organization_id=invite.organization_id and user_id=caller) then
  raise exception 'membership_requires_administrator' using errcode='42501';
 end if;
 insert into public.organization_memberships(organization_id,user_id,role,status) values(invite.organization_id,caller,invite.role,'active');
 update public.organization_invites set status='accepted',accepted_by=caller where id=invite.id;
 -- Joining an existing workspace does not redo the founder's institutional onboarding.
 insert into public.onboarding_progress(organization_id,user_id,journey,current_step,completed_at)
 select invite.organization_id,caller,case when organization_type='capital_provider' then 'capital_provider' when organization_type='company' then 'company' else 'originator' end,'completed',now()
 from public.organizations where id=invite.organization_id;
 return invite.organization_id;
end $$;
create function private.set_workspace_member_v1(p_user_id uuid,p_role text,p_status text)
returns void language plpgsql security definer set search_path='' as $$
declare context record;
begin
 select * into context from private.workspace_membership_v1();
 if context.organization_id is null or not private.can_administer_membership_v1(context.organization_id,p_user_id,p_role) then raise exception 'membership_administration_denied' using errcode='42501'; end if;
 if p_status is null or p_status not in ('active','suspended') then raise exception 'membership_status_invalid' using errcode='22023'; end if;
 update public.organization_memberships set role=p_role,status=p_status where organization_id=context.organization_id and user_id=p_user_id;
 if not found then raise exception 'membership_unavailable' using errcode='42501'; end if;
end $$;
create function public.invite_workspace_member_v1(p_email text,p_role text) returns uuid language sql security invoker set search_path='' as $$ select private.invite_workspace_member_v1(p_email,p_role); $$;
create function public.list_my_workspace_invites_v1() returns jsonb language sql stable security invoker set search_path='' as $$ select private.list_my_workspace_invites_v1(); $$;
create function public.accept_workspace_invite_v1(p_invite_id uuid) returns uuid language sql security invoker set search_path='' as $$ select private.accept_workspace_invite_v1(p_invite_id); $$;
create function public.set_workspace_member_v1(p_user_id uuid,p_role text,p_status text) returns void language sql security invoker set search_path='' as $$ select private.set_workspace_member_v1(p_user_id,p_role,p_status); $$;
revoke all on function private.invite_workspace_member_v1(text,text),private.list_my_workspace_invites_v1(),private.accept_workspace_invite_v1(uuid),private.set_workspace_member_v1(uuid,text,text),public.invite_workspace_member_v1(text,text),public.list_my_workspace_invites_v1(),public.accept_workspace_invite_v1(uuid),public.set_workspace_member_v1(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.invite_workspace_member_v1(text,text),private.list_my_workspace_invites_v1(),private.accept_workspace_invite_v1(uuid),private.set_workspace_member_v1(uuid,text,text),public.invite_workspace_member_v1(text,text),public.list_my_workspace_invites_v1(),public.accept_workspace_invite_v1(uuid),public.set_workspace_member_v1(uuid,text,text) to authenticated;
create function private.read_workspace_access_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context record;
begin
 select * into context from private.workspace_membership_v1();
 if context.organization_id is null or context.role not in ('owner','admin') then raise exception 'membership_administration_denied' using errcode='42501'; end if;
 return jsonb_build_object(
 'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(p.full_name,u.email),'email',u.email,'role',m.role,'status',m.status) order by p.full_name,u.email),'[]'::jsonb)
 from public.organization_memberships m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=m.user_id where m.organization_id=context.organization_id),
 'resources',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.project_name) order by p.project_name),'[]'::jsonb)
 from public.capital_projects p where p.organization_id=context.organization_id and private.can_access_resource_v1(p.organization_id,p.id,'manage')),
 'grants',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'resource_id',g.resource_id,'user_id',g.subject_user_id,'action',g.action,'expires_at',g.expires_at)),'[]'::jsonb)
 from private.resource_access_grants g where g.organization_id=context.organization_id and g.subject_user_id is not null and g.revoked_at is null and (g.expires_at is null or g.expires_at>now()))
 );
end $$;
create function public.read_workspace_access_v1() returns jsonb language sql stable security invoker set search_path='' as $$ select private.read_workspace_access_v1(); $$;
revoke all on function private.read_workspace_access_v1(),public.read_workspace_access_v1() from public,anon,authenticated,service_role;
grant execute on function private.read_workspace_access_v1(),public.read_workspace_access_v1() to authenticated;

-- One-time, bounded maintenance manifest: invalidate every pre-boundary bearer URL.
-- This is neither a customer workflow nor a new queue. Storage bytes move through its API.
create table private.storage_path_rotations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 resource_id uuid not null, bucket_id text not null, old_path text not null, new_path text not null,
 responsible_user_id uuid not null references auth.users(id),
 state text not null default 'pending' check(state in ('pending','leased','completed')),
 worker_account_id uuid references auth.users(id), capability_sha256 bytea, lease_expires_at timestamptz,
 content_sha256 text check(content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
 byte_length bigint check(byte_length>=0), completed_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(bucket_id,old_path),unique(bucket_id,new_path),
 foreign key(organization_id,resource_id) references private.access_resources(organization_id,id) on delete cascade,
 check(old_path<>new_path),check(bucket_id in ('opportunity-documents','document-layers','case-artifacts','brand-templates'))
);
alter table private.storage_path_rotations enable row level security;
alter table private.storage_path_rotations force row level security;
revoke all on private.storage_path_rotations from public,anon,authenticated,service_role;
create policy storage_path_rotations_deny_clients on private.storage_path_rotations for all to authenticated using(false) with check(false);
create trigger storage_path_rotations_updated_at before update on private.storage_path_rotations for each row execute function private.set_updated_at();
create trigger storage_path_rotations_audit after insert or update or delete on private.storage_path_rotations for each row execute function private.capture_audit_event();
-- Unknown paths or missing responsible people stop the migration, never silently skip a file.
do $$ declare obj record; scope record; responsible uuid; begin
 for obj in select bucket_id,name from storage.objects where bucket_id in ('opportunity-documents','document-layers','case-artifacts','brand-templates') loop
  select r.* into scope from private.access_resources r where r.organization_id::text=split_part(obj.name,'/',1) and r.id::text=split_part(obj.name,'/',2);
  if scope.id is null then raise exception 'storage_rotation_scope_unresolved'; end if;
  select m.user_id into responsible from public.organization_memberships m
  where m.organization_id=scope.organization_id and m.status='active' and private.resource_access_as_subject_v1(scope.organization_id,scope.id,m.user_id,'manage')
  order by case when m.role='owner' then 0 when m.role='admin' then 1 else 2 end,m.user_id limit 1;
  if responsible is null then raise exception 'storage_rotation_authority_unresolved'; end if;
  insert into private.storage_path_rotations(organization_id,resource_id,bucket_id,old_path,new_path,responsible_user_id)
  values(scope.organization_id,scope.id,obj.bucket_id,obj.name,
   scope.organization_id::text||'/'||scope.id::text||'/revocable-'||gen_random_uuid()::text||'/'||regexp_replace(obj.name,'^.*/',''),responsible);
 end loop;
end $$;
create function private.claim_storage_rotation_v1(p_worker_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare worker_id uuid := private.worker_identity(p_worker_token); r private.storage_path_rotations; capability text := encode(extensions.gen_random_bytes(32),'hex');
begin
 if worker_id is null or auth.uid() is null then raise exception 'worker_identity_required' using errcode='42501'; end if;
 select * into r from private.storage_path_rotations where state='pending' or (state='leased' and lease_expires_at<now()) order by created_at,id for update skip locked limit 1;
 if not found then return jsonb_build_object('claimed',false,'remaining',(select count(*) from private.storage_path_rotations where state<>'completed')); end if;
 if not private.resource_access_as_subject_v1(r.organization_id,r.resource_id,r.responsible_user_id,'manage') then raise exception 'storage_rotation_authority_revoked' using errcode='42501'; end if;
 update private.storage_path_rotations set state='leased',worker_account_id=auth.uid(),capability_sha256=extensions.digest(capability,'sha256'),lease_expires_at=now()+interval '10 minutes' where id=r.id;
 return jsonb_build_object('claimed',true,'id',r.id,'bucket',r.bucket_id,'old_path',r.old_path,'new_path',r.new_path,'capability',capability,'sha256',r.content_sha256,'byte_length',r.byte_length);
end $$;
create function private.record_storage_rotation_v1(p_rotation_id uuid,p_capability text,p_sha256 text,p_byte_length bigint,p_complete boolean)
returns void language plpgsql security definer set search_path='' as $$
declare r private.storage_path_rotations;
begin
 select * into r from private.storage_path_rotations where id=p_rotation_id and state='leased' and worker_account_id=auth.uid()
 and capability_sha256=extensions.digest(p_capability,'sha256') and lease_expires_at>now() for update;
 if r.id is null or not private.resource_access_as_subject_v1(r.organization_id,r.resource_id,r.responsible_user_id,'manage') then raise exception 'storage_rotation_denied' using errcode='42501'; end if;
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_byte_length is null or p_byte_length<0 or (r.content_sha256 is not null and (r.content_sha256<>p_sha256 or r.byte_length<>p_byte_length)) then raise exception 'storage_rotation_integrity_failed' using errcode='22023'; end if;
 if p_complete then
  if r.content_sha256 is null or exists(select 1 from storage.objects where bucket_id=r.bucket_id and name=r.old_path)
   or not exists(select 1 from storage.objects where bucket_id=r.bucket_id and name=r.new_path and (metadata->>'size')::bigint=p_byte_length) then raise exception 'storage_rotation_move_unverified' using errcode='22023'; end if;
  update public.source_documents set object_path=r.new_path where organization_id=r.organization_id and bucket_id=r.bucket_id and object_path=r.old_path;
  update public.document_layers set object_path=r.new_path where organization_id=r.organization_id and object_path=r.old_path and r.bucket_id='document-layers';
  update public.processing_jobs set payload=private.canonical_job_storage_payload_v1(id) where organization_id=r.organization_id and intake_session_id=r.resource_id and kind='document_pipeline' and status in ('queued','leased','awaiting_approval');
  update private.storage_path_rotations set state='completed',completed_at=now(),capability_sha256=null,lease_expires_at=null where id=r.id;
 else
  update private.storage_path_rotations set content_sha256=p_sha256,byte_length=p_byte_length where id=r.id;
 end if;
end $$;
create function private.worker_can_rotate_storage_v1(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.storage_path_rotations r where r.bucket_id=p_bucket and p_path in (r.old_path,r.new_path)
 and r.worker_account_id=(select auth.uid()) and r.state='leased' and r.lease_expires_at>now()
 and private.resource_access_as_subject_v1(r.organization_id,r.resource_id,r.responsible_user_id,'manage'));
$$;
create policy storage_rotation_select on storage.objects for select to authenticated using((select private.worker_can_rotate_storage_v1(bucket_id,name)));
create policy storage_rotation_update on storage.objects for update to authenticated using((select private.worker_can_rotate_storage_v1(bucket_id,name))) with check((select private.worker_can_rotate_storage_v1(bucket_id,name)));
create policy storage_rotation_insert on storage.objects for insert to authenticated with check((select private.worker_can_rotate_storage_v1(bucket_id,name)));
create function public.claim_storage_rotation_v1(p_worker_token text) returns jsonb language sql security invoker set search_path='' as $$ select private.claim_storage_rotation_v1(p_worker_token); $$;
create function public.record_storage_rotation_v1(p_rotation_id uuid,p_capability text,p_sha256 text,p_byte_length bigint,p_complete boolean) returns void language sql security invoker set search_path='' as $$ select private.record_storage_rotation_v1(p_rotation_id,p_capability,p_sha256,p_byte_length,p_complete); $$;
revoke all on function private.claim_storage_rotation_v1(text),private.record_storage_rotation_v1(uuid,text,text,bigint,boolean),private.worker_can_rotate_storage_v1(text,text),public.claim_storage_rotation_v1(text),public.record_storage_rotation_v1(uuid,text,text,bigint,boolean) from public,anon,authenticated,service_role;
grant execute on function private.claim_storage_rotation_v1(text),private.record_storage_rotation_v1(uuid,text,text,bigint,boolean),private.worker_can_rotate_storage_v1(text,text),public.claim_storage_rotation_v1(text),public.record_storage_rotation_v1(uuid,text,text,bigint,boolean) to authenticated;

create function private.require_artifact_access_v1(p_artifact_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 select capital_project_id into target from public.capital_project_artifacts where id=p_artifact_id;
 perform private.require_resource_access_v1(target,p_action);
end $$;
revoke all on function private.require_artifact_access_v1(uuid,text) from public,anon,authenticated,service_role;
do $remaining_commands$
declare item record; body text; argument text; action text;
begin
 for item in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('claim_case_brief','confirm_document_intake','prepare_qualified_introduction_plan','read_processing_model_lineage','record_case_model_spend','restart_onboarding_intake','set_presentation_template_v1','decide_capital_project_artifact','request_capital_planning_revision_v1','request_company_debt_view_revision_v1','request_origination_thesis_revision_v1') loop
  body:=pg_get_functiondef(item.oid);
  action:=case when item.proname='read_processing_model_lineage' then 'read' else 'work' end;
  if body like '%p_artifact_id uuid%' then
   body:=regexp_replace(body,'\mbegin\M',format(E'begin\n perform private.require_artifact_access_v1(p_artifact_id,%L);',action),'i');
  elsif item.proname='set_presentation_template_v1' then
   body:=regexp_replace(body,'\mbegin\M',E'begin\n if p_project_id is not null then perform private.require_resource_access_v1(p_project_id,''manage''); elsif not private.can_manage_organization(p_organization_id) then raise exception ''resource_access_denied'' using errcode=''42501''; end if;','i');
  else
   body:=regexp_replace(body,'\mbegin\M',format(E'begin\n perform private.require_resource_access_v1(p_session_id,%L);',action),'i');
  end if;
  execute body;
 end loop;
 select pg_get_functiondef('private.record_execution_proposal_plan_as_actor(uuid,jsonb,uuid)'::regprocedure) into body;
 body:=replace(body,'and membership.user_id = caller_id',E'and private.resource_access_as_subject_v1(project.organization_id,project.id,caller_id,''work'')\n    and membership.user_id = caller_id');
 execute body;
 select pg_get_functiondef('private.capital_project_review_roles(uuid,uuid,uuid)'::regprocedure) into body;
 body:=replace(body,'where a.organization_id = p_organization_id',E'where private.resource_access_as_subject_v1(p_organization_id,p_project_id,p_user_id,''read'') and a.organization_id = p_organization_id');
 execute body;
end $remaining_commands$;

-- A newly assigned reviewer receives only reading; review capabilities still require
-- the explicit review assignment. Removing the last assignment withdraws its read grant.
create function private.sync_review_resource_access_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.capital_project_review_assignments;
begin
 if tg_op='DELETE' then r:=old; else r:=new; end if;
 perform private.advance_authorization_revision_v1(r.organization_id,r.capital_project_id,r.user_id);
 if exists(select 1 from public.capital_project_review_assignments a where a.organization_id=r.organization_id and a.capital_project_id=r.capital_project_id and a.user_id=r.user_id)
 and exists(select 1 from public.organization_memberships m where m.organization_id=r.organization_id and m.user_id=r.user_id and m.status='active') then
  insert into private.resource_access_grants(organization_id,resource_id,subject_user_id,action,granted_by,grant_basis)
  values(r.organization_id,r.capital_project_id,r.user_id,'read',r.assigned_by,'historical_assignment')
  on conflict(organization_id,resource_id,subject_user_id,subject_role,action) do update set revoked_at=null,revoked_by=null,granted_by=excluded.granted_by,valid_from=now()
  where private.resource_access_grants.grant_basis='historical_assignment';
 else
  update private.resource_access_grants set revoked_at=now(),revoked_by=auth.uid() where organization_id=r.organization_id and resource_id=r.capital_project_id and subject_user_id=r.user_id and grant_basis='historical_assignment' and revoked_at is null;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.sync_review_resource_access_v1() from public,anon,authenticated,service_role;
create trigger capital_project_review_assignments_access after insert or delete on public.capital_project_review_assignments for each row execute function private.sync_review_resource_access_v1();
-- Compatibility review mode no longer turns read-only content access into authority to write.
do $$ declare body text; begin
 select pg_get_functiondef('private.capital_project_review_action_allowed(uuid,uuid,text,uuid)'::regprocedure) into body;
 body:=replace(body,'if mode = ''open'' then return null; end if;',E'if mode = ''open'' then\n if private.can_access_resource_v1(p_organization_id,p_project_id,''work'') then return null; end if;\n return ''capital_project_review_role_required'';\n end if;');
 execute body;
end $$;

-- Approval delegates only its deterministic calculation, never general project editing.
create table private.review_execution_authorizations (
 id uuid primary key, organization_id uuid not null, resource_id uuid not null,
 subject_user_id uuid not null references auth.users(id), configuration_id uuid, execution_brief_id uuid,
 check(num_nonnulls(configuration_id,execution_brief_id)=1),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '24 hours',
 unique(organization_id,id),
 foreign key(organization_id,resource_id) references private.access_resources(organization_id,id) on delete cascade,
 foreign key(organization_id,configuration_id) references private.institutional_model_configurations(organization_id,id),
 foreign key(organization_id,execution_brief_id) references public.capital_project_execution_briefs(organization_id,id)
);
alter table private.review_execution_authorizations enable row level security;
alter table private.review_execution_authorizations force row level security;
revoke all on private.review_execution_authorizations from public,anon,authenticated,service_role;
create policy review_execution_authorizations_deny_clients on private.review_execution_authorizations for all to authenticated using(false) with check(false);
create trigger review_execution_authorizations_updated_at before update on private.review_execution_authorizations for each row execute function private.set_updated_at();
create trigger review_execution_authorizations_audit after insert or update or delete on private.review_execution_authorizations for each row execute function private.capture_audit_event();
alter table public.processing_jobs add column review_execution_authorization_id uuid,
 add foreign key(organization_id,review_execution_authorization_id) references private.review_execution_authorizations(organization_id,id);
create function private.review_execution_authority_current_v1(p_id uuid,p_resource_id uuid,p_subject uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.review_execution_authorizations a
 where a.id=p_id and a.resource_id=p_resource_id and a.subject_user_id=p_subject and a.expires_at>now()
 and private.resource_access_as_subject_v1(a.organization_id,a.resource_id,p_subject,'read')
 and (
  (a.configuration_id is not null and exists(select 1 from private.institutional_model_configurations c where c.organization_id=a.organization_id and c.id=a.configuration_id and c.capital_project_id=a.resource_id and c.status='approved')
   and ('approver'=any(private.capital_project_review_roles(a.organization_id,a.resource_id,p_subject)) or private.resource_access_as_subject_v1(a.organization_id,a.resource_id,p_subject,'work')))
  or (a.execution_brief_id is not null and exists(select 1 from public.capital_project_execution_briefs b where b.organization_id=a.organization_id and b.id=a.execution_brief_id and b.capital_project_id=a.resource_id)
   and (private.capital_project_review_roles(a.organization_id,a.resource_id,p_subject) && array['preparer','reviewer','approver'] or private.resource_access_as_subject_v1(a.organization_id,a.resource_id,p_subject,'work')))
  ));
$$;
revoke all on function private.review_execution_authority_current_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
do $bounded_review$
declare body text;
begin
 select pg_get_functiondef('private.submit_advisor_turn_v1(uuid,uuid,text,text)'::regprocedure) into body;
 body:=replace(body,'private.submit_advisor_turn_v1(', 'private.submit_review_execution_turn_v1(');
 body:=replace(body,'perform private.require_resource_access_v1(p_project_id,''work'');',E'if not private.review_execution_authority_current_v1(p_message_id,p_project_id,auth.uid()) then raise exception ''review_execution_authorization_denied'' using errcode=''42501''; end if;');
 execute body;
 execute 'revoke all on function private.submit_review_execution_turn_v1(uuid,uuid,text,text) from public,anon,authenticated,service_role';
 select pg_get_functiondef('private.review_institutional_configuration_and_calculate_v1(uuid,uuid,text,text,text,uuid,text)'::regprocedure) into body;
 body:=replace(body,'queued:=private.submit_advisor_turn_v1(',E'insert into private.review_execution_authorizations(id,organization_id,resource_id,subject_user_id,configuration_id) values(p_request_id,c.organization_id,p_project_id,auth.uid(),c.id);\n queued:=private.submit_review_execution_turn_v1(');
 execute body;
 select pg_get_functiondef('private.bind_job_authority_v1()'::regprocedure) into body;
 body:=replace(body,'if subject_id is null then',E'if new.kind=''agent_operation_brief'' and private.review_execution_authority_current_v1(nullif(new.payload->>''message_id'','''')::uuid,root_id,subject_id) then\n new.review_execution_authorization_id:=(new.payload->>''message_id'')::uuid;\n elsif subject_id is null then');
 body:=replace(body,'if not private.resource_access_as_subject_v1(new.organization_id,root_id,subject_id,''work'') then raise', 'if new.review_execution_authorization_id is null and not private.resource_access_as_subject_v1(new.organization_id,root_id,subject_id,''work'') then raise');
 execute body;
 select pg_get_functiondef('private.job_authority_is_current_v1(uuid)'::regprocedure) into body;
 body:=replace(body,'and private.resource_access_as_subject_v1(j.organization_id,j.authorization_resource_id,j.authorization_subject_id,''work'')',E'and (private.resource_access_as_subject_v1(j.organization_id,j.authorization_resource_id,j.authorization_subject_id,''work'') or (j.kind=''agent_operation_brief'' and j.review_execution_authorization_id::text=j.payload->>''message_id'' and private.review_execution_authority_current_v1(j.review_execution_authorization_id,j.authorization_resource_id,j.authorization_subject_id)))');
 execute body;
end $bounded_review$;

do $review_return$
declare body text;
begin
 select pg_get_functiondef('private.submit_advisor_execution_brief_edit_v1(uuid,uuid,text,uuid,text,text)'::regprocedure) into body;
 -- The existing review action assertion grants a return or preparation for this exact brief.
 body:=replace(body,'perform private.require_resource_access_v1(p_project_id,''work'');','perform private.require_resource_access_v1(p_project_id,''read'');');
 body:=replace(body,'turn_result := private.submit_advisor_turn_v1(',E'insert into private.review_execution_authorizations(id,organization_id,resource_id,subject_user_id,execution_brief_id) values(p_message_id,project_row.organization_id,p_project_id,auth.uid(),current_brief.id);\n turn_result := private.submit_review_execution_turn_v1(');
 execute body;
end $review_return$;

-- Atomic legacy object creation registers its new resources before returning IDs.
-- This bounded private command creates only caller-owned new objects; it does not
-- read or update pre-existing private content and repeats the former type/tenant gate.
CREATE OR REPLACE FUNCTION private.create_opportunity_intake(p_organization_id uuid, p_legal_name text, p_sector text, p_purpose text, p_requested_amount numeric, p_currency text, p_desired_term_months integer, p_output_locale text DEFAULT 'pt-BR'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  company_id uuid;
  request_id uuid;
  opportunity_id uuid;
  normalized_currency text := upper(p_currency);
  fingerprint bytea;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not (select private.is_org_type_member(p_organization_id,array['company','originator','offroad'])) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  if p_requested_amount <= 0 or p_desired_term_months not between 1 and 360 then
    raise exception 'invalid_economic_input' using errcode = '22023';
  end if;

  fingerprint := extensions.digest(
    concat_ws(
      '|',
      p_organization_id::text,
      lower(trim(p_legal_name)),
      lower(trim(p_purpose)),
      p_requested_amount::text,
      normalized_currency,
      p_desired_term_months::text
    ),
    'sha256'
  );

  insert into public.companies (
    organization_id, legal_name, display_name, jurisdiction_code, sector, reporting_currency, created_by
  ) values (
    p_organization_id, trim(p_legal_name), trim(p_legal_name), 'BR', nullif(trim(p_sector), ''), normalized_currency, actor_id
  )
  returning id into company_id;

  insert into public.capital_requests (
    organization_id, company_id, purpose, requested_amount, currency, desired_term_months, output_locale, status, created_by
  ) values (
    p_organization_id, company_id, trim(p_purpose), p_requested_amount, normalized_currency, p_desired_term_months, p_output_locale, 'submitted', actor_id
  )
  returning id into request_id;

  insert into public.opportunities (
    organization_id, company_id, capital_request_id, title, purpose, requested_amount, currency, fingerprint_hash, lead_user_id, created_by
  ) values (
    p_organization_id, company_id, request_id,
    private.bounded_opportunity_title(trim(p_legal_name), trim(p_purpose)),
    trim(p_purpose), p_requested_amount, normalized_currency, fingerprint, actor_id, actor_id
  )
  returning id into opportunity_id;

  return opportunity_id;
end;
$function$;

revoke all on function private.create_opportunity_intake(uuid,text,text,text,numeric,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function private.create_opportunity_intake(uuid,text,text,text,numeric,text,integer,text) to authenticated;
create or replace function public.create_opportunity_intake(p_organization_id uuid,p_legal_name text,p_sector text,p_purpose text,p_requested_amount numeric,p_currency text,p_desired_term_months integer,p_output_locale text default 'pt-BR')
returns uuid language sql security invoker set search_path='' as $$select private.create_opportunity_intake(p_organization_id,p_legal_name,p_sector,p_purpose,p_requested_amount,p_currency,p_desired_term_months,p_output_locale);$$;

-- Implicit private cross-project memory has no source/dependency contract. Retire this
-- legacy access path instead of letting one project's capability read another dossier.
-- Explicit cross-work sources will use the approved source/execution contracts; public
-- company research caches and the current project's memory remain available.
do $retire_implicit_memory$
declare body text; start_at integer; end_at integer;
begin
 select pg_get_functiondef('private.worker_load_agent_context_before_professional_context_v1(uuid,text)'::regprocedure) into body;
 start_at:=position('''related_project_memory'', coalesce((' in body);
 end_at:=position('''documents'', coalesce((' in body);
 if start_at=0 or end_at<=start_at then raise exception 'implicit_project_memory_contract_changed'; end if;
 body:=substring(body for start_at-1)||E'''related_project_memory'', ''[]''::jsonb,\n    '||substring(body from end_at);
 execute body;
end $retire_implicit_memory$;

-- Requests and disclosures expose their explicit participants, not every tenant member.
drop policy access_requests_select on public.access_requests;
create policy access_requests_select on public.access_requests for select to authenticated using(
 (requested_by=(select auth.uid()) and (select private.is_org_member(organization_id)))
 or exists(select 1 from public.published_opportunity_projections p where p.id=access_requests.projection_id and p.organization_id=access_requests.source_organization_id
 and private.can_access_resource_v1(p.organization_id,p.opportunity_id,'manage')));
drop policy access_requests_update on public.access_requests;
create policy access_requests_update on public.access_requests for update to authenticated using(
 exists(select 1 from public.published_opportunity_projections p where p.id=access_requests.projection_id and p.organization_id=access_requests.source_organization_id
 and private.can_access_resource_v1(p.organization_id,p.opportunity_id,'manage')))
 with check(exists(select 1 from public.published_opportunity_projections p where p.id=access_requests.projection_id and p.organization_id=access_requests.source_organization_id
 and private.can_access_resource_v1(p.organization_id,p.opportunity_id,'manage')));
drop policy disclosure_grants_select on public.disclosure_grants;
create policy disclosure_grants_select on public.disclosure_grants for select to authenticated using(
 (select private.can_access_resource_v1(organization_id,opportunity_id,'manage')) or (select private.can_manage_organization(recipient_organization_id)));

-- Additive capability negotiation keeps old workers idle through their retired claim RPC,
-- while a new worker refuses to start before the authorization/storage migration exists.
do $$ declare body text; begin
 select pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure) into body;
 body:=replace(body,'public.worker_runtime_schema_contract_v1()', 'private.worker_runtime_schema_contract_before_resource_access_v1()');
 execute body;
end $$;
revoke all on function private.worker_runtime_schema_contract_before_resource_access_v1() from public,anon,authenticated,service_role;
grant execute on function private.worker_runtime_schema_contract_before_resource_access_v1() to authenticated;
create or replace function public.worker_runtime_schema_contract_v1()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_set(c,'{capabilities}',(c->'capabilities')||'["explicit-resource-access.v1","explicit-workspace-context.v1","authenticated-document-storage.v1","review-bound-execution.v1","legacy-storage-rotation.v1"]'::jsonb)
 from (select private.worker_runtime_schema_contract_before_resource_access_v1() c) previous;
$$;
