-- Synthetic, rollback-only. No provider calls or production data.
begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
set local role authenticated;
-- Owner A creates a private candidate and shares an exact revision.
select public.submit_work_contribution_v1('a11b0000-0000-4000-9000-000000000002','a4110000-0000-4000-9000-000000000001','a4110000-0000-4000-9000-000000000002',null,null,'Synthetic initial basis');
select public.add_work_participant_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002');
select public.promote_contribution_to_work_v1('a4110000-0000-4000-9000-000000000002','a4110000-0000-4000-9000-000000000003');
-- A and B fork the same shared base; neither can overwrite the other's branch.
select public.submit_work_contribution_v1('a11b0000-0000-4000-9000-000000000002','a4110000-0000-4000-9000-000000000010','a4110000-0000-4000-9000-000000000011',null,'a4110000-0000-4000-9000-000000000003','Synthetic option A');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.contribution_revisions where id='a4110000-0000-4000-9000-000000000011') then raise exception 'B read A personal branch'; end if;
 if not exists(select 1 from public.contribution_revisions where id='a4110000-0000-4000-9000-000000000003') then raise exception 'B cannot read shared revision'; end if;
 begin perform public.submit_work_contribution_v1('a11b0000-0000-4000-9000-000000000002','a4110000-0000-4000-9000-000000000010',gen_random_uuid(),null,null,'overwrite A');raise exception 'B overwrote A';exception when insufficient_privilege then null;end;
 begin perform public.promote_contribution_to_work_v1('a4110000-0000-4000-9000-000000000011',gen_random_uuid());raise exception 'B published A private candidate';exception when insufficient_privilege then null;end;
 begin update public.contribution_revisions set content='forged' where id='a4110000-0000-4000-9000-000000000003';raise exception 'direct update allowed';exception when insufficient_privilege then null;end;
end $$;
select public.submit_work_contribution_v1('a11b0000-0000-4000-9000-000000000002','a4110000-0000-4000-9000-000000000020','a4110000-0000-4000-9000-000000000021',null,'a4110000-0000-4000-9000-000000000003','Synthetic option B');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
do $$ begin
 if exists(select 1 from public.contribution_revisions where id='a4110000-0000-4000-9000-000000000021') then raise exception 'administrator read B personal branch'; end if;
end $$;
select public.promote_contribution_to_work_v1('a4110000-0000-4000-9000-000000000011','a4110000-0000-4000-9000-000000000012','a4110000-0000-4000-9000-000000000003');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ declare result jsonb; begin
 result:=public.promote_contribution_to_work_v1('a4110000-0000-4000-9000-000000000021','a4110000-0000-4000-9000-000000000022','a4110000-0000-4000-9000-000000000003');
 if result->>'status'<>'conflict' or result#>>'{base,content}'<>'Synthetic initial basis' or result#>>'{current,content}'<>'Synthetic option A' or result#>>'{candidate,content}'<>'Synthetic option B' then raise exception 'three-way comparison missing';end if;
 if not exists(select 1 from public.contribution_revisions where id='a4110000-0000-4000-9000-000000000021') then raise exception 'losing candidate was lost';end if;
 if exists(select 1 from public.contribution_revisions where id='a4110000-0000-4000-9000-000000000022') then raise exception 'stale branch replaced shared head';end if;
 begin perform public.submit_work_contribution_v1('a11b0000-0000-4000-9000-000000000002','a4110000-0000-4000-9000-000000000020',gen_random_uuid(),null,null,'stale');raise exception 'stale personal write accepted';exception when serialization_failure then null;end;
end $$;
-- Late entrant C is an administrator without content access, then receives only explicit work access.
reset role;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
 values('a4110000-0000-4000-8000-000000000003','authenticated','authenticated','stage11-c@example.invalid','{}','{}',now(),now(),false,false);
