-- Stage 20 / 3E. Record verified human transformations prospectively; no historical backfill.
set search_path='';
set local lock_timeout='5s';
do $$begin
 if (select md5(prosrc) from pg_proc where oid='private.worker_apply_institutional_assumption_answer_v1(uuid,text,jsonb)'::regprocedure)<>'306c2cd8dffbe01339a1bf38b82bd516'
 then raise exception 'institutional_contribution_baseline_changed';end if;
end $$;
create table private.institutional_contribution_receipts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 work_id uuid not null, intake_session_id uuid not null, job_id uuid not null,
 subject_id uuid not null references auth.users(id), author_id uuid not null references auth.users(id),
 message_id uuid not null, request_id uuid not null,
 parent_configuration_id uuid not null, parent_fingerprint text not null check(parent_fingerprint ~ '^[a-f0-9]{64}$'),
 candidate_id uuid not null, candidate_fingerprint text not null check(candidate_fingerprint ~ '^[a-f0-9]{64}$'),
 binding jsonb not null check(jsonb_typeof(binding)='object' and pg_column_size(binding)<=65536),
 answer_ref jsonb not null check(jsonb_typeof(answer_ref)='object' and pg_column_size(answer_ref)<=65536),
 response_fingerprint text not null check(response_fingerprint ~ '^[a-f0-9]{64}$'),
 assumption_id text not null, period text not null, unit text not null, prior_value text, canonical_value text not null,
 application_fingerprint text not null check(application_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id), unique(organization_id,candidate_id), unique(organization_id,message_id), unique(organization_id,job_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,intake_session_id) references public.document_intake_sessions(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,message_id) references public.agent_messages(organization_id,id),
 foreign key(organization_id,request_id) references public.capital_project_information_requests(organization_id,id),
 foreign key(organization_id,parent_configuration_id) references private.institutional_model_configurations(organization_id,id),
 foreign key(organization_id,candidate_id) references private.institutional_model_configurations(organization_id,id),
 check(parent_configuration_id<>candidate_id)
);
create index institutional_contribution_work_idx on private.institutional_contribution_receipts(organization_id,work_id);
create index institutional_contribution_session_idx on private.institutional_contribution_receipts(organization_id,intake_session_id);
create index institutional_contribution_request_idx on private.institutional_contribution_receipts(organization_id,request_id);
create index institutional_contribution_parent_idx on private.institutional_contribution_receipts(organization_id,parent_configuration_id);
create index institutional_contribution_subject_idx on private.institutional_contribution_receipts(subject_id);
create index institutional_contribution_author_idx on private.institutional_contribution_receipts(author_id);
alter table private.institutional_contribution_receipts enable row level security;
alter table private.institutional_contribution_receipts force row level security;
revoke all on private.institutional_contribution_receipts from public,anon,authenticated,service_role;
create policy institutional_contribution_deny_select on private.institutional_contribution_receipts as restrictive for select to anon,authenticated using(false);
create policy institutional_contribution_deny_insert on private.institutional_contribution_receipts as restrictive for insert to anon,authenticated with check(false);
create policy institutional_contribution_deny_update on private.institutional_contribution_receipts as restrictive for update to anon,authenticated using(false) with check(false);
create policy institutional_contribution_deny_delete on private.institutional_contribution_receipts as restrictive for delete to anon,authenticated using(false);
create trigger institutional_contribution_immutable before update or delete on private.institutional_contribution_receipts for each row execute function private.reject_review_history_mutation_v1();
create trigger institutional_contribution_no_truncate before truncate on private.institutional_contribution_receipts for each statement execute function private.reject_review_history_mutation_v1();
create trigger institutional_contribution_updated before update on private.institutional_contribution_receipts for each row execute function private.set_updated_at();
create trigger institutional_contribution_audit after insert on private.institutional_contribution_receipts for each row execute function private.capture_audit_event();
comment on table private.institutional_contribution_receipts is 'Prospective verified transformation only; neither historical reconstruction, source closure, authorization, approval nor artifact release. No client may read or manufacture receipts.';

