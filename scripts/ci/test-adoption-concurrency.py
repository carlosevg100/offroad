#!/usr/bin/env python3
"""Two real sessions: prove adoption CAS waits, then rejects a stale revision.
Local CI only. Staging uses the same SQL with the explicitly selected staging connector.
"""
import os
from pathlib import Path
import select
import subprocess
import time
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
ACTOR = 'a11b0000-0000-4000-8000-000000000001'
url = os.environ['DATABASE_URL']
if urlparse(url).hostname not in ('localhost', '127.0.0.1', '::1'):
    raise SystemExit('Concurrency fixture runner is restricted to the local CI database')
command = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']


def run(sql):
    return subprocess.run(command, input=sql, text=True, capture_output=True, timeout=30, check=True).stdout.strip()


def start():
    return subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1)


def expand(path):
    import re
    return '\n'.join(expand(path.parent / m.group(1)) if (m := re.match(r'\\ir\s+(.+)', line)) else line for line in path.read_text().splitlines())


def adopt(request):
    import json
    revised = dict(payload, requestId=request)
    return ("set local role authenticated; select set_config('request.jwt.claim.sub','" + ACTOR +
            "',true); select set_config('request.headers','{\"x-offroad-workspace\":\"a11b0000-0000-4000-9000-000000000001\"}',true); select public.adopt_observation_for_work_v1('" + json.dumps(revised).replace("'", "''") + "'::jsonb);")


first = second = None
import json
output = run("begin;\n" + expand(ROOT / 'supabase/tests/support/contextual_adoption_setup.sql') + "\nselect 'PAYLOAD='||current_setting('test.adoption.payload'); commit;")
payload = json.loads(next(line.removeprefix('PAYLOAD=') for line in output.splitlines() if line.startswith('PAYLOAD=')))
try:
    first = start()
    first.stdin.write("\\o /dev/null\nbegin;\n" + adopt('a9990000-0000-4000-9000-000000000020') + "\n\\echo ADOPTION_LOCK_HELD\n")
    first.stdin.flush()
    deadline = time.monotonic() + 20
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not select.select([first.stdout], [], [], remaining)[0]:
            raise AssertionError('First transfer did not acquire its lock')
        if first.stdout.readline().strip() == 'ADOPTION_LOCK_HELD':
            break
        if first.poll() is not None:
            raise AssertionError('First transfer terminated before the barrier')
    second = start()
    second.stdin.write("set application_name='offroad_adoption_loser'; begin;\n" + adopt('a9990000-0000-4000-9000-000000000021') + "\ncommit;\n")
    second.stdin.close()
    second.stdin = None
    deadline = time.monotonic() + 20
    while run("select count(*) from pg_stat_activity where application_name='offroad_adoption_loser' and wait_event_type='Lock';") != '1':
        if time.monotonic() >= deadline or second.poll() is not None:
            raise AssertionError('Competing transfer did not wait on the organization lock')
        time.sleep(0.05)
    first.stdin.write("commit;\n")
    first.stdin.close()
    first.stdin = None
    first_output = first.communicate(timeout=20)[0]
    second_output = second.communicate(timeout=20)[0]
    assert first.returncode == 0, first_output
    assert second.returncode != 0 and 'adoption_revision_conflict' in second_output, second_output
    state = run("select count(*) from public.assumption_versions where id in ('a9990000-0000-4000-9000-000000000020','a9990000-0000-4000-9000-000000000021');")
    assert state == '1', state
    print('adoption_concurrency: PASS (observed lock wait, one immutable version, stale contender denied)')
finally:
    for process in (first, second):
        if process is not None and process.poll() is None:
            process.kill()
            process.wait(timeout=10)
    # Immutable synthetic history stays only in this disposable local CI stack; teardown destroys it.
    pass
