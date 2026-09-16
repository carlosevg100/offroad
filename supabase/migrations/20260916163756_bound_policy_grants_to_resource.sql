-- Stage 3 follow-up: explicit commands target the selected resource, not its siblings.
-- Replacing a legacy revocation is an explicit policy decision and must lose the old basis.
do $$ declare body text; begin
 select pg_get_functiondef('private.set_resource_policy_grant_v1(uuid,uuid,uuid,text,text,boolean,timestamp with time zone)'::regprocedure) into body;
 if position('values(org,root,' in body)=0 or position('do update set effect=excluded.effect,granted_by=' in body)=0 then raise exception 'policy_grant_scope_contract_changed'; end if;
 body:=replace(body,'values(org,root,','values(org,p_resource_id,');
 body:=replace(body,'do update set effect=excluded.effect,granted_by=','do update set effect=excluded.effect,grant_basis=''explicit'',granted_by=');
 execute body;
end $$;
