-- Stage 19, increment 7 (part A): the staging rehearsal of the artifact revision backfill of
-- migration A (supabase/migrations/20260926183957_artifact_revision_protocol.sql). The plan asks for
-- the backfill of staging "ensaiado com fixture sintética". Staging has no row in the four legacy
-- stores, so the rehearsal brings its own: a synthetic tenant with fixed RFC 9562 uuids (prefix
-- a4199000, used by no test), its work and intake session, the plan, task runs and processing job a
-- capital_project_artifacts row requires, the institutional configuration a result requires, and the
-- legacy rows the backfill reaches, written with the four artifact_revision_projection triggers
-- disabled so that they stand for rows written before migration A. It re-enables the triggers, runs
-- private.backfill_artifact_revisions_v1() twice and checks what the migration promises; each failed
-- check raises its own exception, named artifact_backfill_rehearsal_<check>.
--
-- How to run: paste the whole text into a SQL console as one text. It is a single statement, needs
-- no psql meta-command and cannot commit: its last act raises artifact_backfill_rehearsal_passed:
-- followed by the counts of the two runs, so everything it wrote rolls back (fixture, revisions and
-- the disabled triggers alike) and the result is read from the error message. Any other message is
-- a failed rehearsal. The role that runs it must own the four legacy tables (alter table ... disable
-- trigger) and be able to write auth.users. Proved on a disposable replay of every migration, see
-- docs/build/arcabouco/etapa-19-7a-ensaio-do-backfill.md.
do $rehearsal$
declare
 -- The synthetic tenant and what the legacy rows require.
 v_owner uuid:='a4199000-0000-4000-8000-000000000001';
 v_org uuid:='a4199000-0000-4000-9000-000000000001';
 v_work uuid:='a4199000-0000-4000-9000-000000000002';
 v_session uuid:='a4199000-0000-4000-9000-000000000003';
 v_run uuid:='a4199000-0000-4000-9000-000000000004';
 v_job uuid:='a4199000-0000-4000-9000-000000000005';
 v_plan uuid:='a4199000-0000-4000-9000-000000000006';
 v_task uuid:='a4199000-0000-4000-9000-000000000007';
 v_task_run_1 uuid:='a4199000-0000-4000-9000-000000000008';
 v_task_run_2 uuid:='a4199000-0000-4000-9000-000000000009';
 v_configuration uuid:='a4199000-0000-4000-9000-000000000010';
 v_conversation uuid:='a4199000-0000-4000-9000-000000000011';
 -- The legacy rows: two versions of one artifact type and one of another type, one case manifest,
 -- one completed institutional result, one material and one deal state object of another type.
 v_brief_1 uuid:='a4199000-0000-4000-9000-000000000021';
 v_brief_2 uuid:='a4199000-0000-4000-9000-000000000022';
 v_alternatives uuid:='a4199000-0000-4000-9000-000000000023';
 v_case_manifest uuid:='a4199000-0000-4000-9000-000000000031';
 v_result uuid:='a4199000-0000-4000-9000-000000000041';
 v_material uuid:='a4199000-0000-4000-9000-000000000051';
 v_understanding uuid:='a4199000-0000-4000-9000-000000000052';
 v_later_material uuid:='a4199000-0000-4000-9000-000000000053';
 -- Contents and fingerprints, each the sha256 of its own jsonb text.
 c_brief_1 jsonb:='{"synthetic":true,"artifactType":"meeting_brief","version":1}';
 c_brief_2 jsonb:='{"synthetic":true,"artifactType":"meeting_brief","version":2}';
 c_alternatives jsonb:='{"synthetic":true,"artifactType":"alternative_map","version":1}';
 c_configuration jsonb:='{"synthetic":true,"scenario":"base"}';
 input_fp text:=encode(extensions.digest('synthetic backfill rehearsal input','sha256'),'hex');
 c_case_manifest jsonb;c_result jsonb;c_material jsonb;c_understanding jsonb;
 stores regclass[]:=array['public.capital_project_artifacts','public.case_artifact_manifests','private.institutional_model_results','public.deal_state_objects']::regclass[];
 counts jsonb;again jsonb;links jsonb;expected_links jsonb;before bigint;n integer:=0;
 r record;rev public.artifact_revisions;rev_1 public.artifact_revisions;rev_2 public.artifact_revisions;
