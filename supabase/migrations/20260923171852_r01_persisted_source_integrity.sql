-- Stage 17 / 3L: validate persisted digests and serialize history mutation.
-- No automatic digest repair, new grant, receipt binding or R01 activation.
set search_path='';
alter table private.receivables_evidence_fragments
 add constraint receivables_fragment_payload_digest_matches
 check(payload_sha256=encode(extensions.digest(compressed_payload,'sha256'),'hex'));
alter table private.receivables_method_supplement_patches
 add constraint receivables_patch_digest_matches
 check(patch_fingerprint=encode(extensions.digest(convert_to(patch::text,'UTF8'),'sha256'),'hex'));
alter table private.receivables_method_supplement_drafts
 add constraint receivables_draft_digest_matches
 check(draft_fingerprint=encode(extensions.digest(convert_to(draft::text,'UTF8'),'sha256'),'hex'));

create function private.guard_receivables_history_mutation_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare org uuid; sess uuid; project uuid;
begin
 if tg_op='DELETE' then org:=old.organization_id;sess:=old.intake_session_id;
 else org:=new.organization_id;sess:=new.intake_session_id;
  if tg_op='UPDATE' then
   if (new.id,new.organization_id,new.intake_session_id,new.capital_project_id,new.source_dataset_hash)
    is distinct from (old.id,old.organization_id,old.intake_session_id,old.capital_project_id,old.source_dataset_hash)
   then raise exception 'receivables_history_identity_immutable' using errcode='42501';end if;
   if tg_table_name='receivables_method_supplement_patches' then
    if (new.processing_run_id,new.processing_job_id,new.patch_id)
     is distinct from (old.processing_run_id,old.processing_job_id,old.patch_id)
    then raise exception 'receivables_history_identity_immutable' using errcode='42501';end if;
   else
    if (new.revision,new.caused_by_patch_id) is distinct from (old.revision,old.caused_by_patch_id)
    then raise exception 'receivables_history_identity_immutable' using errcode='42501';end if;
   end if;
  end if;
 end if;
 -- A row trigger may already hold a tuple lock. Never wait for its parent after that.
 select capital_project_id into project from public.document_intake_sessions
 where organization_id=org and id=sess for update nowait;
 if tg_op<>'DELETE' and (not found or project is distinct from new.capital_project_id)
 then raise exception 'receivables_history_scope_invalid' using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=org and id=project for update nowait;
 -- DELETE may come from an existing parent cascade; an absent parent is not resurrected.
 if tg_op='DELETE' then return old;else return new;end if;
exception when lock_not_available then
 raise exception 'receivables_history_concurrent_change' using errcode='40001';
end $$;
revoke all on function private.guard_receivables_history_mutation_v1() from public,anon,authenticated,service_role;
create trigger receivables_patch_history_guard before insert or update or delete
 on private.receivables_method_supplement_patches for each row execute function private.guard_receivables_history_mutation_v1();
create trigger receivables_draft_history_guard before insert or update or delete
 on private.receivables_method_supplement_drafts for each row execute function private.guard_receivables_history_mutation_v1();

create or replace function private.lock_receivables_scope_fragment() returns trigger
language plpgsql security definer set search_path='' as $$
declare org uuid; sess uuid; project uuid;
begin
 if tg_op='DELETE' then org:=old.organization_id;sess:=old.intake_session_id;
 else org:=new.organization_id;sess:=new.intake_session_id;
  if tg_op='UPDATE' and (new.organization_id,new.intake_session_id,new.source_document_id,new.document_version,new.processing_run_id)
   is distinct from (old.organization_id,old.intake_session_id,old.source_document_id,old.document_version,old.processing_run_id)
  then raise exception 'receivables_fragment_identity_immutable' using errcode='42501';end if;
 end if;
 select capital_project_id into project from public.document_intake_sessions where organization_id=org and id=sess for update nowait;
 perform 1 from public.capital_projects where organization_id=org and id=project for update nowait;
 if tg_op='DELETE' then return old;else return new;end if;
exception when lock_not_available then
 raise exception 'receivables_fragment_concurrent_change' using errcode='40001';
end $$;
