import {beforeAll, describe, expect, it} from "vitest";
import {debtTableFactsSchema, proposeDebtTableHypotheses, type DebtTableFacts} from "@offroad/financial-model";
import {buildDebtTablePremiseProposal, completeDebtTableFacts, shouldProposeDebtTablePremises, type DebtTableExtraction, proposeDebtTablePremisesForTurn} from "./debt-table-premises-proposal";
import {itemKeys} from "./lote2-premises";
import {comparableHypotheses, financialModelFixture, nonAnswering, summaryGroups, summaryOrigins, turnWithIntent} from "./lote2-premises.test-support";

let aurora: () => DebtTableFacts;
beforeAll(async () => {aurora = (await financialModelFixture<{auroraDebtTableFacts: () => DebtTableFacts}>("debt-table.test-support.ts")).auroraDebtTableFacts;});
const none = {value: null, origin: null, source: null};
const doc = <T>(value: T, source: string) => ({value, origin: "document" as const, source});
const informed = <T>(value: T, source: string) => ({value, origin: "informed" as const, source});
/** The house cannot be an extracted origin: what the fixture adopts as a house curve arrives as a document. */
const extracted = (x: {origin: string; source: string}) => ({origin: x.origin === "informed" ? "informed" as const : "document" as const, source: x.source});

/** The turn of ficha C10 as the extraction would read it from the contracts, the notes and the conversation. */
function auroraExtraction(f: DebtTableFacts): DebtTableExtraction {
  const labelOf = (id: string) => f.instruments.find((x) => x.value.id === id)!.value.label;
  return {turnIntent: "answers_pending" as const,
    needSituation: informed("near-covenant" as const, "teste do covenant de dezembro"), referenceDate: doc(f.referenceDate, "balancete de 30/jun"),
    instruments: f.instruments.map((x) => {const i = x.value; return {label: i.label, ...extracted(x), creditor: i.creditor, borrower: i.borrower,
      principal: i.principal, accruedInterest: i.accruedInterest, unamortizedCost: i.unamortizedCost, indexer: i.indexer, spread: Number(i.spread),
      payments: i.paymentDates.map((date, k) => ({date, amount: i.paymentAmounts[k]!})), guarantee: i.guarantee, encumbranceAmount: i.encumbranceAmount,
      usesBasketOf: i.usesBasketOf?.map(labelOf) ?? null, covenant: i.covenant,
      crossDefault: {acceleration: i.crossDefaultAcceleration, threshold: i.crossDefaultThreshold, scope: i.crossDefaultScope, scopeKind: i.crossDefaultScopeKind,
        creditors: i.crossDefaultCreditors, thresholdBasis: i.crossDefaultThresholdBasis},
      prepayment: i.prepayment, negativePledgeBasket: i.negativePledgeBasket};}),
    creditLines: f.creditLines.map((x) => ({label: x.value.label, ...extracted(x), creditor: x.value.creditor, limit: x.value.limit, drawn: x.value.drawn})),
    otherObligations: f.otherObligations.map((x) => ({label: x.value.label, ...extracted(x), kind: x.value.kind, creditor: x.value.creditor, amount: x.value.amount})),
    reportedAccountingBalance: f.reportedAccountingBalance as DebtTableExtraction["reportedAccountingBalance"], availableCash: f.availableCash as DebtTableExtraction["availableCash"],
    indexRates: f.indexRates.map((x) => ({indexer: x.value.indexer, annualRate: Number(x.value.annualRate), ...extracted(x)})),
    views: f.views.filter((x) => x.origin !== "house").map((x) => ({label: x.value.label, ...extracted(x), components: x.value.components})),
    leverage: f.leverage.filter((x) => x.origin !== "house").map((x) => ({label: x.value.label, ...extracted(x), viewLabel: f.views.find((v) => v.value.id === x.value.viewId)!.value.label,
      ebitda: x.value.ebitda, ebitdaDeduction: x.value.ebitdaDeduction})),
    lastTwelveMonthsEbitda: informed("54", "EBITDA dos últimos doze meses"),
    externalRegister: informed("not_received" as const, "a companhia ainda não enviou o Registrato"),
    categoryCoverage: {lease: doc("examined" as const, "balancete com arrendamentos"), supplier_finance: doc("examined" as const, "balancete com risco sacado"),
      guarantee_given: doc("examined" as const, "relação de fianças prestadas")},
  };
}
const idsOf = (f: DebtTableFacts) => ({tableId: f.tableId, entityId: f.entityId, definitionVersionId: f.definitionVersionId});
/** This worker keys items by label; the fixture names them by hand. */
const renameOf = (f: DebtTableFacts) => {
  const labels = [...f.instruments, ...f.creditLines, ...f.otherObligations].map((x) => x.value), keys = itemKeys(labels.map((x) => x.label));
  return new Map(keys.map((k, n) => [k, labels[n]!.id]));
};
const complete = (e: DebtTableExtraction, f: DebtTableFacts) => {
  const c = completeDebtTableFacts({extraction: e, ids: idsOf(f), currency: "BRL"});
  if (c.status !== "complete") throw new Error(JSON.stringify(c));
  return c;
};

