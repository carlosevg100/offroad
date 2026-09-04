-- A failed job that cannot explain itself is refused at the database boundary.

begin;

do $$
declare
  ok jsonb := '{"code":"agent_processing_failed","stage":"agent_operation_brief","retryable":false,"cause":{"name":"TypeError","class":"worker_error","message":"cannot read properties of undefined"},"spend":{"costUsd":0.02}}'::jsonb;
  rejected boolean;
begin
  perform private.assert_job_failure_record(ok);

  -- The shapes the worker used to write are refused now.
  begin
    perform private.assert_job_failure_record('{"code":"agent_processing_failed","spend":{"costUsd":0.02}}'::jsonb);
    rejected := false;
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'bare category was accepted'; end if;

  begin
    perform private.assert_job_failure_record('{"reason":"case_analysis_failed","code":"case_analysis_failed","stage":"case","retryable":false}'::jsonb);
    rejected := false;
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'record without cause was accepted'; end if;

  begin
    perform private.assert_job_failure_record(ok || '{"cause":{"name":"Error","class":"chief_vibes","message":"x"}}'::jsonb);
    rejected := false;
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'class outside the taxonomy was accepted'; end if;

  begin
    perform private.assert_job_failure_record(ok || '{"cause":{"name":"Error","class":"worker_error","message":"expected 45000000 near cfo@empresa.com.br"}}'::jsonb);
    rejected := false;
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'a value reached the failure record'; end if;

  begin
    perform private.assert_job_failure_record(ok || '{"retryable":"no"}'::jsonb);
    rejected := false;
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'non-boolean retryable was accepted'; end if;

  if private.job_failure_class('{"reason":"infected","signature":"x"}'::jsonb) <> 'invalid_input' then
    raise exception 'rejected file should be invalid_input';
  end if;
  if has_function_privilege('authenticated', 'private.assert_job_failure_record(jsonb)', 'execute') then
    raise exception 'assert leaked to tenant roles';
  end if;
end;
$$;

select 'job_failure_contract_passed' as result;

rollback;
