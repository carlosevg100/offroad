begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('a11b0000-0000-4000-8000-000000000003','authenticated','authenticated','a11b-c@example.invalid',now(),'{}','{}',now(),now(),false,false);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{}',true);
select set_config('test.invite',public.invite_workspace_member_v1('A11B-C@example.invalid','analyst')::text,true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.invite_workspace_member_v1('a11b-c@example.invalid','admin'); raise exception 'member invited administrator'; exception when insufficient_privilege then null; end;
 begin perform public.accept_workspace_invite_v1(current_setting('test.invite')::uuid); raise exception 'wrong recipient accepted'; exception when insufficient_privilege then null; end;
 begin perform public.read_workspace_access_v1(); raise exception 'member read administration'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000003',true);
do $$ begin
 if jsonb_array_length(public.list_my_workspace_invites_v1())<>1 then raise exception 'verified invitation missing'; end if;
 perform public.accept_workspace_invite_v1(current_setting('test.invite')::uuid);
 if private.can_access_intake_session('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003') then raise exception 'invitation granted private project access'; end if;
 perform public.accept_workspace_invite_v1(current_setting('test.invite')::uuid);
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select public.grant_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000003','read');
select public.set_workspace_member_v1('a11b0000-0000-4000-8000-000000000003','analyst','suspended');
select public.set_workspace_member_v1('a11b0000-0000-4000-8000-000000000003','analyst','active');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000003',true);
do $$ begin
 if private.can_access_intake_session('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003') then raise exception 'restoring membership resurrected revoked grant'; end if;
end $$;
rollback;
