-- A denied RPC rolls its transaction back. The transport records the decision in a
-- separate transaction, re-evaluating actual authority instead of trusting caller input.
set search_path='';
create or replace function private.record_artifact_access_denial_v1(p_revision uuid,p_receipt uuid)
returns void language plpgsql security definer set search_path=''as $$
declare r public.artifact_revisions;receipt public.artifact_export_receipts;allowed boolean;operation text;work uuid;
begin
 if auth.uid()is null or num_nonnulls(p_revision,p_receipt)<>1 then return;end if;
 if p_receipt is not null then
  select*into receipt from public.artifact_export_receipts where id=p_receipt;
  if receipt.id is null then return;end if;
  select*into r from public.artifact_revisions where organization_id=receipt.organization_id and id=receipt.revision_id;
  operation:='download';
 else
  select*into r from public.artifact_revisions where id=p_revision;
  operation:='read';
 end if;
 if r.id is null then return;end if;
 select a.work_id into work from public.artifacts a where a.organization_id=r.organization_id and a.id=r.artifact_id;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||r.organization_id::text,0));
 if operation='download'then
  allowed:=private.artifact_roundtrip_revision_allowed_v1(r.organization_id,r.id,auth.uid(),true);
 else
  allowed:=private.can_access_resource_v1(r.organization_id,work,'read');
 end if;
 if not coalesce(allowed,false)then
  perform private.append_sensitive_operation_v1(r.organization_id,work,r.id,operation,false);
 end if;
 -- Always void, including nonexistent resources; no success receipt can be forged.
end;$$;
