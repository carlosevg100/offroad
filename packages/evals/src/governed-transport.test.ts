import {createHash} from "node:crypto";

import {executionCanonicalText, governedEvaluationContractSchema, type GovernedEvaluationContract} from "@offroad/agent-contracts";
import {modelGatewayVersion} from "@offroad/model-gateway";
import type {SupabaseClient} from "@supabase/supabase-js";
import {describe, expect, it, vi} from "vitest";

import {
  composeGovernedEvaluation,
  governedEvaluationEvidence,
  GovernedTransportError,
  readGovernedTransportEnvironment,
  requestGovernedEvaluation,
  type GovernedEvaluationSpec,
  type GovernedTransportEnvironment,
  type GovernedTransportOptions,
} from "./governed-transport";

/**
 * The governed transport client against a stubbed Supabase client: the session sign-in, the
 * request and read wrappers, and the database answers the client must read. Everything here is
 * synthetic, and no provider key exists in any environment these tests build.
 */
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const evaluator = "e5a10000-0000-4000-8000-000000000003";
const organization = "e5a10000-0000-4000-9000-000000000001";
const environment: GovernedTransportEnvironment = {
  supabaseUrl: "http://127.0.0.1:54321",
  publishableKey: "synthetic-publishable-key",
  evaluatorEmail: "evaluator@example.invalid",
  evaluatorPassword: "Synthetic-Evaluator-Password!",
  organizationId: organization,
};
const clock = Date.parse("2026-09-24T10:00:00.000Z");
const snapshot = {schemaVersion: "synthetic-snapshot.v1", turns: ["Pergunta sintética"], documents: [{sha256: "b".repeat(64), text: "Texto sintético"}]};
const spec = (extra: Partial<GovernedEvaluationSpec> = {}): GovernedEvaluationSpec => ({
  audience: {caseId: "gc01-synthetic", caseVersion: "1.0", scriptId: "run-gold-baseline"},
  routes: [{provider: "anthropic", model: "claude-opus-5"}, {provider: "openai", model: "gpt-5.6-sol"}, {provider: "anthropic", model: "claude-opus-5"}],
  budget: {maxCostMicrousd: 50_000_000, maxModelCalls: 4, maxDurationMs: 600_000, expiresInMs: 3_600_000},
  snapshot,
  sourceContentHashes: ["c".repeat(64), "b".repeat(64), "c".repeat(64)],
  ...extra,
});

type Rpc = {data: unknown; error: {message?: string; code?: string; details?: string} | null};
type Call = {name: string; args: Record<string, unknown>};
/** The read the database returns for the contract a request carried, pending unless told otherwise. */
function readOf(contractText: string, snapshotText: string, extra: Record<string, unknown> = {}) {
  const contract = JSON.parse(contractText) as GovernedEvaluationContract;
  return {
    schemaVersion: "governed-evaluation-read.v1", executionId: contract.executionId, organizationId: contract.organizationId, requestId: contract.requestId,
    processingRunId: contract.processingRunId, requestedBy: evaluator, createdAt: "2026-09-24T10:00:01.123456+00:00",
    contractFingerprint: sha(contractText), inputFingerprint: sha(snapshotText), audience: contract.audience, budget: contract.budget,
    state: {job: "queued", attempts: 0, lastErrorCode: null, run: "queued", completedAt: null},
    outcome: null, reason: null, result: null, receipts: [], decisions: [],
    cost: {spentMicrousd: 0, reservedMicrousd: 0, spentCalls: 0, reservedCalls: 0, activeDurationMs: 0, exhausted: false}, totalCostMicrousd: 0,
    ...extra,
  };
}
const committed = (canonicalResult: string, outcome: string, reason: string) => ({
  outcome, reason, state: {job: "succeeded", attempts: 1, lastErrorCode: null, run: outcome, completedAt: "2026-09-24T10:02:00.000001+00:00"},
  result: {resultFingerprint: sha(canonicalResult), canonicalResult, committedAt: "2026-09-24T10:02:00.000001+00:00"},
});
const succeeded = executionCanonicalText({schemaVersion: "synthetic-result.v1", outputs: [{deliverable: "Entrega sintética"}]});
const receipt = {operationId: "e5a10000-0000-4000-8000-0000000000a1", toolId: "provider:anthropic:claude-opus-5", toolVersion: modelGatewayVersion,
  route: {provider: "anthropic", model: "claude-opus-5", accountRef: "synthetic-account", projectRef: "synthetic-project", credentialBinding: "synthetic-binding",
    endpoint: "https://api.anthropic.com/v1/messages", region: "global"},
  resources: ["inference", "prompt_cache", "schema_cache"], decisionId: "e5a10000-0000-4000-8000-0000000000b1", state: "settled",
  reservedMicrousd: 40_000_000, reservedCalls: 1, spentMicrousd: 19_500, spentCalls: 1, createdAt: "2026-09-24T10:01:00.000001+00:00"};

