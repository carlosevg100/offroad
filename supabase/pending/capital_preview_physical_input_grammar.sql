-- Forward correction of preview request grammar only. Original applied SQL is immutable.
-- The retained serialized JSON still has its existing 1MiB physical ceiling.
-- Text UTF8 bytes are measured independently: no JSON/text equivalence is assumed.
-- Models, prices, request/prompt/policy pins, 600k shared exposure and 4 claims remain fixed.
set search_path='';
do $$declare definition text;source text;begin
 select pg_get_functiondef(p.oid),p.prosrc into strict definition,source from pg_proc p where p.oid='private.capital_preview_dispatch_policy_v1(text,text,bigint)'::regprocedure;
 if md5(source)<>'0618124f0787f9082e4f9f238c550519' or length(source)-length(replace(source,'p_input_bytes not between 1 and 100000',''))<>length('p_input_bytes not between 1 and 100000')then raise exception 'capital_preview_input_forward_source_changed';end if;
 execute replace(definition,'p_input_bytes not between 1 and 100000','p_input_bytes not between 1 and 1048576');
 select pg_get_functiondef(p.oid),p.prosrc into strict definition,source from pg_proc p where p.oid='private.worker_seal_capital_preview_boundary_v1(uuid,text,uuid,uuid,jsonb,jsonb,text)'::regprocedure;
 if md5(source)<>'59e69911d9a0542328442b8e81c699c9' or length(source)-length(replace(source,'input_bytes not between 1 and 100000',''))<>length('input_bytes not between 1 and 100000')then raise exception 'capital_preview_input_forward_source_changed';end if;
 execute replace(definition,'input_bytes not between 1 and 100000','input_bytes not between 1 and 1048576');
 if not exists(select 1 from pg_constraint where conrelid='private.capital_preview_recipe_seals'::regclass and conname='capital_preview_recipe_seals_input_bytes_check' and pg_get_constraintdef(oid)='CHECK (((input_bytes >= 1) AND (input_bytes <= 100000)))')then raise exception 'capital_preview_input_forward_constraint_changed';end if;
 alter table private.capital_preview_recipe_seals drop constraint capital_preview_recipe_seals_input_bytes_check;
 alter table private.capital_preview_recipe_seals add constraint capital_preview_recipe_seals_input_bytes_check check(input_bytes between 1 and 1048576);
end$$;
-- CREATE OR REPLACE keeps the exact current worker-wrapper grants. The policy registry remains owner-only.
revoke all on function private.capital_preview_dispatch_policy_v1(text,text,bigint) from public,anon,authenticated,service_role;
