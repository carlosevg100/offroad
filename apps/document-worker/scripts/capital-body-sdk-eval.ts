/** Actual authenticated SDK + gateway + body adapter eval, isolated synthetic fixture only. */
import {readFile, lstat, realpath, writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {relative, isAbsolute} from "node:path";
import assert from "node:assert/strict";
import {z} from "zod";
import {createClient} from "@supabase/supabase-js";
import {originationSeniorReadoutSchema} from "@offroad/domain-contracts";
import {createModelGateway, legacyGatewayFingerprint, type AdapterResponse} from "@offroad/model-gateway";
import {createCapitalBodyRetention} from "../src/capital-body-retention";
const PRODUCTION = "ifnogpksgdadruooqydi", STAGING = "gjkkjtbfnssdsbmlhmwk";
const fixtureSchema = z.object({environment: z.enum(["local", "staging"]), projectRef: z.string().min(1), apiUrl: z.url(), publishableKey: z.string().min(1),
  organizationId: z.uuid(), actorId: z.uuid(), email: z.email(), password: z.string().min(1),
  sourceVersionId: z.uuid(), jobs: z.object({baseline: z.object({jobId: z.uuid(), workId: z.uuid(), capabilityToken: z.string().min(1)})}),
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
    jobs: {baseline: {jobId: randomUUID(), workId: randomUUID(), capabilityToken: "synthetic-not-a-capability"}}};
  validate(fixture);
  for (const invalid of [{...fixture, apiUrl: `https://${PRODUCTION}.supabase.co`}, {...fixture, apiUrl: "https://example.test"}, {...fixture, publishableKey: "sb_secret_forbidden"}, {...fixture, apiUrl: "http://127.0.0.1:54321/?token=forbidden"}]) assert.throws(() => validate(invalid));
  const parsed = syntheticOutput(); assert.equal(originationSeniorReadoutSchema.safeParse(parsed).success, true);
  process.stdout.write("capital_body_sdk_static_self_test: PASS (target/key/schema; no SQL/SDK HTTP executed)\n");
}
async function main() {
  if (process.argv.slice(2).join(" ") === "--self-test") return selfTest();
  const path = process.env.OFFROAD_BODY_STORAGE_FIXTURE_FILE; if (!path) throw new Error("fixture required");
  const {fixture: f, raw, canonical} = await loadFixture(path);
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
  const login = await sdk.auth.signInWithPassword({email: f.email, password: f.password});
  if (login.error || login.data.user?.id !== f.actorId) throw new Error("wrong fixture actor");
  const auth = {jobId: job.jobId, capabilityToken: job.capabilityToken};
  const body = createCapitalBodyRetention(sdk, auth);
  const revision = randomUUID(), contributionRequestId = randomUUID();
  const human = await sdk.rpc("submit_work_contribution_v1", {p_work_id: job.workId, p_contribution_id: randomUUID(), p_revision_id: revision,
    p_expected_revision_id: null, p_base_revision_id: null, p_content: "Synthetic SDK body: ação € 漢字 🧮", p_source_version_ids: [f.sourceVersionId]});
  if (human.error || human.data?.revisionId !== revision) throw new Error("human contribution denied");
  const contribution = await body.retainContribution(revision, contributionRequestId);
  const replay = await body.retainContribution(revision, contributionRequestId);
  assert.equal(contribution.retention.retainedPayloadId, replay.retention.retainedPayloadId);
  const exactParent = await body.readOriginal(contribution.retention.retainedPayloadId!, contribution.retention);
  let syntheticDispatches = 0;
  const gateway = createModelGateway({adapters: {anthropic: {provider: "anthropic", async complete(request): Promise<AdapterResponse> {
    syntheticDispatches++; assert.equal(request.input[0]?.type, "text");
    if (request.input[0]?.type === "text") assert.equal(request.input[0].text, new TextDecoder("utf-8", {fatal: true}).decode(exactParent.bytes));
    return {output: structuredClone(output), rawText: "synthetic adapter only", model: request.model, usage: {inputTokens: 1, outputTokens: 1, cachedInputTokens: 0}, stopReason: "end"};
  }}}, attestInput: async a => {
    const r = await sdk.rpc("worker_record_capital_body_input_v1", {p_job_id: job.jobId, p_capability_token: job.capabilityToken,
      p_invocation_id: a.invocationId, p_adapter_request_fingerprint: a.requestFingerprint, p_input_fingerprint: a.inputFingerprint, p_prompt_fingerprint: a.promptFingerprint,
      p_provider: a.provider, p_model: a.model, p_components: [{kind: "retained_payload", id: contribution.retention.retainedPayloadId}],
      p_retry_ordinal: a.retryOrdinal, p_is_same_model_repair: a.isSameModelRepair, p_used_provider_fallback: a.usedProviderFallback, p_previous_invocation_id: a.previousInvocationId ?? null});
    if (r.error) throw new Error("input admission denied");
    return z.strictObject({receiptId: z.uuid(), invocationId: z.uuid(), requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/)}).parse(r.data);
  }});
  const result = await gateway.complete({task: "preliminary_understanding", requireInputAttestation: true, system: "Synthetic SDK protocol evaluation only.",
    input: [{type: "text", text: new TextDecoder("utf-8", {fatal: true}).decode(exactParent.bytes)}], schema: originationSeniorReadoutSchema,
    schemaName: "origination_senior_readout_v2", maxOutputTokens: 1000, allowFallback: false});
  assert.equal(syntheticDispatches, 1); assert.ok(result.acceptedInvocation?.inputAttestationReceiptId); assert.equal(result.acceptedInvocation?.fromCassette, false);
  const acceptedRequestId = randomUUID(); const accepted = await body.retainAccepted(result, acceptedRequestId);
  assert.equal(legacyGatewayFingerprint(accepted.body), result.acceptedInvocation?.outputFingerprint);
  const acceptedReplay = await body.retainAccepted(result, acceptedRequestId);
  assert.equal(accepted.retention.retainedPayloadId, acceptedReplay.retention.retainedPayloadId); assert.equal(syntheticDispatches, 1);
  await body.readOriginal(accepted.retention.retainedPayloadId!, accepted.retention);
  const wrong = createCapitalBodyRetention(sdk, {...auth, capabilityToken: "intentionally-invalid-synthetic-capability"});
  await assert.rejects(wrong.readOriginal(accepted.retention.retainedPayloadId!), {message: "capital_body_adapter_denied"});
  process.stdout.write(JSON.stringify({eval: "capital_body_sdk", result: "PASS", runtime: process.version,
    checks: ["authenticated-sdk", "human-contribution", "canonical-roundtrip", "concrete-gateway-input-receipt", "parsed-output-bound", "original-job-read", "request-replay-no-model-redispatch", "wrong-capability-denied"],
    providerEgress: "NOT_EVALUATED_SYNTHETIC_ADAPTER", physicalFingerprints: [contribution.retention.payloadFingerprint, accepted.retention.payloadFingerprint]}) + "\n");
}
main().catch(() => {process.stderr.write("capital_body_sdk_eval_failed; fixture cleanup required\n"); process.exitCode = 1;});
