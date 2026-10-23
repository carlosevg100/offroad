import {beforeAll, describe, expect, it} from "vitest";
import {proposeWeeklyCashHypotheses, type WeeklyCashFacts} from "@offroad/financial-model";
import {buildWeeklyCashPremiseProposal, completeWeeklyCashFacts, shouldProposeWeeklyCashPremises, type WeeklyCashExtraction, proposeWeeklyCashPremisesForTurn} from "./weekly-cash-premises-proposal";
import {itemKeys} from "./lote2-premises";
import {comparableHypotheses, financialModelFixture, nonAnswering, summaryGroups, summaryOrigins, turnWithIntent} from "./lote2-premises.test-support";

let aurora: () => WeeklyCashFacts;
beforeAll(async () => {aurora = (await financialModelFixture<{auroraWeeklyCashFacts: () => WeeklyCashFacts}>("weekly-cash.test-support.ts")).auroraWeeklyCashFacts;});
const none = {value: null, origin: null, source: null};
const informed = <T>(value: T, source: string) => ({value, origin: "informed" as const, source});
const extracted = (x: {origin: string; source: string}) => ({origin: x.origin === "document" ? "document" as const : "informed" as const, source: x.source});

/** The turn of ficha C18 as the extraction would read it from the treasury's flow, the contracts and the bank's proposals. */
/** The harvest variants the ficha discusses: a larger and a later purchase in place of the planned one. */
const variants: Record<string, string> = {"safra-30": "safra", "safra-adiada": "safra"};
function auroraExtraction(f: WeeklyCashFacts): WeeklyCashExtraction {
  const streamLabel = (id: string) => f.streams.find((s) => s.value.id === id)!.value.label;
  return {turnIntent: "answers_pending" as const,
    openingDate: informed(f.openingDate, "saldo de 14/set"),
    openingCash: f.openingCash as WeeklyCashExtraction["openingCash"], minimumCash: f.minimumCash as WeeklyCashExtraction["minimumCash"],
    calendarEnd: none, projectionClosing: f.projectionClosing as WeeklyCashExtraction["projectionClosing"],
    covenantTestDate: f.covenantTestDate as WeeklyCashExtraction["covenantTestDate"],
    streams: f.streams.map((s) => ({label: s.value.label, ...extracted(s), category: s.value.category, direction: s.value.direction, obligation: s.value.obligation,
      variantOf: variants[s.value.id] ? streamLabel(variants[s.value.id]!) : null,
      events: s.value.dates.map((date, k) => ({date, amount: s.value.amounts[k]!}))})),
    cases: f.cases.map((c) => ({label: c.value.label, ...extracted(c), role: c.value.role, streamLabels: c.value.streamIds.map(streamLabel)})),
    actions: f.actions.map((a) => {const v = a.value; return {label: v.label, ...extracted(a), streamLabel: streamLabel(v.streamId),
      replacesStreamLabel: v.replacesStreamId === null ? null : streamLabel(v.replacesStreamId), amount: v.amount, days: v.days, rate: Number(v.rate), ratePeriod: v.ratePeriod,
      iofDaily: Number(v.iofDaily), iofDailyCapDays: v.iofDailyCapDays, iofAdditional: Number(v.iofAdditional), upfrontFee: Number(v.upfrontFee), repaymentDate: v.repaymentDate};}),
    coverage: Object.fromEntries(Object.entries(f.coverage).map(([o, x]) => [o, {value: x.value, ...extracted(x)}])) as WeeklyCashExtraction["coverage"],
  };
}
const idsOf = (f: WeeklyCashFacts) => ({weeklyCashId: f.weeklyCashId, entityId: f.entityId, definitionVersionId: f.definitionVersionId});
const renameOf = (f: WeeklyCashFacts) => {
  const pairs: [string, string][] = [];
  const add = (items: {label: string; id: string}[]) => itemKeys(items.map((x) => x.label)).forEach((k, n) => pairs.push([k, items[n]!.id]));
  add(f.streams.map((s) => s.value)); add(f.cases.map((c) => c.value)); add(f.actions.map((a) => a.value));
  return new Map(pairs);
};
const complete = (e: WeeklyCashExtraction, f: WeeklyCashFacts) => {
  const c = completeWeeklyCashFacts({extraction: e, ids: idsOf(f), currency: "BRL"});
  if (c.status !== "complete") throw new Error(JSON.stringify(c));
  return c;
};

