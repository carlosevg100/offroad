-- Export purpose also requires the explicit export operation in pinned and current rights.
create or replace function private.vault_reference_allowed_v1(p_org uuid,p_version uuid,p_purpose text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare v public.vault_entry_versions; k text; d record; op text;
begin
 select * into v from public.vault_entry_versions where organization_id=p_org and id=p_version;
 if v.id is null or not private.workspace_context_matches_v1(p_org) or p_purpose not in ('analysis','retrieval','publication','export') then return false;end if;
 select kind into k from public.vault_entries where organization_id=p_org and id=v.entry_id;
 if v.source_version_id is not null and not exists(select 1 from private.vault_source_dependencies where organization_id=p_org and version_id=v.id and source_version_id=v.source_version_id) then return false;end if;
 if v.source_version_id is not null and not private.source_use_allowed_v1(p_org,v.source_version_id,auth.uid(),'read',p_purpose) then return false;end if;
 if v.assumption_version_id is not null and not private.can_read_assumption_version_v1(p_org,v.assumption_version_id) then return false;end if;
 if v.presentation_template_id is not null and not exists(select 1 from public.presentation_templates t where t.organization_id=p_org and t.id=v.presentation_template_id and t.fingerprint=v.reference_fingerprint
 and (t.capital_project_id is null or private.can_access_resource_v1(p_org,t.capital_project_id,'read'))) then return false;end if;
 for d in select * from private.vault_source_dependencies where organization_id=p_org and version_id=p_version loop
  foreach op in array (case when k='source' then array['read','store'] else array['read','store','derive'] end || case when p_purpose='export' then array['export'] else '{}'::text[] end) loop
   if not exists(select 1 from private.source_rights_versions r where r.organization_id=p_org and r.id=d.rights_version_id and r.source_version_id=d.source_version_id
    and op=any(r.operations) and p_purpose=any(r.purposes) and r.valid_from<=clock_timestamp()
    and (r.expires_at is null or r.expires_at>clock_timestamp()) and (r.store_until is null or r.store_until>clock_timestamp()))
    or not private.source_use_allowed_v1(p_org,d.source_version_id,auth.uid(),op,p_purpose) then return false;end if;
  end loop;
 end loop;
 return true;
end $$;

create or replace function private.publish_vault_entry_v1(p_request_id uuid,p_publication_id uuid,p_reviewed_fingerprint text)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=private.require_vault_actor_v1();r public.vault_publication_requests;v public.vault_entry_versions;e public.vault_entries;prior public.vault_publications;active uuid;reader record;d record;purpose text;op text;begin
 if p_publication_id is null then raise exception 'vault_publication_invalid' using errcode='22023';end if;
 select * into r from public.vault_publication_requests where organization_id=org and id=p_request_id;
 if r.id is null or not private.can_access_resource_v1(org,r.entry_id,'read') or not private.evaluate_resource_policy_v1(org,r.entry_id,auth.uid(),'publish','publication') then raise exception 'vault_publication_denied' using errcode='42501';end if;
 select * into v from public.vault_entry_versions where organization_id=org and id=r.version_id;
 if p_reviewed_fingerprint is null or p_reviewed_fingerprint<>r.review_fingerprint or v.content_fingerprint<>r.version_fingerprint then raise exception 'vault_review_stale' using errcode='40001';end if;
 select * into prior from public.vault_publications where id=p_publication_id or (organization_id=org and request_id=r.id) order by id=p_publication_id desc limit 1;
 if found then
  if prior.organization_id<>org or prior.request_id<>r.id then raise exception 'vault_request_reused' using errcode='22023';end if;
  -- An active retry is idempotent; a withdrawn act requires a new human review.
  if prior.withdrawn_at is not null then raise exception 'vault_publication_withdrawn' using errcode='40001';end if;
  return prior.id;
 end if;
 select * into e from public.vault_entries where organization_id=org and id=r.entry_id for update;
 select id into active from public.vault_publications where organization_id=org and entry_id=e.id and withdrawn_at is null;
 if e.head_version_id<>v.id or active is distinct from r.expected_publication_id then raise exception 'vault_review_stale' using errcode='40001';end if;
 if r.work_scope_id is not null and not exists(select 1 from public.capital_projects where organization_id=org and id=r.work_scope_id and status<>'archived' and private.can_access_resource_v1(org,id,'work')) then raise exception 'vault_scope_denied' using errcode='42501';end if;
 if not private.vault_reference_allowed_v1(org,v.id,'publication') or not private.vault_reference_allowed_v1(org,v.id,r.purpose) then raise exception 'vault_publication_rights_denied' using errcode='42501';end if;
 -- Current audience is checked before disclosure. Later grants never confer source rights.
 for reader in select p.user_id from private.principals p where p.organization_id=org and p.kind='human' and p.revoked_at is null
 and private.evaluate_resource_policy_v1(org,e.id,p.user_id,'read','retrieval')
 and (r.work_scope_id is null or private.evaluate_resource_policy_v1(org,r.work_scope_id,p.user_id,'read','retrieval')) loop
  for d in select * from private.vault_source_dependencies where organization_id=org and version_id=v.id loop
   foreach purpose in array array['publication',r.purpose] loop
    foreach op in array (case when e.kind='source' then array['read','store'] else array['read','store','derive'] end || case when purpose='export' then array['export'] else '{}'::text[] end) loop
     if not private.source_use_allowed_v1(org,d.source_version_id,reader.user_id,op,purpose) then raise exception 'vault_audience_rights_denied' using errcode='42501';end if;
    end loop;
   end loop;
  end loop;
 end loop;
 if active is not null then update public.vault_publications set withdrawn_by=auth.uid(),withdrawn_at=clock_timestamp(),withdrawal_reason='Superseded by explicitly reviewed publication '||p_publication_id::text where organization_id=org and id=active;end if;
 insert into public.vault_publications(id,organization_id,entry_id,request_id,published_by) values(p_publication_id,org,e.id,r.id,auth.uid());
 return p_publication_id;
end $$;
