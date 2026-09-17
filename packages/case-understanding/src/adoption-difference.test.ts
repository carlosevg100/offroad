import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry} from "@offroad/reconciliation";
import {compareContextualAdoptionBases, describeContributionDifference} from "./adoption-difference";
const id = (n: number) => `a9990000-0000-4000-9000-${String(n).padStart(12, "0")}`;
const dimensions = {entityId: id(1), perimeter: "standalone", periodStart: null, periodEnd: "2025-12-31", currency: "BRL", unit: "currency", scale: "1", scenario: "actual", definitionVersionId: id(2)};
const entry: AdoptionBasisEntry = {decisionId: id(3), slotKey: "a".repeat(64), kind: "hypothesis", fieldPath: "financials.net_debt", dimensions, value: {type: "number", value: "300"}, observationId: id(4), referenceValue: {type: "number", value: "200"}, referenceDimensions: dimensions, definitionKind: "reported", actorId: id(5), reason: "Explicit synthetic working assumption"};
function version(n: number, entries: AdoptionBasisEntry[]) {
 const canonical = JSON.stringify({schemaVersion: "contextual-adoption.v1", versionId: id(10+n), setId: id(6), workId: id(7), purpose: "capital decision", contextKey: "base", revision:n, previousVersionId:n===1?null:id(9+n), classification:"working_basis", entries});
 return {versionId:id(10+n), envelope:{canonical,fingerprint:createHash("sha256").update(canonical).digest("hex")}};
}
describe("contextual evidence differences", () => {
 it("retains actual beside budget and identifies a revised decision without rewriting the source", () => {
  const revised = {...entry, decisionId:id(20), value:{type:"number" as const,value:"450"}};
  const budget = {...entry, decisionId:id(21), slotKey:"b".repeat(64), dimensions:{...dimensions,scenario:"budget"}};
  const differences = compareContextualAdoptionBases({workId:id(7),purpose:"capital decision",left:version(1,[entry]),right:version(2,[revised,budget])});
  expect(differences.map(d=>d.state)).toEqual(["changed","added"]);
  expect(differences[0]?.before?.value.value).toBe("300");
  expect(differences[0]?.after?.referenceValue?.value).toBe("200");
 });
 it("labels equal-valued contributions as hypotheses and lists interpretation changes", () => {
  const result = describeContributionDifference({...entry,value:entry.referenceValue!,dimensions:{...dimensions,scenario:"budget",perimeter:"consolidated"}});
  expect(result).toEqual({hasReference:true,valueChanged:false,changedDimensions:["perimeter","scenario"],classification:"working_hypothesis"});
 });
 it("denies comparison across work, purpose and tampered snapshots", () => {
  const left=version(1,[entry]),right=version(2,[entry]);
  expect(()=>compareContextualAdoptionBases({workId:id(8),purpose:"capital decision",left,right})).toThrow("adoption_basis_scope_mismatch");
  expect(()=>compareContextualAdoptionBases({workId:id(7),purpose:"other purpose",left,right})).toThrow("adoption_basis_scope_mismatch");
  right.envelope.canonical += " ";
  expect(()=>compareContextualAdoptionBases({workId:id(7),purpose:"capital decision",left,right})).toThrow("adoption_basis_integrity_mismatch");
 });
});
