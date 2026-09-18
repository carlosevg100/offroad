begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
set local role authenticated;
select public.submit_vault_entry_version_v1('a5120000-0000-4000-9000-000000000001','a5120000-0000-4000-9000-000000000002',null,'directive','Synthetic review rule','Synthetic direction, not professional advice.');
do $$ declare scope uuid;fp text;begin
 select id into scope from public.vault_scopes;
 select content_fingerprint into strict fp from public.vault_entry_versions where id='a5120000-0000-4000-9000-000000000002';
 perform public.propose_vault_publication_v1('a5120000-0000-4000-9000-000000000003','a5120000-0000-4000-9000-000000000002',fp,null,null,'analysis','Synthetic human review');
 begin perform public.publish_vault_entry_v1('a5120000-0000-4000-9000-000000000003','a5120000-0000-4000-9000-000000000004','x');raise exception 'creator published without designation';exception when insufficient_privilege then null;end;
 perform public.set_resource_policy_grant_v1(scope,'a11b0000-0000-4000-8000-000000000001',null,'read','allow');
 perform public.set_resource_policy_grant_v1(scope,'a11b0000-0000-4000-8000-000000000001',null,'publish','allow');
 perform public.set_resource_policy_grant_v1(scope,'a11b0000-0000-4000-8000-000000000002',null,'manage','allow');
 if jsonb_array_length(public.search_vault_for_work_v1('a11b0000-0000-4000-9000-000000000002')->'rows')<>0 then raise exception 'draft appeared in official retrieval';end if;
 if jsonb_array_length(public.search_vault_for_work_v1('a11b0000-0000-4000-9000-000000000002',p_include_candidates=>true)->'rows')<>1 then raise exception 'explicit draft context lost candidate';end if;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ declare fp text;begin
 select review_fingerprint into fp from public.vault_publication_requests where id='a5120000-0000-4000-9000-000000000003';
 begin perform public.publish_vault_entry_v1('a5120000-0000-4000-9000-000000000003','a5120000-0000-4000-9000-000000000004',fp);raise exception 'collaborator published';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
do $$ declare vfp text;fp text;begin
 select content_fingerprint into vfp from public.vault_entry_versions where id='a5120000-0000-4000-9000-000000000002';
 perform public.propose_vault_publication_v1('a5120000-0000-4000-9000-000000000005','a5120000-0000-4000-9000-000000000002',vfp,null,null,'retrieval','Synthetic other purpose');
 select review_fingerprint into fp from public.vault_publication_requests where id='a5120000-0000-4000-9000-000000000003';
 begin perform public.publish_vault_entry_v1('a5120000-0000-4000-9000-000000000005','a5120000-0000-4000-9000-000000000006',fp);raise exception 'review changed purpose silently';exception when serialization_failure then null;end;
 perform public.publish_vault_entry_v1('a5120000-0000-4000-9000-000000000003','a5120000-0000-4000-9000-000000000004',fp);
 if public.publish_vault_entry_v1('a5120000-0000-4000-9000-000000000003','a5120000-0000-4000-9000-000000000007',fp)<>'a5120000-0000-4000-9000-000000000004' then raise exception 'retry duplicated publication';end if;
 select review_fingerprint into fp from public.vault_publication_requests where id='a5120000-0000-4000-9000-000000000005';
 begin perform public.publish_vault_entry_v1('a5120000-0000-4000-9000-000000000005','a5120000-0000-4000-9000-000000000006',fp);raise exception 'concurrent request replaced publication';exception when serialization_failure then null;end;
 if jsonb_array_length(public.search_vault_for_work_v1('a11b0000-0000-4000-9000-000000000002')->'rows')<>1 then raise exception 'published reference missing';end if;
end $$;
select public.submit_vault_entry_version_v1('a5120000-0000-4000-9000-000000000001','a5120000-0000-4000-9000-000000000010','a5120000-0000-4000-9000-000000000002','directive','Synthetic new review rule','New candidate must not replace official version.');
do $$ declare fp text;begin
 if public.search_vault_for_work_v1('a11b0000-0000-4000-9000-000000000002')->'rows'->0->>'version_id'<>'a5120000-0000-4000-9000-000000000002' then raise exception 'latest candidate became official';end if;
 select content_fingerprint into fp from public.vault_entry_versions where id='a5120000-0000-4000-9000-000000000010';
 perform public.propose_vault_publication_v1('a5120000-0000-4000-9000-000000000011','a5120000-0000-4000-9000-000000000010',fp,'a5120000-0000-4000-9000-000000000004',null,'analysis','Synthetic second review');
end $$;
select public.submit_vault_entry_version_v1('a5120000-0000-4000-9000-000000000001','a5120000-0000-4000-9000-000000000012','a5120000-0000-4000-9000-000000000010','directive','Synthetic third review rule','Another candidate preserves all versions.');
do $$ declare fp text;begin
 select review_fingerprint into fp from public.vault_publication_requests where id='a5120000-0000-4000-9000-000000000011';
 begin perform public.publish_vault_entry_v1('a5120000-0000-4000-9000-000000000011','a5120000-0000-4000-9000-000000000013',fp);raise exception 'stale candidate review published';exception when serialization_failure then null;end;
 perform public.withdraw_vault_publication_v1('a5120000-0000-4000-9000-000000000004','Synthetic withdrawal review');
 if jsonb_array_length(public.search_vault_for_work_v1('a11b0000-0000-4000-9000-000000000002')->'rows')<>0 then raise exception 'withdrawn publication remained retrievable';end if;
 select review_fingerprint into fp from public.vault_publication_requests where id='a5120000-0000-4000-9000-000000000003';
 begin perform public.publish_vault_entry_v1('a5120000-0000-4000-9000-000000000003','a5120000-0000-4000-9000-000000000004',fp);raise exception 'retry resurrected withdrawn publication';exception when serialization_failure then null;end;
 if (select count(*) from public.vault_entry_versions where entry_id='a5120000-0000-4000-9000-000000000001')<>3 then raise exception 'versions overwritten';end if;
 perform public.set_resource_policy_grant_v1((select id from public.vault_scopes),'a11b0000-0000-4000-8000-000000000001',null,'read','deny');
 if exists(select 1 from public.vault_entry_versions) then raise exception 'creator retained residual read';end if;
 begin perform public.publish_vault_entry_v1('a5120000-0000-4000-9000-000000000011','a5120000-0000-4000-9000-000000000013',fp);raise exception 'revoked creator published';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.audit_events where resource_type='vault_publications' and resource_id='a5120000-0000-4000-9000-000000000004' and action='insert' and metadata='{"operation":"INSERT"}'::jsonb)
 or not exists(select 1 from public.audit_events where resource_type='vault_publications' and resource_id='a5120000-0000-4000-9000-000000000004' and action='update' and metadata='{"operation":"UPDATE"}'::jsonb) then raise exception 'publication or withdrawal lacks content-free audit';end if;
 begin update public.vault_entry_versions set title='Synthetic overwrite' where id='a5120000-0000-4000-9000-000000000002';raise exception 'immutable version overwritten';exception when check_violation then null;end;
 begin delete from public.vault_publication_requests where id='a5120000-0000-4000-9000-000000000003';raise exception 'review history deleted';exception when check_violation then null;end;
end $$;
set local role service_role;
do $$ begin
 begin perform public.publish_vault_entry_v1('a5120000-0000-4000-9000-000000000003','a5120000-0000-4000-9000-000000000004','x');raise exception 'worker published';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'human_vault_publication: PASS' result;
rollback;
