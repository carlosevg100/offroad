-- Synthetic rollback-only contract for the canonical revision of a capital project and for the
-- propagation of an approved change.
--
-- What must hold: a revision is recorded from approved records only, is idempotent for the same
-- approved input set, is immutable, and carries the approver of the component that changed. Every
-- result declares the revision that produced it. A completed result is never rewritten; when a
-- later revision completes, the earlier one is marked as previous exactly once. Propagating the
-- same revision twice never produces a second output, and it needs the preparer role once the
-- project has review assignments.
begin;

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
  ('10000000-0000-4000-8000-000000000a01','authenticated','authenticated','revision-owner@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000a02','authenticated','authenticated','revision-approver@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000a03','authenticated','authenticated','revision-foreign@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000a04','authenticated','authenticated','revision-reader@example.invalid','{}','{}',now(),now(),false,false);
insert into public.organizations (id,organization_type,name,created_by) values
  ('20000000-0000-4000-8000-000000000a01','company','Synthetic revision tenant','10000000-0000-4000-8000-000000000a01'),
  ('20000000-0000-4000-8000-000000000a02','company','Synthetic foreign revision tenant','10000000-0000-4000-8000-000000000a03');
insert into public.organization_memberships (organization_id,user_id,role,status,joined_at) values
  ('20000000-0000-4000-8000-000000000a01','10000000-0000-4000-8000-000000000a01','owner','active',now()),
  ('20000000-0000-4000-8000-000000000a01','10000000-0000-4000-8000-000000000a02','member','active',now()),
  ('20000000-0000-4000-8000-000000000a01','10000000-0000-4000-8000-000000000a04','member','active',now()),
  ('20000000-0000-4000-8000-000000000a02','10000000-0000-4000-8000-000000000a03','owner','active',now());
insert into public.capital_projects (id,organization_id,project_name,created_by)
values ('30000000-0000-4000-8000-000000000a01','20000000-0000-4000-8000-000000000a01','Synthetic revision project','10000000-0000-4000-8000-000000000a01');
insert into public.document_intake_sessions (id,organization_id,capital_project_id,started_by,journey,locale)
values ('40000000-0000-4000-8000-000000000a01','20000000-0000-4000-8000-000000000a01','30000000-0000-4000-8000-000000000a01','10000000-0000-4000-8000-000000000a01','company','pt-BR');

-- Two approved configurations in one lineage. The root carries the reviewed source manifest the
-- provenance reader resolves; the child is the approved change.
insert into private.institutional_model_configurations
  (id,organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_evidence,reviewed_at,reviewed_by) values
  ('31000000-0000-4000-8000-000000000a01','20000000-0000-4000-8000-000000000a01','30000000-0000-4000-8000-000000000a01',1,'{"modelId":"synthetic"}',repeat('a',64),null,'approved',
   jsonb_build_object('kind','initial_configuration','sourceManifestFingerprint',repeat('c',64),'lineage','[]'::jsonb,'sourceBindings','[]'::jsonb),
   '2026-09-01T12:00:00Z','10000000-0000-4000-8000-000000000a02');

-- 1. The first record is the initial revision, approved by the configuration approver.
do $$ declare v private.project_canonical_revisions; begin
  v := private.record_project_canonical_revision_v1('20000000-0000-4000-8000-000000000a01','30000000-0000-4000-8000-000000000a01');
  if v.revision_number<>1 or v.approval_kind<>'initial' or v.parent_revision_id is not null
     or v.approved_by<>'10000000-0000-4000-8000-000000000a02' or v.approved_at<>'2026-09-01T12:00:00Z'::timestamptz
     or v.approval_reference<>'31000000-0000-4000-8000-000000000a01'
     or v.inputs#>>'{assumptions,fingerprint}'<>repeat('a',64)
     or v.inputs#>>'{data,sourceManifestFingerprint}'<>repeat('c',64) then
    raise exception 'initial canonical revision was not recorded from the approved configuration: %',to_jsonb(v);
  end if;
end $$;

-- 2. Recording again with the same approved input set returns the same revision.
do $$ declare a uuid; b uuid; begin
  select id into a from private.project_canonical_revisions where capital_project_id='30000000-0000-4000-8000-000000000a01';
  b := (private.record_project_canonical_revision_v1('20000000-0000-4000-8000-000000000a01','30000000-0000-4000-8000-000000000a01')).id;
  if a is distinct from b or (select count(*) from private.project_canonical_revisions where capital_project_id='30000000-0000-4000-8000-000000000a01')<>1 then
    raise exception 'recording the same approved input set duplicated the revision';
  end if;
end $$;

-- 3. An approved change to the assumptions advances the revision and names only what changed. The
--    documents did not move, so the data component is not reported as a change.
insert into private.institutional_model_configurations
  (id,organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_evidence,reviewed_at,reviewed_by) values
  ('31000000-0000-4000-8000-000000000a02','20000000-0000-4000-8000-000000000a01','30000000-0000-4000-8000-000000000a01',2,'{"modelId":"synthetic","changed":true}',repeat('b',64),repeat('a',64),'approved','{}'::jsonb,
   '2026-09-02T12:00:00Z','10000000-0000-4000-8000-000000000a02');
