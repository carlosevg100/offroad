-- Legacy direct writes must not treat a read grant as permission to change a case.
create function private.can_work_intake_session_v1(p_organization_id uuid,p_session_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 select private.can_access_resource_v1(p_organization_id,p_session_id,'work');
$$;
revoke all on function private.can_work_intake_session_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_work_intake_session_v1(uuid,uuid) to authenticated;
do $$ declare p record; clause text; changed integer:=0; begin
 for p in select * from pg_policies where schemaname='public'
 and tablename in ('extraction_feedback','intake_field_candidates','intake_issues','sounding_events','sounding_investors','soundings')
 and cmd in ('INSERT','UPDATE','DELETE')
 loop
  clause:='';
  if p.qual is not null then clause:=clause||' using ('||replace(p.qual,'private.can_access_intake_session(','private.can_work_intake_session_v1(')||')'; end if;
  if p.with_check is not null then clause:=clause||' with check ('||replace(p.with_check,'private.can_access_intake_session(','private.can_work_intake_session_v1(')||')'; end if;
  execute format('alter policy %I on public.%I%s',p.policyname,p.tablename,clause);
  changed:=changed+1;
 end loop;
 if changed<>14 then raise exception 'legacy_write_policy_inventory_changed: %',changed; end if;
end $$;
