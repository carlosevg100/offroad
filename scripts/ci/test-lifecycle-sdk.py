#!/usr/bin/env python3
"""Real Storage erasure through the production worker; disposable local CI only."""
import json, os, secrets, subprocess, tempfile, time
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
database = os.environ['DATABASE_URL']
api = os.environ['OFFROAD_E2E_API_URL']
assert urlparse(database).hostname in ('localhost', '127.0.0.1', '::1')
assert urlparse(api).hostname in ('localhost', '127.0.0.1')
password, token = secrets.token_urlsafe(32), secrets.token_urlsafe(40)
actor = 'a422c100-0000-4000-8000-000000000001'
worker = 'a422c100-0000-4000-8000-000000000002'
org = 'a422c100-0000-4000-9000-000000000001'
work = 'a422c100-0000-4000-9000-000000000002'

def sql(source, variables=()):
    command = ['psql', database, '-XAtq', '-v', 'ON_ERROR_STOP=1']
    for variable in variables:
        command.extend(['-v', variable])
    result = subprocess.run(command, input=source, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError('lifecycle_local_sql_failed')
    return result.stdout.strip()

with tempfile.TemporaryDirectory(prefix='offroad-lifecycle-sdk-') as temporary:
    fixture = Path(temporary) / 'fixture.json'
    fixture.write_text(json.dumps(dict(environment='local', projectRef='local', apiUrl=api,
        publishableKey=os.environ['OFFROAD_E2E_PUBLISHABLE_KEY'], organizationId=org,
        workId=work, actorId=actor, workerId=worker,
        actorEmail='stage22-erasure-owner@example.invalid', workerEmail='stage22-erasure-worker@example.invalid',
        password=password, workerToken=token)))
    fixture.chmod(0o600)
    assert sql(f"select count(*) from auth.users where id in ('{actor}','{worker}');") == '0'
    prepared = False
    try:
        sql((ROOT / 'supabase/tests/support/lifecycle_sdk_setup.sql').read_text(),
            ['password_hex=' + password.encode().hex(), 'worker_token_hex=' + token.encode().hex()])
        prepared = True
        environment = dict(os.environ, OFFROAD_LIFECYCLE_FIXTURE_FILE=str(fixture))
        restored = subprocess.run(['python3', '-B', 'scripts/ci/test-lifecycle-logical-restore.py'],
                                 cwd=ROOT, env=environment, timeout=120)
        assert restored.returncode == 0, 'lifecycle_logical_restore_failed'
        for phase in ('prepare', 'configure', 'held', 'release', 'purge'):
            if phase == 'held':
                time.sleep(6)  # Exercise the real expiry clock, not a mocked timestamp.
            result = subprocess.run(['node', 'scripts/ci/test-lifecycle-sdk.mjs', phase],
                cwd=ROOT, env=environment, timeout=180)
            assert result.returncode == 0, 'lifecycle_sdk_' + phase + '_failed'
            if phase == 'release':
                result = subprocess.run(['python3', '-B', 'scripts/ci/test-lifecycle-concurrency.py'], cwd=ROOT, env=environment, timeout=90)
                assert result.returncode == 0, 'lifecycle_observed_concurrency_failed'
        assert sql(f"select count(*) from storage.objects where bucket_id='case-artifacts' and name like '%{work}%';") == '0'
        assert sql(f"select count(*) from private.retention_actions where organization_id='{org}' and state='completed' and receipt_fingerprint ~ '^[a-f0-9]{{64}}$';") == '1'
        assert sql(f"select count(*) from private.typed_payload_disposals where organization_id='{org}';") == '1'
        assert sql(f"select count(*) from public.artifact_export_receipts where organization_id='{org}';") == '1'
        print('PASS lifecycle_sdk_real_bytes_hold_expiry_erasure_and_preserved_identity')
    finally:
        if prepared:
            sql(f"begin; update private.worker_tokens set revoked_at=clock_timestamp() where execution_account_user_id='{worker}' and revoked_at is null; delete from auth.sessions where user_id in ('{actor}','{worker}'); update auth.users set banned_until=clock_timestamp()+interval '100 years' where id in ('{actor}','{worker}'); commit;")
            print('PASS lifecycle_sdk_owned_identities_closed')
