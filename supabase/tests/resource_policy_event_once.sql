-- One policy change creates one audit/outbox event; retrying the same value creates none.
begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
do $$ declare before_count bigint; after_count bigint; begin
 select count(*) into before_count from private.domain_events where organization_id='a11b0000-0000-4000-9000-000000000001' and aggregate_kind='access_policy' and aggregate_id='a11b0000-0000-4000-9000-000000000003';
 perform public.set_resource_purposes_v1('a11b0000-0000-4000-9000-000000000003',array['retrieval']);
 select count(*) into after_count from private.domain_events where organization_id='a11b0000-0000-4000-9000-000000000001' and aggregate_kind='access_policy' and aggregate_id='a11b0000-0000-4000-9000-000000000003';
 if after_count-before_count<>1 then raise exception 'policy_event_count: expected 1, got %',after_count-before_count; end if;
 perform public.set_resource_purposes_v1('a11b0000-0000-4000-9000-000000000003',array['retrieval']);
 if (select count(*) from private.domain_events where organization_id='a11b0000-0000-4000-9000-000000000001' and aggregate_kind='access_policy' and aggregate_id='a11b0000-0000-4000-9000-000000000003')<>after_count then raise exception 'unchanged_policy_created_event'; end if;
end $$;
select 'resource_policy_event_once: PASS' result;
rollback;
