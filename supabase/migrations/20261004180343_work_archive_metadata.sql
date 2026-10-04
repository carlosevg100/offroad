-- Pure persistent work must satisfy the same archive metadata invariant as intake-backed work.
-- One guarded statement repair; authority, intake delegation, job closure, ACL and history stay intact.
set search_path='';
do $repair$
declare body text; ddl text; before_acl aclitem[]; after_acl aclitem[];
begin
 select p.prosrc,p.proacl into body,before_acl from pg_proc p where p.oid='private.manage_work_v1(uuid,text,text)'::regprocedure;
 if md5(body)<>'f8357632e01ad6cb189d1d31f028758f' then raise exception 'work_archive_source_contract_changed';end if;
 if length(body)-length(replace(body,'update public.capital_projects set status=''archived'',updated_at=now() where id=p.id;',''))<>length('update public.capital_projects set status=''archived'',updated_at=now() where id=p.id;') then raise exception 'work_archive_writer_contract_changed';end if;
 ddl:=pg_get_functiondef('private.manage_work_v1(uuid,text,text)'::regprocedure);
 ddl:=replace(ddl,'update public.capital_projects set status=''archived'',updated_at=now() where id=p.id;','update public.capital_projects set status=''archived'',archived_at=now(),archived_by=auth.uid(),updated_at=now() where id=p.id;');
 execute ddl;
 select p.proacl into after_acl from pg_proc p where p.oid='private.manage_work_v1(uuid,text,text)'::regprocedure;
 if before_acl is distinct from after_acl then raise exception 'work_archive_acl_changed';end if;
end $repair$;
