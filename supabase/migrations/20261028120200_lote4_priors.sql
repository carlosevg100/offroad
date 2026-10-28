-- Lote 4 reads prior results as completed executions of the same work, as the quarter close (C54) does. The
-- board discussion of capital (ficha C47, prepare-board-capital-discussion) reads up to nine reviewed results of
-- other methods, each named in the basis by a role; the folder update (ficha C09, organize-document-folder) reads
-- the latest completed inventory and carries its stored base verbatim. The server copies each stored input into
-- the request, the request names each prior by execution and packet fingerprint, and the v4 producer checks every
-- reference against the stored rows, refuses each failure by name, pins the execution ids it accepted and keeps
-- the priors' sources in the contract. The quarter close keeps its v3 door unchanged. The worker reads the folder
-- (registry, open works, vault and files) and the priors through the job capability; the person reads the priors
-- the web composes the request from. The payload provenance of the lote 4 methods is a separate migration.
set local lock_timeout='5s';

-- 1. The pins table records the board discussion's roles and the folder's prior inventory beside the quarter
-- close's two. A role names one method; the covenant role is the same method for both readers.
alter table private.execution_prior_results drop constraint execution_prior_results_role_check;
alter table private.execution_prior_results add constraint execution_prior_results_role_check check(role in ('weekly_cash','covenant',
 'tabela-divida','caixa-semanal','linha-embalagem','projecao','plano-fpa','recebiveis','custo-relativo','plano-2027','inventario'));
alter table private.execution_prior_results drop constraint execution_prior_results_method_check;
alter table private.execution_prior_results add constraint execution_prior_results_method_check check(
 (role='weekly_cash' and prior_method_id='project-weekly-cash') or (role='covenant' and prior_method_id='measure-covenant-headroom')
 or (role='tabela-divida' and prior_method_id='build-company-debt-table') or (role='caixa-semanal' and prior_method_id='project-weekly-cash')
 or (role='linha-embalagem' and prior_method_id='analyze-investment-project') or (role='projecao' and prior_method_id='build-operating-projection')
 or (role='plano-fpa' and prior_method_id='challenge-financial-projection') or (role='recebiveis' and prior_method_id='monetize-receivables-for-working-capital')
 or (role='custo-relativo' and prior_method_id='analyze-relative-debt-cost') or (role='plano-2027' and prior_method_id='evaluate-financing-paths')
 or (role='inventario' and prior_method_id='organize-document-folder'));
comment on table private.execution_prior_results is 'The prior completed executions an execution was issued over (quarter close, board discussion, folder update), pinned by id with their input and packet fingerprints. Written by the v3 and v4 producers in the same transaction; no client or worker grant.';

-- 2. What each role reads: the method, its released version and its packet schema, as the board discussion's
-- released sources name them (packages/financial-model/src/board-capital-discussion-sources.ts).
create function private.board_material_prior_method_v1(p_role text) returns jsonb
language sql immutable set search_path='' as $$
 select case p_role
  when 'tabela-divida' then jsonb_build_object('methodId','build-company-debt-table','methodVersion','2026.10.23-v1','packet','debt-table-packet.v1')
  when 'covenant' then jsonb_build_object('methodId','measure-covenant-headroom','methodVersion','2026.10.23-v1','packet','covenant-headroom-packet.v1')
  when 'caixa-semanal' then jsonb_build_object('methodId','project-weekly-cash','methodVersion','2026.10.23-v1','packet','weekly-cash-packet.v1')
  when 'linha-embalagem' then jsonb_build_object('methodId','analyze-investment-project','methodVersion','2026.10.09-v2','packet','investment-decision-packet.v1')
  when 'projecao' then jsonb_build_object('methodId','build-operating-projection','methodVersion','2026.10.26-v1','packet','operating-projection-packet.v1')
  when 'plano-fpa' then jsonb_build_object('methodId','challenge-financial-projection','methodVersion','2026.10.26-v1','packet','projection-challenge-packet.v1')
  when 'recebiveis' then jsonb_build_object('methodId','monetize-receivables-for-working-capital','methodVersion','2026.10.26-v1','packet','receivables-funding-packet.v1')
  when 'custo-relativo' then jsonb_build_object('methodId','analyze-relative-debt-cost','methodVersion','2026.10.19-v2','packet','relative-debt-cost-packet.v1')
  when 'plano-2027' then jsonb_build_object('methodId','evaluate-financing-paths','methodVersion','2026.10.27-v1','packet','capital-structure-paths-packet.v1') end;
$$;
revoke all on function private.board_material_prior_method_v1(text) from public,anon,authenticated,service_role;

create function private.board_material_prior_roles_v1() returns text[]
language sql immutable set search_path='' as $$
 select array['tabela-divida','covenant','caixa-semanal','linha-embalagem','projecao','plano-fpa','recebiveis','custo-relativo','plano-2027'];
$$;
revoke all on function private.board_material_prior_roles_v1() from public,anon,authenticated,service_role;

create function private.document_folder_prior_method_v1() returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('methodId','organize-document-folder','methodVersion','2026.10.27-v1','packet','document-folder-inventory-packet.v1');
$$;
revoke all on function private.document_folder_prior_method_v1() from public,anon,authenticated,service_role;

-- A method version is released when its platform release is published for every organization, as the
-- execution profile requires (private.execution_released_profile_v1).
create function private.prior_method_released_v1(p_method text,p_version text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.platform_method_releases r
  join private.platform_capability_releases c on c.capability_key=r.capability_key and c.method_id=r.method_id and c.method_version=r.version
  where r.method_id=p_method and r.version=p_version and c.released and c.exposure='universal' and private.platform_method_reference_available_v1(r.id));
$$;
revoke all on function private.prior_method_released_v1(text,text) from public,anon,authenticated,service_role;

