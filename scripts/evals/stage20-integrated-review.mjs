import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readFileSync, statSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const staging = 'gjkkjtbfnssdsbmlhmwk';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
let phase = 'target_validation';
export function validateTarget(api, database, allowStaging) {
  const a = new URL(api), d = new URL(database);
  assert(!a.username && !a.password && !a.search && !a.hash && ['/', ''].includes(a.pathname), 'closed API root required');
  assert(['postgresql:', 'postgres:'].includes(d.protocol) && !d.search && !d.hash, 'closed PostgreSQL target required');
  const local = ['127.0.0.1', 'localhost', '[::1]'];
  if (local.includes(a.hostname) && local.includes(d.hostname)) {
    assert.equal(a.protocol, 'http:');
    return 'loopback';
  }
  assert.equal(allowStaging, staging, 'staging must be explicitly selected');
  assert.equal(a.origin, `https://${staging}.supabase.co`, 'production and other projects denied');
  assert.equal(d.hostname, `db.${staging}.supabase.co`, 'direct staging database only; ambiguous poolers denied');
  assert.equal(d.pathname, '/postgres');
  return 'staging';
}
export function validateFixture(f) {
  assert.deepEqual(Object.keys(f).sort(), ['artifactId', 'cleanupOwner', 'namespace', 'organizationId', 'ownerId', 'recipeId', 'retainedPayloadId', 'reviewerId', 'revisionId', 'schemaVersion', 'workId'].sort());
  assert.equal(f.schemaVersion, 'stage20-integrated-review-fixture.v1');
  for (const key of ['artifactId', 'namespace', 'organizationId', 'ownerId', 'recipeId', 'retainedPayloadId', 'reviewerId', 'revisionId', 'workId']) assert(uuid.test(f[key]), `${key} invalid`);
  assert.notEqual(f.ownerId, f.reviewerId, 'two actual humans required');
  assert.equal(typeof f.cleanupOwner, 'string');
  assert(f.cleanupOwner.length >= 3 && f.cleanupOwner.length <= 120, 'named cleanup integrator required');
  return f;
}

