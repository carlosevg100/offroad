import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {originatorCreditReviewFixture} from "./originator-credit-review.test-support";
import {originatorRegistryFixture} from "./originator-registry.test-support";
import {composeBoundOriginatorCase, prepareOriginatorCasePacket, proposeOriginatorCaseHypotheses, type OriginatorCaseFacts} from "./originator-case";
import {analysisTestId as id} from "./adopted-analysis.test-support";
import type {ProposedHypothesis} from "./investment-premises";
import {originatorCaseExecutorContracts} from "./originator-case-contracts";
import {auroraKernelInput} from "./document-folder-inventory.test-support";

function facts(kind: "credit" | "registry"): OriginatorCaseFacts {
  const f = kind === "credit" ? originatorCreditReviewFixture() : originatorRegistryFixture();
  return {caseId: id(1), entityId: id(2), perimeter: "standalone", currency: "BRL", openingDate: "2024-01-01", readingDate: "2026-10-29", definitionVersionId: id(3), kind, facts: f,
    sectionOrigins: Object.fromEntries(Object.keys(f).map(name => [name, {origin: ["sources", "contexts"].includes(name) ? "document" : name === "policy" || name === "screeningPolicy" ? "house" : "informed", source: "Synthetic confirmation: exact source scope, selected versions, fund rules and links are visible before adoption."}]))} as OriginatorCaseFacts;
}
function seal(entries: AdoptionBasisEntry[]) {
  const s: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(60), setId: id(6), workId: id(7), purpose: "synthetic originator review", contextKey: "originator", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const canonical = JSON.stringify(s);
  return {envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}, scope: {workId: id(7), purpose: s.purpose, versionId: s.versionId}};
}
function adopt(h: ProposedHypothesis[]) {return h.map((p, i) => ({decisionId: id(1000 + i), slotKey: createHash("sha256").update(p.fieldPath + p.dimensions.scenario).digest("hex"), kind: "hypothesis", fieldPath: p.fieldPath, dimensions: {...p.dimensions}, value: p.value, observationId: null, referenceValue: null, referenceDimensions: null, definitionKind: "managerial", actorId: id(5), reason: p.reason}) as AdoptionBasisEntry);}
const entry = (kind: "credit" | "registry") => adopt(proposeOriginatorCaseHypotheses(facts(kind)));
const packet = (kind: "credit" | "registry", entries = entry(kind)) => prepareOriginatorCasePacket(composeBoundOriginatorCase({...seal(entries), kind, question: "Prepare the documentary review for the responsible person's decision"}));

