#!/usr/bin/env python3
"""Exercise retained public payloads against the disposable database AND Storage.

Never insert fake storage.objects rows: HTTP upload/download/delete must exercise
the local Storage service. No provider, model or production environment is used.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid
from urllib.error import HTTPError
from urllib.parse import quote, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(os.environ.get('OFFROAD_REPOSITORY_ROOT', Path(__file__).resolve().parents[2])).resolve()
PREFIX = 'a63d1000'
ACTOR = PREFIX + '-0000-4000-8000-000000000001'
ORG = PREFIX + '-0000-4000-9000-000000000001'
PUBLISHER = PREFIX + '-0000-4000-8000-000000000009'
PUBLISHER_ORG = PREFIX + '-0000-4000-9000-000000000009'
PUBLISHER_WORK = PREFIX + '-0000-4000-9000-000000000008'
EMAIL = 'capture-retention-owner@example.invalid'
PUBLISHER_EMAIL = 'capture-retention-publisher@example.invalid'
PASSWORD = 'Synthetic-Capture-Retention!2026'
BUCKET = 'capital-input-capture'
TOKEN = 'synthetic-capital-retention-concurrency-worker-token-v1'
POLICY = PREFIX + '-0000-4000-9000-000000000007'
POLICY_REVISION = 76312001


def local_url(value, database=False):
    parsed = urlparse(value)
    protocols = ('postgres', 'postgresql') if database else ('http', 'https')
    if parsed.scheme not in protocols or parsed.hostname not in ('localhost', '127.0.0.1', '::1') \
            or parsed.query or parsed.fragment or (not database and (parsed.username or parsed.password or parsed.path not in ('', '/'))):
        raise AssertionError('Disposable local database/API required')
    return value.rstrip('/')


def literal(value):
    return "convert_from(decode('" + value.encode('utf8').hex() + "','hex'),'UTF8')"


def json_literal(value):
    return literal(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)) + '::jsonb'


def digest(body):
    return hashlib.sha256(body).hexdigest()


def object_path(allocation):
    path = allocation['path']
    expected = ORG + '/' + str(uuid.UUID(allocation['allocationId'])) + '/payload.json'
    if allocation['bucket'] != BUCKET or path != expected:
        raise AssertionError('Allocation escaped its exact scoped bucket/path')
    return quote(BUCKET + '/' + path, safe='/')


def missing_object(status, body):
    """403/42501 are NEVER evidence that the bytes were physically deleted."""
    try:
        error = json.loads(body)
    except (ValueError, UnicodeDecodeError):
        return False
    return (status in (400, 404) and str(error.get('statusCode')) == '404'
            and error.get('error') in ('not_found', 'Not Found')
            and str(error.get('message', '')).lower() in ('object not found', 'the resource was not found'))


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise AssertionError('Local eval refuses HTTP redirects, including credential forwarding')


class RetentionStorage:
    def __init__(self):
        self.database = local_url(os.environ['DATABASE_URL'], database=True)
        self.api = local_url(os.environ['OFFROAD_E2E_API_URL'])
        self.key = os.environ['OFFROAD_E2E_PUBLISHABLE_KEY']
        self.command = ['psql', self.database, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']
        self.opener = build_opener(NoRedirect())
        self.jwt = self.capability = ''

    def redact(self, output):
        for secret in (self.jwt, self.capability, self.key, PASSWORD):
            if secret:
                output = output.replace(secret, '<synthetic-secret>')
        return output

    def sql(self, query, expected=None):
        result = subprocess.run(self.command, input=query, text=True, capture_output=True, timeout=30)
        output = self.redact(result.stderr)
        if re.search(r'ERROR:\s+(40P01|55P03|57014):', output):
            raise AssertionError('Deadlock/timeout/untranslated NOWAIT: ' + output)
        if expected is not None:
            state, message = expected
            if result.returncode == 0 or not re.search(r'ERROR:\s+' + re.escape(state) + ':', output) or message not in output:
                raise AssertionError('Wrong refusal: ' + output)
            return None
        if result.returncode:
            raise AssertionError(output)
        return result.stdout.strip()

    def authorized(self, query, actor=ACTOR, organization=ORG):
        claims = {'sub': actor, 'role': 'authenticated', 'aal': 'aal1'}
        return ('select set_config(\'request.jwt.claim.sub\',' + literal(actor) + ',true);'
                + 'select set_config(\'request.jwt.claims\',' + literal(json.dumps(claims)) + ',true);'
                + 'select set_config(\'request.headers\',' + literal(json.dumps({'x-offroad-workspace': organization})) + ',true);'
                + query)

    def rpc_sql(self, query, expected=None, actor=ACTOR, organization=ORG):
        output = self.sql('begin;' + self.authorized('set local role authenticated;' + query, actor, organization) + 'commit;', expected)
        return None if output is None else json.loads(output.splitlines()[-1])

    def request(self, method, path, body=None, authenticated=True, job_headers=False, content_type='application/json'):
        headers = {'apikey': self.key, 'Content-Type': content_type, 'Cache-Control': 'no-store'}
        if authenticated:
            headers['Authorization'] = 'Bearer ' + self.jwt
        if job_headers:
            headers.update({'x-offroad-job-id': self.job, 'x-offroad-capability': self.capability})
        request = Request(self.api + path, data=body, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=15) as response:
                return response.status, response.read()
        except HTTPError as error:
            return error.code, error.read()

    def login(self):
        status, body = self.request('POST', '/auth/v1/token?grant_type=password',
            json.dumps({'email': EMAIL, 'password': PASSWORD}).encode(), authenticated=False, job_headers=False)
        if status != 200:
            raise AssertionError('Synthetic sign-in failed: HTTP ' + str(status))
        result = json.loads(body)
        if result['user']['id'] != ACTOR:
            raise AssertionError('Wrong authenticated fixture account')
        self.jwt = result['access_token']

    def setup(self):
        spec = importlib.util.spec_from_file_location('capture_fixture', ROOT / 'scripts/ci/test-capital-public-capture-concurrency.py')
        fixture = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(fixture)
        setup = fixture.fixture_sql().replace(fixture.TOKEN, TOKEN).replace('a63c', PREFIX[:4])
        setup = setup.replace('synthetic-capital-capture-policy-token-v1', 'synthetic-capital-retention-policy-token-' + PREFIX)
        setup = setup.replace('synthetic-capture-concurrency-worker', 'synthetic-retention-worker-' + PREFIX)
        setup = setup.replace('capture-concurrency-owner@example.invalid', EMAIL)
        setup = setup.replace('capture-concurrency-', 'capture-retention-')
        result = json.loads(self.sql('begin;' + setup).splitlines()[-1])
        self.job, self.work, self.capability = result['job'], result['work'], result['capability']
        self.sql(f"""begin;