begin
 perform set_config('lock_timeout','5s',true);

 -- 1. The synthetic tenant: owner, organization, membership, work and intake session.
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(v_owner,'authenticated','authenticated','artifact-backfill-rehearsal@example.invalid','{}','{}',now(),now());
 insert into public.organizations(id,organization_type,name,created_by) values(v_org,'company','Synthetic artifact backfill rehearsal',v_owner);
 insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values(v_org,v_owner,'owner','active',now());
 insert into public.capital_projects(id,organization_id,project_name,created_by) values(v_work,v_org,'Synthetic backfill rehearsal work',v_owner);
 insert into public.document_intake_sessions(id,organization_id,capital_project_id,started_by,journey) values(v_session,v_org,v_work,v_owner,'company');

 -- 2. What a capital_project_artifacts row requires: the processing run and job that wrote it, the
 -- plan with its task, and one task run per version of a type.
 insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by)
 values(v_run,v_org,v_session,1,'manual','synthetic-backfill-rehearsal',v_owner);
 insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
 values(v_job,v_org,v_session,v_run,'agent_operation_brief','queued','{}');
 insert into public.capital_project_plans(id,organization_id,capital_project_id,plan_version,entry_job,schema_version,compiler_version,registry_version,
  plan_fingerprint,status,confirmation_gate,first_work_product,target_task_ids,input_policy,parallel_batches,task_count,snapshot,created_by)
 values(v_plan,v_org,v_work,1,'capital_planning','capital-project-plan.v1','rehearsal-v1','rehearsal-v1',
  encode(extensions.digest(v_plan::text,'sha256'),'hex'),'active','structure','meeting_brief',array['S11'],'{"synthetic":true}','[["S11"]]',1,'{"synthetic":true}',v_owner);
 insert into public.capital_project_plan_tasks(id,organization_id,capital_project_id,plan_id,task_id,ordinal,batch_no,label,graph,dependencies,execution_class,effect,maturity_at_compile)
 values(v_task,v_org,v_work,v_plan,'S11',0,0,'Synthetic backfill rehearsal task','case','{}','compilation','propose_state','specified');
 insert into public.capital_project_task_runs(id,organization_id,capital_project_id,plan_id,plan_task_id,attempt_no,status,trigger_event)
 values(v_task_run_1,v_org,v_work,v_plan,v_task,1,'queued','{"synthetic":true}'),(v_task_run_2,v_org,v_work,v_plan,v_task,2,'queued','{"synthetic":true}');

 -- 3. What an institutional result requires: a configuration of the work, and the message that asked
 -- for it (a result that is no recomputation carries its message's id as its own).
 insert into private.institutional_model_configurations(id,organization_id,capital_project_id,revision,configuration,configuration_fingerprint,status)
 values(v_configuration,v_org,v_work,1,c_configuration,encode(extensions.digest(c_configuration::text,'sha256'),'hex'),'review_required');
 insert into public.agent_conversations(id,organization_id,intake_session_id,created_by) values(v_conversation,v_org,v_session,v_owner);
 insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,created_by)
 values(v_result,v_org,v_conversation,v_session,'user','completed','Synthetic backfill rehearsal request','pt-BR',v_owner);

 -- 4. The legacy rows, written as before migration A: the four projection triggers off.
 alter table public.capital_project_artifacts disable trigger artifact_revision_projection;
 alter table public.case_artifact_manifests disable trigger artifact_revision_projection;
 alter table private.institutional_model_results disable trigger artifact_revision_projection;
 alter table public.deal_state_objects disable trigger artifact_revision_projection;
 insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,
  input_fingerprint,artifact_fingerprint,content,processing_job_id,created_by_kind,superseded_at)
 values(v_brief_1,v_org,v_work,v_plan,v_task_run_1,'meeting_brief','synthetic.v1',1,'superseded',input_fp,encode(extensions.digest(c_brief_1::text,'sha256'),'hex'),c_brief_1,v_job,'worker',now()),
  (v_brief_2,v_org,v_work,v_plan,v_task_run_2,'meeting_brief','synthetic.v1',2,'pending_confirmation',input_fp,encode(extensions.digest(c_brief_2::text,'sha256'),'hex'),c_brief_2,v_job,'worker',null),
  (v_alternatives,v_org,v_work,v_plan,v_task_run_1,'alternative_map','synthetic.v1',1,'draft',input_fp,encode(extensions.digest(c_alternatives::text,'sha256'),'hex'),c_alternatives,v_job,'worker',null);
 c_case_manifest:=jsonb_build_object('runId',v_run,'sources','[]'::jsonb,
  'outputs',jsonb_build_array(jsonb_build_object('artifactId','case-state','kind','case_state','sha256',encode(extensions.digest('synthetic case state','sha256'),'hex'))));
 insert into public.case_artifact_manifests(id,organization_id,intake_session_id,processing_run_id,schema_version,locale,input_fingerprint,manifest_fingerprint,manifest,created_by)
 values(v_case_manifest,v_org,v_session,v_run,'2026.08.25-v4','pt-BR',input_fp,encode(extensions.digest(c_case_manifest::text,'sha256'),'hex'),c_case_manifest,v_owner);
 c_result:=jsonb_build_object('modelKind','institutional','version','institutional-workbook-snapshot.v1',
  'workbooks',jsonb_build_object('pt',jsonb_build_object('sha256',encode(extensions.digest('synthetic workbook pt','sha256'),'hex'),'byteSize',4096),
   'en',jsonb_build_object('sha256',encode(extensions.digest('synthetic workbook en','sha256'),'hex'),'byteSize',4100)),
  'institutional',jsonb_build_object('activeScenarioId',v_configuration,'scenarios',jsonb_build_array(jsonb_build_object('configurationId',v_configuration,
   'configurationFingerprint',encode(extensions.digest(c_configuration::text,'sha256'),'hex'),'outputFingerprint',encode(extensions.digest('synthetic output','sha256'),'hex'),'sourceBindings','[]'::jsonb))));
 c_result:=c_result||jsonb_build_object('fingerprint',encode(extensions.digest(c_result::text,'sha256'),'hex'));
 insert into private.institutional_model_results(id,organization_id,capital_project_id,intake_session_id,configuration_id,configuration_fingerprint,source_manifest_fingerprint,
  status,artifact,produced_at,requested_by)
 values(v_result,v_org,v_work,v_session,v_configuration,encode(extensions.digest(c_configuration::text,'sha256'),'hex'),encode(extensions.digest(c_case_manifest::text,'sha256'),'hex'),
  'completed',c_result,now(),v_owner);
 c_material:=jsonb_build_object('schemaVersion','2026.08.29-v1','materials',jsonb_build_array(jsonb_build_object('kind','teaser','artifactFingerprint',encode(extensions.digest('synthetic teaser','sha256'),'hex'))),
  'materialTruth','{}'::jsonb,'dataRoom','{}'::jsonb);
 c_understanding:='{"readiness":{"state":"ready"}}';
 insert into public.deal_state_objects(id,organization_id,intake_session_id,object_type,object_version,status,input_fingerprint,object_fingerprint,payload,dependencies,created_by_kind)
 values(v_material,v_org,v_session,'material_artifact',1,'pending_confirmation',input_fp,encode(extensions.digest(c_material::text,'sha256'),'hex'),c_material,'[]','worker'),
  (v_understanding,v_org,v_session,'understanding_snapshot',1,'draft',input_fp,encode(extensions.digest(c_understanding::text,'sha256'),'hex'),c_understanding,'[]','worker');
 if exists(select 1 from public.artifact_revisions v where v.organization_id=v_org) or exists(select 1 from public.artifacts a where a.organization_id=v_org) then
  raise exception 'artifact_backfill_rehearsal_projected_before_backfill';
 end if;
 alter table public.capital_project_artifacts enable trigger artifact_revision_projection;
 alter table public.case_artifact_manifests enable trigger artifact_revision_projection;
 alter table private.institutional_model_results enable trigger artifact_revision_projection;
 alter table public.deal_state_objects enable trigger artifact_revision_projection;
 if (select count(*) from pg_catalog.pg_trigger t where t.tgname='artifact_revision_projection' and t.tgenabled='O' and t.tgrelid=any(stores))<>4 then
  raise exception 'artifact_backfill_rehearsal_trigger_not_enabled';
 end if;

 -- 5. The backfill: exactly the six rows it reaches, counted {3,1,1,1}, and nothing else.
 before:=(select count(*) from public.artifact_revisions);
 counts:=private.backfill_artifact_revisions_v1();
 if counts<>'{"capitalProjectArtifacts":3,"caseArtifactManifests":1,"institutionalModelResults":1,"dealStateMaterials":1}'::jsonb
  or (select count(*) from public.artifact_revisions)<>before+6 or (select count(*) from public.artifact_revisions v where v.organization_id=v_org)<>6
 then raise exception 'artifact_backfill_rehearsal_counts: % (% revisions written)',counts,(select count(*) from public.artifact_revisions)-before; end if;

 -- 6. Every projected revision: origin legacy, audience internal, the v5 id of its store and row, the
 -- row's own fingerprint verbatim in legacy_ref, no actor, no bytes, no block, no method, execution,
 -- input snapshot or source, and no link except the institutional result's own.
 for r in
  select 'capital_project_artifacts' as store,x.id,x.artifact_fingerprint as fingerprint,'work_product' as kind,x.artifact_type as subject,null::jsonb as result
   from public.capital_project_artifacts x where x.organization_id=v_org
  union all select 'case_artifact_manifests',x.id,x.manifest_fingerprint,'work_product','case-snapshot:'||x.intake_session_id::text,null
   from public.case_artifact_manifests x where x.organization_id=v_org
  union all select 'institutional_model_results',x.id,x.artifact->>'fingerprint','model_result','institutional-workbook',jsonb_build_object('id',x.id,'configurationFingerprint',x.configuration_fingerprint)
   from private.institutional_model_results x where x.organization_id=v_org
  union all select 'deal_state_objects',x.id,x.object_fingerprint,'material','materials:'||x.intake_session_id::text,null
   from public.deal_state_objects x where x.organization_id=v_org and x.object_type='material_artifact'
 loop
  n:=n+1;
  select v.* into rev from public.artifact_revisions v where v.organization_id=v_org and v.legacy_ref->>'table'=r.store and v.legacy_ref->>'id'=r.id::text;
  if rev.id is null or rev.id<>private.artifact_projection_revision_id_v1(r.store,r.id)
   or rev.id<>extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:artifact-revision:'||r.store||':'||r.id::text) or substr(rev.id::text,15,1)<>'5'
   or rev.origin<>'legacy' or rev.audience<>'internal' or rev.created_by is not null
   or rev.legacy_ref->>'fingerprint' is distinct from r.fingerprint or rev.legacy_ref is distinct from rev.manifest->'legacy'
   or rev.content_sha256 is not null or rev.byte_length is not null or jsonb_typeof(rev.manifest->'bytes')<>'null'
   or rev.manifest->'sources'<>'[]'::jsonb or jsonb_typeof(rev.manifest->'method')<>'null' or jsonb_typeof(rev.manifest->'execution')<>'null'
   or jsonb_typeof(rev.manifest->'inputSnapshot')<>'null' or (rev.manifest->'institutionalResult') is distinct from coalesce(r.result,'null'::jsonb)
   or not exists(select 1 from public.artifacts a where a.organization_id=v_org and a.id=rev.artifact_id and a.kind=r.kind and a.subject=r.subject and a.legacy_origin->>'table'=r.store)
   or exists(select 1 from public.artifact_blocks b where b.organization_id=v_org and b.revision_id=rev.id)
  then raise exception 'artifact_backfill_rehearsal_revision: % % %',r.store,r.id,
   jsonb_build_object('id',rev.id,'origin',rev.origin,'audience',rev.audience,'legacyFingerprint',rev.legacy_ref->>'fingerprint','rowFingerprint',r.fingerprint); end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind',l.link_kind,'result',l.institutional_result_id,'block',l.block_id)),'[]'::jsonb) into links
   from private.artifact_dependency_links l where l.organization_id=v_org and l.revision_id=rev.id;
  expected_links:='[]'::jsonb;
  if r.store='institutional_model_results' then
   expected_links:=jsonb_build_array(jsonb_build_object('kind','institutional_result','result',r.id,'block',null));
  end if;
  if links<>expected_links then raise exception 'artifact_backfill_rehearsal_links: % % %',r.store,r.id,links; end if;
 end loop;
 if n<>6 then raise exception 'artifact_backfill_rehearsal_rows: %',n; end if;
 if exists(select 1 from public.artifact_revisions v where v.organization_id=v_org and v.legacy_ref->>'id'=v_understanding::text)
  or exists(select 1 from public.artifact_revisions v where v.id=private.artifact_projection_revision_id_v1('deal_state_objects',v_understanding)) then
  raise exception 'artifact_backfill_rehearsal_non_material_projected';
 end if;

 -- 7. The two versions of one type are revisions 1 and 2 of one artifact, the head on 2 and 2 pointing
 -- back to 1; five artifacts, each with the head on its latest revision.
 select v.* into rev_1 from public.artifact_revisions v where v.id=private.artifact_projection_revision_id_v1('capital_project_artifacts',v_brief_1);
 select v.* into rev_2 from public.artifact_revisions v where v.id=private.artifact_projection_revision_id_v1('capital_project_artifacts',v_brief_2);
 if rev_1.artifact_id is distinct from rev_2.artifact_id or rev_1.revision_no<>1 or rev_2.revision_no<>2
  or rev_1.previous_revision_id is not null or rev_2.previous_revision_id is distinct from rev_1.id
  or (select a.head_revision_id from public.artifacts a where a.organization_id=v_org and a.id=rev_2.artifact_id) is distinct from rev_2.id
  or (select count(*) from public.artifact_revisions v where v.organization_id=v_org and v.artifact_id=rev_2.artifact_id)<>2
 then raise exception 'artifact_backfill_rehearsal_versions: % %',jsonb_build_object('id',rev_1.id,'no',rev_1.revision_no,'previous',rev_1.previous_revision_id),
  jsonb_build_object('id',rev_2.id,'no',rev_2.revision_no,'previous',rev_2.previous_revision_id); end if;
 if (select count(*) from public.artifacts a where a.organization_id=v_org)<>5
  or exists(select 1 from public.artifacts a where a.organization_id=v_org and a.head_revision_id is distinct from
   (select v.id from public.artifact_revisions v where v.organization_id=a.organization_id and v.artifact_id=a.id order by v.revision_no desc limit 1))
 then raise exception 'artifact_backfill_rehearsal_heads'; end if;

 -- 8. A second run adds nothing, and the flag is off afterwards: a row written after the backfill
 -- projects through its trigger with its writer's origin, as the next revision of its artifact.
 again:=private.backfill_artifact_revisions_v1();
 if again<>'{"capitalProjectArtifacts":0,"caseArtifactManifests":0,"institutionalModelResults":0,"dealStateMaterials":0}'::jsonb
  or (select count(*) from public.artifact_revisions)<>before+6 then
  raise exception 'artifact_backfill_rehearsal_second_run: %',again; end if;
 if current_setting('offroad.artifact_backfill',true) is distinct from 'off' then
  raise exception 'artifact_backfill_rehearsal_flag: %',current_setting('offroad.artifact_backfill',true); end if;
 insert into public.deal_state_objects(id,organization_id,intake_session_id,object_type,object_version,status,input_fingerprint,object_fingerprint,payload,dependencies,created_by_kind)
 values(v_later_material,v_org,v_session,'material_artifact',2,'pending_confirmation',input_fp,encode(extensions.digest((c_material||'{"version":2}')::text,'sha256'),'hex'),c_material||'{"version":2}','[]','worker');
 select v.* into rev from public.artifact_revisions v where v.id=private.artifact_projection_revision_id_v1('deal_state_objects',v_later_material);
 if rev.id is null or rev.origin<>'worker' or rev.revision_no<>2
  or rev.previous_revision_id is distinct from private.artifact_projection_revision_id_v1('deal_state_objects',v_material)
  or (select a.head_revision_id from public.artifacts a where a.organization_id=v_org and a.id=rev.artifact_id) is distinct from rev.id
 then raise exception 'artifact_backfill_rehearsal_after_backfill: %',jsonb_build_object('id',rev.id,'origin',rev.origin,'no',rev.revision_no); end if;

 -- 9. Passed: the exception carries the counts and rolls everything back.
 raise exception 'artifact_backfill_rehearsal_passed: first run %, second run %',counts,again;
end
$rehearsal$;
