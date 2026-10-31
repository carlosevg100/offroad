-- Local E2E only. The physical E0 helper must run first. The existing classifier
-- recognizes the committed corpus by exact name/hash and requires verified ready files.
-- No classification, understanding, approval or financial result is inserted here.
begin;
select set_config('test.source_session', :'session_id', true) as unused \gset
select set_config('test.source_actor', :'owner_email', true) as unused \gset
do $$
declare s public.document_intake_sessions; actor uuid;
begin
 select id into actor from auth.users where email=current_setting('test.source_actor') and email like 'e2e-%@example.com';
 select * into strict s from public.document_intake_sessions where id=current_setting('test.source_session')::uuid and started_by=actor;
 if actor is null or exists(select 1 from public.organizations where id=s.organization_id and pipeline_enabled) then raise exception 'local_synthetic_fallback_required'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.headers',jsonb_build_object('x-offroad-workspace',s.organization_id)::text,true);
end $$;
set local role authenticated;
select public.record_fallback_document_profiles(
 (select organization_id from public.document_intake_sessions where id=current_setting('test.source_session')::uuid),
 current_setting('test.source_session')::uuid);
commit;
