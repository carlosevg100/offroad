import {beforeAll, describe, expect, it} from "vitest";
import {proposeQuarterUpdateHypotheses, type QuarterUpdateFacts} from "@offroad/financial-model";
import {buildQuarterUpdatePremiseProposal, completeQuarterUpdateFacts, priorMeasurements, priorStreams, proposeQuarterUpdatePremisesForTurn,
  shouldProposeQuarterUpdatePremises, type QuarterUpdateExtraction} from "./quarter-update-premises-proposal";
import {itemKeys} from "./lote2-premises";
import {comparableHypotheses, financialModelFixture, nonAnswering, summaryGroups, summaryOrigins} from "./lote2-premises.test-support";
import weeklyPacket from "../../../packages/domain-contracts/src/fixtures/weekly-cash-result-packet.json";

let aurora: (w: string, c: string) => QuarterUpdateFacts;
beforeAll(async () => {aurora = (await financialModelFixture<{auroraQuarterUpdateFacts: (w: string, c: string) => QuarterUpdateFacts}>("quarter-update.test-support.ts")).auroraQuarterUpdateFacts;});
const said = (o: string) => o === "document" ? "document" as const : "informed" as const;
const hex = (c: string) => c.repeat(64);
/** The prior results as the worker reads them: the lote 2 weekly cash packet and a covenant test with the indenture and the managerial reading in December. */
const priors = () => ({
  weeklyCash: {executionId: "a0000000-0000-4000-8000-000000000071", resultFingerprint: hex("1"), envelopeFingerprint: hex("a"), packet: weeklyPacket as unknown as Record<string, unknown>,
    streamIds: ["recebimentos", "insumos", "linha-17", "folha"]},
  covenant: {executionId: "a0000000-0000-4000-8000-000000000072", resultFingerprint: hex("2"), envelopeFingerprint: hex("b"), packet: {
    readings: {headline: {measurementId: "dez26-base"}},
    result: {headroom: {measurements: [{id: "dez26-adverso", label: "Adverso", role: "test", date: "2026-12-31"}, {id: "dez26-base", label: "Escritura", role: "test", date: "2026-12-31"},
      {id: "junho-gerencial", label: "Junho gerencial", role: "contrast", date: "2026-06-30"}, {id: "dez26-gerencial", label: "Gerencial", role: "test", date: "2026-12-31"},
      {id: "dez27-base", label: "Dezembro de 2027", role: "test", date: "2027-12-31"}]}}}},
});

