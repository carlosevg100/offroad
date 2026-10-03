-- LOCAL SDK bootstrap: historical predecessor facts/structure ONLY.
-- No new plan, brief, job lease, capture, receipt, licence or Storage object
-- is seeded. The SDK must produce/approve/claim every prospective transition.
-- This is not evidence of a complete human journey (3X).
begin;
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
)
select id, 'authenticated', 'authenticated', email, '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now(), false, false
from (values
  ('d5100000-0000-4000-8000-000000000001'::uuid, 'route-owner@example.invalid'),
  ('d5100000-0000-4000-8000-000000000002'::uuid, 'route-outsider@example.invalid'),
  ('d5100000-0000-4000-8000-000000000003'::uuid, 'route-worker@example.invalid')
) as fixture(id, email);
insert into public.organizations (id, organization_type, name, created_by) values
  ('d5200000-0000-4000-8000-000000000001', 'company', 'Route Tenant A', 'd5100000-0000-4000-8000-000000000001'),
  ('d5200000-0000-4000-8000-000000000002', 'company', 'Route Tenant B', 'd5100000-0000-4000-8000-000000000002');
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('d5200000-0000-4000-8000-000000000001', 'd5100000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('d5200000-0000-4000-8000-000000000002', 'd5100000-0000-4000-8000-000000000002', 'owner', 'active', now());
insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale) values
  ('d5300000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000001', 'd5100000-0000-4000-8000-000000000001', 'company', 'pt-BR');
insert into private.worker_tokens (label, token_sha256, execution_account_user_id)
values ('deal-state-route-worker', extensions.digest(repeat('r', 64), 'sha256'), 'd5100000-0000-4000-8000-000000000003');

-- The intake analysis has finished: the session is review_ready, the preliminary understanding is
-- confirmed, the facts the confirmation needs were accepted and the worker's diagnostic snapshot
-- has no blocker. These are outputs only the workers and the review forms publish.
insert into public.processing_runs (id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by)
values ('d5400000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001',
  1, 'upload', 'succeeded', 'deal-state-route-intake-v1', 'd5100000-0000-4000-8000-000000000001');
update public.document_intake_sessions
set status = 'review_ready',
    current_run_id = 'd5400000-0000-4000-8000-000000000001',
    result_summary = result_summary || jsonb_build_object(
      'case_state', jsonb_build_object('readiness', jsonb_build_object('state', 'ready', 'blockers', '[]'::jsonb)),
      'case_manifest', jsonb_build_object('input_fingerprint', repeat('a', 64)))
where id = 'd5300000-0000-4000-8000-000000000001';
insert into public.preliminary_understandings (
  organization_id, intake_session_id, processing_run_id, object_version, status,
  input_fingerprint, object_fingerprint, payload, decided_by, decided_at
) values (
  'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001', 'd5400000-0000-4000-8000-000000000001',
  1, 'confirmed', repeat('b', 64), repeat('c', 64),
  jsonb_build_object('schemaVersion', '2026.08.31-v1', 'caseId', 'd5300000-0000-4000-8000-000000000001'),
  'd5100000-0000-4000-8000-000000000001', now()
);
insert into public.intake_field_candidates (
  organization_id, intake_session_id, processing_run_id, extractor_key, field_path, field_group, label,
  raw_value, normalized_value, value_type, currency, information_class, evidence_rank, source_anchor,
  confidence, extraction_method, review_state, reviewed_by, reviewed_at, created_by
)
select 'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001', 'd5400000-0000-4000-8000-000000000001',
  'deal-state-route:' || field_path, field_path, field_group, label, raw_value, normalized_value, value_type, currency,
  'company_document', 3, '{}'::jsonb, 1, 'user_entry', 'accepted',
  'd5100000-0000-4000-8000-000000000001', now(), 'd5100000-0000-4000-8000-000000000001'
from (values
  ('company.legal_name', 'company', 'Razão social', 'Companhia sintética 3S', to_jsonb('Companhia sintética 3S'::text), 'text', null),
  ('transaction.purpose', 'transaction', 'Finalidade', 'Capital de giro sintético', to_jsonb('Capital de giro sintético'::text), 'text', null),
  ('transaction.requested_amount', 'transaction', 'Valor solicitado', '10000000', to_jsonb(10000000), 'number', 'BRL')
) as fact(field_path, field_group, label, raw_value, normalized_value, value_type, currency);
select private.append_deal_state_object(
  'd5200000-0000-4000-8000-000000000001', 'd5300000-0000-4000-8000-000000000001', 'understanding_snapshot',
  'pending_confirmation', repeat('a', 64), '{"readiness":{"state":"ready","blockers":[]}}'::jsonb, '[]'::jsonb, null, 'worker');


-- Bounded historical predecessor, explicitly outside this prospective eval.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d5100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select public.confirm_document_intake('d5200000-0000-4000-8000-000000000001','d5300000-0000-4000-8000-000000000001','pt-BR');
reset role;
select private.append_deal_state_object('d5200000-0000-4000-8000-000000000001','d5300000-0000-4000-8000-000000000001','structure_option','pending_confirmation',repeat('a',64),jsonb_build_object('compiled',jsonb_build_object('proposalFingerprint',repeat('9',64))),jsonb_build_array(jsonb_build_object('objectType','understanding_snapshot','objectFingerprint',(select object_fingerprint from public.deal_state_objects where intake_session_id='d5300000-0000-4000-8000-000000000001' and object_type='understanding_snapshot' order by object_version desc limit 1))),null,'worker');
select private.append_deal_state_object('d5200000-0000-4000-8000-000000000001','d5300000-0000-4000-8000-000000000001','structure_decision','confirmed',repeat('a',64),'{"schemaVersion":"2026.08.29-v2","confirmation":{"decision":"confirm","proposalFingerprint":"9999999999999999999999999999999999999999999999999999999999999999","actorId":"d5100000-0000-4000-8000-000000000001"}}',jsonb_build_array(jsonb_build_object('objectType','structure_option','objectFingerprint',(select object_fingerprint from public.deal_state_objects where intake_session_id='d5300000-0000-4000-8000-000000000001' and object_type='structure_option' order by object_version desc limit 1))),null,'worker');
update auth.users set instance_id='00000000-0000-0000-0000-000000000000',encrypted_password=extensions.crypt('material-local-sdk-only',extensions.gen_salt('bf')),email_confirmed_at=clock_timestamp(),confirmation_token='',recovery_token='',email_change_token_new='',email_change='' where id in('d5100000-0000-4000-8000-000000000001','d5100000-0000-4000-8000-000000000003');
insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at) select gen_random_uuid(),id,id::text,'email',jsonb_build_object('sub',id,'email',email),clock_timestamp(),clock_timestamp() from auth.users where id in('d5100000-0000-4000-8000-000000000001','d5100000-0000-4000-8000-000000000003');
update private.capital_public_retention_controls set enabled=true;
commit;
