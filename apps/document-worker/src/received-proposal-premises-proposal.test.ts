import {beforeAll, describe, expect, it} from "vitest";
import {proposeReceivedProposalHypotheses, type ReceivedProposalFacts} from "@offroad/financial-model";
import {buildReceivedProposalPremiseProposal, houseCreditTax, completeReceivedProposalFacts, proposeReceivedProposalPremisesForTurn, receivedProposalContradictions, receivedProposalReader,
  receivedProposalReaderGaps, shouldProposeReceivedProposalPremises, receivedProposalEntry, type ReceivedProposalExtraction} from "./received-proposal-premises-proposal";
import {itemKeys} from "./lote2-premises";
import {inMemoryBasis} from "./lote3-reader-check";
import {comparableHypotheses, financialModelFixture, nonAnswering, summaryGroups, summaryOrigins} from "./lote2-premises.test-support";

let aurora: () => ReceivedProposalFacts;
beforeAll(async () => {aurora = (await financialModelFixture<{auroraReceivedProposalFacts: () => ReceivedProposalFacts}>("evaluate-received-proposal.test-support.ts")).auroraReceivedProposalFacts;});

const none = {value: null, origin: null, source: null};
const today = "2026-08-14";
type Reading = ReceivedProposalExtraction["proposalReadings"][number];
const blankReading = (origin: "informed" | "document", source: string): Reading => ({origin, source, anchor: null, lender: null, firmness: null, termSheetDate: null, validityDays: null,
  amount: null, annualSpread: null, feeRate: null, drawDate: null, paymentDay: null, termMonths: null, graceMonths: null, installments: null, installmentEveryMonths: null,
  interestEveryMonths: null, amortization: null, collateralKind: null, coverage: null, restrictedAccount: null, covenant: null, prepaymentPenaltyRate: null,
  prepaymentPenaltyMonths: null, reciprocity: null, bankSawIndenture: null});
const empty = (): ReceivedProposalExtraction => ({turnIntent: "answers_pending", proposalReadings: [], indexer: none, readingDate: none, needDate: none, uses: [], seasonalPeak: none,
  creditTax: none, indexCurve: none, tax: none, taxableAfterCalendar: none, calendar: none, minimumCash: none, indenture: none, policy: none, measurements: none, portfolio: [],
  basket: none, collateralReference: none, market: none, history: none, variants: [], alternatives: []});

// Ficha C01, turn by turn. The messages are the ficha's; turn 3b and turn 5 are where this bridge differs from the
// narrated ficha: the bridge does not build the projection, the market range, the last-operation bridge nor the asks,
// so the person brings them (or a later reading of prior results does). Synthetic Aurora calibration, in BRL millions.
const turn1 = "O Itaú mandou proposta de CCB de R$ 30 milhões, três anos, CDI mais 2,1, com cessão fiduciária de recebíveis. É boa?";
const turn2 = "Vai anexo o term sheet e os números. O dinheiro é para duas coisas: uns R$ 20 milhões para a compra de safra de outubro a dezembro, e R$ 10 milhões para antecipar a linha de embalagem, que entra em obra em novembro. A conversa começou porque o gerente do Itaú ofereceu depois que apresentamos o primeiro semestre; não temos outra proposta na mesa. Eles viram as demonstrações de 2025 e o gerencial do primeiro semestre.";
const turn3 = "Anexos. Não temos projeção formal para o segundo semestre; o que sei é que a safra costuma consumir uns R$ 25 milhões entre outubro e dezembro e recompõe até março.";
const turn3b = "Segue a projeção trimestral sem a CCB, com o caso do banco, o CDI e o IOF que usamos, a referência de cobertura e o estudo de comparáveis.";
const turn4 = "Faz sentido. Mas o Itaú já está com a proposta na mão e o Finame demora. E se eu mantiver os R$ 30 milhões com o Itaú e só negociar a garantia?";
const turn5 = "Avalia carência de 12 meses com prazo de 48 e de 60, e cobertura de 120% sem conta vinculada. Considera também a linha de giro de seis meses para a safra e o Finame para a embalagem.";

