-- Project-scoped institutional scenarios. No opportunity or approved model is fabricated.
-- Bootstrap remains a reviewed configuration producer, not a free-form user JSON API.
create table private.institutional_model_configurations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 capital_project_id uuid not null, revision integer not null check(revision>0),
 configuration jsonb not null check(jsonb_typeof(configuration)='object'),
 configuration_fingerprint text not null check(configuration_fingerprint ~ '^[a-f0-9]{64}$'),
 parent_fingerprint text check(parent_fingerprint ~ '^[a-f0-9]{64}$'),
 status text not null check(status in ('review_required','approved','rejected')),
 answer_message_id uuid, answer_evidence jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by uuid references auth.users(id),
 unique(organization_id,id),unique(organization_id,capital_project_id,revision),
 unique(organization_id,capital_project_id,configuration_fingerprint),unique(organization_id,answer_message_id),
 foreign key(organization_id,capital_project_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,answer_message_id) references public.agent_messages(organization_id,id),
 check ((status='review_required' and reviewed_at is null and reviewed_by is null) or (status<>'review_required' and reviewed_at is not null and reviewed_by is not null))
);
create table private.institutional_information_request_bindings (
 organization_id uuid not null, capital_project_id uuid not null, information_request_id uuid primary key,
 binding jsonb not null check(jsonb_typeof(binding)='object'), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), id uuid not null default gen_random_uuid() unique,
 foreign key(organization_id,capital_project_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,information_request_id) references public.capital_project_information_requests(organization_id,id)
);
alter table private.institutional_model_configurations enable row level security;
alter table private.institutional_model_configurations force row level security;
alter table private.institutional_information_request_bindings enable row level security;
alter table private.institutional_information_request_bindings force row level security;
revoke all on private.institutional_model_configurations,private.institutional_information_request_bindings from public,anon,authenticated;

create function private.institutional_stable_json(v jsonb) returns text language plpgsql immutable set search_path='' as $$
declare result text;
begin
 if jsonb_typeof(v)='object' then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||private.institutional_stable_json(value),',' order by key collate "C"),'')||'}' into result from jsonb_each(v);
 elsif jsonb_typeof(v)='array' then select '['||coalesce(string_agg(private.institutional_stable_json(value),',' order by ord),'')||']' into result from jsonb_array_elements(v) with ordinality a(value,ord);
 else result:=v::text; end if; return result;
end $$;
create function private.institutional_config_hash(v jsonb) returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(private.institutional_stable_json(v),'utf8'),'sha256'),'hex');
$$;
revoke all on function private.institutional_stable_json(jsonb),private.institutional_config_hash(jsonb) from public,anon,authenticated;

create function private.worker_load_institutional_configuration_v1(p_job_id uuid,p_capability_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); project_id uuid; r private.institutional_model_configurations;
begin
 if j.kind not in ('case_analysis','agent_operation_brief') then raise exception 'institutional_capability_required' using errcode='42501'; end if;
 select capital_project_id into project_id from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
 select * into r from private.institutional_model_configurations where organization_id=j.organization_id and capital_project_id=project_id and status='approved' order by revision desc limit 1;
 -- A retry reconstructs the same candidate from its original parent, even after review.
 if j.kind='agent_operation_brief' and exists(select 1 from public.agent_messages where organization_id=j.organization_id and intake_session_id=j.intake_session_id and id=nullif(j.payload->>'message_id','')::uuid and role='user') and exists(select 1 from private.institutional_model_configurations where organization_id=j.organization_id and capital_project_id=project_id and answer_message_id=nullif(j.payload->>'message_id','')::uuid) then
  select parent.* into r from private.institutional_model_configurations candidate join private.institutional_model_configurations parent on parent.organization_id=candidate.organization_id and parent.capital_project_id=candidate.capital_project_id and parent.configuration_fingerprint=candidate.parent_fingerprint
  where candidate.organization_id=j.organization_id and candidate.capital_project_id=project_id and candidate.answer_message_id=nullif(j.payload->>'message_id','')::uuid;
 end if;
 return jsonb_build_object('configuration',r.configuration,'configurationFingerprint',r.configuration_fingerprint,'revision',r.revision);
