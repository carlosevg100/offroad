-- Continuation of the genuine v7/compiler/human-review rollback fixture.
set local role authenticated;
do $$declare j jsonb;c jsonb;r jsonb;r2 jsonb;begin
 select v into strict j from agent_fixture where k='claim';select v into strict c from agent_fixture where k='capture';
 r:=public.worker_recover_execution_brief_product_v1((j->>'job_id')::uuid,j->>'capability_token',(j#>>'{payload,message_id}')::uuid);
 r2:=public.worker_recover_execution_brief_product_v1((j->>'job_id')::uuid,j->>'capability_token',(j#>>'{payload,message_id}')::uuid);
 if r<>r2 or r->>'state'<>'committed' or r->>'captureId'<>c->>'captureId' or r#>>'{product,assistantMessageId}'<>'a8800000-0000-4000-8000-000000000011' or r#>>'{product,producerKind}'<>'agent_operation_brief' or r#>>'{product,executionBriefId}'<>(select v->>'id' from agent_fixture where k='brief') or r#>>'{product,planId}' is null or r#>>'{product,briefFingerprint}' is null then raise exception 'native_agent_recovery_receipt_mismatch';end if;
 begin perform public.worker_recover_execution_brief_product_v1((j->>'job_id')::uuid,j->>'capability_token','a8800000-0000-4000-8000-000000000099');raise exception 'wrong_request_recovered';exception when insufficient_privilege then null;end;
 raise notice 'PASS execution_brief_native_agent_committed_replay_exact_ids_wrong_request_denied';
end$$;
reset role;
do $$declare v_completion_id uuid;begin
 select c.id into strict v_completion_id from private.execution_brief_producer_completions c where c.organization_id='a8800000-0000-4000-8000-000000000002';
 begin update private.execution_brief_producer_completions set updated_at=clock_timestamp() where execution_brief_producer_completions.id=v_completion_id;raise exception 'completion_mutable';exception when check_violation then if sqlerrm<>'review_history_immutable' then raise;end if;end;
 if(select count(*) from pg_policies where schemaname='private' and tablename='execution_brief_producer_completions')<>4 or has_table_privilege('authenticated','private.execution_brief_producer_completions','SELECT') then raise exception 'completion_access_unclosed';end if;
 raise notice 'PASS execution_brief_native_completion_immutable_rls_no_direct_read';
end$$;
savepoint recovery_basis_mutation;
update public.document_intake_sessions set company_profile=company_profile||'{"name":"Recovery changed basis"}'::jsonb where organization_id='a8800000-0000-4000-8000-000000000002';
set local role authenticated;
do $$declare j jsonb;begin select v into strict j from agent_fixture where k='claim';begin perform public.worker_recover_execution_brief_product_v1((j->>'job_id')::uuid,j->>'capability_token',(j#>>'{payload,message_id}')::uuid);raise exception 'changed_basis_recovered';exception when insufficient_privilege then null;end;raise notice 'PASS execution_brief_native_recovery_changed_basis_denied';end$$;
rollback to recovery_basis_mutation;
reset role;