/** What the extraction reads after each turn, cumulatively, from the messages and the attached documents. */
function auroraTurns(f: ReceivedProposalFacts) {
  const p = f.proposal.value;
  const t1 = empty();
  t1.proposalReadings = [{...blankReading("informed", "mensagem do CFO"), lender: "Itaú", amount: "30", termMonths: 36, annualSpread: "0.021", collateralKind: "receivables_assignment"}];
  t1.indexer = {value: "cdi_plus", origin: "informed", source: "CDI mais 2,1, dito pelo CFO"};
  const t2: ReceivedProposalExtraction = {...t1, proposalReadings: [...t1.proposalReadings,
    {...blankReading("document", "term-sheet-itau.pdf"), lender: p.lender, firmness: p.firmness, termSheetDate: p.termSheetDate, validityDays: p.validityDays, amount: p.amount,
      annualSpread: p.annualSpread, feeRate: p.feeRate, termMonths: 36, graceMonths: p.graceMonths, installmentEveryMonths: p.installmentEveryMonths, interestEveryMonths: p.interestEveryMonths,
      amortization: p.amortization, collateralKind: p.collateralKind, coverage: p.coverage, restrictedAccount: p.restrictedAccount,
      covenant: p.covenant ? {maximumRatio: p.covenant.maximumRatio, testDates: [...p.covenant.testDates], definition: p.covenant.definition} : "none",
      prepaymentPenaltyRate: p.prepayment.penaltyRate, prepaymentPenaltyMonths: p.prepayment.penaltyMonths, reciprocity: p.reciprocity},
    {...blankReading("informed", "eles viram as demonstrações de 2025 e o gerencial, não a escritura"), bankSawIndenture: p.bankSawIndenture}],
    indexer: {value: "cdi_plus", origin: "document", source: "term sheet do Itaú: CDI mais 2,10% ao ano"},
    needDate: {value: f.needDate.value, origin: "informed", source: "compra de safra a partir de outubro"},
    uses: f.uses.map((u) => ({label: u.value.label, origin: "informed" as const, source: u.source, amount: u.value.amount, kind: u.value.kind,
      tenorMinYears: u.value.tenorMinYears, tenorMaxYears: u.value.tenorMaxYears})),
    tax: {value: {regime: f.tax.value.regime, rate: f.tax.value.rate}, origin: "document", source: "DF-2025-auditada.pdf, nota de tributos"}};
  const t3: ReceivedProposalExtraction = {...t2,
    seasonalPeak: {value: f.seasonalPeak!.value, origin: "informed", source: "a safra costuma consumir uns R$ 25 milhões"},
    indenture: {value: {maximumRatio: f.indenture.value.maximumRatio, testDates: [...f.indenture.value.testDates], document: f.indenture.value.source}, origin: "document", source: "escritura-debenture-2021.pdf"},
    policy: {value: {maximumRatio: f.policy!.value.maximumRatio, testDates: [...f.policy!.value.testDates], document: f.policy!.value.source}, origin: "document", source: "ata do conselho de março de 2026"},
    portfolio: f.portfolio.map((b, n) => ({label: b.value.label, origin: "document" as const, source: "aging-clientes-jun26.xlsx", anchor: `linha ${n + 2}`, amount: b.value.amount,
      contract: b.value.contract, encumbrance: b.value.encumbrance, holder: b.value.holder, pastDue: b.value.pastDue, countsAgainstBasket: b.value.encumbrance === "assigned" ? b.value.countsAgainstBasket : null})),
    basket: {value: {...f.basket.value}, origin: "document", source: "escritura-debenture-2021.pdf, cláusula de garantias; tabela-de-divida-jun26.xlsx"}};
  const c = f.calendar.value;
  const t3b: ReceivedProposalExtraction = {...t3,
    creditTax: {value: {...f.creditTax.value}, origin: "document", source: "term sheet do Itaú, demonstrativo do custo efetivo"},
    indexCurve: {value: f.indexCurve.value.map((x) => ({...x})), origin: "document", source: "projecao-trimestral.xlsx, premissas de CDI"},
    taxableAfterCalendar: {value: true, origin: "informed", source: "a companhia segue no lucro real com lucro tributável"},
    calendar: {value: {openingDate: f.openingDate, periods: c.periodEnds.map((periodEnd, k) => ({periodEnd, existingService: c.existingService[k]!, availableForService: c.availableForService[k]!,
      closingCash: c.closingCash[k]!, taxable: c.taxable[k]!}))}, origin: "document", source: "projecao-trimestral.xlsx, sem a CCB"},
    minimumCash: {value: f.minimumCash!.value, origin: "informed", source: "caixa mínimo de duas semanas de desembolso"},
    measurements: {value: f.measurements.value.map((m) => ({...m, scenario: m.scenario as "base" | "bank"})), origin: "document", source: "projecao-trimestral.xlsx, apurações na definição da escritura"},
    collateralReference: {value: {...f.collateralReference.value}, origin: "informed", source: "cobertura usual sem conta vinculada, informada pela tesouraria"},
    market: {value: {...f.market!.value}, origin: "document", source: "estudo-comparaveis.pdf"},
    history: {value: {label: f.history!.value.label, spread: f.history!.value.spread, date: f.history!.value.date,
      adjustments: f.history!.value.adjustments.map((a) => ({label: a.id, family: a.family, bps: a.bps, anchor: a.anchor}))}, origin: "document", source: "memoria-precificacao.pdf"}};
  const t4: ReceivedProposalExtraction = {...t3b, variants: [{label: "Manter os R$ 30 milhões e negociar só a garantia", origin: "informed", source: "pergunta do CFO",
    graceMonths: null, termMonths: null, installments: null, coverage: null, restrictedAccount: null}]};
  const v = f.variants.map((x) => x.value);
  const t5: ReceivedProposalExtraction = {...t3b,
    variants: [{label: v[0]!.label, origin: "informed", source: "pedido do CFO", graceMonths: 12, termMonths: 48, installments: null, coverage: null, restrictedAccount: null},
      {label: v[1]!.label, origin: "informed", source: "pedido do CFO", graceMonths: 12, termMonths: 60, installments: null, coverage: null, restrictedAccount: null},
      {label: v[2]!.label, origin: "informed", source: "pedido do CFO", graceMonths: null, termMonths: null, installments: null, coverage: "1.2", restrictedAccount: false}],
    alternatives: f.alternatives.map((a) => ({label: a.value.label, origin: "informed" as const, source: a.source, allInSpread: a.value.allInSpread ?? "not_comparable" as const,
      collateral: a.value.collateral, usesCovered: a.value.usesCovered.map((id) => f.uses.find((u) => u.value.id === id)!.value.label),
      monthsToMoneyMin: a.value.monthsToMoneyMin, monthsToMoneyMax: a.value.monthsToMoneyMax}))};
  return {t1, t2, t3, t3b, t4, t5};
}
const idsOf = (f: ReceivedProposalFacts) => ({receivedProposalId: f.receivedProposalId, entityId: f.entityId, definitionVersionId: f.definitionVersionId});
const renameOf = (f: ReceivedProposalFacts) => {
  const pairs: [string, string][] = [];
  const add = (xs: {value: {label: string; id: string}}[]) => itemKeys(xs.map((x) => x.value.label)).forEach((k, n) => pairs.push([k, xs[n]!.value.id]));
  add(f.uses); add(f.portfolio); add(f.variants); add(f.alternatives);
  return new Map(pairs);
};
const complete = (e: ReceivedProposalExtraction, f: ReceivedProposalFacts) => completeReceivedProposalFacts({extraction: e, ids: idsOf(f), currency: "BRL", today});
const completed = (e: ReceivedProposalExtraction, f: ReceivedProposalFacts) => {const c = complete(e, f); if (c.status !== "complete") throw new Error(JSON.stringify(c)); return c;};
const missingOf = (e: ReceivedProposalExtraction, f: ReceivedProposalFacts) => {const c = complete(e, f); return c.status === "missing" ? c.missing : [];};
const packetOf = (facts: ReceivedProposalFacts) => receivedProposalReader(inMemoryBasis(proposeReceivedProposalHypotheses(facts)));
const renamed = (value: unknown, rename: ReadonlyMap<string, string>) => [...rename].reduce((s, [k, v]) => s.split(`"${k}"`).join(`"${v}"`), JSON.stringify(value));

