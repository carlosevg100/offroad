-- Synthetic historical relationships for executor regression tests only.
-- Never installed by migrations and always enclosed in the calling test's rollback.
-- New entry behavior is tested separately without this fixture.
create function pg_temp.legacy_intake_for_work(p_work_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.capital_projects; session_id uuid; journey text; profile jsonb;
begin
 perform private.require_resource_access_v1(p_work_id,'work');
 select * into strict p from public.capital_projects where id=p_work_id;
 select id into session_id from public.document_intake_sessions where capital_project_id=p.id;
 if session_id is not null then return session_id; end if;
 select organization_type into strict journey from public.organizations where id=p.organization_id;
 select d.profile into profile from public.dossiers d where d.resource_id=p.id limit 1;
 insert into public.document_intake_sessions(organization_id,capital_project_id,started_by,journey,locale,project_name,identity_policy,privacy_status,representation_status,company_profile)
 values(p.organization_id,p.id,auth.uid(),journey,'pt-BR',p.project_name,'identified_restricted',case p.access_basis when 'authorized_private' then 'private' else 'public_information' end,'not_claimed',coalesce(profile,'{}')) returning id into session_id;
 update public.processing_jobs set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null where work_id=p.id and kind='work_conversation' and status in ('queued','leased');
 update public.processing_runs set status='cancelled' where work_id=p.id and intake_session_id is null and status in ('queued','running');
 update public.agent_conversations set intake_session_id=session_id,state='idle' where work_id=p.id;
 update public.agent_messages set intake_session_id=session_id,status=case when role='user' then 'completed' else status end,error_code=null where work_id=p.id;
 return session_id;
end $$;
revoke all on function pg_temp.legacy_intake_for_work(uuid) from public;
grant execute on function pg_temp.legacy_intake_for_work(uuid) to authenticated;
create function pg_temp.legacy_advisor_result(p_result jsonb) returns jsonb
language sql security invoker set search_path='' as $$
 select p_result||jsonb_build_object('intake_session_id',pg_temp.legacy_intake_for_work((p_result->>'capital_project_id')::uuid));
$$;
revoke all on function pg_temp.legacy_advisor_result(jsonb) from public;
grant execute on function pg_temp.legacy_advisor_result(jsonb) to authenticated;
