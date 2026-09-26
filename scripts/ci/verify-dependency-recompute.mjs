// Disposable localhost stack only. Stage 18, increment 3B: the worker's dependency recompute loop,
// through its own module and RPC client, against the migrations of this commit. A synthetic capital
// work carries a governed working basis; the released capital method is installed with the profile
// its manifest derives, released and universal; the founder grants the organization's producer. The
// owner, signed in, reads the v2 basis, composes the request with the composition the web action
// uses and requests the root execution through request_work_execution_v2. A new revision of the
// working basis then changes one decision, and the dependency effect of its events plans one
// zero-budget candidate. The worker account, signed in and bound to its worker token, runs the
// recompute loop: it claims the candidate, reads the requester's basis at the head revision,
// composes what the root execution was asked and submits. The proof checks that exactly that
// candidate was produced, for the original requester, pinning the head revision, with a gate
// receipt carrying the root's situations, a queued pinned job and lineage naming the root; and
// that the bundle the loop ran from contains no model gateway. Before the loop, the recompute health
// the worker reads (6A) counts the candidate in one recompute.health line of four numbers. Synthetic
// data only; no provider key and no network beyond the local stack.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const local = ['localhost', '127.0.0.1', '[::1]'];
const database = new URL(process.env.OFFROAD_E2E_DATABASE_URL ?? 'invalid:');
assert(['postgres:', 'postgresql:'].includes(database.protocol) && local.includes(database.hostname) && !database.search && !database.hash, 'local_database_required');
const api = new URL(process.env.OFFROAD_E2E_API_URL || 'invalid:');
assert(['http:', 'https:'].includes(api.protocol) && local.includes(api.hostname) && (api.pathname === '/' || api.pathname === '') && !api.search && !api.hash, 'local_api_required');
const publishableKey = process.env.OFFROAD_E2E_PUBLISHABLE_KEY ?? '';
assert(publishableKey.length > 0, 'local_publishable_key_required');
for (const name of Object.keys(process.env)) if (name.endsWith('_API_KEY')) delete process.env[name];
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
const sql = query => {
  try { return execFileSync('psql', ['--dbname', database.href, '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-Atq'], {input: query, env, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe']}).trim(); }
  catch (error) { throw new Error('dependency_recompute_sql_failed: ' + (error.code ?? 'sql_error') + ' ' + String(error.stderr ?? '').slice(-2000)); }
};
const literal = text => `convert_from(decode('${Buffer.from(text).toString('hex')}','hex'),'UTF8')`;
const expand = path => readFileSync(path, 'utf8').replace(/^\\ir (.+)$/gm, (_line, p) => expand(resolve(dirname(path), p)));
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');

// Synthetic scope, apart from every other committed fixture of the job: the execution fixture's
// organization, people and work under their own prefix, and a worker account of this proof.
const prefix = 'a4197000';
const id = (group, n) => `${prefix}-0000-4000-${group}-${String(n).padStart(12, '0')}`;
const organization = id('9000', 1), work = id('9000', 2), owner = id('8000', 1), worker = id('8000', 7);
const ownerEmail = 'a4197-a@example.invalid', workerEmail = 'a4197-worker@example.invalid';
const workerToken = `synthetic-dependency-recompute-proof-worker-token-${prefix}`;
const password = 'Synthetic-Recompute!2026';
const purpose = 'prepare-capital-structure-decision';
const capability = 'synthetic-dependency-recompute-proof';

const workerRequire = createRequire(join(root, 'apps/document-worker/package.json'));
const {build} = workerRequire('esbuild');
const {createClient} = workerRequire('@supabase/supabase-js');
const temporary = mkdtempSync(join(tmpdir(), 'offroad-dependency-recompute-proof-'));
try {
  // 1. The worker's own recompute module and the shared composition, bundled as the worker image
  // bundles them, plus the synthetic basis and the released method artifacts.
  const outfile = join(temporary, 'recompute.mjs');
  const bundle = await build({stdin: {contents: `export {createDependencyRecomputeQueue, createRecomputeHealthMonitor, runDependencyRecomputeOnce} from './src/dependency-recompute.ts';
export {composeCapitalExecutionRequest, executionContractBasisSchema} from '@offroad/execution-request';
export {adoptedCapitalPeriodFixture} from '@offroad/testing-fixtures/capital-structure-decision';
export {deriveExecutionProfile, executionCanonicalText} from '@offroad/agent-contracts';
export {releasedMethodArtifacts} from './src/released-methods.generated.ts';`, resolveDir: join(root, 'apps/document-worker'), loader: 'ts'},
  outfile, bundle: true, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent', metafile: true});
  const recomputeInputs = Object.keys(bundle.metafile.inputs).filter(path => !path.includes('testing-fixtures') && !path.includes('released-methods.generated'));
  assert(!recomputeInputs.some(path => /model-gateway|anthropic|openai/i.test(path)), 'the recompute bundle reaches a model');
  const m = await import(pathToFileURL(outfile));
  const {buildReleasedExecutors} = await import(pathToFileURL(join(root, 'packages/credit-playbook/scripts/build-released-executors.mjs')));
  await buildReleasedExecutors();
  const release = m.releasedMethodArtifacts.find(r => r.methodId === purpose);
  assert(release, 'released_capital_method_missing');
  const manifest = JSON.parse(readFileSync(join(root, 'apps/document-worker/released-methods', release.artifactHash + '.manifest.json'), 'utf8'));
  const profile = m.deriveExecutionProfile(manifest, {id: release.platformReleaseId, manifestHash: release.manifestHash});
  const profileText = m.executionCanonicalText(profile);
  const original = {...m.adoptedCapitalPeriodFixture().snapshot, purpose};

  // 2. As the database owner: the execution fixture under this prefix, the governed capital basis of
  // the pinned consumer proof over the synthetic adopted period, the released capital method with
  // its profile, the founder's producer grant, and sign-in for the owner and the worker account,
  // whose worker token is bound to it.
  const replace = text => text.replaceAll('a11b0000', prefix).replaceAll('a4171000', 'a4198000').replaceAll('a11b-', 'a4197-').replaceAll('synthetic-execution', 'synthetic-execution-recompute-proof');
  const setup = sql(`begin;
${replace(expand(join(root, 'supabase/tests/support/execution_commands_fixture.sql')))}
select set_config('offroad.synthetic_capital_basis',${literal(JSON.stringify(original))},true);
${replace(expand(join(root, 'supabase/tests/support/capital_consumer_basis_fixture.sql')))}
insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source)
values('${capability}',true,'universal',${literal(release.methodId)},${literal(release.methodVersion)},'tested','Synthetic CI',current_date,'Disposable CI only');
insert into private.platform_method_releases(id,method_id,version,manifest_hash,manifest,components,evidence,approval,capability_key)
values(${literal(release.platformReleaseId)},${literal(release.methodId)},${literal(release.methodVersion)},${literal(release.manifestHash)},${literal(JSON.stringify(manifest))}::jsonb,'[]','["Synthetic CI only"]','{}','${capability}');
insert into private.execution_method_profiles(id,platform_release_id,serialization_version,canonical_payload,payload_fingerprint,adapter_source_commit,review_evidence)
values('a4198000-0000-4000-9000-000000000099',${literal(release.platformReleaseId)},'offroad-execution-json-utf16-v1',${literal(profileText)},${literal(sha(profileText))},repeat('c',40),'{"result":"approved","subjectCommit":"cccccccccccccccccccccccccccccccccccccccc","reviewer":"Synthetic CI","sourceHash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}');
insert into private.platform_principals(user_id,role,label) values('${owner}','founder','Synthetic founder of the recompute proof') on conflict (user_id) do nothing;
select private.grant_execution_producer_v1('${id('9000', 21)}','${organization}',true,'Synthetic producer grant for the dependency recompute proof','${owner}');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('${worker}','authenticated','authenticated','${workerEmail}','{}','{}',now(),now(),false,false);
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id)
values('${id('9000', 22)}','Synthetic dependency recompute proof worker',extensions.digest('${workerToken}','sha256'),'${worker}');
update auth.users set instance_id='00000000-0000-0000-0000-000000000000',email_confirmed_at=now(),confirmation_token='',recovery_token='',email_change_token_new='',email_change='',
 encrypted_password=extensions.crypt(${literal(password)},extensions.gen_salt('bf')),raw_app_meta_data='{"provider":"email","providers":["email"]}'
 where id in ('${owner}','${worker}');
insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at)
select gen_random_uuid(),id,id::text,'email',jsonb_build_object('sub',id::text,'email',email),now(),now() from auth.users where id in ('${owner}','${worker}');
select 'BASIS:'||receipt::text from capital_consumer_basis_receipt;
drop trigger zzz_fixture_source_rights on public.source_versions;
drop trigger zz_synthetic_legacy_workspace_capabilities on public.organizations;
commit;`);
  const basisLine = setup.split('\n').find(line => line.startsWith('BASIS:'));
  assert(basisLine, 'basis_missing');
  const governed = JSON.parse(basisLine.slice(6));
  const baseVersion = governed.mapping[original.versionId];
  assert(baseVersion && governed.pins.length === original.entries.length, 'incomplete_governed_basis');

  const session = async (email, headers = {}) => {
    const client = createClient(api.origin, publishableKey, {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}, global: {headers}});
    const {error} = await client.auth.signInWithPassword({email, password});
    assert.equal(error, null, `sign_in_failed_${email}`);
    return client;
  };
  // DDL on the fixture's temporary objects makes PostgREST reload its schema cache; a request that
  // lands during the reload is retried, and only that.
  const call = async (client, name, args) => {
    for (let attempt = 1; ; attempt++) {
      const {data, error} = await client.rpc(name, args);
      if (error?.code === 'PGRST002' && attempt < 20) { await new Promise(done => setTimeout(done, 500)); continue; }
      assert.equal(error, null, `${name}: ${error?.message ?? ''}`);
      return data;
    }
  };

  // 3. The owner requests the root execution as the web action does: the v2 basis, the shared
  // composition over what is asked, and the three texts through request_work_execution_v2.
  const human = await session(ownerEmail, {'x-offroad-workspace': organization});
  const ask = {question: 'Does the current structure sustain the refinancing plan?', objectives: ['Measure liquidity through the refinancing', 'Test the covenant headroom'],
    asOf: '2026-12-31', situationIds: ['refinancing', 'near-covenant']};
  const rootBasis = m.executionContractBasisSchema.parse(await call(human, 'execution_contract_basis_v2', {p_work_id: work, p_version_id: baseVersion}));
  const rootId = randomUUID();
  const composed = m.composeCapitalExecutionRequest({basis: rootBasis, ask, ids: {executionId: rootId, requestId: randomUUID(), processingRunId: randomUUID(), snapshotId: randomUUID()}});
  assert(composed.ok, `root_composition_refused: ${composed.error}`);
  const requested = await call(human, 'request_work_execution_v2', {p_contract_text: composed.contractText, p_snapshot_text: composed.snapshotText, p_gates_text: composed.gatesText});
  assert.equal(requested.executionId, rootId, 'root_execution_not_created');

  // 4. A new revision of the working basis changes one decision (same slot, a new adoption), and the
  // dependency effect of its events plans the candidate, as the outbox consumer applies it.
  const headVersion = randomUUID();
  sql(`begin;
select set_config('request.jwt.claim.sub','${owner}',true);
do $$
declare v public.assumption_versions;changed public.adoption_decisions;decision uuid;decisions uuid[];entries jsonb;canonical text;
begin
 select * into strict v from public.assumption_versions where id='${baseVersion}';
 select a.* into strict changed from public.adoption_decisions a join private.assumption_version_items i on i.decision_id=a.id where i.version_id=v.id order by a.slot_key limit 1;
 insert into public.adoption_decisions(organization_id,set_id,kind,field_path,slot_key,dimensions,value_type,asserted_value,reference_observation_id,definition_version_id,entity_id,reason,created_by)
 values(changed.organization_id,changed.set_id,changed.kind,changed.field_path,changed.slot_key,changed.dimensions,changed.value_type,changed.asserted_value,null,changed.definition_version_id,changed.entity_id,
  'Synthetic revised adoption for the dependency recompute proof',auth.uid()) returning id into decision;
 decisions:=array(select case when i.decision_id=changed.id then decision else i.decision_id end from private.assumption_version_items i where i.version_id=v.id);
 select jsonb_agg(private.adoption_entry_json_v1(a.id) order by a.slot_key) into entries from public.adoption_decisions a where a.id=any(decisions);
 canonical:=jsonb_build_object('schemaVersion','contextual-adoption.v1','versionId','${headVersion}','setId',v.set_id,'workId','${work}','purpose',v.canonical_snapshot::jsonb->>'purpose',
  'contextKey',v.canonical_snapshot::jsonb->>'contextKey','revision',v.revision+1,'previousVersionId',v.id,'classification','working_basis','entries',entries)::text;
 insert into public.assumption_versions(id,organization_id,set_id,revision,previous_version_id,classification,canonical_snapshot,content_fingerprint,request_fingerprint,created_by)
 values('${headVersion}',v.organization_id,v.set_id,v.revision+1,v.id,'working_basis',canonical,encode(extensions.digest(canonical,'sha256'),'hex'),
  encode(extensions.digest('Synthetic dependency recompute proof revision: ${headVersion}','sha256'),'hex'),auth.uid());
 insert into private.assumption_version_items(organization_id,set_id,version_id,slot_key,decision_id)
 select a.organization_id,a.set_id,'${headVersion}',a.slot_key,a.id from public.adoption_decisions a where a.id=any(decisions);
end $$;
commit;`);
  sql(`select count(*) from (select private.apply_dependency_event_v1(e.organization_id,e.id) from private.domain_events e
 where e.organization_id='${organization}' and e.effect='propagate_dependencies' and e.created_at>=(select v.created_at from public.assumption_versions v where v.id='${headVersion}') order by e.created_at,e.id) applied;`);
  const {id: candidateId, ...planned} = JSON.parse(sql(`select jsonb_build_object('count',count(*),'id',min(c.id::text),'state',min(c.state),'action',min(c.action),
 'base',min(c.base_execution_id::text),'budget',max(c.max_cost_microusd)+max(c.max_model_calls)) from public.work_recompute_candidates c where c.organization_id='${organization}';`));
  assert.deepEqual(planned, {count: 1, state: 'scheduled', action: 'recompute', base: rootId, budget: 0}, `candidate_not_planned: ${JSON.stringify(planned)}`);

  // 5. The worker loop, as the worker image runs it: preflight of the runtime contract, then the
  // recompute until nothing is schedulable. It claims candidates of every organization, so the
  // outcome that matters is the one of this candidate.
  const account = await session(workerEmail);
  const contract = await call(account, 'worker_runtime_schema_contract_v1', {});
  assert(contract.capabilities.includes('dependency-recompute.v1'), 'runtime_capability_missing');
  assert(contract.capabilities.includes('dependency-recompute-health.v1'), 'runtime_health_capability_missing');
  // The health the loop reads at most every 30 seconds (6A), through the worker entry point as the
  // worker account: one recompute.health line of four numbers that counts the scheduled candidate,
  // and no second read inside the throttle window.
  const healthLines = [];
  const health = m.createRecomputeHealthMonitor(account, workerToken, (event, detail) => healthLines.push({event, ...detail}));
  const reading = await health.maybeRead();
  assert.equal(await health.maybeRead(), null, 'recompute_health_not_throttled');
  assert.deepEqual(healthLines.filter(line => line.event !== 'recompute.backlog.failed').map(line => line.event), ['recompute.health'], `recompute_health_lines: ${JSON.stringify(healthLines)}`);
  assert.deepEqual(Object.keys(healthLines[0]).sort(), ['awaitingAuthorizationCount', 'event', 'expiredLeaseCount', 'oldestScheduledSeconds', 'scheduledCount']);
  assert(reading && reading.scheduledCount >= 1 && Object.values(reading).every(value => Number.isInteger(value) && value >= 0), `recompute_health_reading: ${JSON.stringify(reading)}`);
  const queue = m.createDependencyRecomputeQueue(account, workerToken);
  const started = performance.now();
  const outcomes = [];
  for (let n = 0; n < 20; n++) {
    const outcome = await m.runDependencyRecomputeOnce(queue);
    if (outcome.status === 'idle') break;
    outcomes.push(outcome);
  }
  const loopMs = Math.ceil(performance.now() - started);
  const produced = outcomes.find(outcome => outcome.candidateId === candidateId);
  assert.equal(produced?.status, 'produced', `candidate_not_produced: ${JSON.stringify(outcomes)}`);

  // 6. What the database recorded, read as its owner. With no hold and its only candidate scheduled,
  // the request is scheduled; it becomes ready when the produced execution settles the candidate.
  const recorded = JSON.parse(sql(`select jsonb_build_object(
 'candidate',(select jsonb_build_object('state',c.state,'execution',c.execution_id,'reason',c.reason,'realizes',private.execution_realizes_inputs_v1(c.organization_id,c.execution_id,c.head_inputs))
  from public.work_recompute_candidates c where c.id='${candidateId}'),
 'lineage',(select jsonb_build_object('root',l.root_execution_id,'candidate',l.candidate_id) from private.execution_lineage l where l.execution_id='${produced.executionId}'),
 'execution',(select jsonb_build_object('request',e.request_id,'requester',p.user_id) from public.work_executions e
  join private.principals p on p.organization_id=e.organization_id and p.id=e.principal_id where e.id='${produced.executionId}'),
 'versions',(select jsonb_agg(distinct h->>'assumptionVersionId') from private.execution_manifests x cross join lateral jsonb_array_elements(x.payload#>'{inputs,hypotheses}') h
  where x.execution_id='${produced.executionId}'),
 'gates',(select jsonb_build_object('blocked',g.blocked,'situations',g.canonical_gates::jsonb#>'{methodSelection,situationIds}') from private.execution_gate_receipts g
  where g.execution_id='${produced.executionId}'),
 'jobs',(select count(*) from public.processing_jobs j where j.execution_id='${produced.executionId}' and j.kind='work_execution' and j.status='queued'),
 'request',(select r.status from public.work_continuation_requests r join public.work_recompute_candidates c on c.request_id=r.id where c.id='${candidateId}'),
 'executions',(select count(*) from public.work_executions e where e.organization_id='${organization}'));`));
  assert.deepEqual(recorded, {
    candidate: {state: 'scheduled', execution: produced.executionId, reason: null, realizes: true},
    lineage: {root: rootId, candidate: candidateId},
    execution: {request: candidateId, requester: owner},
    versions: [headVersion],
    gates: {blocked: false, situations: ask.situationIds},
    jobs: 1,
    request: 'scheduled',
    executions: 2,
  }, JSON.stringify(recorded));
  console.log(JSON.stringify({event: 'dependency_recompute_eval', pinnedHypotheses: governed.pins.length, outcomes: outcomes.map(outcome => outcome.status), loopMs}));
  console.log(JSON.stringify(healthLines[0]));
  console.log('dependency_recompute_worker_loop: PASS (worker module and RPC client, shared composition, original requester, head revision pinned, gate receipt, queued job, lineage, one recompute.health line of four numbers; no model in the bundle; disposable local stack)');
} finally { rmSync(temporary, {recursive: true, force: true}); }
