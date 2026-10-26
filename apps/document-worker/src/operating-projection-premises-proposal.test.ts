import {beforeAll, describe, expect, it} from "vitest";
import {operatingProjectionDriverUnits, proposeOperatingProjectionHypotheses, type OperatingProjectionFacts} from "@offroad/financial-model";
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
  it("records a cause nobody stated under the house, never under the version's document (independent review, round 2)", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.companyVersions[0]!.cause = null;
    const c = complete(e, f);
    expect(c.facts.companyVersions[0]!.cause).toMatchObject({value: null, origin: "house"});
    expect(c.facts.companyVersions[0]!.version.origin).toBe("document");
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
  it("asks for a driver stated twice with different values, in either order, never picking one (independent review, round 8)", () => {
    const f = aurora(), base = auroraExtraction(f), volume = base.baseColumns.find((c) => c.driver === "volume")!;
    const other = {...volume, values: volume.values.map((v) => String(Number(v) * 2)), source: "outra planilha"};
    for (const columns of [[...base.baseColumns, other], [other, ...base.baseColumns]]) {
      const c = completeOperatingProjectionFacts({extraction: {...base, baseColumns: columns}, ids: idsOf(f), currency: "BRL"});
      expect(c).toEqual({status: "missing", missing: ["baseColumns.volume"]});
    }
    // The same column stated twice with the same values is one fact.
    expect(completeOperatingProjectionFacts({extraction: {...base, baseColumns: [...base.baseColumns, {...volume}]}, ids: idsOf(f), currency: "BRL"}).status).toBe("complete");
    const actual = {...base.actualDrivers[0]!, value: String(Number(base.actualDrivers[0]!.value) + 1)};
    expect(completeOperatingProjectionFacts({extraction: {...base, actualDrivers: [...base.actualDrivers, actual]}, ids: idsOf(f), currency: "BRL"}))
      .toEqual({status: "missing", missing: [`actual.${actual.driver}`]});
    const scenario = base.scenarios.find((x) => x.overrides.length)!, k = base.scenarios.indexOf(scenario);
    const twice = {...scenario, overrides: [...scenario.overrides, {...scenario.overrides[0]!, values: scenario.overrides[0]!.values.map((v) => String(Number(v) + 1))}]};
    expect(completeOperatingProjectionFacts({extraction: {...base, scenarios: base.scenarios.map((x, n) => n === k ? twice : x)}, ids: idsOf(f), currency: "BRL"}))
      .toEqual({status: "missing", missing: [`scenarios.${k + 1}.overrides`]});
    if (base.companyVersions.length) {
      const v = base.companyVersions[0]!, clash = {...v, label: "Outra versão", value: String(Number(v.value) + 1)};
      expect(completeOperatingProjectionFacts({extraction: {...base, companyVersions: [...base.companyVersions, clash]}, ids: idsOf(f), currency: "BRL"}))
        .toEqual({status: "missing", missing: [`companyVersions.${v.status}.${v.year}.${v.metric}`]});
    }
  });
  it("names the basis limit as a gap in the turn instead of dropping the card (independent review, round 8)", async () => {
    const f = aurora(), e = auroraExtraction(f), n = e.baseColumns[0]!.values.length;
    const drivers = Object.keys(operatingProjectionDriverUnits) as OperatingProjectionExtraction["baseColumns"][number]["driver"][];
    e.scenarios = Array.from({length: 10}, (_, k) => ({label: `Cenário ${k + 1}`, origin: "informed" as const, source: "cenário", role: "alternative" as const, basedOnLabel: null,
      volumeGrowthRate: null, volumeFactor: null, inputCostShock: null,
      overrides: drivers.map((driver) => ({driver, values: e.baseColumns.find((c) => c.driver === driver)?.values ?? Array.from({length: n}, () => "1")}))}));
    expect(completeOperatingProjectionFacts({extraction: e, ids: idsOf(f), currency: "BRL"})).toMatchObject({status: "complete"});
    const events: string[] = [];
    const turn = await proposeOperatingProjectionPremisesForTurn({message: "Me ajuda a montar o business plan.", hasAttachments: false, recentUserMessages: [],
      projectId: "a0000000-0000-4000-8000-000000000001", loadEvidence: async () => [], extract: async () => e, log: (event) => {events.push(event);}});
    expect(turn).toEqual({forAdvisor: {status: "missing", missing: ["tooManyItems"]}, proposal: null});
    expect(events).toEqual(["operating_projection_premises.expansion_refused"]);
  });
  it("never turns absence into zero: every optional operand absent is asked or a named house premise (independent review, round 9)", () => {
    const f = aurora(), base = auroraExtraction(f);
    // A scenario described with no rule, no override and no shock is asked, never run as the base with zero effect.
    const empty = {...base.scenarios[0]!, label: "Alta do insumo", basedOnLabel: null, volumeGrowthRate: null, volumeFactor: null, overrides: [], inputCostShock: null};
    expect(completeOperatingProjectionFacts({extraction: {...base, scenarios: [...base.scenarios, empty]}, ids: idsOf(f), currency: "BRL"}))
      .toEqual({status: "missing", missing: [`scenarios.${base.scenarios.length + 1}.parameters`]});
    // Every other optional operand absent: drivers with no last-year value are asked; the rest are house premises, each named.
    const bare = {...base, purpose: none, lastProjectedYear: none, baseColumns: [], scenarios: [], companyVersions: []};
    expect(completeOperatingProjectionFacts({extraction: bare, ids: idsOf(f), currency: "BRL"}))
      .toEqual({status: "missing", missing: ["baseColumns.maintenanceCapex", "baseColumns.leasePayments", "baseColumns.depreciation", "baseColumns.interestExpense"]});
    const columns = ["maintenanceCapex", "leasePayments", "depreciation", "interestExpense"].map((driver) => ({driver: driver as never, values: ["1", "1", "1"], origin: "informed" as const, source: "CFO"}));
    const c = completeOperatingProjectionFacts({extraction: {...bare, baseColumns: columns}, ids: idsOf(f), currency: "BRL"});
    expect(c.status === "complete" ? [...c.housePremiseKeys].sort() : c).toEqual(["alternativesToTest", "heldDrivers", "horizon", "purpose", "taxRate"]);
  });
  it("never replaces a stated horizon with the house default, nor drops a value stated without origin (independent review, round 11)", () => {
    const f = aurora(), base = auroraExtraction(f), year = base.actualYear.value!;
    for (const last of [year, year - 1]) {
      const c = completeOperatingProjectionFacts({extraction: {...base, lastProjectedYear: {value: last, origin: "informed", source: "CFO"}}, ids: idsOf(f), currency: "BRL"});
      expect(c.status === "missing" && c.missing.includes("lastProjectedYear"), String(last)).toBe(true);
    }
    // Only absence takes the house's three years.
    const columns = base.baseColumns.map((c) => ({...c, values: c.values.slice(0, 3)}));
    const none3 = completeOperatingProjectionFacts({extraction: {...base, lastProjectedYear: none, baseColumns: columns, scenarios: [], companyVersions: []}, ids: idsOf(f), currency: "BRL"});
    expect(none3.status === "complete" ? none3.housePremiseKeys.includes("horizon") : none3).toBe(true);
    const unsourced = completeOperatingProjectionFacts({extraction: {...base, lastProjectedYear: {value: year + 3, origin: null, source: null}}, ids: idsOf(f), currency: "BRL"});
    expect(unsourced.status === "missing" && unsourced.missing.includes("lastProjectedYear")).toBe(true);
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
