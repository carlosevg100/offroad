create or replace function private.record_observation_v1(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.dossiers; existing public.observations; source_id uuid; rights_id uuid; definition_id uuid; dimensions jsonb;
 request uuid; fingerprint text; result_id uuid; value_kind text; value jsonb;
begin
 if p_payload is null or octet_length(p_payload::text)>131072 or jsonb_typeof(p_payload)<>'object' or p_payload-array['requestId','dossierId','fieldPath','dimensions','value','sourceVersionId','anchor','supersedesId']<>'{}'::jsonb
 or not(p_payload ?& array['requestId','dossierId','fieldPath','dimensions','value','sourceVersionId','anchor','supersedesId']) then raise exception 'invalid_observation' using errcode='22023'; end if;
 d:=private.require_dossier_v1((p_payload->>'dossierId')::uuid,'work');
 request:=(p_payload->>'requestId')::uuid;
 if request is null then raise exception 'invalid_observation' using errcode='22023'; end if;
 dimensions:=p_payload->'dimensions';
 if jsonb_typeof(dimensions)<>'object' or dimensions-array['entityId','perimeter','periodStart','periodEnd','currency','unit','scale','scenario','definitionVersionId']<>'{}'::jsonb
 or not(dimensions ?& array['entityId','perimeter','periodStart','periodEnd','currency','unit','scale','scenario','definitionVersionId'])
 or jsonb_typeof(p_payload->'anchor')<>'object' or p_payload->'anchor'='{}'::jsonb
 then raise exception 'invalid_observation' using errcode='22023'; end if;
 source_id:=(p_payload->>'sourceVersionId')::uuid;
 rights_id:=private.require_observation_source_v1(d.organization_id,source_id);
 definition_id:=(dimensions->>'definitionVersionId')::uuid;
 if definition_id is not null and not private.can_read_definition_version_v1(d.organization_id,definition_id) then raise exception 'definition_access_denied' using errcode='42501'; end if;
 if p_payload->>'supersedesId' is not null and not private.can_read_observation_v1(d.organization_id,(p_payload->>'supersedesId')::uuid) then raise exception 'observation_access_denied' using errcode='42501'; end if;
 value_kind:=p_payload->'value'->>'type'; value:=p_payload->'value'->'value';
 if jsonb_typeof(p_payload->'value')<>'object' or p_payload->'value'-array['type','value']<>'{}'::jsonb or value is null
 or not private.valid_observation_value_v1(value_kind,value) or (value_kind='number' and jsonb_typeof(value)<>'string')
 then raise exception 'invalid_observation_value' using errcode='22023'; end if;
 if value_kind='date' then perform (value#>>'{}')::date; end if;
 fingerprint:=encode(extensions.digest(jsonb_build_object('payload',p_payload,'actor',auth.uid())::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('observation:'||d.organization_id::text||':'||request::text,0));
 select * into existing from public.observations where organization_id=d.organization_id and dossier_id=d.id and request_id=request;
 if found then
  if existing.request_fingerprint<>fingerprint then raise exception 'observation_retry_conflict' using errcode='40001'; end if;
  return existing.id;
 end if;
 insert into public.observations(organization_id,dossier_id,entity_id,field_path,perimeter,period_start,period_end,currency,unit,value_scale,scenario,definition_version_id,value_type,asserted_value,source_version_id,source_rights_version_id,source_anchor,verification_state,incomplete_reasons,supersedes_id,request_id,request_fingerprint,created_by)
 values(d.organization_id,d.id,(dimensions->>'entityId')::uuid,p_payload->>'fieldPath',dimensions->>'perimeter',(dimensions->>'periodStart')::date,(dimensions->>'periodEnd')::date,dimensions->>'currency',dimensions->>'unit',(dimensions->>'scale')::numeric,dimensions->>'scenario',definition_id,value_kind,value,source_id,rights_id,p_payload->'anchor','asserted','{}',(p_payload->>'supersedesId')::uuid,request,fingerprint,auth.uid()) returning id into result_id;
 return result_id;
end $$;

create or replace function private.record_definition_version_v1(p_dossier_id uuid,p_metric_key text,p_kind text,p_definition text,p_contract_source_version_id uuid,p_contract_anchor jsonb,p_definition_id uuid,p_expected_version integer,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.dossiers; m public.metric_definitions; previous public.definition_versions; current_version integer; rights uuid;
begin
 d:=private.require_dossier_v1(p_dossier_id,'work');
 if p_request_id is null or p_expected_version is null or p_expected_version<0 then raise exception 'invalid_definition_command' using errcode='22023'; end if;
 if p_contract_source_version_id is not null then rights:=private.require_observation_source_v1(d.organization_id,p_contract_source_version_id); end if;
 if p_kind='contractual' and (p_contract_source_version_id is null or p_contract_anchor is null or p_contract_anchor='{}'::jsonb) then raise exception 'contract_definition_requires_version_and_anchor' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended('definition-request:'||p_request_id::text,0));
 select * into previous from public.definition_versions where id=p_request_id;
 if found then
  select * into m from public.metric_definitions where organization_id=previous.organization_id and id=previous.metric_definition_id;
  if previous.organization_id is distinct from d.organization_id or m.dossier_id is distinct from d.id or previous.created_by is distinct from auth.uid()
  or m.metric_key is distinct from p_metric_key or m.kind is distinct from p_kind or previous.definition is distinct from p_definition
  or previous.contract_source_version_id is distinct from p_contract_source_version_id or previous.contract_anchor is distinct from p_contract_anchor
  or (p_definition_id is not null and previous.metric_definition_id<>p_definition_id) or previous.version_no<>p_expected_version+1
  then raise exception 'definition_retry_conflict' using errcode='40001'; end if;
  return previous.id;
 end if;
 if p_definition_id is null then
  if p_expected_version<>0 then raise exception 'definition_revision_conflict' using errcode='40001'; end if;
  insert into public.metric_definitions(organization_id,dossier_id,dossier_reference,metric_key,kind,created_by) values(d.organization_id,d.id,d.id,p_metric_key,p_kind,auth.uid()) returning * into m;
 else
  select * into m from public.metric_definitions where organization_id=d.organization_id and id=p_definition_id for update;
  if not found or m.dossier_id<>d.id or m.metric_key<>p_metric_key or m.kind<>p_kind then raise exception 'definition_identity_mismatch' using errcode='23514'; end if;
 end if;
 select coalesce(max(version_no),0) into current_version from public.definition_versions where organization_id=d.organization_id and metric_definition_id=m.id;
 if current_version<>p_expected_version then raise exception 'definition_revision_conflict' using errcode='40001'; end if;
 insert into public.definition_versions(id,organization_id,metric_definition_id,version_no,definition,contract_source_version_id,contract_rights_version_id,contract_anchor,created_by)
 values(p_request_id,d.organization_id,m.id,current_version+1,p_definition,p_contract_source_version_id,rights,p_contract_anchor,auth.uid());
 return p_request_id;
end $$;