/**
 * A stubbed Supabase client. The request answer defaults to a fresh creation of what was sent; the
 * reads answer from `reads`, called with the request the client made and the read count.
 */
function stub(behaviour: {
  request?: (args: Record<string, unknown>, attempt: number) => Rpc | Promise<Rpc>;
  reads?: (sent: {contractText: string; snapshotText: string}, read: number, executionId: string) => Rpc | Promise<Rpc>;
  signIn?: () => Promise<unknown>;
} = {}) {
  const calls: Call[] = [];
  let sent = {contractText: "", snapshotText: ""};
  let requests = 0, reads = 0;
  const answer = async (name: string, args: Record<string, unknown>): Promise<Rpc> => {
    if (name === "request_governed_evaluation_session_v1") {
      requests += 1;
      sent = {contractText: String(args.p_contract_text), snapshotText: String(args.p_snapshot_text)};
      if (behaviour.request) return behaviour.request(args, requests);
      const contract = JSON.parse(sent.contractText) as GovernedEvaluationContract;
      return {data: {executionId: contract.executionId, processingRunId: contract.processingRunId, requestId: contract.requestId,
        jobId: "e5a10000-0000-4000-8000-0000000000c1", replayed: false}, error: null};
    }
    if (name === "read_governed_evaluation_session_v1") {
      reads += 1;
      if (behaviour.reads) return behaviour.reads(sent, reads, String(args.p_execution_id));
      return {data: readOf(sent.contractText, sent.snapshotText, reads === 1 ? {} : committed(succeeded, "succeeded", "evaluated")), error: null};
    }
    return {data: null, error: {message: "unexpected_rpc"}};
  };
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    calls.push({name, args});
    return {abortSignal: (signal: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return answer(name, args);
    }};
  });
  const signInWithPassword = vi.fn(behaviour.signIn ?? (async () => ({data: {user: {id: evaluator}, session: {}}, error: null})));
  const connect = vi.fn(() => ({rpc, auth: {signInWithPassword}}) as unknown as SupabaseClient);
  return {connect, rpc, signInWithPassword, calls};
}

