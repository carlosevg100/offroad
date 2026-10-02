-- Pre-product cut: experiments without native capture are not a writable
-- approval path. Actual plan/package commands apply their projections directly.
set search_path='';
create or replace function private.record_deal_state_object(p_organization_id uuid,p_session_id uuid,p_object_type text,p_status text,p_input_fingerprint text,p_payload jsonb,p_dependencies jsonb default '[]')
returns uuid language plpgsql volatile security definer set search_path='' as $$
begin
 if p_object_type in('production_plan','package_review','release_authorization') then
  raise exception 'material_native_review_required' using errcode='42501';
 end if;
 return private.record_deal_state_object_pre_material_native_v1(p_organization_id,p_session_id,p_object_type,p_status,p_input_fingerprint,p_payload,p_dependencies);
end$$;
revoke all on function private.record_deal_state_object(uuid,uuid,text,text,text,jsonb,jsonb) from public,anon,service_role;
grant execute on function private.record_deal_state_object(uuid,uuid,text,text,text,jsonb,jsonb) to authenticated;
