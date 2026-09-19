-- Synthetic, rollback-only. A new platform base, not another override of R01.
begin;
\ir support/platform_method_fixture.sql

do $$ declare x record;b jsonb;actor_role text;sig text;begin
 select * into x from platform_method_fixture;
 if private.submit_platform_method_candidate_v1(x.id,x.release_id,x.bundle,'Synthetic author')<>x.fingerprint then raise exception 'candidate replay mismatch';end if;
 begin perform private.submit_platform_method_candidate_v1(x.id,x.release_id,x.bundle||'{"sourceCommit":"dddddddddddddddddddddddddddddddddddddddd"}','Synthetic author');raise exception 'changed candidate accepted';exception when sqlstate '22023' then if sqlerrm<>'platform_method_request_reused' then raise;end if;end;
 begin perform private.publish_platform_method_v1(gen_random_uuid(),x.id,x.fingerprint,'Synthetic publication without approval');raise exception 'unapproved publication accepted';exception when insufficient_privilege then if sqlerrm<>'platform_method_reviews_required' then raise;end if;end;
 begin perform private.publish_platform_method_v1(gen_random_uuid(),x.id,repeat('0',64),'Synthetic stale candidate');raise exception 'stale candidate accepted';exception when serialization_failure then null;end;
 b:=jsonb_set(x.bundle,'{manifest,authoringStatus}','"incomplete"');
 begin perform private.submit_platform_method_candidate_v1(gen_random_uuid(),'synthetic-other-base',b,'Synthetic author');raise exception 'tampered manifest accepted';exception when sqlstate '22023' then null;end;
 begin perform private.submit_platform_method_candidate_v1(gen_random_uuid(),'r01-2026.09.06-v1',x.bundle,'Synthetic author');raise exception 'candidate shadowed R01';exception when sqlstate '22023' then if sqlerrm<>'platform_method_identity_already_published' then raise;end if;end;
 foreach actor_role in array array['anon','authenticated','service_role'] loop
  foreach sig in array array['private.submit_platform_method_candidate_v1(uuid,text,jsonb,text)','private.attest_platform_method_candidate_v1(uuid,uuid,text,text,text,jsonb)','private.publish_platform_method_v1(uuid,uuid,text,text)','private.retire_platform_method_v1(uuid,uuid,text,text)'] loop
   if has_function_privilege(actor_role,sig,'EXECUTE') then raise exception 'platform command exposed to %: %',actor_role,sig;end if;
  end loop;
  if has_table_privilege(actor_role,'private.platform_method_candidates','SELECT,INSERT,UPDATE,DELETE') then raise exception 'platform candidates exposed';end if;
 end loop;
end $$;

-- Forging a human-approval attribute never gives a tenant or worker operational authority.
set local role authenticated;
do $$ begin
 begin perform private.publish_platform_method_v1(gen_random_uuid(),'b5141000-0000-4000-9000-000000000001',repeat('a',64),'Tenant forged global approval');raise exception 'tenant published global method';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
do $$ begin
 begin perform private.submit_platform_method_candidate_v1(gen_random_uuid(),'worker-forgery','{}','Worker actor');raise exception 'worker submitted global method';exception when insufficient_privilege then null;end;
end $$;
reset role;