-- 3. The money scale each released source method adopts its basis in, as its conversation bridge builds it: the
-- dimensions of a basis say "1" in reais and in millions alike, so the scale is fixed per method and version from the
-- bridge's code. Lotes 2 and 3 and the investment adopt in reais; the 2027 plan in millions. A method without a
-- bridge in the product (the relative debt cost) has no known scale.
create function private.prior_method_money_scale_v1(p_method text,p_version text) returns text
language sql immutable set search_path='' as $$
 select case
  when (p_method,p_version) in (('build-company-debt-table','2026.10.23-v1'),('measure-covenant-headroom','2026.10.23-v1'),('project-weekly-cash','2026.10.23-v1'),
   ('analyze-investment-project','2026.10.09-v2'),('build-operating-projection','2026.10.26-v1'),('challenge-financial-projection','2026.10.26-v1'),
   ('monetize-receivables-for-working-capital','2026.10.26-v1'),('update-after-quarter-close','2026.10.26-v1')) then 'reais'
  when (p_method,p_version) in (('evaluate-financing-paths','2026.10.27-v1')) then 'millions' end;
$$;
revoke all on function private.prior_method_money_scale_v1(text,text) from public,anon,authenticated,service_role;

-- The scale a board source declares (reais or millions) against the one its prior's method adopts in: an undeclared
-- or unknown scale, a method without a known scale, or another scale, is refused by name.
create function private.board_material_prior_scale_v1(p_declared text,p_method text,p_version text) returns text
language sql immutable set search_path='' as $$
 select case when p_declared is null or p_declared not in ('reais','millions') then 'board_material_prior_scale_invalid'
  when private.prior_method_money_scale_v1(p_method,p_version) is null then 'board_material_prior_scale_unknown'
  when private.prior_method_money_scale_v1(p_method,p_version)<>p_declared then 'board_material_prior_scale_mismatch' end;
$$;
revoke all on function private.board_material_prior_scale_v1(text,text,text) from public,anon,authenticated,service_role;