describe("weekly cash premises proposed from a turn", () => {
  it("recognizes the ficha C18 questions, with or without documents, and not a conceptual question", () => {
    for (const m of ["Como fica o caixa até dezembro e o que vence?", "A gente aguenta até o fim do ano?", "Quando é a semana mais apertada?", "Preciso sacar a conta garantida em dezembro?"])
      for (const docs of [false, true]) expect(shouldProposeWeeklyCashPremises(m, docs), m).toBe(true);
    for (const m of ["O que é fluxo de caixa?", "O que significa capital de giro?", "Qual o prazo da debênture?", "Como estamos contra os covenants?", "Quanto de dívida cabe para o capex?"])
      for (const docs of [false, true]) expect(shouldProposeWeeklyCashPremises(m, docs), m).toBe(false);
  });
  it("treats any statement after the question as a continuation candidate, refusing only questions, explanations and another method", () => {
    const earlier = ["Como fica o caixa até dezembro e o que vence?"];
    for (const m of ["O saldo hoje é R$ 41 milhões e o caixa mínimo R$ 15 milhões", "A folha é R$ 3 milhões, certo?", "O 13º está incluído na folha.", "Não pagamos IR por estimativa.",
      "A folha de R$ 3 milhões vence amanhã.", "Obrigado", "Vou confirmar a folha de R$ 3 milhões amanhã.", "Mando o fluxo em 2 dias", "Ainda não tenho o fluxo de dezembro."])
      expect(shouldProposeWeeklyCashPremises(m, false, earlier), m).toBe(true);
    // An answer may open with "Como" or "Quanto ao"; only a real question or a request for explanation is refused.
    for (const m of ["Como solicitado, o saldo é R$ 41 milhões e o caixa mínimo é R$ 15 milhões.", "Quanto ao saldo inicial, é R$ 41 milhões."])
      expect(shouldProposeWeeklyCashPremises(m, false, earlier), m).toBe(true);
    for (const m of ["O 13º está incluído?", "Quanto é a folha?", "Qual é o saldo?", "Explica o IOF", "Por favor, resuma o fluxo", "O que significa caixa mínimo"]) expect(shouldProposeWeeklyCashPremises(m, false, earlier), m).toBe(false);
    // Its own objective is a direct cue, which the extraction's turnIntent does not gate.
    expect(shouldProposeWeeklyCashPremises("Vou confirmar o caixa semanal de R$ 40 milhões amanhã.", false, [])).toBe(true);
    expect(shouldProposeWeeklyCashPremises("O saldo é R$ 41 milhões", false, ["Qual o prazo da debênture?"])).toBe(false);
    expect(shouldProposeWeeklyCashPremises("O saldo é R$ 41 milhões", false, [...earlier, "Monta a tabela de dívida com tudo que temos."])).toBe(false);
  });
  it("completes the Aurora facts and proposes the hypotheses the fixture proposes", () => {
    const f = aurora(), c = complete(auroraExtraction(f), f);
    expect(c.situationId).toBe("seasonal-working-capital");
    expect([c.facts.openingDate, c.facts.endDate]).toEqual([f.openingDate, f.endDate]);
    expect(c.facts.calendarEnd).toEqual(f.calendarEnd);
    expect(c.housePremiseKeys).toEqual(["calendarEnd"]);
    expect(comparableHypotheses(proposeWeeklyCashHypotheses(c.facts), renameOf(f))).toEqual(comparableHypotheses(proposeWeeklyCashHypotheses(f)));
  });
  it("builds the plan and one case per action when no case was described, and opens on the Monday of the balance's week", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.cases = []; e.openingDate = informed("2026-09-16", "saldo de 16/set");
    e.streams = e.streams.map((s) => ({...s, events: s.events.filter((x) => x.date >= "2026-09-16")})).filter((s) => s.events.length);
    e.coverage.income_taxes = none;
    const c = complete(e, f);
    expect(c.facts.openingDate).toBe("2026-09-14");
    expect(c.facts.cases.map((x) => [x.value.role, x.origin])).toEqual([["informed", "house"], ...[...Object.keys(variants), ...f.actions].map(() => ["alternative", "house"])]);
    const plan = c.facts.cases[0]!.value.streamIds, label = (id: string) => c.facts.streams.find((s) => s.value.id === id)!.value.label;
    expect(c.facts.streams.filter((s) => plan.includes(s.value.id)).every((s) => s.value.category !== "action")).toBe(true);
    // The plan carries the planned harvest only, never a variant of it.
    expect(plan.map(label)).toContain("Compra de safra");
    expect(plan.map(label).filter((x) => x.startsWith("Compra de safra"))).toEqual(["Compra de safra"]);
    // Each variant case is the plan with exactly one stream replaced, labeled as the variant.
    for (const variant of c.facts.cases.slice(1, 3)) {
      const changed = variant.value.streamIds.filter((id, k) => id !== plan[k]);
      expect(variant.value.streamIds).toHaveLength(plan.length);
      expect(changed).toHaveLength(1);
      expect(variant.value.label).toBe(label(changed[0]!));
      expect(plan.filter((id) => !variant.value.streamIds.includes(id)).map(label)).toEqual(["Compra de safra"]);
    }
    const larger = c.facts.actions.find((a) => a.value.replacesStreamId !== null)!.value;
    expect(c.facts.cases.find((x) => x.value.streamIds.includes(larger.streamId))!.value.streamIds).not.toContain(larger.replacesStreamId);
    expect(c.facts.coverage.income_taxes.value).toBe("included");
    expect(buildWeeklyCashPremiseProposal(c.facts).summary.items.filter((x) => x.group === "case").map((x) => x.labelKey))
      .toEqual(["informedPlan", "variantCase", "variantCase", "actionCase", "actionCase", "actionCase"]);
    expect(buildWeeklyCashPremiseProposal(c.facts).summary.items.find((x) => x.labelKey === "variantCase")!.label).toBe("Compra de safra (R$ 30 mi)");
    expect(c.housePremiseKeys.sort()).toEqual(["calendarEnd", "cases", "openingWeek"]);
  });
  it("never applies again a payment already in a mid-week opening balance", () => {
    const f = aurora();
    const minimal = (events: {date: string; amount: string}[]): WeeklyCashExtraction => ({...auroraExtraction(f), openingDate: informed("2026-09-16", "saldo de 16/set"),
      openingCash: informed("100", "saldo de 16/set"), minimumCash: informed("10", "caixa mínimo"), projectionClosing: none, covenantTestDate: none, cases: [], actions: [],
      streams: [{label: "Fornecedor", origin: "informed", source: "pagamento informado", category: "operating", direction: "outflow", obligation: null, variantOf: null, events}]});
    // A payment on 15/09 is already in the balance of 16/09: it is refused, not deducted again.
    expect(completeWeeklyCashFacts({extraction: minimal([{date: "2026-09-15", amount: "10"}]), ids: idsOf(f), currency: "BRL"}))
      .toEqual({status: "missing", missing: ["streams.1.beforeOpeningBalance"]});
    // The balance is read at the start of its date: a payment on 16/09 applies once, from the Monday of that week.
    const c = complete(minimal([{date: "2026-09-16", amount: "10"}]), f);
    expect([c.facts.openingDate, c.facts.openingCash.value, c.facts.streams[0]!.value.dates]).toEqual(["2026-09-14", "100", ["2026-09-16"]]);
  });
  it("keeps two flows with the same label apart and refuses a reference that could name either", () => {
    const f = aurora();
    const supplier = (amount: string) => ({label: "Fornecedor", origin: "informed" as const, source: "pagamento informado", category: "operating" as const, direction: "outflow" as const,
      obligation: null, variantOf: null, events: [{date: "2026-09-21", amount}]});
    const base: WeeklyCashExtraction = {...auroraExtraction(f), openingDate: informed("2026-09-14", "saldo de 14/set"), openingCash: informed("100", "saldo"),
      minimumCash: informed("10", "caixa mínimo"), projectionClosing: none, covenantTestDate: none, cases: [], actions: [], streams: [supplier("10"), supplier("20")]};
    // Both payments stay in the plan: 100 less 10 and 20 closes at 70.
    const c = complete(base, f), plan = c.facts.cases[0]!.value.streamIds;
    expect(plan).toEqual(["fornecedor", "fornecedor-2"]);
    expect(c.facts.streams.filter((s) => plan.includes(s.value.id)).flatMap((s) => s.value.amounts).reduce((t, x) => t - Number(x), 100)).toBe(70);
    // A described case naming "Fornecedor" could mean either: it is asked, never resolved to the first.
    const named = {...base, cases: [{label: "Plano", origin: "informed" as const, source: "plano", role: "informed" as const, streamLabels: ["Fornecedor"]}]};
    expect(completeWeeklyCashFacts({extraction: named, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing", missing: ["streams.1.label", "streams.2.label"]});
  });
  it("asks for what nobody stated in one batch instead of assuming it", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.openingCash = none; e.minimumCash = none; e.actions[0]!.iofDaily = null; e.actions[1]!.streamLabel = "Linha inexistente";
    expect(completeWeeklyCashFacts({extraction: e, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing",
      missing: ["openingCash", "minimumCash", "actions.1.iofDaily", "actions.2.streamLabel", "streams.24.action"]});
    const early = auroraExtraction(f); early.streams[0]!.events[0]!.date = "2026-09-01";
    expect(completeWeeklyCashFacts({extraction: early, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing", missing: ["streams.1.beforeOpeningBalance"]});
    const orphan = auroraExtraction(f); orphan.streams.find((x) => x.label === "Compra de safra adiada duas semanas")!.variantOf = "Compra de soja";
    expect(completeWeeklyCashFacts({extraction: orphan, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing", missing: ["streams.20.variantOf"]});
    const two = auroraExtraction(f); two.cases[1]!.role = "informed";
    expect(completeWeeklyCashFacts({extraction: two, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing", missing: ["cases.informed"]});
  });
  it("builds the card summary, field paths the store accepts and a stable fingerprint", () => {
    const f = aurora(), c = complete(auroraExtraction(f), f);
    const proposal = buildWeeklyCashPremiseProposal(c.facts);
    expect(Object.keys(proposal.summary).sort()).toEqual(["items", "referenceDate", "situationId"]);
    expect(proposal.summary).toMatchObject({situationId: "seasonal-working-capital", referenceDate: "2026-09-14"});
    expect(proposal.summary.items.every((x) => summaryGroups.includes(x.group) && summaryOrigins.includes(x.origin) && x.label.length > 0 && x.source.length > 0
      && Object.keys(x).sort().join() === "group,label,labelKey,origin,source")).toBe(true);
    expect(proposal.summary.items.map((x) => x.group)).toEqual([...f.streams.map(() => "stream"), ...f.cases.map(() => "case"), ...f.actions.map(() => "action"), "premise", "premise"]);
    expect(proposal.summary.items.slice(-2).map((x) => [x.label, x.labelKey])).toEqual([["Caixa mínimo de operação", "minimumCash"], ["Caixa inicial", "openingCash"]]);
    // Cases the person described keep their own labels.
    expect(proposal.summary.items.filter((x) => x.group !== "premise").every((x) => x.labelKey === null)).toBe(true);
    expect(proposal.hypotheses.length).toBeLessThanOrEqual(256);
    expect(proposal.hypotheses.every((h) => /^weekly_cash\.[0-9a-f-]{36}\.[A-Za-z0-9_.-]{1,200}$/.test(h.fieldPath) && h.dimensions.entityId === null && /^Origem: /.test(h.reason))).toBe(true);
    expect(buildWeeklyCashPremiseProposal(c.facts).fingerprint).toBe(proposal.fingerprint);
    const changed = complete({...auroraExtraction(f), minimumCash: informed("16", "caixa mínimo revisto")}, f);
    expect(buildWeeklyCashPremiseProposal(changed.facts).fingerprint).not.toBe(proposal.fingerprint);
    expect(proposal).toMatchObject({methodId: "project-weekly-cash", methodVersion: "2026.10.23-v1"});
  });
  it("proposes only when the extraction reads the turn as answering, on a continuation and on a direct request alike", async () => {
    const earlier = ["Como fica o caixa até dezembro e o que vence?"];
    for (const intent of nonAnswering) {
      const r = await turnWithIntent(proposeWeeklyCashPremisesForTurn, auroraExtraction(aurora()), intent, "Mando o fluxo em 2 dias", earlier);
      expect(r, intent).toEqual({extracted: true, status: null, events: ["weekly_cash_premises.not_answering"]});
    }
    expect(await turnWithIntent(proposeWeeklyCashPremisesForTurn, auroraExtraction(aurora()), "answers_pending", "Mando o fluxo em 2 dias", earlier)).toMatchObject({extracted: true, status: "proposed", events: ["weekly_cash_premises.proposed"]});
    // A direct request is gated the same way: the model reads a request for this analysis as answers_pending.
    for (const intent of nonAnswering)
      expect(await turnWithIntent(proposeWeeklyCashPremisesForTurn, auroraExtraction(aurora()), intent, "Como fica o caixa até dezembro e o que vence?", []), intent).toEqual({extracted: true, status: null, events: ["weekly_cash_premises.not_answering"]});
    expect(await turnWithIntent(proposeWeeklyCashPremisesForTurn, auroraExtraction(aurora()), "answers_pending", "Como fica o caixa até dezembro e o que vence?", [])).toMatchObject({status: "proposed"});
    // A question never reaches the extraction.
    expect(await turnWithIntent(proposeWeeklyCashPremisesForTurn, auroraExtraction(aurora()), "answers_pending", "E qual é o prazo?", earlier)).toEqual({extracted: false, status: null, events: []});
  });
});