do $$ declare x record;e jsonb;begin
 select * into x from platform_method_fixture;
 e:=jsonb_build_object('sourcePath','packages/credit-playbook/knowledge/reviews/synthetic-platform-technical.json','sourceHash',repeat('a',64),'occurredAt','2026-09-19T00:00:00Z','result','approved','manifestHash',x.bundle->'manifest'->>'manifestHash','sourceCommit',repeat('c',40),'humanApproval',false);
 begin perform private.attest_platform_method_candidate_v1(gen_random_uuid(),x.id,x.fingerprint,'technical_review','Synthetic author',e);raise exception 'self review accepted';exception when sqlstate '22023' then null;end;
 perform private.attest_platform_method_candidate_v1('b5141000-0000-4000-9000-000000000002',x.id,x.fingerprint,'technical_review','Synthetic technical reviewer',e);
 perform private.attest_platform_method_candidate_v1('b5141000-0000-4000-9000-000000000002',x.id,x.fingerprint,'technical_review','Synthetic technical reviewer',e);
 begin perform private.publish_platform_method_v1(gen_random_uuid(),x.id,x.fingerprint,'Only technical review exists');raise exception 'technical review became human approval';exception when insufficient_privilege then null;end;
 e:=e||jsonb_build_object('sourcePath','packages/credit-playbook/knowledge/reviews/synthetic-platform-approval.json','sourceHash',repeat('b',64));
 begin perform private.attest_platform_method_candidate_v1(gen_random_uuid(),x.id,x.fingerprint,'content_approval','Synthetic human approver',e);raise exception 'machine review became human approval';exception when sqlstate '22023' then null;end;
 e:=e||'{"humanApproval":true}';
 begin perform private.attest_platform_method_candidate_v1(gen_random_uuid(),x.id,x.fingerprint,'content_approval','Synthetic human approver',e||jsonb_build_object('sourceHash',repeat('d',64)));raise exception 'unbound approval accepted';exception when sqlstate '22023' then null;end;
 perform private.attest_platform_method_candidate_v1('b5141000-0000-4000-9000-000000000003',x.id,x.fingerprint,'content_approval','Synthetic human approver',e);
 perform private.publish_platform_method_v1('b5141000-0000-4000-9000-000000000004',x.id,x.fingerprint,'Synthetic reviewed corpus publication');
 perform private.publish_platform_method_v1('b5141000-0000-4000-9000-000000000004',x.id,x.fingerprint,'Synthetic reviewed corpus publication');
 perform private.attest_platform_method_candidate_v1('b5141000-0000-4000-9000-000000000003',x.id,x.fingerprint,'content_approval','Synthetic human approver',e);
 if not private.platform_method_reference_available_v1(x.release_id) then raise exception 'published method unavailable';end if;
 if exists(select 1 from private.platform_capability_releases where method_id='synthetic-platform-method' and released) then raise exception 'publication activated executor';end if;
 perform private.compose_method_v1(null,x.release_id,'[]',null,'analysis');
 if (select count(*) from private.platform_method_publication_events where candidate_id=x.id)<>1 then raise exception 'replay duplicated audit';end if;
 begin update private.platform_method_candidates set author='Changed author' where id=x.id;raise exception 'candidate mutable';exception when check_violation then if sqlerrm<>'contribution_revision_immutable' then raise;end if;end;
 perform private.retire_platform_method_v1('b5141000-0000-4000-9000-000000000005',x.id,x.fingerprint,'Synthetic withdrawal after content issue');
 perform private.retire_platform_method_v1('b5141000-0000-4000-9000-000000000005',x.id,x.fingerprint,'Synthetic withdrawal after content issue');
 if private.platform_method_reference_available_v1(x.release_id) then raise exception 'retirement ineffective';end if;
 begin perform private.compose_method_v1(null,x.release_id,'[]',null,'analysis');raise exception 'retired composition accepted';exception when sqlstate '22023' then if sqlerrm<>'method_base_unavailable' then raise;end if;end;
 begin perform private.publish_platform_method_v1(gen_random_uuid(),x.id,x.fingerprint,'Attempt resurrection after retirement');raise exception 'retired method resurrected';exception when sqlstate '22023' then null;end;
 if (select count(*) from private.platform_method_publication_events where candidate_id=x.id)<>2 then raise exception 'retirement audit missing';end if;
 if not private.platform_method_reference_available_v1('r01-2026.09.06-v1') then raise exception 'R01 changed';end if;
end $$;
select 'platform_method_publication: PASS' as result;
rollback;
