#!/usr/bin/env python3
"""Real HTTP eval of typed bodies on local/staging ONLY; never production.

No remote execution is implicit. Operator provisions an isolated synthetic fixture
via legitimate work/job/source commands, applies migration, enables its retention
policy and supplies OFFROAD_BODY_STORAGE_FIXTURE_FILE (0600, outside git).
No service-role HTTP client; no fake storage.objects; no global control edits.
Staging without DATABASE_URL/psql uses OFFROAD_BODY_SQL_BRIDGE_DIR: existing0700
owner directory outside git. Request id.request.json0600 = {id,projectRef,query}.
Root alone executes each query on known staging via its SQL tool and responds
id.response.json0600 = {id,projectRef,ok:true,value:<psql-style scalar string>}.
For JSON-building SELECTs value is JSON text; counts are decimal text. Failure:
{...,ok:false}; never include credentials/errors/raw customer data. Bridge timeout300s; native local psql unchanged.
Only SQL_BRIDGE_WAIT id is emitted, no query. Requests persist for root cleanup.
Fixture JSON: environment(local|staging), projectRef, apiUrl, databaseHost,
organizationId, actorId, publishableKey, email,password,purgeToken, sourceVersionId,
sourceBindingId, jobs:{baseline,expired,reassigned:{jobId,workId,capabilityToken}},
otherWorkerAccountId. Optional acceptedOutput + acceptedOutputFingerprint are
synthetic schema-valid gateway fixture output (NOT proof of real provider egress).
The full cascade case requires them: missing fixture is a failure, not a skip.
Root owns provisioning/cleanup; this script purges every allocated body and prints
only named test outcomes, never bodies, paths, JWTs, capabilities or DB credentials.
"""
import base64
import ast
import traceback
import importlib.util
import json
import os
from pathlib import Path
import stat
import time
import re
import tempfile
import sys
import uuid
from urllib.parse import urlparse
from urllib.request import Request, build_opener
from urllib.error import HTTPError

