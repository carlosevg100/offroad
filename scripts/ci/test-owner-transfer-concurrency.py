#!/usr/bin/env python3
"""Two real sessions: prove the second transfer waits, then loses after authority changes.
Local CI only. Staging uses the same SQL with the explicitly selected staging connector.
"""
import os
from pathlib import Path
import select
import subprocess
import time
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
ORG = 'a11c0000-0000-4000-9000-000000000001'
ACTOR = 'a11c0000-0000-4000-8000-000000000001'
WINNER = 'a11c0000-0000-4000-8000-000000000002'
LOSER = 'a11c0000-0000-4000-8000-000000000003'
url = os.environ['DATABASE_URL']
if urlparse(url).hostname not in ('localhost', '127.0.0.1', '::1'):
    raise SystemExit('Concurrency fixture runner is restricted to the local CI database')
command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']


def run(sql):
    return subprocess.run(command, input=sql, text=True, capture_output=True, timeout=30, check=True).stdout.strip()


def start():
    return subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1)


def transfer(target):
    return ("set local role authenticated; select set_config('request.jwt.claim.sub','" + ACTOR +
            "',true); select public.transfer_organization_owner_v1('" + ORG + "','" + target + "');")


first = second = None
run((ROOT / 'supabase/tests/support/organization_owner_concurrency_setup.sql').read_text())
try:
    first = start()
    first.stdin.write("\\o /dev/null\nbegin;\n" + transfer(WINNER) + "\n\\echo TRANSFER_LOCK_HELD\n")
    first.stdin.flush()
    deadline = time.monotonic() + 20
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not select.select([first.stdout], [], [], remaining)[0]:
            raise AssertionError('First transfer did not acquire its lock')
        if first.stdout.readline().strip() == 'TRANSFER_LOCK_HELD':
            break
        if first.poll() is not None:
            raise AssertionError('First transfer terminated before the barrier')
    second = start()
    second.stdin.write("set application_name='offroad_owner_transfer_loser'; begin;\n" + transfer(LOSER) + "\ncommit;\n")
    second.stdin.close()
    second.stdin = None
    deadline = time.monotonic() + 20
    while run("select count(*) from pg_stat_activity where application_name='offroad_owner_transfer_loser' and wait_event_type='Lock';") != '1':
        if time.monotonic() >= deadline or second.poll() is not None:
            raise AssertionError('Competing transfer did not wait on the organization lock')
        time.sleep(0.05)
    first.stdin.write("commit;\n")
    first.stdin.close()
    first.stdin = None
    first_output = first.communicate(timeout=20)[0]
    second_output = second.communicate(timeout=20)[0]
    assert first.returncode == 0, first_output
    assert second.returncode != 0 and 'organization_owner_required' in second_output, second_output
    state = run("select count(*) filter(where role='owner' and status='active'), "
                "count(*) filter(where user_id='" + WINNER + "' and role='owner'), "
                "count(*) filter(where user_id='" + LOSER + "' and role='member') "
                "from public.organization_memberships where organization_id='" + ORG + "';")
    assert state == '1|1|1', state
    print('owner_transfer_concurrency: PASS (observed lock wait, one winner, one denial, one active owner)')
finally:
    for process in (first, second):
        if process is not None and process.poll() is None:
            process.kill()
            process.wait(timeout=10)
    run((ROOT / 'supabase/tests/support/organization_owner_concurrency_cleanup.sql').read_text())
