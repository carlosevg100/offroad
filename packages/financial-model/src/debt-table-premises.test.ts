import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {composeBoundDebtTable} from "./debt-table-composer";
import {prepareDebtTablePacket} from "./debt-table-packet";
import {proposeDebtTableHypotheses, type DebtTableFacts} from "./debt-table-premises";
import {auroraDebtTableBasis, auroraDebtTableFacts} from "./debt-table.test-support";
import {analysisTestId as id} from "./adopted-analysis.test-support";

function sealed(entries: AdoptionBasisEntry[]) {
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(500), setId: id(6), workId: id(7), purpose: "synthetic debt table",
    contextKey: "tabela-de-divida", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const canonical = JSON.stringify(snapshot);
  return {entries, envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}, scope: {workId: id(7), purpose: snapshot.purpose, versionId: id(500)}};
}
function adopt(facts: DebtTableFacts) {
  let n = 9000;
  return sealed(proposeDebtTableHypotheses(facts).map((h) => ({decisionId: id(n++), slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
    kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null,
    definitionKind: "managerial", actorId: id(5), reason: h.reason}) as AdoptionBasisEntry));
}
const question = "Monta a tabela de dívida com tudo que temos.";
const packetOf = (a: ReturnType<typeof sealed>) => prepareDebtTablePacket(composeBoundDebtTable({envelope: a.envelope, scope: a.scope, question}));
const reference = () => prepareDebtTablePacket({schemaVersion: "debt-table-packet-input.v1", question, analysis: auroraDebtTableBasis().seal()});

