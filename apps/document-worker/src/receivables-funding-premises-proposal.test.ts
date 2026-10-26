import {beforeAll, describe, expect, it} from "vitest";
import {proposeReceivablesFundingHypotheses, type ReceivablesFundingFacts} from "@offroad/financial-model";
import {buildReceivablesFundingPremiseProposal, completeReceivablesFundingFacts, proposeReceivablesFundingPremisesForTurn, shouldProposeReceivablesFundingPremises,
  type ReceivablesFundingExtraction} from "./receivables-funding-premises-proposal";
import {itemKeys, stableKey} from "./lote2-premises";
import {comparableHypotheses, financialModelFixture, nonAnswering, summaryGroups, summaryOrigins, turnWithIntent} from "./lote2-premises.test-support";

let aurora: () => ReceivablesFundingFacts;
beforeAll(async () => {aurora = (await financialModelFixture<{auroraReceivablesFundingFacts: () => ReceivablesFundingFacts}>("receivables-funding.test-support.ts")).auroraReceivablesFundingFacts;});
const none = {value: null, origin: null, source: null};
const said = (o: string) => o === "document" ? "document" as const : "informed" as const;
const sourcedOf = <T>(f: {value: T; origin: string; source: string} | null) => f === null ? none : {value: f.value, origin: said(f.origin), source: f.source};

/** The turn of ficha C35 as the extraction would read it from the portfolio, the contracts, the debt table and the options' terms. */
function auroraExtraction(f: ReceivablesFundingFacts): ReceivablesFundingExtraction {
  const label = (id: string) => f.items.find((i) => i.value.id === id)!.value.label;
  return {turnIntent: "answers_pending", referenceDate: {value: f.referenceDate, origin: "document", source: "posição da carteira"},
    needAverage: sourcedOf(f.needAverage), needPeak: sourcedOf(f.needPeak), needStartDate: sourcedOf(f.needStartDate), needEndDate: {value: f.endDate, origin: "informed", source: "fim da safra"},
    calendarDays: sourcedOf(f.calendarDays), businessDays: sourcedOf(f.businessDays), needProfile: sourcedOf(f.needProfile), annualDi: sourcedOf(f.annualDi),
    averageTermDays: sourcedOf(f.averageTermDays), lienBasketRemaining: sourcedOf(f.lienBasketRemaining),
    dedicatedVehicleThreshold: {value: f.dedicatedVehicleThreshold.value, origin: "informed", source: "faixa informada pela tesouraria"},
    items: f.items.map((i) => {const v = i.value; return {label: v.label, origin: said(i.origin), source: i.source, amount: v.amount, contract: v.contract, encumbrance: v.encumbrance,
      encumbranceHolder: v.encumbranceHolder, releaseEvent: v.releaseEvent, originDate: v.originDate, dueDate: v.dueDate, registration: v.registration, creditTier: v.creditTier,
      anchorProgram: v.anchorProgram, debtorCount: v.debtorCount, largestDebtorAmount: v.largestDebtorAmount, debtorLabel: null, debtorTaxId: null, debtorSetDisjoint: v.debtorSetDisjoint};}),
    options: f.options.map((o) => {const v = o.value, el = v.eligibility; return {label: v.label, origin: said(o.origin), source: o.source, kind: v.kind, recourse: v.recourse,
      rateBasis: v.rate.basis, rate: v.rate.rate, iofDaily: v.iofDaily, iofDailyCapDays: v.iofDailyCapDays, iofAdditional: v.iofAdditional, rolloverDays: v.rolloverDays,
      upfrontFee: v.upfrontFee, collateral: v.collateral, leadDaysMin: v.leadDaysMin, leadDaysMax: v.leadDaysMax, maxDaysPastDue: el?.maxDaysPastDue ?? null,
      maxRemainingTermDays: el?.maxRemainingTermDays ?? null, registrationRule: el?.registrationRule ?? null, minCreditTier: el?.minCreditTier ?? null,
      sublimitPerDebtor: el?.sublimitPerDebtor ?? null, sublimitGroup: el?.sublimitGroup ?? null, anchorItemLabels: (el?.anchorItemIds ?? []).map(label)};}),
  };
}
const idsOf = (f: ReceivablesFundingFacts) => ({receivablesFundingId: f.receivablesFundingId, entityId: f.entityId, definitionVersionId: f.definitionVersionId});
const renameOf = (f: ReceivablesFundingFacts) => {
  const pairs: [string, string][] = [];
  const add = (items: {label: string; id: string}[]) => itemKeys(items.map((x) => x.label)).forEach((k, n) => pairs.push([k, items[n]!.id]));
  add(f.items.map((i) => i.value)); add(f.options.map((o) => o.value));
  // Debtor keys identify the whole name; the fixture keys each debtor by its group id.
  for (const i of f.items) pairs.push([stableKey(i.value.label, 80), i.value.debtorKey]);
  for (const o of f.options) if (o.value.eligibility?.sublimitGroup) pairs.push([stableKey(o.value.eligibility.sublimitGroup), o.value.eligibility.sublimitGroup]);
  return new Map(pairs);
};
const complete = (e: ReceivablesFundingExtraction, f: ReceivablesFundingFacts) => {
  const c = completeReceivablesFundingFacts({extraction: e, ids: idsOf(f), currency: "BRL"});
  if (c.status !== "complete") throw new Error(JSON.stringify(c));
  return c;
};

