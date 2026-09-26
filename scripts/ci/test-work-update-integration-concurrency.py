#!/usr/bin/env python3
"""Two real sessions, disposable CI only: the approval and the planner, and a decline and the worker.

Stage 18, increment 5C. Each race runs on its own synthetic organization and work, whose first
institutional calculation R0 is complete, in both orders:

- approval and planner. The approve-and-calculate command of a newer configuration (over a new
  version of a document the result read) and the dependency effect of that document version, which
  holds the work lock and then writes rows whose foreign keys take the project row for key share.
  Planner first: the approval waits for the work lock while it holds the project row; the planner's
  key share must go through (for no key update) instead of forming a cycle (deadlock 40P01). Approval
  first: the planner waits for the work lock and proceeds after the commit. Both orders finish, the
  approval queues its recomputation through the graph, and no session reports a deadlock.
- decline and worker. A scheduled institutional recomputation whose job the worker has leased.
  Worker first: the worker's completion holds the job; the decline waits for it, then finds the update
  changed and is refused; the result stays stored and the candidate settled. Decline first: the
  decline holds the job it cancels; the worker's completion waits for it, then finds its capability
  gone and is refused; nothing is written after the decline.
"""
import os
import select
import subprocess
import time
from urllib.parse import urlparse

url = os.environ['DATABASE_URL']
if urlparse(url).hostname not in ('localhost', '127.0.0.1', '::1'):
    raise SystemExit('Work update integration concurrency requires the disposable local CI database')
command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']
owner = 'a5c20000-0000-4000-8000-000000000001'
worker = 'a5c20000-0000-4000-8000-000000000009'
token_id = 'a5c20000-0000-4000-9000-0000000000f0'
token = 'synthetic-5c-integration-race-worker-token-0000000'
capability = 'c' * 64