describe("originator adoption and packet boundary", () => {
  it("generates complete strict input and output authoring contracts", () => {const c = originatorCaseExecutorContracts(); expect(c.executor.exportName).toBe("prepareOriginatorCasePacket"); expect(JSON.stringify(c.validationSchemas)).not.toContain('"$ref"');});
  it("uses the same adoption boundary for kit readiness", () => {
    const f = facts("credit"), inventory = auroraKernelInput(); inventory.asOf = f.readingDate;
    const k: OriginatorCaseFacts = {...f, kind: "kit", facts: {inventory: {...inventory, currency: "BRL"}, assignments: [], policy: null}, sectionOrigins: {inventory: {origin: "document", source: "Synthetic file-by-file readings with their unchanged hashes"}, assignments: {origin: "informed", source: "No document roles selected"}, policy: {origin: "house", source: "No checklist adopted"}}};
    const r = prepareOriginatorCasePacket(composeBoundOriginatorCase({...seal(adopt(proposeOriginatorCaseHypotheses(k))), kind: "kit", question: "Organize the cedent kit"}));
    expect(r.status).toBe("partial"); expect(r.kit?.inventory.rows.length).toBe(30); expect(r.gaps).toContainEqual({operand: "policy", reason: "kit_requirements_policy_missing"});
  });
  it("reproduces the credit result from confirmed source records and retains its basis", () => {
    const r = packet("credit"); expect(r.status).toBe("prepared_for_human_review");
    expect(r.credit?.credit?.capacity?.additionalFace).toBe("2500000"); expect(r.registry).toBeNull();
    expect(r.contributions.length).toBe(entry("credit").length); expect(r.grantsExecution).toBe(false); expect(r.grantsPublication).toBe(false);
  });
  it("reproduces ownership and signing findings without impersonating a live KYC query", () => {
    const r = packet("registry"); expect(r.status).toBe("prepared_for_human_review");
    expect(r.registry?.ownership.resolvedPersons.map(p => p.resolvedShare)).toEqual(["0.6", "0.3", "0.1"]); expect(r.registry?.liveQueriesPerformedByThisExecutor).toBe(false); expect(r.credit).toBeNull();
  });
  it("does not execute a case with a missing adopted policy section", () => {
    const e = entry("credit").filter(e => !e.fieldPath.endsWith(".record.policy")); const r = packet("credit", e);
    expect(r.status).toBe("framed"); expect(r.credit).toBeNull(); expect(r.gaps.some(g => g.operand.endsWith("record.policy"))).toBe(true);
  });
  it("reports two contributions for one section instead of choosing one", () => {
    const e = entry("credit"), policy = e.find(e => e.fieldPath.endsWith("record.policy"))!;
    e.push({...policy, decisionId: id(9999), slotKey: createHash("sha256").update("duplicate-policy").digest("hex")});
    expect(packet("credit", e).status).toBe("framed");
  });
  it("refuses an envelope changed after its fingerprint was computed", () => {
    const bound = seal(entry("credit")); bound.envelope.canonical += " ";
    expect(() => composeBoundOriginatorCase({...bound, kind: "credit", question: "Review"})).toThrow();
  });
  it("refuses a basis of another work even when the facts look identical", () => {
    const b = seal(entry("credit")); b.scope.workId = id(8);
    expect(() => composeBoundOriginatorCase({...b, kind: "credit", question: "Review"})).toThrow();
  });
  it("refuses a record bound to another entity or scenario", () => {
    for (const field of ["entityId", "scenario"] as const) {const e = entry("credit"); e[0]!.dimensions[field] = field === "entityId" ? id(88) : "adverse"; expect(() => packet("credit", e)).toThrow("analysis_basis_context_mismatch");}
  });
  it("cannot omit a record by editing only the composed input", () => {
    const p = composeBoundOriginatorCase({...seal(entry("credit")), kind: "credit", question: "Review"}); p.analysis.records.pop();
    expect(() => prepareOriginatorCasePacket(p)).toThrow("record_coverage_incomplete");
  });
  it("does not accept a free facts object next to the bound analysis", () => {
    const p = composeBoundOriginatorCase({...seal(entry("credit")), kind: "credit", question: "Review"});
    expect(() => prepareOriginatorCasePacket({...p, facts: originatorCreditReviewFixture()})).toThrow();
  });
  it("keeps the source origin explicit, including a house policy", () => {
    const h = proposeOriginatorCaseHypotheses(facts("credit"));
    expect(h.find(h => h.fieldPath.endsWith("record.policy"))?.reason).toMatch(/^Origem: premissa da casa/);
    expect(h.find(h => h.fieldPath.endsWith("record.sources"))?.reason).toMatch(/^Origem: documento/);
  });
  it("refuses source readings declared as estimates", () => {
    const f = facts("credit"); f.sectionOrigins.sources!.origin = "estimate";
    expect(() => proposeOriginatorCaseHypotheses(f)).toThrow("requires_document_origin");
  });
  it("recomputes the result when a later confirmed request changes the term", () => {
    const f = facts("credit"); if (f.kind !== "credit") throw new Error("test-kind"); f.facts.request.requestedTermDays = 130; f.facts.request.requestedAdditionalFace = "2500000";
    const r = packet("credit", adopt(proposeOriginatorCaseHypotheses(f)));
    expect(r.credit?.credit?.status).toBe("recommend_decline"); expect(r.credit?.credit?.capacity?.requestedFaceCashDeficit).toBe("175000");
    expect(r.fingerprint).not.toBe(packet("credit").fingerprint);
  });
});