update auth.users set instance_id='00000000-0000-0000-0000-000000000000',email_confirmed_at=now(),
confirmation_token='',recovery_token='',email_change_token_new='',email_change='',
encrypted_password=extensions.crypt({literal(PASSWORD)},extensions.gen_salt('bf')) where id='{ACTOR}';
insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at)
select gen_random_uuid(),id,id::text,'email',jsonb_build_object('sub',id::text,'email',email),now(),now() from auth.users where id='{ACTOR}';
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('{PUBLISHER}','authenticated','authenticated',{literal(PUBLISHER_EMAIL)},
'{{"provider":"email","providers":["email"]}}','{{}}',now(),now(),false,false);
{self.authorized('', PUBLISHER, PUBLISHER_ORG)}
insert into public.organizations(id,organization_type,name,created_by)
values('{PUBLISHER_ORG}','offroad','Synthetic retention publisher','{PUBLISHER}');
insert into public.organization_memberships(organization_id,user_id,role,status)
values('{PUBLISHER_ORG}','{PUBLISHER}','owner','active');
insert into public.capital_projects(id,organization_id,project_name,created_by)
values('{PUBLISHER_WORK}','{PUBLISHER_ORG}','Synthetic retention source','{PUBLISHER}');
commit;""")
        self.login()
        result = self.rpc_sql(f"select public.worker_load_capital_project_capture_context_v1('{self.job}',{literal(self.capability)});")
        self.capture = result['capture']['id']

    def configure(self):
        self.original_control = json.loads(self.sql("select jsonb_build_object('enabled',enabled,'policy',policy_id) from private.capital_public_retention_controls where singleton;"))
        self.sql(f"""insert into private.capital_public_retention_policies(id,revision,maximum_retention_seconds,purge_margin_seconds,heartbeat_seconds)
