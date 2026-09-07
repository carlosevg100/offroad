-- Shadow semantic-routing observability. The model-classified objective and the compatibility
-- objective are already stored inside intent_envelopes.classifier. This view turns that signal
-- into aggregate, content-free evidence for deciding whether the semantic route is safe to
-- promote. It never exposes messages, envelopes, organization/project identifiers or documents.

create or replace view private.intent_objective_routing_metrics_by_day
with (security_invoker = true) as
  select
    envelope.created_at::date as day,
    envelope.model,
    case
      when envelope.classifier #>> '{objectiveRouting,schemaVersion}' = 'objective-routing-observation.v1'
        then 'recorded'
      else 'not_recorded'
    end as observation_state,
    coalesce(envelope.classifier #>> '{objectiveRouting,semantic,status}', 'unavailable') as semantic_status,
    coalesce(envelope.classifier #>> '{objectiveRouting,semantic,objectiveKind}', 'unavailable') as semantic_objective_kind,
    coalesce(envelope.classifier #>> '{objectiveRouting,compatibility,objectiveKind}', 'unavailable') as compatibility_objective_kind,
    case envelope.classifier #>> '{objectiveRouting,objectiveKindAgreement}'
      when 'true' then true
      when 'false' then false
      else null
    end as objective_kind_agreement,
    coalesce(envelope.classifier #>> '{objectiveRouting,semantic,reasonCode}', 'unavailable') as reason_code,
    count(*) as observations,
    round(avg(
      case
        when (envelope.classifier #>> '{objectiveRouting,semantic,confidence}')
          ~ '^(0(\.[0-9]+)?|1(\.0+)?)$'
          then (envelope.classifier #>> '{objectiveRouting,semantic,confidence}')::numeric
        else null
      end
    ), 4) as average_semantic_confidence,
    round(sum(envelope.cost_usd), 4) as classifier_cost_usd
  from public.intent_envelopes envelope
  group by
    envelope.created_at::date,
    envelope.model,
    observation_state,
    semantic_status,
    semantic_objective_kind,
    compatibility_objective_kind,
    objective_kind_agreement,
    reason_code;

comment on view private.intent_objective_routing_metrics_by_day is
  'Content-free daily shadow metrics for semantic objective routing versus the compatibility route. '
  'No tenant, message, project, envelope or document content is exposed.';

revoke all on private.intent_objective_routing_metrics_by_day from public, anon, authenticated;
