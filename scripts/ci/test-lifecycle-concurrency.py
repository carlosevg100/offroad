#!/usr/bin/env python3
"""Observed hold/lease linearization on the real SDK fixture; local disposable DB only."""
import json, os, select, subprocess, time
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

url = os.environ['DATABASE_URL']
assert urlparse(url).hostname in ('localhost', '127.0.0.1', '::1')
fixture = json.loads(Path(os.environ['OFFROAD_LIFECYCLE_FIXTURE_FILE']).read_text())
assert fixture['environment'] == 'local'
command = ['psql', url, '-XAtq', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']

def literal(value):
    return "'" + str(value).replace("'", "''") + "'"

def auth(actor):
    claims = json.dumps(dict(sub=actor, role='authenticated'))
    headers = json.dumps({'x-offroad-workspace': fixture['organizationId']})
    return (f"select set_config('request.jwt.claim.sub',{literal(actor)},true);"
            f"select set_config('request.jwt.claims',{literal(claims)},true);"
            f"select set_config('request.headers',{literal(headers)},true);set local role authenticated;")

def run(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError('lifecycle_concurrency_sql_failed')
    return result.stdout.strip()

def contend(actor, statement, second_actor, second_statement, expected_code=None):
    holder = contender = None
    claimed = None
    try:
        holder = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, bufsize=1)
        holder.stdin.write('\\o /dev/null\nbegin;' + auth(actor) + statement + '\n\\echo LIFECYCLE_LOCK_HELD\n')
        holder.stdin.flush()
        deadline = time.monotonic() + 15
        while True:
            remaining = deadline - time.monotonic()
            assert remaining > 0 and select.select([holder.stdout], [], [], remaining)[0], 'holder_barrier_missing'
            line = holder.stdout.readline().strip()
            if line.startswith('LIFECYCLE_CLAIM:'):
                claimed = json.loads(line.removeprefix('LIFECYCLE_CLAIM:'))
            if line == 'LIFECYCLE_LOCK_HELD':
                break
            assert holder.poll() is None, 'holder_failed'
        contender = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True)
        contender.stdin.write("set application_name='offroad_lifecycle_contender';begin;" + auth(second_actor) + second_statement + 'commit;\n')
        contender.stdin.close()
        contender.stdin = None
        deadline = time.monotonic() + 15
        while run("select count(*) from pg_stat_activity where application_name='offroad_lifecycle_contender' and wait_event_type='Lock';") != '1':
            assert time.monotonic() < deadline and contender.poll() is None, 'observed_lock_required'
            time.sleep(.05)
        holder.stdin.write('commit;\n\\q\n')
        holder.stdin.flush()
        holder.stdin.close()
        holder.stdin = None
        holder.communicate(timeout=15)
        output = contender.communicate(timeout=15)[0]
        assert holder.returncode == 0, 'holder_commit_failed'
        if expected_code:
            assert contender.returncode != 0 and expected_code in output, 'contender_expected_denial_missing'
        else:
            assert contender.returncode == 0, 'contender_failed'
        return claimed
    finally:
        for process in (holder, contender):
            if process and process.poll() is None:
                process.kill()
                process.wait(timeout=10)

owner, worker, work = fixture['actorId'], fixture['workerId'], fixture['workId']
token = literal(fixture['workerToken'])
hold_id = str(uuid4())
hold_statement = f"select public.place_legal_hold_v1('{work}','{hold_id}');"
claim = f"select public.worker_claim_retention_action_v1({token});"
contend(owner, hold_statement, worker, claim)
assert run(f"select count(*) from private.retention_actions where organization_id='{fixture['organizationId']}' and state='leased';") == '0'
new_hold = run(f"select id from private.legal_holds where organization_id='{fixture['organizationId']}' and resource_id='{work}' and released_at is null;")
run('begin;' + auth(owner) + f"select public.release_legal_hold_v1('{new_hold}','{uuid4()}');commit;")
print('PASS lifecycle_hold_commits_before_claim_observed_lock_no_destruction')
lease_statement = (f"create temporary table lifecycle_lease as select public.worker_claim_retention_action_v1({token}) item;"
    "\n\\o\nselect 'LIFECYCLE_CLAIM:'||item::text from lifecycle_lease;\n\\o /dev/null\n")
leased = contend(worker, lease_statement, owner, f"select public.place_legal_hold_v1('{work}','{uuid4()}');", '55000')
action = run(f"select id from private.retention_actions where organization_id='{fixture['organizationId']}' and state='leased';")
assert leased and leased['claimed'] and leased['actionId'] == action, 'destruction_lease_missing'
assert (leased['bucket'], leased['path']) == (fixture['receipt']['storage']['bucket'], fixture['receipt']['storage']['path'])
# The SQL lease was a real admitted operation. Explicitly schedule its retry so the SDK
# can perform the physical deletion; no metadata deletion or invented completion receipt.
retry = f"select public.worker_retry_retention_action_v1({token},'{action}',{literal(leased['capability'])},'storage_delete_failed');"
run('begin;' + auth(worker) + retry + 'commit;')
print('PASS lifecycle_claim_commits_before_hold_observed_lock_late_hold_denied')
