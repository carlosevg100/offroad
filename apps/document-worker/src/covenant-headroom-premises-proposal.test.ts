import {beforeAll, describe, expect, it} from "vitest";
import {proposeCovenantHeadroomHypotheses, type CovenantHeadroomFacts} from "@offroad/financial-model";
import {buildCovenantHeadroomPremiseProposal, completeCovenantHeadroomFacts, shouldProposeCovenantHeadroomPremises, type CovenantHeadroomExtraction} from "./covenant-headroom-premises-proposal";
import {itemKeys} from "./lote2-premises";
import {comparableHypotheses, financialModelFixture, summaryGroups, summaryOrigins} from "./lote2-premises.test-support";

type Fixture = (options?: {policyDefinition?: string | null; policyOnManagerial?: boolean}) => CovenantHeadroomFacts;
let aurora: Fixture;
beforeAll(async () => {aurora = (await financialModelFixture<{auroraCovenantFacts: Fixture}>("covenant-headroom.test-support.ts")).auroraCovenantFacts;});
const none = {value: null, origin: null, source: null};
const informed = <T>(value: T, source: string) => ({value, origin: "informed" as const, source});
const extracted = (x: {origin: string; source: string}) => ({origin: x.origin === "informed" ? "informed" as const : "document" as const, source: x.source});

/** The turn of ficha C12 as the extraction would read it from the indenture, the board minute and the quarterly plan. */
function auroraExtraction(f: CovenantHeadroomFacts): CovenantHeadroomExtraction {
  const limitLabel = (id: string) => f.limits.find((l) => l.term.value.id === id)!.term.value.label;
  const measurementLabel = (id: string) => f.measurements.find((m) => m.value.id === id)!.value.label;
  return {
    readingDate: informed(f.readingDate, "data da pergunta"),
    headlineMeasurement: {...informed(measurementLabel(f.headline.value), f.headline.source)},
    limits: f.limits.map((l) => ({label: l.term.value.label, ...extracted(l.term), kind: l.term.value.kind, status: l.term.value.status,
      maximumRatio: Number(l.term.value.maximumRatio), testDates: l.term.value.testDates,
      definition: {value: l.definition.value, ...extracted(l.definition)}})),
    measurements: f.measurements.map((m) => ({label: m.value.label, ...extracted(m), role: m.value.role, scenario: m.value.scenario,
      limitLabels: m.value.limitIds.map(limitLabel), date: m.value.date, debt: m.value.debt, cash: m.value.cash, reportedEbitda: m.value.reportedEbitda,
      adjustments: m.value.adjustments.map((a) => ({label: a.label, amount: a.amount})), unrealizedEbitda: m.value.unrealizedEbitda})),
    effects: f.effects.map((x) => ({label: x.value.label, withLabel: measurementLabel(x.value.measurementId), withoutLabel: measurementLabel(x.value.withoutEffectMeasurementId)})),
    consequence: {acceleration: {value: f.consequence.acceleration!.value, ...extracted(f.consequence.acceleration!)},
      process: {value: f.consequence.process!.value, ...extracted(f.consequence.process!)}, crossDefault: {value: f.consequence.crossDefault!.value, ...extracted(f.consequence.crossDefault!)}},
  };
}
const idsOf = (f: CovenantHeadroomFacts) => ({headroomId: f.headroomId, entityId: f.entityId, definitionVersionId: f.definitionVersionId});
const renameOf = (f: CovenantHeadroomFacts) => {
  const pairs: [string, string][] = [];
  const add = (items: {label: string; id: string}[]) => itemKeys(items.map((x) => x.label), 40).forEach((k, n) => pairs.push([k, items[n]!.id]));
  add(f.limits.map((l) => l.term.value)); add(f.measurements.map((m) => m.value)); add(f.effects.map((x) => x.value));
  for (const m of f.measurements) add(m.value.adjustments);
  return new Map(pairs);
};
const complete = (e: CovenantHeadroomExtraction, f: CovenantHeadroomFacts) => {
  const c = completeCovenantHeadroomFacts({extraction: e, ids: idsOf(f), currency: "BRL"});
  if (c.status !== "complete") throw new Error(JSON.stringify(c));
  return c;
};

