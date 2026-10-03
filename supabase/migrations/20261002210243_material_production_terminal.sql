-- Native terminal calculation diagnostic. No product revision is fabricated.
set search_path='';
create table private.material_production_terminals(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,recipe_id uuid not null,report_retained_payload_id uuid not null,
 case_state_retained_payload_id uuid,reason text not null check(reason in('compiler_failed','compiler_blocked','domain_material_blocked')),
 report_status text not null check(report_status in('blocked','failed','succeeded')),check((reason='domain_material_blocked')=(case_state_retained_payload_id is not null)),check((reason='domain_material_blocked')=(report_status='succeeded')),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),foreign key(organization_id,recipe_id) references private.material_production_recipes(organization_id,id),foreign key(organization_id,case_state_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),foreign key(organization_id,report_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id)
);
create index material_terminal_state_fk on private.material_production_terminals(organization_id,case_state_retained_payload_id);
create index material_terminal_report_fk on private.material_production_terminals(organization_id,report_retained_payload_id);
alter table private.material_production_terminals enable row level security;
alter table private.material_production_terminals force row level security;
create policy material_terminal_deny_select on private.material_production_terminals as restrictive for select to anon,authenticated using(false);
create policy material_terminal_deny_insert on private.material_production_terminals as restrictive for insert to anon,authenticated with check(false);
create policy material_terminal_deny_update on private.material_production_terminals as restrictive for update to anon,authenticated using(false) with check(false);
create policy material_terminal_deny_delete on private.material_production_terminals as restrictive for delete to anon,authenticated using(false);
revoke all on private.material_production_terminals from public,anon,authenticated,service_role;
create trigger material_production_terminals_immutable before update or delete on private.material_production_terminals for each row execute function private.reject_review_history_mutation_v1();
create trigger material_production_terminals_no_truncate before truncate on private.material_production_terminals for each statement execute function private.reject_review_history_mutation_v1();
create trigger material_production_terminals_updated_at before update on private.material_production_terminals for each row execute function private.set_updated_at();
create trigger material_production_terminals_audit after insert on private.material_production_terminals for each row execute function private.capture_identity_audit_v1();
create function private.material_production_terminal_dto_v1(p_org uuid,p_recipe uuid,p_replayed boolean)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-material-terminal.v1','recipeId',t.recipe_id,'reportRetainedPayloadId',t.report_retained_payload_id,'reportStatus',t.report_status,'reason',t.reason,'caseStateRetainedPayloadId',t.case_state_retained_payload_id,'replayed',p_replayed) from private.material_production_terminals t where(t.organization_id,t.recipe_id)=(p_org,p_recipe);
$$;
create function private.worker_record_material_production_terminal_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_report_retained_payload_id uuid,p_case_state_retained_payload_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.material_production_job_v1(p_job_id,p_capability_token);r private.material_production_recipes;q private.capital_public_retained_payloads;a private.capital_public_payload_allocations;b private.material_production_body_bases;t private.material_production_terminals;state_q private.capital_public_retained_payloads;state_a private.capital_public_payload_allocations;state_b private.material_production_body_bases;reason text;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('material-production:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'material_production_retry' using errcode='40001';end if;
 select * into r from private.material_production_recipes where(organization_id,id,producer_job_id)=(j.organization_id,p_recipe_id,j.id);
 select * into q from private.capital_public_retained_payloads where(organization_id,id)=(j.organization_id,p_report_retained_payload_id);
 select * into a from private.capital_public_payload_allocations where(organization_id,id,job_id,content_kind)=(j.organization_id,q.allocation_id,j.id,'material_body');
 select * into b from private.material_production_body_bases where(organization_id,id,recipe_id,kind)=(j.organization_id,a.material_body_basis_id,p_recipe_id,'calculation_report');
 if b.report_status='succeeded' then
 select * into state_q from private.capital_public_retained_payloads where(organization_id,id)=(j.organization_id,p_case_state_retained_payload_id);
 select * into state_a from private.capital_public_payload_allocations where(organization_id,id,job_id,content_kind)=(j.organization_id,state_q.allocation_id,j.id,'material_body');
 select * into state_b from private.material_production_body_bases where(organization_id,id,recipe_id,kind)=(j.organization_id,state_a.material_body_basis_id,p_recipe_id,'case_state');
 if state_b.id is null or state_b.material_ready is distinct from false or not private.capital_body_physical_receipt_v1(j.organization_id,state_q.id) or private.material_production_allocation_deadline_v1(j.organization_id,state_a.id,j.authorization_subject_id) is null then raise exception 'material_production_terminal_denied' using errcode='42501';end if;
 reason:='domain_material_blocked';
 else
 if p_case_state_retained_payload_id is not null then raise exception 'material_production_terminal_denied' using errcode='42501';end if;
 reason:=case b.report_status when 'failed' then 'compiler_failed' when 'blocked' then 'compiler_blocked' end;
 end if;
 if r.id is null or b.id is null or reason is null or exists(select 1 from private.material_production_bindings where(organization_id,recipe_id)=(j.organization_id,r.id)) or private.material_production_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null or not private.capital_body_physical_receipt_v1(j.organization_id,q.id) then raise exception 'material_production_terminal_denied' using errcode='42501';end if;
 select * into t from private.material_production_terminals where(organization_id,recipe_id)=(j.organization_id,r.id);
 if t.id is not null then
 if(t.report_retained_payload_id,t.report_status,t.reason,t.case_state_retained_payload_id) is distinct from(q.id,b.report_status,reason,p_case_state_retained_payload_id) then raise exception 'material_production_terminal_conflict' using errcode='23505';end if;
 return private.material_production_terminal_dto_v1(j.organization_id,r.id,true);
 end if;
 insert into private.material_production_terminals(organization_id,recipe_id,report_retained_payload_id,report_status,reason,case_state_retained_payload_id) values(j.organization_id,r.id,q.id,b.report_status,reason,p_case_state_retained_payload_id);
 insert into private.case_execution_results(organization_id,execution_id,report,manifest,comparison) values(j.organization_id,r.controlled_execution_id,jsonb_build_object('schemaVersion','capital-material-report-projection.v1','recipeId',r.id,'retainedPayloadId',q.id,'physicalSha256',a.payload_fingerprint,'byteLength',a.byte_length),jsonb_build_object('schemaVersion','capital-material-terminal.v1','recipeId',r.id,'reportStatus',b.report_status,'reason',reason,'caseStateRetainedPayloadId',p_case_state_retained_payload_id),null);
 update public.controlled_case_executions set status='failed',report_fingerprint=a.payload_fingerprint,completed_at=clock_timestamp() where(organization_id,id)=(j.organization_id,r.controlled_execution_id);
 if not private.material_production_clock_current_v1(j.id,p_capability_token) then raise exception 'material_production_terminal_denied' using errcode='42501';end if;
 return private.material_production_terminal_dto_v1(j.organization_id,r.id,false);
end$$;
create function public.worker_record_material_production_terminal_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_report_retained_payload_id uuid,p_case_state_retained_payload_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_material_production_terminal_v1(p_job_id,p_capability_token,p_recipe_id,p_report_retained_payload_id,p_case_state_retained_payload_id);$$;
revoke all on function private.material_production_terminal_dto_v1(uuid,uuid,boolean),private.worker_record_material_production_terminal_v1(uuid,text,uuid,uuid,uuid),public.worker_record_material_production_terminal_v1(uuid,text,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_record_material_production_terminal_v1(uuid,text,uuid,uuid,uuid),public.worker_record_material_production_terminal_v1(uuid,text,uuid,uuid,uuid) to authenticated;
