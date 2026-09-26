CREATE OR REPLACE FUNCTION public.worker_runtime_schema_contract_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_set(c,'{capabilities}',(c->'capabilities')||'["explicit-resource-access.v1","explicit-workspace-context.v1","authenticated-document-storage.v1","review-bound-execution.v1","legacy-storage-rotation.v1","domain-event-outbox.v1","pinned-execution-consumer.v1","governed-evaluation-consumer.v1","provider-resource-retention.v2","dependency-recompute.v1","dependency-recompute-health.v1"]'::jsonb)
 from (select private.worker_runtime_schema_contract_before_resource_access_v1() c) previous;
$function$
