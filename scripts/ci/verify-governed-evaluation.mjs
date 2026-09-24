// Disposable localhost stack only. One governed evaluation end to end, through the real session
// wrapper, the worker's own RPC client and consumer, and a cassette in place of the provider: the
// evaluator requests under its JWT, the worker claims, reserves, "sends", settles and commits, and
// the evaluator reads the bytes, receipts and cost. A second evaluation, whose assurance is revoked
// before the claim, must reach the cassette zero times and end partial with transport_denied.
// Then the baseline script itself runs live, twice, as a child process with no provider key in its
// environment: it signs in as the synthetic evaluator, requests through the session wrapper and
// waits; the consumer claims its evaluation and answers from the cassette; the script reads the
// committed result and writes its run record. With the assurance revoked, the script receives
// partial/transport_denied, writes no record and the cassette is called zero times.
// Everything is synthetic; no network beyond the local stack and no provider key is ever read.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {proveMeasurementFamilies} from './governed-evaluation-measurement-proof.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const local = ['localhost', '127.0.0.1', '[::1]'];
const database = new URL(process.env.OFFROAD_E2E_DATABASE_URL ?? 'invalid:');
assert(['postgres:', 'postgresql:'].includes(database.protocol) && local.includes(database.hostname) && !database.search && !database.hash, 'local_database_required');
const api = new URL(process.env.OFFROAD_E2E_API_URL || 'invalid:');
assert(['http:', 'https:'].includes(api.protocol) && local.includes(api.hostname) && (api.pathname === '/' || api.pathname === '') && !api.search && !api.hash, 'local_api_required');
const publishableKey = process.env.OFFROAD_E2E_PUBLISHABLE_KEY ?? '';
assert(publishableKey.length > 0, 'local_publishable_key_required');
// No provider key may exist for anything this process loads; the cassette is the only provider.
for (const name of Object.keys(process.env)) if (name.endsWith('_API_KEY')) delete process.env[name];
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
const sql = query => {
  try { return execFileSync('psql', ['--dbname', database.href, '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-Atq'], {input: query, env, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe']}).trim(); }
  catch (error) { throw new Error('governed_evaluation_sql_failed: ' + (error.code ?? 'sql_error') + ' ' + String(error.stderr ?? '').slice(-2000)); }
};
const literal = text => `convert_from(decode('${Buffer.from(text).toString('hex')}','hex'),'UTF8')`;
const expand = path => readFileSync(path, 'utf8').replace(/^\\ir (.+)$/gm, (_line, p) => expand(resolve(dirname(path), p)));
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');

// Synthetic scope: the transport fixture under its own prefix, apart from every other committed case.
const prefix = 'e5a1e000';
const id = (group, n) => `${prefix}-0000-4000-${group}-${String(n).padStart(12, '0')}`;
const users = {operator: id('8000', 2), evaluator: id('8000', 3), worker: id('8000', 6)};
const organization = id('9000', 1);
const workerToken = `synthetic-evaluation-worker-token-${prefix}`;
const password = 'Synthetic-Evaluation!2026';
const connection = {accountRef: `synthetic-evaluation-account-${prefix}`, projectRef: 'synthetic-evaluation-project', credentialBinding: 'synthetic-evaluation-binding', region: 'global'};
const assurances = {inference: id('b000', 21), prompt_cache: id('b000', 22), schema_cache: id('b000', 23)};

const workerRequire = createRequire(join(root, 'apps/document-worker/package.json'));
const {build} = workerRequire('esbuild');
const {createClient} = workerRequire('@supabase/supabase-js');
const temporary = mkdtempSync(join(tmpdir(), 'offroad-governed-evaluation-proof-'));
try {
  const outfile = join(temporary, 'consumer.mjs');
  await build({stdin: {contents: `export {createEvaluationQueue} from './src/evaluation-queue.ts';
export {processGovernedEvaluation} from './src/process-governed-evaluation.ts';
export {governedEvaluationToolVersion, microusdCeil} from './src/governed-evaluation-gateway.ts';
export {BASELINE_SYSTEM_PROMPT, baselineGeneralistSnapshotSchema, baselineOutputSchema, baselineSnapshotContentHashes, executionCanonicalText, renderInformationBase, renderTurnMessage} from '@offroad/agent-contracts';
export {cassetteKey, estimateCostUsd, redactPersonalIdentifiers} from '@offroad/model-gateway';
export {z} from 'zod';`, resolveDir: join(root, 'apps/document-worker'), loader: 'ts'}, outfile, bundle: true, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent'});
  const m = await import(pathToFileURL(outfile));

  // 1. As the database owner: the synthetic evaluator, evaluation organization and worker binding of
  // the transport fixture, sign-in for the evaluator and the worker account, one assurance per
  // resource the baseline sends (inference, prompt and schema cache) valid for evaluation only, and
  // the switch opened through the operator command.
  const assurance = (resource, assuranceId) => `select private.record_provider_processing_assurance_v1(jsonb_build_object(
 'id','${assuranceId}','policyVersion','offroad-provider-retention-v2','accountRef','${connection.accountRef}','projectRef','${connection.projectRef}',
 'credentialBinding','${connection.credentialBinding}','provider','anthropic','models','["claude-opus-5"]'::jsonb,'endpoint','https://api.anthropic.com/v1/messages',
 'resource','${resource}','region','${connection.region}','eligibility','supported','purposes','["evaluation"]'::jsonb,'classifications','["restricted"]'::jsonb,
 'rights','["process"]'::jsonb,'trainingUse','prohibited',
 'retention',jsonb_build_object('requestContentSeconds',0,'abuseMonitoringSeconds',2592000,'applicationStateSeconds',0,'cacheSeconds',86400,'metadataSeconds',2592000,'exceptions','["legal_hold"]'::jsonb),
 'zeroRetention','not_contracted',
 'evidence',(select jsonb_agg(jsonb_build_object('kind',k,'reference','synthetic-evaluation-proof','sha256',repeat('a',64))) from unnest(array['provider_terms','account_configuration','credential_binding']) k),
 'reviewedBy','Synthetic reviewer','reviewedAt',clock_timestamp()-interval '1 hour','validThrough',clock_timestamp()+interval '1 day','revokedAt',null),
 'Synthetic governed evaluation consumer proof');`;
  sql(`begin;
${expand(join(root, 'supabase/tests/support/governed_evaluation_fixture.sql')).replaceAll('e5a10000', prefix)}
update auth.users set instance_id='00000000-0000-0000-0000-000000000000',email_confirmed_at=now(),confirmation_token='',recovery_token='',email_change_token_new='',email_change='',
 encrypted_password=extensions.crypt(${literal(password)},extensions.gen_salt('bf')),raw_app_meta_data='{"provider":"email","providers":["email"]}'
 where id in ('${users.evaluator}','${users.worker}');
insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at)
select gen_random_uuid(),id,id::text,'email',jsonb_build_object('sub',id::text,'email',email),now(),now() from auth.users where id in ('${users.evaluator}','${users.worker}');
${Object.entries(assurances).map(([resource, assuranceId]) => assurance(resource, assuranceId)).join('\n')}
select private.release_governed_evaluation_transport_v1('${id('a000', 31)}',true,'${users.operator}','Synthetic opening for the governed evaluation consumer proof');
commit;`);

  const session = async n => {
    const client = createClient(api.origin, publishableKey, {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}});
    const {error} = await client.auth.signInWithPassword({email: `${prefix}-${n}@example.invalid`, password});
    assert.equal(error, null, `sign_in_failed_${n}`);
    return client;
  };
  const evaluator = await session(3), worker = await session(6);
  // DDL on the fixture's temporary objects makes PostgREST reload its schema cache; a request that
  // lands during the reload is retried, and only that.
  const call = async (client, name, args) => {
    for (let attempt = 1; ; attempt++) {
      const {data, error} = await client.rpc(name, args);
      if (error?.code === 'PGRST002' && attempt < 10) { await new Promise(done => setTimeout(done, 500)); continue; }
      assert.equal(error, null, `${name}: ${error?.message ?? ''}`);
      return data;
    }
  };

  // 2. A synthetic baseline: two turns over one document, primary route only.
  const snapshot = m.baselineGeneralistSnapshotSchema.parse({
    schemaVersion: 'gold-baseline-snapshot.v1',
    informationBase: {caseId: 'gc01-synthetic-proof', caseVersion: '1.0', language: 'pt-BR', asOfDate: '2026-09-04',
      turns: [{id: 'gc01-t01', text: 'Pedido sintético do primeiro turno da prova.'}, {id: 'gc01-t02', text: 'Pedido sintético do segundo turno da prova.'}],
      documents: [{id: 'doc-sintetico', title: 'Documento sintético', fileName: 'sintetico.pdf', sha256: sha('synthetic document bytes'), pages: 1, text: 'Texto sintético do documento da prova.'}],
      sources: []},
    model: {primary: {provider: 'anthropic', model: 'claude-opus-5', effort: 'high'}, fallback: null, maxOutputTokens: 2000},
    caveats: ['Prova sintética de CI: a resposta vem de um cassete; nenhum provedor foi chamado.'],
  });
  const snapshotText = m.executionCanonicalText(snapshot);
  const contractFor = executionId => m.executionCanonicalText({
    schemaVersion: 'governed-evaluation-contract.v1', executionId, organizationId: organization, requestId: randomUUID(), processingRunId: randomUUID(), purpose: 'evaluation',
    audience: {kind: 'evaluation_panel', caseId: 'gc01-synthetic-proof', caseVersion: '1.0', scriptId: 'run-gold-baseline'},
    tools: [{id: 'provider:anthropic:claude-opus-5', version: m.governedEvaluationToolVersion, effect: 'read_only'}],
    budget: {maxCostMicrousd: 5_000_000, maxModelCalls: 4, maxDurationMs: 300_000, expiresAt: new Date(Date.now() + 600_000).toISOString()},
    inputs: {fingerprint: sha(snapshotText), sources: m.baselineSnapshotContentHashes(snapshot).map(contentHash => ({contentHash}))},
    requestedAt: new Date(Date.now() - 5_000).toISOString(),
  });

  // 3. The cassette: the recorded answer of each turn, keyed by the exact request the baseline sends
  // (system prompt, whole information base, earlier deliverables, schema). A request with any other
  // byte misses, and a miss is a failed provider call. Every call is counted, answered or not.
  const base = m.renderInformationBase(snapshot.informationBase);
  const deliverables = ['Entrega sintética da prova, turno 1.', 'Entrega sintética da prova, turno 2.'];
  const usages = [{inputTokens: 1800, outputTokens: 420, cachedInputTokens: 0}, {inputTokens: 2100, outputTokens: 380, cachedInputTokens: 0}];
  const schemaJson = m.z.toJSONSchema(m.baselineOutputSchema);
  const recorded = new Map();
  const record = (baseline, answers) => {
    const {primary, maxOutputTokens} = baseline.model;
    const conversation = [m.renderInformationBase(baseline.informationBase)];
    baseline.informationBase.turns.forEach((turn, index) => {
      conversation.push(m.renderTurnMessage(turn, index));
      const input = conversation.map(text => ({type: 'text', text: m.redactPersonalIdentifiers(text, {}).text}));
      const key = m.cassetteKey(primary.provider, {model: primary.model, effort: primary.effort, system: m.BASELINE_SYSTEM_PROMPT, input, schema: m.baselineOutputSchema,
        schemaName: 'baseline_deliverable', maxOutputTokens, timeoutMs: 1}, schemaJson);
      recorded.set(key, {output: {deliverable: answers[index]}, rawText: JSON.stringify({deliverable: answers[index]}), usage: usages[index], model: primary.model, stopReason: 'end'});
      conversation.push(`## Resposta ao turno ${index + 1} (sua entrega anterior)\n\n${answers[index]}`);
    });
  };
  record(snapshot, deliverables);
  let hits = 0, calls = 0;
  const cassette = {provider: 'anthropic', async complete(request) {
    calls += 1;
    const response = recorded.get(m.cassetteKey('anthropic', request, m.z.toJSONSchema(request.schema)));
    if (!response) throw new Error('cassette_missing');
    hits += 1;
    return structuredClone(response);
  }};
  const consumer = m.createEvaluationQueue(worker, workerToken);
  const runOnce = async executionId => {
    const claim = await consumer.claim();
    assert(claim, 'evaluation_not_claimed');
    assert.equal(claim.executionId, executionId, 'another_evaluation_claimed');
    return m.processGovernedEvaluation(claim, consumer, new AbortController().signal, {adapters: {anthropic: cassette}, connections: {anthropic: connection}, heartbeatMs: 2_000});
  };

  // The baseline script as the gold-baseline workflow runs it, live: a child process whose
  // environment holds the synthetic evaluator's credential, the evaluation organization and this
  // stack, and no provider key. It builds the gc01 information base from the committed fixtures,
  // requests through the session wrapper and waits for the committed result.
  const evalsDir = join(root, 'packages/evals');
  const tsxManifest = join(evalsDir, 'node_modules/tsx/package.json');
  const tsxCli = join(dirname(tsxManifest), JSON.parse(readFileSync(tsxManifest, 'utf8')).bin);
  const providerCredential = /_API_KEY$|(^|_)(ANTHROPIC|OPENAI|PERPLEXITY|FIRECRAWL)(_|$)/;
  const scriptEnvironment = {...Object.fromEntries(Object.entries(env).filter(([name]) => !providerCredential.test(name))),
    SUPABASE_URL: api.origin, SUPABASE_PUBLISHABLE_KEY: publishableKey, OFFROAD_EVALUATOR_EMAIL: `${prefix}-3@example.invalid`,
    OFFROAD_EVALUATOR_PASSWORD: password, OFFROAD_EVALUATION_ORGANIZATION_ID: organization};
  assert.deepEqual(Object.keys(scriptEnvironment).filter(name => providerCredential.test(name)), [], 'the baseline script runs with no provider key in its environment');
  const outputTail = run => `${run.stdout}\n${run.stderr}`.split('\n')
    .filter(line => line.trim() && !/Warning: (TT|Required "glyf"|UnknownErrorException)/.test(line)).slice(-20).join('\n');
  const runBaselineScript = out => {
    const child = spawn(process.execPath, [tsxCli, 'scripts/run-gold-baseline.ts', '--case', 'gc01', '--out', out, '--max-cost', '100', '--poll-seconds', '1'],
      {cwd: evalsDir, env: scriptEnvironment, stdio: ['ignore', 'pipe', 'pipe']});
    const run = {child, stdout: '', stderr: '', ended: null};
    child.stdout.on('data', chunk => { run.stdout += chunk; });
    child.stderr.on('data', chunk => { run.stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 300_000);
    run.exited = new Promise((done, fail) => {
      child.on('error', fail);
      child.on('close', code => { clearTimeout(timer); run.ended = code ?? -1; done(run); });
    });
    return run;
  };
  // The consumer polls like the worker until the script's own request is claimable.
  const claimScriptEvaluation = async run => {
    for (const deadline = Date.now() + 240_000; Date.now() < deadline;) {
      const claim = await consumer.claim();
      if (claim) return claim;
      if (run.ended !== null) throw new Error(`baseline_script_ended_before_its_request_was_claimed: ${run.ended}\n${outputTail(run)}`);
      await new Promise(done => setTimeout(done, 500));
    }
    run.child.kill('SIGKILL');
    throw new Error(`baseline_script_request_not_claimed\n${outputTail(run)}`);
  };
  const processScriptEvaluation = claim => m.processGovernedEvaluation(claim, consumer, new AbortController().signal,
    {adapters: {anthropic: cassette}, connections: {anthropic: connection}, heartbeatMs: 2_000});

  // 4. First evaluation: requested under the evaluator's JWT, run once, read back.
  const first = randomUUID();
  const firstContract = contractFor(first);
  const request = await call(evaluator, 'request_governed_evaluation_session_v1', {p_contract_text: firstContract, p_snapshot_text: snapshotText});
  assert.equal(request.executionId, first);
  assert.equal(request.replayed, false);
  const started = performance.now();
  assert.deepEqual(await runOnce(first), {status: 'succeeded', reason: 'evaluated', replayed: false});
  const runMs = Math.ceil(performance.now() - started);
  assert.equal(hits, 2, 'each turn reaches the cassette once');
  const read = await call(evaluator, 'read_governed_evaluation_session_v1', {p_execution_id: first});
  assert.equal(read.requestedBy, users.evaluator);
  assert.equal(read.contractFingerprint, sha(firstContract));
  assert.equal(read.inputFingerprint, sha(snapshotText));
  assert.deepEqual([read.outcome, read.reason, read.state.job, read.state.run], ['succeeded', 'evaluated', 'succeeded', 'succeeded']);
  const published = JSON.parse(read.result.canonicalResult);
  assert.equal(m.executionCanonicalText(published), read.result.canonicalResult, 'result bytes are canonical');
  assert.equal(read.result.resultFingerprint, sha(read.result.canonicalResult));
  assert.equal(published.schemaVersion, 'gold-baseline-result.v1');
  assert.deepEqual(published.outputs.map(output => output.deliverable), deliverables);
  assert.equal(published.record.informationBaseSha256, sha(base));
  assert.deepEqual(published.record.turns.map(turn => turn.outputSha256), deliverables.map(sha));
  const costs = usages.map(usage => m.microusdCeil(m.estimateCostUsd('claude-opus-5', usage)));
  assert.equal(read.receipts.length, 2);
  for (const [index, receipt] of read.receipts.entries()) {
    assert.deepEqual([receipt.state, receipt.toolId, receipt.toolVersion, receipt.spentCalls, receipt.reservedCalls],
      ['settled', 'provider:anthropic:claude-opus-5', m.governedEvaluationToolVersion, 1, 1]);
    assert.deepEqual(receipt.resources, ['inference', 'prompt_cache', 'schema_cache']);
    assert(receipt.reservedMicrousd >= receipt.spentMicrousd, 'spend within its reservation');
    assert.equal(receipt.spentMicrousd, costs[index]);
  }
  assert.equal(read.decisions.length, 3, 'one decision per reservation and one revalidation at publication');
  assert(read.decisions.every(decision => decision.allowed && decision.purpose === 'evaluation'));
  assert.deepEqual([read.cost.spentMicrousd, read.cost.reservedMicrousd, read.cost.spentCalls, read.cost.reservedCalls, read.totalCostMicrousd],
    [costs[0] + costs[1], 0, 2, 0, costs[0] + costs[1]]);
  assert.equal(sql(`select count(*) from private.governed_evaluation_request_events where evaluation_id='${first}' and actor_user_id='${users.evaluator}';`), '1');
  console.log('governed_evaluation_consumer: PASS (evaluator session request, worker claim, two reservations, cassette sends, two settlements, commit succeeded/evaluated, evaluator read of bytes, receipts and cost)');

  // 4b. The baseline script itself, live, through the same path: its request under the evaluator's
  // session, the worker's claim, reservations, cassette sends, settlements and commit, and the
  // script's own read of the committed result and write of its run record.
  const succeededDir = join(temporary, 'baseline-succeeded');
  const scriptStarted = performance.now();
  const scriptRun = runBaselineScript(succeededDir);
  const scriptClaim = await claimScriptEvaluation(scriptRun);
  const scriptContract = JSON.parse(scriptClaim.contractText);
  assert.deepEqual([scriptContract.organizationId, scriptContract.purpose, scriptContract.audience],
    [organization, 'evaluation', {kind: 'evaluation_panel', caseId: 'gc01-analista-ib-camil', caseVersion: '1.0', scriptId: 'run-gold-baseline'}]);
  assert.deepEqual(scriptContract.tools, ['provider:anthropic:claude-opus-5', 'provider:openai:gpt-5.6-sol']
    .map(tool => ({id: tool, version: m.governedEvaluationToolVersion, effect: 'read_only'})), 'every route the family may take, at the gateway version');
  assert.deepEqual([scriptContract.budget.maxCostMicrousd, scriptContract.budget.maxModelCalls], [100_000_000, 4]);
  assert.equal(scriptContract.inputs.fingerprint, sha(scriptClaim.snapshotText));
  const scriptSnapshot = m.baselineGeneralistSnapshotSchema.parse(JSON.parse(scriptClaim.snapshotText));
  assert.deepEqual(scriptContract.inputs.sources.map(source => source.contentHash), m.baselineSnapshotContentHashes(scriptSnapshot));
  assert.deepEqual(scriptSnapshot.informationBase.documents.map(document => document.id).sort(), ['itr_1t26', 'proposta_agoe_2026']);
  const scriptDeliverables = ['Entrega sintética do script, turno 1.', 'Entrega sintética do script, turno 2.'];
  record(scriptSnapshot, scriptDeliverables);
  const callsBeforeScript = calls;
  assert.deepEqual(await processScriptEvaluation(scriptClaim), {status: 'succeeded', reason: 'evaluated', replayed: false});
  assert.equal(calls - callsBeforeScript, 2, 'each turn of the script evaluation reaches the cassette once');
  await scriptRun.exited;
  const scriptMs = Math.ceil(performance.now() - scriptStarted);
  assert.equal(scriptRun.ended, 0, `the baseline script failed\n${outputTail(scriptRun)}`);
  assert.match(scriptRun.stdout, /^evaluation committed: succeeded\/evaluated, \d+ microusd over 2 calls$/m);
  assert.deepEqual(readdirSync(succeededDir).sort(), ['evaluation.json', 'gc01-t01.output.md', 'gc01-t02.output.md', 'run.json']);
  const scriptRead = await call(evaluator, 'read_governed_evaluation_session_v1', {p_execution_id: scriptClaim.executionId});
  assert.deepEqual([scriptRead.requestedBy, scriptRead.outcome, scriptRead.reason, scriptRead.contractFingerprint],
    [users.evaluator, 'succeeded', 'evaluated', scriptClaim.contractFingerprint]);
  const committedRun = JSON.parse(scriptRead.result.canonicalResult);
  const runRecord = JSON.parse(readFileSync(join(succeededDir, 'run.json'), 'utf8'));
  assert.deepEqual(runRecord, committedRun.record, 'the run record is the one the worker committed');
  assert.equal(runRecord.informationBaseSha256, sha(m.renderInformationBase(scriptSnapshot.informationBase)));
  assert.deepEqual(runRecord.turns.map(turn => turn.outputSha256), scriptDeliverables.map(sha));
  scriptDeliverables.forEach((deliverable, index) => assert.equal(readFileSync(join(succeededDir, `gc01-t0${index + 1}.output.md`), 'utf8'), `${deliverable}\n`));
  const scriptEvidence = JSON.parse(readFileSync(join(succeededDir, 'evaluation.json'), 'utf8'));
  assert.deepEqual([scriptEvidence.executionId, scriptEvidence.request, scriptEvidence.outcome, scriptEvidence.reason,
    scriptEvidence.contractFingerprint, scriptEvidence.inputFingerprint, scriptEvidence.resultFingerprint],
  [scriptClaim.executionId, 'created', 'succeeded', 'evaluated', scriptClaim.contractFingerprint, sha(scriptClaim.snapshotText), scriptRead.result.resultFingerprint]);
  assert.deepEqual(scriptEvidence.receipts.map(receipt => [receipt.state, receipt.toolId, 'route' in receipt]),
    [['settled', 'provider:anthropic:claude-opus-5', false], ['settled', 'provider:anthropic:claude-opus-5', false]]);
  assert.deepEqual(scriptEvidence.cost, scriptRead.cost);
  assert.equal(sql(`select count(*) from private.governed_evaluation_request_events where evaluation_id='${scriptClaim.executionId}' and actor_user_id='${users.evaluator}';`), '1');
  console.log('governed_baseline_script: PASS (script with no provider key, evaluator session request of gc01, worker claim, two reservations, cassette sends, commit succeeded/evaluated, run record equal to the committed result)');

  // 5. Second evaluation: the inference assurance is revoked before the claim. The worker reserves,
  // the database denies and journals it, nothing reaches the cassette, and the commit is partial.
  const second = randomUUID();
  await call(evaluator, 'request_governed_evaluation_session_v1', {p_contract_text: contractFor(second), p_snapshot_text: snapshotText});
  sql(`select private.revoke_provider_processing_assurance_v1('${assurances.inference}','Synthetic revocation before the second claim');`);
  const before = hits;
  assert.deepEqual(await runOnce(second), {status: 'partial', reason: 'transport_denied', replayed: false});
  assert.equal(hits, before, 'a revoked assurance reaches the cassette zero times');
  const denied = await call(evaluator, 'read_governed_evaluation_session_v1', {p_execution_id: second});
  assert.deepEqual([denied.outcome, denied.reason, denied.state.job], ['partial', 'transport_denied', 'succeeded']);
  assert.equal(denied.result.canonicalResult, '{"reason":"transport_denied","status":"partial"}');
  assert.equal(denied.receipts.length, 0);
  assert.equal(denied.decisions.length, 1);
  assert.equal(denied.decisions[0].allowed, false);
  assert(denied.decisions[0].reasons.includes('processing_resource_ineligible:inference'));
  assert.deepEqual([denied.cost.spentMicrousd, denied.cost.reservedMicrousd, denied.totalCostMicrousd], [0, 0, 0]);
  console.log('governed_evaluation_revoked_assurance: PASS (reservation denied and journaled, zero cassette hits, commit partial/transport_denied)');

  // 5b. The baseline script again, with the inference assurance still revoked: the same inputs, which
  // the cassette could answer, yet the reservation is denied and journaled, the cassette is called
  // zero times, and the script receives partial/transport_denied, writes only its evaluation
  // evidence and exits with status 3.
  const deniedDir = join(temporary, 'baseline-denied');
  const deniedRun = runBaselineScript(deniedDir);
  const deniedClaim = await claimScriptEvaluation(deniedRun);
  assert.notEqual(deniedClaim.executionId, scriptClaim.executionId);
  assert.equal(deniedClaim.snapshotText, scriptClaim.snapshotText, 'the script assembles the same bytes on every run');
  const callsBeforeDenial = calls;
  assert.deepEqual(await processScriptEvaluation(deniedClaim), {status: 'partial', reason: 'transport_denied', replayed: false});
  assert.equal(calls, callsBeforeDenial, 'a revoked assurance lets nothing of the script reach the cassette');
  await deniedRun.exited;
  assert.equal(deniedRun.ended, 3, `the baseline script must end partial\n${outputTail(deniedRun)}`);
  assert.match(deniedRun.stdout, /^evaluation committed: partial\/transport_denied, 0 microusd over 0 calls$/m);
  assert.match(deniedRun.stderr, new RegExp(`^evaluation ${deniedClaim.executionId} is partial: transport_denied$`, 'm'));
  assert.deepEqual(readdirSync(deniedDir), ['evaluation.json'], 'a partial evaluation writes no record and no deliverable');
  const deniedEvidence = JSON.parse(readFileSync(join(deniedDir, 'evaluation.json'), 'utf8'));
  assert.deepEqual([deniedEvidence.executionId, deniedEvidence.outcome, deniedEvidence.reason, deniedEvidence.receipts.length, deniedEvidence.cost.spentMicrousd, deniedEvidence.totalCostMicrousd],
    [deniedClaim.executionId, 'partial', 'transport_denied', 0, 0, 0]);
  assert.deepEqual(deniedEvidence.decisions.map(decision => [decision.allowed, decision.purpose, decision.reasons.includes('processing_resource_ineligible:inference')]),
    [[false, 'evaluation', true]]);
  console.log('governed_baseline_script_revoked_assurance: PASS (script with no provider key, reservation denied and journaled, zero cassette calls, script received partial/transport_denied and wrote no record)');

  await proveIntentRouterGoldFamily({call, evaluator, consumer, m, evalsDir, tsxCli, scriptEnvironment, providerCredential, outputTail});
  await proveMeasurementFamilies({root, temporary, sql, call, evaluator, worker, workerToken, organization, evaluatorId: users.evaluator, scriptEnvironment, tsxCli, evalsDir, outputTail});
  // The disposable database ends with the transport closed again.
  sql(`select private.release_governed_evaluation_transport_v1('${id('a000', 32)}',false,'${users.operator}','Synthetic governed evaluation proof finished');`);
  assert.equal(sql(`select released from private.platform_capability_releases where capability_key='governed-evaluation-transport';`), 'f');
  console.log(JSON.stringify({event: 'governed_evaluation_proof', runMs, scriptMs, cassetteHits: hits, cassetteCalls: calls, spentMicrousd: costs[0] + costs[1]}));
} finally { rmSync(temporary, {recursive: true, force: true}); }

// Intent router gold family. run-intent-router-gold.ts runs live through the same stack, as its
// workflow runs it: a child process with the synthetic evaluator's credential, the trusted
// post-merge workflow context the gate requires before it requests anything, and no provider key.
// It requests the canonical gold snapshot under the evaluator's session; the worker's consumer runs
// the family with two simulated providers in place of Anthropic and OpenAI, and every preflight,
// observation, repair and fallback attempt is reserved, sent and settled on its own; the script
// scores the committed run and writes its gate record, which must carry the committed ledger and
// pass every lineage check except the extractions the simulation deliberately leaves empty. With
// the family's inference assurance revoked, a second run reaches no provider at all and ends
// partial/transport_denied. The family's assurances live under their own synthetic account, apart
// from every other route this proof attests.
async function proveIntentRouterGoldFamily({call, evaluator, consumer, m, evalsDir, tsxCli, scriptEnvironment, providerCredential, outputTail}) {
  const bundle = join(temporary, 'intent-router-gold.mjs');
  await build({stdin: {contents: `export {executionCanonicalText, intentClassifierOutputSchema, intentRouterGoldResultSchema, validateSemanticObjectOutput} from '@offroad/agent-contracts';
export {buildIntentRouterGoldSnapshot} from './src/intent-router-gold-transport.ts';
export {verifyIntentRouterEvidenceRecord} from './src/intent-router-call-evidence.ts';`, resolveDir: evalsDir, loader: 'ts'}, outfile: bundle, bundle: true, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent'});
  const g = await import(pathToFileURL(bundle));
  const scriptId = 'run-intent-router-gold';
  const routeConnection = {accountRef: `synthetic-evaluation-account-${prefix}-intent-router`, projectRef: 'synthetic-evaluation-project', credentialBinding: 'synthetic-evaluation-binding', region: 'global'};
  const routes = [
    {provider: 'anthropic', model: 'claude-sonnet-5', endpoint: 'https://api.anthropic.com/v1/messages', assurances: {inference: id('b17e', 1), prompt_cache: id('b17e', 2)}},
    {provider: 'openai', model: 'gpt-5.6-terra', endpoint: 'https://api.openai.com/v1/responses', assurances: {inference: id('b17e', 3), prompt_cache: id('b17e', 4)}},
  ];
  // Prompted JSON: each attempt uses inference and the prompt cache, never a compiled schema.
  const assurance = (route, resource) => `select private.record_provider_processing_assurance_v1(jsonb_build_object(
 'id','${route.assurances[resource]}','policyVersion','offroad-provider-retention-v2','accountRef','${routeConnection.accountRef}','projectRef','${routeConnection.projectRef}',
 'credentialBinding','${routeConnection.credentialBinding}','provider','${route.provider}','models','["${route.model}"]'::jsonb,'endpoint','${route.endpoint}',
 'resource','${resource}','region','${routeConnection.region}','eligibility','supported','purposes','["evaluation"]'::jsonb,'classifications','["restricted"]'::jsonb,
 'rights','["process"]'::jsonb,'trainingUse','prohibited',
 'retention',jsonb_build_object('requestContentSeconds',0,'abuseMonitoringSeconds',2592000,'applicationStateSeconds',0,'cacheSeconds',86400,'metadataSeconds',2592000,'exceptions','["legal_hold"]'::jsonb),
 'zeroRetention','not_contracted',
 'evidence',(select jsonb_agg(jsonb_build_object('kind',k,'reference','synthetic-evaluation-proof','sha256',repeat('a',64))) from unnest(array['provider_terms','account_configuration','credential_binding']) k),
 'reviewedBy','Synthetic reviewer','reviewedAt',clock_timestamp()-interval '1 hour','validThrough',clock_timestamp()+interval '1 day','revokedAt',null),
 'Synthetic intent router gold family proof');`;
  sql(`begin;\n${routes.flatMap(route => ['inference', 'prompt_cache'].map(resource => assurance(route, resource))).join('\n')}\ncommit;`);

  // The simulated providers read each request as a model would: the task from its schema, the turn
  // from its input. The router gets a schema-valid abstention on every turn; the extractor gets an
  // attributable extraction of the preflight turn's two heads, and an empty extraction otherwise,
  // which the extractor's deterministic gate rejects wherever the turn names a head: those passes go
  // through the same-model repair and the provider fallback, each reserved and settled on its own.
  const snapshot = g.buildIntentRouterGoldSnapshot();
  const preflightMessage = snapshot.preflight.objectInput.latestUserMessage;
  const routed = g.intentClassifierOutputSchema.parse({
    routingCore: {action: {value: ['understand'], state: 'unknown'}, object: {value: [], state: 'unknown'}, decisionType: {value: 'none', state: 'not_applicable'},
      audienceType: {value: 'unspecified', state: 'unknown'}, depth: {value: 'point', state: 'unknown'}, continuity: {value: 'new', state: 'unknown'}, workResponsibility: {value: [], state: 'unknown'}},
    inferableContext: {jurisdiction: {value: [], state: 'unknown'}, asOfDate: {value: null, state: 'unknown'}, currency: {value: null, state: 'unknown'}, deadline: {value: null, state: 'unknown'},
      sponsorInstruction: {value: null, state: 'unknown'}, constraints: {value: [], state: 'unknown'}, urgency: {value: null, state: 'unknown'}, availableInputs: {value: [], state: 'unknown'}},
    primaryWorks: [], composition: null, firstQuestion: null, abstain: true, abstainReason: 'Resposta sintética da prova de CI.',
  });
  const span = text => ({source: 'latest_user_message', messageIndex: null, start: preflightMessage.indexOf(text), end: preflightMessage.indexOf(text) + text.length, text});
  const empty = {objects: [], activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [], excludedSemanticHeadSpans: []};
  const preflightExtraction = {...empty, objects: [
    {candidateId: 'candidate-1', kind: 'company', head: {key: 'entity', span: span('Camil')}, modifiers: []},
    {candidateId: 'candidate-2', kind: 'operation', head: {key: 'subject', span: span('refinanciamento')}, modifiers: []},
  ]};
  assert.deepEqual(g.validateSemanticObjectOutput(snapshot.preflight.objectInput, preflightExtraction), {accepted: true}, 'the preflight extraction is attributable');
  const extractionFor = message => message === preflightMessage ? preflightExtraction : empty;
  const usage = {inputTokens: 120, outputTokens: 30, cachedInputTokens: 0};
  let providerCalls = 0;
  const simulated = provider => ({provider, async complete(request) {
    providerCalls += 1;
    const message = JSON.parse(request.input[0].text).latestUserMessage;
    const output = request.schemaName === 'shadow_routing_output' ? routed : extractionFor(message);
    return {output: structuredClone(output), rawText: JSON.stringify(output), usage, model: request.model, stopReason: 'end'};
  }});
  const deps = {adapters: {anthropic: simulated('anthropic'), openai: simulated('openai')}, connections: {anthropic: routeConnection, openai: routeConnection}, heartbeatMs: 2_000};
  // Every route call once; each extractor call once when its extraction is accepted, else three times.
  const attemptsOf = objectInput => g.validateSemanticObjectOutput(objectInput, extractionFor(objectInput.latestUserMessage)).accepted ? 1 : 3;
  const expectedCalls = 4 + snapshot.observations.reduce((sum, observation) => sum + 1 + attemptsOf(observation.objectInput), 0);
  const rejected = snapshot.observations.filter(observation => attemptsOf(observation.objectInput) === 3).map(({turnId, repeat}) => `${turnId}:${repeat}:intent_object_gold`);
  assert(rejected.length > 0 && rejected.length < snapshot.observations.length, 'the simulation exercises both accepted and rejected extractions');

  const trustedWorkflow = {GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'carlosevg100/offroad', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'e5a1e000'.repeat(5),
    GITHUB_WORKFLOW_REF: 'carlosevg100/offroad/.github/workflows/intent-router-gold.yml@refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1'};
  const environment = {...scriptEnvironment, ...trustedWorkflow};
  assert.deepEqual(Object.keys(environment).filter(name => providerCredential.test(name)), [], 'the intent router script runs with no provider key in its environment');
  const runGate = out => {
    const child = spawn(process.execPath, [tsxCli, 'scripts/run-intent-router-gold.ts', '--out', out, '--poll-seconds', '1'], {cwd: evalsDir, env: environment, stdio: ['ignore', 'pipe', 'pipe']});
    const run = {child, stdout: '', stderr: '', ended: null};
    child.stdout.on('data', chunk => { run.stdout += chunk; });
    child.stderr.on('data', chunk => { run.stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 300_000);
    run.exited = new Promise((done, fail) => {
      child.on('error', fail);
      child.on('close', code => { clearTimeout(timer); run.ended = code ?? -1; done(run); });
    });
    return run;
  };
  const claimGate = async run => {
    for (const deadline = Date.now() + 240_000; Date.now() < deadline;) {
      const claim = await consumer.claim();
      if (claim) {
        assert.equal(JSON.parse(claim.contractText).audience.scriptId, scriptId, 'another evaluation claimed');
        return claim;
      }
      if (run.ended !== null) throw new Error(`intent_router_script_ended_before_its_request_was_claimed: ${run.ended}\n${outputTail(run)}`);
      await new Promise(done => setTimeout(done, 500));
    }
    run.child.kill('SIGKILL');
    throw new Error(`intent_router_script_request_not_claimed\n${outputTail(run)}`);
  };

  // Live: the canonical gold snapshot, every attempt reserved and settled, the gate record written.
  const dir = join(temporary, 'intent-router-gold-succeeded');
  const started = performance.now();
  const run = runGate(dir);
  const claim = await claimGate(run);
  const contract = JSON.parse(claim.contractText);
  assert.deepEqual([contract.organizationId, contract.purpose, contract.audience], [organization, 'evaluation', {kind: 'evaluation_panel', ...snapshot.audience, scriptId}]);
  assert.deepEqual(contract.tools, routes.map(route => ({id: `provider:${route.provider}:${route.model}`, version: m.governedEvaluationToolVersion, effect: 'read_only'})),
    'every route the family may take, at the gateway version');
  assert.deepEqual([contract.budget.maxCostMicrousd, contract.budget.maxModelCalls, contract.budget.maxDurationMs, contract.inputs.sources], [3_000_000, 320, 320 * 60_000, []]);
  assert.equal(claim.snapshotText, g.executionCanonicalText(snapshot), 'the script sends the canonical gold snapshot');
  assert.equal(contract.inputs.fingerprint, sha(claim.snapshotText));
  const before = providerCalls;
  assert.deepEqual(await m.processGovernedEvaluation(claim, consumer, new AbortController().signal, deps), {status: 'succeeded', reason: 'evaluated', replayed: false});
  assert.equal(providerCalls - before, expectedCalls, 'every attempt the gate makes reaches a simulated provider once');
  await run.exited;
  const gateMs = Math.ceil(performance.now() - started);
  // The evaluation succeeds; the gate it records fails on the simulated answers, with its usual status.
  assert.equal(run.ended, 1, `the intent router script did not record its gate\n${outputTail(run)}`);
  assert.match(run.stdout, new RegExp(`^evaluation committed: succeeded/evaluated, \\d+ microusd over ${expectedCalls} calls$`, 'm'));
  assert.match(run.stdout, /^gate=FAIL turns=40 observations=52 /m);
  assert.deepEqual(readdirSync(dir).sort(), ['evaluation.json', 'intent-router-gold.json', 'intent-router-gold.md']);
  const read = await call(evaluator, 'read_governed_evaluation_session_v1', {p_execution_id: claim.executionId});
  assert.deepEqual([read.requestedBy, read.outcome, read.reason, read.contractFingerprint], [users.evaluator, 'succeeded', 'evaluated', claim.contractFingerprint]);
  const committed = g.intentRouterGoldResultSchema.parse(JSON.parse(read.result.canonicalResult));
  assert.equal(committed.outcome, 'observed');
  const record = JSON.parse(readFileSync(join(dir, 'intent-router-gold.json'), 'utf8'));
  assert.deepEqual(record.calls, committed.calls, 'the gate record keeps the committed call ledger');
  assert.deepEqual([record.providerPreflight, record.gatewaySpent], [committed.providerPreflight, committed.gatewaySpent]);
  assert.deepEqual(record.runs.map(run => [run.turnId, run.repeat, run.rawActualFingerprint, run.rawObjectActualFingerprint, run.actualFingerprint, run.error]),
    committed.observations.map(observation => [observation.turnId, observation.repeat, observation.rawActualFingerprint, observation.rawObjectActualFingerprint, observation.actualFingerprint, observation.error]));
  assert(g.verifyIntentRouterEvidenceRecord(record), 'the gate record fingerprint verifies from the written file');
  assert.deepEqual([record.provenance.gitSha, record.provenance.workflowRef, record.provenance.eventName], [trustedWorkflow.GITHUB_SHA, trustedWorkflow.GITHUB_WORKFLOW_REF, 'workflow_dispatch']);
  assert.equal(record.manifestPassed, true);
  assert.deepEqual([record.callEvidence.linkedPreflightOperations, record.callEvidence.linkedObservationOperations, record.callEvidence.providerAttempts], [4, 104, expectedCalls]);
  assert.deepEqual([...record.callEvidence.issues].sort(), rejected.flatMap(operation => [`terminal_success_count:${operation}:0`, `output_mismatch:${operation}`]).sort(),
    'the ledger passes every prompt, input, repair, topology, preflight and cost check; only the rejected extractions miss their success');
  assert.equal(read.receipts.length, expectedCalls);
  for (const receipt of read.receipts) {
    const model = receipt.toolId.split(':')[2];
    assert(routes.some(route => receipt.toolId === `provider:${route.provider}:${route.model}`), 'a declared route');
    assert.deepEqual([receipt.state, receipt.toolVersion, receipt.resources, receipt.reservedCalls, receipt.spentCalls], ['settled', m.governedEvaluationToolVersion, ['inference', 'prompt_cache'], 1, 1]);
    assert.equal(receipt.spentMicrousd, m.microusdCeil(m.estimateCostUsd(model, usage)));
    assert(receipt.reservedMicrousd >= receipt.spentMicrousd, 'spend within its reservation');
  }
  assert(read.receipts.some(receipt => receipt.toolId === 'provider:openai:gpt-5.6-terra'), 'provider fallbacks were reserved on their own route');
  assert.equal(read.decisions.length, expectedCalls + routes.length, 'one decision per reservation and one revalidation per route at publication');
  assert(read.decisions.every(decision => decision.allowed && decision.purpose === 'evaluation'));
  const spent = read.receipts.reduce((sum, receipt) => sum + receipt.spentMicrousd, 0);
  assert.deepEqual([read.cost.spentMicrousd, read.cost.reservedMicrousd, read.cost.spentCalls, read.cost.reservedCalls, read.totalCostMicrousd], [spent, 0, expectedCalls, 0, spent]);
  const evidence = JSON.parse(readFileSync(join(dir, 'evaluation.json'), 'utf8'));
  assert.deepEqual([evidence.executionId, evidence.request, evidence.outcome, evidence.reason, evidence.resultFingerprint, evidence.receipts.length],
    [claim.executionId, 'created', 'succeeded', 'evaluated', read.result.resultFingerprint, expectedCalls]);
  assert(evidence.receipts.every(receipt => !('route' in receipt)));
  assert.equal(sql(`select count(*) from private.governed_evaluation_request_events where evaluation_id='${claim.executionId}' and actor_user_id='${users.evaluator}';`), '1');
  console.log(`governed_intent_router_gold_script: PASS (script with no provider key, evaluator session request of the 52-observation gold snapshot, ${expectedCalls} reserved and settled attempts including repairs and fallbacks, commit succeeded/evaluated, gate record carrying the committed ledger)`);

  // Revoked: the family's inference assurance on the primary route is revoked before the claim.
  sql(`select private.revoke_provider_processing_assurance_v1('${routes[0].assurances.inference}','Synthetic revocation before the intent router gold run');`);
  const deniedDir = join(temporary, 'intent-router-gold-denied');
  const deniedRun = runGate(deniedDir);
  const deniedClaim = await claimGate(deniedRun);
  assert.notEqual(deniedClaim.executionId, claim.executionId);
  assert.equal(deniedClaim.snapshotText, claim.snapshotText, 'the script assembles the same bytes on every run');
  const beforeDenial = providerCalls;
  assert.deepEqual(await m.processGovernedEvaluation(deniedClaim, consumer, new AbortController().signal, deps), {status: 'partial', reason: 'transport_denied', replayed: false});
  assert.equal(providerCalls, beforeDenial, 'a revoked assurance lets nothing of the gate reach a provider');
  await deniedRun.exited;
  assert.equal(deniedRun.ended, 3, `the intent router script must end partial\n${outputTail(deniedRun)}`);
  assert.match(deniedRun.stdout, /^evaluation committed: partial\/transport_denied, 0 microusd over 0 calls$/m);
  assert.match(deniedRun.stderr, new RegExp(`^evaluation ${deniedClaim.executionId} is partial: transport_denied$`, 'm'));
  assert.deepEqual(readdirSync(deniedDir), ['evaluation.json'], 'a partial evaluation writes no gate record');
  const deniedEvidence = JSON.parse(readFileSync(join(deniedDir, 'evaluation.json'), 'utf8'));
  assert.deepEqual([deniedEvidence.outcome, deniedEvidence.reason, deniedEvidence.receipts.length, deniedEvidence.cost.spentMicrousd, deniedEvidence.totalCostMicrousd],
    ['partial', 'transport_denied', 0, 0, 0]);
  assert.deepEqual(deniedEvidence.decisions.map(decision => [decision.allowed, decision.purpose, decision.reasons.includes('processing_resource_ineligible:inference')]),
    [[false, 'evaluation', true]]);
  console.log('governed_intent_router_gold_script_revoked_assurance: PASS (script with no provider key, first reservation denied and journaled, zero provider calls, script received partial/transport_denied and wrote no gate record)');
  console.log(JSON.stringify({event: 'governed_intent_router_gold_proof', gateMs, providerCalls, expectedCalls, spentMicrousd: spent}));
}
