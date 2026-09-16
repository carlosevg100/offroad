-- Synthetic request IDs never reveal a project merely because the caller is a member.
begin;
insert into auth.users(id,email) values
 ('a2210000-0000-4000-8000-000000000001','replay-owner@example.invalid'),
 ('a2210000-0000-4000-8000-000000000002','replay-member@example.invalid');
insert into public.organizations(id,organization_type,workspace_kind,name,created_by) values
 ('a2210000-0000-4000-9000-000000000001','institutional','institutional','Synthetic replay organization','a2210000-0000-4000-8000-000000000001'),
 ('a2210000-0000-4000-9000-000000000002','institutional','institutional','Synthetic other organization','a2210000-0000-4000-8000-000000000001');
insert into public.organization_memberships(organization_id,user_id,role,status) values
 ('a2210000-0000-4000-9000-000000000001','a2210000-0000-4000-8000-000000000001','owner','active'),
 ('a2210000-0000-4000-9000-000000000002','a2210000-0000-4000-8000-000000000001','owner','active'),
 ('a2210000-0000-4000-9000-000000000001','a2210000-0000-4000-8000-000000000002','member','active');
insert into private.workspace_capability_grants(organization_id,capability,enabled,basis)
select id,'origination_representation',true,'explicit_administration' from public.organizations where id::text like 'a221%';
insert into public.capital_projects(id,organization_id,project_name,created_by)
values('a2210000-0000-4000-9000-000000000003','a2210000-0000-4000-9000-000000000001','Synthetic restricted replay','a2210000-0000-4000-8000-000000000001');
insert into public.capital_project_briefs(organization_id,capital_project_id,request_id,brief_kind,brief_version,content,content_fingerprint,created_by)
values
 ('a2210000-0000-4000-9000-000000000001','a2210000-0000-4000-9000-000000000003','a2210000-0000-4000-9000-000000000010','company_debt_view',1,'{}',repeat('a',64),'a2210000-0000-4000-8000-000000000001'),
 ('a2210000-0000-4000-9000-000000000001','a2210000-0000-4000-9000-000000000003','a2210000-0000-4000-9000-000000000011','origination_thesis',1,'{}',repeat('b',64),'a2210000-0000-4000-8000-000000000001');
create function pg_temp.replay_denied() returns void language plpgsql as $$
declare command text; request_id uuid; result jsonb;
begin
 for command,request_id in select * from (values
  ('start_public_company_debt_view_v1','a2210000-0000-4000-9000-000000000010'::uuid),
  ('start_public_origination_thesis_v1','a2210000-0000-4000-9000-000000000011'::uuid)) v(cmd,id) loop
  begin
   execute format('select public.%I($1, $2, $3, $4, $5, $6, $7)',command)
    into result using request_id,'pt-BR','Synthetic replay','Synthetic company',null::text,'{}'::jsonb,'{}'::jsonb;
  exception when insufficient_privilege then continue;
  end;
  raise exception 'Replay disclosed restricted metadata through %: %',command,result;
 end loop;
end $$;
select set_config('request.jwt.claim.sub','a2210000-0000-4000-8000-000000000002',true);
select set_config('request.headers','{"x-offroad-workspace":"a2210000-0000-4000-9000-000000000001"}',true);
set local role authenticated;
select pg_temp.replay_denied();
-- Even an owner of both organizations must use the resource's selected workspace.
select set_config('request.jwt.claim.sub','a2210000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{"x-offroad-workspace":"a2210000-0000-4000-9000-000000000002"}',true);
select pg_temp.replay_denied();
-- Legitimate idempotent replay keeps working for the owner in the right context.
select set_config('request.headers','{"x-offroad-workspace":"a2210000-0000-4000-9000-000000000001"}',true);
do $$ begin
 if public.start_public_company_debt_view_v1('a2210000-0000-4000-9000-000000000010','pt-BR','Synthetic replay','Synthetic company',null,'{}','{}')->>'replayed'<>'true'
  or public.start_public_origination_thesis_v1('a2210000-0000-4000-9000-000000000011','pt-BR','Synthetic replay','Synthetic company',null,'{}','{}')->>'replayed'<>'true' then
  raise exception 'Authorized replay stopped working';
 end if;
end $$;
reset role;
select 'workspace_replay_authority: PASS' result;
rollback;