do $$ declare v private.project_canonical_revisions; parent uuid; begin
  select id into parent from private.project_canonical_revisions where capital_project_id='30000000-0000-4000-8000-000000000a01' and revision_number=1;
  v := private.record_project_canonical_revision_v1('20000000-0000-4000-8000-000000000a01','30000000-0000-4000-8000-000000000a01');
  if v.revision_number<>2 or v.approval_kind<>'institutional_configuration' or v.parent_revision_id is distinct from parent
     or v.change_summary<>'["assumptions"]'::jsonb
     or v.approved_at<>'2026-09-02T12:00:00Z'::timestamptz then
    raise exception 'the approved change did not advance the canonical revision: %',to_jsonb(v);
  end if;
end $$;

-- 4. A recorded revision is immutable.
do $$ declare rejected boolean:=false; begin
  begin update private.project_canonical_revisions set approval_kind='receivables_scope' where revision_number=1
    and capital_project_id='30000000-0000-4000-8000-000000000a01';
  exception when others then if sqlerrm<>'project_canonical_revision_immutable' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'a recorded canonical revision was rewritten'; end if;
  rejected:=false;
  begin delete from private.project_canonical_revisions where capital_project_id='30000000-0000-4000-8000-000000000a01';
  exception when others then if sqlerrm<>'project_canonical_revision_immutable' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'a recorded canonical revision was deleted'; end if;
end $$;

-- Results for both revisions. The message rows are the queue identity the production path uses.
insert into public.agent_conversations (id,organization_id,intake_session_id,created_by)
values ('60000000-0000-4000-8000-000000000a01','20000000-0000-4000-8000-000000000a01','40000000-0000-4000-8000-000000000a01','10000000-0000-4000-8000-000000000a01');
insert into public.agent_messages (id,organization_id,conversation_id,intake_session_id,role,status,content,locale,created_by) values
  ('61000000-0000-4000-8000-000000000a01','20000000-0000-4000-8000-000000000a01','60000000-0000-4000-8000-000000000a01','40000000-0000-4000-8000-000000000a01','user','completed','Calcular','pt-BR','10000000-0000-4000-8000-000000000a01'),
  ('61000000-0000-4000-8000-000000000a02','20000000-0000-4000-8000-000000000a01','60000000-0000-4000-8000-000000000a01','40000000-0000-4000-8000-000000000a01','user','completed','Calcular','pt-BR','10000000-0000-4000-8000-000000000a01');
insert into private.institutional_model_results
  (id,organization_id,capital_project_id,intake_session_id,configuration_id,configuration_fingerprint,source_manifest_fingerprint,requested_by,canonical_revision_id)
select c.id,'20000000-0000-4000-8000-000000000a01','30000000-0000-4000-8000-000000000a01','40000000-0000-4000-8000-000000000a01',c.config,c.print,repeat('c',64),'10000000-0000-4000-8000-000000000a01',
  (select id from private.project_canonical_revisions where capital_project_id='30000000-0000-4000-8000-000000000a01' and revision_number=c.rev)
from (values
  ('61000000-0000-4000-8000-000000000a01'::uuid,'31000000-0000-4000-8000-000000000a01'::uuid,repeat('a',64),1),
  ('61000000-0000-4000-8000-000000000a02'::uuid,'31000000-0000-4000-8000-000000000a02'::uuid,repeat('b',64),2)) as c(id,config,print,rev);

-- 5. Completion is the only write a queued result accepts, and it must record when it was produced.
do $$ declare rejected boolean:=false; begin
  begin update private.institutional_model_results set status='completed',artifact='{"v":1}'::jsonb
    where id='61000000-0000-4000-8000-000000000a01';
  exception when others then if sqlerrm<>'institutional_result_immutable' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'a result completed without recording when it was produced'; end if;
end $$;
update private.institutional_model_results set status='completed',artifact='{"v":1}'::jsonb,produced_at='2026-09-01T13:00:00Z'
 where id='61000000-0000-4000-8000-000000000a01';

-- 6. Completing the result of the later revision marks the earlier output as previous, without
--    rewriting it. Any writer that completes a result gets this, not only the worker command.
update private.institutional_model_results set status='completed',artifact='{"v":2}'::jsonb,produced_at='2026-09-02T13:00:00Z'
 where id='61000000-0000-4000-8000-000000000a02';
