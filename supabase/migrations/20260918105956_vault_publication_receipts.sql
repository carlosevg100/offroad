-- Publishers can withdraw a no-longer-readable publication without recovering restricted
-- content. This receipt contains only act identifiers and timestamps; content stays gated.
create function private.list_vault_publication_receipts_v1(p_offset integer default 0) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare org uuid:=private.vault_reader_org_v1();rows jsonb;begin
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'vault_page_invalid' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into rows from (
  select p.id publication_id,p.entry_id,p.published_at,p.withdrawn_at,v.revision,
   case when private.can_read_vault_version_v1(org,v.id) then v.title else null end title,
   private.can_read_vault_version_v1(org,v.id) available
  from public.vault_publications p join public.vault_publication_requests r on r.organization_id=p.organization_id and r.id=p.request_id
  join public.vault_entry_versions v on v.organization_id=r.organization_id and v.id=r.version_id
  where p.organization_id=org and private.can_access_resource_v1(org,p.entry_id,'read')
   and private.evaluate_resource_policy_v1(org,p.entry_id,auth.uid(),'publish','publication')
  order by p.published_at desc,p.id limit 26 offset p_offset
 ) q;return jsonb_build_object('rows',rows,'offset',p_offset);
end $$;
create function public.list_vault_publication_receipts_v1(p_offset integer default 0) returns jsonb
language sql security invoker set search_path='' as $$select private.list_vault_publication_receipts_v1(p_offset);$$;
revoke all on function private.list_vault_publication_receipts_v1(integer),public.list_vault_publication_receipts_v1(integer) from public,anon,authenticated,service_role;
grant execute on function private.list_vault_publication_receipts_v1(integer),public.list_vault_publication_receipts_v1(integer) to authenticated;
