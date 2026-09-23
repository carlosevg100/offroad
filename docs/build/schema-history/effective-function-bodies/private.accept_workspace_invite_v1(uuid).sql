CREATE OR REPLACE FUNCTION private.accept_workspace_invite_v1(p_invite_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare invite public.organization_invites; caller uuid := auth.uid(); recipient_hash bytea;
begin
 select extensions.digest(lower(btrim(email)),'sha256') into recipient_hash from auth.users where id=caller and email_confirmed_at is not null;
 select * into invite from public.organization_invites where id=p_invite_id and email_hash=recipient_hash for update;
 if invite.id is null then raise exception 'invitation_unavailable' using errcode='42501'; end if;
 if invite.status='accepted' and invite.accepted_by=caller and private.is_org_member(invite.organization_id) then return invite.organization_id; end if;
 if invite.status<>'pending' or invite.expires_at<=now() or not exists(
  select 1 from public.organization_memberships m where m.organization_id=invite.organization_id and m.user_id=invite.invited_by and m.status='active'
  and (m.role='owner' or (m.role='admin' and invite.role not in ('owner','admin')))
 ) or invite.role='owner' then raise exception 'invitation_unavailable' using errcode='42501'; end if;
 if exists(select 1 from public.organization_memberships where organization_id=invite.organization_id and user_id=caller) then
  raise exception 'membership_requires_administrator' using errcode='42501';
 end if;
 insert into public.organization_memberships(organization_id,user_id,role,status) values(invite.organization_id,caller,invite.role,'active');
 update public.organization_invites set status='accepted',accepted_by=caller where id=invite.id;
 -- Joining an existing workspace does not redo the founder's institutional onboarding.
 insert into public.onboarding_progress(organization_id,user_id,journey,current_step,completed_at)
 select invite.organization_id,caller,case when organization_type='capital_provider' then 'capital_provider' when organization_type='company' then 'company' else 'originator' end,'completed',now()
 from public.organizations where id=invite.organization_id and organization_type in ('company','originator','capital_provider');
 return invite.organization_id;
end $function$
