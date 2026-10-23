import type {AdoptedDebtTableInput} from "./adopted-debt-table";
import {analysisTestBasis, analysisTestId as id} from "./adopted-analysis.test-support";

/** Aurora Alimentos at 30/jun/2026 (ficha C10, synthetic scenario) as adopted contributions. BRL millions. */
export function auroraDebtTableBasis(options: {debentureCrossDefaultCreditors?: string[]} = {}) {
  const f = analysisTestBasis(`debt_table.${id(40)}.`, "2026-06-30", "2030-12-31");
  const num = (p: string, unit: string, value: string) => f.contribute(p, unit, {type: "number", value});
  const text = (p: string, value: string) => f.contribute(p, "text", {type: "text", value});
  const conv = (p: string, value: string) => f.contribute(p, "convention", {type: "text", value});
  const list = (p: string, unit: string, value: string[]) => f.contribute(p, unit, {type: "list", value});
  const finameDates = Array.from({length: 54}, (_, k) => {
    const y = 2026 + Math.floor((6 + k) / 12), m = ((6 + k) % 12) + 1;
    return `${y}-${String(m).padStart(2, "0")}-15`;
  });
  const instrument = (key: string, t: {label: string; creditor: string; principal: string; accrued: string; cost: string; indexer: string; spread: string;
    dates: string[]; amounts: string[]; guarantee: string; encumbrance?: string; basketOf?: string[]; covenant: string;
    acceleration: string; threshold?: string; scope?: string; scopeKind?: string; creditors?: string[]; prepayment: string; basket?: string}) => {
    const p = `instrument.${key}.`;
    return {id: key, terms: {label: text(p + "label", t.label), creditor: text(p + "creditor", t.creditor), borrower: text(p + "borrower", "Aurora Alimentos S.A."),
      principal: num(p + "principal", "currency", t.principal), accruedInterest: num(p + "accruedInterest", "currency", t.accrued),
      unamortizedCost: num(p + "unamortizedCost", "currency", t.cost), indexer: conv(p + "indexer", t.indexer), spread: num(p + "spread", "ratio", t.spread),
      paymentDates: list(p + "paymentDates", "date", t.dates), paymentAmounts: list(p + "paymentAmounts", "currency", t.amounts),
      guarantee: text(p + "guarantee", t.guarantee), encumbranceAmount: t.encumbrance ? num(p + "encumbranceAmount", "currency", t.encumbrance) : null,
      usesBasketOf: t.basketOf ? list(p + "usesBasketOf", "reference_id", t.basketOf) : null, covenant: text(p + "covenant", t.covenant),
      crossDefaultAcceleration: conv(p + "crossDefaultAcceleration", t.acceleration),
      crossDefaultThreshold: t.threshold ? num(p + "crossDefaultThreshold", "currency", t.threshold) : null,
      crossDefaultScope: t.scope ? text(p + "crossDefaultScope", t.scope) : null,
      crossDefaultScopeKind: t.scope ? conv(p + "crossDefaultScopeKind", t.scopeKind ?? "any_financial_debt") : null,
      crossDefaultCreditors: t.creditors ? list(p + "crossDefaultCreditors", "text", t.creditors) : null,
      crossDefaultThresholdBasis: t.scope ? conv(p + "crossDefaultThresholdBasis", "amount_in_default") : null,
      prepayment: text(p + "prepayment", t.prepayment),
      negativePledgeBasket: t.basket ? num(p + "negativePledgeBasket", "currency", t.basket) : null}};
  };
  const input = {...f.context, analysisId: id(40), scenario: "base",
    instruments: [
      instrument("debenture-1", {label: "Debênture 1ª emissão", creditor: "Debenturistas", principal: "60", accrued: "1.3", cost: "-0.4", indexer: "CDI", spread: "0.024",
        dates: ["2026-12-15", "2027-06-15", "2027-12-15", "2028-06-15"], amounts: ["15", "15", "15", "15"], guarantee: "Quirografária",
        covenant: "Dívida líquida / EBITDA até 3,0x, anual em dezembro, sem IFRS 16 (1º aditamento, cl. 2)", acceleration: "non_automatic", threshold: "10",
        scope: "Inadimplemento de outra dívida (escritura cl. 6.1)", ...options.debentureCrossDefaultCreditors ? {scopeKind: "named_creditors", creditors: options.debentureCrossDefaultCreditors} : {}, prepayment: "Resgate facultativo total, prêmio de 0,30% ao ano", basket: "15"}),
      instrument("ccb-bradesco", {label: "CCB", creditor: "Bradesco", principal: "40", accrued: "0.8", cost: "0", indexer: "CDI", spread: "0.026",
        dates: ["2027-09-15"], amounts: ["40"], guarantee: "Cessão fiduciária de contratos de dois clientes; reforço em 5 dias úteis abaixo de 80% (cl. 7)",
        encumbrance: "12", basketOf: ["debenture-1"], covenant: "Nenhum covenant financeiro", acceleration: "non_automatic", threshold: "5",
        scope: "Inadimplemento de qualquer dívida (cl. 9)", prepayment: "Aviso de 30 dias e tarifa de 1% (cl. 12)"}),
      instrument("finame", {label: "Finame", creditor: "BNDES", principal: "30", accrued: "0.1", cost: "0", indexer: "TLP", spread: "0.018",
        dates: finameDates, amounts: finameDates.map((_, k) => k === 53 ? "0.555532" : "0.555556"), guarantee: "Alienação fiduciária dos equipamentos (cl. 11)",
        covenant: "Nenhum covenant financeiro", acceleration: "non_automatic", scope: "Obrigações com o BNDES ou o agente (cl. 14)", scopeKind: "named_creditors", creditors: ["BNDES"],
        prepayment: "Liquidação antecipada mediante comunicação (cl. 5)"}),
    ],
    creditLines: [{id: "conta-garantida", label: text("credit_line.conta-garantida.label", "Conta garantida"), creditor: text("credit_line.conta-garantida.creditor", "Itaú"),
      limit: num("credit_line.conta-garantida.limit", "currency", "10"), drawn: num("credit_line.conta-garantida.drawn", "currency", "0")}],
    otherObligations: [["arrendamentos", "lease", "Arrendamentos IFRS 16", null, "8"], ["risco-sacado", "supplier_finance", "Fornecedores convênio", null, "6"],
      ["fianca", "guarantee_given", "Fiança bancária", "Santander", "5"]].map(([k, kind, label, creditor, amount]) => ({id: k!,
      kind: conv(`obligation.${k}.kind`, kind!), label: text(`obligation.${k}.label`, label!),
      creditor: creditor ? text(`obligation.${k}.creditor`, creditor) : null, amount: num(`obligation.${k}.amount`, "currency", amount!)})),
    reportedAccountingBalance: num("reportedAccountingBalance", "currency", "131.8"), availableCash: num("availableCash", "currency", "35"),
    indexRates: [{indexer: "CDI", annualRate: num("index_rate.CDI", "ratio", "0.149")}, {indexer: "TLP", annualRate: num("index_rate.TLP", "ratio", "0.079")}],
    views: [["escritura", "Escritura", ["principal", "drawn_credit_lines"]], ["contabil", "Contábil", ["principal", "accrued_interest", "unamortized_cost"]],
      ["ifrs16", "Com arrendamentos", ["principal", "drawn_credit_lines", "lease"]], ["mercado", "Mercado", ["principal", "drawn_credit_lines", "lease", "supplier_finance"]]]
      .map(([v, label, components]) => ({id: v as string, label: label as string, components: list(`view.${v}.components`, "convention", components as string[])})),
    leverage: [{viewId: "mercado", label: "Banco", ebitda: num("leverage.mercado.ebitda", "currency", "54"), ebitdaDeduction: num("leverage.mercado.ebitdaDeduction", "currency", "0")},
      {viewId: "escritura", label: "Escritura", ebitda: num("leverage.escritura.ebitda", "currency", "54"), ebitdaDeduction: num("leverage.escritura.ebitdaDeduction", "currency", "3")}],
    completenessStatus: conv("completenessStatus", "unproven"), completenessEvidence: text("completenessEvidence", "Registrato não recebido"),
    categoryCoverage: {lease: conv("categoryCoverage.lease", "examined"), supplier_finance: conv("categoryCoverage.supplier_finance", "examined"),
      guarantee_given: conv("categoryCoverage.guarantee_given", "examined")},
  } as unknown as AdoptedDebtTableInput;
  const seal = () => ({...input, envelope: f.seal()});
  return {...f, input, seal};
}
