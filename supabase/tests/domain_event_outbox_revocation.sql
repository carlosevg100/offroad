-- Synthetic staging probe; every record is rolled back. No production execution.
begin;
\ir support/legacy_workspace_capabilities.sql
select set_config('request.jwt.claims','{}',true);
do $$
declare
 a uuid := 'a2241000-0000-4000-8000-000000000001';
 b uuid := 'a2241000-0000-4000-8000-000000000002';
 o uuid := 'a2241000-0000-4000-9000-000000000001';
 p uuid := 'a2241000-0000-4000-9000-000000000002';
 s uuid := 'a2241000-0000-4000-9000-000000000003';
 d uuid := 'a2241000-0000-4000-9000-000000000004';
 r uuid := 'a2241000-0000-4000-9000-000000000005';
 c uuid := 'a2241000-0000-4000-9000-000000000006';
begin
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
 values(a,'authenticated','authenticated','a11b-a@example.invalid','{}','{}',now(),now(),false,false),
 (b,'authenticated','authenticated','a11b-b@example.invalid','{}','{}',now(),now(),false,false);
 insert into public.organizations(id,organization_type,name,created_by) values(o,'originator','Synthetic outbox organization',a);
 insert into public.organization_memberships(organization_id,user_id,role,status) values(o,a,'owner','active'),(o,b,'member','active');
 perform set_config('request.jwt.claim.sub',a::text,true);
 insert into public.capital_projects(id,organization_id,project_name,created_by,private_access_granted_at,private_access_granted_by)
 values(p,o,'Synthetic restricted project',a,now(),a);
 insert into public.document_intake_sessions(id,organization_id,started_by,journey,capital_project_id) values(s,o,a,'originator',p);
 insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,created_by,processing_status)
 values(d,o,s,o::text||'/'||s::text||'/synthetic.txt','Synthetic confidential source','text/plain',a,'ready');
 insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by)
 values(r,o,s,1,'manual','synthetic-outbox',a);
 insert into public.case_retrieval_chunks(organization_id,intake_session_id,source_document_id,document_version,processing_run_id,chunk_key,content,content_hash,source_anchor)
 values(o,s,d,1,r,'synthetic-outbox','Synthetic confidential information for access boundary probe.',repeat('a',64),'{}');
 insert into public.agent_conversations(id,organization_id,intake_session_id,created_by) values(c,o,s,a);
 insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,created_by)
 values('a2241000-0000-4000-9000-000000000007',o,c,s,'user','completed','Synthetic confidential question','pt-BR',a);
end $$;

insert into private.worker_tokens(id,label,token_sha256) values('a2241000-0000-4000-9000-000000000010','Synthetic outbox token',extensions.digest(repeat('b',64),'sha256'));
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,source_document_id,kind,status,available_at,leased_by,lease_expires_at,capability_sha256)
values('a2241000-0000-4000-9000-000000000011','a2241000-0000-4000-9000-000000000001','a2241000-0000-4000-9000-000000000005','a2241000-0000-4000-9000-000000000003','a2241000-0000-4000-9000-000000000004','document_pipeline','queued','-infinity',null,null,null),
('a2241000-0000-4000-9000-000000000012','a2241000-0000-4000-9000-000000000001','a2241000-0000-4000-9000-000000000005','a2241000-0000-4000-9000-000000000003','a2241000-0000-4000-9000-000000000004','document_pipeline','leased',now(),'a2241000-0000-4000-9000-000000000010',now()+interval '10 minutes',extensions.digest(repeat('c',64),'sha256'));
update public.organization_memberships set status='suspended' where organization_id='a2241000-0000-4000-9000-000000000001' and user_id='a2241000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub','a2241000-0000-4000-8000-000000000002',true);
create function pg_temp.reject_effect_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic_effect_audit_failure'; end $$;
create trigger synthetic_effect_audit_failure before insert on private.access_decision_events for each row execute function pg_temp.reject_effect_audit();
create temp table claimed_event(payload jsonb);
insert into claimed_event select public.claim_event_outbox_v1(repeat('b',64));
do $$ declare item jsonb; begin
 select payload into item from claimed_event;
 begin
  perform public.complete_event_outbox_v1(repeat('b',64),(item->>'outboxId')::uuid,item->>'capability');
  raise exception 'effect ignored its audit failure';
 exception when raise_exception then if sqlerrm<>'synthetic_effect_audit_failure' then raise; end if; end;
 if exists(select 1 from public.processing_jobs where organization_id='a2241000-0000-4000-9000-000000000001' and status='cancelled') then raise exception 'partial effect survived audit failure'; end if;
 if exists(select 1 from private.event_outbox where id=(item->>'outboxId')::uuid and status='completed') then raise exception 'failed effect was acknowledged'; end if;
end $$;
drop trigger synthetic_effect_audit_failure on private.access_decision_events;
do $$ declare item jsonb; result jsonb; begin
 select payload into item from claimed_event;
 result:=public.complete_event_outbox_v1(repeat('b',64),(item->>'outboxId')::uuid,item->>'capability');
 if result->>'appliedCount'<>'2' then raise exception 'revoked queued and leased jobs not cancelled: %',result; end if;
 result:=public.complete_event_outbox_v1(repeat('b',64),(item->>'outboxId')::uuid,item->>'capability');
 if result->>'replayed'<>'true' or (select count(*) from private.access_decision_events where organization_id='a2241000-0000-4000-9000-000000000001')<>2 then raise exception 'retry duplicated effect audit'; end if;
 if exists(select 1 from public.processing_runs where organization_id='a2241000-0000-4000-9000-000000000001' and status<>'cancelled') then raise exception 'cancelled work left run active'; end if;
 if exists(select 1 from public.processing_jobs where organization_id='a2241000-0000-4000-9000-000000000001' and (status<>'cancelled' or capability_sha256 is not null)) then raise exception 'job authority survived propagation'; end if;
 for counter in 1..100 loop
  item:=public.claim_event_outbox_v1(repeat('b',64));
  exit when item->>'claimed'='false';
  perform public.complete_event_outbox_v1(repeat('b',64),(item->>'outboxId')::uuid,item->>'capability');
 end loop;
 perform private.require_domain_event_propagation_v1('a2241000-0000-4000-9000-000000000001');
end $$;
select 'domain_event_outbox_revocation: PASS' result;
rollback;
