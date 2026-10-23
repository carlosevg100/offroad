import {describe, expect, it} from "vitest";
import {buildDebtTable, type DebtTableInput} from "./debt-table";

// Aurora Alimentos at 30/jun/2026, ficha C10 (synthetic scenario). Amounts in BRL millions.
const finame = Array.from({length: 54}, (_, k) => {
  const y = 2026 + Math.floor((6 + k) / 12), m = ((6 + k) % 12) + 1;
  return {date: `${y}-${String(m).padStart(2, "0")}-15`, amount: k === 53 ? "0.555532" : "0.555556"};
});
export const auroraDebtTable: DebtTableInput = {
  referenceDate: "2026-06-30", currency: "BRL",
  instruments: [
    {id: "debenture-1", label: "Debênture 1ª emissão", creditor: "Debenturistas", borrower: "Aurora Alimentos S.A.",
      principal: "60", accruedInterest: "1.3", unamortizedCost: "-0.4", indexer: "CDI", spread: "0.024",
      amortization: [{date: "2026-12-15", amount: "15"}, {date: "2027-06-15", amount: "15"}, {date: "2027-12-15", amount: "15"}, {date: "2028-06-15", amount: "15"}],
      guarantee: {description: "Quirografária", encumbranceAmount: null, usesBasketOf: []},
      covenant: "Dívida líquida / EBITDA até 3,0x, anual em dezembro, sem IFRS 16 (1º aditamento)",
      crossDefault: {threshold: "10", acceleration: "non_automatic", scope: "Inadimplemento de outra dívida", scopeKind: "any_financial_debt", creditors: [], thresholdBasis: "amount_in_default"},
      prepayment: "Resgate facultativo total, prêmio de 0,30% ao ano sobre o prazo remanescente", negativePledgeBasket: "15"},
    {id: "ccb-bradesco", label: "CCB", creditor: "Bradesco", borrower: "Aurora Alimentos S.A.",
      principal: "40", accruedInterest: "0.8", unamortizedCost: "0", indexer: "CDI", spread: "0.026",
      amortization: [{date: "2027-09-15", amount: "40"}],
      guarantee: {description: "Cessão fiduciária de contratos de dois clientes; reforço em 5 dias úteis abaixo de 80%", encumbranceAmount: "12", usesBasketOf: ["debenture-1"]},
      covenant: null, crossDefault: {threshold: "5", acceleration: "non_automatic", scope: "Inadimplemento de qualquer dívida", scopeKind: "any_financial_debt", creditors: [], thresholdBasis: "amount_in_default"},
      prepayment: "Aviso de 30 dias e tarifa de 1%", negativePledgeBasket: null},
    {id: "finame", label: "Finame", creditor: "BNDES", borrower: "Aurora Alimentos S.A.",
      principal: "30", accruedInterest: "0.1", unamortizedCost: "0", indexer: "TLP", spread: "0.018", amortization: finame,
      guarantee: {description: "Alienação fiduciária dos equipamentos", encumbranceAmount: null, usesBasketOf: []},
      covenant: null, crossDefault: {threshold: null, acceleration: "non_automatic", scope: "Obrigações com o BNDES ou o agente", scopeKind: "named_creditors", creditors: ["BNDES"], thresholdBasis: "amount_in_default"},
      prepayment: "Liquidação antecipada mediante comunicação", negativePledgeBasket: null},
  ],
  creditLines: [{id: "conta-garantida", label: "Conta garantida", creditor: "Itaú", limit: "10", drawn: "0"}],
  otherObligations: [
    {id: "arrendamentos", kind: "lease", label: "Arrendamentos IFRS 16", creditor: null, amount: "8"},
    {id: "risco-sacado", kind: "supplier_finance", label: "Fornecedores convênio", creditor: null, amount: "6"},
    {id: "fianca", kind: "guarantee_given", label: "Fiança bancária", creditor: "Santander", amount: "5"},
  ],
  reportedAccountingBalance: "131.8",
  views: [
    {id: "escritura", label: "Escritura", components: ["principal", "drawn_credit_lines"]},
    {id: "contabil", label: "Contábil", components: ["principal", "accrued_interest", "unamortized_cost"]},
    {id: "ifrs16", label: "Com arrendamentos", components: ["principal", "drawn_credit_lines", "lease"]},
    {id: "mercado", label: "Mercado", components: ["principal", "drawn_credit_lines", "lease", "supplier_finance"]},
  ],
  availableCash: "35",
  indexRates: [{indexer: "CDI", annualRate: "0.149"}, {indexer: "TLP", annualRate: "0.079"}],
  leverage: [{viewId: "mercado", label: "Banco", ebitda: "54", ebitdaDeduction: "0"},
    {viewId: "escritura", label: "Escritura", ebitda: "54", ebitdaDeduction: "3"}],
  completeness: {status: "unproven", evidence: "Registrato não recebido"},
  categoryCoverage: {lease: "examined", supplier_finance: "examined", guarantee_given: "examined"},
};
const n = (v: string | null | undefined) => Number(v);

