-- Read-only function hashes from the installed catalogue, not hashes inferred from migration SQL.
-- The collector records run/commit or confirmed Supabase project identity separately.
select jsonb_build_object(
  'schemaVersion','artifact-roundtrip-functions.2026.10.05-v1',
  'captured_at',clock_timestamp(),
  'functions',(select coalesce(jsonb_agg(jsonb_build_object(
    'id','function:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
    'schema',n.nspname,'name',p.proname,
    'definitionSha256',encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')
  ) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'[]'::jsonb)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind='f')
) as function_catalogue;
