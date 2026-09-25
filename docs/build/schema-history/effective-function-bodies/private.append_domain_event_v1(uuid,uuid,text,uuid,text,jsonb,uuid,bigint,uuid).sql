CREATE OR REPLACE FUNCTION private.append_domain_event_v1(p_id uuid, p_organization_id uuid, p_kind text, p_aggregate_id uuid, p_reason text, p_state jsonb, p_human_intervention_id uuid DEFAULT NULL::uuid, p_retrieval_event_id bigint DEFAULT NULL::bigint, p_correlation_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare existing private.domain_events; digest text; revision bigint; audit_id bigint;
begin
 digest:=encode(extensions.digest(jsonb_build_object('organization',p_organization_id,'kind',p_kind,'aggregate',p_aggregate_id,'reason',p_reason,'state',p_state,'actor',auth.uid(),'humanIntervention',p_human_intervention_id,'retrievalEvent',p_retrieval_event_id,'correlation',coalesce(p_correlation_id,p_id))::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('domain-event:'||p_id::text,0));
 select * into existing from private.domain_events where id=p_id;
 if found then
  if existing.fingerprint<>digest then raise exception 'domain_event_retry_conflict' using errcode='22023'; end if;
  return existing.id;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_kind||':'||p_aggregate_id::text,0));
 select coalesce(max(aggregate_version),0)+1 into revision from private.domain_events
 where organization_id=p_organization_id and aggregate_kind=p_kind and aggregate_id=p_aggregate_id;
 if p_kind='source_version' then
  if coalesce((p_state->>'versionNo')::bigint,0)<revision then raise exception 'domain_event_version_regression' using errcode='22023'; end if;
  revision:=(p_state->>'versionNo')::bigint;
 end if;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(p_organization_id,auth.uid(),'domain.'||p_reason,p_kind,p_aggregate_id::text,jsonb_build_object('domain_event_id',p_id,'aggregate_version',revision,'correlation_id',coalesce(p_correlation_id,p_id))) returning id into audit_id;
 insert into private.domain_events(id,organization_id,aggregate_kind,aggregate_id,aggregate_version,actor_user_id,actor_kind,reason,correlation_id,fingerprint,protected_state,audit_event_id,human_intervention_id,retrieval_audit_event_id,effect)
 values(p_id,p_organization_id,p_kind,p_aggregate_id,revision,auth.uid(),case when auth.uid() is null then 'system' else 'user' end,p_reason,coalesce(p_correlation_id,p_id),digest,p_state,audit_id,p_human_intervention_id,p_retrieval_event_id,private.domain_event_effect_v1(p_kind));
 insert into private.event_outbox(organization_id,event_id) values(p_organization_id,p_id);
 return p_id;
end $function$
