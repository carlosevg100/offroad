// Disposable localhost stack only; every write commits on the throwaway CI database. Stage 18,
// increments 3B and 6B: the worker's dependency recompute loop, through its own module and RPC
// client, against the migrations of this commit, and a human wait that survives a restart of the
// worker. A synthetic capital work carries a governed working basis; the released capital method is
// installed with the profile its manifest derives, released and universal, except that this profile
// can spend: a ceiling above zero, which the storage check refuses for every stored profile, so it
// exists only here, inserted with that check off for this one row. The founder grants the
// organization's producer. The owner, signed in, reads the v2 basis, composes the request with the
// composition the web action uses and requests the root execution through request_work_execution_v2.
// A new revision of the working basis then changes one decision, and the dependency effect of its
// events plans one candidate that, under the costed profile, waits for a person: an awaiting_human
// milestone, no job, no lease. The worker account, signed in and bound to its worker token, runs the
// recompute loop until idle; a fresh client for another worker account bound to its own token (the
// restarted worker, a new lease owner) does too; the wait and the candidate are unchanged and
// nothing was claimed. The owner authorizes through authorize_work_update_v1, and the restarted loop
// claims the candidate, reads the requester's basis at the head revision, composes what the root
// execution was asked and submits. The proof checks that exactly that candidate was produced, once,
// for the original requester, pinning the head revision, with a gate receipt carrying the root's
// situations, a queued pinned job, lineage naming the root and the wait resolved once by an approved
// decision; and that the bundle the loop ran from contains no model gateway. A zero-budget candidate
// scheduled without a person cannot share this database: the capital method has exactly one
// executable profile (the producer refuses two, profiles are immutable, and the capital provenance
// and manifest identity checks admit a single release), so the planner's zero-budget scheduling
// stays proven by supabase/tests/work_continuity_dependencies.sql. The recompute health the worker
// reads (6A) counts the wait as awaiting a person before the loop and the scheduled candidate after
// the authorization, each in one recompute.health line of four numbers. Synthetic data only; no
// provider key and no network beyond the local stack.
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
// organization, people and work under their own prefix, and two worker accounts of this proof, the
// running one and the restarted one.
const prefix = 'a4197000';
const id = (group, n) => `${prefix}-0000-4000-${group}-${String(n).padStart(12, '0')}`;
const organization = id('9000', 1), work = id('9000', 2), owner = id('8000', 1), worker = id('8000', 7), restarted = id('8000', 8);
const ownerEmail = 'a4197-a@example.invalid', workerEmail = 'a4197-worker@example.invalid', restartedEmail = 'a4197-restarted-worker@example.invalid';
const workerToken = `synthetic-dependency-recompute-proof-worker-token-${prefix}`;
const restartedTokenId = id('9000', 23), restartedToken = `synthetic-dependency-recompute-restarted-worker-token-${prefix}`;
const password = 'Synthetic-Recompute!2026';
const purpose = 'prepare-capital-structure-decision';
const capability = 'synthetic-dependency-recompute-proof';
const ceiling = {maxCostMicrousd: 250000, maxModelCalls: 3};

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
export {deriveExecutionProfile, executionCanonicalText, executionInputFingerprint} from '@offroad/agent-contracts';
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
  // The derived profile with a ceiling above zero and its fingerprint recomputed by the same rule.
  const {fingerprint: derivedFingerprint, ...unsigned} = m.deriveExecutionProfile(manifest, {id: release.platformReleaseId, manifestHash: release.manifestHash});
  assert.equal(m.executionInputFingerprint(unsigned), derivedFingerprint, 'profile_fingerprint_rule_changed');
  const costed = {...unsigned, limits: {...unsigned.limits, ...ceiling}};
  const profileText = m.executionCanonicalText({...costed, fingerprint: m.executionInputFingerprint(costed)});
  const original = {...m.adoptedCapitalPeriodFixture().snapshot, purpose};

  // 2. As the database owner: the execution fixture under this prefix, the governed capital basis of
  // the pinned consumer proof over the synthetic adopted period, the released capital method with
  // its costed profile, the founder's producer grant, and sign-in for the owner and the two worker
  // accounts, each bound to its own worker token.
  const replace = text => text.replaceAll('a11b0000', prefix).replaceAll('a4171000', 'a4198000').replaceAll('a11b-', 'a4197-').replaceAll('synthetic-execution', 'synthetic-execution-recompute-proof');
  const setup = sql(`begin;
${replace(expand(join(root, 'supabase/tests/support/execution_commands_fixture.sql')))}
select set_config('offroad.synthetic_capital_basis',${literal(JSON.stringify(original))},true);
${replace(expand(join(root, 'supabase/tests/support/capital_consumer_basis_fixture.sql')))}
insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source)
values('${capability}',true,'universal',${literal(release.methodId)},${literal(release.methodVersion)},'tested','Synthetic CI',current_date,'Disposable CI only');
insert into private.platform_method_releases(id,method_id,version,manifest_hash,manifest,components,evidence,approval,capability_key)
values(${literal(release.platformReleaseId)},${literal(release.methodId)},${literal(release.methodVersion)},${literal(release.manifestHash)},${literal(JSON.stringify(manifest))}::jsonb,'[]','["Synthetic CI only"]','{}','${capability}');
alter table private.execution_method_profiles disable trigger execution_method_profiles_validate;
insert into private.execution_method_profiles(id,platform_release_id,serialization_version,canonical_payload,payload_fingerprint,adapter_source_commit,review_evidence)
values('a4198000-0000-4000-9000-000000000099',${literal(release.platformReleaseId)},'offroad-execution-json-utf16-v1',${literal(profileText)},${literal(sha(profileText))},repeat('c',40),'{"result":"approved","subjectCommit":"cccccccccccccccccccccccccccccccccccccccc","reviewer":"Synthetic CI","sourceHash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}');
alter table private.execution_method_profiles enable trigger execution_method_profiles_validate;
insert into private.platform_principals(user_id,role,label) values('${owner}','founder','Synthetic founder of the recompute proof') on conflict (user_id) do nothing;
select private.grant_execution_producer_v1('${id('9000', 21)}','${organization}',true,'Synthetic producer grant for the dependency recompute proof','${owner}');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('${worker}','authenticated','authenticated','${workerEmail}','{}','{}',now(),now(),false,false),
 ('${restarted}','authenticated','authenticated','${restartedEmail}','{}','{}',now(),now(),false,false);
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id)
values('${id('9000', 22)}','Synthetic dependency recompute proof worker',extensions.digest('${workerToken}','sha256'),'${worker}'),
 ('${restartedTokenId}','Synthetic restarted dependency recompute worker',extensions.digest('${restartedToken}','sha256'),'${restarted}');
update auth.users set instance_id='00000000-0000-0000-0000-000000000000',email_confirmed_at=now(),confirmation_token='',recovery_token='',email_change_token_new='',email_change='',
 encrypted_password=extensions.crypt(${literal(password)},extensions.gen_salt('bf')),raw_app_meta_data='{"provider":"email","providers":["email"]}'
 where id in ('${owner}','${worker}','${restarted}');
insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at)
select gen_random_uuid(),id,id::text,'email',jsonb_build_object('sub',id::text,'email',email),now(),now() from auth.users where id in ('${owner}','${worker}','${restarted}');
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
  // dependency effect of its events plans the candidate, as the outbox consumer applies it. The
  // pinned profile can spend, so the candidate waits for a person.
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
 'base',min(c.base_execution_id::text),'cost',max(c.max_cost_microusd),'calls',max(c.max_model_calls)) from public.work_recompute_candidates c where c.organization_id='${organization}';`));
  assert.deepEqual(planned, {count: 1, state: 'awaiting_authorization', action: 'await_authorization', base: rootId, cost: ceiling.maxCostMicrousd, calls: ceiling.maxModelCalls},
    `candidate_not_planned: ${JSON.stringify(planned)}`);

  // 5. The worker loop, as the worker image runs it: preflight of the runtime contract, then the
  // recompute until nothing is schedulable. It claims candidates of every organization, so the
  // outcome that matters is the one of this candidate. A candidate that waits for a person is never
  // claimed: the running worker reaches idle, and so does the restarted one, a fresh client for the
  // other worker account whose leases name the other token; the candidate and its wait are exactly
  // as they were, with no lease and no execution.
  const untilIdle = async queue => {
    const worked = [];
    for (let n = 0; n < 20; n++) {
      const outcome = await m.runDependencyRecomputeOnce(queue);
      if (outcome.status === 'idle') return worked;
      worked.push(outcome);
    }
    throw new Error('dependency_recompute_loop_never_idle');
  };
  const waitState = () => JSON.parse(sql(`select jsonb_build_object('candidate',to_jsonb(c),
 'wait',(select to_jsonb(m) from public.work_milestones m where m.organization_id=c.organization_id and m.kind='awaiting_human' and m.subject_kind='work_recompute_candidate' and m.subject_id=c.id),
 'leases',(select count(*) from private.work_recompute_leases l where l.organization_id=c.organization_id and l.candidate_id=c.id),
 'executions',(select count(*) from public.work_executions e where e.organization_id=c.organization_id and e.request_id=c.id),
 'resolutions',(select count(*) from public.work_milestones m where m.organization_id=c.organization_id and m.kind='human_resolved' and m.subject_id=c.id))
 from public.work_recompute_candidates c where c.id='${candidateId}';`));
  const account = await session(workerEmail);
  const contract = await call(account, 'worker_runtime_schema_contract_v1', {});
  assert(contract.capabilities.includes('dependency-recompute.v1'), 'runtime_capability_missing');
  assert(contract.capabilities.includes('dependency-recompute-health.v1'), 'runtime_health_capability_missing');
  // The health the loop reads at most every 30 seconds (6A), through the worker entry point as the
  // worker account: one recompute.health line of four numbers, no second read inside the throttle
  // window, and the wait counted as awaiting a person.
  const healthLines = [];
  const health = m.createRecomputeHealthMonitor(account, workerToken, (event, detail) => healthLines.push({event, ...detail}));
  const waiting = await health.maybeRead();
  assert.equal(await health.maybeRead(), null, 'recompute_health_not_throttled');
  assert.deepEqual(healthLines.filter(line => line.event !== 'recompute.backlog.failed').map(line => line.event), ['recompute.health'], `recompute_health_lines: ${JSON.stringify(healthLines)}`);
  assert.deepEqual(Object.keys(healthLines[0]).sort(), ['awaitingAuthorizationCount', 'event', 'expiredLeaseCount', 'oldestScheduledSeconds', 'scheduledCount']);
  assert(waiting && waiting.awaitingAuthorizationCount >= 1 && Object.values(waiting).every(value => Number.isInteger(value) && value >= 0), `recompute_health_reading: ${JSON.stringify(waiting)}`);
  assert.deepEqual(await untilIdle(m.createDependencyRecomputeQueue(account, workerToken)), [], 'the running worker worked a candidate that waits for a person');
  const held = waitState();
  assert(held.wait && held.wait.label === 'dependency_recompute_authorization' && held.candidate.state === 'awaiting_authorization' && held.candidate.execution_id === null
    && held.leases === 0 && held.executions === 0 && held.resolutions === 0, `the wait is not persisted as a wait: ${JSON.stringify(held)}`);
  const restartedAccount = await session(restartedEmail);
  const restartedContract = await call(restartedAccount, 'worker_runtime_schema_contract_v1', {});
  assert(restartedContract.capabilities.includes('dependency-recompute.v1'), 'runtime_capability_missing_after_restart');
  const restartedQueue = m.createDependencyRecomputeQueue(restartedAccount, restartedToken);
  assert.deepEqual(await untilIdle(restartedQueue), [], 'the restarted worker worked a candidate that waits for a person');
  assert.deepEqual(waitState(), held, 'the restart changed the wait or the candidate');

  // The owner resolves the wait through the command of increment 4, at the revision they saw; the
  // restarted loop then produces the candidate, and only it.
  const authorized = await call(human, 'authorize_work_update_v1', {p_command_id: randomUUID(), p_candidate_id: candidateId, p_expected_revision: held.candidate.revision});
  assert(authorized.state === 'scheduled' && authorized.replayed === false && authorized.candidateId === candidateId, `authorization not recorded: ${JSON.stringify(authorized)}`);
  // After the authorization, the restarted worker's first health reading counts the scheduled candidate.
  const restartedHealthLines = [];
  const restartedHealth = m.createRecomputeHealthMonitor(restartedAccount, restartedToken, (event, detail) => restartedHealthLines.push({event, ...detail}));
  const reading = await restartedHealth.maybeRead();
  assert.deepEqual(restartedHealthLines.filter(line => line.event !== 'recompute.backlog.failed').map(line => line.event), ['recompute.health'], `recompute_health_lines: ${JSON.stringify(restartedHealthLines)}`);
  assert(reading && reading.scheduledCount >= 1 && Object.values(reading).every(value => Number.isInteger(value) && value >= 0), `recompute_health_reading: ${JSON.stringify(reading)}`);
  const started = performance.now();
  const outcomes = await untilIdle(restartedQueue);
  const loopMs = Math.ceil(performance.now() - started);
  const productions = outcomes.filter(outcome => outcome.candidateId === candidateId);
  assert(productions.length === 1 && productions[0].status === 'produced', `candidate_not_produced_once: ${JSON.stringify(outcomes)}`);
  const produced = productions[0];

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
 'executions',(select count(*) from public.work_executions e where e.organization_id='${organization}'),
 'produced',(select count(*) from public.work_executions e where e.organization_id='${organization}' and e.request_id='${candidateId}'),
 'lease',(select jsonb_build_object('attempts',l.attempts,'worker',l.leased_by) from private.work_recompute_leases l where l.candidate_id='${candidateId}'),
 'waits',(select count(*) from public.work_milestones m where m.kind='awaiting_human' and m.subject_id='${candidateId}'),
 'resolved',(select count(*) from public.work_milestones m where m.kind='human_resolved' and m.resolves_milestone_id='${held.wait.id}'),
 'decisions',(select jsonb_agg(m.outcome) from public.work_milestones m where m.kind='decision' and m.subject_kind='work_recompute_candidate' and m.subject_id='${candidateId}'));`));
  assert.deepEqual(recorded, {
    candidate: {state: 'scheduled', execution: produced.executionId, reason: null, realizes: true},
    lineage: {root: rootId, candidate: candidateId},
    execution: {request: candidateId, requester: owner},
    versions: [headVersion],
    gates: {blocked: false, situations: ask.situationIds},
    jobs: 1,
    request: 'scheduled',
    executions: 2,
    produced: 1,
    lease: {attempts: 1, worker: restartedTokenId},
    waits: 1,
    resolved: 1,
    decisions: ['approved'],
  }, JSON.stringify(recorded));
  console.log(JSON.stringify({event: 'dependency_recompute_eval', pinnedHypotheses: governed.pins.length, outcomes: outcomes.map(outcome => outcome.status), loopMs}));
  console.log(JSON.stringify(healthLines[0]));
  console.log(JSON.stringify(restartedHealthLines[0]));
  console.log('dependency_recompute_wait_across_restart: PASS (a costed candidate waits as an awaiting_human milestone with no job and no lease through the running loop and a restarted worker with a new lease owner; nothing claimed; authorize_work_update_v1 by the owner; disposable local stack)');
  console.log('dependency_recompute_worker_loop: PASS (worker module and RPC client, shared composition, one production for the original requester, head revision pinned, gate receipt, queued job, lineage, recompute.health lines of four numbers for the wait and for the scheduled candidate; no model in the bundle; disposable local stack)');
} finally { rmSync(temporary, {recursive: true, force: true}); }
