-- The project-context DTO must not bypass the template's own resource/vault reader.
set search_path='';
do $$ declare body text;begin
 select pg_get_functiondef('private.read_presentation_template_v1(uuid)'::regprocedure)into body;
 if position('and t.capital_project_id is null and t.retired_at is null;'in body)=0 or position('and t.capital_project_id = project.id and t.retired_at is null;'in body)=0 then raise exception 'template_context_definition_changed';end if;
 body:=replace(body,'and t.capital_project_id is null and t.retired_at is null;','and t.capital_project_id is null and t.retired_at is null and private.can_read_presentation_template_v1(t.organization_id,t.id);');
 body:=replace(body,'and t.capital_project_id = project.id and t.retired_at is null;','and t.capital_project_id = project.id and t.retired_at is null and private.can_read_presentation_template_v1(t.organization_id,t.id);');
 execute body;
end;$$;