describe("covenant headroom premises proposed from a turn", () => {
  it("recognizes the ficha C12 questions, with or without documents, and not a conceptual question", () => {
    for (const m of ["Como estamos contra os covenants?", "Qual a folga do covenant da debênture em dezembro?", "A gente corre risco de estourar o covenant?", "Calcula o covenant na definição da escritura."])
      for (const docs of [false, true]) expect(shouldProposeCovenantHeadroomPremises(m, docs), m).toBe(true);
    for (const m of ["O que é covenant?", "O que significa covenant financeiro?", "Qual o prazo da debênture?", "Monta a tabela de dívida com tudo que temos.", "Prepara a minuta do waiver do covenant."])
      for (const docs of [false, true]) expect(shouldProposeCovenantHeadroomPremises(m, docs), m).toBe(false);
  });
  it("continues the question when the next message answers with covenant data", () => {
    const earlier = ["Qual a folga do covenant da debênture em dezembro?"];
    expect(shouldProposeCovenantHeadroomPremises("O limite é 3x e o EBITDA de dezembro é R$ 54,5 milhões", false, earlier)).toBe(true);
    expect(shouldProposeCovenantHeadroomPremises("O limite é 3x, certo?", false, earlier)).toBe(true);
    for (const m of ["A ata não define o EBITDA da política.", "O vencimento antecipado não é automático, depende de assembleia."]) expect(shouldProposeCovenantHeadroomPremises(m, false, earlier), m).toBe(true);
    for (const m of ["Me explica a definição de EBITDA", "A definição é a da CVM?"]) expect(shouldProposeCovenantHeadroomPremises(m, false, earlier), m).toBe(false);
    expect(shouldProposeCovenantHeadroomPremises("Qual é o limite da escritura?", false, earlier)).toBe(false);
    expect(shouldProposeCovenantHeadroomPremises("Mando a ata em 2 dias", false, earlier)).toBe(false);
    expect(shouldProposeCovenantHeadroomPremises("O limite é 3x", false, ["Qual o prazo da debênture?"])).toBe(false);
    expect(shouldProposeCovenantHeadroomPremises("O limite é 3x", false, [...earlier, "Quanto de dívida cabe para o capex?"])).toBe(false);
  });
  it("completes the Aurora facts and proposes the hypotheses the fixture proposes", () => {
    const f = aurora(), c = complete(auroraExtraction(f), f);
    expect(c.situationId).toBe("near-covenant");
    expect(c.facts.headline).toMatchObject({value: itemKeys(f.measurements.map((m) => m.value.label), 40)[0], origin: "informed"});
    expect(c.facts.limits[1]!.definition).toMatchObject({value: null, origin: "document"});
    expect(c.facts.effects.map((x) => x.origin)).toEqual(["house"]);
    expect(c.housePremiseKeys).toEqual(["effectAsDifference"]);
    expect(comparableHypotheses(proposeCovenantHeadroomHypotheses(c.facts), renameOf(f))).toEqual(comparableHypotheses(proposeCovenantHeadroomHypotheses(f)));
  });
  it("frames a test off its limit's dates as a contrast and takes the first test after the reading as the headline when none was asked", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.headlineMeasurement = none;
    e.measurements.find((m) => m.label === "junho-gerencial")!.role = "test";
    e.measurements.find((m) => m.label === "junho-gerencial")!.limitLabels = [e.limits[0]!.label];
    const c = complete(e, f);
    expect(c.facts.measurements.find((m) => m.value.label === "junho-gerencial")!.value.role).toBe("contrast");
    expect(c.facts.headline).toMatchObject({value: "dez26-base", origin: "house"});
    expect(c.housePremiseKeys).toContain("headline");
  });
  it("asks for what nobody stated in one batch instead of assuming it", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.readingDate = none; e.limits[0]!.maximumRatio = null; e.limits[1]!.definition = none; e.measurements[0]!.cash = null;
    expect(completeCovenantHeadroomFacts({extraction: e, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing",
      missing: ["readingDate", "limits.1.maximumRatio", "limits.2.definition", "measurements.1.cash"]});
    const untested = auroraExtraction(f);
    untested.measurements = untested.measurements.filter((m) => !m.limitLabels.includes(untested.limits[1]!.label) || m.label === "dez26-sem-safra");
    untested.effects = [];
    expect(completeCovenantHeadroomFacts({extraction: untested, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing", missing: ["limits.1.test", "limits.2.test"]});
    const empty = auroraExtraction(f); empty.limits = []; empty.measurements = []; empty.effects = [];
    expect(completeCovenantHeadroomFacts({extraction: empty, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing", missing: ["limits", "measurements"]});
  });
  it("builds the card summary, field paths the store accepts and a stable fingerprint", () => {
    const f = aurora(), c = complete(auroraExtraction(f), f);
    const proposal = buildCovenantHeadroomPremiseProposal(c.facts);
    expect(Object.keys(proposal.summary).sort()).toEqual(["items", "referenceDate", "situationId"]);
    expect(proposal.summary).toMatchObject({situationId: "near-covenant", referenceDate: "2026-09-15"});
    expect(proposal.summary.items.every((x) => summaryGroups.includes(x.group) && summaryOrigins.includes(x.origin) && x.label.length > 0 && x.source.length > 0
      && Object.keys(x).sort().join() === "group,label,labelKey,origin,source")).toBe(true);
    expect(proposal.summary.items.map((x) => x.group)).toEqual([...f.limits.map(() => "limit"), ...f.measurements.map(() => "measurement"), "premise", "premise", "premise"]);
    expect(proposal.summary.items.find((x) => x.group === "premise")).toMatchObject({label: "Vencimento antecipado não automático", labelKey: "accelerationNonAutomatic"});
    expect(proposal.summary.items.filter((x) => x.group !== "premise").every((x) => x.labelKey === null)).toBe(true);
    expect(proposal.summary.items.filter((x) => x.group === "premise").slice(1).every((x) => x.labelKey === null)).toBe(true);
    expect(proposal.hypotheses.length).toBeLessThanOrEqual(256);
    expect(proposal.hypotheses.every((h) => /^covenant\.[0-9a-f-]{36}\.[A-Za-z0-9_.-]{1,200}$/.test(h.fieldPath) && h.dimensions.entityId === null && /^Origem: /.test(h.reason))).toBe(true);
    expect(buildCovenantHeadroomPremiseProposal(c.facts).fingerprint).toBe(proposal.fingerprint);
    const changed = complete({...auroraExtraction(f), readingDate: informed("2026-09-16", "data da pergunta")}, f);
    expect(buildCovenantHeadroomPremiseProposal(changed.facts).fingerprint).not.toBe(proposal.fingerprint);
    expect(proposal).toMatchObject({methodId: "measure-covenant-headroom", methodVersion: "2026.10.23-v1"});
  });
});
