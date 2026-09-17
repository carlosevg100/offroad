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
 if jsonb_typeof(p_payload->'fieldPath')<>'string' or length(btrim(p_payload->>'fieldPath')) not between 1 and 300
 or exists(select 1 from jsonb_each(dimensions) item where jsonb_typeof(item.value) not in ('string','null'))
 or (dimensions->>'perimeter' is not null and length(btrim(dimensions->>'perimeter')) not between 1 and 300)
 or (dimensions->>'unit' is not null and length(btrim(dimensions->>'unit')) not between 1 and 80)
 or (dimensions->>'scenario' is not null and length(btrim(dimensions->>'scenario')) not between 1 and 160)
 or (dimensions->>'scale' is not null and dimensions->>'scale' !~ '^(?:[1-9][0-9]*(?:\.[0-9]+)?|0\.[0-9]*[1-9][0-9]*)$')
 or (dimensions->>'periodStart' is not null and not private.valid_observation_value_v1('date',dimensions->'periodStart'))
 or (dimensions->>'periodEnd' is not null and not private.valid_observation_value_v1('date',dimensions->'periodEnd'))
 then raise exception 'invalid_observation_dimensions' using errcode='22023'; end if;
 source_id:=(p_payload->>'sourceVersionId')::uuid;
 rights_id:=private.require_observation_source_v1(d.organization_id,source_id);
 definition_id:=(dimensions->>'definitionVersionId')::uuid;
 if definition_id is not null and not private.can_read_definition_version_v1(d.organization_id,definition_id) then raise exception 'definition_access_denied' using errcode='42501'; end if;
 if p_payload->>'supersedesId' is not null and not private.can_read_observation_v1(d.organization_id,(p_payload->>'supersedesId')::uuid) then raise exception 'observation_access_denied' using errcode='42501'; end if;
 value_kind:=p_payload->'value'->>'type'; value:=p_payload->'value'->'value';
 if jsonb_typeof(p_payload->'value')<>'object' or (p_payload->'value')-array['type','value']<>'{}'::jsonb or value is null
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