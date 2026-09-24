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

  // The disposable database ends with the transport closed again.
  sql(`select private.release_governed_evaluation_transport_v1('${id('a000', 32)}',false,'${users.operator}','Synthetic governed evaluation proof finished');`);
  assert.equal(sql(`select released from private.platform_capability_releases where capability_key='governed-evaluation-transport';`), 'f');
  console.log(JSON.stringify({event: 'governed_evaluation_proof', runMs, scriptMs, cassetteHits: hits, cassetteCalls: calls, spentMicrousd: costs[0] + costs[1]}));
  await proveDocumentWorkProductFamily({m, consumer, evaluator, call, scriptEnvironment, tsxCli, evalsDir, outputTail, claimScriptEvaluation});
} finally { rmSync(temporary, {recursive: true, force: true}); }

// ---------------------------------------------------------------------------------------------
// Stage 17, increment 5: the document work product family, called from one line at the end of the
// proof above. Its four scripts (the documentary executor with its controls, the one-control
// continuation, the advisor response probe and the executive synthesis) run live through the same
// evaluator session, worker consumer and disposable stack, each on the protected run it checks and
// with no provider key in its environment. The consumer answers each from a cassette recorded from
// the family itself for the exact snapshot the script sent, so a request the family would not make
// misses. Every provider, model and resource the family uses has its own assurance, on a synthetic
// connection of its own. Then, with the family's inference assurance revoked, each script receives
// partial/transport_denied, the cassette is called zero times and nothing but the evaluation
// evidence (and the continuation's claim) is written. Everything is synthetic.
// ---------------------------------------------------------------------------------------------
async function proveDocumentWorkProductFamily({m, consumer, evaluator, call, scriptEnvironment, tsxCli, evalsDir, outputTail, claimScriptEvaluation}) {
  const {copyFileSync, mkdirSync} = await import('node:fs');
  // The family's own bundle: its worker families, to record the cassette, and its tests' synthetic answers.
  const outfile = join(temporary, 'document-work-family.mjs');
  await build({stdin: {contents: `export {documentWorkEvaluationFamilies} from './src/evaluation-family-document-work.ts';
export {documentWorkSyntheticAnswer} from './src/evaluation-family-document-work.test-support.ts';
export {cassetteKey, createModelGateway, defaultTaskPolicies} from '@offroad/model-gateway';
export {z} from 'zod';`, resolveDir: join(root, 'apps/document-worker'), loader: 'ts'}, outfile, bundle: true, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent'});
  const f = await import(pathToFileURL(outfile));

  // Every provider, model and resource the four scripts use, for evaluation only, on a connection of
  // its own: the baseline's assurances above neither help these evaluations nor overlap them.
  const connection = {accountRef: `synthetic-document-work-account-${prefix}`, projectRef: 'synthetic-document-work-project', credentialBinding: 'synthetic-document-work-binding', region: 'global'};
  const providers = {
    anthropic: {endpoint: 'https://api.anthropic.com/v1/messages', models: ['claude-sonnet-5', 'claude-opus-5']},
    openai: {endpoint: 'https://api.openai.com/v1/responses', models: ['gpt-5.6-terra', 'gpt-5.6-sol']},
  };
  const resources = ['inference', 'prompt_cache', 'schema_cache'];
  const assuranceIds = Object.fromEntries(Object.keys(providers).flatMap((provider, p) => resources.map((resource, r) => [`${provider}:${resource}`, id('d0c0', 11 + p * 10 + r)])));
  const recordAssurance = (provider, resource) => `select private.record_provider_processing_assurance_v1(jsonb_build_object(
 'id','${assuranceIds[`${provider}:${resource}`]}','policyVersion','offroad-provider-retention-v2','accountRef','${connection.accountRef}','projectRef','${connection.projectRef}',
 'credentialBinding','${connection.credentialBinding}','provider','${provider}','models','${JSON.stringify(providers[provider].models)}'::jsonb,'endpoint','${providers[provider].endpoint}',
 'resource','${resource}','region','${connection.region}','eligibility','supported','purposes','["evaluation"]'::jsonb,'classifications','["restricted"]'::jsonb,
 'rights','["process"]'::jsonb,'trainingUse','prohibited',
 'retention',jsonb_build_object('requestContentSeconds',0,'abuseMonitoringSeconds',2592000,'applicationStateSeconds',0,'cacheSeconds',86400,'metadataSeconds',2592000,'exceptions','["legal_hold"]'::jsonb),
 'zeroRetention','not_contracted',
 'evidence',(select jsonb_agg(jsonb_build_object('kind',k,'reference','synthetic-document-work-proof','sha256',repeat('a',64))) from unnest(array['provider_terms','account_configuration','credential_binding']) k),
 'reviewedBy','Synthetic reviewer','reviewedAt',clock_timestamp()-interval '1 hour','validThrough',clock_timestamp()+interval '1 day','revokedAt',null),
 'Synthetic document work product family proof');`;
  sql(`begin;
${Object.keys(providers).flatMap(provider => resources.map(resource => recordAssurance(provider, resource))).join('\n')}
select private.release_governed_evaluation_transport_v1('${id('d0c0', 1)}',true,'${users.operator}','Synthetic opening for the document work product family proof');
commit;`);

  // The continuation derives its plan from the pinned receipt of its source run, kept as a fixture.
  const receiptPath = join(evalsDir, 'fixtures/document-work-product-live-34467680287-evidence.json');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const micro = usd => Math.round(usd * 1_000_000);
  const continuationMicrousd = Math.min(500_000 - micro(receipt.sourceReviewControlSpend.costUsd),
    3_000_000 - micro(receipt.spent.costUsd) - micro(receipt.sourceReviewControlSpend.costUsd));
  const families = [
    {script: 'run-document-work-product-live', workflow: 'document-work-product-live.yml', output: 'document-work-product-live', budget: [3_000_000, 26], calls: 20,
      provenance: ['gitSha', 'runId', 'runAttempt', 'workflowRef']},
    {script: 'continue-document-work-product-live', workflow: 'document-work-product-continuation.yml', output: 'documentary-continuation', budget: [continuationMicrousd, 1], calls: 1,
      provenance: ['runId', 'gitSha', 'runAttempt'], continuation: true},
    {script: 'run-advisor-response-live', workflow: 'document-work-product-live.yml', output: 'advisor-response-live', budget: [1_000_000, 8], calls: 4, provenance: ['gitSha', 'runId']},
    {script: 'run-executive-synthesis-live', workflow: 'document-work-product-live.yml', output: 'executive-synthesis-live', budget: [3_000_000, 8], calls: 6, provenance: ['gitSha', 'runId']},
  ];

  // Each script as its protected workflow runs it: the run it checks, and the evaluator's session
  // of the stack above in place of any provider key.
  const provenance = {gitSha: prefix.padEnd(40, '0'), runId: '424242', runAttempt: '1'};
  const workflowRef = workflow => `carlosevg100/offroad/.github/workflows/${workflow}@refs/heads/main`;
  const providerCredential = /_API_KEY$|(^|_)(ANTHROPIC|OPENAI|PERPLEXITY|FIRECRAWL)(_|$)/;
  const runScript = (family, runnerTemp) => {
    if (family.continuation) {
      mkdirSync(join(runnerTemp, 'documentary-parent/document-work-product-live'), {recursive: true});
      copyFileSync(receiptPath, join(runnerTemp, 'documentary-parent/document-work-product-live/evidence.json'));
    }
    const environment = {...scriptEnvironment, RUNNER_TEMP: runnerTemp, GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'carlosevg100/offroad', GITHUB_REF: 'refs/heads/main',
      GITHUB_RUN_ATTEMPT: provenance.runAttempt, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_WORKFLOW_REF: workflowRef(family.workflow), GITHUB_SHA: provenance.gitSha,
      GITHUB_RUN_ID: provenance.runId};
    assert.deepEqual(Object.keys(environment).filter(name => providerCredential.test(name)), [], `${family.script} runs with no provider key in its environment`);
    const child = spawn(process.execPath, [tsxCli, `scripts/${family.script}.ts`, '--poll-seconds', '1'], {cwd: evalsDir, env: environment, stdio: ['ignore', 'pipe', 'pipe']});
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

  // The cassette: recorded by running the family itself, in this process, over the snapshot the
  // script sent, with the synthetic answers of its tests; keyed by the exact request. The worker's
  // run replays it, and a request with any other byte misses and fails. Every call is counted.
  const recorded = new Map();
  let calls = 0, hits = 0;
  const recordFamily = async (scriptId, snapshot) => {
    const prepared = f.documentWorkEvaluationFamilies[scriptId].prepare(snapshot);
    const controls = snapshot.sourceReviewControls ?? (snapshot.control ? [snapshot.control] : []);
    let requests = 0;
    const answering = provider => ({provider, async complete(request) {
      requests += 1;
      const response = f.documentWorkSyntheticAnswer(request, controls);
      recorded.set(f.cassetteKey(provider, request, f.z.toJSONSchema(request.schema)), response);
      return structuredClone(response);
    }});
    const gateway = f.createModelGateway({adapters: {anthropic: answering('anthropic'), openai: answering('openai')},
      policies: {...f.defaultTaskPolicies, ...prepared.policies}, budgetReservation: 'conservative_text_v1'});
    await prepared.run(gateway, () => new Date());
    return {prepared, requests};
  };
  const replaying = provider => ({provider, async complete(request) {
    calls += 1;
    const response = recorded.get(m.cassetteKey(provider, request, m.z.toJSONSchema(request.schema)));
    if (!response) throw new Error('cassette_missing');
    hits += 1;
    return structuredClone(response);
  }});
  const dependencies = {adapters: {anthropic: replaying('anthropic'), openai: replaying('openai')}, connections: {anthropic: connection, openai: connection}, heartbeatMs: 2_000};

  // Each script live: its request under the evaluator's session, the worker's claim, a reservation and
  // a settlement per cassette send, the commit, and the script's own read of the committed record.
  const snapshots = new Map();
  for (const family of families) {
    const runnerTemp = join(temporary, `document-work-${family.script}-succeeded`);
    mkdirSync(runnerTemp, {recursive: true});
    const run = runScript(family, runnerTemp);
    const claim = await claimScriptEvaluation(run);
    snapshots.set(family.script, claim.snapshotText);
    const contract = JSON.parse(claim.contractText);
    const recording = await recordFamily(family.script, JSON.parse(claim.snapshotText));
    assert.deepEqual([contract.organizationId, contract.purpose, contract.audience.kind, contract.audience.scriptId], [organization, 'evaluation', 'evaluation_panel', family.script]);
    assert.deepEqual({caseId: contract.audience.caseId, caseVersion: contract.audience.caseVersion}, recording.prepared.audience);
    assert.deepEqual(contract.tools, recording.prepared.routes.map(route => ({id: `provider:${route.provider}:${route.model}`, version: m.governedEvaluationToolVersion, effect: 'read_only'})),
      `${family.script} declares every route its family may take, at the gateway version`);
    assert.deepEqual([contract.budget.maxCostMicrousd, contract.budget.maxModelCalls], family.budget, `${family.script} declares the ceiling it always kept`);
    assert.equal(contract.inputs.fingerprint, sha(claim.snapshotText));
    assert.deepEqual(contract.inputs.sources.map(source => source.contentHash), recording.prepared.contentHashes);
    assert.equal(recording.requests, family.calls);
    const callsBefore = calls, hitsBefore = hits;
    assert.deepEqual(await m.processGovernedEvaluation(claim, consumer, new AbortController().signal, dependencies), {status: 'succeeded', reason: 'evaluated', replayed: false});
    assert.deepEqual([calls - callsBefore, hits - hitsBefore], [family.calls, family.calls], `${family.script}: each request of the family reaches the cassette once, and only those`);
    await run.exited;
    assert.equal(run.ended, 0, `${family.script} failed\n${outputTail(run)}`);
    assert.match(run.stdout, new RegExp(`^evaluation committed: succeeded/evaluated, \\d+ microusd over ${family.calls} calls$`, 'm'));
    const directory = join(runnerTemp, family.output);
    assert.deepEqual(readdirSync(directory).sort(), [...(family.continuation ? ['started.json'] : []), 'evaluation.json', 'evidence.json', 'summary.md'].sort());
    const read = await call(evaluator, 'read_governed_evaluation_session_v1', {p_execution_id: claim.executionId});
    assert.deepEqual([read.requestedBy, read.outcome, read.reason, read.contractFingerprint, read.inputFingerprint],
      [users.evaluator, 'succeeded', 'evaluated', claim.contractFingerprint, sha(claim.snapshotText)]);
    const committed = JSON.parse(read.result.canonicalResult);
    assert.equal(committed.passed, true, `${family.script}: the committed record passes its gates`);
    const stamped = {...provenance, workflowRef: workflowRef(family.workflow)};
    assert.deepEqual(JSON.parse(readFileSync(join(directory, 'evidence.json'), 'utf8')), {...committed, ...Object.fromEntries(family.provenance.map(name => [name, stamped[name]]))},
      `${family.script}: the evidence is the committed record with the requesting run's provenance`);
    assert.match(readFileSync(join(directory, 'summary.md'), 'utf8'), /^# [^\n]+\n\nPASS/);
    const evidence = JSON.parse(readFileSync(join(directory, 'evaluation.json'), 'utf8'));
    assert.deepEqual([evidence.executionId, evidence.request, evidence.outcome, evidence.reason, evidence.contractFingerprint, evidence.inputFingerprint, evidence.resultFingerprint],
      [claim.executionId, 'created', 'succeeded', 'evaluated', claim.contractFingerprint, sha(claim.snapshotText), read.result.resultFingerprint]);
    assert.deepEqual(evidence.cost, read.cost);
    assert.equal(read.receipts.length, family.calls);
    for (const receipt of read.receipts) {
      assert.deepEqual([receipt.state, receipt.spentCalls, receipt.reservedCalls, receipt.toolVersion], ['settled', 1, 1, m.governedEvaluationToolVersion]);
      assert(contract.tools.some(tool => tool.id === receipt.toolId), 'every reservation on a declared route');
      assert(receipt.reservedMicrousd >= receipt.spentMicrousd, 'spend within its reservation');
    }
    const routes = new Set(read.receipts.map(receipt => JSON.stringify([receipt.route, receipt.resources]))).size;
    assert.equal(read.decisions.length, family.calls + routes, 'one decision per reservation and one revalidation per route at publication');
    assert(read.decisions.every(decision => decision.allowed && decision.purpose === 'evaluation'));
    assert.deepEqual([read.cost.spentCalls, read.cost.reservedCalls, read.cost.reservedMicrousd], [family.calls, 0, 0]);
    assert.equal(sql(`select count(*) from private.governed_evaluation_request_events where evaluation_id='${claim.executionId}' and actor_user_id='${users.evaluator}';`), '1');
    console.log(`governed_document_work_script ${family.script}: PASS (no provider key, evaluator session request, worker claim, ${family.calls} reservations and cassette sends, commit succeeded/evaluated, evidence equal to the committed record)`);
  }

  // With the family's inference assurance revoked, the same scripts again: the same bytes, the first
  // reservation denied and journaled, nothing sent, and each script receives partial/transport_denied.
  sql(`select private.revoke_provider_processing_assurance_v1('${assuranceIds['anthropic:inference']}','Synthetic revocation for the document work product family proof');`);
  for (const family of families) {
    const runnerTemp = join(temporary, `document-work-${family.script}-denied`);
    mkdirSync(runnerTemp, {recursive: true});
    const run = runScript(family, runnerTemp);
    const claim = await claimScriptEvaluation(run);
    assert.equal(claim.snapshotText, snapshots.get(family.script), `${family.script} assembles the same bytes on every run`);
    const callsBefore = calls;
    assert.deepEqual(await m.processGovernedEvaluation(claim, consumer, new AbortController().signal, dependencies), {status: 'partial', reason: 'transport_denied', replayed: false});
    assert.equal(calls, callsBefore, `${family.script}: a revoked assurance lets nothing reach the cassette`);
    await run.exited;
    assert.equal(run.ended, 3, `${family.script} must end partial\n${outputTail(run)}`);
    assert.match(run.stdout, /^evaluation committed: partial\/transport_denied, 0 microusd over 0 calls$/m);
    assert.match(run.stderr, new RegExp(`^evaluation ${claim.executionId} is partial: transport_denied$`, 'm'));
    const directory = join(runnerTemp, family.output);
    assert.deepEqual(readdirSync(directory).sort(), family.continuation ? ['evaluation.json', 'started.json'] : ['evaluation.json'], `${family.script}: a partial evaluation writes no record`);
    const evidence = JSON.parse(readFileSync(join(directory, 'evaluation.json'), 'utf8'));
    assert.deepEqual([evidence.executionId, evidence.outcome, evidence.reason, evidence.receipts.length, evidence.cost.spentMicrousd, evidence.totalCostMicrousd],
      [claim.executionId, 'partial', 'transport_denied', 0, 0, 0]);
    assert.deepEqual(evidence.decisions.map(decision => [decision.allowed, decision.purpose, decision.reasons.includes('processing_resource_ineligible:inference')]),
      [[false, 'evaluation', true]]);
    console.log(`governed_document_work_script_revoked_assurance ${family.script}: PASS (reservation denied and journaled, zero cassette calls, partial/transport_denied, no record written)`);
  }

  // The disposable database ends with the transport closed again.
  sql(`select private.release_governed_evaluation_transport_v1('${id('d0c0', 2)}',false,'${users.operator}','Synthetic document work product family proof finished');`);
  assert.equal(sql(`select released from private.platform_capability_releases where capability_key='governed-evaluation-transport';`), 'f');
  console.log(JSON.stringify({event: 'governed_document_work_family_proof', scripts: families.length, cassetteCalls: calls, cassetteHits: hits}));
}
