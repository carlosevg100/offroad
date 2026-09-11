-- Synthetic rollback-only contract for an edited product workbook returning as a proposed change.
--
-- What must hold: preparing a proposal needs the preparer role, approving it needs an approver and
-- obeys the self-approval setting, a file that no longer matches the approved configuration is
-- refused, the same file never opens a second review, nothing is applied before approval, and an
-- approval writes the candidate configuration with honest provenance and queues the recompute
-- through the configuration review that already exists.
begin;

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
  ('10000000-0000-4000-8000-000000000b01','authenticated','authenticated','proposal-preparer@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000b02','authenticated','authenticated','proposal-approver@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000b03','authenticated','authenticated','proposal-reader@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000b04','authenticated','authenticated','proposal-foreign@example.invalid','{}','{}',now(),now(),false,false);
insert into public.organizations (id,organization_type,name,created_by) values
  ('20000000-0000-4000-8000-000000000b01','company','Synthetic proposal tenant','10000000-0000-4000-8000-000000000b01'),
  ('20000000-0000-4000-8000-000000000b02','company','Synthetic foreign proposal tenant','10000000-0000-4000-8000-000000000b04');
insert into public.organization_memberships (organization_id,user_id,role,status,joined_at) values
  ('20000000-0000-4000-8000-000000000b01','10000000-0000-4000-8000-000000000b01','owner','active',now()),
  ('20000000-0000-4000-8000-000000000b01','10000000-0000-4000-8000-000000000b02','member','active',now()),
  ('20000000-0000-4000-8000-000000000b01','10000000-0000-4000-8000-000000000b03','member','active',now()),
  ('20000000-0000-4000-8000-000000000b02','10000000-0000-4000-8000-000000000b04','owner','active',now());
insert into public.capital_projects (id,organization_id,project_name,created_by)
values ('30000000-0000-4000-8000-000000000b01','20000000-0000-4000-8000-000000000b01','Synthetic proposal project','10000000-0000-4000-8000-000000000b01');
insert into public.document_intake_sessions (id,organization_id,capital_project_id,started_by,journey,locale)
values ('40000000-0000-4000-8000-000000000b01','20000000-0000-4000-8000-000000000b01','30000000-0000-4000-8000-000000000b01','10000000-0000-4000-8000-000000000b01','company','pt-BR');
insert into public.capital_project_review_assignments (organization_id,capital_project_id,user_id,review_role,assigned_by) values
  ('20000000-0000-4000-8000-000000000b01','30000000-0000-4000-8000-000000000b01','10000000-0000-4000-8000-000000000b01','preparer','10000000-0000-4000-8000-000000000b01'),
  ('20000000-0000-4000-8000-000000000b01','30000000-0000-4000-8000-000000000b01','10000000-0000-4000-8000-000000000b01','approver','10000000-0000-4000-8000-000000000b01'),
  ('20000000-0000-4000-8000-000000000b01','30000000-0000-4000-8000-000000000b01','10000000-0000-4000-8000-000000000b02','approver','10000000-0000-4000-8000-000000000b01');

create function pg_temp.configuration_hash(value jsonb) returns text language sql security definer set search_path='' as $$select private.institutional_config_hash(value);$$;
-- The reviewed manifest of this session, read the way the production reader reads it.
create function pg_temp.source_manifest(p_org uuid,p_session uuid) returns text language sql security definer set search_path='' as $$select private.institutional_source_context(p_org,p_session)->>'sourceManifestFingerprint';$$;
select set_config('test.proposal_manifest',pg_temp.source_manifest('20000000-0000-4000-8000-000000000b01','40000000-0000-4000-8000-000000000b01'),true);
select set_config('test.proposal_configuration',
  '{"modelId":"synthetic","currency":"BRL","assumptionBook":{"scenarioId":"synthetic-base","scenarioName":"Synthetic base","periods":["2027","2028"],"assumptions":[{"id":"cost-ratio","label":{"pt":"cost-ratio","en":"cost-ratio"},"unit":"percent","values":{"2027":"0.5","2028":"0.5"},"sourceType":"company_budget","evidence":[],"rationale":"Explicit synthetic premise","methodology":"Supplied annual assumption","confidence":"medium","editable":true,"impacts":["model"]}]}}',
  true);