describe("debt table", () => {
  const t = buildDebtTable(auroraDebtTable);
  it("reconciles principal to the reported balance and keeps the limit out", () => {
    expect(t.reconciliation).toMatchObject({principal: "130", accruedInterest: "2.2", unamortizedCost: "-0.4", accounting: "131.8", status: "exact", difference: "0"});
    expect(t.creditLines[0]).toMatchObject({limit: "10", drawn: "0", unused: "10"});
    expect(t.rows.map(r => r.accountingBalance)).toEqual(["60.9", "40.8", "30.1"]);
  });
  it("measures the debt by each definition with the bridge, and names what stays outside", () => {
    expect(t.views.map(v => [v.id, v.total])).toEqual([["escritura", "130"], ["contabil", "131.8"], ["ifrs16", "138"], ["mercado", "144"]]);
    expect(t.views[3]!.bridgeFromBase).toEqual([{component: "lease", amount: "8"}, {component: "supplier_finance", amount: "6"}]);
    expect(t.views[1]!.bridgeFromBase).toEqual([{component: "accrued_interest", amount: "2.2"}, {component: "unamortized_cost", amount: "-0.4"}, {component: "drawn_credit_lines", amount: "0"}]);
    expect(t.outsideEveryView).toEqual([{id: "fianca", kind: "guarantee_given", label: "Fiança bancária", creditor: "Santander", amount: "5"}]);
  });
  it("reproduces the profile of the ficha", () => {
    expect(t.profile.scheduleByYear.map(y => [y.year, n(y.principal).toFixed(1)])).toEqual([[2026, "18.3"], [2027, "76.7"], [2028, "21.7"], [2029, "6.7"], [2030, "6.7"]]);
    expect(n(t.profile.dueWithinTwelveMonths).toFixed(1)).toBe("36.7");
    expect(n(t.profile.dueWithinTwelveMonthsShare).toFixed(3)).toBe("0.282");
    expect(Math.abs(n(t.profile.weightedAverageLifeYears) - 1.42)).toBeLessThan(0.05);
    expect(t.profile.largestCreditor).toMatchObject({creditor: "Debenturistas"});
    expect(n(t.profile.largestCreditor!.share).toFixed(3)).toBe("0.462");
    expect(n(t.profile.averageNominalCost).toFixed(4)).toBe("0.1592");
    expect(t.rows.every(r => r.scheduleMatchesPrincipal)).toBe(true);
  });
  it("reads basket, cross-default and leverage by definition", () => {
    expect(t.negativePledgeBaskets).toEqual([{holderId: "debenture-1", basket: "15", occupied: "12", remaining: "3", exceeded: false, usedBy: ["ccb-bradesco"]}]);
    expect(t.crossDefault.lowestThreshold).toEqual({instrumentId: "ccb-bradesco", threshold: "5"});
    expect(t.crossDefault.chain.map(c => [c.instrumentId, c.potentiallyTriggeredBy])).toEqual([["ccb-bradesco", ["debenture-1", "finame"]], ["debenture-1", ["ccb-bradesco", "finame"]]]);
    expect(t.categoryCoverage.map(c => c.status)).toEqual(["present", "present", "present"]);
    expect(n(t.leverage[0]!.ratio).toFixed(2)).toBe("2.02");
    expect(n(t.leverage[1]!.ratio).toFixed(2)).toBe("1.86");
    expect(t.completeness.request).toBe("external_register_of_financial_institution_operations");
    expect(t.gaps).toEqual([]);
  });
  it("returns gaps instead of estimating and refuses malformed terms", () => {
    const g = buildDebtTable({...auroraDebtTable, reportedAccountingBalance: null, availableCash: null, indexRates: []});
    expect(g.reconciliation.status).toBe("not_reported");
    expect(g.profile.averageNominalCost).toBeNull();
    expect(g.leverage[0]!.ratio).toBeNull();
    expect(g.gaps.map(x => x.reason)).toEqual(["reported_balance_not_adopted", "available_cash_not_adopted", "index_rate_or_spread_not_adopted"]);
    const short = structuredClone(auroraDebtTable) as DebtTableInput & {instruments: DebtTableInput["instruments"][number][]};
    short.instruments[1] = {...short.instruments[1]!, amortization: [{date: "2027-09-15", amount: "39"}]};
    expect(buildDebtTable(short).gaps).toEqual([{item: "ccb-bradesco", reason: "schedule_does_not_sum_to_principal"}]);
    const early = structuredClone(auroraDebtTable) as typeof short;
    early.instruments[1] = {...early.instruments[1]!, amortization: [{date: "2026-06-30", amount: "40"}]};
    expect(() => buildDebtTable(early)).toThrow("debt_table_payment_not_after_reference");
    expect(() => buildDebtTable({...auroraDebtTable, creditLines: [{id: "x", label: "x", creditor: "x", limit: "1", drawn: "2"}]})).toThrow("debt_table_drawn_above_limit");
    expect(() => buildDebtTable({...auroraDebtTable, views: [{id: "a", label: "a", components: ["principal", "principal"]}]})).toThrow("debt_table_view_components");
    // A clause scoped to named creditors only counts their debt; a drawn line counts as debt in scope.
    const scoped = structuredClone(auroraDebtTable) as typeof short;
    scoped.instruments[0] = {...scoped.instruments[0]!, crossDefault: {...scoped.instruments[0]!.crossDefault!, scopeKind: "named_creditors", creditors: ["BNDES"]}};
    expect(buildDebtTable(scoped).crossDefault.chain.find(c => c.instrumentId === "debenture-1")!.potentiallyTriggeredBy).toEqual(["finame"]);
    const drawn = buildDebtTable({...auroraDebtTable, creditLines: [{id: "conta-garantida", label: "Conta garantida", creditor: "Itaú", limit: "10", drawn: "7"}]});
    expect(drawn.crossDefault.chain.find(c => c.instrumentId === "ccb-bradesco")!.potentiallyTriggeredBy).toEqual(["debenture-1", "finame", "conta-garantida"]);
    const unexamined = buildDebtTable({...auroraDebtTable, otherObligations: auroraDebtTable.otherObligations.filter(o => o.kind !== "supplier_finance"),
      categoryCoverage: {lease: "examined", supplier_finance: "not_examined", guarantee_given: "examined"}});
    expect(unexamined.gaps).toEqual([{item: "supplier_finance", reason: "category_not_examined"}]);
    expect(buildDebtTable({...auroraDebtTable, otherObligations: [], categoryCoverage: {lease: "examined", supplier_finance: "examined", guarantee_given: "examined"}})
      .categoryCoverage.map(c => c.status)).toEqual(["confirmed_absent", "confirmed_absent", "confirmed_absent"]);
    expect(() => buildDebtTable({...auroraDebtTable, categoryCoverage: {lease: "examined", supplier_finance: "not_examined", guarantee_given: "examined"}})).toThrow("debt_table_category_items_without_examination");
    const negative = buildDebtTable({...auroraDebtTable, leverage: [{viewId: "escritura", label: "Negativo", ebitda: "2", ebitdaDeduction: "3"}]});
    expect(negative.leverage[0]!.ratio).toBeNull();
    const flat = buildDebtTable({...auroraDebtTable, leverage: [{viewId: "escritura", label: "Zero", ebitda: "3", ebitdaDeduction: "3"}]});
    expect(flat.leverage[0]!.ratio).toBeNull();
  });
});
