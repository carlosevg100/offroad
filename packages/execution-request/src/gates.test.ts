import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {executionCanonicalText, executionGatesSchema} from "@offroad/agent-contracts";
import {
  evaluateConventionsGate, methodSelectionVersion, parseFrontmatter, referenceDataKeys, referenceDataRegistry, selectMethod, VOICE_FILTER_VERSION,
  type MethodSelectionRefusalCode, type VoiceFinding,
} from "@offroad/credit-playbook";
import {
  blockingRefusal, buildExecutionGates, closeExecutionGates, executionGatesText, executionGatesVersion, openExecutionGates, packetSystemStrings,
  referenceDataKeysOf, releasedMethodReferenceDataKeys, selectionRefusal, type ExecutionGateStates, type OpenedExecutionGates,
} from "./gates";

const root = join(import.meta.dirname, "../../..");
const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const EM_DASH = String.fromCodePoint(0x2014);
const method = {methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4"};
const keys = releasedMethodReferenceDataKeys[`${method.methodId}@${method.methodVersion}`]!;
const company = {entityId: null, registration: "registered", research: "recorded", researchAsOf: null} as const;
const referenceDate = "2026-10-01";

function states(overrides: Partial<ExecutionGateStates> = {}): ExecutionGateStates {
  return {company: {registration: "registered", research: "recorded"}, method, selection: selectMethod({situationIds: ["refinancing"], ...method}),
    conventions: evaluateConventionsGate(keys, referenceDate), findings: [], ...overrides};
}
const finding = (severity: "block" | "warn"): VoiceFinding => ({ruleId: "VF-00", code: "synthetic", severity, message: "synthetic", channel: "packet", stringId: "s", excerpt: "e"});
function opened(): OpenedExecutionGates {
  const result = openExecutionGates({company, method, situationIds: ["refinancing"], referenceDate});
  if (!result.ok) throw new Error(result.error);
  return result;
}
/** A packet input reduced to the places where system text and a person's text live. */
function packet(overrides: {label?: string; reason?: string; question?: string; objectives?: string[]} = {}) {
  return {schemaVersion: "capital-procedure-packet-input.v2", decision: {review: {composition: {
    workId: "w", purpose: "prepare-capital-structure-decision", question: overrides.question ?? "Does the structure hold?", objectives: overrides.objectives ?? ["Measure liquidity"],
    alternatives: [{id: "current", label: overrides.label ?? "Current structure as recorded in the working basis", kind: "maintain",
      projection: {operating: {envelope: {canonical: `{"scenario":"a ${EM_DASH} b"}`, fingerprint: "f".repeat(64)}, scenario: `base ${EM_DASH} plan`,
        convention: {decisionId: null, definitionVersionId: "d", definitionKind: "managerial", missingReason: overrides.reason ?? "No contribution adopted for operating_projection.convention"}},
      funding: {kind: "debt", input: {coverageReason: "Operating cash comes from the budget of this packet"}}},
      rationale: "Reflects the contributions adopted in the working basis", conditions: ["Synthetic condition"], disconfirmers: ["The working basis is revised"]}]}}}};
}

describe("released method reference data keys", () => {
  it("copies the keys from the procedure source the release pinned, byte for byte", () => {
    const releases = join(root, "packages/credit-playbook/knowledge/releases");
    const lock = JSON.parse(readFileSync(join(releases, "compiled-executor-lock.json"), "utf8")) as {releases: Array<{provenance: {procedure: {id: string; version: string}}; manifestPath: string; manifestFileHash: string; snapshotHash: string}>};
    const identities = Object.keys(releasedMethodReferenceDataKeys);
    expect(identities.length).toBeGreaterThan(0);
    for (const identity of identities) {
      const [methodId, methodVersion] = identity.split("@");
      const release = lock.releases.find(entry => entry.provenance.procedure.id === methodId && entry.provenance.procedure.version === methodVersion);
      if (!release) throw new Error(`no compiled release for ${identity}`);
      const manifestBytes = readFileSync(join(root, release.manifestPath));
      expect(sha256(manifestBytes)).toBe(release.manifestFileHash);
      const manifest = JSON.parse(manifestBytes.toString("utf8")) as {source: {path: string; hash: string}};
      const snapshotBytes = readFileSync(join(releases, `${release.snapshotHash}.sources.json`));
      expect(sha256(snapshotBytes)).toBe(release.snapshotHash);
      const source = (JSON.parse(snapshotBytes.toString("utf8")) as {pinned: Record<string, string>}).pinned[`packages/credit-playbook/knowledge/procedures/${manifest.source.path}`]!;
      expect(sha256(source)).toBe(manifest.source.hash);
      const {frontmatter} = parseFrontmatter(source, manifest.source.path);
      expect([frontmatter.id, frontmatter.version]).toEqual([methodId, methodVersion]);
      expect(releasedMethodReferenceDataKeys[identity]).toEqual(frontmatter.reference_data_keys);
      for (const key of frontmatter.reference_data_keys) expect(referenceDataKeys).toContain(key);
    }
  });
  it("knows no keys for a method version it was not given", () => {
    expect(referenceDataKeysOf(method)).toEqual(["policy.capital.iof", "policy.capital.anbima-b3-conventions", "policy.capital.tax-regime"]);
    expect(referenceDataKeysOf({...method, methodVersion: "2026.10.01-v5"})).toBeNull();
    expect(referenceDataKeysOf({...method, methodId: "underwrite-receivables-pool"})).toBeNull();
  });
});

describe("opening the gates", () => {
  it("refuses an unregistered company before anything else and records missing research as a gap", () => {
    expect(openExecutionGates({company: {...company, registration: "missing"}, method, situationIds: [], referenceDate})).toEqual({ok: false, error: "company_unregistered"});
    const missing = openExecutionGates({company: {...company, research: "missing"}, method, situationIds: ["refinancing"], referenceDate});
    expect(missing).toMatchObject({ok: true, company: {registration: "registered", research: "missing"}});
    expect(missing.ok && buildExecutionGates({...missing, findings: []})).toMatchObject({research: "missing", blocked: false});
  });
  it("refuses a method version whose reference data keys are unknown", () => {
    expect(openExecutionGates({company, method: {...method, methodVersion: "2026.10.01-v5"}, situationIds: ["refinancing"], referenceDate})).toEqual({ok: false, error: "method_unavailable"});
  });
  it.each([[[], "situation_required"], [["not-a-situation"], "situation_unknown"], [["receivables"], "method_not_applicable"]])("maps the selection refusal for %j to %s", (situationIds, error) => {
    expect(openExecutionGates({company, method, situationIds, referenceDate})).toEqual({ok: false, error});
  });
  it("maps every typed selection refusal to a named code", () => {
    const codes: MethodSelectionRefusalCode[] = ["input_invalid", "situation_required", "situation_unknown", "method_not_applicable_for_situation"];
    expect(codes.map(selectionRefusal)).toEqual(["selection_invalid", "situation_required", "situation_unknown", "method_not_applicable"]);
    expect(() => selectMethod({situationIds: ["refinancing"], methodId: method.methodId, methodVersion: "v4"})).toThrow("input_invalid");
  });
  it("evaluates the conventions of the released method at the reference date of the form", () => {
    const result = opened();
    expect(result.conventions.referenceDate).toBe(referenceDate);
    expect(result.conventions.entries.map(entry => entry.key)).toEqual([...keys]);
    expect(result.selection).toMatchObject({methodId: method.methodId, methodVersion: method.methodVersion, reasonCodes: ["all_situations_served"]});
  });
});

describe("the gates receipt", () => {
  it("is blocked exactly when registration is missing, the selection refused or the voice found a block", () => {
    const cases: Array<[Partial<ExecutionGateStates>, string | null]> = [
      [{}, null],
      [{findings: [finding("warn"), finding("warn")]}, null],
      [{company: {registration: "registered", research: "missing"}}, null],
      [{company: {registration: "missing", research: "missing"}}, "company_unregistered"],
      [{selection: {refused: "method_not_applicable_for_situation", situationIds: ["receivables"]}}, "method_not_applicable"],
      [{selection: {refused: "situation_unknown", situationIds: ["not-a-situation"]}}, "situation_unknown"],
      [{findings: [finding("warn"), finding("block")]}, "voice_blocked"],
      [{company: {registration: "missing", research: "recorded"}, findings: [finding("block")]}, "company_unregistered"],
    ];
    for (const [overrides, refusal] of cases) {
      expect(blockingRefusal(states(overrides))).toBe(refusal);
      expect(buildExecutionGates(states(overrides)).blocked).toBe(refusal !== null);
    }
  });
  it("carries tokens, states and counts only: conventions keep key, version, status and effective", () => {
    const approved = {...referenceDataRegistry.find(entry => entry.key === "policy.capital.iof")!, status: "approved", value: {synthetic: true}, asOf: "2026-09-21", validUntil: "2026-12-31"};
    const conventions = evaluateConventionsGate(keys, referenceDate, {registry: [approved, ...referenceDataRegistry.filter(entry => entry.key !== "policy.capital.iof")]});
    expect(conventions.entries.every(entry => typeof entry.owner === "string")).toBe(true);
    const gates = buildExecutionGates(states({conventions, findings: [finding("warn"), finding("block"), finding("warn")]}));
    expect(gates).toEqual({schemaVersion: "execution-gates.v1", gatesVersion: executionGatesVersion, blocked: true, companyRegistration: "registered", research: "recorded",
      methodSelection: {selectionVersion: methodSelectionVersion, situationIds: ["refinancing"], ...method},
      conventions: [
        {key: "policy.capital.iof", version: "2026.09.24-v1", status: "approved", effective: "approved"},
        {key: "policy.capital.anbima-b3-conventions", version: "2026.09.24-v1", status: "draft", effective: "gap"},
        {key: "policy.capital.tax-regime", version: "2026.09.24-v1", status: "draft", effective: "gap"},
      ],
      voice: {version: VOICE_FILTER_VERSION, blockCount: 1, warnCount: 2}});
    for (const entry of gates.conventions) expect(Object.keys(entry).sort()).toEqual(["effective", "key", "status", "version"]);
    const unknown = buildExecutionGates(states({conventions: evaluateConventionsGate(["policy.capital.unknown-family"], referenceDate)}));
    expect(unknown.conventions).toEqual([{key: "policy.capital.unknown-family", version: null, status: null, effective: "gap"}]);
  });
  it("records the distinct situations of the selection in selection order", () => {
    const gates = buildExecutionGates(states({selection: selectMethod({situationIds: ["near-covenant", "refinancing", "near-covenant"], ...method})}));
    expect(gates.methodSelection.situationIds).toEqual(["near-covenant", "refinancing"]);
  });
  it("serializes to the canonical bytes the receipt schema accepts and never serializes a blocked receipt", () => {
    const gates = buildExecutionGates(states());
    const text = executionGatesText(gates);
    expect(executionCanonicalText(JSON.parse(text))).toBe(text);
    expect(executionGatesSchema.parse(JSON.parse(text))).toEqual(gates);
    expect(text.startsWith("{\"blocked\":false,\"companyRegistration\":\"registered\",\"conventions\":[")).toBe(true);
    expect(() => executionGatesText(buildExecutionGates(states({findings: [finding("block")]})))).toThrow("execution_gates_blocked_not_sent");
    expect(() => executionGatesText({...gates, note: "free text"} as never)).toThrow();
  });
});

describe("the voice gate", () => {
  it("collects the system text of the packet with its path and leaves out the person's words and the basis", () => {
    const strings = packetSystemStrings(packet());
    expect(strings.map(entry => entry.id)).toEqual([
      "decision.review.composition.alternatives[0].label",
      "decision.review.composition.alternatives[0].projection.operating.convention.missingReason",
      "decision.review.composition.alternatives[0].projection.funding.input.coverageReason",
      "decision.review.composition.alternatives[0].rationale",
      "decision.review.composition.alternatives[0].conditions[0]",
      "decision.review.composition.alternatives[0].disconfirmers[0]",
    ]);
    const texts = strings.map(entry => entry.text).join("\n");
    expect(texts).not.toContain("Does the structure hold?"); expect(texts).not.toContain("Measure liquidity"); expect(texts).not.toContain(EM_DASH);
  });
  it("does not audit what the person typed, whatever it carries", () => {
    const result = closeExecutionGates(opened(), packet({question: `Ótima pergunta ${EM_DASH} como IA, o banco vai aceitar?`, objectives: [`Vale destacar ${EM_DASH} já`]}));
    expect(result).toMatchObject({ok: true, findings: [], gates: {blocked: false, voice: {blockCount: 0, warnCount: 0}}});
  });
  it("refuses on a block finding in system text and counts warn findings without refusing", () => {
    const blocked = closeExecutionGates(opened(), packet({reason: `No contribution adopted for the period (base ${EM_DASH} plan)`}));
    expect(blocked).toMatchObject({ok: false, error: "voice_blocked", gates: {blocked: true, voice: {blockCount: 1}}});
    expect(blocked.ok ? [] : blocked.findings.map(entry => [entry.code, entry.stringId])).toEqual([["em_dash", "decision.review.composition.alternatives[0].projection.operating.convention.missingReason"]]);
    expect(blocked).not.toHaveProperty("text");
    const warned = closeExecutionGates(opened(), packet({label: "An excellent structure"}));
    expect(warned).toMatchObject({ok: true, gates: {blocked: false, voice: {blockCount: 0, warnCount: 1}}});
    expect(warned.ok && executionGatesSchema.safeParse(JSON.parse(warned.text)).success).toBe(true);
  });
});