def run(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise AssertionError(result.stderr)
    return result.stdout.strip()


def ids(n):
    """The synthetic rows of scenario n."""
    base = f'a5c2{n}000-0000-4000-9000-0000000000'
    return {'org': base + '01', 'work': base + '02', 'session': base + '03', 'c1': base + '11', 'c2': base + '12', 's1': base + '21', 's2': base + '22',
            'r0': base + '31', 'r1': base + '32', 'd1': base + '41', 'e1': base + '42', 'd2': base + '43', 'cmd': base + '51'}


def as_person(user):
    return (f"select set_config('request.jwt.claim.sub','{user}',true),"
            f"set_config('request.jwt.claims',jsonb_build_object('sub','{user}','role','authenticated')::text,true);set local role authenticated;")


def document(x, name, logical):
    return ("insert into public.source_documents(id,organization_id,intake_session_id,logical_source_id,object_path,original_name,mime_type,byte_size,sha256,"
            "sha256_verified_at,scan_result,processing_status,created_by)"
            f" values('{x[name]}','{x['org']}','{x['session']}',{logical},'{x['org']}/{x['session']}/{name}.xlsx','Synthetic {name}',"
            f"'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',1,encode(extensions.digest('{x[name]}','sha256'),'hex'),now(),"
            f"'{{\"verdict\":\"clean\"}}','ready','{owner}');")


def rights(x):
    """Declared rights for the documents of the session, as the SQL suites' synthetic factory records them."""
    return ("insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,"
            "evidence_reference,evidence_sha256,created_by) select v.organization_id,v.id,1,array['read','process','store','derive','export'],"
            "array['analysis','retrieval','export'],'authorized_workspace',v.created_at,'human_declaration',v.id,"
            "encode(extensions.digest('SYNTHETIC DECLARATION: '||v.id::text,'sha256'),'hex'),v.created_by from public.source_versions v"
            f" where v.organization_id='{x['org']}' and not exists(select 1 from private.source_rights_versions r where r.organization_id=v.organization_id"
            " and r.source_version_id=v.id);")


def configuration(x, name, revision, parent, documents):
    """A candidate configuration awaiting review; with documents, an initial one over them as they are now."""
    body = f"jsonb_build_object('modelId','synthetic-5c-race','scenario','{name}')"
    manifest = f"private.institutional_source_context('{x['org']}','{x['session']}')->>'sourceManifestFingerprint'"
    parent_fp = 'null' if parent is None else f"(select configuration_fingerprint from private.institutional_model_configurations where id='{x[parent]}')"
    if documents is None:
        evidence = "jsonb_build_object('kind','assumption_change','synthetic',true)"
        submission = ''
    else:
        sub = x['s1'] if name == 'c1' else x['s2']
        reviews = ("(select jsonb_agg(jsonb_build_object('sourceDocument',d.id,'version','1','hash',d.sha256) order by d.id) from public.source_documents d"
                   f" where d.id in ({','.join(repr(x[d]) for d in documents)}))")
        evidence = f"jsonb_build_object('kind','initial_configuration','submissionId','{sub}','sourceManifestFingerprint',{manifest},'lineage','[]'::jsonb,'sourceBindings',{reviews})"
        submission = ("insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,metadata,created_by)"
                      f" select '{sub}',c.organization_id,c.id,c.intake_session_id,'user','completed','Revisar a configuração do modelo financeiro.','pt-BR',"
                      f"jsonb_build_object('kind','institutional_model_setup','institutionalSubmissionId','{sub}'),'{owner}'"
                      f" from public.agent_conversations c where c.intake_session_id='{x['session']}';")
    sql = (submission + "insert into private.institutional_model_configurations(id,organization_id,capital_project_id,revision,configuration,configuration_fingerprint,"
           f"parent_fingerprint,status,answer_evidence) values('{x[name]}','{x['org']}','{x['work']}',{revision},{body},private.institutional_config_hash({body}),"
           f"{parent_fp},'review_required',{evidence});")
    if documents is not None:
        sql += ("insert into private.institutional_model_setup_submissions(id,organization_id,capital_project_id,intake_session_id,source_manifest_fingerprint,"
                f"configuration,source_reviews,status,candidate_id,submitted_by,submitted_at) select '{sub}','{x['org']}','{x['work']}','{x['session']}',{manifest},"
                f"{body},{reviews},'review_required','{x[name]}','{owner}',now();")
    return sql


def approve(x, name, request):
    """The approval command as the owner: the candidate's fingerprints are read first, as the database
    role, then the command runs as the API role."""
    return (f"select set_config('race.candidate',(select jsonb_build_object('parent',c.parent_fingerprint,'fingerprint',c.configuration_fingerprint)::text"
            f" from private.institutional_model_configurations c where c.id='{x[name]}'),true);" + as_person(owner)
            + f"select public.review_institutional_configuration_and_calculate_v1('{x['work']}','{x[name]}',current_setting('race.candidate')::jsonb->>'parent',"
            f"'approved',current_setting('race.candidate')::jsonb->>'fingerprint','{request}','pt-BR');")


def job_of(result):
    return f"(select j.id from public.processing_jobs j where j.kind='agent_operation_brief' and j.payload->>'message_id'='{result}')"


def lease(result):
    return (f"update public.processing_jobs set status='leased',attempts=attempts+1,lease_expires_at=now()+interval '10 minutes',"
            f"capability_sha256=extensions.digest('{capability}','sha256'),leased_by='{token_id}',leased_account_user_id='{worker}' where id={job_of(result)};")


def record(result):
    """The result writer's effect (the economic validation of real artifacts aside), as the SQL suites apply it."""
    return (f"update private.institutional_model_results set status='completed',produced_at=clock_timestamp(),"
            f"artifact=jsonb_build_object('synthetic',true,'result','{result}'),blockers='[]' where id='{result}';")


def base_fixture(n):
    """Organization, work, session and documents; C1 approved by the owner and its result R0 produced."""
    x = ids(n)
    return x, ("begin;"
               f"insert into public.organizations(id,organization_type,name,created_by) values('{x['org']}','company','Synthetic 5C race {n}','{owner}');"
               f"insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('{x['org']}','{owner}','owner','active',now());"
               f"insert into public.capital_projects(id,organization_id,project_name,created_by) values('{x['work']}','{x['org']}','Synthetic 5C race work {n}','{owner}');"
               "insert into public.document_intake_sessions(id,organization_id,capital_project_id,started_by,journey,locale)"
               f" values('{x['session']}','{x['org']}','{x['work']}','{owner}','company','pt-BR');"
               f"insert into public.agent_conversations(organization_id,intake_session_id,state,created_by) values('{x['org']}','{x['session']}','idle','{owner}');"
               + document(x, 'd1', 'null') + document(x, 'e1', 'null') + rights(x) + configuration(x, 'c1', 1, None, ['d1', 'e1'])
               + approve(x, 'c1', x['r0']) + 'reset role;'
               + f"update public.agent_messages set status='completed' where id='{x['r0']}';"
               + lease(x['r0']) + record(x['r0'])
               + f"update public.processing_jobs set status='succeeded',capability_sha256=null,leased_by=null,lease_expires_at=null where id={job_of(x['r0'])};"
               + 'commit;')


def barrier_session(sql, name):
    """A session that runs sql, prints BARRIER while its transaction stays open, and waits."""
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    process.stdin.write(f"set application_name='{name}';\n" + sql + "\nselect 'BARRIER';\n")
    process.stdin.flush()
    output = []
    deadline = time.monotonic() + 30
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not select.select([process.stdout], [], [], remaining)[0]:
            raise AssertionError(f'{name} did not reach its barrier: {output}')
        line = process.stdout.readline()
        if not line and process.poll() is not None:
            raise AssertionError(f'{name} ended before its barrier: {output}')
        if line.strip() == 'BARRIER':
            return process, output
        output.append(line.strip())


def contender(sql, name):
    """A session that runs sql to the end; the caller checks it waits on a lock first."""
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    process.stdin.write(f"set application_name='{name}';\n" + sql + '\n')
    process.stdin.close()
    process.stdin = None
    deadline = time.monotonic() + 30
    while run(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event_type='Lock';") != '1':
        if time.monotonic() >= deadline or process.poll() is not None:
            raise AssertionError(f'{name} did not wait on a lock: {process.communicate(timeout=10)[0] if process.poll() is not None else ""}')
        time.sleep(.05)
    return process


def finish(holder, holder_output, rest, other):
    """Ends the holder with rest, then collects both outputs."""
    try:
        holder.stdin.write(rest + '\n')
        holder.stdin.close()
        holder.stdin = None
        first = '\n'.join(holder_output) + '\n' + holder.communicate(timeout=60)[0]
        second = other.communicate(timeout=60)[0]
    finally:
        for process in (holder, other):
            if process.poll() is None:
                process.kill()
                process.wait(timeout=10)
    return holder.returncode, first, other.returncode, second


run(f"insert into auth.users(id,email) values('{owner}','race-5c-owner@example.invalid'),('{worker}','race-5c-worker@example.invalid');"
    f"insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id) values('{token_id}','Synthetic 5C race worker',"
    f"extensions.digest('{token}','sha256'),'{worker}');")

# 1-2. The approval and the planner, both orders.
for n, planner_first in ((1, True), (2, False)):
    x, sql = base_fixture(n)
    run(sql)
    # A newer version of D1, whose dependency event stays pending for the planner session; then C2,
    # an initial configuration over the documents as they are now.
    run('begin;' + document(x, 'd2', f"(select source_id from public.source_versions where id='{x['d1']}')") + rights(x)
        + configuration(x, 'c2', 2, 'c1', ['d2', 'e1']) + 'commit;')
    event = run(f"select id from private.domain_events where organization_id='{x['org']}' and aggregate_kind='source_version' and aggregate_id="
                f"(select source_id from public.source_versions where id='{x['d2']}');")
    assert event, 'the new document version emitted no dependency event'
    work_lock = f"select pg_advisory_xact_lock(hashtextextended('work-continuation:{x['org']}:{x['work']}',0));"
    planner = f"select private.apply_dependency_event_v1('{x['org']}','{event}');"
    approval = 'begin;' + approve(x, 'c2', x['r1'])
    if planner_first:
        # The planner holds the work lock; the approval, holding the project row, waits for it; then the
        # planner writes the rows whose foreign keys take the project row for key share.
        holder, held = barrier_session('begin;' + work_lock, 'offroad_5c_planner')
        other = contender(approval + 'commit;', 'offroad_5c_approval')
        planner_code, planner_output, approval_code, approval_output = finish(holder, held, planner + 'commit;', other)
    else:
        holder, held = barrier_session(approval, 'offroad_5c_approval')
        other = contender('begin;' + planner + 'commit;', 'offroad_5c_planner')
        approval_code, approval_output, planner_code, planner_output = finish(holder, held, 'commit;', other)
    for label, code, output in (('approval', approval_code, approval_output), ('planner', planner_code, planner_output)):
        assert code == 0 and 'deadlock' not in output and 'ERROR' not in output, f'{label} ({"planner" if planner_first else "approval"} first): {output}'
    assert '"status": "dependency_update"' in approval_output, approval_output
    state = run(f"select r.status||':'||(r.recompute_candidate_id is not null)||':'||(select count(*) from public.institutional_recompute_candidates c"
                f" where c.work_id='{x['work']}' and c.state='scheduled') from private.institutional_model_results r where r.id='{x['r1']}';")
    assert state == 'queued:true:1', state
    print(f'work_update_integration_concurrency: PASS ({"planner" if planner_first else "approval"} first: observed lock wait, '
          'the approval queued its recomputation through the graph, no deadlock)')

# 3-4. A decline and the worker, both orders.
for n, worker_first in ((3, True), (4, False)):
    x, sql = base_fixture(n)
    run(sql)
    run('begin;' + configuration(x, 'c2', 2, 'c1', None) + approve(x, 'c2', x['r1']) + 'reset role;' + lease(x['r1'])
        + (record(x['r1']) if worker_first else '') + 'commit;')
    request, revision = run(f"select r.id||'|'||r.revision from public.work_continuation_requests r join public.institutional_recompute_candidates c on c.request_id=r.id"
                            f" where c.result_id='{x['r1']}' and c.state='scheduled';").split('|')
    job = run(f'select {job_of(x["r1"])};')
    completion = 'begin;' + as_person(worker) + f"select public.worker_complete_job('{job}','{capability}','{{}}'::jsonb);"
    decline = 'begin;' + as_person(owner) + f"select public.decline_work_update_v1('{x['cmd']}','{request}',{revision},'not_needed');"
    if worker_first:
        holder, held = barrier_session(completion, 'offroad_5c_worker')
        other = contender(decline + 'commit;', 'offroad_5c_decline')
        worker_code, worker_output, decline_code, decline_output = finish(holder, held, 'commit;', other)
        assert worker_code == 0 and 'ERROR' not in worker_output, worker_output
        assert decline_code != 0 and 'work_update_changed' in decline_output and 'deadlock' not in decline_output, decline_output
        state = run(f"select c.state||':'||r.status||':'||j.status||':'||q.status from public.institutional_recompute_candidates c"
                    f" join private.institutional_model_results r on r.id=c.result_id join public.processing_jobs j on j.id='{job}'"
                    f" join public.work_continuation_requests q on q.id=c.request_id where c.result_id='{x['r1']}';")
        assert state == 'settled:completed:succeeded:ready', state
        print('work_update_integration_concurrency: PASS (worker first: the decline waited for the job, then was refused as changed; '
              'the result stays stored and the update ready, no deadlock)')
    else:
        holder, held = barrier_session(decline, 'offroad_5c_decline')
        other = contender(completion + 'commit;', 'offroad_5c_worker')
        decline_code, decline_output, worker_code, worker_output = finish(holder, held, 'commit;', other)
        assert decline_code == 0 and 'ERROR' not in decline_output, decline_output
        assert worker_code != 0 and 'job_capability_invalid' in worker_output and 'deadlock' not in worker_output, worker_output
        state = run(f"select c.state||':'||c.reason||':'||r.status||':'||j.status||':'||(j.last_error->>'reason')||':'||q.status"
                    f" from public.institutional_recompute_candidates c join private.institutional_model_results r on r.id=c.result_id"
                    f" join public.processing_jobs j on j.id='{job}' join public.work_continuation_requests q on q.id=c.request_id where c.result_id='{x['r1']}';")
        assert state == 'declined:person_declined:not_needed:queued:cancelled:person_declined:declined', state
        print('work_update_integration_concurrency: PASS (decline first: the worker waited for the job, then was refused; '
              'the job was cancelled and nothing was written after the decline, no deadlock)')