insert into private.institutional_model_configurations
  (id,organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_evidence,reviewed_at,reviewed_by)
values ('31000000-0000-4000-8000-000000000b01','20000000-0000-4000-8000-000000000b01','30000000-0000-4000-8000-000000000b01',1,
  current_setting('test.proposal_configuration')::jsonb,
  pg_temp.configuration_hash(current_setting('test.proposal_configuration')::jsonb), null, 'approved',
  jsonb_build_object('kind','initial_configuration','sourceManifestFingerprint',current_setting('test.proposal_manifest'),'lineage','[]'::jsonb,'sourceBindings','[]'::jsonb),
  '2026-09-01T12:00:00Z','10000000-0000-4000-8000-000000000b02');

-- The current canonical revision and the result that is current right now.
select set_config('test.proposal_revision',
  (private.record_project_canonical_revision_v1('20000000-0000-4000-8000-000000000b01','30000000-0000-4000-8000-000000000b01')).id::text, true);
insert into public.agent_conversations (id,organization_id,intake_session_id,created_by)
values ('60000000-0000-4000-8000-000000000b01','20000000-0000-4000-8000-000000000b01','40000000-0000-4000-8000-000000000b01','10000000-0000-4000-8000-000000000b01');
insert into public.agent_messages (id,organization_id,conversation_id,intake_session_id,role,status,content,locale,created_by)
values ('61000000-0000-4000-8000-000000000b01','20000000-0000-4000-8000-000000000b01','60000000-0000-4000-8000-000000000b01','40000000-0000-4000-8000-000000000b01','user','completed','Calcular','pt-BR','10000000-0000-4000-8000-000000000b01');
insert into private.institutional_model_results
  (id,organization_id,capital_project_id,intake_session_id,configuration_id,configuration_fingerprint,source_manifest_fingerprint,requested_by,canonical_revision_id)
values ('61000000-0000-4000-8000-000000000b01','20000000-0000-4000-8000-000000000b01','30000000-0000-4000-8000-000000000b01','40000000-0000-4000-8000-000000000b01',
  '31000000-0000-4000-8000-000000000b01', pg_temp.configuration_hash(current_setting('test.proposal_configuration')::jsonb), current_setting('test.proposal_manifest'),
  '10000000-0000-4000-8000-000000000b01', current_setting('test.proposal_revision')::uuid);
update private.institutional_model_results
   set status='completed', produced_at='2026-09-01T13:00:00Z',
       artifact=jsonb_build_object('fingerprint',repeat('d',64))
 where id='61000000-0000-4000-8000-000000000b01';

select set_config('test.proposal_payload', jsonb_build_object(
  'configurationFingerprint', pg_temp.configuration_hash(current_setting('test.proposal_configuration')::jsonb),
  'artifactFingerprint', repeat('d',64),
  'structureFingerprint', repeat('e',64),
  'uploadFingerprint', repeat('f',64),
  'changes', jsonb_build_array(jsonb_build_object('assumptionId','cost-ratio','period','2027','approved','0.5','proposed','0.45')))::text, true);

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated','aal','aal1')::text,true);
$$;

-- 1. A member with project access but no preparer role cannot open a proposal.
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000b03');
do $$ declare rejected boolean:=false; begin
  begin perform public.submit_institutional_revision_proposal_v1('30000000-0000-4000-8000-000000000b01','62000000-0000-4000-8000-000000000b01',current_setting('test.proposal_payload')::jsonb);
  exception when insufficient_privilege then
    if sqlerrm<>'capital_project_review_role_required' then raise exception 'unexpected denial: %',sqlerrm; end if; rejected:=true; end;
  if not rejected then raise exception 'a member without the preparer role opened a proposal'; end if;
end $$;

