-- Qualify the stored message column; the function also declares conversation_id.
-- Preserve the complete reviewed transaction and fail closed if its definition drifts.
do $migration$
declare definition text:=pg_get_functiondef('private.start_provider_case_fit_project_v1(uuid,text,text,text,jsonb,uuid,uuid,text,jsonb)'::regprocedure);
 needle text:='update public.agent_messages set content=case p_locale';
begin
 if position(needle in definition)=0 or position('and conversation_id=original.conversation_id' in definition)=0 then raise exception 'case_fit_message_alias_drift'; end if;
 definition:=replace(definition,needle,'update public.agent_messages target_message set content=case p_locale');
 definition:=replace(definition,'where organization_id=project.organization_id and conversation_id=original.conversation_id','where target_message.organization_id=project.organization_id and target_message.conversation_id=original.conversation_id');
 execute definition;
end $migration$;
