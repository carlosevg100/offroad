-- Internal Offroad organizations use the existing institutional analytical journey.
-- Keep the journey constraint, resource authorization, terms, grants and private-work gates.
-- Replacing this one function preserves its existing ACL and all other body statements.
do $guard$
begin
 if (select md5(prosrc) from pg_proc where oid='private.prepare_work_document_intake_v1(uuid,text,jsonb)'::regprocedure)
   not in ('77ca3ab626767121b073bd57d504d675','0b19c197ea72219520c209e8995ef822') then
  raise exception 'internal_intake_unexpected_function_body';
 end if;
end $guard$;

create or replace function private.prepare_work_document_intake_v1(p_work_id uuid,p_locale text,p_plan jsonb default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.capital_projects; session_id uuid; journey text;
begin
 perform private.require_resource_access_v1(p_work_id,'work');
 if p_locale is null or p_locale not in ('pt-BR','en-US') then raise exception 'invalid_locale' using errcode='22023'; end if;
 select * into strict p from public.capital_projects where id=p_work_id and status<>'archived' for update;
 select id into session_id from public.document_intake_sessions where organization_id=p.organization_id and capital_project_id=p.id order by created_at,id limit 1;
 if found then perform private.require_resource_access_v1(session_id,'work'); return session_id; end if;
 perform private.authorize_capital_project_private_work(p.id,true);
 if p_plan is not null and not exists(select 1 from public.capital_project_plans where organization_id=p.organization_id and capital_project_id=p.id and status='active') then
  if p_plan#>>'{job,id}' is distinct from p.entry_job then raise exception 'work_document_plan_mismatch' using errcode='22023'; end if;
  perform private.record_capital_project_plan(p.id,p_plan);
 end if;
 select case organization_type when 'offroad' then 'institutional' else organization_type end into journey from public.organizations where id=p.organization_id;
 insert into public.document_intake_sessions(organization_id,capital_project_id,started_by,journey,locale,project_name,identity_policy,privacy_status,representation_status,company_profile)
 values(p.organization_id,p.id,auth.uid(),journey,p_locale,p.project_name,'identified_restricted','private','not_claimed','{}') returning id into session_id;
 -- In-flight context must not survive the boundary change. History is conserved in the same conversation.
 update public.processing_jobs set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null
 where organization_id=p.organization_id and work_id=p.id and kind='work_conversation' and status in ('queued','leased');
 update public.processing_runs set status='cancelled',completed_at=now() where organization_id=p.organization_id and work_id=p.id and intake_session_id is null and status in ('queued','running');
 update public.agent_conversations set intake_session_id=session_id,state='idle' where organization_id=p.organization_id and work_id=p.id and intake_session_id is null;
 update public.agent_messages set intake_session_id=session_id where organization_id=p.organization_id and work_id=p.id and intake_session_id is null;
 return session_id;
end $$;
