/** Actual authenticated SDK + gateway + body adapter eval, isolated synthetic fixture only. */
import {readFile, lstat, realpath, writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {relative, isAbsolute} from "node:path";
import assert from "node:assert/strict";
import {z} from "zod";
import {createClient} from "@supabase/supabase-js";
import {originationSeniorReadoutSchema} from "@offroad/domain-contracts";
import {legacyGatewayFingerprint, type AdapterResponse} from "@offroad/model-gateway";
import {createCapitalBodyRetention} from "../src/capital-body-retention";
import {createCapitalBodyProcessingAuthority} from "../src/capital-body-processing";
import {providerConnectionsSchema} from "../src/provider-processing";
const diagnosticPhases = ["startup", "fixture", "synthetic_output", "login", "human_contribution", "contribution_retain", "contribution_replay", "contribution_read", "processing_denied_primary", "processing_assertions", "accepted_retain", "accepted_replay", "accepted_read", "factory_reset_negative", "second_contribution", "processing_sent_primary", "second_processing_assertions", "second_accepted_retain", "second_accepted_read", "wrong_capability_negative", "direct_storage_negative", "edge_scope_negative", "self_test"] as const;
type DiagnosticPhase = typeof diagnosticPhases[number];
let diagnosticPhase: DiagnosticPhase = "startup";
function markPhase(phase: DiagnosticPhase) {diagnosticPhase = phase;}
function safeFailureDiagnostic(error: unknown) {
  // Never render Error.message, cause, assertion values, SQL or arbitrary paths.
  // Only fixed source basenames and integer positions may leave this boundary.
  const locations: string[] = [];
  try {
    const stack = error instanceof Error ? error.stack : undefined;
    if (typeof stack === "string") for (const line of stack.split("\n").slice(1, 16)) {
      const match = /(?:\/|\\)(eval\.mjs|capital-body-sdk-eval\.ts|capital-body-processing\.ts|capital-body-retention\.ts|gateway\.ts|attempt-outcome\.ts):([1-9][0-9]{0,6}):([1-9][0-9]{0,6})\)?$/.exec(line);
      if (match) locations.push(`${match[1]}:${match[2]}:${match[3]}`);
      if (locations.length === 3) break;
    }
  } catch { /* An untrusted stack getter is not diagnostic authority. */ }
  return {eval: "capital_body_sdk", result: "FAIL", phase: diagnosticPhase, locations};
}
const PRODUCTION = "ifnogpksgdadruooqydi", STAGING = "gjkkjtbfnssdsbmlhmwk";
const fixtureSchema = z.object({environment: z.enum(["local", "staging"]), projectRef: z.string().min(1), apiUrl: z.url(), publishableKey: z.string().min(1),
  organizationId: z.uuid(), actorId: z.uuid(), email: z.email(), password: z.string().min(1),
  providerConnections: providerConnectionsSchema.optional(), providerAssuranceIds: z.array(z.uuid()).length(6).optional(),
  secondProviderConnections: providerConnectionsSchema.optional(), secondProviderAssuranceIds: z.array(z.uuid()).length(6).optional(),
  sourceVersionId: z.uuid(), jobs: z.object({baseline: z.object({jobId: z.uuid(), workId: z.uuid(), capabilityToken: z.string().min(1)}), expired: z.object({jobId: z.uuid(), workId: z.uuid(), capabilityToken: z.string().min(1)})}),
}).passthrough();
type Fixture = z.infer<typeof fixtureSchema>;
function validate(f: Fixture) {
  const url = new URL(f.apiUrl);
  if (f.projectRef === PRODUCTION || f.apiUrl.includes(PRODUCTION) || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) throw new Error("forbidden target");
  if (f.environment === "local") {
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("nonlocal target");
  } else if (f.projectRef !== STAGING || process.env.OFFROAD_STAGING_PROJECT_REF !== STAGING || url.protocol !== "https:" || url.hostname !== `${STAGING}.supabase.co`) throw new Error("staging allowlist required");
  if (!f.publishableKey.startsWith("sb_publishable_")) {
    const claims: unknown = JSON.parse(Buffer.from(f.publishableKey.split(".")[1] ?? "", "base64url").toString("utf8"));
    if (!claims || typeof claims !== "object" || !("role" in claims) || claims.role !== "anon") throw new Error("privileged key forbidden");
  }
}
type FixtureSchema = {const?: unknown; enum?: unknown[]; anyOf?: FixtureSchema[]; type?: string; required?: string[]; properties?: Record<string, FixtureSchema>; items?: FixtureSchema; minItems?: number; format?: string; pattern?: string; minLength?: number; minimum?: number};
function synthetic(s: FixtureSchema): unknown {
  if (s.const !== undefined) return s.const;
  if (s.enum) return s.enum[0];
  if (s.anyOf) return synthetic(s.anyOf.find(x => x.type !== "null") ?? s.anyOf[0]!);
  if (s.type === "object") return Object.fromEntries((s.required ?? []).map(key => [key, synthetic(s.properties![key]!)]));
  if (s.type === "array") return Array.from({length: s.minItems ?? 0}, () => synthetic(s.items!));
  if (s.type === "string") return s.format === "uri" ? "https://example.test/synthetic" : s.pattern ? "assumption_1" : "x".repeat(Math.max(1, s.minLength ?? 1));
  if (s.type === "integer" || s.type === "number") return s.minimum ?? 0;
  if (s.type === "boolean") return true;
  if (s.type === "null") return null;
  throw new Error("unsupported fixture schema");
}
function syntheticOutput() {return originationSeniorReadoutSchema.parse(synthetic(z.toJSONSchema(originationSeniorReadoutSchema) as FixtureSchema));}
async function loadFixture(path: string) {
  const stat = await lstat(path), canonical = await realpath(path);
  const repository = process.env.OFFROAD_REPOSITORY_ROOT; if (!repository) throw new Error("repository context required");
  const rel = relative(repository, canonical);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 || (!rel.startsWith("..") && !isAbsolute(rel))) throw new Error("private fixture outside checkout required");
  const raw = JSON.parse(await readFile(canonical, "utf8")); const fixture = fixtureSchema.parse(raw); validate(fixture);
  return {fixture, canonical, raw};
}
async function selfTest() {
  const fixture: Fixture = {environment: "local", projectRef: "local", apiUrl: "http://127.0.0.1:54321", publishableKey: "sb_publishable_synthetic",
    organizationId: randomUUID(), actorId: randomUUID(), email: "synthetic@example.test", password: "synthetic-not-a-credential", sourceVersionId: randomUUID(),
    jobs: {baseline: {jobId: randomUUID(), workId: randomUUID(), capabilityToken: "synthetic-not-a-capability"}, expired: {jobId: randomUUID(), workId: randomUUID(), capabilityToken: "synthetic-other-live-job-capability"}}};
  validate(fixture);
  for (const invalid of [{...fixture, apiUrl: `https://${PRODUCTION}.supabase.co`}, {...fixture, apiUrl: "https://example.test"}, {...fixture, publishableKey: "sb_secret_forbidden"}, {...fixture, apiUrl: "http://127.0.0.1:54321/?token=forbidden"}]) assert.throws(() => validate(invalid));
  const parsed = syntheticOutput(); assert.equal(originationSeniorReadoutSchema.safeParse(parsed).success, true);
  const malicious = new Error("PRIVATE_TOKEN SQL_BODY fixture_secret");
  malicious.stack = "PRIVATE_TOKEN SQL_BODY\n    at privateUser (/secret/private/capital-body-processing.ts:42:7)\n    at privateUser (/secret/token.ts:43:8)";
  const safe = JSON.stringify(safeFailureDiagnostic(malicious));
  assert.deepEqual(safeFailureDiagnostic(malicious).locations, ["capital-body-processing.ts:42:7"]);
  for (const secret of ["PRIVATE_TOKEN", "SQL_BODY", "fixture_secret", "/secret", "privateUser", "token.ts"]) assert.equal(safe.includes(secret), false);
  assert.deepEqual(safeFailureDiagnostic({stack: malicious.stack}).locations, []);
  const accessor = new Error(); Object.defineProperty(accessor, "stack", {get() {throw malicious;}});
  assert.deepEqual(safeFailureDiagnostic(accessor).locations, []);
  process.stdout.write("capital_body_sdk_static_self_test: PASS (target/key/schema; no SQL/SDK HTTP executed)\n");
}
async function main() {
  if (process.argv.slice(2).join(" ") === "--self-test") {markPhase("self_test"); return selfTest();}
  const path = process.env.OFFROAD_BODY_STORAGE_FIXTURE_FILE; if (!path) throw new Error("fixture required");
  markPhase("fixture");
  const {fixture: f, raw, canonical} = await loadFixture(path);
  markPhase("synthetic_output");
  const output = syntheticOutput();
  if (process.argv.slice(2).join(" ") === "--write-accepted-fixture") {
    await writeFile(canonical, JSON.stringify({...raw, acceptedOutput: output, acceptedOutputFingerprint: legacyGatewayFingerprint(output)}), {mode: 0o600});
    process.stdout.write("capital_body_sdk_synthetic_output_fixture: PREPARED (no gateway or provider call)\n"); return;
  }
  if (process.argv.length !== 2) throw new Error("unsupported arguments");
  const job = f.jobs.baseline;
  const sdk = createClient(f.apiUrl, f.publishableKey, {global: {headers: {"x-offroad-workspace": f.organizationId,
    "x-offroad-job-id": job.jobId, "x-offroad-capability": job.capabilityToken}, fetch: (input, init) => fetch(input, {...init, redirect: "error"})},
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}});
  markPhase("login");
  const login = await sdk.auth.signInWithPassword({email: f.email, password: f.password});
  if (login.error || login.data.user?.id !== f.actorId) throw new Error("wrong fixture actor");
  const auth = {jobId: job.jobId, capabilityToken: job.capabilityToken};
  const connection = {supabaseUrl: f.apiUrl, publishableKey: f.publishableKey, organizationId: f.organizationId,
    accessToken: async () => (await sdk.auth.getSession()).data.session?.access_token ?? null};
  const body = createCapitalBodyRetention(connection, auth);
  const revision = randomUUID(), contributionRequestId = randomUUID();
  markPhase("human_contribution");
  const human = await sdk.rpc("submit_work_contribution_v1", {p_work_id: job.workId, p_contribution_id: randomUUID(), p_revision_id: revision,
    p_expected_revision_id: null, p_base_revision_id: null, p_content: "Synthetic SDK body: ação € 漢字 🧮", p_source_version_ids: [f.sourceVersionId]});
  if (human.error || human.data?.revisionId !== revision) throw new Error("human contribution denied");
  markPhase("contribution_retain");
  const contribution = await body.retainContribution(revision, contributionRequestId);
  markPhase("contribution_replay");
  const replay = await body.retainContribution(revision, contributionRequestId);
  assert.equal(contribution.retention.retainedPayloadId, replay.retention.retainedPayloadId);
  markPhase("contribution_read");
  const exactParent = await body.readOriginal(contribution.retention.retainedPayloadId!, contribution.retention);
  if (!f.providerConnections?.anthropic || !f.providerConnections.openai || f.providerAssuranceIds?.length !== 6) throw new Error("reviewed provider fixture required");
  let syntheticDispatches = 0, primaryDispatches = 0;
  const primaryAdapter = {provider: "anthropic" as const, async complete(): Promise<AdapterResponse> {
    primaryDispatches++; throw new Error("SQL denied primary was dispatched");
  }};
  const fallbackAdapter = {provider: "openai" as const, async complete(request: import("@offroad/model-gateway").AdapterRequest): Promise<AdapterResponse> {
    syntheticDispatches++; assert.equal(request.input[0]?.type, "text");
    if (request.input[0]?.type === "text") assert.equal(request.input[0].text, new TextDecoder("utf-8", {fatal: true}).decode(exactParent.bytes));
    return {output: structuredClone(output), rawText: "synthetic adapter only", model: request.model, usage: {inputTokens: 1, outputTokens: 1, cachedInputTokens: 0}, stopReason: "end"};
  }};
  const observed: import("@offroad/model-gateway").GatewayCallLog[] = [];
  const processing = createCapitalBodyProcessingAuthority({supabase: sdk, body, authority: auth, connections: f.providerConnections,
    adapters: {anthropic: primaryAdapter, openai: fallbackAdapter}, onCall: call => observed.push(call)});
  markPhase("processing_denied_primary");
  const {result} = await processing.run({contributionRevisionId: revision, retentionRequestId: contributionRequestId});
  markPhase("processing_assertions");
  assert.ok(result.attemptOutcomeReceipt);
  assert.equal(result.attemptOutcomeReceipt.invocationId, result.acceptedInvocation?.invocationId);
  assert.equal(result.attemptOutcomeReceipt.requestFingerprint, result.acceptedInvocation?.adapterRequestFingerprint);
  assert.equal(result.attemptOutcomeReceipt.outcome, "accepted");
  assert.ok(Object.isFrozen(result.attemptOutcomeReceipt));
  assert.equal(primaryDispatches, 0); assert.equal(syntheticDispatches, 1);
  assert.equal(observed.length, 2); assert.equal(observed[0]?.outcome, "policy_rejected"); assert.equal(observed[0]?.costStatus, "not_called");
  assert.ok(observed[0]?.processingDecisionId); assert.equal(observed[0]?.inputAttestationReceiptId, undefined);
  assert.equal(observed[1]?.previousInvocationId, observed[0]?.invocationId); assert.ok(observed[1]?.processingDecisionId);
  assert.notEqual(observed[0]?.processingDecisionId, observed[1]?.processingDecisionId); assert.ok(observed[1]?.inputAttestationReceiptId);
  assert.equal(result.acceptedInvocation?.invocationId, observed[1]?.invocationId); assert.equal(result.provider, "openai");
  assert.equal(syntheticDispatches, 1); assert.ok(result.acceptedInvocation?.inputAttestationReceiptId); assert.equal(result.acceptedInvocation?.fromCassette, false);
  markPhase("accepted_retain");
  const acceptedRequestId = randomUUID(); const accepted = await body.retainAccepted(result, acceptedRequestId);
  assert.equal(legacyGatewayFingerprint(accepted.body), result.acceptedInvocation?.outputFingerprint);
  markPhase("accepted_replay");
  const acceptedReplay = await body.retainAccepted(result, acceptedRequestId);
  assert.equal(accepted.retention.retainedPayloadId, acceptedReplay.retention.retainedPayloadId); assert.equal(syntheticDispatches, 1);
  markPhase("accepted_read");
  await body.readOriginal(accepted.retention.retainedPayloadId!, accepted.retention);
  // A new factory is not a new budget owner for the same legitimate origin.
  const reset = createCapitalBodyProcessingAuthority({supabase: sdk, body, authority: auth, connections: f.providerConnections,
    adapters: {anthropic: primaryAdapter, openai: fallbackAdapter}});
  markPhase("factory_reset_negative");
  await assert.rejects(reset.run({contributionRevisionId: revision, retentionRequestId: contributionRequestId}), {message: "capital_body_processing_denied"});
  assert.equal(primaryDispatches, 0); assert.equal(syntheticDispatches, 1);
  if (!f.secondProviderConnections?.anthropic || !f.secondProviderConnections.openai || f.secondProviderAssuranceIds?.length !== 6) throw new Error("second reviewed provider fixture required");
  const secondRevision = randomUUID(), secondRetentionRequest = randomUUID();
  markPhase("second_contribution");
  const secondHuman = await sdk.rpc("submit_work_contribution_v1", {p_work_id: job.workId, p_contribution_id: randomUUID(), p_revision_id: secondRevision,
    p_expected_revision_id: null, p_base_revision_id: null, p_content: "Synthetic second authorized origin: ação € 漢字", p_source_version_ids: [f.sourceVersionId]});
  if (secondHuman.error || secondHuman.data?.revisionId !== secondRevision) throw new Error("second human contribution denied");
  let secondPrimarySends = 0, secondFallbackSends = 0;
  const secondLogs: import("@offroad/model-gateway").GatewayCallLog[] = [];
  const second = createCapitalBodyProcessingAuthority({supabase: sdk, body, authority: auth, connections: f.secondProviderConnections,
    adapters: {anthropic: {provider: "anthropic", async complete(): Promise<AdapterResponse> {secondPrimarySends++; throw new Error("synthetic transport failure");}},
      openai: {provider: "openai", async complete(request): Promise<AdapterResponse> {secondFallbackSends++; return {output: structuredClone(output), rawText: "synthetic adapter only", model: request.model,
        usage: {inputTokens: 1, outputTokens: 1, cachedInputTokens: 0}, stopReason: "end"};}}}, onCall: call => secondLogs.push(call)});
  markPhase("processing_sent_primary");
  const secondResult = (await second.run({contributionRevisionId: secondRevision, retentionRequestId: secondRetentionRequest})).result;
  markPhase("second_processing_assertions");
  assert.equal(secondPrimarySends, 1); assert.equal(secondFallbackSends, 1);
  assert.deepEqual(secondLogs.map(log => log.outcome), ["error", "ok"]);
  assert.equal(secondLogs[0]?.costStatus, "unknown"); assert.ok(secondLogs[0]?.inputAttestationReceiptId);
  assert.equal(secondLogs[1]?.previousInvocationId, secondLogs[0]?.invocationId);
  assert.ok(secondResult.attemptOutcomeReceipt); assert.equal(secondResult.attemptOutcomeReceipt.invocationId, secondResult.acceptedInvocation?.invocationId);
  assert.equal(secondResult.attemptOutcomeReceipt.outcome, "accepted");
  markPhase("second_accepted_retain");
  const secondAccepted = await body.retainAccepted(secondResult, randomUUID());
  markPhase("second_accepted_read");
  await body.readOriginal(secondAccepted.retention.retainedPayloadId!, secondAccepted.retention);
  const wrong = createCapitalBodyRetention(connection, {...auth, capabilityToken: "intentionally-invalid-synthetic-capability"});
  markPhase("wrong_capability_negative");
  await assert.rejects(wrong.readOriginal(accepted.retention.retainedPayloadId!), {message: "capital_body_adapter_denied"});
  // These deliberately use the public SDK directly. RPC denial alone cannot
  // prove Storage enforces capability and original-job request context.
  for (const [index, headers] of [
    {"x-offroad-workspace": f.organizationId, "x-offroad-job-id": job.jobId, "x-offroad-capability": job.capabilityToken},
    {"x-offroad-workspace": f.organizationId},
    {"x-offroad-workspace": f.organizationId, "x-offroad-job-id": job.jobId, "x-offroad-capability": "intentionally-invalid-synthetic-capability"},
    {"x-offroad-workspace": f.organizationId, "x-offroad-job-id": f.jobs.expired.jobId, "x-offroad-capability": f.jobs.expired.capabilityToken},
    {"x-offroad-workspace": f.organizationId, "x-offroad-job-id": randomUUID(), "x-offroad-capability": job.capabilityToken},
  ].entries()) {
    const raw = createClient(f.apiUrl, f.publishableKey, {accessToken: connection.accessToken,
      global: {headers, fetch: (input, init) => fetch(input, {...init, redirect: "error"})},
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}});
    markPhase("direct_storage_negative");
    const denied = await raw.storage.from(accepted.retention.bucket).download(accepted.retention.path,
      {versionId: accepted.retention.storageVersion!, cacheNonce: randomUUID()}, {cache: "no-store"});
    assert.ok(denied.error); assert.equal(denied.data, null);
    const deniedInfo = await raw.storage.from(accepted.retention.bucket).info(accepted.retention.path);
    assert.ok(deniedInfo.error); assert.equal(deniedInfo.data, null);
    // The Edge URL is exactly the same for correct then wrong scopes. POST must
    // authorize every request; fresh Storage nonce cannot mask a CDN shortcut.
    markPhase("edge_scope_negative");
    const posted = await raw.functions.invoke("capital-body-read", {method: "POST", body: {allocationId: accepted.retention.allocationId, kind: "typed_body"}});
    if (index === 0) {assert.equal(posted.error, null); assert.ok(posted.data instanceof Blob); assert.equal(posted.data.size, accepted.retention.byteLength);}
    else {assert.ok(posted.error); assert.equal(posted.data, null); assert.equal(posted.response?.status, 403);}
  }
  process.stdout.write(JSON.stringify({eval: "capital_body_sdk", result: "PASS", runtime: process.version,
    checks: ["authenticated-sdk", "human-contribution", "canonical-roundtrip", "concrete-gateway-input-receipt", "sql-denied-primary-no-dispatch", "allowed-fallback-ledger-and-input-v3", "closed-renderer-source-parity", "accepted-outcome-receipt", "sent-primary-outcome-before-fallback", "durable-operation-factory-reset-denied", "parsed-output-bound", "original-job-read", "request-replay-no-model-redispatch", "wrong-capability-denied", "storage-worker-direct-read-denied", "edge-same-url-rechecks-authority", "storage-missing-headers-denied", "storage-wrong-capability-denied", "storage-other-live-job-denied", "storage-wrong-job-denied"],
    providerEgress: "NOT_EVALUATED_SYNTHETIC_ADAPTER", physicalFingerprints: [contribution.retention.payloadFingerprint, accepted.retention.payloadFingerprint]}) + "\n");
}
main().catch(error => {process.stderr.write(JSON.stringify(safeFailureDiagnostic(error)) + "\ncapital_body_sdk_eval_failed; fixture cleanup required\n"); process.exitCode = 1;});
