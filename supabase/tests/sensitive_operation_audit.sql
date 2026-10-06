begin;
\ir support/artifact_roundtrip_setup.sql

do $$declare org uuid:='a11b0000-0000-4000-9000-000000000001';work uuid:='a11b0000-0000-4000-9000-000000000002';read jsonb;payload jsonb;version uuid:=pg_temp.val('rt_revision','revision_id')::uuid;
begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 read:=public.read_artifact_revision_v1(version);
 if read->'restriction' is distinct from 'null'::jsonb then raise exception 'allowed revision withheld';end if;
 perform public.read_artifact_head_v1(work,'answer','roundtrip-test');
 perform public.read_artifact_export_receipt_v1(pg_temp.val('rt_receipt','receiptId')::uuid);
 perform public.search_authorized_resources_v1(org,work,'synthetic',12,'analysis');reset role;
 if not exists(select 1 from public.audit_events where organization_id=org and action='read.allowed'and metadata->>'resourceVersionId'=version::text and metadata->>'policyFingerprint'~'^[a-f0-9]{64}$')then raise exception 'exact read receipt absent';end if;
 if not exists(select 1 from public.audit_events where organization_id=org and action='download.allowed'and metadata->>'resourceVersionId'=version::text)then raise exception 'download authorization receipt absent';end if;
 if not exists(select 1 from public.audit_events where organization_id=org and action='search.allowed'and metadata->>'schemaVersion'='sensitive-operation.v1')then raise exception 'search decision absent';end if;
 raise notice 'PASS sensitive_read_search_and_download_version_policy_receipts';
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');set local role authenticated;
 perform public.search_authorized_resources_v1(org,work,'synthetic',12,'analysis');
 begin perform public.read_artifact_revision_v1(version);raise exception 'unauthorized_read_allowed';exception when sqlstate 'P0002' or insufficient_privilege then null;end;
 perform public.record_artifact_access_denial_v1(version,null);
 perform public.record_artifact_access_denial_v1(null,pg_temp.val('rt_receipt','receiptId')::uuid);
 begin perform private.append_sensitive_operation_v1(org,work,version,'read',true);raise exception 'human forged audit allowed';exception when insufficient_privilege then null;end;reset role;
 if not exists(select 1 from public.audit_events where organization_id=org and actor_user_id='a11b0000-0000-4000-8000-000000000002'and action='search.denied'and metadata->>'result'='deny')then raise exception 'denial absent';end if;
 raise notice 'PASS sensitive_denial_does_not_grant_content_or_forge_success';
 if not exists(select 1 from public.audit_events where organization_id=org and actor_user_id='a11b0000-0000-4000-8000-000000000002'and action='read.denied'and metadata->>'resourceVersionId'=version::text)
 or not exists(select 1 from public.audit_events where organization_id=org and actor_user_id='a11b0000-0000-4000-8000-000000000002'and action='download.denied'and metadata->>'resourceVersionId'=version::text)then raise exception 'rolled_back_denials_not_recorded';end if;
 raise notice 'PASS rejected_rpc_separate_transaction_denial_receipts';
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 perform public.set_capital_project_review_assignment_v1(work,'a11b0000-0000-4000-8000-000000000001','preparer',true);
 perform public.set_capital_project_review_assignment_v1(work,'a11b0000-0000-4000-8000-000000000001','approver',true);
 perform public.set_capital_project_review_policy_v1(work,'allowed');
 perform public.review_artifact_revision_v1(version,pg_temp.val('rt_revision','manifest_fingerprint'),'approve',null,'Synthetic exact audit review',true,gen_random_uuid());reset role;
 if not exists(select 1 from public.audit_events where organization_id=org and action='review.allowed' and metadata->>'resourceVersionId'=version::text and metadata->>'policyFingerprint'~'^[a-f0-9]{64}$')then raise exception 'human review lacks exact version policy receipt';end if;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 perform public.set_retention_rule_v1(work,'retain',null,gen_random_uuid());reset role;
 if not exists(select 1 from public.audit_events where organization_id=org and action='administration.allowed' and resource_id=work::text and metadata->>'resourceVersionId' is not null and metadata->>'result'='allow')then raise exception 'administration lacks typed receipt';end if;
 raise notice 'PASS sensitive_review_and_administration_exact_command_receipts';
end;$$;
rollback;
