// Disposable localhost stack only. One governed evaluation end to end, through the real session
// wrapper, the worker's own RPC client and consumer, and a cassette in place of the provider: the
// evaluator requests under its JWT, the worker claims, reserves, "sends", settles and commits, and
// the evaluator reads the bytes, receipts and cost. A second evaluation, whose assurance is revoked
// before the claim, must reach the cassette zero times and end partial with transport_denied.
// Everything is synthetic; no network beyond the local stack and no provider key is ever read.
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
  // byte misses, and a miss is a failed provider call.
  const base = m.renderInformationBase(snapshot.informationBase);
  const deliverables = ['Entrega sintética da prova, turno 1.', 'Entrega sintética da prova, turno 2.'];
  const usages = [{inputTokens: 1800, outputTokens: 420, cachedInputTokens: 0}, {inputTokens: 2100, outputTokens: 380, cachedInputTokens: 0}];
  const schemaJson = m.z.toJSONSchema(m.baselineOutputSchema);
  const recorded = new Map();
  const conversation = [base];
  snapshot.informationBase.turns.forEach((turn, index) => {
    conversation.push(m.renderTurnMessage(turn, index));
    const input = conversation.map(text => ({type: 'text', text: m.redactPersonalIdentifiers(text, {}).text}));
    const key = m.cassetteKey('anthropic', {model: 'claude-opus-5', effort: 'high', system: m.BASELINE_SYSTEM_PROMPT, input, schema: m.baselineOutputSchema,
      schemaName: 'baseline_deliverable', maxOutputTokens: 2000, timeoutMs: 1}, schemaJson);
    recorded.set(key, {output: {deliverable: deliverables[index]}, rawText: JSON.stringify({deliverable: deliverables[index]}), usage: usages[index], model: 'claude-opus-5', stopReason: 'end'});
    conversation.push(`## Resposta ao turno ${index + 1} (sua entrega anterior)\n\n${deliverables[index]}`);
  });
  let hits = 0;
  const cassette = {provider: 'anthropic', async complete(request) {
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

  // The disposable database ends with the transport closed again.
  sql(`select private.release_governed_evaluation_transport_v1('${id('a000', 32)}',false,'${users.operator}','Synthetic governed evaluation proof finished');`);
  assert.equal(sql(`select released from private.platform_capability_releases where capability_key='governed-evaluation-transport';`), 'f');
  console.log(JSON.stringify({event: 'governed_evaluation_proof', runMs, cassetteHits: hits, spentMicrousd: costs[0] + costs[1]}));
} finally { rmSync(temporary, {recursive: true, force: true}); }