describe("debt table premises proposed from a turn", () => {
  it("recognizes the ficha C10 requests, with or without documents, and not a conceptual question", () => {
    for (const m of ["Monta a tabela de dívida com tudo que temos.", "Extrai a dívida desses contratos e notas.", "Quanto a gente deve hoje, e pra quem?", "Preciso do endividamento atualizado para o conselho."])
      for (const docs of [false, true]) expect(shouldProposeDebtTablePremises(m, docs), m).toBe(true);
    for (const m of ["O que é uma tabela de dívida?", "O que significa endividamento?", "Qual o prazo da debênture?", "Quanto de dívida cabe para o capex?", "Como estamos contra os covenants?"])
      for (const docs of [false, true]) expect(shouldProposeDebtTablePremises(m, docs), m).toBe(false);
  });
  it("treats any statement after the request as a continuation candidate, refusing only questions, explanations and another method", () => {
    const earlier = ["Monta a tabela de dívida com tudo que temos."];
    // Whether these answer, defer or ask for other work is the extraction's turnIntent to decide.
    for (const m of ["É para refinanciamento.", "Não recebemos o Registrato.", "A CCB não tem covenant financeiro.", "A CCB do Bradesco tem saldo de R$ 40 milhões a CDI + 2,6%",
      "A CCB de R$ 40 milhões vence amanhã.", "Montante de R$ 40 milhões.", "Vou te confirmar o saldo da CCB amanhã.", "Enviamos os contratos amanhã.", "Confirmo que a CCB vence amanhã.",
      "Lista de valores: CCB R$ 40 milhões, Finame R$ 30 milhões.", "Revise o contrato e o cronograma da dívida.", "Te mando o Registrato em 2 dias", "Obrigado, vou pensar",
      "Escreva um resumo da CCB.", "Quero que você mapeie os credores.", "ok, agora, monte o cronograma."])
      expect(shouldProposeDebtTablePremises(m, false, earlier), m).toBe(true);
    for (const m of ["Pode explicar o que é refinanciamento?", "É para refinanciamento?", "Qual o saldo da CCB?"]) expect(shouldProposeDebtTablePremises(m, false, earlier), m).toBe(false);
    // Another premise method's objective is that method's, never this one's continuation.
    expect(shouldProposeDebtTablePremises("Vou confirmar o caixa semanal de R$ 40 milhões amanhã.", false, earlier)).toBe(false);
    expect(shouldProposeDebtTablePremises("A CCB tem saldo de R$ 40 milhões", false, ["Qual o prazo da debênture?"])).toBe(false);
    // The latest premise question decides which step a statement continues.
    expect(shouldProposeDebtTablePremises("A CCB tem saldo de R$ 40 milhões", false, [...earlier, "Como estamos contra os covenants?"])).toBe(false);
  });
  it("completes the Aurora facts and proposes the hypotheses the fixture proposes", () => {
    const f = aurora(), c = complete(auroraExtraction(f), f);
    expect(c.situationId).toBe("near-covenant");
    expect(c.facts.views.map((v) => [v.value.id, v.origin])).toEqual([["escritura", "document"], ["contabil", "document"], ["ifrs16", "house"], ["mercado", "house"]]);
    expect(c.facts.leverage.map((l) => [l.value.viewId, l.origin])).toEqual([["mercado", "house"], ["escritura", "document"]]);
    expect(c.facts.completeness).toMatchObject({value: {status: "unproven", evidence: "Registrato não recebido"}, origin: "informed"});
    expect(c.facts.endDate).toBe(f.endDate);
    expect(c.housePremiseKeys.sort()).toEqual(["bankLeverage", "leaseView", "marketView"]);
    expect(comparableHypotheses(proposeDebtTableHypotheses(c.facts), renameOf(f))).toEqual(comparableHypotheses(proposeDebtTableHypotheses(f)));
  });
  it("marks completeness unproven and unexamined categories as house premises when nobody said", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.externalRegister = none; e.categoryCoverage.guarantee_given = none; e.otherObligations = e.otherObligations.filter((o) => o.kind !== "guarantee_given");
    e.views = []; e.leverage = [];
    const c = complete(e, f);
    expect(c.facts.completeness).toMatchObject({value: {status: "unproven"}, origin: "house"});
    expect(c.facts.categoryCoverage.guarantee_given).toMatchObject({value: "not_examined", origin: "house"});
    expect(c.facts.views.map((v) => v.value.id)).toEqual(["contabil", "ifrs16", "mercado"]);
    expect(c.housePremiseKeys.sort()).toEqual(["accountingView", "bankLeverage", "categoryNotExamined", "completenessUnproven", "leaseView", "marketView"]);
    const received = auroraExtraction(f); received.externalRegister = doc("received" as const, "Registrato de 30/jun");
    expect(complete(received, f).facts.completeness).toMatchObject({value: {status: "proven"}, origin: "document"});
  });
  it("asks for what nobody stated in one batch instead of assuming it", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.needSituation = none; e.availableCash = none; e.instruments[1]!.spread = null; e.instruments[2]!.payments = null; e.creditLines[0]!.creditor = null;
    expect(completeDebtTableFacts({extraction: e, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing",
      missing: ["needSituation", "availableCash", "instruments.2.spread", "instruments.3.payments", "creditLines.1.creditor"]});
    const past = auroraExtraction(f); past.instruments[0]!.payments![0]!.date = "2026-06-15";
    expect(completeDebtTableFacts({extraction: past, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing", missing: ["instruments.1.payments"]});
    const basket = auroraExtraction(f); basket.instruments[1]!.usesBasketOf = ["Finame"];
    expect(completeDebtTableFacts({extraction: basket, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing", missing: ["instruments.2.usesBasketOf"]});
    const empty = auroraExtraction(f); empty.instruments = [];
    expect(completeDebtTableFacts({extraction: empty, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing", missing: ["instruments"]});
  });
  it("builds the card summary, field paths the store accepts and a stable fingerprint", () => {
    const f = aurora(), c = complete(auroraExtraction(f), f);
    const proposal = buildDebtTablePremiseProposal(c.facts, c.situationId);
    expect(Object.keys(proposal.summary).sort()).toEqual(["items", "referenceDate", "situationId"]);
    expect(proposal.summary).toMatchObject({situationId: "near-covenant", referenceDate: "2026-06-30"});
    expect(proposal.summary.items.every((x) => summaryGroups.includes(x.group) && summaryOrigins.includes(x.origin) && x.label.length > 0 && x.source.length > 0
      && Object.keys(x).sort().join() === "group,label,labelKey,origin,source")).toBe(true);
    expect(proposal.summary.items.map((x) => x.group)).toEqual(["instrument", "instrument", "instrument", "credit_line", "obligation", "obligation", "obligation", "view", "view", "view", "view", "premise"]);
    expect(proposal.summary.items.at(-1)).toEqual({group: "premise", label: "Registrato não recebido", labelKey: "completenessUnproven", origin: "informed", source: "a companhia ainda não enviou o Registrato"});
    // Labels the house writes carry a catalog key; the person's and the documents' labels do not.
    expect(proposal.summary.items.filter((x) => x.group === "view").map((x) => [x.label, x.labelKey])).toEqual([["Escritura", null], ["Contábil", null], ["Com arrendamentos", "leaseView"], ["Mercado", "marketView"]]);
    expect(proposal.summary.items.filter((x) => x.group !== "view" && x.group !== "premise").every((x) => x.labelKey === null)).toBe(true);
    expect(proposal.hypotheses.length).toBeLessThanOrEqual(256);
    expect(proposal.hypotheses.every((h) => /^debt_table\.[0-9a-f-]{36}\.[A-Za-z0-9_.-]{1,200}$/.test(h.fieldPath) && h.dimensions.entityId === null && h.dimensions.definitionVersionId === null
      && /^Origem: /.test(h.reason))).toBe(true);
    expect(debtTableFactsSchema.safeParse(proposal.facts).success).toBe(true);
    expect(buildDebtTablePremiseProposal(c.facts, c.situationId).fingerprint).toBe(proposal.fingerprint);
    expect(proposal.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(buildDebtTablePremiseProposal(c.facts, "refinancing").fingerprint).not.toBe(proposal.fingerprint);
    expect(proposal).toMatchObject({methodId: "build-company-debt-table", methodVersion: "2026.10.23-v1"});
  });
  it("proposes only when the extraction reads the turn as answering, on a continuation and on a direct request alike", async () => {
    const earlier = ["Monta a tabela de dívida com tudo que temos."];
    for (const intent of nonAnswering) {
      const r = await turnWithIntent(proposeDebtTablePremisesForTurn, auroraExtraction(aurora()), intent, "Vou te confirmar o saldo da CCB amanhã.", earlier);
      expect(r, intent).toEqual({extracted: true, status: null, events: ["debt_table_premises.not_answering"]});
    }
    expect(await turnWithIntent(proposeDebtTablePremisesForTurn, auroraExtraction(aurora()), "answers_pending", "Vou te confirmar o saldo da CCB amanhã.", earlier)).toMatchObject({extracted: true, status: "proposed", events: ["debt_table_premises.proposed"]});
    // A direct request is gated the same way: the model reads a request for this analysis as answers_pending.
    for (const intent of nonAnswering)
      expect(await turnWithIntent(proposeDebtTablePremisesForTurn, auroraExtraction(aurora()), intent, "Monta a tabela de dívida com tudo que temos.", []), intent).toEqual({extracted: true, status: null, events: ["debt_table_premises.not_answering"]});
    expect(await turnWithIntent(proposeDebtTablePremisesForTurn, auroraExtraction(aurora()), "answers_pending", "Monta a tabela de dívida com tudo que temos.", [])).toMatchObject({status: "proposed"});
    // A question never reaches the extraction.
    expect(await turnWithIntent(proposeDebtTablePremisesForTurn, auroraExtraction(aurora()), "answers_pending", "E qual é o prazo?", earlier)).toEqual({extracted: false, status: null, events: []});
  });
});