create or replace function private.worker_apply_institutional_assumption_answer_v1(p_job_id uuid,p_capability_token text,p_application jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.institutional_job_for_capture_v1(p_job_id,p_capability_token); project_id uuid; message_id uuid; r public.capital_project_information_requests; b jsonb; current_row private.institutional_model_configurations; existing private.institutional_model_configurations; next_config jsonb:=p_application->'nextConfiguration'; old_a jsonb; new_a jsonb; content text; canonical text; next_revision integer; candidate_id uuid; capture private.institutional_contribution_receipts; m public.agent_messages;
begin
 if j.kind<>'agent_operation_brief' or coalesce(p_application->>'status','')<>'review_required' or p_application->>'willExecute' is distinct from 'false' then raise exception 'institutional_candidate_invalid'; end if;
 message_id:=(j.payload->>'message_id')::uuid;
 if message_id is null or p_application#>>'{answerEvidence,messageId}' is distinct from message_id::text or not exists(select 1 from public.agent_messages where organization_id=j.organization_id and intake_session_id=j.intake_session_id and id=message_id and role='user') then raise exception 'institutional_answer_job_mismatch' using errcode='42501'; end if;
 select capital_project_id into project_id from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
 perform 1 from public.capital_projects where organization_id=j.organization_id and id=project_id for update;
 select * into existing from private.institutional_model_configurations where organization_id=j.organization_id and capital_project_id=project_id and answer_message_id=message_id;
 if found then
  if existing.configuration is distinct from next_config or existing.parent_fingerprint is distinct from p_application->>'expectedConfigurationFingerprint' or existing.configuration_fingerprint is distinct from p_application->>'nextConfigurationFingerprint' or existing.answer_evidence is distinct from p_application->'answerEvidence' or p_application->>'patchId' is distinct from 'information-response:'||message_id::text then raise exception 'institutional_replay_mismatch'; end if;
  select cr.* into capture from private.institutional_contribution_receipts cr where cr.organization_id=j.organization_id and cr.candidate_id=existing.id;
  if capture.id is null then
   -- Pre-migration result: preserve replay, never manufacture retrospective evidence.
   if j.lease_expires_at<=clock_timestamp() or not private.job_authority_is_current_v1(j.id) then raise exception 'institutional_capture_denied' using errcode='42501';end if;
   return jsonb_build_object('candidateId',existing.id,'revision',existing.revision,'replayed',true);
  end if;
  if (capture.job_id,capture.work_id,capture.intake_session_id,capture.subject_id,capture.message_id,capture.application_fingerprint)
    is distinct from (j.id,project_id,j.intake_session_id,j.authorization_subject_id,message_id,private.institutional_config_hash(p_application)) then raise exception 'institutional_contribution_replay_mismatch' using errcode='42501';end if;
  select * into current_row from private.institutional_model_configurations where organization_id=j.organization_id and id=capture.parent_configuration_id for share nowait;
 else
  select * into current_row from private.institutional_model_configurations where organization_id=j.organization_id and capital_project_id=project_id and status='approved' order by revision desc limit 1 for share nowait;
 end if;
 if current_row.id is null or current_row.capital_project_id is distinct from project_id or current_row.configuration_fingerprint is distinct from p_application->>'expectedConfigurationFingerprint'
 or current_row.configuration_fingerprint is distinct from private.institutional_config_hash(current_row.configuration) then raise exception 'institutional_configuration_stale' using errcode='40001'; end if;
 select * into r from public.capital_project_information_requests where organization_id=j.organization_id and capital_project_id=project_id and id=(p_application#>>'{answerEvidence,requestId}')::uuid and status='answered' and source_namespace='institutional_model_assumptions' for share nowait;
 select binding into b from private.institutional_information_request_bindings where organization_id=j.organization_id and information_request_id=r.id for share nowait;
 select * into m from public.agent_messages where organization_id=j.organization_id and id=message_id and intake_session_id=j.intake_session_id and role='user' and created_by=nullif(r.answer_ref->>'answeredBy','')::uuid for share nowait;
 content:=m.content;
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
 if capture.id is not null then
  if capture.parent_fingerprint is distinct from current_row.configuration_fingerprint
   or capture.candidate_fingerprint is distinct from existing.configuration_fingerprint
   or capture.request_id is distinct from r.id or capture.binding is distinct from b
   or capture.answer_ref is distinct from r.answer_ref or capture.author_id is distinct from m.created_by
   or capture.response_fingerprint is distinct from p_application#>>'{answerEvidence,responseFingerprint}'
   or capture.canonical_value is distinct from canonical then raise exception 'institutional_contribution_replay_mismatch' using errcode='42501';end if;
  if j.lease_expires_at<=clock_timestamp() or not private.job_authority_is_current_v1(j.id) then raise exception 'institutional_capture_denied' using errcode='42501';end if;
  return jsonb_build_object('candidateId',existing.id,'revision',existing.revision,'replayed',true);
 end if;
 select coalesce(max(revision),0)+1 into next_revision from private.institutional_model_configurations where organization_id=j.organization_id and capital_project_id=project_id;
 insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_message_id,answer_evidence)
 values(j.organization_id,project_id,next_revision,next_config,private.institutional_config_hash(next_config),current_row.configuration_fingerprint,'review_required',message_id,p_application->'answerEvidence') returning id into candidate_id;
 insert into private.institutional_contribution_receipts(organization_id,work_id,intake_session_id,job_id,subject_id,message_id,author_id,request_id,parent_configuration_id,parent_fingerprint,candidate_id,candidate_fingerprint,binding,answer_ref,response_fingerprint,assumption_id,period,unit,prior_value,canonical_value,application_fingerprint)
 values(j.organization_id,project_id,j.intake_session_id,j.id,j.authorization_subject_id,message_id,m.created_by,r.id,current_row.id,current_row.configuration_fingerprint,candidate_id,private.institutional_config_hash(next_config),b,r.answer_ref,p_application#>>'{answerEvidence,responseFingerprint}',b->>'assumptionId',b->>'period',b->>'unit',old_a#>>array['values',b->>'period'],canonical,private.institutional_config_hash(p_application));
 if j.lease_expires_at<=clock_timestamp() or not private.job_authority_is_current_v1(j.id) then raise exception 'institutional_capture_denied' using errcode='42501';end if;
 return jsonb_build_object('candidateId',candidate_id,'revision',next_revision,'replayed',false);
exception when lock_not_available then raise exception 'institutional_capture_retry' using errcode='40001';
end $$;
