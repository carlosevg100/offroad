import {describe, expect, it} from "vitest";

import {conventionsGateVersion, evaluateConventionsGate} from "./conventions-gate";
import {referenceDataEntrySchema, referenceDataRegistry, unresolvedReferenceData} from "./reference-data";

const capitalKeys = ["policy.capital.iof", "policy.capital.anbima-b3-conventions", "policy.capital.tax-regime"];
const registryEntry = (key: string) => {
  const entry = referenceDataRegistry.find((candidate) => candidate.key === key);
  if (!entry) throw new Error(`registry entry ${key} missing`);
  return entry;
};
/** A synthetic approved entry for the gate's window logic. It carries no tax or convention value. */
const syntheticApproved = {
  ...registryEntry("policy.capital.iof"),
  status: "approved",
  value: {synthetic: true},
  asOf: "2026-09-21",
  validUntil: "2026-12-31",
};

describe("conventions gate", () => {
  it("reports the three capital families as gaps today, never as approved", () => {
    const result = evaluateConventionsGate(capitalKeys, "2026-09-24");
    expect(result.version).toBe(conventionsGateVersion);
    expect(result.referenceDate).toBe("2026-09-24");
    expect(result.gaps).toEqual(capitalKeys);
    for (const entry of result.entries) {
      expect(entry.effective).toBe("gap");
      expect(entry.reason).toBe("status_required_missing");
      expect(entry.status).toBe("required_missing");
      expect(entry.version).toBe("2026.09.21-v1");
      expect(entry.owner?.length).toBeGreaterThan(5);
    }
    expect(unresolvedReferenceData(capitalKeys).map((entry) => entry.key)).toEqual(result.gaps);
  });

  it("does not parse an approved entry without source, date, owner or expiry", () => {
    expect(referenceDataEntrySchema.parse(syntheticApproved).status).toBe("approved");
    expect(() => referenceDataEntrySchema.parse({...syntheticApproved, source: null})).toThrow(/source/);
    expect(() => referenceDataEntrySchema.parse({...syntheticApproved, asOf: null})).toThrow(/as-of/);
    expect(() => referenceDataEntrySchema.parse({...syntheticApproved, owner: ""})).toThrow();
    expect(() => referenceDataEntrySchema.parse({...syntheticApproved, validUntil: null})).toThrow(/expiry/);
    for (const broken of [{source: null}, {asOf: null}, {owner: ""}, {validUntil: null}]) {
      const [entry] = evaluateConventionsGate(["policy.capital.iof"], "2026-10-01", {registry: [{...syntheticApproved, ...broken}]}).entries;
      expect(entry).toMatchObject({effective: "gap", reason: "malformed_entry"});
    }
  });

  it("cannot approve any of the three capital keys without an expiry", () => {
    for (const key of capitalKeys) {
      const entry = registryEntry(key);
      expect(entry.validUntil).toBeNull();
      expect(() => referenceDataEntrySchema.parse({...entry, status: "approved", value: {synthetic: true}})).toThrow(/expiry/);
      const [evaluated] = evaluateConventionsGate([key], "2026-10-01", {registry: [{...entry, status: "approved", value: {synthetic: true}}]}).entries;
      expect(evaluated).toMatchObject({key, effective: "gap", reason: "malformed_entry"});
    }
  });

  it("never returns approved for a missing status", () => {
    const {status: _status, ...withoutStatus} = registryEntry("policy.capital.iof");
    const [malformed] = evaluateConventionsGate(["policy.capital.iof"], "2026-10-01", {registry: [withoutStatus]}).entries;
    expect(malformed).toMatchObject({effective: "gap", reason: "malformed_entry", status: null, version: "2026.09.21-v1"});
    const [required] = evaluateConventionsGate(["policy.capital.iof"], "2026-10-01").entries;
    expect(required).toMatchObject({effective: "gap", reason: "status_required_missing"});
  });

  it("treats an unknown key as a gap with reason unknown_key", () => {
    const result = evaluateConventionsGate(["policy.capital.unknown-family"], "2026-10-01");
    expect(result.entries).toEqual([{key: "policy.capital.unknown-family", version: null, status: null, owner: null, effective: "gap", reason: "unknown_key"}]);
    expect(result.gaps).toEqual(["policy.capital.unknown-family"]);
  });

  it("approves only inside the closed window of an approved entry", () => {
    const evaluate = (date: string) => evaluateConventionsGate(["policy.capital.iof"], date, {registry: [syntheticApproved]}).entries[0]!;
    for (const date of ["2026-09-21", "2026-10-15", "2026-12-31"]) {
      expect(evaluate(date)).toEqual({key: "policy.capital.iof", version: "2026.09.21-v1", status: "approved", owner: syntheticApproved.owner, effective: "approved"});
    }
    expect(evaluate("2026-09-20")).toMatchObject({effective: "gap", reason: "not_yet_effective"});
    expect(evaluate("2027-01-01")).toMatchObject({effective: "gap", reason: "expired"});
    expect(evaluateConventionsGate(["policy.capital.iof"], "2026-10-15", {registry: [syntheticApproved]}).gaps).toEqual([]);
  });

  it("names draft and expired statuses instead of approving them", () => {
    const [draft] = evaluateConventionsGate(["policy.reconciliation.tolerance"], "2026-10-01").entries;
    expect(draft).toMatchObject({effective: "gap", reason: "status_draft", status: "draft"});
    const [expired] = evaluateConventionsGate(["policy.capital.iof"], "2026-10-01", {registry: [{...syntheticApproved, status: "expired"}]}).entries;
    expect(expired).toMatchObject({effective: "gap", reason: "status_expired", status: "expired"});
  });

  it("refuses an invalid reference date for every key, including an approved one", () => {
    for (const date of ["2026-13-01", "not-a-date", "2026-10-01T00:00:00Z", ""]) {
      const result = evaluateConventionsGate(["policy.capital.iof", "policy.capital.tax-regime"], date, {registry: [syntheticApproved, registryEntry("policy.capital.tax-regime")]});
      expect(result.entries.map((entry) => entry.reason)).toEqual(["invalid_reference_date", "invalid_reference_date"]);
      expect(result.gaps).toEqual(["policy.capital.iof", "policy.capital.tax-regime"]);
    }
  });

  it("evaluates each key once, in first-seen order, and is deterministic", () => {
    const keys = ["policy.capital.tax-regime", "policy.capital.iof", "policy.capital.tax-regime"];
    const first = evaluateConventionsGate(keys, "2026-10-01");
    expect(first.entries.map((entry) => entry.key)).toEqual(["policy.capital.tax-regime", "policy.capital.iof"]);
    expect(evaluateConventionsGate(keys, "2026-10-01")).toEqual(first);
  });
});