-- The scale the discussion's basis declares for one source: the third element of the adopted source.<id> list that
-- analysis.discussion.sources names by decision, read from the basis canonical text the snapshot carries. Null when the
-- basis does not name it as [method, packet fingerprint, scale]; the verdict then refuses the scale as invalid.
create function private.board_material_declared_scale_v1(p_snapshot jsonb,p_id text) returns text
language plpgsql immutable set search_path='' as $$
declare basis jsonb;decision text;scale text;
begin
 if jsonb_typeof(p_snapshot#>'{analysis,discussion,sources}') is distinct from 'array'
  or jsonb_typeof(p_snapshot#>'{analysis,discussion,envelope,canonical}') is distinct from 'string' then return null;end if;
 select d.v#>>'{reading,decisionId}' into decision from jsonb_array_elements(p_snapshot#>'{analysis,discussion,sources}') d(v) where d.v->>'id'=p_id limit 1;
 if decision is null then return null;end if;
 basis:=(p_snapshot#>>'{analysis,discussion,envelope,canonical}')::jsonb;
 if jsonb_typeof(basis->'entries') is distinct from 'array' then return null;end if;
 select e.v#>>'{value,value,2}' into scale from jsonb_array_elements(basis->'entries') e(v)
  where e.v->>'decisionId'=decision and e.v->>'fieldPath' like '%.source.'||p_id and e.v#>>'{value,type}'='list'
   and jsonb_typeof(e.v#>'{value,value}')='array' and jsonb_array_length(e.v#>'{value,value}')=3 limit 1;
 return scale;
exception when data_exception then return null;
end $$;
revoke all on function private.board_material_declared_scale_v1(jsonb,text) from public,anon,authenticated,service_role;

-- 4. The verdicts, over row data only. Identity first: an execution of another organization or of another
-- work is reported as not found, so a refusal never tells whether it exists outside this work; an execution
-- without a succeeded result is refused by name.
create function private.lote4_prior_identity_v1(p_kind text,p_org uuid,p_work uuid,p_found boolean,p_exec_org uuid,p_exec_work uuid,p_outcome text) returns text
language sql immutable set search_path='' as $$
 select case when p_kind is null or p_kind not in ('board_material','document_folder') then 'execution_priors_invalid'
  when not coalesce(p_found,false) or p_exec_org is distinct from p_org then p_kind||'_prior_not_found'
  when p_exec_work is distinct from p_work then p_kind||'_prior_not_found'
  when p_outcome is distinct from 'succeeded' then p_kind||'_prior_not_completed' end;
$$;
revoke all on function private.lote4_prior_identity_v1(text,uuid,uuid,boolean,uuid,uuid,text) from public,anon,authenticated,service_role;

-- Every source the prior pinned (same version, bytes and resource) pinned again by this contract.
create function private.prior_sources_pinned_v1(p_prior_contract jsonb,p_contract_sources jsonb) returns boolean
language sql immutable set search_path='' as $$
 select jsonb_typeof(coalesce(p_prior_contract#>'{inputs,sources}','[]'::jsonb))='array' and jsonb_typeof(coalesce(p_contract_sources,'[]'::jsonb))='array'
  and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(coalesce(p_prior_contract#>'{inputs,sources}','[]'::jsonb))='array' then coalesce(p_prior_contract#>'{inputs,sources}','[]'::jsonb) else '[]'::jsonb end) x(v)
   where not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(coalesce(p_contract_sources,'[]'::jsonb))='array' then coalesce(p_contract_sources,'[]'::jsonb) else '[]'::jsonb end) y(v)
    where y.v->>'sourceVersionId'=x.v->>'sourceVersionId' and y.v->>'contentHash'=x.v->>'contentHash' and y.v->>'resourceId'=x.v->>'resourceId'));
$$;
revoke all on function private.prior_sources_pinned_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

-- Content of a board source: the method and version the role expects, released, the packet fingerprint the
-- request names, the stored result text equal byte for byte to the packet the snapshot carries for that role,
-- the prior's sources pinned again, and the declared money scale equal to the one its method adopts in.
create function private.board_material_prior_content_v1(p_role text,p_ref jsonb,p_embedded jsonb,p_contract_sources jsonb,p_prior_contract jsonb,
 p_canonical_result text,p_result jsonb,p_released boolean) returns text
language plpgsql immutable set search_path='' as $$
declare expected jsonb:=private.board_material_prior_method_v1(p_role);
begin
 if expected is null then return 'board_material_priors_invalid';end if;
 if p_prior_contract#>>'{method,methodId}' is distinct from expected->>'methodId' or p_prior_contract#>>'{method,methodVersion}' is distinct from expected->>'methodVersion'
  or p_result->>'schemaVersion' is distinct from expected->>'packet' then return 'board_material_prior_method_mismatch';end if;
 if not coalesce(p_released,false) then return 'board_material_prior_not_released';end if;
 if p_result->>'fingerprint' is distinct from p_ref->>'resultFingerprint' then return 'board_material_prior_fingerprint_mismatch';end if;
 if jsonb_typeof(p_embedded) is distinct from 'object' or p_embedded->>'id' is distinct from p_role or jsonb_typeof(p_embedded->'packet') is distinct from 'string'
  or p_embedded->>'packet' is distinct from p_canonical_result then return 'board_material_prior_input_mismatch';end if;
 if not private.prior_sources_pinned_v1(p_prior_contract,p_contract_sources) then return 'board_material_prior_source_unpinned';end if;
 return private.board_material_prior_scale_v1(p_embedded->>'moneyScale',expected->>'methodId',expected->>'methodVersion');
end $$;
revoke all on function private.board_material_prior_content_v1(text,jsonb,jsonb,jsonb,jsonb,text,jsonb,boolean) from public,anon,authenticated,service_role;

-- Content of the folder's prior inventory: the method and version, released, the packet fingerprint the request
-- names, the update's base equal to the prior's stored base (the stored canonical text, byte for byte), and the
-- prior's sources pinned again.
create function private.document_folder_prior_content_v1(p_ref jsonb,p_embedded jsonb,p_contract_sources jsonb,p_prior_contract jsonb,p_prior_snapshot jsonb,
 p_result jsonb,p_released boolean) returns text
language plpgsql immutable set search_path='' as $$
declare expected jsonb:=private.document_folder_prior_method_v1();
begin
 if p_prior_contract#>>'{method,methodId}' is distinct from expected->>'methodId' or p_prior_contract#>>'{method,methodVersion}' is distinct from expected->>'methodVersion'
  or p_result->>'schemaVersion' is distinct from expected->>'packet' then return 'document_folder_prior_method_mismatch';end if;
 if not coalesce(p_released,false) then return 'document_folder_prior_not_released';end if;
 if p_result->>'fingerprint' is distinct from p_ref->>'resultFingerprint' then return 'document_folder_prior_fingerprint_mismatch';end if;
 if jsonb_typeof(p_embedded) is distinct from 'object' or jsonb_typeof(p_prior_snapshot#>'{analysis,base}') is distinct from 'object'
  or p_embedded is distinct from p_prior_snapshot#>'{analysis,base}' then return 'document_folder_prior_input_mismatch';end if;
 if not private.prior_sources_pinned_v1(p_prior_contract,p_contract_sources) then return 'document_folder_prior_source_unpinned';end if;
 return null;
end $$;
revoke all on function private.document_folder_prior_content_v1(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,boolean) from public,anon,authenticated,service_role;

-- 5. One reference resolved against the stored rows, raising the named refusal. Between identity and content,
-- the prior's own closure must still be readable and derivable by the requester: a prior whose source rights
-- were revoked fails here through the normal rights machinery.
create function private.lote4_prior_resolve_v1(p_kind text,p_org uuid,p_work uuid,p_role text,p_ref jsonb,p_embedded jsonb,p_contract_sources jsonb,p_subject uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare e public.work_executions;m private.execution_manifests;s private.execution_input_snapshots;r private.execution_result_receipts;code text;closure jsonb;released boolean;
begin
 if p_kind is null or p_kind not in ('board_material','document_folder') then raise exception 'execution_priors_invalid' using errcode='22023';end if;
 if jsonb_typeof(p_ref) is distinct from 'object' or p_ref - array['role','executionId','resultFingerprint']<>'{}'::jsonb
  or p_ref->>'role' is distinct from p_role or coalesce(p_ref->>'executionId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or coalesce(p_ref->>'resultFingerprint','') !~ '^[a-f0-9]{64}$' then raise exception '%',p_kind||'_priors_invalid' using errcode='22023';end if;
 select * into e from public.work_executions where id=(p_ref->>'executionId')::uuid;
 if e.id is not null and e.organization_id=p_org then
  select * into m from private.execution_manifests where organization_id=p_org and execution_id=e.id;
  select * into s from private.execution_input_snapshots where organization_id=p_org and execution_id=e.id;
  select * into r from private.execution_result_receipts where organization_id=p_org and execution_id=e.id;
 end if;
 code:=private.lote4_prior_identity_v1(p_kind,p_org,p_work,e.id is not null,e.organization_id,e.work_id,case when m.id is null or s.id is null then null else r.outcome end);
 if code is not null then raise exception '%',code using errcode='42501';end if;
 closure:=private.execution_result_source_closure_v1(p_org,e.id);
 if closure is null or not private.execution_closure_read_allowed_v1(p_org,closure,p_subject,'derive') then raise exception '%',p_kind||'_prior_rights_denied' using errcode='42501';end if;
 released:=private.prior_method_released_v1(m.payload#>>'{method,methodId}',m.payload#>>'{method,methodVersion}');
 code:=case p_kind when 'board_material' then private.board_material_prior_content_v1(p_role,p_ref,p_embedded,p_contract_sources,m.payload,r.canonical_result,r.result,released)
  else private.document_folder_prior_content_v1(p_ref,p_embedded,p_contract_sources,m.payload,s.payload,r.result,released) end;
 if code is not null then raise exception '%',code using errcode='42501';end if;
 return jsonb_build_object('role',p_role,'executionId',e.id,'methodId',m.payload#>>'{method,methodId}','methodVersion',m.payload#>>'{method,methodVersion}',
  'inputFingerprint',s.payload_fingerprint,'resultFingerprint',r.result->>'fingerprint');
end $$;
revoke all on function private.lote4_prior_resolve_v1(text,uuid,uuid,text,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated,service_role;

-- 6. The payload checks the lote 4 provenance branches call: the execution must carry the priors the v4 producer
-- resolved and recorded for it, each embedded prior exactly the stored row of the recorded execution, of the same
-- work, succeeded, with the recorded input and packet fingerprints. They only answer true or false.
create function private.board_material_priors_recorded_v1(p_contract jsonb,p_payload jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare org uuid;work uuid;ex uuid;src jsonb;expected jsonb;n integer;
begin
 org:=(p_contract->>'organizationId')::uuid;work:=(p_contract->>'workId')::uuid;ex:=(p_contract->>'executionId')::uuid;
 if org is null or work is null or ex is null or jsonb_typeof(p_payload#>'{analysis,sources}') is distinct from 'array' then return false;end if;
 n:=jsonb_array_length(p_payload#>'{analysis,sources}');
 if n<1 or n>16 or (select count(distinct x.v->>'id') from jsonb_array_elements(p_payload#>'{analysis,sources}') x(v))<>n
  or (select count(*) from private.execution_prior_results p where p.organization_id=org and p.execution_id=ex)<>n then return false;end if;
 for src in select value from jsonb_array_elements(p_payload#>'{analysis,sources}') loop
  expected:=private.board_material_prior_method_v1(src->>'id');
  if expected is null or jsonb_typeof(src->'packet') is distinct from 'string' then return false;end if;
  if not exists(select 1 from private.execution_prior_results p
   join public.work_executions e on e.organization_id=p.organization_id and e.id=p.prior_execution_id
   join private.execution_manifests m on m.organization_id=e.organization_id and m.execution_id=e.id
   join private.execution_input_snapshots s on s.organization_id=e.organization_id and s.execution_id=e.id
   join private.execution_result_receipts r on r.organization_id=e.organization_id and r.execution_id=e.id
   where p.organization_id=org and p.execution_id=ex and p.role=src->>'id' and e.work_id=work and r.outcome='succeeded'
    and m.payload#>>'{method,methodId}'=expected->>'methodId' and m.payload#>>'{method,methodVersion}'=expected->>'methodVersion'
    and p.prior_method_id=expected->>'methodId' and p.prior_method_version=expected->>'methodVersion'
    and s.payload_fingerprint=p.prior_input_fingerprint and r.result->>'fingerprint'=p.prior_result_fingerprint
    and r.canonical_result=src->>'packet'
    and private.board_material_prior_scale_v1(private.board_material_declared_scale_v1(p_payload,src->>'id'),expected->>'methodId',expected->>'methodVersion') is null) then return false;end if;
 end loop;
 return true;
exception when data_exception then return false;
end $$;
revoke all on function private.board_material_priors_recorded_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

-- A first inventory carries no prior and no recorded pin; an update carries exactly the recorded prior inventory,
-- its base the prior's stored base.
create function private.document_folder_prior_recorded_v1(p_contract jsonb,p_payload jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare org uuid;work uuid;ex uuid;expected jsonb:=private.document_folder_prior_method_v1();pins integer;
begin
 org:=(p_contract->>'organizationId')::uuid;work:=(p_contract->>'workId')::uuid;ex:=(p_contract->>'executionId')::uuid;
 if org is null or work is null or ex is null or jsonb_typeof(p_payload#>'{analysis,base}') is distinct from 'object' then return false;end if;
 select count(*) into pins from private.execution_prior_results p where p.organization_id=org and p.execution_id=ex;
 if coalesce(p_payload#>'{analysis,update}','null'::jsonb)='null'::jsonb then return pins=0;end if;
 if jsonb_typeof(p_payload#>'{analysis,update}')<>'object' or pins<>1 then return false;end if;
 return exists(select 1 from private.execution_prior_results p
  join public.work_executions e on e.organization_id=p.organization_id and e.id=p.prior_execution_id
  join private.execution_manifests m on m.organization_id=e.organization_id and m.execution_id=e.id
  join private.execution_input_snapshots s on s.organization_id=e.organization_id and s.execution_id=e.id
  join private.execution_result_receipts r on r.organization_id=e.organization_id and r.execution_id=e.id
  where p.organization_id=org and p.execution_id=ex and p.role='inventario' and e.work_id=work and r.outcome='succeeded'
   and m.payload#>>'{method,methodId}'=expected->>'methodId' and m.payload#>>'{method,methodVersion}'=expected->>'methodVersion'
   and p.prior_method_id=expected->>'methodId' and p.prior_method_version=expected->>'methodVersion'
   and s.payload_fingerprint=p.prior_input_fingerprint and r.result->>'fingerprint'=p.prior_result_fingerprint
   and s.payload#>'{analysis,base}'=p_payload#>'{analysis,base}');
exception when data_exception then return false;
end $$;
revoke all on function private.document_folder_prior_recorded_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

-- 7. The v4 producer, for the board discussion and the folder update only: the caller's access to the work first,
-- then every prior reference resolved and refused by name, then the prior execution ids recorded for the
-- contract's execution, then the v2 producer unchanged. A board source is named by its role, once, and every
-- source the snapshot carries has exactly one reference; the folder update names its one prior inventory. A
-- replay names the same execution only with the same priors.
create function private.request_work_execution_producer_v4(p_contract_text text,p_snapshot_text text,p_gates_text text,p_prior_results jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c jsonb;s jsonb;org uuid;work uuid;kind text;resolved jsonb:='[]';ref jsonb;src jsonb;r jsonb;ex uuid;item jsonb;ex_org uuid;ex_work uuid;n integer;
begin
 if auth.uid() is null then raise exception 'execution_subject_required' using errcode='42501';end if;
 if p_contract_text is null or octet_length(p_contract_text)>1048576 or p_snapshot_text is null or octet_length(p_snapshot_text)>8388608
 then raise exception 'execution_contract_denied' using errcode='42501';end if;
 begin
  c:=private.execution_json_projection_v1(p_contract_text);
  s:=private.execution_json_projection_v1(p_snapshot_text);
  work:=(c->>'workId')::uuid;
 exception when data_exception then raise exception 'execution_contract_denied' using errcode='42501';
 end;
 kind:=case c#>>'{method,methodId}' when 'prepare-board-capital-discussion' then 'board_material' when 'organize-document-folder' then 'document_folder' end;
 if kind is null then raise exception 'execution_priors_method_denied' using errcode='42501';end if;
 select organization_id into org from public.capital_projects where id=work;
 if org is null or c->>'organizationId' is distinct from org::text then raise exception 'execution_access_denied' using errcode='42501';end if;
 perform private.execution_read_access_v1(org,work);
 if jsonb_typeof(p_prior_results) is distinct from 'array' then raise exception '%',kind||'_priors_invalid' using errcode='22023';end if;
 if kind='board_material' then
  if jsonb_typeof(s#>'{analysis,sources}') is distinct from 'array' then raise exception 'board_material_priors_invalid' using errcode='22023';end if;
  n:=jsonb_array_length(s#>'{analysis,sources}');
  if n<1 or n>16 or jsonb_array_length(p_prior_results)<>n
   or (select count(distinct x.v->>'id') from jsonb_array_elements(s#>'{analysis,sources}') x(v))<>n
   or (select count(distinct x.v->>'role') from jsonb_array_elements(p_prior_results) x(v))<>n then raise exception 'board_material_priors_invalid' using errcode='22023';end if;
  for src in select value from jsonb_array_elements(s#>'{analysis,sources}') loop
   if private.board_material_prior_method_v1(src->>'id') is null then raise exception 'board_material_priors_invalid' using errcode='22023';end if;
   select x.v into ref from jsonb_array_elements(p_prior_results) x(v) where x.v->>'role'=src->>'id';
   if ref is null then raise exception 'board_material_priors_invalid' using errcode='22023';end if;
   -- The declared scale is the basis's own, never a field the request adds beside the stored packet.
   resolved:=resolved||jsonb_build_array(private.lote4_prior_resolve_v1(kind,org,work,src->>'id',ref,
    src||jsonb_build_object('moneyScale',private.board_material_declared_scale_v1(s,src->>'id')),c#>'{inputs,sources}',auth.uid()));
   ref:=null;
  end loop;
 else
  -- Only an update reads a prior; a first inventory goes through the common producers.
  if jsonb_array_length(p_prior_results)<>1 or jsonb_typeof(s#>'{analysis,update}') is distinct from 'object' then raise exception 'document_folder_priors_invalid' using errcode='22023';end if;
  resolved:=jsonb_build_array(private.lote4_prior_resolve_v1(kind,org,work,'inventario',p_prior_results->0,s#>'{analysis,base}',c#>'{inputs,sources}',auth.uid()));
 end if;
 ex:=(c->>'executionId')::uuid;
 if ex is null then raise exception 'execution_contract_denied' using errcode='42501';end if;
 -- An execution id that already belongs to another work or organization is treated exactly as a new one
 -- would be up to this point: nothing is recorded or compared for it, so no conflict can reveal it, and the v2
 -- producer refuses it as it refuses any contract it cannot issue.
 select e.organization_id,e.work_id into ex_org,ex_work from public.work_executions e where e.id=ex;
 if ex_org is null or (ex_org=org and ex_work=work) then
 for item in select value from jsonb_array_elements(resolved) loop
  insert into private.execution_prior_results(organization_id,execution_id,role,prior_execution_id,prior_method_id,prior_method_version,prior_input_fingerprint,prior_result_fingerprint)
  values(org,ex,item->>'role',(item->>'executionId')::uuid,item->>'methodId',item->>'methodVersion',item->>'inputFingerprint',item->>'resultFingerprint')
  on conflict on constraint execution_prior_results_pkey do nothing;
 end loop;
 if (select count(*) from private.execution_prior_results p join jsonb_array_elements(resolved) x(v) on x.v->>'role'=p.role
   where p.organization_id=org and p.execution_id=ex and p.prior_execution_id=(x.v->>'executionId')::uuid
    and p.prior_input_fingerprint=x.v->>'inputFingerprint' and p.prior_result_fingerprint=x.v->>'resultFingerprint')<>jsonb_array_length(resolved)
  or (select count(*) from private.execution_prior_results p where p.organization_id=org and p.execution_id=ex)<>jsonb_array_length(resolved)
 then raise exception 'execution_request_conflict' using errcode='23505',detail=ex::text;end if;
 end if;
 r:=private.request_work_execution_producer_v2(p_contract_text,p_snapshot_text,p_gates_text);
 if r->>'executionId' is distinct from ex::text then raise exception 'execution_request_conflict' using errcode='23505',detail=coalesce(r->>'executionId','');end if;
 return r||jsonb_build_object('priorResults',resolved);
end $$;
revoke all on function private.request_work_execution_producer_v4(text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.request_work_execution_producer_v4(text,text,text,jsonb) to authenticated;
create function public.request_work_execution_v4(p_contract_text text,p_snapshot_text text,p_gates_text text,p_prior_results jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.request_work_execution_producer_v4(p_contract_text,p_snapshot_text,p_gates_text,p_prior_results); $$;
revoke all on function public.request_work_execution_v4(text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.request_work_execution_v4(text,text,text,jsonb) to authenticated;

-- 8. The latest succeeded execution of a method version in a work, deterministic (latest result, then execution
-- id), with its stored input and result as text, the sources the contract must pin again, whether the version is
-- released and the money scale its method adopts in (null when unknown). A prior whose closure the reader may not read is reported as
-- absent, never replaced by an older one.
create function private.lote4_latest_prior_v1(p_org uuid,p_work uuid,p_expected jsonb,p_subject uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare x record;closure jsonb;
begin
 if p_expected is null then return null;end if;
 select e.id,s.canonical_payload,s.payload_fingerprint,s.payload snapshot,m.payload contract,r.result,r.canonical_result,r.created_at into x
 from public.work_executions e
 join private.execution_manifests m on m.organization_id=e.organization_id and m.execution_id=e.id
 join private.execution_input_snapshots s on s.organization_id=e.organization_id and s.execution_id=e.id
 join private.execution_result_receipts r on r.organization_id=e.organization_id and r.execution_id=e.id
 where e.organization_id=p_org and e.work_id=p_work and r.outcome='succeeded'
  and m.payload#>>'{method,methodId}'=p_expected->>'methodId' and m.payload#>>'{method,methodVersion}'=p_expected->>'methodVersion'
  and r.result->>'schemaVersion'=p_expected->>'packet'
 order by r.created_at desc,e.id desc limit 1;
 if x.id is null then return null;end if;
 closure:=private.execution_result_source_closure_v1(p_org,x.id);
 if closure is null or not private.execution_closure_read_allowed_v1(p_org,closure,p_subject,'read') then return null;end if;
 return jsonb_build_object('executionId',x.id,'methodId',p_expected->>'methodId','methodVersion',p_expected->>'methodVersion','inputSnapshot',x.canonical_payload,
  'inputFingerprint',x.payload_fingerprint,'resultFingerprint',x.result->>'fingerprint','result',x.canonical_result,'packet',x.result,
  'sources',coalesce(x.contract#>'{inputs,sources}','[]'::jsonb),'committedAt',x.created_at,
  'released',private.prior_method_released_v1(p_expected->>'methodId',p_expected->>'methodVersion'),
  'moneyScale',private.prior_method_money_scale_v1(p_expected->>'methodId',p_expected->>'methodVersion'));
end $$;
revoke all on function private.lote4_latest_prior_v1(uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;

-- The board discussion's priors: for each role, in the library order, the latest succeeded execution of its method.
create function private.board_material_latest_priors_v1(p_org uuid,p_work uuid,p_subject uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_role text;x jsonb;out jsonb:='[]';
begin
 foreach v_role in array private.board_material_prior_roles_v1() loop
  x:=private.lote4_latest_prior_v1(p_org,p_work,private.board_material_prior_method_v1(v_role),p_subject);
  if x is not null then out:=out||jsonb_build_array(jsonb_build_object('role',v_role)||x);end if;
 end loop;
 return out;
end $$;
revoke all on function private.board_material_latest_priors_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- For the person confirming the board card: what the web composes the request from, each result as its stored text.
create function private.board_material_prior_results_v1(p_work_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare org uuid;
begin
 if auth.uid() is null then raise exception 'execution_subject_required' using errcode='42501';end if;
 select organization_id into org from public.capital_projects where id=p_work_id;
 if org is null then raise exception 'execution_access_denied' using errcode='42501';end if;
 perform private.execution_read_access_v1(org,p_work_id);
 return jsonb_build_object('priors',coalesce((select jsonb_agg(x.v-array['packet','inputSnapshot'] order by x.n)
  from jsonb_array_elements(private.board_material_latest_priors_v1(org,p_work_id,auth.uid())) with ordinality x(v,n)),'[]'::jsonb));
end $$;
revoke all on function private.board_material_prior_results_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.board_material_prior_results_v1(uuid) to authenticated;
create function public.board_material_prior_results_v1(p_work_id uuid) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.board_material_prior_results_v1(p_work_id); $$;
revoke all on function public.board_material_prior_results_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.board_material_prior_results_v1(uuid) to authenticated;

-- For the worker proposing the board card, with the job capability and the job's subject: each prior's packet,
-- fingerprint, release and money scale, nothing it could request with.
create function private.worker_board_material_priors_v1(p_job_id uuid,p_capability_token text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare job_row public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);work uuid;
begin
 if job_row.kind<>'agent_operation_brief' then raise exception 'agent_operation_brief_capability_required' using errcode='42501';end if;
 select capital_project_id into work from public.document_intake_sessions where organization_id=job_row.organization_id and id=job_row.intake_session_id;
 if work is null or job_row.authorization_subject_id is null then return jsonb_build_object('priors','[]'::jsonb);end if;
 return jsonb_build_object('priors',coalesce((select jsonb_agg(jsonb_build_object('role',x.v->'role','methodId',x.v->'methodId','methodVersion',x.v->'methodVersion',
  'executionId',x.v->'executionId','resultFingerprint',x.v->'resultFingerprint','released',x.v->'released','moneyScale',x.v->'moneyScale','packet',x.v->'packet') order by x.n)
  from jsonb_array_elements(private.board_material_latest_priors_v1(job_row.organization_id,work,job_row.authorization_subject_id)) with ordinality x(v,n)),'[]'::jsonb));
end $$;
revoke all on function private.worker_board_material_priors_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_board_material_priors_v1(uuid,text) to authenticated;
create function public.worker_board_material_priors_v1(p_job_id uuid,p_capability_token text) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.worker_board_material_priors_v1(p_job_id,p_capability_token); $$;
revoke all on function public.worker_board_material_priors_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.worker_board_material_priors_v1(uuid,text) to authenticated;

-- For the person confirming a folder update card: the latest completed inventory, its stored input as text.
create function private.document_folder_prior_v1(p_work_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare org uuid;x jsonb;
begin
 if auth.uid() is null then raise exception 'execution_subject_required' using errcode='42501';end if;
 select organization_id into org from public.capital_projects where id=p_work_id;
 if org is null then raise exception 'execution_access_denied' using errcode='42501';end if;
 perform private.execution_read_access_v1(org,p_work_id);
 x:=private.lote4_latest_prior_v1(org,p_work_id,private.document_folder_prior_method_v1(),auth.uid());
 return jsonb_build_object('prior',case when x is null then null else jsonb_build_object('executionId',x->'executionId','resultFingerprint',x->'resultFingerprint',
  'inputSnapshot',x->'inputSnapshot','sources',x->'sources','released',x->'released','committedAt',x->'committedAt') end);
end $$;
revoke all on function private.document_folder_prior_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.document_folder_prior_v1(uuid) to authenticated;
create function public.document_folder_prior_v1(p_work_id uuid) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.document_folder_prior_v1(p_work_id); $$;
revoke all on function public.document_folder_prior_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.document_folder_prior_v1(uuid) to authenticated;

-- For the worker proposing a folder card: the latest completed inventory with its stored input and packet.
create function private.worker_document_folder_prior_v1(p_job_id uuid,p_capability_token text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare job_row public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);work uuid;x jsonb;
begin
 if job_row.kind<>'agent_operation_brief' then raise exception 'agent_operation_brief_capability_required' using errcode='42501';end if;
 select capital_project_id into work from public.document_intake_sessions where organization_id=job_row.organization_id and id=job_row.intake_session_id;
 if work is null or job_row.authorization_subject_id is null then return jsonb_build_object('prior',null);end if;
 x:=private.lote4_latest_prior_v1(job_row.organization_id,work,private.document_folder_prior_method_v1(),job_row.authorization_subject_id);
 return jsonb_build_object('prior',case when x is null then null else jsonb_build_object('executionId',x->'executionId','resultFingerprint',x->'resultFingerprint',
  'inputSnapshot',x->'inputSnapshot','packet',x->'packet') end);
end $$;
revoke all on function private.worker_document_folder_prior_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_document_folder_prior_v1(uuid,text) to authenticated;
create function public.worker_document_folder_prior_v1(p_job_id uuid,p_capability_token text) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.worker_document_folder_prior_v1(p_job_id,p_capability_token); $$;
revoke all on function public.worker_document_folder_prior_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.worker_document_folder_prior_v1(uuid,text) to authenticated;

-- 9. What the folder method reads about the company, for the worker under the job capability and the job's
-- subject: the registry of the work's dossiers (subject, parent and subsidiaries, with the economic group), the
-- company's other open works as decisions in course, the documents of its other works by hash, and the work's
-- files in arrival order with their stored layer. Only dossiers and works the subject may read are seen; the
-- layer is named by its object, which the worker reads through the storage gate below.
create function private.document_folder_decision_kind_v1(p_objective text) returns text
language sql immutable set search_path='' as $$
 select case when p_objective in ('capital_strategy','capital_matching','financing_paths','debt_capacity','receivables_funding','received_proposal','proposal_comparison') then 'financing_plan'
  when p_objective in ('debt_table','covenant_headroom','relative_debt_cost','operation_review','board_capital_discussion') then 'debt_discussion' end;
$$;
revoke all on function private.document_folder_decision_kind_v1(text) from public,anon,authenticated,service_role;

-- The dossiers of a work the subject may read: the work's own and its sessions' (by access resource), and those
-- linked to it explicitly.
create function private.document_folder_work_dossiers_v1(p_org uuid,p_work uuid,p_subject uuid) returns uuid[]
language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(d.id order by d.created_at,d.id),'{}'::uuid[]) from public.dossiers d
 join private.access_resources r on r.organization_id=d.organization_id and r.id=d.resource_id
 where d.organization_id=p_org and (r.id=p_work or r.parent_resource_id=p_work
   or exists(select 1 from public.work_dossiers wd where wd.organization_id=p_org and wd.work_id=p_work and wd.dossier_id=d.id))
  and private.evaluate_resource_policy_v1(p_org,d.resource_id,p_subject,'read','analysis');
$$;
revoke all on function private.document_folder_work_dossiers_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.worker_document_folder_evidence_v1(p_job_id uuid,p_capability_token text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare job_row public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);org uuid;work uuid;subject uuid;company uuid;
 dossier_ids uuid[];subject_entity uuid;parent_entity uuid;group_id uuid;group_label text;entities jsonb;decisions jsonb;vault jsonb;files jsonb;others uuid[];
 author text;message_date timestamptz;
begin
 if job_row.kind<>'agent_operation_brief' then raise exception 'agent_operation_brief_capability_required' using errcode='42501';end if;
 org:=job_row.organization_id;subject:=job_row.authorization_subject_id;
 -- The person who wrote the turn's message and when: the author and date of any answer to an open question.
 -- The name and the job title come from the profile, the role in the organization when there is no title.
 select left(nullif(btrim(concat_ws(', ',nullif(btrim(pr.full_name),''),coalesce(nullif(btrim(pr.job_title),''),om.role))),''),200),m.created_at
  into author,message_date
 from public.agent_messages m
 left join public.profiles pr on pr.id=coalesce(m.human_author_id,m.created_by)
 left join public.organization_memberships om on om.organization_id=m.organization_id and om.user_id=coalesce(m.human_author_id,m.created_by) and om.status='active'
 where m.organization_id=org and m.id=nullif(job_row.payload->>'message_id','')::uuid and m.role='user' and nullif(btrim(pr.full_name),'') is not null;
 select capital_project_id into work from public.document_intake_sessions where organization_id=org and id=job_row.intake_session_id;
 if work is null or subject is null then
  return jsonb_build_object('subjectEntityId',null,'entities','[]'::jsonb,'decisions','[]'::jsonb,'vault','[]'::jsonb,'files','[]'::jsonb,'author',author,'messageDate',message_date);
 end if;
 select company_id into company from public.capital_projects where organization_id=org and id=work;
 dossier_ids:=private.document_folder_work_dossiers_v1(org,work,subject);
 -- The registry: the active links of those dossiers. The subject and the parent count only when unique.
 create temporary table if not exists pg_temp.folder_links(entity_id uuid,relationship text,perimeter jsonb,legal_name text,kind text,valid_from timestamptz,id uuid) on commit drop;
 truncate pg_temp.folder_links;
 insert into pg_temp.folder_links
 select l.entity_id,l.relationship,l.perimeter,en.legal_name,en.kind,l.valid_from,l.id from public.dossier_entity_links l join public.entities en on en.id=l.entity_id
 where l.organization_id=org and l.dossier_id=any(dossier_ids) and l.withdrawn_at is null and l.valid_from<=now() and (l.valid_until is null or l.valid_until>now());
 select case when count(distinct entity_id)=1 then min(entity_id::text)::uuid end into subject_entity from pg_temp.folder_links where relationship='subject' and kind<>'economic_group';
 select case when count(distinct entity_id)=1 then min(entity_id::text)::uuid end into parent_entity from pg_temp.folder_links where relationship='parent' and kind<>'economic_group';
 select case when count(distinct entity_id)=1 then min(entity_id::text)::uuid end,min(left(legal_name,300)) into group_id,group_label from pg_temp.folder_links where kind='economic_group';
 if group_id is null then group_id:=subject_entity;select left(legal_name,300) into group_label from pg_temp.folder_links where entity_id=subject_entity limit 1;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.entity_id,'label',left(x.legal_name,300),'groupId',group_id,'groupLabel',group_label,
   'parentId',case x.relationship when 'subject' then parent_entity when 'subsidiary' then subject_entity end,
   'ownership',case when x.perimeter->>'ownership' ~ '^[0-9]{1,4}(\.[0-9]{1,8})?$' then x.perimeter->'ownership' end) order by x.rank,x.valid_from,x.entity_id),'[]'::jsonb) into entities
 from (select distinct on (f.entity_id) f.entity_id,f.relationship,f.perimeter,f.legal_name,f.valid_from,
   case f.relationship when 'subject' then 1 when 'parent' then 2 else 3 end rank
  from pg_temp.folder_links f where f.relationship in ('subject','parent','subsidiary') and f.kind<>'economic_group' and group_id is not null
  order by f.entity_id,case f.relationship when 'subject' then 1 when 'parent' then 2 else 3 end,f.valid_from,f.id) x;
 if jsonb_array_length(entities)>200 then entities:=(select jsonb_agg(e.v order by e.n) from jsonb_array_elements(entities) with ordinality e(v,n) where e.n<=200);end if;
 -- The company's other works the subject may read: by a shared dossier or the same company.
 select coalesce(array_agg(p.id order by p.created_at,p.id),'{}'::uuid[]) into others from public.capital_projects p
 where p.organization_id=org and p.id<>work
  and ((company is not null and p.company_id=company) or private.document_folder_work_dossiers_v1(org,p.id,subject)&&dossier_ids)
  and private.evaluate_resource_policy_v1(org,p.id,subject,'read','analysis');
 -- Decisions in course: the open ones, by the kind their latest objective names; a work without one is left out.
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'label',left(d.project_name,300),'kind',d.kind) order by d.created_at,d.id),'[]'::jsonb) into decisions
 from (select p.id,p.project_name,p.created_at,private.document_folder_decision_kind_v1((select o.objective_kind from public.capital_project_objective_preflights o
   where o.organization_id=org and o.capital_project_id=p.id order by o.created_at desc,o.id desc limit 1)) kind
  from public.capital_projects p where p.organization_id=org and p.id=any(others) and p.status in ('active','paused')
  order by p.created_at desc,p.id desc limit 50) d where d.kind is not null;
 -- The vault: documents of those works, one per hash (the earliest).
 select coalesce(jsonb_agg(jsonb_build_object('documentId',v.id,'sha256',v.sha256,'label',left(v.original_name,300),'instrumentRef',null) order by v.created_at,v.id),'[]'::jsonb) into vault
 from (select distinct on (sd.sha256) sd.id,sd.sha256,sd.original_name,sd.created_at from public.source_documents sd
  join public.document_intake_sessions ss on ss.organization_id=sd.organization_id and ss.id=sd.intake_session_id
  where sd.organization_id=org and ss.capital_project_id=any(others) and sd.sha256 ~ '^[a-f0-9]{64}$' and sd.processing_status='ready'
  order by sd.sha256,sd.created_at,sd.id limit 2000) v;
 -- The work's files in arrival order, each with its latest ready layer and why it could not be opened, when it could not.
 select coalesce(jsonb_agg(jsonb_build_object('documentId',f.id,'fileName',left(f.original_name,260),'sha256',f.sha256,'mimeType',left(f.mime_type,200),
   'status',case f.processing_status when 'ready' then 'ready' when 'failed' then 'failed' when 'rejected' then 'rejected' else 'processing' end,
   'locked',case when f.failure_code='encrypted' then 'password_protected' when f.failure_code in ('unsupported_format','unsupported_legacy_format') then 'unsupported_format' end,
   'layer',null,'layerObjectPath',f.layer_path,'layerKind',f.layer_kind,'layerSha256',f.layer_sha256) order by f.created_at,f.id),'[]'::jsonb) into files
 from (select sd.id,sd.original_name,sd.sha256,sd.mime_type,sd.processing_status,sd.created_at,
   (select j.last_error->>'code' from public.processing_jobs j where j.organization_id=sd.organization_id and j.source_document_id=sd.id and j.kind='document_pipeline'
     order by j.created_at desc,j.id desc limit 1) failure_code,
   l.object_path layer_path,l.layer_kind,l.sha256 layer_sha256
  from public.source_documents sd
  join public.document_intake_sessions ss on ss.organization_id=sd.organization_id and ss.id=sd.intake_session_id
  left join lateral (select x.object_path,x.layer_kind,x.sha256 from public.document_layers x where x.organization_id=sd.organization_id and x.source_document_id=sd.id and x.status='ready'
   order by x.document_version desc,x.created_at desc limit 1) l on true
  where sd.organization_id=org and ss.capital_project_id=work and sd.sha256 ~ '^[a-f0-9]{64}$'
  order by sd.created_at,sd.id limit 1000) f;
 return jsonb_build_object('subjectEntityId',subject_entity,'entities',entities,'decisions',decisions,'vault',vault,'files',files,'author',author,'messageDate',message_date);
end $$;
revoke all on function private.worker_document_folder_evidence_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_document_folder_evidence_v1(uuid,text) to authenticated;
create function public.worker_document_folder_evidence_v1(p_job_id uuid,p_capability_token text) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.worker_document_folder_evidence_v1(p_job_id,p_capability_token); $$;
revoke all on function public.worker_document_folder_evidence_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.worker_document_folder_evidence_v1(uuid,text) to authenticated;