export async function run(env = process.env) {
  const api = env.REVIEW_EVAL_API_URL, db = env.REVIEW_EVAL_DATABASE_URL;
  const target = validateTarget(api, db, env.REVIEW_EVAL_STAGING_PROJECT);
  assert.equal(statSync(env.REVIEW_EVAL_FIXTURE).mode & 0o077, 0, 'fixture file must be private');
  const f = validateFixture(JSON.parse(readFileSync(env.REVIEW_EVAL_FIXTURE, 'utf8')));
  const key = env.REVIEW_EVAL_PUBLISHABLE_KEY;
  assert(key && !key.startsWith('sb_secret_'), 'publishable key only');
  if (!key.startsWith('sb_publishable_')) assert.equal(JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role, 'anon');
  const sql = query => execFileSync('psql', [db, '-XqAt', '-v', 'ON_ERROR_STOP=1'], {input: `begin read only;${query}commit;`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']}).trim();
  // The operator connection only reads bounded fixture identity and aggregate evidence.
  const own = JSON.parse(sql(`select jsonb_build_object('organizationId',o.id,'workId',p.id,'label',p.project_name) from public.capital_projects p join public.organizations o on o.id=p.organization_id where p.id='${f.workId}' and o.id='${f.organizationId}';`));
  assert.equal(own.workId, f.workId);
  assert(/synthetic/i.test(own.label), 'unlabelled operational work denied');
  const effects = () => JSON.parse(sql(`select jsonb_build_object('jobs',(select count(*) from public.processing_jobs where organization_id='${f.organizationId}'),'vault',(select count(*) from public.vault_publications where organization_id='${f.organizationId}'),'introductions',(select count(*) from public.qualified_introduction_plans where organization_id='${f.organizationId}'));`));
  const headers = token => ({apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-offroad-workspace': f.organizationId});
  const request = async (url, body, h) => {
    const r = await fetch(url, {method: 'POST', headers: h, redirect: 'error', body: JSON.stringify(body), signal: AbortSignal.timeout(15000)});
    const value = await r.json();
    return {ok: r.ok, value};
  };
  const login = async (kind, expectedId) => {
    const email = env[`REVIEW_EVAL_${kind}_EMAIL`];
    assert(email && /^(stage20-review-|native-agent-)[a-f0-9-]+(?:-(?:owner|reviewer))?@example\.invalid$/.test(email), 'synthetic Auth identity only');
    const r = await request(`${api}/auth/v1/token?grant_type=password`, {email, password: env[`REVIEW_EVAL_${kind}_PASSWORD`]}, {apikey: key, 'Content-Type': 'application/json'});
    assert(r.ok && r.value.user?.id === expectedId && typeof r.value.access_token === 'string', 'exact Auth identity required');
    return r.value.access_token;
  };
  const owner = await login('OWNER', f.ownerId), reviewer = await login('REVIEWER', f.reviewerId);
  const rpc = async (token, name, args) => {
    phase = name;
    const r = await request(`${api}/rest/v1/rpc/${name}`, args, headers(token));
    if (!r.ok) throw Object.assign(new Error(`RPC ${name} denied`), {code: r.value.code, reason: r.value.message});
    return r.value;
  };
  const deny = async (fn, reason) => {await assert.rejects(fn, e => e.reason === reason);};
  const proof = [];
  const checked = name => proof.push({name, result: 'PASS'});
  const basis = token => rpc(token, 'read_capital_project_artifact_review_v2', {p_project_id: f.workId, p_artifact_id: f.artifactId, p_revision_id: f.revisionId});
  const a = await basis(owner), b = await basis(reviewer);
  assert(a.workAccess && b.workAccess && a.preparedBy === f.ownerId && a.policy.assignmentRequired && b.policy.roles.includes('approver') && b.policy.roles.includes('preparer'), 'native exact scope and assigned review required');
  assert.equal(a.manifestFingerprint, b.manifestFingerprint);
  const response = await fetch(`${api}/functions/v1/capital-body-read`, {method: 'POST', headers: headers(reviewer), redirect: 'error', body: JSON.stringify({kind: 'preview_result', revisionId: f.revisionId}), signal: AbortSignal.timeout(15000)});
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), response.headers.get('x-offroad-payload-sha256'));
  assert.equal(response.headers.get('x-offroad-recipe-id'), f.recipeId);
  for (const [header, expected] of [['x-offroad-work-id',f.workId],['x-offroad-artifact-id',f.artifactId],['x-offroad-revision-id',f.revisionId],['x-offroad-organization-id',f.organizationId]]) assert.equal(response.headers.get(header),expected);
  assert.equal(Number(response.headers.get('x-offroad-byte-length')),bytes.length);
  const body = JSON.parse(bytes.toString('utf8'));
  assert.deepEqual(Object.keys(body).sort(),['schemaVersion','runId','taskId','role','artifactType','inputFingerprint','content'].sort());
  assert.equal(body.schemaVersion, 'capital-preview-json-body.v1');assert.equal(body.runId, f.recipeId);
  assert(['task_output','decision_contract'].includes(body.role));assert.equal(typeof body.taskId,'string');assert.equal(typeof body.artifactType,'string');assert(/^[a-f0-9]{64}$/.test(body.inputFingerprint));assert(body.content && typeof body.content==='object' && !Array.isArray(body.content));
  assert.deepEqual(await basis(reviewer), b, 'review closure changed during physical read');checked('native_physical_read_exact_revision');
  const decide = (token, target, declared) => rpc(token, 'decide_capital_project_artifact_v2', {p_project_id: f.workId, p_artifact_id: f.artifactId, p_revision_id: f.revisionId, p_manifest_fingerprint: target.manifestFingerprint, p_artifact_fingerprint: target.artifactFingerprint, p_decision: 'confirm', p_note: null, p_self_approval_declared: declared, p_command_id: randomUUID()});
  await deny(() => decide(owner, a, false), 'capital_project_self_approval_forbidden');checked('preparer_cannot_implicitly_self_approve');
  await decide(reviewer, b, false);assert((await basis(reviewer)).approvalActive);checked('second_human_approves_exact_native_revision');
  const subject = `synthetic-integrated-review-${f.namespace}`;
  const manifest = template => ({schemaVersion: 'artifact-manifest.2026.09.26-v1', kind: 'answer', audience: 'internal', format: 'json', bytes: null, method: null, execution: null, inputSnapshot: null, institutionalResult: null, sources: [], claims: [], traces: [], template: null, provenance: {producer: 'synthetic-stage20-human-review', jobId: null, taskRunId: null, messageId: null, capability: null}, legacy: null});
  const write = (token, text, template, sub = subject) => rpc(token, 'create_artifact_revision_v1', {p_work: f.workId, p_kind: 'answer', p_subject: sub, p_audience: 'internal', p_manifest: manifest(template), p_blocks: (template==='synthetic-review-layout'?[{blockKey:'closing',kind:'paragraph',content:{text:'Synthetic presentation only.'},claims:[]},{blockKey:'explanation',kind:'paragraph',content:{text},claims:[]}]:[{blockKey:'explanation',kind:'paragraph',content:{text},claims:[]},{blockKey:'closing',kind:'paragraph',content:{text:'Synthetic presentation only.'},claims:[]}]), p_links: [], p_content_sha256: null, p_byte_length: null});
  const review = (token, r, act, basisReview = null) => rpc(token, 'review_artifact_revision_v1', {p_revision_id: r.revision_id, p_expected_fingerprint: r.manifest_fingerprint, p_act: act, p_block_id: null, p_note: 'Synthetic integrated review proof', p_self_approval_declared: false, p_command_id: randomUUID(), p_basis_review_id: basisReview});
  const release = async r => (await rpc(reviewer, 'read_artifact_revision_v1', {p_revision_id: r.revision_id})).release;
  const r1 = await write(owner, 'Synthetic unchanged recommendation.', 'synthetic-review-start');
  const approval = await review(reviewer, r1, 'approve');
  const r2 = await write(owner, 'Synthetic unchanged recommendation.', 'synthetic-review-layout');
  assert.notEqual(r1.revision_id, r2.revision_id);assert.equal(await release(r2), 'internal');
  const reaffirm = await rpc(reviewer, 'reaffirm_work_revision_v1', {p_work_id: f.workId, p_revision_id: r2.revision_id, p_expected_fingerprint: r2.manifest_fingerprint, p_basis_review_id: approval.reviewId, p_note: 'Synthetic cosmetic template change', p_declared: false, p_command_id: randomUUID()});
  assert.equal(await release(r2), 'released');assert(reaffirm);checked('cosmetic_revision_requires_explicit_reaffirm');
  await review(reviewer, r1, 'revoke_approval', approval.reviewId);assert.equal(await release(r2), 'internal');checked('base_revocation_invalidates_reaffirm_chain');
  const freshApproval = await review(reviewer, r2, 'approve');
  const r3 = await write(owner, 'Synthetic changed recommendation.', 'synthetic-review-material');
  await deny(() => review(reviewer, r3, 'reaffirm', freshApproval.reviewId), 'artifact_review_material_change');
  assert.equal(await release(r3), 'internal');await review(reviewer, r3, 'approve');assert.equal(await release(r3), 'released');checked('material_change_requires_new_human_act');
  const pending = await write(reviewer, 'Synthetic successor review pending.', 'synthetic-review-pending', `${subject}-pending`);
  await rpc(owner, 'set_capital_project_review_assignment_v1', {p_project_id: f.workId, p_user_id: f.ownerId, p_review_role: 'approver', p_assigned: true});
  const moved = await rpc(owner, 'reassign_pending_review_v1', {p_project_id: f.workId, p_from_user: f.reviewerId, p_to_user: f.ownerId, p_reason: 'Synthetic authorized review succession', p_command_id: randomUUID()});
  assert(moved.reviews.some(v => v.revisionId === pending.revision_id));
  const movedContext=await rpc(owner,'read_capital_project_review_context_v2',{p_project_id:f.workId});
  assert(!movedContext.members.find(v=>v.user_id===f.reviewerId).roles.includes('approver'));
  assert(movedContext.members.find(v=>v.user_id===f.ownerId).roles.includes('approver'));
  await review(owner, pending, 'approve');
  const oldHistory = await rpc(owner, 'read_artifact_revision_reviews_v1', {p_revision_id: r3.revision_id});
  assert(oldHistory.reviews.some(v => v.act === 'approve' && v.reviewerId === f.reviewerId));checked('reassignment_keeps_original_approval_author');
  const before = effects();
  const report = await rpc(owner, 'record_work_report_v1', {p_work_id: f.workId, p_key: `${subject}-report`, p_report: {decidedBy: 'Synthetic committee', forum: 'Synthetic meeting', decidedOn: '2026-10-02', evidenceSourceVersionId: null}, p_note: 'Synthetic reported decision; no external action.', p_command_id: randomUUID()});
  const reported = await rpc(owner, 'read_work_decision_v1', {p_decision_id: report.decisionId});
  assert.equal(reported.decision.origin, 'reported');assert.deepEqual(reported.decision.effects, ['none']);assert.deepEqual(effects(), before);checked('reported_decision_creates_no_job_publication_or_introduction');
  const evidence = {schemaVersion: 'stage20-integrated-review-eval.v1', target, synthetic: true, organizationId: f.organizationId, workId: f.workId, revisionId: f.revisionId, proof, cleanup: {state: 'integrator_required', owner: f.cleanupOwner, preserveImmutableEvidence: true, archiveWorkId: f.workId, revokeIdentityIds: [f.ownerId, f.reviewerId], purgeRetainedPayloadIds: [f.retainedPayloadId], instructions: 'Use current work archival, access/identity revocation and physical purge contracts. Verify denied reads and authenticated physical absence. Never delete audit/review history or disable guards.'}};
  assert(env.REVIEW_EVAL_OUTPUT, 'private evidence output required');writeFileSync(env.REVIEW_EVAL_OUTPUT, JSON.stringify(evidence, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  console.log(`stage20_integrated_review: ${proof.length} PASS; cleanup remains required`);
  return evidence;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(e => {console.error(`stage20_integrated_review: FAIL phase=${phase} code=${/^[A-Z0-9]{5}$/.test(e.code??'')?e.code:'unavailable'} (raw error withheld)`);process.exitCode = 1;});
}