describe("receivables funding premises proposed from a turn", () => {
  it("recognizes the ficha C35 questions, with or without documents, and not a conceptual question or another method", () => {
    for (const m of ["Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?", "Quero antecipar recebíveis em vez de pegar linha no banco.",
      "Quais FIDCs comprariam nossa carteira?", "Vale fazer um FIDC próprio?"]) for (const docs of [false, true]) expect(shouldProposeReceivablesFundingPremises(m, docs), m).toBe(true);
    for (const m of ["O que é um FIDC?", "Compare as propostas de antecipação de recebíveis.", "Quando é a semana mais apertada?"])
      for (const docs of [false, true]) expect(shouldProposeReceivablesFundingPremises(m, docs), m).toBe(false);
  });
  it("takes the treasurer's answer about the anchor program as a continuation candidate", () => {
    const earlier = ["Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?"];
    expect(shouldProposeReceivablesFundingPremises("A rede A tem programa com o Santander. Nunca usamos.", false, earlier)).toBe(true);
    expect(shouldProposeReceivablesFundingPremises("A rede A tem programa?", false, earlier)).toBe(false);
  });
  it("completes the Aurora facts and proposes the hypotheses the fixture proposes", () => {
    const f = aurora(), c = complete(auroraExtraction(f), f);
    expect(c.situationId).toBe("seasonal-working-capital");
    expect(c.housePremiseKeys).toEqual([]);
    expect(comparableHypotheses(proposeReceivablesFundingHypotheses(c.facts), renameOf(f))).toEqual(comparableHypotheses(proposeReceivablesFundingHypotheses(f)));
  });
  it("names every house convention it uses and never adopts a value the source does not state", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.calendarDays = none; e.businessDays = none;
    const c = complete(e, f);
    expect(c.facts.calendarDays).toMatchObject({value: 166, origin: "house"});
    expect(c.facts.businessDays.origin).toBe("estimate");
    expect(c.housePremiseKeys.sort()).toEqual(["businessDays", "calendarDays"]);
    const line = auroraExtraction(f); line.options.find((o) => o.kind === "bank_line")!.iofDaily = null; line.options[0]!.rate = null; line.annualDi = none; line.dedicatedVehicleThreshold = none;
    expect(completeReceivablesFundingFacts({extraction: line, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing", missing: ["annualDi", "dedicatedVehicleThreshold", "options.1.rate", "options.5.iofDaily"]});
  });
  it("asks for the IOF of a documented FIDC option instead of adopting zero under its document (independent review, round 2)", () => {
    const f = aurora(), e = auroraExtraction(f);
    const k = e.options.findIndex((o) => o.kind === "fidc");
    Object.assign(e.options[k]!, {origin: "document", source: "regulamento-fidc.pdf", iofDaily: null, iofDailyCapDays: null, iofAdditional: null});
    expect(completeReceivablesFundingFacts({extraction: e, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing",
      missing: [`options.${k + 1}.iofDaily`, `options.${k + 1}.iofDailyCapDays`, `options.${k + 1}.iofAdditional`]});
  });
  it("asks for debtor quality, anchor program, the disjoint debtor set and collateral instead of filling them under the source", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.items[0]!.creditTier = null; e.items[0]!.anchorProgram = null;
    const multi = e.items.findIndex((i) => i.debtorCount !== 1); e.items[multi]!.debtorSetDisjoint = null;
    e.options[0]!.collateral = null;
    expect(completeReceivablesFundingFacts({extraction: e, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing",
      missing: ["items.1.creditTier", "items.1.anchorProgram", `items.${multi + 1}.debtorSetDisjoint`, "options.1.collateral"]});
  });
  it("asks for the contract, the encumbrance holder and an unknown anchor in one batch", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.items[0]!.contract = null; e.items[1]!.encumbranceHolder = null; e.options[0]!.anchorItemLabels = ["Rede Z"];
    expect(completeReceivablesFundingFacts({extraction: e, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing",
      missing: ["items.1.contract", "items.2.encumbranceHolder", "options.1.anchorItemLabels"]});
  });
  it("never merges two debtors whose names share a long prefix, keys a CNPJ as itself and asks for a key that would join two identities (independent review, round 3)", () => {
    const f = aurora(), e = auroraExtraction(f);
    const base = e.items.find((i) => i.debtorCount === 1)!;
    e.items = [{...base, label: "Distribuidora Brasileira de Alimentos Nordeste Ltda", amount: "3000000"}, {...base, label: "Distribuidora Brasileira de Alimentos Sudeste Ltda", amount: "3000000"}];
    e.options = e.options.filter((o) => o.kind !== "anchor_program");
    const c = complete(e, f), keys = c.facts.items.map((i) => i.value.debtorKey);
    expect(new Set(keys).size).toBe(2);
    // The same debtor named in two groups keeps one key; a stated CNPJ is the identity.
    const same = auroraExtraction(f); same.items = [{...base, label: "Lote 1", debtorLabel: "Rede Z"}, {...base, label: "Lote 2", debtorLabel: "Rede Z"}];
    same.options = same.options.filter((o) => o.kind !== "anchor_program");
    expect(new Set(complete(same, f).facts.items.map((i) => i.value.debtorKey)).size).toBe(1);
    const taxed = auroraExtraction(f); taxed.items = [{...base, label: "Rede Z", debtorTaxId: "12345678000190"}];
    taxed.options = taxed.options.filter((o) => o.kind !== "anchor_program");
    expect(complete(taxed, f).facts.items[0]!.value.debtorKey).toBe("cnpj-12345678000190");
    // Sublimit groups with long shared prefixes stay apart too.
    expect(stableKey("Fundos multicedentes do gestor Alfa Nordeste")).not.toBe(stableKey("Fundos multicedentes do gestor Alfa Sudeste"));
  });
  it("builds the card summary, field paths the store accepts and a stable fingerprint", () => {
    const f = aurora(), c = complete(auroraExtraction(f), f), proposal = buildReceivablesFundingPremiseProposal(c.facts);
    expect(proposal.summary).toMatchObject({situationId: "seasonal-working-capital", referenceDate: "2026-09-15"});
    expect(proposal.summary.items.every((x) => summaryGroups.includes(x.group) && summaryOrigins.includes(x.origin))).toBe(true);
    expect(proposal.summary.items.filter((x) => x.group === "premise").map((x) => [x.labelKey, x.origin])).toEqual([["needAverage", "informed"], ["needPeak", "informed"],
      ["annualDi", "informed"], ["lienBasketRemaining", "document"], ["dedicatedVehicleThreshold", "informed"]]);
    expect(proposal.hypotheses.every((h) => /^receivables_funding\.[0-9a-f-]{36}\.[A-Za-z0-9_.-]{1,200}$/.test(h.fieldPath))).toBe(true);
    expect(proposal).toMatchObject({methodId: "monetize-receivables-for-working-capital", methodVersion: "2026.10.26-v1"});
  });
  it("proposes only when the extraction reads the turn as answering", async () => {
    const earlier = ["Quero antecipar recebíveis em vez de pegar linha no banco."];
    for (const intent of nonAnswering)
      expect(await turnWithIntent(proposeReceivablesFundingPremisesForTurn, auroraExtraction(aurora()), intent, "Mando a carteira amanhã", earlier), intent)
        .toEqual({extracted: true, status: null, events: ["receivables_funding_premises.not_answering"]});
    expect(await turnWithIntent(proposeReceivablesFundingPremisesForTurn, auroraExtraction(aurora()), "answers_pending", earlier[0]!, [])).toMatchObject({status: "proposed"});
  });
});
