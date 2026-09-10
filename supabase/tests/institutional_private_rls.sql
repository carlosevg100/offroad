begin;
do $$
declare relation regclass; command "char"; matching integer;
begin
 foreach relation in array array['private.institutional_model_configurations'::regclass,'private.institutional_information_request_bindings'::regclass] loop
  if not exists(select 1 from pg_class where oid=relation and relrowsecurity and relforcerowsecurity) then raise exception 'institutional private RLS must remain enabled and forced';end if;
  if has_table_privilege('authenticated',relation,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('anon',relation,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'private table privilege unexpectedly granted';end if;
  foreach command in array array['r'::"char",'a'::"char",'w'::"char",'d'::"char"] loop
   select count(*) into matching from pg_policy where polrelid=relation and polcmd=command and polroles=array[(select oid from pg_roles where rolname='authenticated')]
     and (command not in ('r','w','d') or pg_get_expr(polqual,polrelid)='false')
     and (command not in ('a','w') or pg_get_expr(polwithcheck,polrelid)='false');
   if matching<>1 then raise exception 'missing explicit deny-all policy for % command %',relation,command;end if;
  end loop;
 end loop;
 if not has_function_privilege('authenticated','public.worker_load_institutional_configuration_v1(uuid,text)','EXECUTE') then raise exception 'scoped RPC access unexpectedly removed';end if;
end $$;
rollback;