insert into public.organization_memberships(organization_id,user_id,role,status) values('a11b0000-0000-4000-9000-000000000001','a4110000-0000-4000-8000-000000000003','admin','active');
set local role authenticated;
select set_config('request.jwt.claim.sub','a4110000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.contribution_revisions) then raise exception 'administrative membership read content';end if;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select public.add_work_participant_v1('a11b0000-0000-4000-9000-000000000002','a4110000-0000-4000-8000-000000000003','read');
select set_config('request.jwt.claim.sub','a4110000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.work_channels where kind='personal') then raise exception 'late entrant saw personal channels';end if;
 if exists(select 1 from public.contribution_revisions where id in ('a4110000-0000-4000-9000-000000000011','a4110000-0000-4000-9000-000000000021')) then raise exception 'late entrant saw personal history';end if;
 if not exists(select 1 from public.contribution_revisions where id='a4110000-0000-4000-9000-000000000012') then raise exception 'late entrant lost permitted shared content';end if;
 begin perform public.submit_work_contribution_v1('a11b0000-0000-4000-9000-000000000002',gen_random_uuid(),gen_random_uuid(),null,null,'viewer write');raise exception 'viewer contributed';exception when insufficient_privilege then null;end;
end $$;
-- A source in another work cannot be disclosed just because A reads both works.
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
do $$ declare result jsonb; begin
 result:=public.start_work_v1('a4110000-0000-4000-9000-000000000030','pt-BR','Synthetic separate audience','Synthetic source audience','company_debt_view','public_information',null,null,false);
 perform set_config('test.separate_work',result->>'workId',true);
end $$;
select public.add_work_participant_v1(current_setting('test.separate_work')::uuid,'a11b0000-0000-4000-8000-000000000002','work');
select public.revoke_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002');
select public.submit_work_contribution_v1(current_setting('test.separate_work')::uuid,'a4110000-0000-4000-9000-000000000031','a4110000-0000-4000-9000-000000000032',null,null,'Synthetic source-derived note',array['a11b0000-0000-4000-9000-000000000004']::uuid[]);
do $$ begin
 begin perform public.promote_contribution_to_work_v1('a4110000-0000-4000-9000-000000000032','a4110000-0000-4000-9000-000000000033');raise exception 'restricted source promoted to unauthorized audience';exception when insufficient_privilege then null;end;
end $$;
select public.add_work_participant_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002','read');
select public.promote_contribution_to_work_v1('a4110000-0000-4000-9000-000000000032','a4110000-0000-4000-9000-000000000033');
select public.revoke_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.contribution_revisions where id='a4110000-0000-4000-9000-000000000033') then raise exception 'shared derivative survived source revocation';end if;
 if exists(select 1 from public.work_channels where work_id='a11b0000-0000-4000-9000-000000000002') then raise exception 'personal channel survived participant revocation';end if;
 begin perform public.submit_work_contribution_v1('a11b0000-0000-4000-9000-000000000002',gen_random_uuid(),gen_random_uuid(),null,null,'revoked actor');raise exception 'revoked participant wrote';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select public.revoke_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000001');
do $$ begin
 if exists(select 1 from public.contribution_revisions where id='a4110000-0000-4000-9000-000000000011') then raise exception 'creator retained personal revision';end if;
 begin perform public.promote_contribution_to_work_v1('a4110000-0000-4000-9000-000000000011',gen_random_uuid());raise exception 'revoked creator promoted';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.contribution_revisions where id in ('a4110000-0000-4000-9000-000000000011','a4110000-0000-4000-9000-000000000021'))<>2 then raise exception 'competing branches not preserved';end if;
 if not exists(select 1 from public.agent_messages where id='a11b0000-0000-4000-9000-000000000007' and human_author_id=created_by and channel_id is not null) then raise exception 'human message provenance missing';end if;
 begin update public.contribution_revisions set content='erase history' where id='a4110000-0000-4000-9000-000000000011';raise exception 'history mutation allowed';exception when check_violation then null;end;
 if has_function_privilege('service_role','public.promote_contribution_to_work_v1(uuid,uuid,uuid)','execute') then raise exception 'service role may publish contributions';end if;
end $$;
select 'work_contribution_isolation: PASS' result;
rollback;