end $$;
create function public.worker_load_institutional_configuration_v1(p_job_id uuid,p_capability_token text) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_load_institutional_configuration_v1(p_job_id,p_capability_token); $$;

create function private.worker_sync_institutional_information_requests_v1(p_job_id uuid,p_capability_token text,p_requests jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); project_id uuid; item jsonb; request_id uuid; k text; ns text; b jsonb; cfg jsonb; assumption jsonb; open_count integer:=0;
begin
 if j.kind not in ('case_analysis','agent_operation_brief') or coalesce(jsonb_typeof(p_requests),'null')<>'array' or jsonb_array_length(p_requests)>5 then raise exception 'institutional_requests_invalid'; end if;
 select capital_project_id into project_id from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
 if project_id is null then raise exception 'institutional_project_required'; end if;
 perform 1 from public.capital_projects where organization_id=j.organization_id and id=project_id for update;
 cfg:=private.worker_load_institutional_configuration_v1(p_job_id,p_capability_token);
 for item in select value from jsonb_array_elements(p_requests) loop
  k:=replace(item->>'key',':','.'); b:=coalesce(item->'producerBinding',item->'answerBinding');
  ns:=case when item->>'sourceNamespace'='institutional_model_assumptions' then 'institutional_model_assumptions' else 'institutional_model_intake' end;
  if coalesce(k,'')!~'^[a-z0-9_.-]{3,120}$' or coalesce(jsonb_typeof(b),'null')<>'object'
   or char_length(trim(coalesce(item->>'question',''))) not between 5 and 1000
   or char_length(trim(coalesce(item->>'whyItMatters',''))) not between 5 and 1000
   or char_length(trim(coalesce(item->>'decisionImpact',''))) not between 5 and 1000
   or coalesce(item->>'answerKind','') not in ('number','text','document')
   or coalesce(jsonb_typeof(item->'acceptableEvidence'),'null')<>'array' then raise exception 'institutional_request_invalid'; end if;
  if ns='institutional_model_assumptions' then
   if item->>'answerKind' is distinct from 'number' or cfg->>'configurationFingerprint' is null or b->>'expectedConfigurationFingerprint' is null or b->>'expectedConfigurationFingerprint' is distinct from cfg->>'configurationFingerprint'
    or b->>'schemaVersion' is distinct from 'institutional-assumption-answer-binding.v1' or b->>'category' is distinct from 'forecast_premise'
    or coalesce(b->>'locale','') not in ('pt-BR','en-US') then raise exception 'institutional_binding_invalid'; end if;
   select value into assumption from jsonb_array_elements(cfg#>'{configuration,assumptionBook,assumptions}') where value->>'id'=b->>'assumptionId';
   if assumption is null or assumption->>'editable' is distinct from 'true' or assumption->>'unit' is distinct from b->>'unit'
    or coalesce(b->>'period','')!~'^[0-9]{4}$' or ((cfg#>'{configuration,assumptionBook,periods}') ? (b->>'period')) is distinct from true
    or coalesce(b->>'unit','') not in ('percent','currency','days','multiple','quantity','index')
    or b->'targetPaths' is distinct from jsonb_build_array('assumptionBook.'||(b->>'assumptionId')||'.values.'||(b->>'period'))
    or (select count(*) from jsonb_object_keys(b))<>9
    or b->>'currency' is distinct from cfg#>>'{configuration,currency}' then raise exception 'institutional_target_invalid'; end if;
  elsif item->>'answerKind'='number' then raise exception 'institutional_numeric_binding_required'; end if;
  select id into request_id from public.capital_project_information_requests where organization_id=j.organization_id and capital_project_id=project_id and requirement_key=k order by created_at desc limit 1;
  if request_id is null then
   insert into public.capital_project_information_requests(organization_id,capital_project_id,requirement_key,question,why_it_matters,decision_impact,acceptable_evidence,answer_kind,choices,priority,information_gain,materiality,answerability,redundancy_penalty,status,source_namespace)
   values(j.organization_id,project_id,k,item->>'question',item->>'whyItMatters',item->>'decisionImpact',array(select jsonb_array_elements_text(item->'acceptableEvidence')),item->>'answerKind','{}','blocking',1,1,1,0,'open',ns) returning id into request_id;
   insert into private.institutional_information_request_bindings(organization_id,capital_project_id,information_request_id,binding,created_at) values(j.organization_id,project_id,request_id,b,now());
  elsif not exists(select 1 from private.institutional_information_request_bindings where information_request_id=request_id and binding=b) then raise exception 'institutional_binding_replay_mismatch'; end if;
  if exists(select 1 from public.capital_project_information_requests where id=request_id and status='open') then open_count:=open_count+1; end if;
 end loop;
 return jsonb_build_object('openCount',open_count);
end $$;
create function public.worker_sync_institutional_information_requests_v1(p_job_id uuid,p_capability_token text,p_requests jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_sync_institutional_information_requests_v1(p_job_id,p_capability_token,p_requests); $$;

-- Preserve all existing reader fences; extend only the current v4 reader's answer projection.
alter function private.worker_load_agent_context_v4(uuid,text) rename to worker_load_agent_context_before_institutional_v1;
revoke all on function private.worker_load_agent_context_before_institutional_v1(uuid,text) from public,anon,authenticated;
create function private.worker_load_agent_context_v4(p_job_id uuid,p_capability_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); base jsonb; response jsonb;
begin
 base:=private.worker_load_agent_context_before_institutional_v1(p_job_id,p_capability_token);
 select jsonb_build_object('id',r.id,'requirementKey',r.requirement_key,'question',r.question,'answerKind',r.answer_kind,'sourceNamespace',r.source_namespace,'answerSource',r.answer_ref->>'answerSource','answeredBy',r.answer_ref->>'answeredBy','answeredAt',r.answer_ref->>'answeredAt','messageId',r.answer_ref->>'messageId','responseFingerprint',r.answer_ref->>'responseFingerprint','producerBinding',b.binding)
 into response from public.capital_project_information_requests r join private.institutional_information_request_bindings b on b.organization_id=r.organization_id and b.information_request_id=r.id
 where r.organization_id=j.organization_id and r.capital_project_id=(base#>>'{project,id}')::uuid and r.answer_ref->>'messageId'=base->>'message_id';
 if response is not null then base:=base||jsonb_build_object('answered_information_request',response); end if;
 return base;
end $$;

create function private.institutional_response_value(content text,binding jsonb,assumption jsonb) returns text language plpgsql immutable set search_path='' as $$
declare value numeric;
begin
 if content is null or assumption is null or binding is null or coalesce(binding->>'unit','') not in ('percent','currency','days','multiple','quantity','index') or char_length(content) not between 1 and 80 or (binding->>'locale'='pt-BR' and content!~'^-?[0-9]+([.,][0-9]+)?$') or (binding->>'locale'='en-US' and content!~'^-?[0-9]+([.][0-9]+)?$') or coalesce(binding->>'locale','') not in ('pt-BR','en-US') then raise exception 'institutional_number_invalid' using errcode='22023'; end if;
 value:=replace(content,',','.')::numeric;
 if binding->>'unit'='percent' then value:=value*0.01::numeric; end if;
 if (assumption ? 'lowerBound' and value<(assumption->>'lowerBound')::numeric) or (assumption ? 'upperBound' and value>(assumption->>'upperBound')::numeric) then raise exception 'institutional_value_outside_bounds' using errcode='22023'; end if;
 return trim_scale(value)::text;
end $$;

create function private.validate_institutional_information_response_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb; c jsonb; a jsonb; content text;
begin
 if old.source_namespace<>'institutional_model_assumptions' or old.status<>'open' or new.status not in ('answered','waived') then return new; end if;
 select binding into b from private.institutional_information_request_bindings where organization_id=old.organization_id and information_request_id=old.id;
 select configuration into c from private.institutional_model_configurations where organization_id=old.organization_id and capital_project_id=old.capital_project_id and status='approved' order by revision desc limit 1;
 if b is null or c is null or private.institutional_config_hash(c) is distinct from b->>'expectedConfigurationFingerprint' then raise exception 'institutional_answer_stale' using errcode='40001'; end if;
 select value into a from jsonb_array_elements(c#>'{assumptionBook,assumptions}') where value->>'id'=b->>'assumptionId';
 if a is null or a->>'editable' is distinct from 'true' then raise exception 'institutional_target_unavailable'; end if;
 if new.status='answered' then
  if new.answer_ref->>'answerSource' is distinct from 'custom' then raise exception 'institutional_answer_source_invalid'; end if;
  select m.content into content from public.agent_messages m where m.organization_id=old.organization_id and m.id=(new.answer_ref->>'messageId')::uuid;
  perform private.institutional_response_value(trim(content),b,a);
 end if;
 return new;
end $$;
create trigger validate_institutional_information_response before update of status on public.capital_project_information_requests for each row execute function private.validate_institutional_information_response_v1();

create function private.worker_apply_institutional_assumption_answer_v1(p_job_id uuid,p_capability_token text,p_application jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); project_id uuid; message_id uuid; r public.capital_project_information_requests; b jsonb; current_row private.institutional_model_configurations; existing private.institutional_model_configurations; next_config jsonb:=p_application->'nextConfiguration'; old_a jsonb; new_a jsonb; content text; canonical text; next_revision integer; candidate_id uuid;
begin
 if j.kind<>'agent_operation_brief' or coalesce(p_application->>'status','')<>'review_required' or p_application->>'willExecute' is distinct from 'false' then raise exception 'institutional_candidate_invalid'; end if;
 message_id:=(j.payload->>'message_id')::uuid;
 if message_id is null or p_application#>>'{answerEvidence,messageId}' is distinct from message_id::text or not exists(select 1 from public.agent_messages where organization_id=j.organization_id and intake_session_id=j.intake_session_id and id=message_id and role='user') then raise exception 'institutional_answer_job_mismatch' using errcode='42501'; end if;
 select capital_project_id into project_id from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
 perform 1 from public.capital_projects where organization_id=j.organization_id and id=project_id for update;
 select * into existing from private.institutional_model_configurations where organization_id=j.organization_id and capital_project_id=project_id and answer_message_id=message_id;
 if found then
  if existing.configuration is distinct from next_config or existing.parent_fingerprint is distinct from p_application->>'expectedConfigurationFingerprint' or existing.configuration_fingerprint is distinct from p_application->>'nextConfigurationFingerprint' or existing.answer_evidence is distinct from p_application->'answerEvidence' or p_application->>'patchId' is distinct from 'information-response:'||message_id::text then raise exception 'institutional_replay_mismatch'; end if;
  return jsonb_build_object('candidateId',existing.id,'revision',existing.revision,'replayed',true);
 end if;
 select * into current_row from private.institutional_model_configurations where organization_id=j.organization_id and capital_project_id=project_id and status='approved' order by revision desc limit 1;
 if current_row.id is null or current_row.configuration_fingerprint is distinct from p_application->>'expectedConfigurationFingerprint' then raise exception 'institutional_configuration_stale' using errcode='40001'; end if;
 select * into r from public.capital_project_information_requests where organization_id=j.organization_id and capital_project_id=project_id and id=(p_application#>>'{answerEvidence,requestId}')::uuid and status='answered' and source_namespace='institutional_model_assumptions';
 select binding into b from private.institutional_information_request_bindings where organization_id=j.organization_id and information_request_id=r.id;
 select m.content into content from public.agent_messages m where m.organization_id=j.organization_id and m.id=message_id and m.intake_session_id=j.intake_session_id and m.role='user' and m.created_by=nullif(r.answer_ref->>'answeredBy','')::uuid;
 if r.id is null or b is null or content is null or r.answer_ref->>'messageId' is distinct from message_id::text
  or b->>'expectedConfigurationFingerprint' is distinct from current_row.configuration_fingerprint
  or r.answer_ref->>'answeredBy' is distinct from p_application#>>'{answerEvidence,answeredBy}'
  or r.answer_ref->>'answeredAt' is distinct from p_application#>>'{answerEvidence,answeredAt}'
  or r.answer_ref->>'responseFingerprint' is distinct from p_application#>>'{answerEvidence,responseFingerprint}'
  or encode(extensions.digest(convert_to(trim(content),'utf8'),'sha256'),'hex') is distinct from r.answer_ref->>'responseFingerprint' then raise exception 'institutional_response_binding_mismatch'; end if;
 select value into old_a from jsonb_array_elements(current_row.configuration#>'{assumptionBook,assumptions}') where value->>'id'=b->>'assumptionId';
 select value into new_a from jsonb_array_elements(next_config#>'{assumptionBook,assumptions}') where value->>'id'=b->>'assumptionId';
 canonical:=private.institutional_response_value(trim(content),b,old_a);
 if old_a is null or old_a->>'editable' is distinct from 'true' or new_a is null
  or next_config-'assumptionBook' is distinct from current_row.configuration-'assumptionBook'
  or (next_config->'assumptionBook')-array['scenarioId','scenarioName','parentScenarioId','assumptions','overrides'] is distinct from (current_row.configuration->'assumptionBook')-array['scenarioId','scenarioName','parentScenarioId','assumptions','overrides']
  or next_config#>>'{assumptionBook,parentScenarioId}' is distinct from current_row.configuration#>>'{assumptionBook,scenarioId}'
  or next_config#>>'{assumptionBook,scenarioId}' is distinct from 'institutional-response:'||message_id::text
  or new_a-array['values','sourceType','evidence','rationale','methodology','confidence'] is distinct from old_a-array['values','sourceType','evidence','rationale','methodology','confidence']
  or new_a->'values' is distinct from jsonb_set(old_a->'values',array[b->>'period'],to_jsonb(canonical),true)
  or new_a->>'sourceType' is distinct from 'offroad_scenario' or new_a->'evidence' is distinct from '[]'::jsonb or new_a->>'confidence' is distinct from 'low'
  or (select jsonb_agg(value order by ord) from jsonb_array_elements(next_config#>'{assumptionBook,assumptions}') with ordinality a(value,ord) where value->>'id'<>b->>'assumptionId') is distinct from (select jsonb_agg(value order by ord) from jsonb_array_elements(current_row.configuration#>'{assumptionBook,assumptions}') with ordinality a(value,ord) where value->>'id'<>b->>'assumptionId')
  or jsonb_array_length(next_config#>'{assumptionBook,assumptions}')<>jsonb_array_length(current_row.configuration#>'{assumptionBook,assumptions}')
  or p_application->>'nextConfigurationFingerprint' is distinct from private.institutional_config_hash(next_config)
  or next_config#>>'{assumptionBook,scenarioName}' is distinct from (case when b->>'locale'='pt-BR' then 'Cenário proposto pelo usuário' else 'User-proposed scenario' end)
  or new_a->>'rationale' is distinct from (case when b->>'locale'='pt-BR' then 'Valor informado pelo usuário para teste de cenário; ainda sujeito à revisão.' else 'User-supplied value for scenario testing; still subject to review.' end)
  or new_a->>'methodology' is distinct from 'Explicit user scenario value; '||(case when b->>'unit'='percent' then 'percent_to_ratio' else 'identity' end)||'; answer '||message_id::text||'.'
  or p_application->>'patchId' is distinct from 'information-response:'||message_id::text
  or p_application#>>'{answerEvidence,canonicalValue}' is distinct from canonical
  or p_application#>>'{answerEvidence,assumptionId}' is distinct from b->>'assumptionId'
  or p_application#>>'{answerEvidence,period}' is distinct from b->>'period'
  or p_application#>>'{answerEvidence,unit}' is distinct from b->>'unit'
  or p_application#>>'{answerEvidence,priorValue}' is distinct from old_a#>>array['values',b->>'period']
  or next_config#>'{assumptionBook,overrides}' is distinct from jsonb_build_array(jsonb_build_object('assumptionId',b->>'assumptionId','values',jsonb_build_object(b->>'period',canonical),'rationale',new_a->>'rationale','requestedBy',r.answer_ref->>'answeredBy','createdAt',r.answer_ref->>'answeredAt')) then raise exception 'institutional_patch_outside_bound_target'; end if;
 select coalesce(max(revision),0)+1 into next_revision from private.institutional_model_configurations where organization_id=j.organization_id and capital_project_id=project_id;
 insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_message_id,answer_evidence)
 values(j.organization_id,project_id,next_revision,next_config,private.institutional_config_hash(next_config),current_row.configuration_fingerprint,'review_required',message_id,p_application->'answerEvidence') returning id into candidate_id;
 return jsonb_build_object('candidateId',candidate_id,'revision',next_revision,'replayed',false);
end $$;
create function public.worker_apply_institutional_assumption_answer_v1(p_job_id uuid,p_capability_token text,p_application jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.worker_apply_institutional_assumption_answer_v1(p_job_id,p_capability_token,p_application);$$;

create function private.review_institutional_configuration_v1(p_project_id uuid,p_candidate_id uuid,p_expected_parent_fingerprint text,p_decision text,p_expected_candidate_fingerprint text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.institutional_model_configurations; current_fingerprint text;
begin
 select * into c from private.institutional_model_configurations where id=p_candidate_id and capital_project_id=p_project_id;
 if c.id is null or not private.can_access_capital_project(c.organization_id,p_project_id) then raise exception 'institutional_review_forbidden' using errcode='42501'; end if;
 perform 1 from public.capital_projects where organization_id=c.organization_id and id=p_project_id for update;
 select * into c from private.institutional_model_configurations where id=p_candidate_id for update;
 select configuration_fingerprint into current_fingerprint from private.institutional_model_configurations where organization_id=c.organization_id and capital_project_id=p_project_id and status='approved' order by revision desc limit 1;
 if c.status<>'review_required' or c.configuration_fingerprint is distinct from p_expected_candidate_fingerprint or c.parent_fingerprint is distinct from p_expected_parent_fingerprint or (p_decision='approved' and current_fingerprint is distinct from p_expected_parent_fingerprint) or coalesce(p_decision,'') not in ('approved','rejected') then raise exception 'institutional_review_stale' using errcode='40001'; end if;
 update private.institutional_model_configurations set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now() where id=c.id;
 return jsonb_build_object('candidateId',c.id,'status',p_decision,'configurationFingerprint',c.configuration_fingerprint);
end $$;
create function public.review_institutional_configuration_v1(p_project_id uuid,p_candidate_id uuid,p_expected_parent_fingerprint text,p_decision text,p_expected_candidate_fingerprint text) returns jsonb language sql security invoker set search_path='' as $$select private.review_institutional_configuration_v1(p_project_id,p_candidate_id,p_expected_parent_fingerprint,p_decision,p_expected_candidate_fingerprint);$$;

revoke all on function private.institutional_response_value(text,jsonb,jsonb),private.validate_institutional_information_response_v1() from public,anon,authenticated;
revoke all on function private.worker_load_institutional_configuration_v1(uuid,text),public.worker_load_institutional_configuration_v1(uuid,text),private.worker_sync_institutional_information_requests_v1(uuid,text,jsonb),public.worker_sync_institutional_information_requests_v1(uuid,text,jsonb),private.worker_apply_institutional_assumption_answer_v1(uuid,text,jsonb),public.worker_apply_institutional_assumption_answer_v1(uuid,text,jsonb),private.review_institutional_configuration_v1(uuid,uuid,text,text,text),public.review_institutional_configuration_v1(uuid,uuid,text,text,text),private.worker_load_agent_context_v4(uuid,text) from public,anon;
grant execute on function private.worker_load_institutional_configuration_v1(uuid,text),public.worker_load_institutional_configuration_v1(uuid,text),private.worker_sync_institutional_information_requests_v1(uuid,text,jsonb),public.worker_sync_institutional_information_requests_v1(uuid,text,jsonb),private.worker_apply_institutional_assumption_answer_v1(uuid,text,jsonb),public.worker_apply_institutional_assumption_answer_v1(uuid,text,jsonb),private.review_institutional_configuration_v1(uuid,uuid,text,text,text),public.review_institutional_configuration_v1(uuid,uuid,text,text,text),private.worker_load_agent_context_v4(uuid,text) to authenticated;

create index institutional_configs_project_status_idx on private.institutional_model_configurations(organization_id,capital_project_id,status,revision desc);
create index institutional_bindings_project_idx on private.institutional_information_request_bindings(organization_id,capital_project_id);
create index institutional_bindings_request_idx on private.institutional_information_request_bindings(organization_id,information_request_id);
create trigger institutional_configs_updated before update on private.institutional_model_configurations for each row execute function private.set_updated_at();
create trigger institutional_configs_audit after insert or update or delete on private.institutional_model_configurations for each row execute function private.capture_audit_event();
create trigger institutional_bindings_updated before update on private.institutional_information_request_bindings for each row execute function private.set_updated_at();
create trigger institutional_bindings_audit after insert or update or delete on private.institutional_information_request_bindings for each row execute function private.capture_audit_event();

create function private.protect_institutional_revision_v1() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'institutional_history_immutable'; end if;
 if (to_jsonb(new)-array['status','reviewed_at','reviewed_by','updated_at']) is distinct from (to_jsonb(old)-array['status','reviewed_at','reviewed_by','updated_at']) or old.status<>'review_required' or new.status not in ('approved','rejected') then raise exception 'institutional_revision_immutable'; end if;
 return new;
end $$;
create trigger institutional_revision_immutable before update or delete on private.institutional_model_configurations for each row execute function private.protect_institutional_revision_v1();
revoke all on function private.protect_institutional_revision_v1() from public,anon,authenticated;

alter table private.institutional_model_configurations add constraint institutional_parent_revision_fk foreign key(organization_id,capital_project_id,parent_fingerprint) references private.institutional_model_configurations(organization_id,capital_project_id,configuration_fingerprint);
create function private.read_institutional_configuration_reviews_v1(p_project_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare org_id uuid;
begin
 select organization_id into org_id from public.capital_projects where id=p_project_id;
 if org_id is null or not private.can_access_capital_project(org_id,p_project_id) then raise exception 'institutional_review_forbidden' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('candidateId',id,'revision',revision,'status',status,'configuration',configuration,'configurationFingerprint',configuration_fingerprint,'parentFingerprint',parent_fingerprint,'answerEvidence',answer_evidence,'createdAt',created_at,'reviewedAt',reviewed_at,'reviewedBy',reviewed_by) order by revision desc) from (select * from private.institutional_model_configurations where organization_id=org_id and capital_project_id=p_project_id order by revision desc limit 20) r),'[]'::jsonb);
end $$;
create function public.read_institutional_configuration_reviews_v1(p_project_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.read_institutional_configuration_reviews_v1(p_project_id);$$;
revoke all on function private.read_institutional_configuration_reviews_v1(uuid),public.read_institutional_configuration_reviews_v1(uuid) from public,anon;
grant execute on function private.read_institutional_configuration_reviews_v1(uuid),public.read_institutional_configuration_reviews_v1(uuid) to authenticated;

create function private.protect_institutional_binding_v1() returns trigger language plpgsql set search_path='' as $$begin raise exception 'institutional_binding_immutable';end $$;
create trigger institutional_binding_immutable before update or delete on private.institutional_information_request_bindings for each row execute function private.protect_institutional_binding_v1();
revoke all on function private.protect_institutional_binding_v1() from public,anon,authenticated;
