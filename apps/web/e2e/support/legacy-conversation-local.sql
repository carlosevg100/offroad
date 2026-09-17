-- Local-only historical fixture, never applied as a migration or against production.
begin;
select set_config('test.email',:'email',true);
select set_config('test.prompt',:'prompt',true);
select set_config('test.plan',:'plan',true);
select set_config('test.research',:'research',true);
do $$ declare actor uuid; org uuid; journey text; work jsonb; session_id uuid; request_id uuid:=gen_random_uuid(); plan jsonb:=current_setting('test.plan')::jsonb; begin
 select id into strict actor from auth.users where email=current_setting('test.email');
 select o.id,o.organization_type into strict org,journey from public.organizations o
 join public.organization_memberships m on m.organization_id=o.id
 where m.user_id=actor and m.status='active' and o.organization_type='company';
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.headers',jsonb_build_object('x-offroad-workspace',org)::text,true);
 work:=public.start_work_v1(request_id,'pt-BR','Synthetic historical work',current_setting('test.prompt'),plan#>>'{job,id}','public_information',plan,null,false);
 -- Reconstruct the pre-stage-10 session relationship explicitly. This is not a product entry.
 insert into public.document_intake_sessions(organization_id,capital_project_id,started_by,journey,locale,project_name,identity_policy,privacy_status,representation_status,company_profile)
 values(org,(work->>'workId')::uuid,actor,journey,'pt-BR','Synthetic historical work','identified_restricted','public_information','not_claimed','{}') returning id into session_id;
 update public.agent_conversations set intake_session_id=session_id where work_id=(work->>'workId')::uuid;
 update public.agent_messages set intake_session_id=session_id where work_id=(work->>'workId')::uuid;
 if current_setting('test.research')='true' then
  perform public.start_provider_research_project_v1(request_id,'pt-BR','Synthetic historical work',current_setting('test.prompt'),plan);
 else
  perform public.queue_advisor_initial_turn_v1((work->>'workId')::uuid);
 end if;
 perform set_config('test.work',(work->>'workId'),true);
end $$;
select current_setting('test.work');
commit;
