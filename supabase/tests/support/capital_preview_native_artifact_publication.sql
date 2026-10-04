begin;
set search_path='';
do $$declare core_source text;clone_source text;marker text;replacement text;role_name text;signature text;begin
 select prosrc into strict core_source from pg_proc where oid='private.create_artifact_revision_v1(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,bigint,jsonb,uuid,uuid,uuid,boolean)'::regprocedure;
 select prosrc into strict clone_source from pg_proc where oid='private.create_capital_preview_artifact_revision_v1(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,bigint,jsonb,uuid,uuid,uuid,boolean)'::regprocedure;
 if md5(core_source)<>'868467d82112dcafa2fb10198aa513ce'then raise exception 'preview_shared_artifact_core_changed';end if;
 marker:=E'begin\n if p_kind is distinct from ''work_product'' or p_origin is distinct from ''worker'' or p_audience is distinct from ''internal'' or p_legacy_ref is not null or p_lock_work is distinct from true or not private.capital_preview_revision_storage_allowed_v1(p_org,p_work,p_revision_id,p_rights_subject,p_subject,p_manifest,p_blocks,p_links,p_content_sha256,p_byte_length) then raise exception ''capital_preview_native_publication_denied'' using errcode=''42501'';end if;\n if p_org is null';
 if position(marker in clone_source)=0 then raise exception 'preview_publication_scope_guard_missing';end if;
 clone_source:=replace(clone_source,marker,E'begin\n if p_org is null');
 marker:='if jsonb_typeof(p_manifest#>''{bytes,storage}'')=''object'' and not private.capital_preview_revision_storage_allowed_v1(p_org,p_work,p_revision_id,p_rights_subject,p_subject,p_manifest,p_blocks,p_links,p_content_sha256,p_byte_length) and not exists(';
 replacement:='if jsonb_typeof(p_manifest#>''{bytes,storage}'')=''object'' and not exists(';
 if position(marker in clone_source)=0 then raise exception 'preview_publication_physical_guard_missing';end if;
 clone_source:=replace(clone_source,marker,replacement);
 marker:='or jsonb_typeof(p_manifest->''legacy'')=''object'' or private.capital_preview_revision_storage_allowed_v1(p_org,p_work,p_revision_id,p_rights_subject,p_subject,p_manifest,p_blocks,p_links,p_content_sha256,p_byte_length);';
 replacement:='or jsonb_typeof(p_manifest->''legacy'')=''object'';';
 if position(marker in clone_source)=0 then raise exception 'preview_publication_native_substance_missing';end if;
 clone_source:=replace(clone_source,marker,replacement);
 if clone_source is distinct from core_source then raise exception 'preview_publication_core_parity_lost';end if;
 foreach signature in array array['private.capital_preview_revision_storage_allowed_v1(uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,bigint)','private.create_capital_preview_artifact_revision_v1(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,bigint,jsonb,uuid,uuid,uuid,boolean)']loop
 foreach role_name in array array['anon','authenticated','service_role']loop
 if has_function_privilege(role_name,signature,'EXECUTE')then raise exception 'preview_publication_private_helper_exposed';end if;end loop;end loop;
 -- The original worker command has an invoker public wrapper: its private
 -- command grant is part of the existing contract, unlike owner-only helpers.
 if not has_function_privilege('authenticated','private.worker_commit_capital_preview_task_v1(uuid,text,uuid,uuid,uuid,text)','EXECUTE')
 or not has_function_privilege('authenticated','public.worker_commit_capital_preview_task_v1(uuid,text,uuid,uuid,uuid,text)','EXECUTE')
 or has_function_privilege('anon','private.worker_commit_capital_preview_task_v1(uuid,text,uuid,uuid,uuid,text)','EXECUTE')
 or has_function_privilege('service_role','private.worker_commit_capital_preview_task_v1(uuid,text,uuid,uuid,uuid,text)','EXECUTE')
 or has_function_privilege('anon','public.worker_commit_capital_preview_task_v1(uuid,text,uuid,uuid,uuid,text)','EXECUTE')
 or has_function_privilege('service_role','public.worker_commit_capital_preview_task_v1(uuid,text,uuid,uuid,uuid,text)','EXECUTE')
 or (select prosecdef from pg_proc where oid='public.worker_commit_capital_preview_task_v1(uuid,text,uuid,uuid,uuid,text)'::regprocedure)
 then raise exception 'preview_publication_original_command_acl_lost';end if;
 if private.capital_preview_revision_storage_allowed_v1(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'Preview fake','{}','[]','[]',repeat('a',64),1)then raise exception 'preview_publication_unbound_allowed';end if;
 begin
 perform private.create_capital_preview_artifact_revision_v1(gen_random_uuid(),gen_random_uuid(),'work_product','Preview fake','internal','worker','{}','[]','[]',repeat('a',64),1,null,null,null,gen_random_uuid(),true);
 raise exception 'preview_publication_unbound_writer_allowed';
 exception when insufficient_privilege then null;end;
end$$;
rollback;
