CREATE OR REPLACE FUNCTION private.manage_work_v1(p_work_id uuid, p_action text, p_title text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.capital_projects; session_id uuid; title text:=btrim(regexp_replace(coalesce(p_title,''),'\s+',' ','g'));
begin
 if p_action is null or p_action not in ('rename','archive') then raise exception 'invalid_project_action' using errcode='22023'; end if;
 perform private.require_resource_access_v1(p_work_id,case when p_action='archive' then 'manage' else 'work' end);
 select * into strict p from public.capital_projects where id=p_work_id for update;
 select id into session_id from public.document_intake_sessions where organization_id=p.organization_id and capital_project_id=p.id order by created_at,id limit 1;
 if found then return private.manage_workspace_project(session_id,p_action,p_title); end if;
 if p_action='rename' then
  if p.status='archived' then raise exception 'project_archived' using errcode='55000'; end if;
  if length(title) not between 2 and 80 then raise exception 'invalid_project_name' using errcode='22023'; end if;
  update public.capital_projects set project_name=title,updated_at=now() where id=p.id;
  return jsonb_build_object('workId',p.id,'action','renamed','project_name',title);
 end if;
 update public.processing_jobs set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null
 where organization_id=p.organization_id and work_id=p.id and kind='work_conversation' and status in ('queued','leased');
 update public.processing_runs set status='cancelled',completed_at=now() where organization_id=p.organization_id and work_id=p.id and intake_session_id is null and status in ('queued','running');
 update public.capital_projects set status='archived',archived_at=now(),archived_by=auth.uid(),updated_at=now() where id=p.id;
 return jsonb_build_object('workId',p.id,'action','archived');
exception when unique_violation then raise exception 'project_name_already_in_use' using errcode='23505';
end $function$
