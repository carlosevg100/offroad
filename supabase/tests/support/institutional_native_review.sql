-- Rollback-only fixture helper: reads the legitimate current captured basis and uses
-- the real human command, including its original preparer/self-approval declaration.
-- Policy is set explicitly by the fixture owner, never inferred by this helper.
create or replace function pg_temp.approve_native_configuration(p_work uuid,p_candidate uuid,p_command uuid,p_locale text default 'en-US')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare basis jsonb;
begin
 basis:=public.read_institutional_configuration_review_basis_v2(p_work,p_candidate);
 return public.review_institutional_configuration_and_calculate_v2(p_work,p_candidate,basis->>'parentFingerprint','approved',
  basis->>'configurationFingerprint',basis->>'lineageFingerprint',p_command,p_locale,
  (basis->>'preparedBy')::uuid=auth.uid() and (basis#>>'{policy,selfApprovalAllowed}')::boolean);
end $$;
