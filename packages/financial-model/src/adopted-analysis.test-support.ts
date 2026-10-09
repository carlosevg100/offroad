import {createHash} from "node:crypto";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import type {AnalysisSelection} from "./adopted-analysis-binding";

export const analysisTestId = (n: number) => `ac400000-0000-4000-9000-${String(n).padStart(12, "0")}`;
/** Synthetic adoptions, not fixture answers injected into any provider or production. */
export function analysisTestBasis(prefix: string, openingDate: string, endDate: string) {
  const id = analysisTestId, entries: AdoptionBasisEntry[] = []; let n = 20;
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(500), setId: id(6),
    workId: id(7), purpose: "synthetic adopted financial analysis", contextKey: "synthetic", revision: 1,
    previousVersionId: null, classification: "working_basis", entries};
  const context = {envelope: {canonical: "", fingerprint: ""}, scope: {workId: id(7), purpose: snapshot.purpose, versionId: snapshot.versionId},
    entityId: id(1), perimeter: "standalone", currency: "BRL", openingDate, endDate, numericInterpretations: []};
  function contribute(path: string, unit: string, value: AdoptionBasisEntry["value"], scenario = "base"): AnalysisSelection {
    const decisionId = id(n++);
    entries.push({decisionId, slotKey: createHash("sha256").update(path + scenario).digest("hex"), kind: "hypothesis", fieldPath: prefix + path,
      dimensions: {entityId: id(1), perimeter: "standalone", periodStart: openingDate, periodEnd: endDate, currency: "BRL", unit, scale: "1", scenario, definitionVersionId: id(3)},
      value, observationId: null, referenceValue: null, referenceDimensions: null, definitionKind: "managerial", actorId: id(5), reason: "Synthetic explicitly adopted analysis operand"});
    return {decisionId, definitionVersionId: id(3), definitionKind: "managerial", missingReason: null};
  }
  function seal() {const canonical = JSON.stringify(snapshot); context.envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}; return context.envelope;}
  const set = (suffix: string, value: AdoptionBasisEntry["value"]) => {const e = entries.find(e => e.fieldPath.endsWith(suffix)); if (!e) throw new Error("missing_test_operand"); e.value = value;};
  return {entries, snapshot, context, contribute, seal, set};
}
