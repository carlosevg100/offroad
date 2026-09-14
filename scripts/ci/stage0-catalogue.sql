select jsonb_build_object('captured_at', clock_timestamp(), 'objects', (
select jsonb_agg(o order by o->>'id') from (
select jsonb_build_object('id', c.relkind::text||':'||n.nspname||'.'||c.relname,'kind',case when c.relkind in ('r','p') then 'table' else 'view' end,'schema',n.nspname,'name',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'grants',coalesce((select jsonb_agg(jsonb_build_array(case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end,a.privilege_type,a.is_grantable) order by a.grantee,a.privilege_type) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a),'[]'::jsonb)) o
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p','v','m')
union all
select jsonb_build_object('id','function:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')','kind','function','schema',n.nspname,'name',p.proname,'signature',pg_get_function_identity_arguments(p.oid),'security_definer',p.prosecdef,'settings',coalesce(to_jsonb(p.proconfig),'[]'::jsonb),'grants',coalesce((select jsonb_agg(jsonb_build_array(case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end,a.privilege_type,a.is_grantable) order by a.grantee,a.privilege_type) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),'[]'::jsonb))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'
union all
select jsonb_build_object('id','policy:'||schemaname||'.'||tablename||'.'||policyname,'kind','policy','schema',schemaname,'name',policyname,'table',tablename,'command',cmd,'roles',to_jsonb(roles),'permissive',permissive,'qual',qual,'with_check',with_check)
from pg_policies where schemaname in ('public','private','storage')
union all
select jsonb_build_object('id','trigger:'||n.nspname||'.'||c.relname||'.'||t.tgname,'kind','trigger','schema',n.nspname,'name',t.tgname,'table',c.relname,'enabled',t.tgenabled,'function',pn.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')','definition',pg_get_triggerdef(t.oid))
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace where not t.tgisinternal and n.nspname in ('public','private')
) z)) as catalogue;