describe("C10 premises proposed from facts with origin, adopted, composed and measured", () => {
  it("stays inside the basis limit and states the origin of every premise", () => {
    const h = proposeDebtTableHypotheses(auroraDebtTableFacts());
    expect(h.length).toBeLessThanOrEqual(256);
    expect(h.every((x) => x.reason.startsWith("Origem:"))).toBe(true);
    expect(h.every((x) => x.dimensions.scenario === "base" && x.dimensions.scale === "1" && x.dimensions.periodStart === "2026-06-30")).toBe(true);
  });
  it("reproduces the calibrated table from the composed basis", () => {
    const p = packetOf(adopt(auroraDebtTableFacts())), ref = reference();
    expect(p.status).toBe("prepared_for_human_review");
    expect(p.gaps).toEqual([]);
    expect(p.readings).toEqual(ref.readings);
    expect(p.result.table).toEqual(ref.result.table);
    expect(p.readings).toEqual({reconciled: true, viewCount: 4, unusedLimits: "10", categoriesNotExamined: [], outsideEveryView: ["fianca"], basketsExceeded: [],
      lowestCrossDefault: {instrumentId: "ccb-bradesco", threshold: "5"}, leverageDefinitions: 2, completenessRequest: true});
    const t = p.result.table!;
    expect(t.views.map((v) => [v.id, v.label, Number(v.total)])).toEqual([["escritura", "Escritura", 130], ["contabil", "Contábil", 131.8], ["ifrs16", "Com arrendamentos", 138], ["mercado", "Mercado", 144]]);
    expect(t.crossDefault.chain.map((c) => [c.instrumentId, c.threshold])).toEqual([["ccb-bradesco", "5"], ["debenture-1", "10"]]);
    expect(t.leverage.map((l) => l.label)).toEqual(["Banco", "Escritura"]);
  });
  it("declares an absent mandatory operand as a gap and an absent optional term as null", () => {
    const a = adopt(auroraDebtTableFacts());
    const gapped = sealed(a.entries.filter((e) => !e.fieldPath.endsWith(".instrument.finame.covenant")));
    const input = composeBoundDebtTable({envelope: gapped.envelope, scope: gapped.scope, question});
    const covenant = input.analysis.instruments.find((i) => i.id === "finame")!.terms.covenant;
    expect(covenant.decisionId).toBeNull();
    expect(covenant.missingReason).toBe("No contribution adopted for instrument.finame.covenant in scenario base");
    expect(packetOf(gapped).status).not.toBe("prepared_for_human_review");
    const facts = auroraDebtTableFacts();
    facts.instruments[0]!.value.negativePledgeBasket = null;
    facts.instruments[1]!.value.encumbranceAmount = null; facts.instruments[1]!.value.usesBasketOf = null;
    const composed = composeBoundDebtTable({...(({envelope, scope}) => ({envelope, scope}))(adopt(facts)), question});
    expect(composed.analysis.instruments[0]!.terms.negativePledgeBasket).toBeNull();
    expect(composed.analysis.instruments[1]!.terms.usesBasketOf).toBeNull();
    expect(composed.analysis.instruments[2]!.terms.crossDefaultThreshold).toBeNull();
    const p = prepareDebtTablePacket(composed);
    expect(p.status).toBe("prepared_for_human_review");
    expect(p.readings!.basketsExceeded).toEqual([]);
  });
  it("reports a slot adopted twice as missing, never picking one", () => {
    const a = adopt(auroraDebtTableFacts());
    const cash = a.entries.find((e) => e.fieldPath.endsWith(".availableCash"))!;
    const twice = sealed([...a.entries, {...cash, decisionId: id(9999), slotKey: createHash("sha256").update("second source").digest("hex"), value: {type: "number", value: "30"}}]);
    const input = composeBoundDebtTable({envelope: twice.envelope, scope: twice.scope, question});
    expect(input.analysis.availableCash.decisionId).toBeNull();
    expect(input.analysis.availableCash.missingReason).toBe("2 contributions match availableCash for scenario base; keep one value per slot in the working basis");
    expect(packetOf(twice).status).toBe("partial");
  });
  it("refuses a basis without the analysis", () => {
    const a = adopt(auroraDebtTableFacts()), bare = sealed(a.entries.filter((e) => !e.fieldPath.endsWith(".structure.views")));
    expect(() => composeBoundDebtTable({envelope: bare.envelope, scope: bare.scope, question})).toThrow("debt_table_analysis_missing");
  });
  it("refuses inconsistent facts before proposing premises", () => {
    const refuse = (change: (f: DebtTableFacts) => void, message: string) => {const f = auroraDebtTableFacts(); change(f); expect(() => proposeDebtTableHypotheses(f)).toThrow(message);};
    refuse((f) => {f.creditLines[0]!.value.id = "finame";}, "Duplicate item");
    refuse((f) => {f.instruments[0]!.value.paymentAmounts.pop();}, "must have one amount per payment date");
    refuse((f) => {f.instruments[0]!.value.paymentDates[0] = "2026-06-30";}, "payments must be in order after the reference date");
    refuse((f) => {f.leverage[0]!.value.viewId = "outra";}, "Leverage on an unknown view");
    refuse((f) => {f.views[1]!.value.id = "escritura";}, "Duplicate view");
    refuse((f) => {f.indexRates[1]!.value.indexer = "CDI";}, "Duplicate index rate");
    refuse((f) => {const i = f.instruments[1]!.value; i.crossDefaultAcceleration = "none"; i.crossDefaultScope = null; i.crossDefaultScopeKind = null; i.crossDefaultThresholdBasis = null;},
      "cross-default terms without the clause");
    refuse((f) => {f.instruments[0]!.value.crossDefaultScope = null;}, "cross-default needs scope");
    refuse((f) => {f.instruments[2]!.value.crossDefaultCreditors = null;}, "names creditors exactly when");
    refuse((f) => {f.instruments[0]!.value.negativePledgeBasket = null;}, "uses the basket of debenture-1, which has none");
    refuse((f) => {f.instruments[1]!.value.encumbranceAmount = null;}, "uses a basket without the encumbered amount");
    refuse((f) => {f.creditLines[0]!.value.drawn = "11";}, "drawn above its limit");
    refuse((f) => {f.categoryCoverage.lease.value = "not_examined";}, "Category lease has items but was not examined");
    refuse((f) => {f.instruments[0]!.value.principal = "60.123456789";}, "invalid_format");
  });
  it("refuses a set larger than one working basis", () => {
    const f = auroraDebtTableFacts(), base = f.instruments[2]!;
    for (let k = 0; k < 9; k++) f.instruments.push({...base, value: {...base.value, id: `finame-${k}`}});
    expect(() => proposeDebtTableHypotheses(f)).toThrow("debt_table_premises_exceed_basis");
  });
  it("declares the named creditors missing when the adopted clause is scoped to them", () => {
    const a = adopt(auroraDebtTableFacts()), gapped = sealed(a.entries.filter((e) => !e.fieldPath.endsWith(".instrument.finame.crossDefaultCreditors")));
    const input = composeBoundDebtTable({envelope: gapped.envelope, scope: gapped.scope, question});
    const creditors = input.analysis.instruments.find((i) => i.id === "finame")!.terms.crossDefaultCreditors!;
    expect(creditors.decisionId).toBeNull();
    expect(creditors.missingReason).toBe("No contribution adopted for instrument.finame.crossDefaultCreditors in scenario base");
    expect(prepareDebtTablePacket(input).status).not.toBe("prepared_for_human_review");
    // A clause over any financial debt names no creditors.
    expect(input.analysis.instruments.find((i) => i.id === "ccb-bradesco")!.terms.crossDefaultCreditors).toBeNull();
  });
  it.each(["view.mercado.label", "leverage.escritura.label", "structure.instruments", "structure.views"])("refuses two contributions for the structural slot %s", (suffix) => {
    const a = adopt(auroraDebtTableFacts()), e = a.entries.find((x) => x.fieldPath.endsWith(`.${suffix}`))!;
    const other = sealed([...a.entries, {...e, decisionId: id(9998), slotKey: createHash("sha256").update("other definition").digest("hex"),
      dimensions: {...e.dimensions, definitionVersionId: id(4)}}]);
    expect(() => composeBoundDebtTable({envelope: other.envelope, scope: other.scope, question})).toThrow(/debt_table_(structure|analysis)_ambiguous/);
  });
  it("limits structural ids to forty characters", () => {
    const f = auroraDebtTableFacts(); f.creditLines[0]!.value.id = "a".repeat(41);
    expect(() => proposeDebtTableHypotheses(f)).toThrow("invalid_format");
  });
});
