CREATE OR REPLACE FUNCTION private.capture_authority_domain_event_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare before_state jsonb; after_state jsonb; row_state jsonb; fields text[]; kind text; org uuid; aggregate uuid; correlation uuid;
begin
 correlation:=nullif(current_setting('offroad.domain_event_correlation',true),'')::uuid;
 if correlation is null then
  correlation:=gen_random_uuid();
  perform set_config('offroad.domain_event_correlation',correlation::text,true);
 end if;
 kind:=tg_argv[0];
 fields:=case kind
  when 'membership' then array['organization_id','user_id','role','status']
  when 'resource_grant' then array['organization_id','id','resource_kind','resource_id','subject_user_id','subject_role','subject_group_id','effect','action','grant_basis','valid_from','expires_at','revoked_at']
  when 'workspace_capability' then array['organization_id','id','capability','enabled','basis','revision']
  when 'commercial_account_link' then array['organization_id','id','account_owner_organization_id','commercial_account_id'] end;
 if fields is null then raise exception 'unregistered_domain_event_source'; end if;
 if tg_op<>'INSERT' then select jsonb_object_agg(key,value) into before_state from jsonb_each(to_jsonb(old)) where key=any(fields); end if;
 if tg_op<>'DELETE' then select jsonb_object_agg(key,value) into after_state from jsonb_each(to_jsonb(new)) where key=any(fields); end if;
 if before_state is not distinct from after_state then return coalesce(new,old); end if;
 row_state:=coalesce(after_state,before_state); org:=(row_state->>'organization_id')::uuid;
 aggregate:=(row_state->>case when kind='membership' then 'user_id' else 'id' end)::uuid;
 perform private.append_domain_event_v1(gen_random_uuid(),org,kind,aggregate,
 case tg_op when 'INSERT' then 'created' when 'DELETE' then 'removed' else 'changed' end,
 jsonb_build_object('before',before_state,'after',after_state),null,null,correlation);
 return coalesce(new,old);
end $function$
