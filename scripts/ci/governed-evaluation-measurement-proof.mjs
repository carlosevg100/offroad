// Disposable localhost stack only. Called by verify-governed-evaluation.mjs with its stack, sessions
// and worker binding once the transport is open: the measurement families of stage 17, increment 5,
// each through its own script, live, as a child process with no provider key in its environment.
// measure-extraction and measure-classification parse the committed nimbus gold case and request
// through the evaluator's session wrapper; probe-structured-output requests its sixteen shapes. The
// worker's consumer claims each evaluation and answers from a cassette recorded for exactly the
// requests the family sends; the script reads the committed result and writes its record. Then,
// with the inference assurances of these routes revoked, each script receives
// partial/transport_denied, writes only its evaluation evidence, exits with status 3, and the
// cassette is called zero times. The assurances are this proof's own, under a synthetic account no
// other proof uses. Everything is synthetic; no network beyond the local stack, no provider key.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
const sum = values => values.reduce((total, value) => total + value, 0);

export async function proveMeasurementFamilies({root, temporary, sql, call, evaluator, worker, workerToken, organization, evaluatorId, scriptEnvironment, tsxCli, evalsDir, outputTail}) {
  const workerRequire = createRequire(join(root, 'apps/document-worker/package.json'));
  const {build} = workerRequire('esbuild');
  // One bundle for everything this proof runs, so the consumer, its gateway and the families share
  // their classes: the worker's consumer and queue, the registered families, and the gateway pieces
  // the cassette is recorded with.
  const outfile = join(temporary, 'measurement-families.mjs');
  await build({stdin: {contents: `export {createEvaluationQueue} from './src/evaluation-queue.ts';
export {processGovernedEvaluation} from './src/process-governed-evaluation.ts';
export {evaluationFamilies} from './src/evaluation-families.ts';
export {governedEvaluationToolVersion, microusdCeil} from './src/governed-evaluation-gateway.ts';
export {providerEndpoints} from './src/provider-processing.ts';
export {executionCanonicalText} from '@offroad/agent-contracts';
export {extractionMeasurementContentHashes, extractionMeasurementPasses} from '@offroad/document-extraction';
export {classificationMeasurementContentHashes} from '@offroad/document-classification';
export {cassetteKey, createModelGateway, defaultTaskPolicies, estimateCostUsd} from '@offroad/model-gateway';
export {z} from 'zod';`, resolveDir: join(root, 'apps/document-worker'), loader: 'ts'}, outfile, bundle: true, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent'});
  const b = await import(pathToFileURL(outfile));

  // 1. As the database owner: one assurance per route and resource these families send (Sonnet and
  // Terra; inference, prompt cache and schema cache), valid for evaluation only, under this proof's
  // own synthetic connection.
  const connection = {accountRef: 'synthetic-measurement-account-e5a1e000', projectRef: 'synthetic-measurement-project', credentialBinding: 'synthetic-measurement-binding', region: 'global'};
  const assurances = [['anthropic', 'claude-sonnet-5'], ['openai', 'gpt-5.6-terra']]
    .flatMap(([provider, model]) => ['inference', 'prompt_cache', 'schema_cache'].map(resource => ({id: randomUUID(), provider, model, resource})));
  sql(`begin;
${assurances.map(({id, provider, model, resource}) => `select private.record_provider_processing_assurance_v1(jsonb_build_object(
 'id','${id}','policyVersion','offroad-provider-retention-v2','accountRef','${connection.accountRef}','projectRef','${connection.projectRef}',
 'credentialBinding','${connection.credentialBinding}','provider','${provider}','models',jsonb_build_array('${model}'),'endpoint','${b.providerEndpoints[provider]}',
 'resource','${resource}','region','${connection.region}','eligibility','supported','purposes','["evaluation"]'::jsonb,'classifications','["restricted"]'::jsonb,
 'rights','["process"]'::jsonb,'trainingUse','prohibited',
 'retention',jsonb_build_object('requestContentSeconds',0,'abuseMonitoringSeconds',2592000,'applicationStateSeconds',0,'cacheSeconds',86400,'metadataSeconds',2592000,'exceptions','["legal_hold"]'::jsonb),
 'zeroRetention','not_contracted',
 'evidence',(select jsonb_agg(jsonb_build_object('kind',k,'reference','synthetic-measurement-proof','sha256',repeat('a',64))) from unnest(array['provider_terms','account_configuration','credential_binding']) k),
 'reviewedBy','Synthetic reviewer','reviewedAt',clock_timestamp()-interval '1 hour','validThrough',clock_timestamp()+interval '1 day','revokedAt',null),
 'Synthetic measurement families proof');`).join('\n')}
commit;`);

  // 2. The cassette. Each family's requests are recorded by running the family itself, over the
  // snapshot the script sent, through a plain model gateway whose adapters answer synthetically and
  // record each exact request (system, input, schema, model and effort). The consumer's run must
  // then send exactly those requests: any other byte misses, and a miss is a failed provider call.
  const inferred = value => ({value, state: 'inferred', confidence: 0.8});
  const full = {routingCore: {action: inferred(['preparar reunião']), object: inferred([{kind: 'company', reference: 'Companhia Fictícia'}]),
    desiredOutcome: inferred('Reunião sobre refinanciamento das debêntures'), decision: inferred(null), audience: inferred(['companhia']), depth: inferred('preliminary'),
    continuity: inferred('new'), workResponsibility: inferred(['producer'])},
  inferableContext: {jurisdiction: inferred(['BR']), asOfDate: inferred(null), currency: inferred('BRL'), deadline: inferred(null), sponsorInstruction: inferred(null),
    constraints: inferred([]), urgency: inferred(null), availableInputs: inferred([])},
  primaryWorks: [{work: 'capital_strategy', confidence: 0.7}], composition: null, firstQuestion: null, abstain: false, abstainReason: null};
  const probeOutputs = {
    probe_flat: {intent: 'refinanciamento', confidence: 0.9, company: 'Companhia Fictícia'},
    probe_nested: {routingCore: {action: inferred(['preparar reunião']), desiredOutcome: inferred('Reunião sobre refinanciamento'), decision: inferred(null), depth: inferred('preliminary')},
      inferableContext: {asOfDate: inferred(null), currency: inferred('BRL'), constraints: inferred([])},
      primaryWorks: [{work: 'capital_strategy', confidence: 0.7}], composition: null, firstQuestion: null, abstain: false, abstainReason: null},
    probe_full: full,
    'probe_full-prompted': full,
  };
  const usage = {inputTokens: 1000, outputTokens: 100, cachedInputTokens: 0};
  // A candidate citing an anchor no layer has: the script's own verification must flag it.
  const unanchored = {field_path: 'historical_financials.2025.revenue', value_raw: '1.234.567,89', value_type: 'number', scale: 1, information_class: 'management',
    anchor: {kind: 'block', id: 'sintetico.b1'}, quote: '1.234.567,89', confidence: 0.5};
  const answerOf = request => {
    // Deterministic per request: the same request always gets the same answer.
    if (request.schemaName === 'extractor_output') {
      const text = request.input.map(part => part.text).join('\n');
      const firstWindow = text.includes('Este é o documento inteiro.') || text.includes('Este é o trecho 1 de ');
      return {candidates: firstWindow ? [unanchored] : [], absent_fields: [], document_alerts: [`Alerta sintético ${sha(text).slice(0, 12)}`]};
    }
    if (request.schemaName === 'document_profile') {
      return {documentKind: 'management_accounts', informationClass: 'management', language: 'pt', summary: 'Resumo sintético da prova.', confidence: 0.9, reasoning: 'Prova sintética de CI.'};
    }
    assert(Object.hasOwn(probeOutputs, request.schemaName), `no synthetic answer for ${request.schemaName}`);
    return probeOutputs[request.schemaName];
  };
  const recorded = new Map();
  const record = async (scriptId, snapshotText) => {
    const prepared = b.evaluationFamilies[scriptId].prepare(JSON.parse(snapshotText));
    const recorder = provider => ({provider, async complete(request) {
      const output = answerOf(request);
      const response = {output, rawText: JSON.stringify(output), usage, model: request.model, stopReason: 'end'};
      recorded.set(b.cassetteKey(provider, request, b.z.toJSONSchema(request.schema)), response);
      return structuredClone(response);
    }});
    const gateway = b.createModelGateway({adapters: {anthropic: recorder('anthropic'), openai: recorder('openai')}, policies: {...b.defaultTaskPolicies, ...prepared.policies}});
    return JSON.parse(JSON.stringify(await prepared.run(gateway, () => new Date())));
  };
  let calls = 0, hits = 0;
  const cassette = provider => ({provider, async complete(request) {
    calls += 1;
    const response = recorded.get(b.cassetteKey(provider, request, b.z.toJSONSchema(request.schema)));
    if (!response) throw new Error('cassette_missing');
    hits += 1;
    return structuredClone(response);
  }});
  const adapters = {anthropic: cassette('anthropic'), openai: cassette('openai')};
  const consumer = b.createEvaluationQueue(worker, workerToken);

  // 3. Each script as its workflow runs it, live, with no provider key and no OCR engine, so the
  // parse is the same on every runner.
  const runScript = (file, args, out) => {
    const child = spawn(process.execPath, [tsxCli, file, ...args, '--out', out, '--max-cost', '100', '--poll-seconds', '1'],
      {cwd: evalsDir, env: {...scriptEnvironment, TESSERACT_BIN: '/nonexistent/offroad-proof-tesseract'}, stdio: ['ignore', 'pipe', 'pipe']});
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
  // The consumer polls like the worker until the script's own request is claimable, and takes nothing else.
  const claimOf = async (run, scriptId) => {
    for (const deadline = Date.now() + 240_000; Date.now() < deadline;) {
      const claim = await consumer.claim();
      if (claim) {
        assert.equal(JSON.parse(claim.contractText).audience.scriptId, scriptId, 'another evaluation claimed');
        return claim;
      }
      if (run.ended !== null) throw new Error(`${scriptId}_ended_before_its_request_was_claimed: ${run.ended}\n${outputTail(run)}`);
      await new Promise(done => setTimeout(done, 500));
    }
    run.child.kill('SIGKILL');
    throw new Error(`${scriptId}_request_not_claimed\n${outputTail(run)}`);
  };
  const processClaim = claim => b.processGovernedEvaluation(claim, consumer, new AbortController().signal,
    {adapters, connections: {anthropic: connection, openai: connection}, heartbeatMs: 2_000});
  const toolOf = (provider, model) => ({id: `provider:${provider}:${model}`, version: b.governedEvaluationToolVersion, effect: 'read_only'});
  const families = [
    {scriptId: 'measure-extraction', file: 'scripts/measure-extraction.ts', args: ['nimbus'], files: ['extraction-nimbus.evaluation.json', 'extraction-nimbus.json'],
      tools: [toolOf('anthropic', 'claude-sonnet-5'), toolOf('openai', 'gpt-5.6-terra')], route: 'provider:anthropic:claude-sonnet-5', model: 'claude-sonnet-5'},
    {scriptId: 'measure-classification', file: 'scripts/measure-classification.ts', args: ['nimbus'], files: ['nimbus-classification.evaluation.json', 'nimbus-classification.json'],
      tools: [toolOf('openai', 'gpt-5.6-terra'), toolOf('anthropic', 'claude-sonnet-5')], route: 'provider:openai:gpt-5.6-terra', model: 'gpt-5.6-terra'},
    {scriptId: 'probe-structured-output', file: 'scripts/probe-structured-output.ts', args: [], files: ['structured-output-probe.evaluation.json'],
      tools: [toolOf('anthropic', 'claude-sonnet-5')], route: 'provider:anthropic:claude-sonnet-5', model: 'claude-sonnet-5'},
  ];
  const nimbus = JSON.parse(readFileSync(join(root, 'packages/testing-fixtures/gold/nimbus/manifest.json'), 'utf8'));

  // 4. Each family allowed: request, claim, one reservation per send, cassette, settlement, commit,
  // and the script's own record written from the committed result.
  const snapshots = new Map();
  for (const family of families) {
    const out = join(temporary, `${family.scriptId}-succeeded`);
    const run = runScript(family.file, family.args, out);
    const claim = await claimOf(run, family.scriptId);
    const contract = JSON.parse(claim.contractText);
    const snapshot = JSON.parse(claim.snapshotText);
    snapshots.set(family.scriptId, claim.snapshotText);
    assert.deepEqual([contract.organizationId, contract.purpose, contract.audience.kind, contract.audience.scriptId], [organization, 'evaluation', 'evaluation_panel', family.scriptId]);
    assert.deepEqual(contract.tools, family.tools, 'every route the family may take, at the gateway version');
    assert.equal(contract.inputs.fingerprint, sha(claim.snapshotText));
    let sends;
    if (family.scriptId === 'probe-structured-output') {
      assert.deepEqual([contract.audience.caseId, snapshot.variants.length, contract.inputs.sources], ['structured-output-probe', 16, []]);
      // Twelve shapes the provider compiles and four it reads from the prompt, each of which may take one repair.
      assert.equal(contract.budget.maxModelCalls, 20);
      sends = 16;
    } else {
      assert.deepEqual([contract.audience.caseId, contract.audience.caseVersion], ['nimbus', nimbus.version]);
      assert.deepEqual(snapshot.documents.map(document => document.name), nimbus.documents.map(document => document.name));
      const hashes = family.scriptId === 'measure-extraction' ? b.extractionMeasurementContentHashes(snapshot) : b.classificationMeasurementContentHashes(snapshot);
      assert.deepEqual(contract.inputs.sources.map(source => source.contentHash), hashes);
      assert.deepEqual(hashes, [...new Set(nimbus.documents.map(document => document.sha256))].sort(), 'the sources are the bytes of the committed documents');
      sends = family.scriptId === 'measure-extraction' ? sum(await b.extractionMeasurementPasses(snapshot)) : snapshot.documents.length;
      assert.equal(contract.budget.maxModelCalls, sends * 2, 'each send may fall back once');
    }
    assert.equal(contract.budget.maxCostMicrousd, 100_000_000);
    const expected = await record(family.scriptId, claim.snapshotText);
    const before = {calls, hits};
    assert.deepEqual(await processClaim(claim), {status: 'succeeded', reason: 'evaluated', replayed: false});
    assert.deepEqual([calls - before.calls, hits - before.hits], [sends, sends], 'each send reaches the cassette once, and the cassette knows every request');
    await run.exited;
    assert.equal(run.ended, 0, `${family.scriptId} failed\n${outputTail(run)}`);
    assert.match(run.stdout, new RegExp(`^evaluation committed: succeeded/evaluated, \\d+ microusd over ${sends} calls$`, 'm'));
    assert.deepEqual(readdirSync(out).sort(), family.files);
    const read = await call(evaluator, 'read_governed_evaluation_session_v1', {p_execution_id: claim.executionId});
    assert.deepEqual([read.requestedBy, read.outcome, read.reason, read.contractFingerprint, read.inputFingerprint],
      [evaluatorId, 'succeeded', 'evaluated', claim.contractFingerprint, sha(claim.snapshotText)]);
    const cost = b.microusdCeil(b.estimateCostUsd(family.model, usage));
    assert.equal(read.receipts.length, sends);
    for (const receipt of read.receipts) {
      assert.deepEqual([receipt.state, receipt.toolId, receipt.toolVersion, receipt.spentCalls, receipt.spentMicrousd], ['settled', family.route, b.governedEvaluationToolVersion, 1, cost]);
      assert(receipt.reservedMicrousd >= receipt.spentMicrousd, 'spend within its reservation');
    }
    // The shapes read from the prompt carry no schema to cache; publication authorizes each route and resource set used once more.
    const resourceSets = new Set(read.receipts.map(receipt => receipt.resources.join(',')));
    assert.deepEqual([...resourceSets].sort(), family.scriptId === 'probe-structured-output'
      ? ['inference,prompt_cache', 'inference,prompt_cache,schema_cache'] : ['inference,prompt_cache,schema_cache']);
    assert.equal(read.decisions.length, sends + resourceSets.size, 'one decision per reservation and one revalidation per route and resources at publication');
    assert(read.decisions.every(decision => decision.allowed && decision.purpose === 'evaluation'));
    assert.deepEqual([read.cost.spentMicrousd, read.cost.reservedMicrousd, read.cost.spentCalls, read.totalCostMicrousd], [cost * sends, 0, sends, cost * sends]);
    const committed = JSON.parse(read.result.canonicalResult);
    assert.equal(b.executionCanonicalText(committed), read.result.canonicalResult, 'result bytes are canonical');
    const evidence = JSON.parse(readFileSync(join(out, family.files[0]), 'utf8'));
    assert.deepEqual([evidence.executionId, evidence.request, evidence.outcome, evidence.reason, evidence.contractFingerprint, evidence.resultFingerprint, evidence.receipts.length],
      [claim.executionId, 'created', 'succeeded', 'evaluated', claim.contractFingerprint, read.result.resultFingerprint, sends]);
    assert(evidence.receipts.every(receipt => !('route' in receipt)), 'route account identifiers stay in the database');
    // What the script wrote is what the worker committed, and what the family computes from the recorded answers.
    if (family.scriptId === 'measure-extraction') {
      assert.deepEqual(committed.documents.map(document => [document.name, document.extraction]), expected.documents.map(document => [document.name, document.extraction]));
      const written = JSON.parse(readFileSync(join(out, family.files[1]), 'utf8'));
      assert.deepEqual(written.raw, Object.fromEntries(committed.documents.map(document => [document.name, document.extraction.raw])));
      assert.deepEqual(Object.entries(written.detail).map(([name, detail]) => [name, detail.alerts]), committed.documents.map(document => [document.name, document.extraction.alerts]));
      assert(committed.documents.some(document => document.extraction.alerts.length > 0), 'the recorded answers reached the record');
      // The worker publishes the raw answer only; the script rebuilt the verification, which flags the anchor no layer has.
      assert(committed.documents.every(document => !('candidates' in document.extraction) && document.extraction.raw.some(candidate => candidate.anchor.id === 'sintetico.b1')));
      for (const document of committed.documents) {
        assert.deepEqual(written.detail[document.name].candidates.filter(candidate => candidate.anchor.id === 'sintetico.b1')
          .map(candidate => [candidate.field_path, candidate.normalized_value, candidate.anchor_verified, candidate.verifier_flags.includes('anchor_missing')]),
        [['historical_financials.2025.revenue', '1234567.89', false, true]], `the rebuilt verification of ${document.name}`);
      }
      assert.deepEqual([written.snapshot.usage.calls, written.promptVersion, written.snapshot.extractor.version], [sends, committed.extractor.promptVersion, committed.extractor.version]);
    } else if (family.scriptId === 'measure-classification') {
      assert.deepEqual(committed.documents.map(({ms: _ms, ...document}) => document), expected.documents.map(({ms: _ms, ...document}) => document));
      const written = JSON.parse(readFileSync(join(out, family.files[1]), 'utf8'));
      assert.deepEqual(written.rows.map(row => [row.document, row.actualKind, row.actualClass, row.actualPeriodEnd, row.confidence]),
        committed.documents.map(document => [document.document, 'management_accounts', 'management', null, 0.9]));
      assert.deepEqual([written.documents, written.calls, written.classifierVersion], [sends, sends, committed.classifierVersion]);
    } else {
      assert.deepEqual(committed.variants.map(({ms: _ms, ...variant}) => variant), expected.variants.map(({ms: _ms, ...variant}) => variant));
      assert(committed.variants.every(variant => variant.verdict === 'accepted' && variant.model === 'claude-sonnet-5'));
      assert.equal(run.stdout.split('\n').filter(line => /^OK {4}effort=(low|medium) thinking=(off|adaptive) schema=(flat|nested|full|full-prompted) model=claude-sonnet-5 /.test(line)).length, 16);
    }
    console.log(`governed_measurement_${family.scriptId}: PASS (script with no provider key, evaluator session request, worker claim, ${sends} reservations, cassette sends and settlements, commit succeeded/evaluated, record written from the committed result)`);
  }

  // 5. The inference assurance of every route these families take is revoked: the same scripts, the
  // same bytes, and the cassette could answer every request, yet the first reservation is denied and
  // journaled, nothing reaches the cassette, and each script ends partial with status 3.
  for (const assurance of assurances.filter(entry => entry.resource === 'inference')) {
    sql(`select private.revoke_provider_processing_assurance_v1('${assurance.id}','Synthetic revocation for the measurement families proof');`);
  }
  for (const family of families) {
    const out = join(temporary, `${family.scriptId}-denied`);
    const run = runScript(family.file, family.args, out);
    const claim = await claimOf(run, family.scriptId);
    assert.equal(claim.snapshotText, snapshots.get(family.scriptId), 'the script assembles the same bytes on every run');
    const before = calls;
    assert.deepEqual(await processClaim(claim), {status: 'partial', reason: 'transport_denied', replayed: false});
    assert.equal(calls, before, 'a revoked assurance lets nothing reach the cassette');
    await run.exited;
    assert.equal(run.ended, 3, `${family.scriptId} must end partial\n${outputTail(run)}`);
    assert.match(run.stdout, /^evaluation committed: partial\/transport_denied, 0 microusd over 0 calls$/m);
    assert.match(run.stderr, new RegExp(`^evaluation ${claim.executionId} is partial: transport_denied$`, 'm'));
    assert.deepEqual(readdirSync(out), [family.files[0]], 'a partial evaluation writes no record');
    const evidence = JSON.parse(readFileSync(join(out, family.files[0]), 'utf8'));
    assert.deepEqual([evidence.executionId, evidence.outcome, evidence.reason, evidence.receipts.length, evidence.cost.spentMicrousd, evidence.totalCostMicrousd],
      [claim.executionId, 'partial', 'transport_denied', 0, 0, 0]);
    assert.deepEqual(evidence.decisions.map(decision => [decision.allowed, decision.purpose, decision.reasons.includes('processing_resource_ineligible:inference')]),
      [[false, 'evaluation', true]]);
    const read = await call(evaluator, 'read_governed_evaluation_session_v1', {p_execution_id: claim.executionId});
    assert.equal(read.result.canonicalResult, '{"reason":"transport_denied","status":"partial"}');
    console.log(`governed_measurement_${family.scriptId}_revoked_assurance: PASS (reservation denied and journaled, zero cassette calls, script received partial/transport_denied and wrote no record)`);
  }
  console.log(JSON.stringify({event: 'governed_measurement_proof', cassetteHits: hits, cassetteCalls: calls}));
}