-- 2. A file whose approved value no longer matches the approved configuration is outdated.
select pg_temp.as_user('10000000-0000-4000-8000-000000000b01');
do $$ declare rejected boolean:=false; stale jsonb; begin
  stale := jsonb_set(current_setting('test.proposal_payload')::jsonb,'{changes,0,approved}','"0.6"');
  begin perform public.submit_institutional_revision_proposal_v1('30000000-0000-4000-8000-000000000b01','62000000-0000-4000-8000-000000000b01',stale);
  exception when serialization_failure then
    if sqlerrm<>'institutional_revision_proposal_stale' then raise exception 'unexpected refusal: %',sqlerrm; end if; rejected:=true; end;
  if not rejected then raise exception 'a workbook from an older approved configuration was accepted'; end if;
  rejected:=false;
  stale := jsonb_set(current_setting('test.proposal_payload')::jsonb,'{artifactFingerprint}',to_jsonb(repeat('9',64)));
  begin perform public.submit_institutional_revision_proposal_v1('30000000-0000-4000-8000-000000000b01','62000000-0000-4000-8000-000000000b01',stale);
  exception when serialization_failure then rejected:=true; end;
  if not rejected then raise exception 'a workbook from another result was accepted'; end if;
end $$;

-- 3. The proposal is recorded and nothing is applied by recording it.
do $$ declare body jsonb; begin
  body := public.submit_institutional_revision_proposal_v1('30000000-0000-4000-8000-000000000b01','62000000-0000-4000-8000-000000000b01',current_setting('test.proposal_payload')::jsonb);
  if body->>'status'<>'proposed' or (body->>'replayed')::boolean then raise exception 'the proposal was not opened: %',body; end if;
  body := public.submit_institutional_revision_proposal_v1('30000000-0000-4000-8000-000000000b01','62000000-0000-4000-8000-000000000b02',current_setting('test.proposal_payload')::jsonb);
  if not (body->>'replayed')::boolean or body->>'proposalId'<>'62000000-0000-4000-8000-000000000b01' then
    raise exception 'the same file opened a second review: %',body;
  end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from private.institutional_revision_proposals)<>1 then raise exception 'the same file opened a second review'; end if;
  if (select count(*) from private.institutional_model_configurations where capital_project_id='30000000-0000-4000-8000-000000000b01')<>1
     or (select configuration#>>'{assumptionBook,assumptions,0,values,2027}' from private.institutional_model_configurations where id='31000000-0000-4000-8000-000000000b01')<>'0.5' then
    raise exception 'opening a proposal changed the approved assumptions';
  end if;
end $$;

-- 4. The preparer may not approve their own proposal while self-approval is forbidden.
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000b01');
do $$ declare rejected boolean:=false; begin
  begin perform public.review_institutional_revision_proposal_v1('62000000-0000-4000-8000-000000000b01','approved',repeat('e',64),'63000000-0000-4000-8000-000000000b01','pt-BR');
  exception when insufficient_privilege then
    if sqlerrm<>'capital_project_self_approval_forbidden' then raise exception 'unexpected denial: %',sqlerrm; end if; rejected:=true; end;
  if not rejected then raise exception 'the preparer approved their own imported change'; end if;
end $$;

-- 5. A reviewer approving a file that no longer matches what they were shown is refused.
select pg_temp.as_user('10000000-0000-4000-8000-000000000b02');
do $$ declare rejected boolean:=false; begin
  begin perform public.review_institutional_revision_proposal_v1('62000000-0000-4000-8000-000000000b01','approved',repeat('0',64),'63000000-0000-4000-8000-000000000b01','pt-BR');
  exception when serialization_failure then rejected:=true; end;
  if not rejected then raise exception 'a proposal was approved against a different untouched structure'; end if;
end $$;

-- 6. The approver approves: the candidate configuration carries the proposed value with honest
--    provenance, and the recompute is queued through the existing configuration review.
create temp table proposal_probe(label text primary key, body jsonb);
do $$ declare body jsonb; begin
  body := public.review_institutional_revision_proposal_v1('62000000-0000-4000-8000-000000000b01','approved',repeat('e',64),'63000000-0000-4000-8000-000000000b01','pt-BR');
  insert into proposal_probe values ('approval',body);
  if body->>'status'<>'approved' or body#>>'{calculation,status}'<>'queued' then
    raise exception 'the approved proposal did not queue the recompute: %',body;
  end if;
end $$;
reset role;
do $$ declare candidate private.institutional_model_configurations; begin
  select * into candidate from private.institutional_model_configurations
   where id=((select body from proposal_probe where label='approval')->>'candidateConfigurationId')::uuid;
  if candidate.status<>'approved' or candidate.revision<>2
     or candidate.configuration#>>'{assumptionBook,assumptions,0,values,2027}'<>'0.45'
     or candidate.configuration#>>'{assumptionBook,assumptions,0,values,2028}'<>'0.5'
     or candidate.configuration#>>'{assumptionBook,assumptions,0,sourceType}'<>'offroad_scenario'
     or candidate.configuration#>>'{assumptionBook,assumptions,0,confidence}'<>'low'
     or candidate.configuration#>>'{assumptionBook,assumptions,0,evidence}'<>'[]' then
    raise exception 'the candidate configuration did not carry the proposed value with its own provenance: %',to_jsonb(candidate);
  end if;
end $$;
do $$ declare pr private.institutional_revision_proposals; rejected boolean:=false; begin
  select * into pr from private.institutional_revision_proposals where id='62000000-0000-4000-8000-000000000b01';
  if pr.status<>'approved' or pr.reviewed_by<>'10000000-0000-4000-8000-000000000b02' or pr.candidate_configuration_id is null then
    raise exception 'the approval was not recorded against the approver: %',to_jsonb(pr);
  end if;
  if (select count(*) from private.project_canonical_revisions where capital_project_id='30000000-0000-4000-8000-000000000b01')<>2 then
    raise exception 'the approved change did not record a new canonical revision';
  end if;
  if (select canonical_revision_id from private.institutional_model_results where id='63000000-0000-4000-8000-000000000b01')
     = current_setting('test.proposal_revision')::uuid then
    raise exception 'the recompute was bound to the previous revision';
  end if;
  -- A reviewed proposal is never reviewed again and never deleted.
  begin update private.institutional_revision_proposals set status='rejected' where id=pr.id;
  exception when others then if sqlerrm<>'institutional_revision_proposal_immutable' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'a reviewed proposal was reviewed again'; end if;
  rejected:=false;
  begin delete from private.institutional_revision_proposals where id=pr.id;
  exception when others then if sqlerrm<>'institutional_revision_proposal_history_immutable' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'a reviewed proposal was deleted'; end if;
end $$;

-- 7. Another tenant sees nothing and can do nothing.
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000b04');
do $$ declare rejected boolean:=false; begin
  begin perform public.read_institutional_revision_proposals_v1('30000000-0000-4000-8000-000000000b01');
  exception when insufficient_privilege then
    if sqlerrm<>'institutional_revision_proposal_forbidden' then raise exception 'unexpected denial: %',sqlerrm; end if; rejected:=true; end;
  if not rejected then raise exception 'a foreign tenant read the proposals'; end if;
  rejected:=false;
  begin perform public.review_institutional_revision_proposal_v1('62000000-0000-4000-8000-000000000b01','rejected',repeat('e',64),null,null);
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'a foreign tenant reviewed a proposal'; end if;
  rejected:=false;
  begin perform 1 from private.institutional_revision_proposals;
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'the proposal table is reachable outside its definer functions'; end if;
end $$;

-- 8. The project reads its own proposal history.
select pg_temp.as_user('10000000-0000-4000-8000-000000000b02');
do $$ declare body jsonb; begin
  body := public.read_institutional_revision_proposals_v1('30000000-0000-4000-8000-000000000b01');
  if jsonb_array_length(body->'proposals')<>1 or body#>>'{proposals,0,status}'<>'approved'
     or body#>>'{proposals,0,changes,0,proposed}'<>'0.45' then
    raise exception 'the proposal history is not readable by the project: %',body;
  end if;
end $$;
reset role;

rollback;
select 'institutional_revision_proposals_passed' as result;
