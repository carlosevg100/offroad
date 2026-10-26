import {beforeAll, describe, expect, it} from "vitest";
import {proposeOperatingProjectionHypotheses, type OperatingProjectionFacts} from "@offroad/financial-model";
import {buildOperatingProjectionPremiseProposal, completeOperatingProjectionFacts, proposeOperatingProjectionPremisesForTurn, shouldProposeOperatingProjectionPremises,
  type OperatingProjectionExtraction} from "./operating-projection-premises-proposal";
import {itemKeys} from "./lote2-premises";
import {comparableHypotheses, financialModelFixture, nonAnswering, summaryGroups, summaryOrigins, turnWithIntent} from "./lote2-premises.test-support";

let aurora: (o?: {informed?: boolean}) => OperatingProjectionFacts;
beforeAll(async () => {aurora = (await financialModelFixture<{auroraProjectionFacts: (o?: {informed?: boolean}) => OperatingProjectionFacts}>("operating-projection.test-support.ts")).auroraProjectionFacts;});
const none = {value: null, origin: null, source: null};
const informed = <T>(value: T, source: string) => ({value, origin: "informed" as const, source});
const document = <T>(value: T, source: string) => ({value, origin: "document" as const, source});
const said = (o: string) => o === "document" ? "document" as const : "informed" as const;

/** The turn of ficha C24 as the extraction would read it: the actual year from the statements, every driver
 * column of the first version, the scenarios discussed and the company's budget and revision. */
function auroraExtraction(f: OperatingProjectionFacts): OperatingProjectionExtraction {
  const year = (d: string) => Number(d.slice(0, 4));
  const label = (id: string) => f.scenarios.find((s) => s.id === id)!.label;
  return {turnIntent: "answers_pending",
    purpose: informed(f.purpose.value, f.purpose.source),
    actualYear: document(year(f.actual.periodEnd), "demonstrações"),
    actualDrivers: Object.entries(f.actual.drivers.value).map(([driver, value]) => ({driver: driver as never, value, origin: said(f.actual.drivers.origin), source: f.actual.drivers.source})),
    reportedRevenue: document(f.actual.reportedRevenue.value, f.actual.reportedRevenue.source), reportedEbitda: document(f.actual.reportedEbitda.value, f.actual.reportedEbitda.source),
    lastProjectedYear: document(year(f.periodEnds.at(-1)!), "horizonte"),
    baseColumns: f.base.map((b) => ({driver: b.driver, values: b.values, origin: "document" as const, source: b.source})),
    scenarios: f.scenarios.map((s) => ({label: s.label, origin: said(s.volumeGrowthRate?.origin ?? s.inputCostShock?.origin ?? s.overrides[0]?.origin ?? "informed"), source: "cenário",
      role: s.role, basedOnLabel: s.basedOn === "base" ? null : label(s.basedOn),
      volumeGrowthRate: s.volumeGrowthRate?.value ?? null, volumeFactor: s.volumeFactor?.value ?? null,
      overrides: s.overrides.map((o) => ({driver: o.driver, values: o.values})),
      inputCostShock: s.inputCostShock ? {fromYear: year(s.inputCostShock.value.fromPeriodEnd), rate: s.inputCostShock.value.rate, passThroughLagMonths: s.inputCostShock.value.passThroughLagMonths} : null})),
    companyVersions: f.companyVersions.map((v) => ({label: v.label, origin: said(v.version.origin), source: v.version.source, status: v.version.value.status,
      year: year(v.version.value.periodEnd), metric: v.version.value.metric, value: v.version.value.value, cause: v.cause.value})),
  };
}
const idsOf = (f: OperatingProjectionFacts) => ({projectionId: f.projectionId, entityId: f.entityId, definitionVersionId: f.definitionVersionId});
const renameOf = (f: OperatingProjectionFacts) => {
  const pairs: [string, string][] = [];
  const add = (items: {label: string; id: string}[]) => itemKeys(items.map((x) => x.label)).forEach((k, n) => pairs.push([k, items[n]!.id]));
  add(f.scenarios); add(f.companyVersions);
  return new Map(pairs);
};
/** Origins are compared apart: the extraction states only document or informed, never house or estimate. */
const values = (h: ReturnType<typeof comparableHypotheses>, rename: ReadonlyMap<string, string> = new Map()) =>
  h.filter((x) => !/\.origins?$/.test(x.fieldPath)).map((x) => ({...x, scenario: rename.get(x.scenario) ?? x.scenario}))
    .sort((a, b) => a.fieldPath.localeCompare(b.fieldPath) || a.scenario.localeCompare(b.scenario));
const complete = (e: OperatingProjectionExtraction, f: OperatingProjectionFacts) => {
  const c = completeOperatingProjectionFacts({extraction: e, ids: idsOf(f), currency: "BRL"});
  if (c.status !== "complete") throw new Error(JSON.stringify(c));
  return c;
};

