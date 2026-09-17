begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.grant_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002','read');
do $$ begin if not exists(select 1 from jsonb_array_elements(public.read_workspace_access_v1()->'grants') g where g->>'user_id'='a11b0000-0000-4000-8000-000000000002' and g->>'resource_id'='a11b0000-0000-4000-9000-000000000002') then raise exception 'active grant missing from administration'; end if; end $$;
select public.revoke_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002');
do $$ begin if exists(select 1 from jsonb_array_elements(public.read_workspace_access_v1()->'grants') g where g->>'user_id'='a11b0000-0000-4000-8000-000000000002' and g->>'resource_id'='a11b0000-0000-4000-9000-000000000002') then raise exception 'deny tombstone presented as active grant'; end if; end $$;
reset role;
do $$ begin
 if not exists(select 1 from private.resource_access_grants where subject_user_id='a11b0000-0000-4000-8000-000000000002' and resource_id='a11b0000-0000-4000-9000-000000000002' and effect='deny' and revoked_at is null) then raise exception 'revocation tombstone removed'; end if;
 if private.resource_access_as_subject_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002','read') then raise exception 'revoked subject can read'; end if;
end $$;
select 'workspace_access_projection: PASS' result;
rollback;
