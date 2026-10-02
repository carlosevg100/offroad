-- Cover the complete same-tenant allowed-attempt FK. The partial unique index
-- on (organization_id,processing_attempt_id) remains the replay identity guard.
set search_path='';
create index capital_body_input_attempt_binding_idx
 on private.capital_body_invocation_inputs
 (organization_id,work_id,job_id,processing_attempt_id,invocation_id,processing_attempt_allowed);
