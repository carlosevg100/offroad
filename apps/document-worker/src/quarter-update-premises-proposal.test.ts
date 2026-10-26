import {beforeAll, describe, expect, it} from "vitest";
import {proposeQuarterUpdateHypotheses, type QuarterUpdateFacts} from "@offroad/financial-model";
import {quarterUpdateContradictions, amountInReais, buildQuarterUpdatePremiseProposal, quarterUpdateReaderGaps, completeQuarterUpdateFacts, priorMeasurements, priorStreams, proposeQuarterUpdatePremisesForTurn,
  shouldProposeQuarterUpdatePremises, type QuarterUpdateExtraction, priorResultPins} from "./quarter-update-premises-proposal";
import {factsOrGaps, itemKeys} from "./lote2-premises";
import {z} from "zod";
import {auroraQuarterUpdatePriors, comparableHypotheses, financialModelFixture, nonAnswering, summaryGroups, summaryOrigins} from "./lote2-premises.test-support";
import weeklyPacket from "../../../packages/domain-contracts/src/fixtures/weekly-cash-result-packet.json";

let aurora: (w: string, c: string) => QuarterUpdateFacts;
beforeAll(async () => {aurora = (await financialModelFixture<{auroraQuarterUpdateFacts: (w: string, c: string) => QuarterUpdateFacts}>("quarter-update.test-support.ts")).auroraQuarterUpdateFacts;});
const said = (o: string) => o === "document" ? "document" as const : "informed" as const;
const hex = (c: string) => c.repeat(64);
/** The prior results as the worker reads them: the stored inputs of the Aurora prior weekly cash and covenant, adopted
 * on their own bases (W and C are their fingerprints), and the packets the card reads. */
let stored: Awaited<ReturnType<typeof auroraQuarterUpdatePriors>>, W = "", C = "";
beforeAll(async () => {stored = await auroraQuarterUpdatePriors(weeklyPacket as unknown as Record<string, unknown>); W = stored.weeklyCash.envelopeFingerprint; C = stored.covenant.envelopeFingerprint;});
const priors = () => structuredClone(stored);

