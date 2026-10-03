-- SQL policy evidence only: this does not substitute the real compiler fixture.
reset role;
do $$declare flags jsonb;state jsonb;ids text[];begin
 select jsonb_build_object('version','2026.08.26-v1','findings',jsonb_agg(jsonb_build_object('flagId','RF-'||lpad(n::text,2,'0'),'status',case when n=1 then 'not_computable' else 'clear' end,'blocksExternalOutputs',n=1) order by n),'blockers',jsonb_build_array('red_flag:RF-01:not_computable'),'mandate',jsonb_build_object('recommendation','continue_with_conditions','decision',null,'externalOutputsAllowed',false)) into flags from generate_series(1,20) n;
 state:=jsonb_build_object('materialProductionGovernance',jsonb_build_object('redFlags',flags));
 ids:=private.material_allowed_external_critical_ids_v1(state);
 if ids<>array['external-governance:red_flag:RF-01:not_computable'] then raise exception 'canonical_external_gate_not_derived';end if;
 if 'external-governance:financial-invalid'=any(ids) then raise exception 'free_prefix_authorized';end if;
 begin perform private.material_allowed_external_critical_ids_v1(jsonb_set(state,'{materialProductionGovernance,redFlags,blockers}','[]'));raise exception 'changed_external_gate_list_accepted';exception when invalid_parameter_value then null;end;
 if private.material_allowed_external_critical_ids_v1('{}')<>array[]::text[] then raise exception 'absent_governance_exempted';end if;
 raise notice 'PASS material_canonical_external_gate_exact_derived_not_release';
end$$;
