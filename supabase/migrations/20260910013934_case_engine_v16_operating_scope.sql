-- Admit the v16 implementation without reusing the v15 accreditation.
-- Preserve the existing capability, tenant, frozen-input, report and time checks.
do $migration$
declare
  definition text := pg_get_functiondef(
    'private.worker_record_operating_control_snapshot_v1(uuid,text,text,text,text,jsonb,jsonb)'::regprocedure
  );
  old_guard text := $guard$p_scope_id <> 'case-analysis:2026.08.29-v15'$guard$;
  new_guard text := $guard$(p_scope_id is null or p_scope_id not in ('case-analysis:2026.08.29-v15', 'case-analysis:2026.09.09-v16'))$guard$;
begin
  if strpos(definition, new_guard) > 0 then
    return;
  end if;
  if strpos(definition, old_guard) = 0 then
    raise exception 'unexpected operating-control scope guard; review before migration';
  end if;
  execute replace(definition, old_guard, new_guard);
end;
$migration$;
