-- Metadata-only receipts at accepted command boundaries; keep existing immutable history.
set search_path='';
create or replace function private.append_sensitive_operation_v1(p_org uuid,p_resource uuid,p_version uuid,p_operation text,p_allowed boolean,p_actor uuid default auth.uid())
returns void language plpgsql security definer set search_path=''as $$declare policy text;begin
 if p_operation not in('read','search','processing','download','publication','review','administration')then raise exception 'audit_operation_invalid'using errcode='22023';end if;
 policy:=encode(extensions.digest(jsonb_build_object('version','resource-policy.v22','organization',p_org,'resource',p_resource,
  'actor',p_actor,'decision',coalesce(p_allowed,false),'authorityRevision',coalesce((select max(d.audit_event_id)from private.domain_events d where d.organization_id=p_org),0),'operation',p_operation,'rule',coalesce((select jsonb_agg(jsonb_build_array(r.id,r.revision)order by r.revision,r.id)from private.retention_rules r where r.organization_id=p_org and r.resource_id=p_resource),'[]'))::text,'sha256'),'hex');
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(p_org,p_actor,p_operation||case when coalesce(p_allowed,false) then '.allowed'else '.denied'end,'resource',p_resource::text,
  jsonb_build_object('schemaVersion','sensitive-operation.v1','resourceVersionId',p_version,'policyVersion','resource-policy.v22','policyFingerprint',policy,'result',case when coalesce(p_allowed,false) then 'allow'else 'deny'end));
end;$$;

create function private.capture_lifecycle_command_operation_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 org uuid;resource uuid;version uuid;actor uuid;operation text:=tg_argv[0];
begin
 org:=(row_data->>'organization_id')::uuid;
 if org is null then return case when tg_op='DELETE' then old else new end;end if;
 actor:=auth.uid();
 if tg_table_name='artifact_reviews' then
  resource:=(row_data->>'work_id')::uuid;version:=(row_data->>'revision_id')::uuid;actor:=(row_data->>'reviewer_id')::uuid;
 elsif tg_table_name='vault_publications' then
  resource:=(row_data->>'entry_id')::uuid;
  select r.version_id into version from public.vault_publication_requests r where r.organization_id=org and r.id=(row_data->>'request_id')::uuid;
  actor:=case when tg_op='UPDATE' then (row_data->>'withdrawn_by')::uuid else (row_data->>'published_by')::uuid end;
 elsif tg_table_name='method_releases' then
  if tg_op='INSERT' and row_data->>'status'<>'published' then return new;end if;
  if tg_op='UPDATE' and to_jsonb(new)->>'status' is not distinct from to_jsonb(old)->>'status' then return new;end if;
  resource:=(row_data->>'scope_id')::uuid;version:=(row_data->>'id')::uuid;
  actor:=coalesce(auth.uid(),(row_data->>'published_by')::uuid);
 else
  resource:=coalesce((row_data->>'resource_id')::uuid,org);version:=(row_data->>'id')::uuid;
 end if;
 perform private.append_sensitive_operation_v1(org,resource,version,operation,true,actor);
 return case when tg_op='DELETE' then old else new end;
end;$$;
revoke all on function private.capture_lifecycle_command_operation_v1() from public,anon,authenticated,service_role;
create trigger lifecycle_review_operation after insert on public.artifact_reviews for each row execute function private.capture_lifecycle_command_operation_v1('review');
create trigger lifecycle_vault_publication_operation after insert or update on public.vault_publications for each row execute function private.capture_lifecycle_command_operation_v1('publication');
create trigger lifecycle_method_publication_operation after insert or update on public.method_releases for each row execute function private.capture_lifecycle_command_operation_v1('publication');
create trigger lifecycle_retention_admin_operation after insert on private.retention_rules for each row execute function private.capture_lifecycle_command_operation_v1('administration');
create trigger lifecycle_hold_admin_operation after insert or update on private.legal_holds for each row execute function private.capture_lifecycle_command_operation_v1('administration');
create trigger lifecycle_membership_admin_operation after insert or update or delete on public.organization_memberships for each row execute function private.capture_lifecycle_command_operation_v1('administration');
create trigger lifecycle_grant_admin_operation after insert or update or delete on private.resource_access_grants for each row execute function private.capture_lifecycle_command_operation_v1('administration');