describe("operating projection premises proposed from a turn", () => {
  it("recognizes the ficha C24 requests, with or without documents, and not orientation or a conceptual question", () => {
    for (const m of ["Não temos projeção pronta. Ajuda a construir uma para discutir o financiamento.", "Me ajuda a montar o business plan.", "Faz uma primeira versão com hipóteses explícitas."])
      for (const docs of [false, true]) expect(shouldProposeOperatingProjectionPremises(m, docs), m).toBe(true);
    for (const m of ["Só me diz como começar uma projeção.", "O que é uma projeção por drivers?", "Monta um deck com a projeção para o banco.", "Esse plano está otimista?", "Fechou o trimestre. Atualiza tudo."])
      for (const docs of [false, true]) expect(shouldProposeOperatingProjectionPremises(m, docs), m).toBe(false);
  });
  it("takes the CFO's corrections as a continuation candidate and refuses questions and another method", () => {
    const earlier = ["Não temos projeção pronta. Ajuda a construir uma para discutir o financiamento."];
    for (const m of ["Volume deve crescer 3% ao ano, a fábrica comporta.", "O repasse do trigo leva uns quatro meses.", "E as duas maiores redes estão pedindo 60 dias."])
      expect(shouldProposeOperatingProjectionPremises(m, false, earlier), m).toBe(true);
    for (const m of ["Quanto pesa o preço?", "Explica o repasse", "Quero antecipar recebíveis em vez de pegar linha no banco."])
      expect(shouldProposeOperatingProjectionPremises(m, false, earlier), m).toBe(false);
  });
  it("completes the Aurora facts and proposes the values the fixture proposes", () => {
    const f = aurora({informed: true}), c = complete(auroraExtraction(f), f);
    expect(c.situationId).toBe("stable-business-high-conversion");
    expect(c.facts.periodEnds).toEqual(f.periodEnds);
    expect(c.housePremiseKeys).toEqual([]);
    expect(values(comparableHypotheses(proposeOperatingProjectionHypotheses(c.facts), renameOf(f)), renameOf(f))).toEqual(values(comparableHypotheses(proposeOperatingProjectionHypotheses(f))));
  });
  it("builds a first version from the last year alone, holding what nobody projected, supplying no stress and naming every house premise", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.baseColumns = e.baseColumns.filter((b) => ["maintenanceCapex", "leasePayments", "depreciation", "interestExpense"].includes(b.driver));
    e.scenarios = []; e.purpose = none; e.lastProjectedYear = none;
    const c = complete(e, f);
    expect(c.facts.periodEnds).toEqual(["2026-12-31", "2027-12-31", "2028-12-31"]);
    const volume = c.facts.base.find((b) => b.driver === "volume")!;
    expect([volume.values, volume.origins]).toEqual([["105", "105", "105"], ["estimate", "estimate", "estimate"]]);
    expect(c.facts.base.find((b) => b.driver === "taxRate")!.origins).toEqual(["house", "house", "house"]);
    // No alternative described: the house supplies no stress and the reply asks which alternatives to test.
    expect(c.facts.scenarios).toEqual([]);
    expect(proposeOperatingProjectionHypotheses(c.facts).some((h) => /\.scenario\./.test(h.fieldPath) || /shock|volumeFactor/.test(h.fieldPath))).toBe(false);
    expect(c.housePremiseKeys.sort()).toEqual(["alternativesToTest", "heldDrivers", "horizon", "purpose", "taxRate"]);
  });
  it("asks for what nobody stated in one batch instead of assuming it", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.reportedEbitda = none; e.actualDrivers = e.actualDrivers.filter((d) => d.driver !== "fixedCosts");
    e.baseColumns = e.baseColumns.filter((b) => b.driver !== "interestExpense");
    e.scenarios[0]!.basedOnLabel = "Cenário inexistente";
    expect(completeOperatingProjectionFacts({extraction: e, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing",
      missing: ["reportedEbitda", "actual.fixedCosts", "baseColumns.interestExpense", "scenarios.1.basedOnLabel"]});
    const noYear = auroraExtraction(f); noYear.actualYear = none;
    expect(completeOperatingProjectionFacts({extraction: noYear, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing", missing: ["actualYear"]});
  });
  it("builds the card summary, field paths the store accepts and a stable fingerprint", () => {
    const f = aurora({informed: true}), c = complete(auroraExtraction(f), f);
    const proposal = buildOperatingProjectionPremiseProposal(c.facts);
    expect(proposal.summary).toMatchObject({situationId: "stable-business-high-conversion", referenceDate: "2025-12-31"});
    expect(proposal.summary.items.every((x) => summaryGroups.includes(x.group) && summaryOrigins.includes(x.origin) && x.label.length > 0 && x.source.length > 0
      && Object.keys(x).sort().join() === "group,label,labelKey,origin,source")).toBe(true);
    expect(proposal.summary.items.filter((x) => x.group === "driver").map((x) => x.labelKey)).toHaveLength(13);
    expect(proposal.summary.items.filter((x) => x.group === "scenario")).toHaveLength(f.scenarios.length);
    expect(proposal.hypotheses.length).toBeLessThanOrEqual(256);
    expect(proposal.hypotheses.every((h) => /^operating_projection\.[0-9a-f-]{36}\.[A-Za-z0-9_.-]{1,200}$/.test(h.fieldPath) && h.dimensions.entityId === null && /^Origem: /.test(h.reason))).toBe(true);
    expect(buildOperatingProjectionPremiseProposal(c.facts).fingerprint).toBe(proposal.fingerprint);
    expect(proposal).toMatchObject({methodId: "build-operating-projection", methodVersion: "2026.10.26-v1"});
  });
  it("proposes only when the extraction reads the turn as answering, on a continuation and on a direct request alike", async () => {
    const earlier = ["Não temos projeção pronta. Ajuda a construir uma para discutir o financiamento."];
    for (const intent of nonAnswering) {
      const r = await turnWithIntent(proposeOperatingProjectionPremisesForTurn, auroraExtraction(aurora()), intent, "Mando o orçamento amanhã", earlier);
      expect(r, intent).toEqual({extracted: true, status: null, events: ["operating_projection_premises.not_answering"]});
    }
    expect(await turnWithIntent(proposeOperatingProjectionPremisesForTurn, auroraExtraction(aurora()), "answers_pending", earlier[0]!, [])).toMatchObject({status: "proposed"});
    expect(await turnWithIntent(proposeOperatingProjectionPremisesForTurn, auroraExtraction(aurora()), "answers_pending", "E quanto pesa o preço?", earlier)).toEqual({extracted: false, status: null, events: []});
  });
});
