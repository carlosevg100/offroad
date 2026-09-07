-- The semantic routing measurement surface must remain aggregate, content-free and private.

begin;

do $$
declare
  exposed_column text;
  view_is_security_invoker boolean;
begin
  if has_table_privilege('authenticated', 'private.intent_objective_routing_metrics_by_day', 'select')
    or has_table_privilege('anon', 'private.intent_objective_routing_metrics_by_day', 'select') then
    raise exception 'semantic routing metrics leaked to tenant roles';
  end if;

  select column_name into exposed_column
  from information_schema.columns
  where table_schema = 'private'
    and table_name = 'intent_objective_routing_metrics_by_day'
    and column_name in (
      'organization_id',
      'capital_project_id',
      'message_id',
      'processing_job_id',
      'envelope',
      'classifier',
      'message',
      'content',
      'document_id'
    )
  limit 1;

  if exposed_column is not null then
    raise exception 'semantic routing metrics expose prohibited column: %', exposed_column;
  end if;

  select coalesce((c.reloptions @> array['security_invoker=true']), false)
    into view_is_security_invoker
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'private'
    and c.relname = 'intent_objective_routing_metrics_by_day';

  if not view_is_security_invoker then
    raise exception 'semantic routing metrics view is not security_invoker';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'intent_objective_routing_metrics_by_day'
      and column_name = 'objective_kind_agreement'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'intent_objective_routing_metrics_by_day'
      and column_name = 'observation_state'
  ) then
    raise exception 'semantic routing gate fields are incomplete';
  end if;
end;
$$;

select 'intent_objective_routing_metrics_passed' as result;

rollback;