do $$ declare previous private.institutional_model_results; rejected boolean:=false; begin
  select * into previous from private.institutional_model_results where id='61000000-0000-4000-8000-000000000a01';
  if previous.superseded_by is distinct from '61000000-0000-4000-8000-000000000a02'::uuid then
    raise exception 'the result of the earlier revision was not marked as previous: %',to_jsonb(previous);
  end if;
  if previous.artifact<>'{"v":1}'::jsonb or previous.produced_at<>'2026-09-01T13:00:00Z'::timestamptz then
    raise exception 'marking a result as previous rewrote it: %',to_jsonb(previous);
  end if;
  begin update private.institutional_model_results set superseded_by=null where id='61000000-0000-4000-8000-000000000a01';
  exception when others then if sqlerrm<>'institutional_result_immutable' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'a superseded result was restored as current'; end if;
  rejected:=false;
  begin update private.institutional_model_results set artifact='{"v":3}'::jsonb where id='61000000-0000-4000-8000-000000000a02';
  exception when others then if sqlerrm<>'institutional_result_immutable' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'a completed result was overwritten'; end if;
  rejected:=false;
  begin delete from private.institutional_model_results where id='61000000-0000-4000-8000-000000000a01';
  exception when others then if sqlerrm<>'institutional_result_history_immutable' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'a recorded result was deleted'; end if;
end $$;

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated','aal','aal1')::text,true);
$$;

-- 7. The project reads its own revision history, with the previous output still identifiable.
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000a01');
do $$ declare body jsonb; current_result jsonb; previous_result jsonb; begin
  body := public.read_project_revision_history_v1('30000000-0000-4000-8000-000000000a01');
  if (body->>'currentRevisionNumber')::int<>2 or (body->>'pendingChange')::boolean
     or jsonb_array_length(body->'revisions')<>2 then
    raise exception 'the revision history did not report two revisions with no pending change: %',body;
  end if;
  current_result := body#>'{revisions,0,results,0}';
  previous_result := body#>'{revisions,1,results,0}';
  if not (current_result->>'isCurrent')::boolean or current_result->>'supersededBy' is not null
     or current_result->'artifact' is null or current_result->>'producedAt' is null then
    raise exception 'the current result was not marked as current: %',current_result;
  end if;
  if (previous_result->>'isCurrent')::boolean or previous_result->>'supersededBy'<>'61000000-0000-4000-8000-000000000a02'
     or previous_result->>'id'<>'61000000-0000-4000-8000-000000000a01' then
    raise exception 'the previous result was not identifiable as previous: %',previous_result;
  end if;
end $$;

-- 8. Propagating the current revision again returns the output that already exists.
create temp table revision_probe(label text primary key, body jsonb);
do $$ declare body jsonb; begin
  body := public.propagate_project_canonical_revision_v1('30000000-0000-4000-8000-000000000a01','62000000-0000-4000-8000-000000000a01','pt-BR');
  insert into revision_probe values ('propagation',body);
  if body->>'status'<>'completed' or body->>'resultId'<>'61000000-0000-4000-8000-000000000a02'
     or not (body->>'replayed')::boolean then
    raise exception 'a repeated propagation did not return the output that already exists: %',body;
  end if;
end $$;

-- 9. Once the project has review roles, propagation needs the preparer role.
reset role;
do $$ begin
  if (select count(*) from private.institutional_model_results where capital_project_id='30000000-0000-4000-8000-000000000a01')<>2
     or (select count(*) from private.project_canonical_revisions where capital_project_id='30000000-0000-4000-8000-000000000a01')<>2 then
    raise exception 'a repeated propagation created a second output or a second revision';
  end if;
end $$;
insert into public.capital_project_review_assignments (organization_id,capital_project_id,user_id,review_role,assigned_by) values
  ('20000000-0000-4000-8000-000000000a01','30000000-0000-4000-8000-000000000a01','10000000-0000-4000-8000-000000000a01','preparer','10000000-0000-4000-8000-000000000a01');
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000a04');
do $$ declare rejected boolean:=false; begin
  begin perform public.propagate_project_canonical_revision_v1('30000000-0000-4000-8000-000000000a01','62000000-0000-4000-8000-000000000a02','pt-BR');
  exception when insufficient_privilege then
    if sqlerrm<>'capital_project_review_role_required' then raise exception 'unexpected denial: %',sqlerrm; end if; rejected:=true;
  end;
  if not rejected then raise exception 'a member without the preparer role propagated an approved change'; end if;
end $$;

-- 10. Another tenant reads nothing and propagates nothing.
select pg_temp.as_user('10000000-0000-4000-8000-000000000a03');
do $$ declare rejected boolean:=false; begin
  begin perform public.read_project_revision_history_v1('30000000-0000-4000-8000-000000000a01');
  exception when insufficient_privilege then
    if sqlerrm<>'project_revision_forbidden' then raise exception 'unexpected denial: %',sqlerrm; end if; rejected:=true;
  end;
  if not rejected then raise exception 'a foreign tenant read the revision history'; end if;
  rejected:=false;
  begin perform public.propagate_project_canonical_revision_v1('30000000-0000-4000-8000-000000000a01','62000000-0000-4000-8000-000000000a03','pt-BR');
  exception when insufficient_privilege then
    if sqlerrm<>'project_revision_forbidden' then raise exception 'unexpected denial: %',sqlerrm; end if; rejected:=true;
  end;
  if not rejected then raise exception 'a foreign tenant propagated a revision'; end if;
  rejected:=false;
  begin perform 1 from private.project_canonical_revisions;
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'the canonical revision table is reachable outside its definer functions'; end if;
end $$;
reset role;

rollback;
select 'project_canonical_revisions_passed' as result;
