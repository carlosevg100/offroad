-- Read-only production verification: no synthetic records and no business mutations.
begin read only;
do $verify$
declare membership record; verified integer:=0;
begin
  perform set_config('request.jwt.claims','{}',true);
  for membership in select organization_id,user_id from public.organization_memberships where role='owner' and status='active' loop
    perform set_config('request.jwt.claim.sub',membership.user_id::text,true);
    execute 'set local role authenticated';
    if not private.can_manage_organization(membership.organization_id) then
      raise exception 'Active owner lost management authority';
    end if;
    begin
      perform public.create_organization_with_owner_v1('offroad','Read-only validation');
      raise exception 'Internal organization type was not rejected';
    exception when invalid_parameter_value then null; end;
    begin
      perform public.transfer_organization_owner_v1(membership.organization_id,membership.user_id);
      raise exception 'Self-transfer was not rejected';
    exception when invalid_parameter_value then null; end;
    perform set_config('request.jwt.claim.sub','',true);
    if private.can_manage_organization(membership.organization_id) then
      raise exception 'Missing identity retained organization authority';
    end if;
    begin
      perform public.create_organization_with_owner_v1('company','Read-only validation');
      raise exception 'Missing identity reached organization bootstrap';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
    verified:=verified+1;
  end loop;
  if verified=0 then raise exception 'No real active ownership available for read-only verification'; end if;
end $verify$;
select 'active_organization_authority_production_read_only: PASS' as result;
rollback;