/** The turn of ficha C54 as the extraction would read it from the balancete, the managerial close and the conversation. */
function auroraExtraction(f: QuarterUpdateFacts): QuarterUpdateExtraction {
  const lineLabel = (id: string | null) => id === null ? null : f.lines.find((l) => l.value.id === id)!.value.label;
  const causes = f.bridges.flatMap((b) => b.causes.map((c) => ({c, lineId: b.lineId})));
  const causeLabel = (id: string) => causes.find((x) => x.c.value.id === id)!.c.value.label;
  return {turnIntent: "answers_pending",
    quarterStart: {value: f.quarterStart, origin: "document", source: "balancete"}, quarterEnd: {value: f.quarterEnd, origin: "document", source: "balancete"},
    lines: f.lines.map((l) => ({label: l.value.label, origin: said(l.origin), source: l.source, unit: l.value.unit, projected: l.value.projected, actual: l.value.actual})),
    cashLineLabel: {value: lineLabel(f.carry.value.cashLineId)!, origin: "document", source: "balancete"},
    ebitdaLineLabel: {value: lineLabel(f.carry.value.ebitdaLineId)!, origin: "document", source: "balancete"},
    causes: causes.map(({c, lineId}) => ({label: c.value.label, origin: said(c.origin), source: c.source, lineLabel: lineLabel(lineId)!, amount: c.value.amount,
      classification: c.value.classification, until: c.value.until, nature: c.value.nature, basis: c.value.basis, question: c.value.question,
      equalsDeviationOfLabel: lineLabel(c.value.equalsDeviationOf), driverLineLabel: lineLabel(c.value.driverLineId)})),
    streamUpdates: f.streamUpdates.map((u) => ({streamId: u.value.streamId, causeLabels: u.value.causeIds.map(causeLabel), kind: u.value.transform.kind,
      factor: u.value.transform.kind === "scale" ? u.value.transform.factor : null, days: u.value.transform.kind === "delay" ? u.value.transform.days : null, origin: "informed", source: u.source})),
    addedStreams: f.addedStreams.map((s) => ({label: s.value.label, origin: "informed", source: s.source, events: s.value.dates.map((date, k) => ({date, amount: s.value.amounts[k]!}))})),
    facilities: f.facilities.map((x) => ({label: x.value.label, origin: said(x.origin), source: x.source, limit: x.value.limit, approval: x.value.source})),
    steps: f.steps.map((s) => {
      const facilityLabel = f.facilities.find((x) => x.value.id === s.value.facilityId)!.value.label;
      return s.value.mode === "fixed"
        ? {facilityLabel, mode: "fixed" as const, addedStreamLabel: f.addedStreams.find((a) => a.value.id === (s.value as {streamId: string}).streamId)!.value.label,
          replacesStreamIds: (s.value as {replacesStreamIds: string[]}).replacesStreamIds, date: null, origin: "informed" as const, source: s.source}
        : {facilityLabel, mode: "residual" as const, addedStreamLabel: null, replacesStreamIds: [], date: (s.value as {date: string}).date, origin: "informed" as const, source: s.source};
    }),
    covenantMeasurementIds: f.covenant.value.measurementIds,
    dependents: f.dependents.map((d) => ({label: d.value.label, origin: "informed", source: d.source, kind: d.value.kind, readsLineLabels: d.value.reads.map((r) => lineLabel(r)!),
      horizonStart: d.value.horizonStart, horizonEnd: d.value.horizonEnd, recomputedBy: d.value.recomputedBy, owner: d.value.owner, quantities: d.value.quantities,
      definition: d.value.definition, scenario: d.value.scenario})),
  };
}
const ids = {updateId: "a0000000-0000-4000-8000-000000009100", entityId: "a0000000-0000-4000-8000-000000000001", definitionVersionId: "a0000000-0000-4000-8000-000000000003"};
const renameOf = (f: QuarterUpdateFacts) => {
  const pairs: [string, string][] = [];
  const add = (items: {label: string; id: string}[]) => itemKeys(items.map((x) => x.label)).forEach((k, n) => pairs.push([k, items[n]!.id]));
  add(f.lines.map((l) => l.value)); add(f.bridges.flatMap((b) => b.causes.map((c) => c.value))); add(f.addedStreams.map((s) => s.value));
  add(f.facilities.map((x) => x.value)); add(f.dependents.map((d) => d.value));
  return new Map(pairs);
};
/** The calibration is in BRL millions; the house floor is R$ 1,000 in reais, so it is compared apart. */
const withoutFloor = (h: ReturnType<typeof comparableHypotheses>) => h.filter((x) => !x.fieldPath.endsWith(".materialityFloor"));
const complete = (e: QuarterUpdateExtraction, with_ = ids) => {
  const c = completeQuarterUpdateFacts({extraction: e, priors: priors(), ids: with_, currency: "BRL"});
  if (c.status !== "complete") throw new Error(JSON.stringify(c));
  return c;
};

