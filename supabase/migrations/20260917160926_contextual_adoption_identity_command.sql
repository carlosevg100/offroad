-- An explicitly reviewed local identity is reusable on retries; never infer one from a name.
set search_path='';
create function private.ensure_basis_entity_v1(p_dossier_id uuid,p_name text,p_namespace text,p_value text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.dossiers; found_id uuid; found_name text;
begin
 d:=private.require_dossier_v1(p_dossier_id,'work');
 perform 1 from public.dossiers where id=d.id for update;
 if p_namespace is null or p_value is null or p_name is null or p_reason is null or length(btrim(p_reason)) not between 5 and 2000 then raise exception 'identity_review_required' using errcode='22023'; end if;
 select e.id,e.legal_name into found_id,found_name from public.entities e join public.entity_identifiers i on i.entity_id=e.id
 where e.organization_id=d.organization_id and e.origin_dossier_id=d.id and i.namespace=p_namespace and i.value=p_value
 and i.review_state='reviewed' and i.valid_until is null order by e.id limit 1;
 if found_id is not null then
  if found_name is distinct from btrim(p_name) then raise exception 'identity_review_conflict' using errcode='40001'; end if;
  return found_id;
 end if;
 return private.review_dossier_identity_v1(d.id,null,p_name,p_namespace,p_value,p_reason);
end $$;
revoke all on function private.ensure_basis_entity_v1(uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.ensure_basis_entity_v1(uuid,text,text,text,text) to authenticated;
create function public.ensure_basis_entity_v1(p_dossier_id uuid,p_name text,p_namespace text,p_value text,p_reason text) returns uuid language sql security invoker set search_path='' as $$ select private.ensure_basis_entity_v1(p_dossier_id,p_name,p_namespace,p_value,p_reason); $$;
revoke all on function public.ensure_basis_entity_v1(uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.ensure_basis_entity_v1(uuid,text,text,text,text) to authenticated;