/** A clock that only moves when the client sleeps. */
function options(s: ReturnType<typeof stub>, extra: Partial<GovernedTransportOptions> = {}): GovernedTransportOptions & {sleeps: number[]} {
  let now = clock, id = 0;
  const sleeps: number[] = [];
  return {
    environment, connect: s.connect, pollIntervalMs: 1_000, now: () => now,
    sleep: async (ms) => { sleeps.push(ms); now += ms; },
    newId: () => `e5a10000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    sleeps, ...extra,
  };
}

const failure = async (work: Promise<unknown>) => {
  const error = await work.then(() => null, (thrown: unknown) => thrown);
  expect(error).toBeInstanceOf(GovernedTransportError);
  return error as GovernedTransportError;
};

describe("governed transport client", () => {
  it("builds a contract the schema accepts and sends canonical bytes through the evaluator's session", async () => {
    const s = stub();
    const progress: unknown[] = [];
    const result = await requestGovernedEvaluation(spec(), {...options(s), onProgress: (event) => progress.push(event)});

    expect(s.connect).toHaveBeenCalledWith(environment.supabaseUrl, environment.publishableKey);
    expect(s.signInWithPassword).toHaveBeenCalledWith({email: environment.evaluatorEmail, password: environment.evaluatorPassword});
    expect(s.calls.map((call) => call.name)).toEqual(["request_governed_evaluation_session_v1", "read_governed_evaluation_session_v1", "read_governed_evaluation_session_v1"]);
    const request = s.calls[0]!.args;
    expect(Object.keys(request).sort()).toEqual(["p_contract_text", "p_snapshot_text"]);
    const contractText = String(request.p_contract_text), snapshotText = String(request.p_snapshot_text);

    // Canonical bytes: sorted keys, no whitespace, and the same bytes whatever the key order given.
    const contract = JSON.parse(contractText) as unknown;
    expect(executionCanonicalText(contract)).toBe(contractText);
    expect(snapshotText).toBe(executionCanonicalText(snapshot));
    const reordered = {documents: snapshot.documents, turns: snapshot.turns, schemaVersion: snapshot.schemaVersion};
    expect(composeGovernedEvaluation(spec({snapshot: reordered}), {organizationId: organization, executionId: evaluator, requestId: evaluator, processingRunId: evaluator}, clock).snapshotText)
      .toBe(snapshotText);

    // The contract the database accepts: the evaluation organization, the panel, the declared routes
    // at the gateway version, the integer budget with its expiry, and hashes only for the inputs.
    expect(governedEvaluationContractSchema.parse(contract)).toEqual(contract);
    expect(contract).toEqual({
      schemaVersion: "governed-evaluation-contract.v1",
      executionId: "e5a10000-0000-4000-8000-000000000002", organizationId: organization, requestId: "e5a10000-0000-4000-8000-000000000001",
      processingRunId: "e5a10000-0000-4000-8000-000000000003", purpose: "evaluation",
      audience: {kind: "evaluation_panel", caseId: "gc01-synthetic", caseVersion: "1.0", scriptId: "run-gold-baseline"},
      tools: [{id: "provider:anthropic:claude-opus-5", version: modelGatewayVersion, effect: "read_only"}, {id: "provider:openai:gpt-5.6-sol", version: modelGatewayVersion, effect: "read_only"}],
      budget: {maxCostMicrousd: 50_000_000, maxModelCalls: 4, maxDurationMs: 600_000, expiresAt: "2026-09-24T11:00:00.000Z"},
      inputs: {fingerprint: sha(snapshotText), sources: [{contentHash: "b".repeat(64)}, {contentHash: "c".repeat(64)}]},
      requestedAt: "2026-09-24T09:59:30.000Z",
    });
    expect(contractText).not.toMatch(/Texto sintético|Pergunta sintética/);

    expect(s.calls.slice(1).map((call) => call.args)).toEqual([{p_execution_id: "e5a10000-0000-4000-8000-000000000002"}, {p_execution_id: "e5a10000-0000-4000-8000-000000000002"}]);
    expect(result).toMatchObject({executionId: "e5a10000-0000-4000-8000-000000000002", requestId: "e5a10000-0000-4000-8000-000000000001", request: "created",
      outcome: "succeeded", reason: "evaluated", canonicalResult: succeeded, resultFingerprint: sha(succeeded), contractFingerprint: sha(contractText), inputFingerprint: sha(snapshotText)});
    expect(result.result).toEqual(JSON.parse(succeeded));
    expect(progress).toEqual([{phase: "signed_in"}, {phase: "requested", executionId: "e5a10000-0000-4000-8000-000000000002", requestId: "e5a10000-0000-4000-8000-000000000001", request: "created"},
      {phase: "waiting", executionId: "e5a10000-0000-4000-8000-000000000002", job: "queued", run: "queued", attempts: 0}]);
  });

  it("refuses a contract the database would refuse before anything is sent", async () => {
    for (const altered of [
      spec({routes: []}),
      spec({routes: [{provider: "mistral", model: "large"}]}),
      spec({budget: {maxCostMicrousd: 1.5, maxModelCalls: 4, maxDurationMs: 600_000, expiresInMs: 3_600_000}}),
      spec({budget: {maxCostMicrousd: 1_000, maxModelCalls: 0, maxDurationMs: 600_000, expiresInMs: 3_600_000}}),
      spec({budget: {maxCostMicrousd: 1_000, maxModelCalls: 4, maxDurationMs: 600_000, expiresInMs: 0}}),
      spec({budget: {maxCostMicrousd: 1_000, maxModelCalls: 4, maxDurationMs: 600_000, expiresInMs: 59_999}}),
      spec({budget: {maxCostMicrousd: 1_000, maxModelCalls: 4, maxDurationMs: 999, expiresInMs: 3_600_000}}),
      spec({sourceContentHashes: ["https://example.invalid/source.pdf"]}),
      spec({audience: {caseId: " ", caseVersion: "1.0", scriptId: "run-gold-baseline"}}),
      spec({requestId: "E5A10000-0000-4000-8000-000000000001"}),
      spec({snapshot: {value: Number.NaN}}),
    ]) {
      const s = stub();
      expect((await failure(requestGovernedEvaluation(altered, options(s)))).code).toBe("evaluation_contract_invalid");
      expect(s.connect).not.toHaveBeenCalled();
    }
    // Four UTF-8 bytes per character: the database limit is counted in bytes, not in characters.
    const s = stub();
    expect((await failure(requestGovernedEvaluation(spec({snapshot: {text: "\u{1F600}".repeat(2_097_152)}}), options(s)))).code).toBe("evaluation_input_too_large");
    expect(s.connect).not.toHaveBeenCalled();
  });

  it("sends a request lost in transport again with the same bytes and accepts the replay", async () => {
    const s = stub({request: (args, attempt) => {
      if (attempt === 1) throw new Error("synthetic socket reset");
      const contract = JSON.parse(String(args.p_contract_text)) as GovernedEvaluationContract;
      return {data: {executionId: contract.executionId, processingRunId: contract.processingRunId, requestId: contract.requestId, jobId: null, replayed: true}, error: null};
    }});
    const o = options(s);
    const result = await requestGovernedEvaluation(spec(), o);
    const requests = s.calls.filter((call) => call.name === "request_governed_evaluation_session_v1").map((call) => call.args);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(result).toMatchObject({request: "replayed", outcome: "succeeded"});
    // A pause before the second attempt, then one poll interval before the committed read.
    expect(o.sleeps).toEqual([1_000, 1_000]);
  });

  it("follows the evaluation a reused request id already created, only when it carries the same inputs", async () => {
    const prior = "e5a10000-0000-4000-8000-0000000000f1";
    const conflict = {data: null, error: {code: "23505", message: "execution_request_conflict", details: prior}};
    // The earlier evaluation of this request: another contract (its own time and budget), the same inputs.
    const earlier = (sent: {contractText: string; snapshotText: string}, extra: Record<string, unknown> = {}) => {
      const contract = JSON.parse(sent.contractText) as GovernedEvaluationContract;
      const own = executionCanonicalText({...contract, executionId: prior, processingRunId: "e5a10000-0000-4000-8000-0000000000f2", requestedAt: "2026-09-24T08:00:00.000Z"});
      return readOf(own, sent.snapshotText, {...committed(succeeded, "succeeded", "evaluated"), ...extra});
    };
    const s = stub({request: () => conflict, reads: (sent, _read, executionId) => ({data: executionId === prior ? earlier(sent) : null, error: null})});
    const result = await requestGovernedEvaluation(spec({requestId: "e5a10000-0000-4000-8000-0000000000e1"}), options(s));
    expect(s.calls.filter((call) => call.name === "read_governed_evaluation_session_v1").map((call) => call.args)).toEqual([{p_execution_id: prior}]);
    expect(result).toMatchObject({executionId: prior, requestId: "e5a10000-0000-4000-8000-0000000000e1", request: "followed", outcome: "succeeded"});

    for (const extra of [{inputFingerprint: "d".repeat(64)}, {requestedBy: "e5a10000-0000-4000-8000-000000000004"},
      {audience: {kind: "evaluation_panel", caseId: "gc02-synthetic", caseVersion: "1.0", scriptId: "run-gold-baseline"}}]) {
      const other = stub({request: () => conflict, reads: (sent) => ({data: earlier(sent, extra), error: null})});
      expect((await failure(requestGovernedEvaluation(spec(), options(other)))).code).toBe("evaluation_request_conflict");
    }
    const unnamed = stub({request: () => ({data: null, error: {code: "23505", message: "execution_request_conflict", details: ""}})});
    expect((await failure(requestGovernedEvaluation(spec(), options(unnamed)))).code).toBe("evaluation_request_conflict");
    expect(unnamed.calls).toHaveLength(1);
  });

  it("surfaces a partial result with its reason, its denied decision and no spend", async () => {
    const marker = '{"reason":"transport_denied","status":"partial"}';
    const decision = {decisionId: "e5a10000-0000-4000-8000-0000000000b2", allowed: false, purpose: "evaluation", resources: ["inference", "prompt_cache", "schema_cache"],
      reasons: ["processing_resource_ineligible:inference"], createdAt: "2026-09-24T10:01:00.000001+00:00"};
    const s = stub({reads: (sent) => ({data: readOf(sent.contractText, sent.snapshotText, {...committed(marker, "partial", "transport_denied"), decisions: [decision]}), error: null})});
    const result = await requestGovernedEvaluation(spec(), options(s));
    expect(result).toMatchObject({outcome: "partial", reason: "transport_denied", canonicalResult: marker, receipts: [], decisions: [decision], totalCostMicrousd: 0});
    expect(result.result).toEqual({reason: "transport_denied", status: "partial"});
    expect(result.cost.spentMicrousd).toBe(0);
  });

  it("times out while the evaluation stays queued and names it for a later read or resume", async () => {
    const s = stub({reads: (sent) => ({data: readOf(sent.contractText, sent.snapshotText), error: null})});
    const o = options(s, {timeoutMs: 10_000, pollIntervalMs: 3_000});
    const error = await failure(requestGovernedEvaluation(spec(), o));
    expect(error.code).toBe("evaluation_result_timeout");
    expect(error.context).toEqual({executionId: "e5a10000-0000-4000-8000-000000000002", requestId: "e5a10000-0000-4000-8000-000000000001"});
    expect(error.message).toBe("evaluation_result_timeout: evaluation e5a10000-0000-4000-8000-000000000002; request e5a10000-0000-4000-8000-000000000001");
    // Never sleeps past the deadline, and reads once more when it arrives.
    expect(o.sleeps).toEqual([3_000, 3_000, 3_000, 1_000]);
    expect(s.calls.filter((call) => call.name === "read_governed_evaluation_session_v1")).toHaveLength(5);
  });

  it("waits by default until the budget expires, plus the grace for a worker to land the partial reason", async () => {
    const s = stub({reads: (sent) => ({data: readOf(sent.contractText, sent.snapshotText), error: null})});
    const o = options(s, {pollIntervalMs: 600_000});
    expect((await failure(requestGovernedEvaluation(spec(), o))).code).toBe("evaluation_result_timeout");
    expect(o.sleeps.reduce((total, ms) => total + ms, 0)).toBe(3_600_000 + 300_000);
  });

  it("stops at a job that ended without a result", async () => {
    const s = stub({reads: (sent) => ({data: readOf(sent.contractText, sent.snapshotText,
      {state: {job: "failed", attempts: 3, lastErrorCode: "evaluation_attempts_exhausted", run: "failed", completedAt: "2026-09-24T10:30:00+00:00"}}), error: null})});
    const error = await failure(requestGovernedEvaluation(spec(), options(s)));
    expect(error.code).toBe("evaluation_failed_without_result");
    expect(error.context.refusal).toBe("evaluation_attempts_exhausted");
  });

  it("refuses result bytes that are not their fingerprint's or not canonical, and a read of another evaluation", async () => {
    const tampered = stub({reads: (sent) => ({data: readOf(sent.contractText, sent.snapshotText,
      {...committed(succeeded, "succeeded", "evaluated"), result: {resultFingerprint: "e".repeat(64), canonicalResult: succeeded, committedAt: "2026-09-24T10:02:00+00:00"}}), error: null})});
    expect((await failure(requestGovernedEvaluation(spec(), options(tampered)))).code).toBe("evaluation_result_invalid");
    const spaced = '{"outputs": []}';
    const loose = stub({reads: (sent) => ({data: readOf(sent.contractText, sent.snapshotText, committed(spaced, "succeeded", "evaluated")), error: null})});
    expect((await failure(requestGovernedEvaluation(spec(), options(loose)))).code).toBe("evaluation_result_invalid");
    const mismatched = stub({reads: (sent) => ({data: readOf(sent.contractText, sent.snapshotText, {contractFingerprint: "f".repeat(64)}), error: null})});
    expect((await failure(requestGovernedEvaluation(spec(), options(mismatched)))).code).toBe("evaluation_read_mismatch");
    const extended = stub({reads: (sent) => ({data: {...readOf(sent.contractText, sent.snapshotText), providerKey: "synthetic"}, error: null})});
    expect((await failure(requestGovernedEvaluation(spec(), options(extended)))).code).toBe("evaluation_read_mismatch");
  });

  it("names database refusals by code, never retries them, and never carries remote text", async () => {
    const refused = stub({request: () => ({data: null, error: {code: "42501", message: "evaluation_organization_required"}})});
    const error = await failure(requestGovernedEvaluation(spec(), options(refused)));
    expect([error.code, error.context.refusal]).toEqual(["evaluation_request_refused", "evaluation_organization_required"]);
    expect(refused.calls).toHaveLength(1);

    const remote = stub({request: () => ({data: null, error: {code: "XX000", message: "private borrower detail", details: "private borrower detail"}})});
    const opaque = await failure(requestGovernedEvaluation(spec(), options(remote)));
    expect([opaque.code, opaque.context.refusal]).toEqual(["evaluation_transport_failed", "XX000"]);
    expect(opaque.message).not.toContain("private");
    expect(remote.calls).toHaveLength(1);

    const unreachable = stub({request: () => { throw new Error("synthetic socket reset"); }});
    const waits = options(unreachable);
    expect((await failure(requestGovernedEvaluation(spec(), waits))).code).toBe("evaluation_transport_failed");
    expect(unreachable.calls).toHaveLength(3);
    expect(waits.sleeps).toEqual([1_000, 2_000]);

    const revoked = stub({reads: () => ({data: null, error: {code: "42501", message: "evaluator_session_required"}})});
    const read = await failure(requestGovernedEvaluation(spec(), options(revoked)));
    expect([read.code, read.context.refusal]).toEqual(["evaluation_read_refused", "evaluator_session_required"]);
  });

  it("keeps polling through a transient read failure", async () => {
    const s = stub({reads: (sent, read) => read === 1
      ? {data: null, error: {code: "PGRST002", message: "Could not query the database for the schema cache"}}
      : {data: readOf(sent.contractText, sent.snapshotText, committed(succeeded, "succeeded", "evaluated")), error: null}});
    expect(await requestGovernedEvaluation(spec(), options(s))).toMatchObject({outcome: "succeeded"});
  });

  it("fails sign-in without echoing the credential and sends nothing", async () => {
    for (const signIn of [async () => ({data: {user: null, session: null}, error: {message: "Invalid login credentials"}}), async () => { throw new Error("offline"); }]) {
      const s = stub({signIn});
      const error = await failure(requestGovernedEvaluation(spec(), options(s)));
      expect(error.code).toBe("evaluator_sign_in_failed");
      expect(error.message).not.toContain(environment.evaluatorPassword);
      expect(s.rpc).not.toHaveBeenCalled();
    }
  });

  it("keeps beside the outputs the evaluation's evidence without route account identifiers", async () => {
    const s = stub({reads: (sent) => ({data: readOf(sent.contractText, sent.snapshotText, {...committed(succeeded, "succeeded", "evaluated"), receipts: [receipt]}), error: null})});
    const evidence = governedEvaluationEvidence(await requestGovernedEvaluation(spec(), options(s)));
    expect(evidence).toMatchObject({schemaVersion: "governed-evaluation-evidence.v1", outcome: "succeeded", reason: "evaluated", resultFingerprint: sha(succeeded)});
    const {route: _route, ...operation} = receipt;
    expect(evidence.receipts).toEqual([operation]);
    expect(JSON.stringify(evidence)).not.toMatch(/synthetic-account|synthetic-binding|synthetic-project/);
  });
});

describe("governed transport environment", () => {
  const complete = {
    SUPABASE_URL: "https://project.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic", OFFROAD_EVALUATOR_EMAIL: " evaluator@example.invalid ",
    OFFROAD_EVALUATOR_PASSWORD: " spaced password ", OFFROAD_EVALUATION_ORGANIZATION_ID: organization.toUpperCase(),
  };

  it("reads its five names and no provider key", () => {
    const read: string[] = [];
    const env = new Proxy({...complete, ANTHROPIC_API_KEY: "synthetic-key", OPENAI_API_KEY: "synthetic-key"} as Record<string, string | undefined>, {
      get: (target, name) => { if (typeof name === "string") read.push(name); return target[name as string]; },
    });
    expect(readGovernedTransportEnvironment(env)).toEqual({supabaseUrl: "https://project.supabase.co", publishableKey: "sb_publishable_synthetic",
      evaluatorEmail: "evaluator@example.invalid", evaluatorPassword: " spaced password ", organizationId: organization});
    expect([...new Set(read)].sort()).toEqual(["OFFROAD_EVALUATION_ORGANIZATION_ID", "OFFROAD_EVALUATOR_EMAIL", "OFFROAD_EVALUATOR_PASSWORD", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_URL"]);
  });

  it("names what is missing without printing any value", () => {
    const error = (() => { try { readGovernedTransportEnvironment({SUPABASE_URL: complete.SUPABASE_URL, OFFROAD_EVALUATOR_PASSWORD: "   "}); } catch (thrown) { return thrown as GovernedTransportError; } return null; })();
    expect(error?.code).toBe("governed_transport_environment_missing");
    expect(error?.context.names).toEqual(["SUPABASE_PUBLISHABLE_KEY", "OFFROAD_EVALUATOR_EMAIL", "OFFROAD_EVALUATION_ORGANIZATION_ID"]);
    expect(error?.message).not.toContain("supabase.co");
  });

  it.each([
    ["plain http off the loopback", {SUPABASE_URL: "http://project.supabase.co"}],
    ["a URL with a path", {SUPABASE_URL: "https://project.supabase.co/rest/v1"}],
    ["a URL with credentials", {SUPABASE_URL: "https://user:secret@project.supabase.co"}],
    ["an organization that is not a UUID", {OFFROAD_EVALUATION_ORGANIZATION_ID: "evaluation-workspace"}],
  ])("refuses %s", (_label, change) => {
    expect(() => readGovernedTransportEnvironment({...complete, ...change})).toThrow(GovernedTransportError);
  });

  it("accepts plain http on the loopback of a disposable stack", () => {
    expect(readGovernedTransportEnvironment({...complete, SUPABASE_URL: "http://127.0.0.1:54321"}).supabaseUrl).toBe("http://127.0.0.1:54321");
  });
});