/** The turn of ficha C54 as the extraction would read it from the balancete, the managerial close and the conversation. */
function auroraExtraction(f: QuarterUpdateFacts): QuarterUpdateExtraction {
  const lineLabel = (id: string | null) => id === null ? null : f.lines.find((l) => l.value.id === id)!.value.label;
  const causes = f.bridges.flatMap((b) => b.causes.map((c) => ({c, lineId: b.lineId})));
  const causeLabel = (id: string) => causes.find((x) => x.c.value.id === id)!.c.value.label;
  return {turnIntent: "answers_pending",
    quarterStart: {value: f.quarterStart, origin: "document", source: "balancete"}, quarterEnd: {value: f.quarterEnd, origin: "document", source: "balancete"},
    lines: f.lines.map((l) => ({label: l.value.label, origin: said(l.origin), source: l.source, unit: l.value.unit, scale: l.value.unit === "currency" ? "reais" as const : null, projected: l.value.projected, actual: l.value.actual})),
    cashLineLabel: {value: lineLabel(f.carry.value.cashLineId)!, origin: "document", source: "balancete"},
    ebitdaLineLabel: {value: lineLabel(f.carry.value.ebitdaLineId)!, origin: "document", source: "balancete"},
    causes: causes.map(({c, lineId}) => ({label: c.value.label, origin: said(c.origin), source: c.source, anchor: null, lineLabel: lineLabel(lineId)!, amount: c.value.amount, scale: "reais" as const,
      classification: c.value.classification, until: c.value.until, nature: c.value.nature, basis: c.value.basis, question: c.value.question,
      equalsDeviationOfLabel: lineLabel(c.value.equalsDeviationOf), driverLineLabel: lineLabel(c.value.driverLineId)})),
    streamUpdates: f.streamUpdates.map((u) => ({streamId: u.value.streamId, causeLabels: u.value.causeIds.map(causeLabel), kind: u.value.transform.kind,
      factor: u.value.transform.kind === "scale" ? u.value.transform.factor : null, days: u.value.transform.kind === "delay" ? u.value.transform.days : null, origin: "informed", source: u.source})),
    addedStreams: f.addedStreams.map((s) => ({label: s.value.label, origin: "informed", source: s.source, anchor: null, scale: "reais" as const, events: s.value.dates.map((date, k) => ({date, amount: s.value.amounts[k]!}))})),
    facilities: f.facilities.map((x) => ({label: x.value.label, origin: said(x.origin), source: x.source, limit: x.value.limit, scale: "reais" as const, approval: x.value.source})),
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
    askedDependentLabels: [],
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
    const f = aurora(W, C), c = complete(auroraExtraction(f), {updateId: f.updateId, entityId: f.entityId, definitionVersionId: f.definitionVersionId});
    expect(c.situationId).toBe("near-covenant");
    expect([c.facts.priorWeeklyFingerprint, c.facts.priorCovenantFingerprint].map((x) => [x.value, x.origin])).toEqual([[W, "document"], [C, "document"]]);
    expect(c.facts.materialityFloor).toMatchObject({value: "1000", origin: "house"});
    expect(c.housePremiseKeys).toEqual(["materialityFloor"]);
    expect(withoutFloor(comparableHypotheses(proposeQuarterUpdateHypotheses(c.facts), renameOf(f)))).toEqual(withoutFloor(comparableHypotheses(proposeQuarterUpdateHypotheses(f))));
  });
  it("takes the December tests of the headline date when the close names no measurement", () => {
    const e = auroraExtraction(aurora(W, C)); e.covenantMeasurementIds = [];
    const c = complete(e);
    expect(c.facts.covenant.value.measurementIds).toEqual(["dez26-base", "dez26-adverso", "dez26-gerencial"]);
    expect(c.housePremiseKeys).toContain("covenantMeasurements");
    // Chosen by the house, so recorded under the house, never under the recorded result (independent review, round 2).
    expect(c.facts.covenant.origin).toBe("house");
  });
  it("asks for what nobody stated in one batch, and refuses a stream or a measurement the prior results do not carry", () => {
    const e = auroraExtraction(aurora(W, C));
    e.cashLineLabel = {value: null, origin: null, source: null}; e.streamUpdates[0]!.streamId = "nao-existe"; e.covenantMeasurementIds = ["dez29-base"];
    e.causes[0]!.until = "2026-12-31";
    expect(completeQuarterUpdateFacts({extraction: e, priors: priors(), ids, currency: "BRL"})).toEqual({status: "missing",
      missing: ["cashLineLabel", "causes.1.until", "streamUpdates.1.streamId", "covenantMeasurementIds"]});
  });
  it("builds the card summary, field paths the store accepts and a stable fingerprint", () => {
    const c = complete(auroraExtraction(aurora(W, C))), pins = priorResultPins(priors()), proposal = buildQuarterUpdatePremiseProposal(c.facts, pins);
    expect(proposal.summary).toMatchObject({situationId: "near-covenant", referenceDate: "2026-09-30"});
    expect(proposal.summary.items.every((x) => summaryGroups.includes(x.group) && summaryOrigins.includes(x.origin))).toBe(true);
    expect(proposal.summary.items.slice(0, 2).map((x) => x.labelKey)).toEqual(["priorWeeklyCash", "priorCovenant"]);
    expect(proposal.hypotheses.length).toBeLessThanOrEqual(256);
    expect(proposal.hypotheses.every((h) => /^quarter_update\.[0-9a-f-]{36}\.[A-Za-z0-9_.-]{1,200}$/.test(h.fieldPath))).toBe(true);
    expect(buildQuarterUpdatePremiseProposal(c.facts, pins).fingerprint).toBe(proposal.fingerprint);
    // The card pins the exact prior executions it shows; other results with the same basis make another card (independent review, round 3).
    expect(proposal.summary.priorResults).toEqual([{role: "weekly_cash", executionId: priors().weeklyCash.executionId, resultFingerprint: priors().weeklyCash.resultFingerprint},
      {role: "covenant", executionId: priors().covenant.executionId, resultFingerprint: priors().covenant.resultFingerprint}]);
    const other = buildQuarterUpdatePremiseProposal(c.facts, [{...pins[0]!, executionId: "a0000000-0000-4000-8000-000000000099", resultFingerprint: hex("9")}, pins[1]!]);
    expect(other.fingerprint).not.toBe(proposal.fingerprint);
    expect(proposal).toMatchObject({methodId: "update-after-quarter-close", methodVersion: "2026.10.26-v1"});
  });
  it("carries the dependents the person asked by name to update, and asks back a label that names none (independent review, round 5)", async () => {
    const f = aurora(W, C), plan = f.dependents.find((d) => d.value.id === "plano-2027")!.value.label;
    const planId = itemKeys(f.dependents.map((d) => d.value.label))[f.dependents.findIndex((d) => d.value.id === "plano-2027")]!;
    const e = auroraExtraction(f); e.askedDependentLabels = [plan.toUpperCase(), plan];
    const c = complete(e);
    expect(c.askedDependentIds).toEqual([planId]);
    expect(buildQuarterUpdatePremiseProposal(c.facts, priorResultPins(priors()), c.askedDependentIds).summary.askedDependentIds).toEqual([planId]);
    // Asking for a dependent is part of what the card shows, so it changes the fingerprint.
    expect(buildQuarterUpdatePremiseProposal(c.facts, priorResultPins(priors()), c.askedDependentIds).fingerprint)
      .not.toBe(buildQuarterUpdatePremiseProposal(c.facts, priorResultPins(priors())).fingerprint);
    expect(complete(auroraExtraction(f)).askedDependentIds).toEqual([]);
    const unknown = auroraExtraction(f); unknown.askedDependentLabels = ["Orçamento de 2028"];
    expect(completeQuarterUpdateFacts({extraction: unknown, priors: priors(), ids, currency: "BRL"})).toEqual({status: "missing", missing: ["askedDependentLabels.1"]});
    // Through the turn, the card summary names the asked dependent.
    const turn = await proposeQuarterUpdatePremisesForTurn({message: "Fechou o trimestre. Atualiza tudo e também o plano de 2027.", hasAttachments: true, recentUserMessages: [],
      projectId: "a0000000-0000-4000-8000-000000000001", loadEvidence: async () => [], loadPriors: async () => priors(), extract: async () => e, log: () => {}});
    expect(turn?.proposal?.summary.askedDependentIds).toEqual([planId]);
  });
  it("converts each amount from the scale it was written in to reais exactly", () => {
    expect([amountInReais("1250000", "reais"), amountInReais("1.25", "milhoes"), amountInReais("1250", "milhares")]).toEqual(["1250000", "1250000", "1250000"]);
    expect([amountInReais("-0.4", "milhoes"), amountInReais("0.0001", "milhares"), amountInReais("007.50", "reais"), amountInReais("-0.000", "milhoes")]).toEqual(["-400000", "0.1", "7.5", "0"]);
    expect(amountInReais("12345678901234567890.123456789", "milhoes")).toBe("12345678901234567890123456.789");
  });
  it("carries a close in reais from R$ 1 million up, in any stated scale, and asks the scale nobody stated (independent review, round 7)", async () => {
    const f = aurora(W, C);
    const written = (scale: "reais" | "milhares" | "milhoes", divisor: number) => {
      const e = auroraExtraction(f);
      const cash = e.lines.findIndex((l) => l.unit === "currency");
      // The reviewer's close: projected R$ 1.25 million and actual R$ 1.2 million on the first currency line.
      e.lines[cash]!.projected = String(1250000 / divisor); e.lines[cash]!.actual = String(1200000 / divisor); e.lines[cash]!.scale = scale;
      return {e, cash};
    };
    for (const [scale, divisor] of [["reais", 1], ["milhoes", 1e6], ["milhares", 1e3]] as const) {
      const {e, cash} = written(scale, divisor), c = complete(e);
      expect([c.facts.lines[cash]!.value.projected, c.facts.lines[cash]!.value.actual], scale).toEqual(["1250000", "1200000"]);
    }
    // Through the turn the card is proposed: nothing fails and nothing is dropped.
    const events: string[] = [];
    const turn = await proposeQuarterUpdatePremisesForTurn({message: "Fechou o trimestre. Atualiza tudo.", hasAttachments: true, recentUserMessages: [],
      projectId: "a0000000-0000-4000-8000-000000000001", loadEvidence: async () => [], loadPriors: async () => priors(), extract: async () => written("reais", 1).e, log: (event) => {events.push(event);}});
    expect([turn?.forAdvisor.status, events]).toEqual(["proposed", ["quarter_update_premises.proposed"]]);
    // A scale nobody stated is asked, never guessed.
    const unknown = written("reais", 1); unknown.e.lines[unknown.cash]!.scale = null; unknown.e.causes[0]!.scale = null;
    expect(completeQuarterUpdateFacts({extraction: unknown.e, priors: priors(), ids, currency: "BRL"})).toEqual({status: "missing", missing: [`lines.${unknown.cash + 1}.scale`, "causes.1.scale"]});
  });
  it("names an amount the basis cannot carry instead of dropping the card (independent review, round 7)", async () => {
    const f = aurora(W, C), e = auroraExtraction(f), cash = e.lines.findIndex((l) => l.unit === "currency"), days = e.lines.findIndex((l) => l.unit !== "currency");
    e.lines[cash]!.actual = "1".repeat(20); e.lines[cash]!.scale = "milhoes";
    e.causes[0]!.amount = "0.123456789"; e.causes[0]!.scale = "reais";
    if (days >= 0) e.lines[days]!.projected = "1250000";
    const expected = [`lines.${cash + 1}.actual`, ...days >= 0 ? [`lines.${days + 1}.projected`] : [], "causes.1.amount"].sort();
    const c = completeQuarterUpdateFacts({extraction: e, priors: priors(), ids, currency: "BRL"});
    expect(c.status).toBe("missing");
    expect(c.status === "missing" ? [...c.missing].sort() : null).toEqual(expected);
    const events: string[] = [];
    const turn = await proposeQuarterUpdatePremisesForTurn({message: "Fechou o trimestre. Atualiza tudo.", hasAttachments: true, recentUserMessages: [],
      projectId: "a0000000-0000-4000-8000-000000000001", loadEvidence: async () => [], loadPriors: async () => priors(), extract: async () => e, log: (event) => {events.push(event);}});
    expect(turn?.forAdvisor.status).toBe("missing");
    expect(events).not.toContain("quarter_update_premises.failed");
  });
  it("names what any lote 3 facts schema refuses, by path, for the card (C24, C26, C35 and C54 share it)", () => {
    const schema = z.strictObject({lines: z.array(z.strictObject({value: z.strictObject({amount: z.string().regex(/^\d{1,3}$/)})}))}).refine((f) => f.lines.length > 1);
    expect(factsOrGaps(schema, {lines: [{value: {amount: "1"}}, {value: {amount: "12345"}}]})).toEqual({ok: false, missing: ["lines.2.amount"]});
    expect(factsOrGaps(schema, {lines: [{value: {amount: "1"}}]})).toEqual({ok: false, missing: ["facts"]});
    expect(factsOrGaps(schema, {lines: [{value: {amount: "1"}}, {value: {amount: "2"}}]})).toMatchObject({ok: true});
  });
  it("names a rule of the close the method refuses instead of failing the turn", () => {
    const e = auroraExtraction(aurora(W, C)); e.ebitdaLineLabel = {...e.cashLineLabel};
    const c = completeQuarterUpdateFacts({extraction: e, priors: priors(), ids, currency: "BRL"});
    expect(c.status === "missing" && c.missing.includes("facts")).toBe(true);
  });
  it("names the basis limit as a gap in the turn instead of dropping the card: 20 dependents (independent review, round 8)", async () => {
    const e = auroraExtraction(aurora(W, C));
    e.dependents = Array.from({length: 20}, (_, k) => ({...e.dependents[k % e.dependents.length]!, label: k < e.dependents.length ? e.dependents[k]!.label : `Dependente ${k + 1}`}));
    expect(completeQuarterUpdateFacts({extraction: e, priors: priors(), ids, currency: "BRL"})).toMatchObject({status: "complete"});
    const events: string[] = [];
    const turn = await proposeQuarterUpdatePremisesForTurn({message: "Fechou o trimestre. Atualiza tudo.", hasAttachments: true, recentUserMessages: [],
      projectId: "a0000000-0000-4000-8000-000000000001", loadEvidence: async () => [], loadPriors: async () => priors(), extract: async () => e, log: (event) => {events.push(event);}});
    expect(turn).toEqual({forAdvisor: {status: "missing", missing: ["tooManyItems"]}, proposal: null});
    expect(events).toEqual(["quarter_update_premises.expansion_refused"]);
  });
  it("asks for a label stated twice in a collection referenced by label (independent review, round 8)", () => {
    const e = auroraExtraction(aurora(W, C));
    e.lines.push({...e.lines[0]!, actual: "999"}); e.facilities.push({...e.facilities[0]!, limit: "999"});
    const c = completeQuarterUpdateFacts({extraction: e, priors: priors(), ids, currency: "BRL"});
    expect(c.status === "missing" ? c.missing.filter((m) => m.endsWith(".label")) : null).toEqual([`lines.${e.lines.length}.label`, `facilities.${e.facilities.length}.label`]);
  });
  it("asks two transforms of the same stream instead of offering a card the reader would refuse (independent review, round 9)", () => {
    const e = auroraExtraction(aurora(W, C)), u = e.streamUpdates.find((x) => x.kind === "scale")!;
    u.factor = "0.9"; e.streamUpdates.push({...u, factor: "0.7"});
    const c = completeQuarterUpdateFacts({extraction: e, priors: priors(), ids, currency: "BRL"});
    expect(c).toEqual({status: "missing", missing: [`streamUpdates.${e.streamUpdates.length}.streamId`]});
  });
  it("never turns absence into zero: every optional operand of the close absent is asked or the method names it (independent review, round 9)", () => {
    const e = auroraExtraction(aurora(W, C));
    // No series moved, no new stream, no facility, no action, no dependent, no linked or driver line, no question:
    // each is a legitimate none; a persisting cause left without its series is named by the method itself
    // (structural_cause_not_in_weekly_cash, covered in financial-model quarter-update-premises.test.ts).
    e.streamUpdates = []; e.addedStreams = []; e.facilities = []; e.steps = []; e.dependents = []; e.askedDependentLabels = []; e.covenantMeasurementIds = [];
    for (const c of e.causes) {c.equalsDeviationOfLabel = null; c.driverLineLabel = null;}
    const c = complete(e);
    expect(c.housePremiseKeys.sort()).toEqual(["covenantMeasurements", "materialityFloor"]);
    // A dependent nobody recomputes, or one bound to this close without what it reads, is asked.
    const owners = auroraExtraction(aurora(W, C)), elsewhere = owners.dependents.findIndex((d) => d.recomputedBy === "none"),
      here = owners.dependents.findIndex((d) => d.recomputedBy !== "none");
    owners.dependents[elsewhere]!.owner = null; owners.dependents[here]!.scenario = null;
    const o = completeQuarterUpdateFacts({extraction: owners, priors: priors(), ids, currency: "BRL"});
    expect(o.status === "missing" ? [...o.missing].sort() : o).toEqual([`dependents.${elsewhere + 1}.owner`, `dependents.${here + 1}.scenario`].sort());
    // A scale nobody stated and a structural cause without its date or nature are asked.
    const asked = auroraExtraction(aurora(W, C)), k = asked.causes.findIndex((x) => x.classification === "structural");
    asked.causes[k]!.until = null; asked.causes[k]!.nature = null; asked.lines[0]!.scale = asked.lines[0]!.unit === "currency" ? null : asked.lines[0]!.scale;
    const m = completeQuarterUpdateFacts({extraction: asked, priors: priors(), ids, currency: "BRL"});
    expect(m.status === "missing" ? m.missing : m).toEqual(expect.arrayContaining([`causes.${k + 1}.until`, `causes.${k + 1}.nature`]));
  });
  it("runs the full chain over the pinned priors before the card: the reviewer's three refusals become named gaps (independent review, round 10)", async () => {
    const cases: [string, (e: QuarterUpdateExtraction) => void][] = [
      ["quarter_update_series_shared_by_causes", (e) => {
        const structural = e.causes.filter((c) => c.classification === "structural").map((c) => c.label);
        e.streamUpdates[0]!.causeLabels = structural;
      }],
      ["quarter_update_transform", (e) => {e.streamUpdates.find((u) => u.kind === "scale")!.factor = "0";}],
      ["quarter_update_step_date", (e) => {e.steps.find((x) => x.mode === "residual")!.date = "2030-01-02";}],
    ];
    for (const [code, edit] of cases) {
      const e = auroraExtraction(aurora(W, C)); edit(e);
      const c = complete(e);
      expect(quarterUpdateReaderGaps(c.facts, priors()), code).toEqual([`readerRefused.${code}`]);
      const events: string[] = [];
      const turn = await proposeQuarterUpdatePremisesForTurn({message: "Fechou o trimestre. Atualiza tudo.", hasAttachments: true, recentUserMessages: [],
        projectId: "a0000000-0000-4000-8000-000000000001", loadEvidence: async () => [], loadPriors: async () => priors(), extract: async () => e, log: (event) => {events.push(event);}});
      expect(turn, code).toEqual({forAdvisor: {status: "missing", missing: [`readerRefused.${code}`]}, proposal: null});
      expect(events, code).toEqual(["quarter_update_premises.reader_refused"]);
    }
    // The calibration close passes the same chain, so its card is offered.
    expect(quarterUpdateReaderGaps(complete(auroraExtraction(aurora(W, C))).facts, priors())).toEqual([]);
  });
  it("asks a value stated without origin (independent review, round 11)", () => {
    const e = auroraExtraction(aurora(W, C)); e.quarterStart = {value: e.quarterStart.value, origin: null, source: null};
    const c = completeQuarterUpdateFacts({extraction: e, priors: priors(), ids, currency: "BRL"});
    expect(c.status === "missing" && c.missing.includes("quarterStart")).toBe(true);
  });
  it("asks every contradiction inside one record (independent review, round 12)", () => {
    expect(quarterUpdateContradictions(auroraExtraction(aurora(W, C)))).toEqual([]);
    const cases: [string, (e: QuarterUpdateExtraction) => string][] = [
      ["quarterEnd", (e) => {e.quarterEnd = {...e.quarterEnd, value: e.quarterStart.value}; return "quarterEnd";}],
      ["lines.scale", (e) => {const k = e.lines.findIndex((l) => l.unit !== "currency"); e.lines[k]!.scale = "reais"; return `lines.${k + 1}.scale`;}],
      ["causes.until", (e) => {const k = e.causes.findIndex((c) => c.classification === "structural"); e.causes[k]!.until = e.quarterEnd.value; return `causes.${k + 1}.until`;}],
      ["causes.equals", (e) => {e.causes[0]!.equalsDeviationOfLabel = e.causes[0]!.lineLabel; return "causes.1.equalsDeviationOfLabel";}],
      ["streamUpdates.kind", (e) => {const k = e.streamUpdates.findIndex((u) => u.kind === "scale"); e.streamUpdates[k]!.days = 3; return `streamUpdates.${k + 1}.kind`;}],
      ["steps.date", (e) => {const k = e.steps.findIndex((s) => s.mode === "fixed"); e.steps[k]!.date = "2026-10-01"; return `steps.${k + 1}.date`;}],
      ["steps.mode", (e) => {const k = e.steps.findIndex((s) => s.mode === "residual"); e.steps[k]!.replacesStreamIds = ["linha-17"]; return `steps.${k + 1}.mode`;}],
      ["dependents.horizon", (e) => {e.dependents[0]!.horizonEnd = "2000-01-01"; return "dependents.1.horizonEnd";}],
      ["dependents.owner", (e) => {const k = e.dependents.findIndex((d) => d.recomputedBy !== "none"); e.dependents[k]!.owner = "outro método"; return `dependents.${k + 1}.owner`;}],
    ];
    for (const [name, edit] of cases) {
      const e = auroraExtraction(aurora(W, C)), key = edit(e);
      expect(quarterUpdateContradictions(e), name).toEqual([key]);
      const c = completeQuarterUpdateFacts({extraction: e, priors: priors(), ids, currency: "BRL"});
      expect(c.status === "missing" && c.missing.includes(key), name).toBe(true);
    }
  });
  it("never refuses a coherent boundary of its contradiction rules (independent review, round 13)", () => {
    for (const [name, edit] of [
      ["persisting to the day after the quarter", (e: QuarterUpdateExtraction) => {const k = e.causes.findIndex((c) => c.classification === "structural"); e.causes[k]!.until = "2026-10-01";}],
      ["a one-day dependent horizon", (e: QuarterUpdateExtraction) => {e.dependents[0]!.horizonEnd = e.dependents[0]!.horizonStart;}],
      ["a one-day quarter", (e: QuarterUpdateExtraction) => {e.quarterStart = {...e.quarterStart, value: "2026-09-29"};}],
      ["two equal transforms of one stream are one", (e: QuarterUpdateExtraction) => {const u = e.streamUpdates.find((x) => x.kind === "scale")!; e.streamUpdates.push({...u, factor: `${u.factor}000`, source: "outra fonte"});}],
    ] as const) {
      const e = auroraExtraction(aurora(W, C)); edit(e);
      expect(quarterUpdateContradictions(e), name).toEqual([]);
      if (name.startsWith("two equal")) expect(complete(e).facts.streamUpdates.length, name).toBe(complete(auroraExtraction(aurora(W, C))).facts.streamUpdates.length);
    }
  });
  it("reconciles records after converting their stated scale: 4.2 milhões and 4200000 reais of one line are one fact (independent review, round 15)", () => {
    const e = auroraExtraction(aurora(W, C)), k = e.lines.findIndex((l) => l.unit === "currency"), line = e.lines[k]!;
    line.projected = "4200000"; line.actual = "3800000"; line.scale = "reais";
    e.lines.push({...line, projected: "4.2", actual: "3.8", scale: "milhoes", source: "gerencial do trimestre"});
    const c = completeQuarterUpdateFacts({extraction: e, priors: priors(), ids, currency: "BRL"});
    expect(c.status === "complete" ? c.facts.lines.length : c).toBe(e.lines.length - 1);
    expect(c.status === "complete" ? [c.facts.lines[k]!.value.projected, c.facts.lines[k]!.value.actual] : c).toEqual(["4200000", "3800000"]);
  });
  it("causes add up: two equal freight expenses from two invoices are two causes; the same invoice line read twice is one (independent review, round 18)", () => {
    const base = auroraExtraction(aurora(W, C)), n = base.causes.length, k = base.causes.findIndex((c) => c.classification === "calendar" && c.lineLabel === base.ebitdaLineLabel.value);
    const freight = {...base.causes[k]!, label: "Frete", amount: "-150000", source: "nota fiscal 1201", anchor: null};
    const run = (extra: QuarterUpdateExtraction["causes"]) => completeQuarterUpdateFacts({extraction: {...base, causes: [...base.causes, ...extra]}, ids, priors: priors(), currency: "BRL"});
    const invoices = run([freight, {...freight, source: "nota fiscal 1202"}]);
    expect(invoices.status === "complete" ? invoices.facts.bridges.flatMap((b) => b.causes).length : invoices).toBe(n + 2);
    const unanchored = run([freight, {...freight}]);
    expect(unanchored.status === "missing" ? unanchored.missing : unanchored).toEqual([`causes.${n + 2}.duplicateOf`]);
    const line = {...freight, anchor: "item 3"};
    const twice = run([line, {...line, origin: "informed" as const}]);
    expect(twice.status === "complete" ? twice.facts.bridges.flatMap((b) => b.causes).length : twice).toBe(n + 1);
    const inconsistent = run([line, {...line, amount: "-160000"}]);
    expect(inconsistent.status === "missing" ? inconsistent.missing : inconsistent).toEqual([`causes.${n + 2}.anchor`]);
  });
  it("proposes nothing and names the missing prior result before any extraction", async () => {
    const run = async (loaded: unknown, intent = "answers_pending") => {
      const events: string[] = []; let extracted = false;
      const result = await proposeQuarterUpdatePremisesForTurn({message: "Fechou o trimestre. Atualiza tudo.", hasAttachments: true, recentUserMessages: [],
        projectId: "a0000000-0000-4000-8000-000000000001", loadEvidence: async () => [], loadPriors: async () => loaded,
        extract: async () => {extracted = true; return {...auroraExtraction(aurora(W, C)), turnIntent: intent};}, log: (event) => {events.push(event);}});
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