values('{POLICY}',{POLICY_REVISION},1200,60,300);
update private.capital_public_retention_controls set enabled=true,policy_id='{POLICY}' where singleton;""")
        self.claim()

    def restore_control(self):
        if hasattr(self, 'original_control'):
            enabled = 'true' if self.original_control['enabled'] else 'false'
            self.sql(f"update private.capital_public_retention_controls set enabled={enabled},policy_id='{self.original_control['policy']}' where singleton;")

    def claim(self, token=TOKEN):
        return self.rpc_sql(f"select public.worker_claim_capital_capture_purge_v1({literal(token)},20);")

    def delivery(self, label, lifetime_seconds=3600):
        version = str(uuid.uuid4())
        payload = {'url': 'https://example.invalid/retention/' + label, 'title': 'Synthetic retained public payload',
                   'snippet': 'Synthetic bytes: ação € 漢字 🧮 ' + label, 'contentHash': digest(label.encode())}
        sample = json_literal(payload)
        query = f"""create temp table retained_license_result(binding uuid,rights uuid);
insert into public.sources(id,organization_id,origin_resource_id,origin_resource_reference,created_by)
values('{version}','{PUBLISHER_ORG}','{PUBLISHER_WORK}','{PUBLISHER_WORK}','{PUBLISHER}');
insert into public.source_versions(id,organization_id,source_id,version_no,legacy_document_version,bucket_id,object_path,original_name,initial_verification_state,created_by)
values('{version}','{PUBLISHER_ORG}','{version}',1,1,'opportunity-documents','{PUBLISHER_ORG}/synthetic/{version}',
'Synthetic retention excerpt','pending_verification','{PUBLISHER}');
insert into retained_license_result(binding)
select id from public.source_bindings where false;
with inserted as(insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
values('{PUBLISHER_ORG}','{version}','{PUBLISHER_WORK}','{PUBLISHER_WORK}',gen_random_uuid(),'{PUBLISHER}') returning id)
insert into retained_license_result(binding) select id from inserted;
update retained_license_result set rights=public.declare_public_source_reuse_v1('{version}',0,({sample})->>'url',
private.public_source_payload_sha256_v1({sample}),clock_timestamp()+interval '{lifetime_seconds} seconds',
clock_timestamp()+interval '{lifetime_seconds} seconds','{version}',repeat('b',64));
select jsonb_build_object('binding',binding,'rights',rights) from retained_license_result;"""
        # postgres creates bounded fixture provenance, real public RPC declares its rights.
        result = json.loads(self.sql('begin;' + self.authorized(query, PUBLISHER, PUBLISHER_ORG) + 'commit;').splitlines()[-1])
        origin = [{'kind': 'published_public_payload', 'licensingOrganizationId': PUBLISHER_ORG,
                   'sourceVersionId': version, 'rightsVersionId': result['rights'], 'sourceBindingId': result['binding']}]
        delivery = self.rpc_sql(f"select public.worker_capture_capital_project_delivery_v1('{self.job}',{literal(self.capability)},'{self.capture}',{literal(label)},{sample},{json_literal(origin)});")
        return {'payload': payload, 'version': version, **result, **delivery}

    def prepare(self, delivery, request_id=None, expected=None):
        request_id = request_id or str(uuid.uuid4())
        return self.rpc_sql(f"""select public.worker_prepare_capital_public_payload_v1('{self.job}',{literal(self.capability)},
'{delivery['deliveryId']}','{request_id}',{json_literal(delivery['payload'])});""", expected)

    def upload(self, allocation, body=None):
        body = allocation['canonicalPayload'].encode('utf8') if body is None else body
        status, response = self.request('POST', '/storage/v1/object/' + object_path(allocation), body)
        if status not in (200, 201):
            raise AssertionError('Actual Storage upload failed: HTTP ' + str(status))
        # Independently re-download; a successful INSERT/RPC is not proof of bytes.
        storage = self.storage_identity(allocation)
        version = quote(storage['version'], safe='')
        status, observed = self.request('GET', '/storage/v1/object/authenticated/' + object_path(allocation)
            + '?versionId=' + version + '&cacheNonce=' + str(uuid.uuid4()))
        if status != 200 or observed != body:
            raise AssertionError('Storage did not return the uploaded bytes exactly')
        return observed

    def storage_identity(self, allocation):
        return json.loads(self.sql("select jsonb_build_object('id',id,'version',version) from storage.objects where bucket_id="
            + literal(BUCKET) + ' and name=' + literal(allocation['path']) + ';').splitlines()[-1])

    def commit(self, allocation, observed, expected=None):
        storage = self.storage_identity(allocation)
        return self.rpc_sql(f"""select public.worker_commit_capital_public_payload_v1('{self.job}',{literal(self.capability)},
'{allocation['allocationId']}','{storage['id']}',{literal(storage['version'])},{literal(digest(observed))},{len(observed)});""", expected)

    def read(self, retained_id, expected=None):
        return self.rpc_sql(f"select public.worker_read_capital_public_payload_v1('{self.job}',{literal(self.capability)},'{retained_id}');", expected)

    def revoke(self, delivery):
        # This is the actual mutable publication binding; no rights/receipt is edited.
        self.sql("update public.source_bindings set revoked_at=clock_timestamp() where organization_id="
            + literal(PUBLISHER_ORG) + '::uuid and id=' + literal(delivery['binding']) + '::uuid;')

    def ticket(self, allocation):
        tickets = self.claim()['items']
        matches = [item for item in tickets if item['allocationId'] == allocation['allocationId']]
        if len(matches) != 1 or len(tickets) != 1:
            raise AssertionError('Purge did not claim only the expected synthetic allocation')
        result = matches[0]
        object_path(result)
        return result

    def erase(self, ticket):
        status, body = self.request('DELETE', '/storage/v1/object/' + BUCKET,
            json.dumps({'prefixes': [ticket['path']]}).encode())
        if status != 200 or not isinstance(json.loads(body), list):
            raise AssertionError('Physical Storage DELETE was not confirmed')
        # The info endpoint reports physical absence without requiring permission
        # to download revoked or expired bytes. The local Storage API does not
        # implement HEAD for this route, so HTTP 400 there is not erasure proof.
        status, body = self.request('GET', '/storage/v1/object/info/' + object_path(ticket))
        if not missing_object(status, body):
            raise AssertionError('Exact Storage info did not prove404 after DELETE: HTTP ' + str(status))
        remaining = self.sql('select count(*) from storage.objects where bucket_id='
            + literal(BUCKET) + ' and name=' + literal(ticket['path']) + ';')
        if remaining != '0':
            raise AssertionError('Storage catalog retained the exact deleted object')

    def ack(self, ticket, confirmed=True, expected=None):
        boolean = 'true' if confirmed else 'false'
        return self.rpc_sql(f"""select public.worker_ack_capital_capture_purge_v1({literal(TOKEN)},
'{ticket['purgeId']}',{literal(ticket['purgeCapability'])},{boolean});""", expected)

    def counts(self, allocation):
        return json.loads(self.sql(f"""select jsonb_build_object('receipt',
(select count(*) from private.capital_public_retained_payloads where organization_id='{ORG}' and allocation_id='{allocation['allocationId']}'),
'erasure',(select count(*) from private.capital_public_payload_erasure_events where organization_id='{ORG}' and allocation_id='{allocation['allocationId']}'),
'object',(select count(*) from storage.objects where bucket_id='{BUCKET}' and name={literal(allocation['path'])}));"""))

    def clean(self, delivery, allocation):
        self.revoke(delivery)
        ticket = self.ticket(allocation)
        self.erase(ticket)
        if self.ack(ticket).get('purged') is not True:
            raise AssertionError('Purge ACK did not confirm its narrow erasure receipt')
        after = self.counts(allocation)
        if after['object'] != 0 or after['erasure'] != 1:
            raise AssertionError('Purge left an object or duplicated its erasure event')

    def main(self):
        self.setup()
        try:
            self.configure()
            delivery = self.delivery('retention-byte-identity')
            request_id = str(uuid.uuid4())
            allocation = self.prepare(delivery, request_id)
            observed = self.upload(allocation)
            if digest(observed) != allocation['payloadFingerprint'] or len(observed) != allocation['byteLength']:
                raise AssertionError('Canonical payload fingerprint/UTF8 byte length mismatch')
            identity = self.storage_identity(allocation)
            for version, size, sha in [('false-storage-version', len(observed), digest(observed)),
                                      (identity['version'], len(observed) + 1, digest(observed)),
                                      (identity['version'], len(observed), '0' * 64)]:
                self.rpc_sql(f"""select public.worker_commit_capital_public_payload_v1('{self.job}',{literal(self.capability)},
'{allocation['allocationId']}','{identity['id']}',{literal(version)},{literal(sha)},{size});""",
                    ('22023', 'capture_payload_proof_invalid'))
                if self.counts(allocation)['receipt'] != 0:
                    raise AssertionError('Invalid metadata/hash proof created retained receipt')
            receipt = self.commit(allocation, observed)
            scope = self.read(receipt['retainedPayloadId'])
            if scope['path'] != allocation['path'] or scope['payloadFingerprint'] != digest(observed):
                raise AssertionError('Replay changed body identity/path')
            replay = self.prepare(delivery, request_id)
            if replay['allocationId'] != allocation['allocationId'] or replay['replayed'] is not True:
                raise AssertionError('Lost prepare response created another allocation')
            again = self.commit(allocation, observed)
            if again['retainedPayloadId'] != receipt['retainedPayloadId'] or again['replayed'] is not True:
                raise AssertionError('Lost commit response created another receipt')
            if self.counts(allocation) != {'receipt': 1, 'erasure': 0, 'object': 1}:
                raise AssertionError('Replay duplicated receipt/object')
            print('physical_upload_download_digest_size_exact_replay: PASS')
            self.revoke(delivery)
            self.read(receipt['retainedPayloadId'], ('42501', 'capital_capture_retention_denied'))
            status, body = self.request('GET', '/storage/v1/object/authenticated/' + object_path(allocation)
                + '?cacheNonce=' + str(uuid.uuid4()))
            if status == 200 or body == observed:
                raise AssertionError('Direct Storage download bypassed revoked source binding')
            print('revocation_denies_sql_and_direct_storage_without_erasing_receipt: PASS')
            ticket = self.ticket(allocation)
            # A false claim may not fabricate an erasure receipt.
            self.ack(ticket, confirmed=False, expected=('22023', 'capture_purge_proof_invalid'))
            if self.counts(allocation)['erasure'] != 0:
                raise AssertionError('False delete ACK wrote an erasure event')
            # Simulate a process crash after actual physical DELETE and before ACK.
            self.erase(ticket)
            if self.counts(allocation) != {'receipt': 1, 'erasure': 0, 'object': 0}:
                raise AssertionError('DELETE crash prematurely acknowledged/removed immutable receipt')
            # Advance only this mutable synthetic ticket lease, never an immutable deadline.
            self.sql(f"update private.capital_public_payload_purge_queue set lease_expires_at=clock_timestamp()-interval '1 second',next_check_at=clock_timestamp() where organization_id='{ORG}' and id='{ticket['purgeId']}';")
            restarted = self.ticket(allocation)
            self.erase(restarted)  # Empty successful DELETE + exact404, not a403 shortcut.
            if self.ack(restarted).get('purged') is not True:
                raise AssertionError('Restarted purge failed')
            again = self.ack(restarted)
            if again.get('replayed') is not True or self.counts(allocation) != {'receipt': 1, 'erasure': 1, 'object': 0}:
                raise AssertionError('Purge crash recovery/replay duplicated receipt/event')
            print('delete_crash_before_ack_reclaimed_empty_delete_404_single_event: PASS')

            orphan = self.delivery('retention-upload-crash-orphan')
            allocation = self.prepare(orphan)
            self.upload(allocation)  # Crash after upload: no SQL commit, no retained receipt.
            if self.counts(allocation) != {'receipt': 0, 'erasure': 0, 'object': 1}:
                raise AssertionError('Uncommitted upload unexpectedly published a receipt')
            self.sql(f"""update public.organization_memberships set status='suspended' where organization_id='{ORG}' and user_id='{ACTOR}';
