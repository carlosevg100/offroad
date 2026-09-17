begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
set local role authenticated;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.capital_projects where id='a11b0000-0000-4000-9000-000000000002')
 or exists(select 1 from public.document_intake_sessions where id='a11b0000-0000-4000-9000-000000000003')
 or exists(select 1 from public.source_documents where id='a11b0000-0000-4000-9000-000000000004')
 or exists(select 1 from public.agent_messages where id='a11b0000-0000-4000-9000-000000000007')
 or exists(select 1 from public.case_retrieval_chunks where intake_session_id='a11b0000-0000-4000-9000-000000000003')
 then raise exception 'unassigned member read restricted content'; end if;
 if private.can_access_opportunity('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000099','evidence.read') then raise exception 'membership authorizes nonexistent scope'; end if;
 begin
  perform public.grant_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002','manage');
  raise exception 'unassigned member granted own access';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select public.grant_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002','read');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ begin
 if not exists(select 1 from public.document_intake_sessions where id='a11b0000-0000-4000-9000-000000000003')
 or not exists(select 1 from public.source_documents where id='a11b0000-0000-4000-9000-000000000004') then raise exception 'explicit reader lost descendant access'; end if;
 begin
  update public.document_intake_sessions set project_name='Forbidden rename' where id='a11b0000-0000-4000-9000-000000000003';
  if found then raise exception 'reader mutated session'; end if;
 exception when insufficient_privilege then null; end;
 begin
  perform public.grant_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002','manage');
  raise exception 'reader promoted own access';
 exception when insufficient_privilege then null; end;
 begin
  perform public.manage_workspace_project('a11b0000-0000-4000-9000-000000000003','rename','Forbidden rename');
  raise exception 'reader entered privileged mutation';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
-- Revocation via the session alias closes the root and every other alias.
select public.revoke_resource_access_v1('a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ begin
 if private.can_access_capital_project('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002')
 or exists(select 1 from public.case_retrieval_chunks where intake_session_id='a11b0000-0000-4000-9000-000000000003') then raise exception 'revoked reader retained access'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.audit_events where organization_id='a11b0000-0000-4000-9000-000000000001' and resource_type='resource_access_grants' and actor_user_id='a11b0000-0000-4000-8000-000000000001') then raise exception 'access command not audited'; end if;
end $$;
select 'legacy_resource_access: PASS' as result;
rollback;
