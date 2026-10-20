import {describe, expect, it} from "vitest";
import {freshness, licenseAllows, logicalId, marketLicenseSchema, marketReferenceSchema, observationsAvailableAsOf, policiesInForce, type MarketObservation} from "./market-objects";

const h = (c: string) => c.repeat(64);
const policies = [
  {instrument: "Política de Consumo", version: "1.0", evidenceId: "b3-consumo-ate-2026-10-31", sha256: h("a"), effectiveFrom: "2025-01-01", effectiveUntil: "2026-10-31"},
  {instrument: "Política de Consumo", version: "1.1", evidenceId: "b3-consumo-v1.1", sha256: h("b"), effectiveFrom: "2026-11-01", effectiveUntil: null},
  {instrument: "Política Comercial", version: "2026 V1.1", evidenceId: "b3-comercial-2026-v1.1", sha256: h("c"), effectiveFrom: "2026-11-01", effectiveUntil: "2026-12-31"},
  {instrument: "Política Comercial", version: "2027 V1.1", evidenceId: "b3-comercial-2027-v1.1", sha256: h("d"), effectiveFrom: "2027-01-01", effectiveUntil: "2027-12-31"},
];

describe("licence regimes", () => {
  it("selects the supplier policies in force on each side of a change", () => {
    expect(policiesInForce(policies, "2026-10-31").map((p) => p.version)).toEqual(["1.0"]);
    expect(policiesInForce(policies, "2026-11-01").map((p) => p.version)).toEqual(["2026 V1.1", "1.1"]);
    expect(policiesInForce(policies, "2027-01-01").map((p) => p.version)).toEqual(["2027 V1.1", "1.1"]);
  });
  it("allows an open licence and a contracted one only within an entitlement in force", () => {
    const open = marketLicenseSchema.parse({kind: "open", license: "ODbL-1.0", attribution: "CVM, Dados Abertos", evidenceIds: ["cvm-dfp-dataset"], retainAdoptedValues: true, storeDays: null});
    expect(licenseAllows(open, {operation: "derive", output: "result", on: "2026-10-20", product: "any"})).toBe(true);
    const contracted = marketLicenseSchema.parse({kind: "contracted", provider: "anbima", contractReference: "Contrato hipotético", policies: [policies[1]],
      entitlements: [{product: "secondary-market", audience: "all_tenants", operations: ["read", "process"], outputs: ["screen"], validFrom: "2027-01-01", validUntil: null, retainAdoptedValues: false, storeDays: 30}]});
    expect(licenseAllows(contracted, {operation: "read", output: "screen", on: "2027-02-01", product: "secondary-market"})).toBe(true);
    expect(licenseAllows(contracted, {operation: "export", output: "download", on: "2027-02-01", product: "secondary-market"})).toBe(false);
    expect(licenseAllows(contracted, {operation: "read", output: "screen", on: "2026-12-31", product: "secondary-market"})).toBe(false);
  });
});

describe("identity and information dates", () => {
  it("gives a stable logical id independent of key order, distinct per economic key", () => {
    const a = logicalId({source: "cvm", family: "offering", kind: "precedent", category: "document_fact", keys: {offering: "CVM/SRE/AUT/2025/123", series: "1", tranche: "1"}});
    const b = logicalId({source: "cvm", family: "offering", kind: "precedent", category: "document_fact", keys: {tranche: "1", series: "1", offering: "CVM/SRE/AUT/2025/123"}});
    const other = logicalId({source: "cvm", family: "offering", kind: "precedent", category: "document_fact", keys: {offering: "CVM/SRE/AUT/2026/9", series: "1", tranche: "1"}});
    expect(a).toBe(b); expect(a).not.toBe(other); expect(a).toMatch(/^market:cvm:offering:[a-f0-9]{16}$/);
  });
  it("never reads what was not yet published or acquired, and keeps the latest revision per period", () => {
    const o = (periodEnd: string, availableAt: string, value: string): MarketObservation => ({versionId: "00000000-0000-4000-8000-000000000001", periodStart: null, periodEnd,
      availableAt, acquiredAt: availableAt, value, unit: "percent_per_year", scale: "1"});
    const series = [o("2026-10-16", "2026-10-17T12:00:00Z", "14.90"), o("2026-10-17", "2026-10-18T12:00:00Z", "14.90"), o("2026-10-16", "2026-10-19T12:00:00Z", "14.91")];
    expect(observationsAvailableAsOf(series, "2026-10-17").map((x) => [x.periodEnd, x.value])).toEqual([["2026-10-16", "14.90"]]);
    expect(observationsAvailableAsOf(series, "2026-10-19").map((x) => [x.periodEnd, x.value])).toEqual([["2026-10-16", "14.91"], ["2026-10-17", "14.90"]]);
  });
  it("says when an object is stale instead of serving it silently", () => {
    expect(freshness("2026-10-19T12:00:00Z", "2026-10-20T10:00:00Z", 30)).toBe("current");
    expect(freshness("2026-10-17T12:00:00Z", "2026-10-20T10:00:00Z", 30)).toBe("stale");
    expect(freshness(null, "2026-10-20T10:00:00Z", 30)).toBe("absent");
  });
  it("accepts only a complete typed reference", () => {
    const ref = {schemaVersion: "market-reference.v1", deliveryId: "00000000-0000-4000-8000-000000000002", logicalId: "market:bcb:sgs:0123456789abcdef",
      versionId: "00000000-0000-4000-8000-000000000003", versionSha256: h("e"), rightsVersionId: "00000000-0000-4000-8000-000000000004", category: "observed"};
    expect(marketReferenceSchema.parse(ref)).toEqual(ref);
    expect(() => marketReferenceSchema.parse({...ref, category: "rumour"})).toThrow();
    expect(() => marketReferenceSchema.parse({...ref, logicalId: "market:bcb:sgs"})).toThrow();
  });
});