update public.processing_jobs set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null where id='{self.job}' and organization_id='{ORG}';""")
            self.clean(orphan, allocation)
            print('uploaded_uncommitted_orphan_erased_after_job_cancel_membership_revocation: PASS')
            print('capital_public_retention_storage: PASS (real HTTP bytes/delete/404; local disposable stack only)')
        finally:
            self.restore_control()


def self_test():
    for url in ('postgresql://localhost/postgres', 'postgresql://127.0.0.1/db', 'postgresql://[::1]/db'):
        local_url(url, database=True)
    for url in ('https://production.example', 'http://localhost/?redirect=prod', 'http://user:secret@localhost/'):
        try:
            local_url(url)
        except AssertionError:
            pass
        else:
            raise AssertionError('Unsafe API accepted')
    sample = 'ação € 漢字 🧮'.encode('utf8')
    assert len(sample) > len(sample.decode())
    assert digest(sample) != digest(sample + b'!')
    allocation = {'bucket': BUCKET, 'allocationId': str(uuid.uuid4())}
    allocation['path'] = ORG + '/' + allocation['allocationId'] + '/payload.json'
    object_path(allocation)
    assert missing_object(400, b'{"statusCode":"404","error":"not_found","message":"Object not found"}')
    assert not missing_object(403, b'{"statusCode":"403","error":"AccessDenied","message":"Object not found"}')
    assert not missing_object(404, b'not a Storage response')
    assert not missing_object(404, b'{"statusCode":"404","error":"AccessDenied","message":"Object not found"}')
    print('retention storage static self-test: PASS (local guard, UTF8 digest, scoped path, genuine404; no network/database)')


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    elif sys.argv[1:]:
        raise SystemExit('Usage: test-capital-public-retention-storage.py [--self-test]')
    else:
        RetentionStorage().main()
