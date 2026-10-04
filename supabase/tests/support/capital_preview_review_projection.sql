-- Run after a genuine cold-stack preview producer and public human review.
-- No native rows, model outcomes or authority receipts are manufactured here.
begin;
do $$declare helper regprocedure;role_name text;begin
 foreach helper in array array['private.project_capital_preview_artifact_review_v1()'::regprocedure,
 'private.artifact_review_preparer_v1(public.artifact_revisions)'::regprocedure,
 'private.artifact_review_preparer_before_preview_projection_v1(public.artifact_revisions)'::regprocedure]loop
  if not(select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid=helper)then raise exception 'preview_review_helper_security_invalid';end if;
  foreach role_name in array array['anon','authenticated','service_role']loop
   if has_function_privilege(role_name,helper,'EXECUTE')then raise exception 'preview_review_helper_api_granted';end if;
  end loop;
  if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))acl where p.oid=helper and acl.grantee=0 and acl.privilege_type='EXECUTE')then raise exception 'preview_review_helper_public_granted';end if;
 end loop;
 if not exists(select 1 from pg_trigger where tgrelid='public.artifact_reviews'::regclass and tgname='capital_preview_artifact_review_bridge' and tgfoid='private.project_capital_preview_artifact_review_v1()'::regprocedure and not tgisinternal)then raise exception 'preview_review_bridge_missing';end if;
 if not has_function_privilege('authenticated','public.decide_capital_project_artifact_v2(uuid,uuid,uuid,text,text,text,text,boolean,uuid)','EXECUTE')then raise exception 'preview_review_public_command_removed';end if;
end $$;
rollback;
