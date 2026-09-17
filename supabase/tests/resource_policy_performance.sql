-- Deterministic fixture; timing is observed, not a promise about production workloads.
begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
insert into private.access_groups(organization_id,name) select 'a11b0000-0000-4000-9000-000000000001','Synthetic stress group '||n from generate_series(1,200) n;
insert into private.access_group_memberships(organization_id,group_id,principal_id)
select g.organization_id,g.id,p.id from private.access_groups g join private.principals p on p.organization_id=g.organization_id and p.user_id='a11b0000-0000-4000-8000-000000000002' where g.organization_id='a11b0000-0000-4000-9000-000000000001';
insert into private.resource_access_grants(organization_id,resource_id,subject_group_id,action,grant_basis)
select organization_id,'a11b0000-0000-4000-9000-000000000002',id,'read','explicit' from private.access_groups where organization_id='a11b0000-0000-4000-9000-000000000001';
create temp table policy_timings(ms double precision);
do $$ declare started timestamptz; allowed boolean; begin
 for n in 1..200 loop
  started:=clock_timestamp();
  allowed:=private.evaluate_resource_policy_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002','read','retrieval');
  if not allowed then raise exception 'stress fixture lost legitimate access'; end if;
  insert into policy_timings values(extract(epoch from clock_timestamp()-started)*1000);
 end loop;
end $$;
create temp table policy_plans(plan jsonb);
do $$ declare plan jsonb; begin
 execute $plan$explain(analyze,buffers,format json) select g.id from private.resource_access_grants g where g.organization_id='a11b0000-0000-4000-9000-000000000001' and g.resource_id='a11b0000-0000-4000-9000-000000000002' and g.revoked_at is null and g.subject_group_id in(select id from private.access_groups where organization_id='a11b0000-0000-4000-9000-000000000001')$plan$ into plan;
 insert into policy_plans values(plan);
end $$;
do $$ begin
 if (select percentile_cont(0.95) within group(order by ms) from policy_timings)>100 then raise exception 'resource_policy_p95_exceeds_100ms'; end if;
end $$;
select 'resource_policy_performance: PASS' result,count(*) samples,percentile_cont(0.5) within group(order by ms) p50_ms,percentile_cont(0.95) within group(order by ms) p95_ms,max(ms) max_ms,(select plan from policy_plans) query_plan from policy_timings;
rollback;