ROOT = Path(os.environ.get('OFFROAD_REPOSITORY_ROOT', Path(__file__).resolve().parents[2])).resolve()
spec = importlib.util.spec_from_file_location('public_retention_storage', ROOT / 'scripts/ci/test-capital-public-retention-storage.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
PRODUCTION_REF = 'ifnogpksgdadruooqydi'
CURRENT_STAGE = 'initialize'
STAGING_BRIDGE_TIMEOUT_SECONDS = 300


class SafeEvalFailure(Exception):
    def __init__(self, operation, http_status=None, sql_state=None):
        self.operation = operation if re.fullmatch(r'[a-zA-Z0-9_]{1,100}', operation) else 'operation'
        self.http_status = http_status if isinstance(http_status, int) else None
        self.sql_state = sql_state if isinstance(sql_state, str) and re.fullmatch(r'[A-Z0-9]{5}', sql_state) else None


def named_stage(value):
    global CURRENT_STAGE
    if not re.fullmatch(r'[a-zA-Z0-9_]{1,100}', value):
        raise AssertionError('Invalid diagnostic stage')
    CURRENT_STAGE = value


def safe_failure_location(failure):
    # Use only frames in our two checked-in harnesses. Never show locals, traceback
    # source lines or exception text (which can contain HTTP/SQL/private bodies).
    allowed = {Path(__file__).resolve(), Path(base.__file__).resolve()}
    frames = [f for f in traceback.extract_tb(failure.__traceback__) if Path(f.filename).resolve() in allowed]
    if not frames:
        return {'location': 'outside_harness', 'assertionCode': 'external_failure'}
    frame = frames[-1]
    filename = Path(frame.filename).resolve()
    code = 'external_failure'
    if isinstance(failure, AssertionError):
        code = 'dynamic_assertion'
        tree = ast.parse(filename.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Raise) and node.lineno == frame.lineno and isinstance(node.exc, ast.Call) and isinstance(node.exc.func, ast.Name) and node.exc.func.id == 'AssertionError' and node.exc.args and isinstance(node.exc.args[0], ast.Constant) and isinstance(node.exc.args[0].value, str):
                # This is a literal checked-in assertion message, not failure.args.
                code = 'assert_' + re.sub(r'[^a-z0-9]+', '_', node.exc.args[0].value.lower()).strip('_')[:80]
                break
    elif isinstance(failure, SafeEvalFailure):
        code = 'rpc_or_control_failure'
    method = frame.name if re.fullmatch(r'[a-zA-Z0-9_<>]{1,100}', frame.name) else 'method'
    return {'location': filename.name + ':' + method + ':' + str(frame.lineno), 'assertionCode': code}


def validate_environment(f, database=None):
    api, db = urlparse(f['apiUrl']), urlparse(database or '')
    if PRODUCTION_REF in f['apiUrl'] or PRODUCTION_REF in (database or '') or f['projectRef'] == PRODUCTION_REF:
        raise AssertionError('Production is forbidden')
    if f['environment'] == 'local':
        base.local_url(f['apiUrl']); base.local_url(database, database=True)
    elif f['environment'] == 'staging':
        if (f['projectRef'] != 'gjkkjtbfnssdsbmlhmwk' or f['projectRef'] != os.environ.get('OFFROAD_STAGING_PROJECT_REF')
                or api.scheme != 'https' or api.hostname != f['projectRef'] + '.supabase.co'
                or (database is not None and (db.hostname != f['databaseHost'] or db.hostname != os.environ.get('OFFROAD_STAGING_DATABASE_HOST')
                or db.scheme not in ('postgres', 'postgresql')
                or (db.hostname != 'db.' + f['projectRef'] + '.supabase.co' and f['projectRef'] not in (db.username or ''))))):
            raise AssertionError('Explicit staging API/database allowlist required')
    else:
        raise AssertionError('Only local/staging allowed')
    if api.username or api.password or api.query or api.fragment or api.path not in ('', '/') or db.query or db.fragment:
        raise AssertionError('Unsafe endpoint shape')
    key = f['publishableKey']
    if key.startswith('sb_secret_'):
        raise AssertionError('Secret key HTTP client forbidden')
    if key.count('.') == 2:
        payload = json.loads(base64.urlsafe_b64decode(key.split('.')[1] + '==='))
        if payload.get('role') != 'anon':
            raise AssertionError('Only anon/publishable HTTP key allowed')
    elif not key.startswith('sb_publishable_'):
        raise AssertionError('Unknown HTTP key format')
    for field in ('organizationId', 'actorId', 'sourceVersionId', 'sourceBindingId', 'otherWorkerAccountId'):
        uuid.UUID(f[field])
    for label in ('baseline', 'expired', 'reassigned'):
        for field in ('jobId', 'workId'):
            uuid.UUID(f['jobs'][label][field])
    if len({f['jobs'][x]['jobId'] for x in ('baseline', 'expired', 'reassigned')}) != 3:
        raise AssertionError('Destructive cases require independent jobs')


def validate_bridge(value, fixture):
    if not value:
        return None
    if fixture['environment'] != 'staging' or fixture['projectRef'] != 'gjkkjtbfnssdsbmlhmwk':
        raise AssertionError('SQL bridge only permits confirmed staging')
    path = Path(value)
    if path.is_symlink():
        raise AssertionError('SQL bridge symlink forbidden')
    path = path.resolve()
    if not path.is_dir() or ROOT == path or ROOT in path.parents or path.stat().st_uid != os.getuid() or stat.S_IMODE(path.stat().st_mode) != 0o700:
        raise AssertionError('SQL bridge requires owner-only directory outside git')
    return path


class BodyStorage(base.RetentionStorage):
    def __init__(self):
        path = Path(os.environ['OFFROAD_BODY_STORAGE_FIXTURE_FILE'])
        if path.is_symlink():
            raise AssertionError('Fixture symlink forbidden')
        path = path.resolve()
        if ROOT == path or ROOT in path.parents or stat.S_IMODE(path.stat().st_mode) & 0o077:
            raise AssertionError('Fixture secrets require owner-only file outside repository')
        self.f = json.loads(path.read_text())
        if 'publicParent' not in self.f:
            raise AssertionError('Real public retained parent fixture required')
        parent = self.f['publicParent']
        for field in ('sourceVersionId','sourceBindingId'):
            uuid.UUID(parent[field])
        uuid.UUID(parent.get('publisherOrganizationId') or parent['licensingOrganizationId'])
        self.bridge = validate_bridge(os.environ.get('OFFROAD_BODY_SQL_BRIDGE_DIR'), self.f)
        self.database = None if self.bridge else os.environ['DATABASE_URL']
        validate_environment(self.f, self.database)
        self.api, self.key = self.f['apiUrl'].rstrip('/'), self.f['publishableKey']
        self.command = [] if self.bridge else ['psql', self.database, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']
        self.opener = build_opener(base.NoRedirect())
        self.jwt = self.capability = ''
        self.allocations = []
        self._heartbeat_enabled = False
        self._heartbeat_inflight = False
        self._last_purge_heartbeat = 0.0
        self.select_job('baseline')
        # Shared utility path guard has exact tenant binding, never arbitrary prefix.
        base.ORG = self.f['organizationId']

    def start_keepalive(self):
        # Operator preflight has already proved fixture queue isolation.
        if self.claim()['items']:
            raise SafeEvalFailure('purger_initial_unexpected_tickets')
        self._heartbeat_enabled = True

    def ensure_heartbeat(self):
        if not self._heartbeat_enabled or self._heartbeat_inflight or not self.jwt or time.monotonic() - self._last_purge_heartbeat < 20:
            return
        self._heartbeat_inflight = True
        try:
            tickets = self.claim()['items']
            if tickets:
                self._heartbeat_enabled = False
                raise SafeEvalFailure('purger_keepalive_unexpected_tickets')
        finally:
            self._heartbeat_inflight = False

    def sql(self, query, expected=None):
        # Never renew automatically once source revocation begins: subsequent
        # tickets belong to the explicit destructive/purge phase.
        if query.lstrip().lower().startswith('update public.source_bindings set revoked_at='):
            self._heartbeat_enabled = False
        self.ensure_heartbeat()
        if not self.bridge:
            return super().sql(query, expected)
        if expected is not None:
            raise AssertionError('HTTP bridge does not simulate SQL negative tests')
        self.bridge_query_allowed(query)
        request_id = str(uuid.uuid4())
        request = self.bridge / (request_id + '.request.json')
        response = self.bridge / (request_id + '.response.json')
        fd = os.open(request, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as out:
            json.dump({'id': request_id, 'projectRef': self.f['projectRef'], 'query': query}, out)
        print('SQL_BRIDGE_WAIT ' + request_id, flush=True)
        deadline = time.monotonic() + STAGING_BRIDGE_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            if response.exists():
                if response.is_symlink() or response.stat().st_uid != os.getuid() or stat.S_IMODE(response.stat().st_mode) != 0o600:
                    raise AssertionError('Unsafe SQL bridge response')
                result = json.loads(response.read_text())
                if result.get('id') != request_id or result.get('projectRef') != self.f['projectRef'] or result.get('ok') is not True or not isinstance(result.get('value'), str):
                    raise AssertionError('SQL bridge error/mismatched response; not proof')
                return result['value'].strip()
            self.ensure_heartbeat()
            time.sleep(0.1)
        raise SafeEvalFailure('sql_bridge_timeout')

    def bridge_query_allowed(self, query):
        # Only the five bounded metadata templates emitted by this HTTP harness.
        # Fixture IDs are validated UUIDs; text SQL uses hex literals, not interpolation.
        compact = ' '.join(query.split()).rstrip(';')
        org = self.f['organizationId']
        parent = self.f.get('publicParent', {})
        publisher_org = parent.get('publisherOrganizationId') or parent.get('licensingOrganizationId', '')
        if publisher_org: uuid.UUID(publisher_org)
        if ';' in compact or '--' in compact or '/*' in compact:
            raise AssertionError('SQL bridge refuses multiple/unbounded statements')
        prefixes = ('select count(*) from private.capital_public_payload_purge_queue where status<>',
                    "select jsonb_build_object('id',id,'version',version) from storage.objects where bucket_id=",
                    'select count(*) from storage.objects where bucket_id=',
                    "select jsonb_build_object('receipt',",
                    'update public.processing_jobs set lease_expires_at=clock_timestamp()-interval',
                    'update public.processing_jobs set leased_account_user_id=',
                    'update public.source_bindings set revoked_at=clock_timestamp() where id=')
        if not compact.startswith(prefixes) or not (org in compact or org.encode().hex() in compact or (publisher_org and publisher_org.encode().hex() in compact)):
            raise AssertionError('SQL bridge query outside fixture metadata templates')
        if compact.startswith('update public.processing_jobs'):
            if not any(j['jobId'].encode().hex() in compact for j in self.f['jobs'].values()):
                raise AssertionError('SQL bridge job outside fixture')
        if compact.startswith('update public.source_bindings') and not (self.f['sourceBindingId'].encode().hex() in compact or (parent.get('sourceBindingId') and parent['sourceBindingId'].encode().hex() in compact)):
            raise AssertionError('SQL bridge binding outside fixture')
        if 'storage.objects' in compact and base.BUCKET.encode().hex() not in compact and "bucket_id='" + base.BUCKET + "'" not in compact:
            raise AssertionError('SQL bridge bucket outside body service')
        # Object reads must point at an allocation this process actually received.
        if 'storage.objects' in compact and not any(a['path'].encode().hex() in compact or a['path'] in compact for a in self.allocations):
            raise AssertionError('SQL bridge object outside allocations')

    def redact(self, value):
        for secret in ([self.database, self.jwt, self.key, self.capability, self.f['password'], self.f['purgeToken']]
                       + [v['capabilityToken'] for v in self.f['jobs'].values()]):
            if secret:
                value = value.replace(secret, '<secret>')
        return value

    def select_job(self, label):
        j = self.f['jobs'][label]
        self.job, self.work, self.capability = j['jobId'], j['workId'], j['capabilityToken']

    def login(self):
        status, body = self.request('POST', '/auth/v1/token?grant_type=password', json.dumps(
            {'email': self.f['email'], 'password': self.f['password']}).encode(), authenticated=False)
        if status != 200:
            raise AssertionError('Fixture login failed')
        result = json.loads(body)
        if result['user']['id'] != self.f['actorId']:
            raise AssertionError('Wrong fixture actor')
        self.jwt = result['access_token']

    def request(self, method, path, body=None, authenticated=True, job_headers=True, content_type='application/json', workspace_headers=True):
        if authenticated and path != '/rest/v1/rpc/worker_claim_capital_capture_purge_v1':
            self.ensure_heartbeat()
        headers = {'apikey': self.key, 'Content-Type': content_type, 'Cache-Control': 'no-store, private, max-age=0'}
        if workspace_headers:
            headers['x-offroad-workspace'] = self.f['organizationId']
        if authenticated:
            headers['Authorization'] = 'Bearer ' + self.jwt
        if job_headers:
            headers.update({'x-offroad-job-id': self.job, 'x-offroad-capability': self.capability})
        request = Request(self.api + path, data=body, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=15) as response:
                self.last_response_headers = dict(response.headers)
                return response.status, response.read()
        except HTTPError as error:
            self.last_response_headers = dict(error.headers)
            return error.code, error.read()

    def rpc(self, name, args, expected=None):
        status, body = self.request('POST', '/rest/v1/rpc/' + name, json.dumps(args).encode())
        if expected:
            if status < 400:
                raise SafeEvalFailure(name, status, 'ALLOW')
            result = json.loads(body)
            if result.get('code') != expected[0] or expected[1] not in result.get('message', ''):
                raise SafeEvalFailure(name, status, result.get('code'))
            return None
        if status != 200:
            try:
                code = json.loads(body).get('code')
            except (ValueError, AttributeError):
                code = None
            raise SafeEvalFailure(name, status, code)
        return json.loads(body)

    def job_rpc(self, name, args, expected=None):
        return self.rpc(name, {'p_job_id': self.job, 'p_capability_token': self.capability, **args}, expected)

    def contribution(self):
        rid = str(uuid.uuid4())
        result = self.rpc('submit_work_contribution_v1', {'p_work_id': self.work,
            'p_contribution_id': str(uuid.uuid4()), 'p_revision_id': rid,
            'p_expected_revision_id': None, 'p_base_revision_id': None,
            'p_content': 'Synthetic typed body HTTP eval: ação € 漢字 🧮',
            'p_source_version_ids': [self.f['sourceVersionId']]})
        if result['revisionId'] != rid:
            raise AssertionError('Contribution command identity mismatch')
        return rid

    def prepare(self, revision, request_id=None):
        result = self.job_rpc('worker_prepare_capital_body_v1', {'p_request_id': request_id or str(uuid.uuid4()),
            'p_kind': 'contribution_input', 'p_origin_or_accepted_id': revision})
        base.object_path(result)
        self.allocations.append(result)
        return result

    def upload(self, allocation, body=None):
        original = allocation['canonicalBody'].encode('utf8')
        adapted = {**allocation, 'canonicalPayload': allocation['canonicalBody']}
        return super().upload(adapted, original if body is None else body)

    def physical_post(self, allocation, kind=None, denied=False):
        kind = kind or ('typed_body' if 'bodyBasisId' in allocation else 'public_source')
        return super().physical_post(allocation, kind, denied)

    def commit(self, allocation, observed, expected=None, version=None, sha=None, size=None, identity=None):
        identity = self.storage_identity(allocation) if identity is None else identity
        return self.job_rpc('worker_commit_capital_body_v1', {'p_allocation_id': allocation['allocationId'],
            'p_storage_object_id': identity['id'], 'p_storage_version': version or identity['version'],
            'p_verified_sha256': sha or base.digest(observed), 'p_verified_size': len(observed) if size is None else size}, expected)

    def read(self, retained, expected=None):
        return self.job_rpc('worker_read_capital_body_v1', {'p_retained_payload_id': retained}, expected)

    def denied_get(self, allocation):
        status, _ = self.request('GET', '/storage/v1/object/authenticated/' + base.object_path(allocation)
                                + '?cacheNonce=' + str(uuid.uuid4()))
        if status not in (400, 401, 403, 404):
            raise AssertionError('Direct Storage access did not deny')

    def cascade_output(self, parent):
        # Synthetic gateway fixture only: no claim of provider send/response proof.
        output, fp = self.f['acceptedOutput'], self.f['acceptedOutputFingerprint']
        invocation = str(uuid.uuid4())
        receipt = self.job_rpc('worker_record_capital_body_input_v1', {'p_invocation_id': invocation,
            'p_adapter_request_fingerprint': '1' * 64, 'p_input_fingerprint': '2' * 64,
            'p_prompt_fingerprint': '3' * 64, 'p_provider': 'openai', 'p_model': 'synthetic-http-eval',
            'p_components': [{'kind': 'retained_payload', 'id': parent['retainedPayloadId']}]})
        accepted = {'schemaVersion': 'gateway-accepted-invocation.v1', 'invocationId': invocation,
            'adapterInputVersion': 'gateway-adapter-input.v1', 'adapterRequestFingerprint': '1' * 64,
            'outputFingerprintVersion': 'gateway-parsed-output.v1', 'outputFingerprint': fp,
            'inputFingerprint': '2' * 64, 'promptFingerprint': '3' * 64, 'provider': 'openai',
            'configuredModel': 'synthetic-http-eval', 'reportedModel': 'synthetic-http-eval',
            'schemaName': 'origination_senior_readout_v2', 'retryOrdinal': 0,
            'isSameModelRepair': False, 'usedProviderFallback': False, 'fromCassette': False,
            'inputAttestationReceiptId': receipt['receiptId']}
        binding = self.job_rpc('worker_record_capital_body_accepted_v1', {'p_input_receipt_id': receipt['receiptId'], 'p_accepted': accepted})
        allocated = self.job_rpc('worker_prepare_capital_body_v1', {'p_request_id': str(uuid.uuid4()),
            'p_kind': 'gateway_accepted_output', 'p_origin_or_accepted_id': binding['acceptedInvocationId'],
            'p_body': output, 'p_gateway_output_fingerprint': fp})
        self.allocations.append(allocated)
        stored = self.commit(allocated, self.upload(allocated))
        if stored['expiresAt'] > parent['expiresAt']:
            raise AssertionError('Derived deadline renewed parent')
        return allocated, stored

    def claim(self, token=None):
        # Remote bridge metadata round-trips can consume most of the fixed 60s lease.
        # Lease only the one ticket we can finish; never widen the server lease.
        limit = 1 if self.bridge is not None else 100
        result = self.rpc('worker_claim_capital_capture_purge_v1', {'p_worker_token': self.f['purgeToken'], 'p_limit': limit})
        self._last_purge_heartbeat = time.monotonic()
        return result

    def erase(self, ticket):
        # Staging MCP orchestration is not part of the product's fixed purge
        # lease. Real DELETE and genuine INFO404 still precede every ACK.
        return super().erase(ticket, verify_catalogue=self.bridge is None)

    def ack(self, ticket, confirmed=True, expected=None):
        result = self.rpc('worker_ack_capital_capture_purge_v1', {'p_worker_token': self.f['purgeToken'],
            'p_purge_id': ticket['purgeId'], 'p_purge_capability': ticket['purgeCapability'], 'p_storage_delete_confirmed': confirmed}, expected)
        if self.bridge is not None and confirmed and expected is None and result.get('purged') is True:
            # Mandatory independent catalogue proof, immediately after ACK.
            # A delayed/failed bridge response still fails this eval; no skip.
            self.assert_catalogue_absent(ticket)
        return result

    def public_parent(self):
        parent = self.f['publicParent']
        origin = parent.get('origin') or [{'kind': 'published_public_payload',
            'licensingOrganizationId': parent['licensingOrganizationId'], 'sourceVersionId': parent['sourceVersionId'],
            'rightsVersionId': parent['rightsVersionId'], 'sourceBindingId': parent['sourceBindingId']}]
        capture = self.job_rpc('worker_load_capital_project_capture_context_v1', {})['capture']['id']
        delivery = self.job_rpc('worker_capture_capital_project_delivery_v1', {'p_capture_id': capture,
            'p_delivery_key': 'synthetic-body-public-parent-' + str(uuid.uuid4()),
            'p_payload': parent['payload'], 'p_origin_refs': origin})
        allocation = self.job_rpc('worker_prepare_capital_public_payload_v1', {'p_delivery_id': delivery['deliveryId'],
            'p_request_id': str(uuid.uuid4()), 'p_payload': parent['payload']})
        base.object_path(allocation)
        self.allocations.append(allocation)
        observed = base.RetentionStorage.upload(self, allocation)
        identity = self.storage_identity(allocation)
        stored = self.job_rpc('worker_commit_capital_public_payload_v1', {'p_allocation_id': allocation['allocationId'],
            'p_storage_object_id': identity['id'], 'p_storage_version': identity['version'],
            'p_verified_sha256': base.digest(observed), 'p_verified_size': len(observed)})
        self.job_rpc('worker_read_capital_public_payload_v1', {'p_retained_payload_id': stored['retainedPayloadId']})
        return allocation, stored

    def revoke_public_parent(self):
        parent = self.f['publicParent']
        org = parent.get('publisherOrganizationId') or parent['licensingOrganizationId']
        self.sql('update public.source_bindings set revoked_at=clock_timestamp() where id='
                 + base.literal(parent['sourceBindingId']) + '::uuid and organization_id=' + base.literal(org) + '::uuid;')

    def cleanup_local(self):
        """Physical erasure and bounded identity/job cleanup. Immutable audit stays labeled
        synthetic until CI destroys its disposable stack; no trigger/grant is disabled."""
        if self.f['environment'] != 'local' or self.bridge:
            raise AssertionError('Automatic cleanup only on explicitly local stack')
        self.login()
        self.sql('update public.source_bindings set revoked_at=clock_timestamp() where organization_id='
                 + base.literal(self.f['organizationId']) + '::uuid and id=' + base.literal(self.f['sourceBindingId']) + '::uuid;')
        self.revoke_public_parent()
        # Cancel rights of every typed origin, including an interrupted SDK allocation
        # with no declared source. Purger authenticates worker account, not membership.
        self.sql('update public.organization_memberships set status=\'suspended\' where organization_id='
                 + base.literal(self.f['organizationId']) + '::uuid and user_id=' + base.literal(self.f['actorId']) + '::uuid;')
        pending = json.loads(self.sql("select coalesce(jsonb_agg(jsonb_build_object('allocationId',a.id,'bucket',a.bucket_id,'path',a.object_path)),'[]'::jsonb) "
            "from private.capital_public_payload_allocations a join private.capital_public_payload_purge_queue q "
            "on q.organization_id=a.organization_id and q.allocation_id=a.id where a.organization_id="
            + base.literal(self.f['organizationId']) + "::uuid and q.status<>'purged';"))
        self.allocations = pending
        # Recover only this fixture's mutable purge leases after an interrupted HTTP
        # process; receipt/body/deadline are immutable and untouched.
        self.sql('update private.capital_public_payload_purge_queue set lease_expires_at=case when status=\'leased\' then clock_timestamp()-interval \'1 second\' else lease_expires_at end,next_check_at=clock_timestamp() '
                 'where organization_id=' + base.literal(self.f['organizationId']) + "::uuid and status<>'purged';")
        expected = {x['allocationId'] for x in pending}
        removed = set()
        for _ in range(len(expected) + 3):
            for ticket in self.claim()['items']:
                if ticket['allocationId'] not in expected:
                    raise AssertionError('Cleanup refuses unrelated ticket')
                self.erase(ticket)
                if self.ack(ticket).get('purged') is not True:
                    raise AssertionError('Cleanup purge ACK failed')
                removed.add(ticket['allocationId'])
            if removed == expected: break
        if removed != expected:
            raise AssertionError('Cleanup physical purge incomplete')
        remaining = self.sql('select count(*) from storage.objects where bucket_id='
            + base.literal(base.BUCKET) + ' and name like ' + base.literal(self.f['organizationId'] + '/%') + ';')
        if remaining != '0': raise AssertionError('Cleanup retained physical body')
        self.sql('update public.processing_jobs set status=\'cancelled\',capability_sha256=null,lease_expires_at=null,leased_by=null '
            'where organization_id=' + base.literal(self.f['organizationId']) + "::uuid and status in ('queued','leased','awaiting_approval');")
        self.sql('update private.worker_tokens set status=\'revoked\',revoked_at=clock_timestamp() where execution_account_user_id='
            + base.literal(self.f['actorId']) + '::uuid and token_sha256=extensions.digest(' + base.literal(self.f['purgeToken']) + ",'sha256');")
        original = self.f['originalControl']
        self.sql('update private.capital_public_retention_controls set enabled=' + ('true' if original['enabled'] else 'false')
                 + ',policy_id=' + base.literal(original['policy']) + '::uuid where singleton;')
        # Auth identity remains traceable to immutable audit, but cannot log in anymore.
        self.sql('update auth.users set banned_until=\'infinity\' where id='
                 + base.literal(self.f['actorId']) + '::uuid;')
        print('body_storage_local_cleanup: PASS (physical404+ACK; scoped jobs/token/login closed; control restored)')


    def main(self):
        named_stage('login_and_isolation')
        self.login()
        # Fail early if full cascade fixture omitted, never skip with success.
        if not isinstance(self.f.get('acceptedOutput'), dict) or len(self.f.get('acceptedOutputFingerprint', '')) != 64:
            raise AssertionError('Schema-valid synthetic accepted output fixture required')
        # Poll leases are global: refuse before touching an unrelated active queue.
        unrelated = self.sql("select count(*) from private.capital_public_payload_purge_queue where status<>'purged' and organization_id<>"
                             + base.literal(self.f['organizationId']) + '::uuid;')
        if unrelated != '0':
            raise AssertionError('Nonisolated purge queue; operator must provide isolated staging')
        self.start_keepalive()
        named_stage('private_body_upload_commit_and_proof_negatives')
        revision = self.contribution()
        allocation = self.prepare(revision)
        observed = self.upload(allocation)
        for kw in ({'version': 'false-version'}, {'size': len(observed) + 1}, {'sha': '0' * 64}):
            self.commit(allocation, observed, ('22023', 'capital_body_proof_invalid'), **kw)
        retained = self.commit(allocation, observed)
        self.read(retained['retainedPayloadId'])
        again = self.commit(allocation, observed)
        if again['retainedPayloadId'] != retained['retainedPayloadId'] or not again['replayed']:
            raise AssertionError('Commit replay duplicated body')
        original_capability = self.capability
        self.capability = 'wrong-synthetic-capability-' + 'x' * 40
        self.read(retained['retainedPayloadId'], ('42501', 'capital_capture_denied'))
        self.physical_post(allocation, denied=True)
        self.denied_get(allocation)
        self.capability = original_capability
        self.direct_reads_denied(allocation)
        missing_status, _ = self.request('POST','/functions/v1/capital-body-read',
            json.dumps({'allocationId':allocation['allocationId'],'kind':'typed_body'}).encode(),job_headers=False,workspace_headers=False)
        if missing_status not in (400,401,403,404):
            raise SafeEvalFailure('edge_missing_headers_not_denied',missing_status)
        for route, payload in (('/storage/v1/object/list/' + base.BUCKET, {'prefix': allocation['path'].split('/')[0]}),
                               ('/storage/v1/object/sign/' + base.object_path(allocation), {'expiresIn': 60})):
            status, _ = self.request('POST', route, json.dumps(payload).encode())
            if status < 400:
                # A list can return empty, but must not disclose any object metadata.
                if '/list/' not in route:
                    raise AssertionError('Signed URL bypass allowed')
                if json.loads(_) != []:
                    raise AssertionError('List exposed object metadata')
        corrupt = self.prepare(revision)
        original_corrupt = corrupt['canonicalBody'].encode('utf8')
        # Relocate JSON whitespace, preserving parsed semantics and byte length.
        # The metadata scope can authorize identity while the byte SHA must deny.
        mutated = original_corrupt.replace(b', ', b' ,', 1)
        if (mutated == original_corrupt or len(mutated) != len(original_corrupt)
                or json.loads(mutated) != json.loads(original_corrupt)
                or base.digest(mutated) == corrupt['payloadFingerprint']):
            raise AssertionError('Corruption fixture must preserve size and parsed JSON')
        status, _ = self.request('POST','/storage/v1/object/' + base.object_path(corrupt),mutated)
        if status not in (200,201):
            raise SafeEvalFailure('corrupt_upload_fixture_failed',status)
        self.physical_post(corrupt,denied=True)
        corrupt_scope = self.job_rpc('worker_read_capital_body_allocation_v1',
            {'p_allocation_id': corrupt['allocationId']})
        corrupt_identity = {'id': corrupt_scope['storageObjectId'], 'version': corrupt_scope['storageVersion']}
        self.commit(corrupt, mutated, ('22023', 'capital_body_proof_invalid'), identity=corrupt_identity)
        if self.counts(corrupt)['receipt'] != 0:
            raise AssertionError('Corrupt body committed a receipt')
        print('body_http_wrong_capability_list_signed_url_corrupt_physical_json_denied: PASS')
        print('body_http_mediated_post_physical_upload_sha_size_version_replay_direct_storage_denied: PASS')
        named_stage('private_gateway_response_cascade')
        derived, result = self.cascade_output(retained)
        named_stage('public_parent_upload_commit_response')
        public_allocation, public_receipt = self.public_parent()
        public_derived, public_result = self.cascade_output(public_receipt)
        self.direct_reads_denied(public_allocation)
        self.physical_post(public_allocation)
        self.physical_post(public_derived)
        print('body_http_public_retained_parent_real_bytes_response_inheritance: PASS')
        self.select_job('expired')
        self.read(retained['retainedPayloadId'], ('42501', 'capital_body_read_denied'))
        self.physical_post(allocation,denied=True)
        self.denied_get(allocation)
        self.select_job('baseline')
        status, _ = self.request('GET', '/storage/v1/object/authenticated/' + base.object_path(allocation), authenticated=False)
        if status not in (400, 401, 403, 404):
            raise AssertionError('Unauthenticated physical body read allowed')
        print('body_http_other_live_job_and_anon_storage_denied: PASS')
        for label, mutation in [('expired', "lease_expires_at=clock_timestamp()-interval '1 second'"),
                                ('reassigned', "leased_account_user_id='" + self.f['otherWorkerAccountId'] + "'")]:
            named_stage('original_job_' + label + '_negative')
            self.select_job(label)
            other = self.prepare(self.contribution())
            stored = self.commit(other, self.upload(other))
            self.sql('update public.processing_jobs set ' + mutation + ' where id=' + base.literal(self.job)
                     + '::uuid and organization_id=' + base.literal(self.f['organizationId']) + '::uuid;')
            self.read(stored['retainedPayloadId'], ('42501', 'capital_capture_denied'))
            self.physical_post(other,denied=True)
            self.denied_get(other)
            print('body_http_original_job_' + label + '_denies_sql_post_storage: PASS')
        self.select_job('baseline')
        named_stage('source_revocation_private_public_denial')
        self.sql('update public.source_bindings set revoked_at=clock_timestamp() where id='
                 + base.literal(self.f['sourceBindingId']) + '::uuid and organization_id='
                 + base.literal(self.f['organizationId']) + '::uuid;')
        self.revoke_public_parent()
        self.job_rpc('worker_read_capital_public_payload_v1', {'p_retained_payload_id': public_receipt['retainedPayloadId']},
                     ('42501', 'capital_capture_retention_denied'))
        self.physical_post(public_allocation,denied=True)
        self.denied_get(public_allocation)
        for item, receipt in ((allocation, retained), (derived, result), (public_derived, public_result)):
            self.read(receipt['retainedPayloadId'], ('42501', 'capital_body_read_denied'))
            self.physical_post(item,denied=True)
            self.denied_get(item)
        print('body_http_identical_post_url_jwt_revocation_denies_private_public_parents_responses: PASS')
        named_stage('cascade_physical_delete_and_ack')
        expected_ids = {x['allocationId'] for x in self.allocations}
        erased = set()
        for _ in range(len(expected_ids) + 3):
            tickets = self.claim()['items']
            for ticket in tickets:
                if ticket['allocationId'] not in expected_ids:
                    raise AssertionError('Unrelated purge ticket claimed; operator cleanup required')
                self.ack(ticket, False, ('22023', 'capture_purge_proof_invalid'))
                self.erase(ticket)  # Real DELETE then genuine Storage INFO404 + catalog absence.
                if self.ack(ticket).get('purged') is not True:
                    raise AssertionError('Purge ACK failed')
                erased.add(ticket['allocationId'])
            if erased == expected_ids:
                break
        if erased != expected_ids:
            raise AssertionError('Cascade purge incomplete; operator cleanup required')
        print('body_http_cascade_delete_genuine404_ack: PASS')
        print('capital_body_retention_storage: PASS (real synthetic HTTP; no provider evidence)')


def provision_local():
    """Fresh localhost CI only. No policy/lease fixture trigger is installed."""
    database = base.local_url(os.environ['DATABASE_URL'], database=True)
    api = base.local_url(os.environ['OFFROAD_E2E_API_URL'])
    key = os.environ['OFFROAD_E2E_PUBLISHABLE_KEY']
    target = Path(os.environ['OFFROAD_BODY_STORAGE_FIXTURE_FILE']).resolve()
    if ROOT == target or ROOT in target.parents or target.exists():
        raise AssertionError('Fresh secret manifest outside git required')
    spec = importlib.util.spec_from_file_location('capture_fixture', ROOT / 'scripts/ci/test-capital-public-capture-concurrency.py')
    fixture = importlib.util.module_from_spec(spec); spec.loader.exec_module(fixture)
    support = ROOT / 'supabase/tests/support'
    includes = '\n'.join(fixture.expand(support / name) for name in
        ('legacy_persistent_work_fixture.sql', 'provider_research_plan_snapshot.sql', 'execution_approval.sql'))
    ids = {k: str(uuid.uuid4()) for k in ('actor','other','org','publisherOrg','publisherWork','source','publicSource','fund','directory')}
    password = uuid.uuid4().hex + uuid.uuid4().hex
    token = uuid.uuid4().hex + uuid.uuid4().hex
    email = 'body-local-' + uuid.uuid4().hex + '@example.invalid'
    public_payload = {'url': 'https://example.invalid/typed-body-public-parent', 'title': 'Synthetic public parent',
        'snippet': 'Synthetic authorized public bytes ação € 漢字', 'contentHash': base.digest(b'synthetic-public-parent')}
    replacements = {k: base.literal(v) for k, v in ids.items()}
    q = lambda k: replacements[k] + '::uuid'
    query = 'begin; set local statement_timeout=\'45s\';' + includes + f"""
create temp table body_local_jobs(label text,job_id uuid,work_id uuid,capability text);
create temp table body_local_control as select enabled,policy_id from private.capital_public_retention_controls where singleton;
-- Fresh CI stack only: enable installed policy during physical eval, restore in cleanup.
update private.capital_public_retention_controls set enabled=true where singleton;
do $$ declare actor uuid:={q('actor')};other uuid:={q('other')};org uuid:={q('org')};
 token text:={base.literal(token)};plan jsonb:=pg_temp.provider_research_plan_fixture();
 job_label text;request uuid;result jsonb;job uuid;work uuid;claim jsonb; begin
 if exists(select 1 from private.capital_public_payload_purge_queue where status<>'purged') then raise exception 'body_local_nonisolated_queue';end if;
 insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
 values(actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',{base.literal(email)},
 extensions.crypt({base.literal(password)},extensions.gen_salt('bf')),clock_timestamp(),'','','','',
 '{{"provider":"email","providers":["email"]}}','{{}}',clock_timestamp(),clock_timestamp(),false,false),
 (other,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','body-other-'||other::text||'@example.invalid',
 extensions.crypt(encode(extensions.gen_random_bytes(24),'hex'),extensions.gen_salt('bf')),clock_timestamp(),'','','','',
 '{{"provider":"email","providers":["email"]}}','{{}}',clock_timestamp(),clock_timestamp(),false,false);
 insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at)
 values(gen_random_uuid(),actor,actor::text,'email',jsonb_build_object('sub',actor::text,'email',{base.literal(email)}),clock_timestamp(),clock_timestamp());
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','aal','aal1')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-offroad-workspace',org)::text,true);
 insert into public.organizations(id,organization_type,name,created_by) values(org,'originator','Synthetic typed body CI',actor);
 insert into public.organization_memberships(organization_id,user_id,role,status) values(org,actor,'owner','active');
 -- Scoped synthetic existing customer provisioning; no default/global trigger change.
 perform public.set_workspace_capability_v1('origination_representation',true,0);
 perform public.set_workspace_capability_v1('external_disclosure',true,0);
 insert into public.funds(id,organization_id,name,strategy,created_by) values({q('fund')},org,'Synthetic typed body CI fund','credit',actor);
 insert into public.fund_directory(id,legal_name,kind,status,claimed_by_organization_id,claimed_at)
 values({q('directory')},'Synthetic typed body CI directory','credit_fund','registered',org,clock_timestamp());
 insert into private.worker_tokens(label,token_sha256,execution_account_user_id)
 values('synthetic-body-local-'||org::text,extensions.digest(token,'sha256'),actor);
 foreach job_label in array array['baseline','expired','reassigned'] loop
 request:=gen_random_uuid();
 perform pg_temp.legacy_advisor_result(public.start_advisor_project_v1(request,'pt-BR','Synthetic body '||job_label,plan#>>'{{job,id}}','Pesquise financiadores para a organização.','public_information',plan));
 result:=public.start_provider_research_project_v1(request,'pt-BR','Synthetic body '||job_label,'Pesquise financiadores para a organização.',plan,null);
 job:=(result->>'research_job_id')::uuid;work:=(result->>'capital_project_id')::uuid;
 perform pg_temp.fixture_approve_execution(job);
 update public.processing_jobs set available_at=clock_timestamp()-interval '1 hour' where id=job and organization_id=org;
 claim:=public.worker_claim_job_v3(token,3600);
 if claim->>'job_id' is distinct from job::text then raise exception 'body_local_claim_mismatch';end if;
 insert into pg_temp.body_local_jobs values(job_label,job,work,claim->>'capability_token');
 end loop;
 select work_id into strict work from pg_temp.body_local_jobs where label='baseline';
 insert into public.sources(id,organization_id,origin_resource_id,origin_resource_reference,created_by) values({q('source')},org,work,work,actor);
 insert into public.source_versions(id,organization_id,source_id,version_no,legacy_document_version,bucket_id,object_path,original_name,initial_verification_state,created_by)
 values({q('source')},org,{q('source')},1,1,'opportunity-documents',org::text||'/synthetic/'||{q('source')}::text,'Synthetic typed body CI source','pending_verification',actor);
 insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
 values(org,{q('source')},work,work,gen_random_uuid(),actor);
 perform public.set_source_rights_v1({q('source')},0,array['read','process','store','derive'],array['analysis'],clock_timestamp()+interval '35 days',clock_timestamp()+interval '30 days',{q('source')},repeat('b',64));
 perform public.worker_claim_capital_capture_purge_v1(token,100);
 end $$;
-- A real publisher and declaration; private body never receives this license.
select set_config('request.headers',jsonb_build_object('x-offroad-workspace',{q('publisherOrg')})::text,true);
insert into public.organizations(id,organization_type,name,created_by) values({q('publisherOrg')},'offroad','Synthetic body CI public publisher',{q('actor')});
insert into public.organization_memberships(organization_id,user_id,role,status) values({q('publisherOrg')},{q('actor')},'owner','active');
insert into public.capital_projects(id,organization_id,project_name,created_by) values({q('publisherWork')},{q('publisherOrg')},'Synthetic body CI publication',{q('actor')});
insert into public.sources(id,organization_id,origin_resource_id,origin_resource_reference,created_by) values({q('publicSource')},{q('publisherOrg')},{q('publisherWork')},{q('publisherWork')},{q('actor')});
insert into public.source_versions(id,organization_id,source_id,version_no,legacy_document_version,bucket_id,object_path,original_name,initial_verification_state,created_by)
values({q('publicSource')},{q('publisherOrg')},{q('publicSource')},1,1,'opportunity-documents',{base.literal(ids['publisherOrg']+'/synthetic/'+ids['publicSource'])},'Synthetic declared public source','pending_verification',{q('actor')});
insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
values({q('publisherOrg')},{q('publicSource')},{q('publisherWork')},{q('publisherWork')},gen_random_uuid(),{q('actor')});
create temp table body_local_public_rights as select public.declare_public_source_reuse_v1({q('publicSource')},0,
{base.json_literal(public_payload)}->>'url',private.public_source_payload_sha256_v1({base.json_literal(public_payload)}),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 hour',{q('publicSource')},repeat('c',64)) as id;
commit;
select jsonb_build_object('jobs',(select jsonb_object_agg(j.label,jsonb_build_object('jobId',j.job_id,'workId',j.work_id,'capabilityToken',j.capability)) from pg_temp.body_local_jobs j),
'originalControl',(select jsonb_build_object('enabled',enabled,'policy',policy_id) from pg_temp.body_local_control),
'sourceBindingId',(select id from public.source_bindings where organization_id={q('org')} and source_version_id={q('source')}),
'publicParent',jsonb_build_object('licensingOrganizationId',{q('publisherOrg')},'sourceVersionId',{q('publicSource')},'rightsVersionId',(select id from pg_temp.body_local_public_rights),
'sourceBindingId',(select id from public.source_bindings where organization_id={q('publisherOrg')} and source_version_id={q('publicSource')}),'payload',{base.json_literal(public_payload)}));
"""
    command = ['psql', database, '-X','-A','-t','-q','-v','ON_ERROR_STOP=1']
    result = __import__('subprocess').run(command,input=query,text=True,capture_output=True,timeout=60)
    if result.returncode:
        raise AssertionError('Local scoped fixture provisioning failed')
    f = json.loads(result.stdout.strip().splitlines()[-1])
    f.update({'environment':'local','projectRef':'local','apiUrl':api,'databaseHost':urlparse(database).hostname,
        'publishableKey':key,'organizationId':ids['org'],'actorId':ids['actor'],'email':email,'password':password,
        'purgeToken':token,'sourceVersionId':ids['source'],'otherWorkerAccountId':ids['other'],
        'requestId':str(uuid.uuid4()),'acceptedRequestId':str(uuid.uuid4())})
    validate_environment(f,database)
    fd = os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as out: json.dump(f,out)
    print('body_storage_local_fixture: READY (owner-only manifest; no remote)')


def self_test():
    base.self_test()
    sample = {'environment': 'local', 'projectRef': 'local', 'apiUrl': 'http://127.0.0.1:54321',
        'databaseHost': '127.0.0.1', 'publishableKey': 'sb_publishable_synthetic',
        **{k: str(uuid.uuid4()) for k in ('organizationId','actorId','sourceVersionId','sourceBindingId','otherWorkerAccountId')},
        'jobs': {k: {'jobId': str(uuid.uuid4()), 'workId': str(uuid.uuid4())} for k in ('baseline','expired','reassigned')}}
    validate_environment(sample, 'postgresql://localhost/db')
    for bad in ({**sample, 'apiUrl': 'https://' + PRODUCTION_REF + '.supabase.co'},
                {**sample, 'publishableKey': 'sb_secret_forbidden'}, {**sample, 'environment': 'production'}):
        try:
            validate_environment(bad, 'postgresql://localhost/db')
        except AssertionError:
            pass
        else:
            raise AssertionError('Unsafe environment accepted')
    with tempfile.TemporaryDirectory() as temporary:
        folder = Path(temporary)
        folder.chmod(0o700)
        staging = {**sample, 'environment': 'staging', 'projectRef': 'gjkkjtbfnssdsbmlhmwk'}
        assert validate_bridge(str(folder), staging) == folder.resolve()
        for bad in (sample, {**staging, 'projectRef': PRODUCTION_REF}):
            try:
                validate_bridge(str(folder), bad)
            except AssertionError:
                pass
            else:
                raise AssertionError('Bridge accepted wrong environment')
        folder.chmod(0o755)
        try:
            validate_bridge(str(folder), staging)
        except AssertionError:
            pass
        else:
            raise AssertionError('Bridge accepted insecure directory')
        folder.chmod(0o700)
        link = folder / 'symlink'
        link.symlink_to(folder, target_is_directory=True)
        try:
            validate_bridge(str(link), staging)
        except AssertionError:
            pass
        else:
            raise AssertionError('Bridge accepted symlink')
    try:
        validate_bridge(str(ROOT), staging)
    except AssertionError:
        pass
    else:
        raise AssertionError('Bridge accepted repository')
    # Delayed orchestration response is not a product lease renewal. Fake time
    # proves a response at 180s is accepted and a missing response fails at 300s.
    from contextlib import redirect_stdout
    from io import StringIO
    from unittest.mock import patch
    for reply_at in (180, None):
        with tempfile.TemporaryDirectory() as temporary:
            bridge_harness = object.__new__(BodyStorage)
            bridge_harness.bridge = Path(temporary)
            bridge_harness.f = {'projectRef': 'gjkkjtbfnssdsbmlhmwk'}
            bridge_harness.ensure_heartbeat = lambda: None
            bridge_harness.bridge_query_allowed = lambda query: None
            clock_value = [0.0]
            def fake_wait(duration):
                assert duration == 0.1
                clock_value[0] += 30
                if reply_at is not None and clock_value[0] >= reply_at:
                    request_file = next(bridge_harness.bridge.glob('*.request.json'))
                    request_data = json.loads(request_file.read_text())
                    response = request_file.with_name(request_data['id'] + '.response.json')
                    response.write_text(json.dumps({'id': request_data['id'],
                        'projectRef': request_data['projectRef'], 'ok': True, 'value': 'synthetic-result'}))
                    response.chmod(0o600)
            with patch.object(time, 'monotonic', side_effect=lambda: clock_value[0]), \
                    patch.object(time, 'sleep', side_effect=fake_wait), redirect_stdout(StringIO()):
                if reply_at is not None:
                    assert bridge_harness.sql('select synthetic_metadata;') == 'synthetic-result'
                    assert clock_value[0] == 180
                else:
                    try:
                        bridge_harness.sql('select synthetic_metadata;')
                    except SafeEvalFailure as error:
                        assert error.operation == 'sql_bridge_timeout'
                        assert clock_value[0] == STAGING_BRIDGE_TIMEOUT_SECONDS == 300
                    else:
                        raise AssertionError('Bridge timeout did not fail closed')
    print('body_storage_bridge_delayed_response_timeout_static_self_test: PASS (180s accepted, 300s fails closed; fake clock only)')
    # Both erasure proofs remain mandatory; only bridge catalogue ordering changes.
    for bridge, expected_order in ((Path('/synthetic-private-bridge'), ['DELETE_INFO404', 'ACK', 'CATALOGUE0']),
                                   (None, ['DELETE_INFO404', 'CATALOGUE0', 'ACK'])):
        purge_harness = object.__new__(BodyStorage)
        purge_harness.bridge = bridge
        purge_harness.f = {'purgeToken': 'synthetic-token'}
        order = []
        def erase_spy(self, ticket, verify_catalogue=True):
            order.append('DELETE_INFO404')
            if verify_catalogue:
                self.assert_catalogue_absent(ticket)
        def ack_spy(name, arguments, expected=None):
            order.append('ACK')
            return {'purged': True}
        purge_harness.rpc = ack_spy
        purge_harness.assert_catalogue_absent = lambda ticket: order.append('CATALOGUE0')
        ticket = {'purgeId': 'synthetic-purge', 'purgeCapability': 'synthetic-capability'}
        with patch.object(base.RetentionStorage, 'erase', new=erase_spy):
            purge_harness.erase(ticket)
            purge_harness.ack(ticket)
        assert order == expected_order
    # A failed mandatory post-ACK catalogue proof propagates as eval failure.
    purge_harness.bridge = Path('/synthetic-private-bridge')
    def fail_catalogue(ticket):
        raise SafeEvalFailure('sql_bridge_timeout')
    purge_harness.assert_catalogue_absent = fail_catalogue
    try:
        purge_harness.ack(ticket)
    except SafeEvalFailure as error:
        assert error.operation == 'sql_bridge_timeout'
    else:
        raise AssertionError('Post-ACK catalogue proof was skipped')
    print('body_storage_bridge_ack_catalogue_order_static_self_test: PASS (both mandatory, native unchanged, proof failure propagates; no SQL/HTTP)')
    # Bridge throughput changes only batch size, never server lease/deadline fields.
    claim_harness = object.__new__(BodyStorage)
    claim_harness.f = {'purgeToken': 'synthetic-purge-token'}
    claim_calls = []
    def claim_rpc(name, arguments):
        claim_calls.append((name, arguments))
        return {'items': []}
    claim_harness.rpc = claim_rpc
    for bridge, expected_limit in ((Path('/synthetic-private-bridge'), 1), (None, 100)):
        claim_harness.bridge = bridge
        claim_harness.claim()
        name, arguments = claim_calls[-1]
        assert name == 'worker_claim_capital_capture_purge_v1'
        assert arguments == {'p_worker_token': 'synthetic-purge-token', 'p_limit': expected_limit}
    print('body_storage_bridge_one_ticket_fixed_lease_static_self_test: PASS (bridge1/local100, no lease override; no SQL/HTTP)')
    # Offline clock/recursion/phase adversaries: never mint a health row or use SQL.
    from unittest.mock import patch
    harness = object.__new__(BodyStorage)
    harness.jwt = 'synthetic-jwt'
    harness._heartbeat_enabled = True
    harness._heartbeat_inflight = False
    harness._last_purge_heartbeat = 0.0
    polls = []
    def empty_claim():
        polls.append(1)
        harness.ensure_heartbeat()  # Would recurse without explicit in-flight guard.
        harness._last_purge_heartbeat = time.monotonic()
        return {'items': []}
    harness.claim = empty_claim
    harness.ensure_heartbeat()
    assert len(polls) == 1
    harness.ensure_heartbeat()
    assert len(polls) == 1
    harness.bridge = None
    harness._last_purge_heartbeat = 0.0
    with patch.object(base.RetentionStorage, 'sql', return_value=''):
        harness.sql('update public.source_bindings set revoked_at=clock_timestamp() where id=synthetic;')
    assert not harness._heartbeat_enabled and len(polls) == 1
    harness._heartbeat_enabled = True
    harness._last_purge_heartbeat = 0.0
    harness.claim = lambda: {'items': [{'synthetic': 'unexpected-ticket'}]}
    try:
        harness.ensure_heartbeat()
    except SafeEvalFailure as error:
        assert error.operation == 'purger_keepalive_unexpected_tickets'
    else:
        raise AssertionError('Unexpected ticket incorrectly treated as heartbeat')
    assert not harness._heartbeat_enabled and not harness._heartbeat_inflight
    try:
        raise AssertionError('private' + ' dynamic sentinel must never be printed')
    except AssertionError as error:
        location = safe_failure_location(error)
        assert location['assertionCode'] == 'dynamic_assertion'
        assert 'sentinel' not in json.dumps(location)
    print('body_storage_heartbeat_static_self_test: PASS (bounded, no recursion, stops before revoke, tickets fail; no SQL/HTTP)')
    print('body_storage_static_self_test: PASS (environment, key, bridge production/path/permissions; no SQL/HTTP executed)')


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--self-test']:
            self_test()
        elif sys.argv[1:] == ['--provision-local']:
            provision_local()
        elif sys.argv[1:] == ['--cleanup-local']:
            BodyStorage().cleanup_local()
        elif sys.argv[1:]:
            raise SystemExit('Usage: test-capital-body-retention-storage.py [--self-test|--provision-local|--cleanup-local]')
        else:
            BodyStorage().main()
    except Exception as failure:
        # Only fixed stage/operation and structured status/code are emitted.
        diagnostic = {'stage': CURRENT_STAGE, **safe_failure_location(failure)}
        if isinstance(failure, SafeEvalFailure):
            diagnostic.update({'operation': failure.operation, 'httpStatus': failure.http_status, 'sqlState': failure.sql_state})
        print('capital_body_retention_storage: FAILED ' + json.dumps(diagnostic, sort_keys=True), file=sys.stderr)
        raise SystemExit('Operator cleanup required; no raw response or secrets printed') from None
