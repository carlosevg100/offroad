import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {executionCanonicalText} from "./execution-contract";
import {EXECUTION_GATES_SCHEMA_VERSION, executionGatesSchema} from "./execution-gates";

// The same bytes and SHA-256 are pinned by supabase/tests/execution_gates.sql: the database
// accepts exactly this text and fingerprints it on its own.
const canonical = '{"blocked":false,"companyRegistration":"registered","conventions":[{"effective":"approved","key":"iof.rate","status":"approved","version":"2026.09.05-v9"},{"effective":"gap","key":"anbima.curve","status":null,"version":null}],"gatesVersion":"2026.09.24-v1","methodSelection":{"methodId":"synthetic-execution","methodVersion":"test-v1","selectionVersion":"2026.09.24-v1","situationIds":["refinancing","near-covenant"]},"research":"recorded","schemaVersion":"execution-gates.v1","voice":{"blockCount":0,"version":"2026.09.24-v1","warnCount":2}}';
const canonicalSha256 = "e5ee03da8c031f0188e84879540ece7dc9a476be077338b26ad86fd9e0602074";

const valid = () => ({
  schemaVersion: EXECUTION_GATES_SCHEMA_VERSION,
  gatesVersion: "2026.09.24-v1",
  blocked: false,
  companyRegistration: "registered",
  research: "recorded",
  methodSelection: {selectionVersion: "2026.09.24-v1", situationIds: ["refinancing", "near-covenant"], methodId: "synthetic-execution", methodVersion: "test-v1"},
  conventions: [
    {key: "iof.rate", version: "2026.09.05-v9", status: "approved", effective: "approved"},
    {key: "anbima.curve", version: null, status: null, effective: "gap"},
  ],
  voice: {version: "2026.09.24-v1", blockCount: 0, warnCount: 2},
});

describe("execution gates", () => {
  it("accepts the closed record and serializes it to the bytes the database pins", () => {
    const gates = executionGatesSchema.parse(valid());
    const text = executionCanonicalText(gates);
    expect(text).toBe(canonical);
    expect(createHash("sha256").update(text, "utf8").digest("hex")).toBe(canonicalSha256);
  });

  it("keeps the canonical text stable across key order and a parse round trip", () => {
    const shuffled = {
      voice: {warnCount: 2, blockCount: 0, version: "2026.09.24-v1"},
      conventions: [
        {effective: "approved", status: "approved", version: "2026.09.05-v9", key: "iof.rate"},
        {effective: "gap", status: null, version: null, key: "anbima.curve"},
      ],
      methodSelection: {methodVersion: "test-v1", methodId: "synthetic-execution", situationIds: ["refinancing", "near-covenant"], selectionVersion: "2026.09.24-v1"},
      research: "recorded", companyRegistration: "registered", blocked: false, gatesVersion: "2026.09.24-v1", schemaVersion: EXECUTION_GATES_SCHEMA_VERSION,
    };
    expect(executionCanonicalText(executionGatesSchema.parse(shuffled))).toBe(canonical);
    expect(executionCanonicalText(executionGatesSchema.parse(JSON.parse(canonical)))).toBe(canonical);
  });

  it.each([
    ["a top-level note", (gates: ReturnType<typeof valid>) => ({...gates, note: "Synthetic free text"})],
    ["a label beside the method selection", (gates: ReturnType<typeof valid>) => ({...gates, methodSelection: {...gates.methodSelection, label: "Giro sazonal"}})],
    ["the registry owner and gap reason of a convention", (gates: ReturnType<typeof valid>) => ({...gates, conventions: [{...gates.conventions[0], owner: "Synthetic owner", reason: "expired"}]})],
    ["the voice findings", (gates: ReturnType<typeof valid>) => ({...gates, voice: {...gates.voice, findings: [{message: "Synthetic finding"}]}})],
    ["a client fingerprint", (gates: ReturnType<typeof valid>) => ({...gates, gatesFingerprint: "a".repeat(64)})],
  ])("refuses free text: %s", (_name, change) => {
    expect(executionGatesSchema.safeParse(change(valid())).success).toBe(false);
  });

  it.each([
    ["prose in a version", {gatesVersion: "free text version"}],
    ["an unknown registration state", {companyRegistration: "pending"}],
    ["an unknown research state", {research: "unknown"}],
    ["another schema version", {schemaVersion: "execution-gates.v2"}],
  ])("refuses %s", (_name, change) => {
    expect(executionGatesSchema.safeParse({...valid(), ...change}).success).toBe(false);
  });

  it("refuses repeated situations and convention keys, and counts that are not non-negative integers", () => {
    const gates = valid();
    expect(executionGatesSchema.safeParse({...gates, methodSelection: {...gates.methodSelection, situationIds: ["refinancing", "refinancing"]}}).success).toBe(false);
    expect(executionGatesSchema.safeParse({...gates, conventions: [gates.conventions[0], gates.conventions[0]]}).success).toBe(false);
    expect(executionGatesSchema.safeParse({...gates, voice: {...gates.voice, warnCount: -1}}).success).toBe(false);
    expect(executionGatesSchema.safeParse({...gates, voice: {...gates.voice, blockCount: 1.5}}).success).toBe(false);
  });
});