describe("quarter update premises proposed from a turn", () => {
  it("recognizes the ficha C54 requests, with or without documents, and not a conceptual question", () => {
    for (const m of ["Fechou o trimestre. Atualiza tudo.", "Saiu o balancete de setembro, atualiza a projeção e o covenant.", "O que mudou com o resultado do terceiro trimestre?"])
      for (const docs of [false, true]) expect(shouldProposeQuarterUpdatePremises(m, docs), m).toBe(true);
    for (const m of ["Como funciona um fechamento trimestral?", "Prepara o memorando do trimestre para o conselho.", "Quando é a semana mais apertada?"])
      for (const docs of [false, true]) expect(shouldProposeQuarterUpdatePremises(m, docs), m).toBe(false);
    expect(shouldProposeQuarterUpdatePremises("Os 54 dias são prazo negociado com as redes.", false, ["Fechou o trimestre. Atualiza tudo."])).toBe(true);
  });
  it("reads the prior streams and measurements from the recorded results, the headline first", () => {
    const p = priors();
    expect(priorStreams(p.weeklyCash).slice(0, 3)).toEqual([{id: "recebimentos", label: "recebimentos"}, {id: "insumos", label: "Fornecedores de insumos"}, {id: "linha-17", label: "linha-17"}]);
    expect(priorMeasurements(p.covenant).map((m) => m.id)).toEqual(["dez26-base", "dez26-adverso", "dez26-gerencial", "dez27-base", "junho-gerencial"]);
  });
  it("completes the Aurora close and proposes the hypotheses the fixture proposes, naming the recorded prior results", () => {
    const f = aurora(hex("a"), hex("b")), c = complete(auroraExtraction(f), {updateId: f.updateId, entityId: f.entityId, definitionVersionId: f.definitionVersionId});
    expect(c.situationId).toBe("near-covenant");
    expect([c.facts.priorWeeklyFingerprint, c.facts.priorCovenantFingerprint].map((x) => [x.value, x.origin])).toEqual([[hex("a"), "document"], [hex("b"), "document"]]);
    expect(c.facts.materialityFloor).toMatchObject({value: "1000", origin: "house"});
    expect(c.housePremiseKeys).toEqual(["materialityFloor"]);
    expect(withoutFloor(comparableHypotheses(proposeQuarterUpdateHypotheses(c.facts), renameOf(f)))).toEqual(withoutFloor(comparableHypotheses(proposeQuarterUpdateHypotheses(f))));
  });
  it("takes the December tests of the headline date when the close names no measurement", () => {
    const e = auroraExtraction(aurora(hex("a"), hex("b"))); e.covenantMeasurementIds = [];
    const c = complete(e);
    expect(c.facts.covenant.value.measurementIds).toEqual(["dez26-base", "dez26-adverso", "dez26-gerencial"]);
    expect(c.housePremiseKeys).toContain("covenantMeasurements");
  });
  it("asks for what nobody stated in one batch, and refuses a stream or a measurement the prior results do not carry", () => {
    const e = auroraExtraction(aurora(hex("a"), hex("b")));
    e.cashLineLabel = {value: null, origin: null, source: null}; e.streamUpdates[0]!.streamId = "nao-existe"; e.covenantMeasurementIds = ["dez29-base"];
    e.causes[0]!.until = "2026-12-31";
    expect(completeQuarterUpdateFacts({extraction: e, priors: priors(), ids, currency: "BRL"})).toEqual({status: "missing",
      missing: ["cashLineLabel", "causes.1.until", "streamUpdates.1.streamId", "covenantMeasurementIds"]});
  });
  it("builds the card summary, field paths the store accepts and a stable fingerprint", () => {
    const c = complete(auroraExtraction(aurora(hex("a"), hex("b")))), proposal = buildQuarterUpdatePremiseProposal(c.facts);
    expect(proposal.summary).toMatchObject({situationId: "near-covenant", referenceDate: "2026-09-30"});
    expect(proposal.summary.items.every((x) => summaryGroups.includes(x.group) && summaryOrigins.includes(x.origin))).toBe(true);
    expect(proposal.summary.items.slice(0, 2).map((x) => x.labelKey)).toEqual(["priorWeeklyCash", "priorCovenant"]);
    expect(proposal.hypotheses.length).toBeLessThanOrEqual(256);
    expect(proposal.hypotheses.every((h) => /^quarter_update\.[0-9a-f-]{36}\.[A-Za-z0-9_.-]{1,200}$/.test(h.fieldPath))).toBe(true);
    expect(buildQuarterUpdatePremiseProposal(c.facts).fingerprint).toBe(proposal.fingerprint);
    expect(proposal).toMatchObject({methodId: "update-after-quarter-close", methodVersion: "2026.10.26-v1"});
  });
  it("proposes nothing and names the missing prior result before any extraction", async () => {
    const run = async (loaded: unknown, intent = "answers_pending") => {
      const events: string[] = []; let extracted = false;
      const result = await proposeQuarterUpdatePremisesForTurn({message: "Fechou o trimestre. Atualiza tudo.", hasAttachments: true, recentUserMessages: [],
        projectId: "a0000000-0000-4000-8000-000000000001", loadEvidence: async () => [], loadPriors: async () => loaded,
        extract: async () => {extracted = true; return {...auroraExtraction(aurora(hex("a"), hex("b"))), turnIntent: intent};}, log: (event) => {events.push(event);}});
      return {extracted, result, events};
    };
    expect(await run({weeklyCash: null, covenant: priors().covenant})).toEqual({extracted: false, events: ["quarter_update_premises.priors_missing"],
      result: {forAdvisor: {status: "missing", missing: ["priorWeeklyCash"]}, proposal: null}});
    expect((await run({weeklyCash: null, covenant: null})).result?.forAdvisor).toEqual({status: "missing", missing: ["priorWeeklyCash", "priorCovenant"]});
    const answered = await run(priors());
    expect([answered.extracted, answered.result?.forAdvisor.status, answered.events]).toEqual([true, "proposed", ["quarter_update_premises.proposed"]]);
    for (const intent of nonAnswering) expect((await run(priors(), intent)).events, intent).toEqual(["quarter_update_premises.not_answering"]);
  });
});