const project = "a0000000-0000-4000-8000-000000000001";
async function turn(message: string, earlier: string[], extraction: ReceivedProposalExtraction, hasAttachments = false) {
  const events: string[] = [];
  const result = await proposeReceivedProposalPremisesForTurn({message, hasAttachments, recentUserMessages: earlier, projectId: project, today,
    loadEvidence: async () => [], extract: async () => extraction, log: (event) => {events.push(event);}});
  return {result, events};
}

describe("received proposal premises proposed from a turn (ficha C01)", {timeout: 300_000}, () => {
  it("recognizes the ficha question and the procedure's activations, and leaves the neighbours alone", () => {
    for (const m of [turn1, "Recebi uma proposta do Itaú, é boa?", "O banco mandou um term sheet. Vale a pena?", "Devo aceitar a proposta do Itaú?", "Essa proposta do Bradesco é boa?"])
      for (const docs of [false, true]) expect(shouldProposeReceivedProposalPremises(m, docs), m).toBe(true);
    for (const m of ["Recebemos duas propostas, qual a melhor?", "Compare a proposta do Itaú com a do Bradesco", "O que é uma CCB?", "Organiza o term sheet do Itaú",
      "Recebi uma proposta de compra da empresa, é boa?", "Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?",
      "Quanto de dívida a gente aguenta?", "Monta a tabela de dívida"]) for (const docs of [false, true]) expect(shouldProposeReceivedProposalPremises(m, docs), m).toBe(false);
  });
  it("takes each later turn of the ficha as a continuation, the what-if included, and not a question nor another method", () => {
    expect(receivedProposalEntry(turn2, true, [turn1])).toBe("continuation");
    expect(receivedProposalEntry(turn3, true, [turn1, turn2])).toBe("continuation");
    expect(receivedProposalEntry(turn4, false, [turn1, turn2, turn3])).toBe("continuation");
    expect(receivedProposalEntry(turn5, false, [turn1, turn2, turn3, turn4])).toBe("continuation");
    expect(receivedProposalEntry("Qual é o prazo da debênture?", false, [turn1])).toBeNull();
    expect(receivedProposalEntry("Me explica o que é negative pledge", false, [turn1])).toBeNull();
    expect(receivedProposalEntry("Monta a tabela de dívida", false, [turn1])).toBeNull();
    expect(receivedProposalEntry(turn2, true, [])).toBeNull();
  });
  it("reproduces the conversation: missing in batch at each turn, critical first, then the card, the what-if and the asks", async () => {
    const f = aurora(), t = auroraTurns(f);
    // Turn 1: only the terms said; purpose and collateral first, the indexer never asked because it was said.
    const one = await turn(turn1, [], t.t1);
    expect(one.result?.forAdvisor.status).toBe("missing");
    const m1 = one.result!.forAdvisor.status === "missing" ? one.result!.forAdvisor.missing : [];
    expect(m1[0]).toBe("uses"); expect(m1).not.toContain("indexer");
    expect(m1.slice(0, 3)).toEqual(["uses", "proposal.coverage", "proposal.restrictedAccount"]);
    // Turn 2: term sheet and uses; the clauses in force, the portfolio and the company calendar remain.
    const m2 = missingOf(t.t2, f);
    expect(m2.filter((k) => k.startsWith("proposal") || k === "uses" || k === "indexer")).toEqual([]);
    // The credit IOF is the house convention when nobody states it (decision 1): never asked.
    expect(m2).toEqual(["portfolio", "basket", "calendar", "indenture", "measurements", "indexCurve", "collateralReference"]);
    expect((await turn(turn2, [turn1], t.t2, true)).result?.forAdvisor).toEqual({status: "missing", missing: m2});
    // Turn 3: indenture and aging; what the ficha built itself (projection, curve, reference) is asked by name.
    expect(missingOf(t.t3, f)).toEqual(["calendar", "measurements", "indexCurve", "collateralReference"]);
    // Turn 3b: the card.
    const card = await turn(turn3b, [turn1, turn2, turn3], t.t3b, true);
    expect(card.result?.forAdvisor.status).toBe("proposed");
    expect(card.events).toEqual(["received_proposal_premises.proposed"]);
    // Turn 4: the what-if without a term is asked what changes.
    expect((await turn(turn4, [turn1, turn2, turn3, turn3b], t.t4)).result?.forAdvisor).toEqual({status: "missing", missing: ["variants.1.terms"]});
    // Turn 5: the asks and the alternatives; the card reaches the calibration.
    const five = await turn(turn5, [turn1, turn2, turn3, turn3b, turn4], t.t5);
    expect(five.result?.forAdvisor.status).toBe("proposed");
    const c = completed(t.t5, f);
    // The turn's facts are the completed facts under the work's own analysis identity.
    const strip = (x: ReceivedProposalFacts) => {const {receivedProposalId: _r, entityId: _e, definitionVersionId: _d, ...rest} = x; return rest;};
    expect(strip(five.result!.proposal!.facts as ReceivedProposalFacts)).toEqual(strip(c.facts));
    expect(comparableHypotheses(proposeReceivedProposalHypotheses(c.facts), renameOf(f))).toEqual(comparableHypotheses(proposeReceivedProposalHypotheses(f)));
  });
  it("the confirmed card leads to the calibration packet: CDI + 4,90 gross, 3,24 net, 25,41 assignable, 3 left in the basket", () => {
    const f = aurora(), c = completed(auroraTurns(f).t5, f), rename = renameOf(f);
    const ours = packetOf(c.facts), reference = packetOf(f);
    expect(ours.status).toBe(reference.status);
    expect(renamed(ours.readings, rename)).toBe(JSON.stringify(reference.readings));
    expect(renamed(ours.result.evaluation, rename)).toBe(JSON.stringify(reference.result.evaluation));
    const r = ours.readings!;
    expect([Number(r.price.equivalentSpread).toFixed(4), Number(r.price.equivalentSpreadNet).toFixed(4), r.collateral.assignable, r.negativePledge.remaining])
      .toEqual(["0.0490", "0.0324", "25.41", "3"]);
    expect(receivedProposalReaderGaps(c.facts)).toEqual([]);
  });
  it("uses the house credit IOF only when nobody states it, named with its source and date, and a stated rule prevails", () => {
    const f = aurora(), t = auroraTurns(f);
    const unstated = structuredClone(t.t5);
    unstated.creditTax = {value: null, origin: null, source: null};
    const c = completed(unstated, f);
    expect(c.housePremiseKeys).toContain("creditTax");
    expect(c.facts.creditTax).toEqual(houseCreditTax);
    expect(c.facts.creditTax.origin).toBe("house");
    expect(c.facts.creditTax.source).toMatch(/Decreto 12\.499\/2025/);
    expect(c.facts.creditTax.source).toMatch(/27\/10\/2026/);
    // The house rule is the calibration's: the packet is the same.
    expect(JSON.stringify(packetOf(c.facts).readings)).toBe(JSON.stringify(packetOf(completed(t.t5, f).facts).readings));
    // Stated by the person or a document, it prevails; stated in part, the missing field is asked by name.
    const stated = completed(t.t5, f);
    expect(stated.housePremiseKeys).not.toContain("creditTax");
    expect(stated.facts.creditTax.origin).toBe("document");
    const partial = structuredClone(t.t5);
    partial.creditTax = {...partial.creditTax, value: {...partial.creditTax.value!, dailyRate: null}};
    expect(missingOf(partial, f)).toEqual(["creditTax.dailyRate"]);
  });
  it("names every house premise and keeps the reasons' origins", () => {
    const f = aurora(), c = completed(auroraTurns(f).t5, f);
    expect(c.housePremiseKeys.sort()).toEqual(["covenantScenarios", "drawDate", "paymentDay", "readingDate"]);
    expect(c.situationId).toBe("seasonal-working-capital");
    expect(c.facts.readingDate).toMatchObject({value: today, origin: "house"});
    expect(c.facts.provenance).toMatchObject({drawDate: {origin: "house"}, paymentDay: {origin: "house"}, termSheetDate: {origin: "document"}, bankSawIndenture: {origin: "informed"}});
    // The term sheet and the CFO said the same terms: documented, the conversation kept in the source.
    expect(c.facts.proposal.origin).toBe("document");
    expect(c.facts.proposal.source).toContain("também informado na conversa");
    const h = proposeReceivedProposalHypotheses(c.facts);
    expect(h.find((x) => x.fieldPath.endsWith(".proposal.indexer"))!.reason).toBe("Origem: documento. term sheet do Itaú: CDI mais 2,10% ao ano");
    expect(h.find((x) => x.fieldPath.endsWith(".proposal.drawDate"))!.reason).toMatch(/^Origem: premissa da casa\./);
    // A stated draw date and reading date replace the house ones.
    const t = auroraTurns(f).t5;
    t.proposalReadings[1] = {...t.proposalReadings[1]!, drawDate: "2026-10-05", paymentDay: 5};
    t.readingDate = {value: "2026-08-20", origin: "informed", source: "hoje"};
    const stated = completed(t, f);
    expect(stated.housePremiseKeys).toEqual(["covenantScenarios"]);
    expect([stated.facts.proposal.value.drawDate, stated.facts.proposal.value.paymentDay, stated.facts.readingDate.value]).toEqual(["2026-10-05", 5, "2026-08-20"]);
  });
  it("builds the card with known groups and origins, house labels by key, and a stable fingerprint", () => {
    const f = aurora(), c = completed(auroraTurns(f).t5, f), proposal = buildReceivedProposalPremiseProposal(c.facts);
    expect(proposal).toMatchObject({methodId: "evaluate-received-proposal", methodVersion: "2026.10.27-v1", summary: {situationId: "seasonal-working-capital", referenceDate: today}});
    expect(proposal.summary.items.every((x) => summaryGroups.includes(x.group) && summaryOrigins.includes(x.origin))).toBe(true);
    expect(proposal.summary.items.filter((x) => x.origin === "house").map((x) => x.labelKey)).toEqual(["drawDate", "paymentDay", "readingDate", "covenantScenarios"]);
    expect(proposal.summary.items.filter((x) => x.group === "case").map((x) => x.labelKey)).toEqual(["covenantScenarios", "askCase", "askCase", "askCase"]);
    expect(proposal.hypotheses.length).toBeLessThanOrEqual(256);
    expect(proposal.hypotheses.every((h) => /^received_proposal\.[0-9a-f-]{36}\.[A-Za-z0-9_.-]{1,200}$/.test(h.fieldPath))).toBe(true);
    expect(buildReceivedProposalPremiseProposal(c.facts).fingerprint).toBe(proposal.fingerprint);
  });
  it("never assumes the indexer: unstated it is asked, outside CDI plus spread it is named", () => {
    const f = aurora(), t = auroraTurns(f).t5;
    expect(missingOf({...t, indexer: none}, f)).toEqual(["indexer"]);
    expect(missingOf({...t, indexer: {value: "percent_of_cdi", origin: "document", source: "term sheet"}}, f)).toEqual(["indexer.unsupported"]);
    expect(missingOf({...t, indexer: {value: "cdi_plus", origin: null, source: null}}, f)).toEqual(["indexer"]);
    const price = auroraTurns(f).t5; price.proposalReadings[1] = {...price.proposalReadings[1]!, amortization: "price"};
    expect(missingOf(price, f)).toContain("proposal.amortization.unsupported");
  });
  it("asks two readings of a term that disagree, never resolving by order", () => {
    const f = aurora(), t = auroraTurns(f).t5;
    t.proposalReadings[0] = {...t.proposalReadings[0]!, annualSpread: "0.02"};
    expect(missingOf(t, f)).toEqual(["proposal.annualSpread"]);
    const term = auroraTurns(f).t5; term.proposalReadings[0] = {...term.proposalReadings[0]!, termMonths: 48};
    expect(missingOf(term, f)).toEqual(["proposal.termMonths"]);
    // Equal values with other spellings are one value.
    const same = auroraTurns(f).t5; same.proposalReadings[0] = {...same.proposalReadings[0]!, annualSpread: "0.0210", lender: "ITAU"};
    expect(complete(same, f).status).toBe("complete");
  });
  it("derives the third of term, grace and installments from two, and asks when three disagree", () => {
    const f = aurora(), t = auroraTurns(f).t5;
    t.proposalReadings[1] = {...t.proposalReadings[1]!, graceMonths: null, installments: 30};
    t.proposalReadings[0] = {...t.proposalReadings[0]!, termMonths: null};
    expect(completed(t, f).facts.proposal.value.graceMonths).toBe(6);
    const odd = auroraTurns(f).t5; odd.proposalReadings[1] = {...odd.proposalReadings[1]!, installments: 29};
    expect(missingOf(odd, f)).toEqual(["proposal.termMonths"]);
  });
  it("never turns absence into zero: basket usage, the lender covenant and covenant tests are asked", () => {
    const f = aurora(), t = auroraTurns(f).t5;
    expect(missingOf({...t, basket: {...t.basket, value: {...t.basket.value!, occupied: null}}}, f)).toEqual(["basket.occupied"]);
    const cov = auroraTurns(f).t5; cov.proposalReadings[1] = {...cov.proposalReadings[1]!, covenant: null};
    expect(missingOf(cov, f)).toEqual(["proposal.covenant"]);
    expect(missingOf({...t, measurements: none}, f)).toEqual(["measurements"]);
    // Stated as none, the lender has no covenant and the card is offered.
    const noCov = auroraTurns(f).t5; noCov.proposalReadings[1] = {...noCov.proposalReadings[1]!, covenant: "none"};
    expect(completed(noCov, f).facts.proposal.value.covenant).toBeNull();
    // Tests missing for a required date or scenario are the packet's named gaps, never compliance.
    const partial = auroraTurns(f).t5; partial.measurements = {...partial.measurements, value: partial.measurements.value!.filter((m) => m.scenario === "base")};
    const packet = packetOf(completed(partial, f).facts);
    expect([packet.status, packet.readings!.covenant.anyBreachWith]).toEqual(["partial", null]);
    expect(packet.gaps.some((g) => g.operand.endsWith("covenant.bank.2026-12-31"))).toBe(true);
  });
  it("asks every contradiction inside one record", () => {
    const f = aurora();
    expect(receivedProposalContradictions(auroraTurns(f).t5)).toEqual([]);
    const cases: [string, (e: ReceivedProposalExtraction) => void][] = [
      ["indenture.testDates", (e) => {e.indenture = {...e.indenture, value: {...e.indenture.value!, testDates: [...e.indenture.value!.testDates, e.indenture.value!.testDates[0]!]}};}],
      ["proposal.covenant", (e) => {const r = e.proposalReadings[1]!, c = r.covenant as {testDates: string[]}; e.proposalReadings[1] = {...r, covenant: {...c, testDates: [...c.testDates, c.testDates[0]!]} as never};}],
      ["tax.rate", (e) => {e.tax = {...e.tax, value: {...e.tax.value!, rate: "1.2"}};}],
      ["basket.consentLeadDays", (e) => {e.basket = {...e.basket, value: {...e.basket.value!, consentLeadDaysMin: 40}};}],
      ["basket.occupied", (e) => {e.basket = {...e.basket, value: {...e.basket.value!, occupied: "10"}};}],
      ["collateralReference", (e) => {e.collateralReference = {...e.collateralReference, value: {coverageLow: "1.4", coverageHigh: "1.3"}};}],
      ["market", (e) => {e.market = {...e.market, value: {...e.market.value!, median: "0.03"}};}],
      ["portfolio.4.countsAgainstBasket", (e) => {e.portfolio[3] = {...e.portfolio[3]!, countsAgainstBasket: true};}],
      ["portfolio.1.holder", (e) => {e.portfolio[0] = {...e.portfolio[0]!, holder: "Banco Alfa"};}],
      ["uses.1.tenor", (e) => {e.uses[0] = {...e.uses[0]!, tenorMinYears: "2"};}],
    ];
    for (const [key, edit] of cases) {
      const e = auroraTurns(f).t5; edit(e);
      expect(receivedProposalContradictions(e), key).toEqual([key]);
      expect(missingOf(e, f), key).toContain(key);
    }
  });
  it("asks a measurement off the calendar, a period read twice with two values, a reading after the draw and a draw outside the calendar", () => {
    const f = aurora(), t = auroraTurns(f).t5;
    const off = {...t, measurements: {...t.measurements, value: t.measurements.value!.map((m, n) => n ? m : {...m, date: "2026-11-30"})}};
    expect(missingOf(off, f)).toEqual(["measurements.2026-11-30.base.date"]);
    const twice = {...t, calendar: {...t.calendar, value: {...t.calendar.value!, periods: [...t.calendar.value!.periods, {...t.calendar.value!.periods[0]!, closingCash: "1"}]}}};
    expect(missingOf(twice, f)).toEqual(["calendar.periods.2026-09-30"]);
    const once = {...t, calendar: {...t.calendar, value: {...t.calendar.value!, periods: [...t.calendar.value!.periods, {...t.calendar.value!.periods[0]!}]}}};
    expect(complete(once, f).status).toBe("complete");
    expect(missingOf({...t, readingDate: {value: "2026-10-02", origin: "informed", source: "hoje"}}, f)).toEqual(["proposal.drawDate"]);
    const late = auroraTurns(f).t5; late.proposalReadings[1] = {...late.proposalReadings[1]!, drawDate: "2029-03-01"};
    expect(missingOf(late, f)).toEqual(["calendar.periods"]);
  });
  it("record identity: the same bucket read twice is one, two readings of one row with two values are asked, a use label stated twice is asked", () => {
    const f = aurora(), t = auroraTurns(f).t5, n = t.portfolio.length;
    expect(completed({...t, portfolio: [...t.portfolio, {...t.portfolio[0]!}]}, f).facts.portfolio).toHaveLength(n);
    expect(missingOf({...t, portfolio: [...t.portfolio, {...t.portfolio[0]!, amount: "19"}]}, f)).toEqual([`portfolio.${n + 1}.anchor`]);
    expect(missingOf({...t, uses: [...t.uses, {...t.uses[0]!, amount: "21"}]}, f)).toEqual(["uses.3.label"]);
    expect(completed({...t, uses: [...t.uses, {...t.uses[0]!}]}, f).facts.uses).toHaveLength(2);
  });
  it("an ask keeps the proposal's unchanged terms; an alternative names the uses it covers", () => {
    const f = aurora(), c = completed(auroraTurns(f).t5, f);
    expect(c.facts.variants.map((v) => [v.value.graceMonths, v.value.installments, v.value.coverage, v.value.restrictedAccount]))
      .toEqual([[12, 36, "1.3", true], [12, 48, "1.3", true], [6, 30, "1.2", false]]);
    expect(c.facts.variants[0]!.source).toContain("cobertura, conta vinculada como na proposta");
    const t = auroraTurns(f).t5; t.alternatives[0] = {...t.alternatives[0]!, usesCovered: ["Uso que não existe"]};
    expect(missingOf(t, f)).toEqual(["alternatives.1.usesCovered"]);
  });
  it("proposes only when the extraction reads the turn as answering", async () => {
    const f = aurora(), t = auroraTurns(f).t5;
    for (const intent of nonAnswering) {
      const r = await turn("Mando a projeção amanhã", [turn1], {...t, turnIntent: intent});
      expect([r.result, r.events], intent).toEqual([null, ["received_proposal_premises.not_answering"]]);
    }
    expect((await turn(turn1, [], t)).result?.forAdvisor.status).toBe("proposed");
    expect(await proposeReceivedProposalPremisesForTurn({message: turn1, hasAttachments: false, recentUserMessages: [], projectId: null, today,
      loadEvidence: async () => [], extract: async () => t, log: () => undefined})).toBeNull();
  });
});
