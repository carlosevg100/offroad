import {describe, expect, it} from "vitest";
import {buildInvestmentPremiseProposal, completeInvestmentFacts, proposeInvestmentPremisesForTurn, shouldProposeInvestmentPremises, uuidV5,
  type InvestmentFactExtraction} from "./investment-premises-proposal";

const none = {value: null, origin: null, source: null};
const informed = <T>(value: T, source: string) => ({value, origin: "informed" as const, source});
const document = <T>(value: T, source: string) => ({value, origin: "document" as const, source});
/** Turn 2 of ficha C32: what the CFO said, the management report and the internal study. */
function c32Extraction(): InvestmentFactExtraction {
  return {investmentDescription: "Linha de embalagem própria no lugar da embalagem comprada",
    capex: informed([{year: 2026, amount: "10000000"}, {year: 2027, amount: "8000000"}], "R$ 10 em novembro e dezembro e R$ 8 no começo de 2027"),
    operationStartMonth: informed("2027-05", "entra em operação em maio"),
    annualIncrementalRevenue: none, annualDisplacedPurchases: document("30000000", "Gerencial: embalagem comprada"),
    annualNewVariableCost: document("19500000", "estudo-linha-embalagem.xlsx: insumos"), annualNewFixedCost: document("4500000", "estudo-linha-embalagem.xlsx: custo fixo"),
    annualMaintenance: document("600000", "estudo-linha-embalagem.xlsx: manutenção"), usefulLifeYears: document(10, "estudo-linha-embalagem.xlsx: vida útil"),
    receivableDays: none, inventoryDays: document(45, "estudo-linha-embalagem.xlsx: estoque"), newSupplierDays: document(30, "estudo-linha-embalagem.xlsx: prazo de insumos"),
    lostSupplierDays: document(60, "Gerencial: prazo médio do fornecedor"), annualGrowth: none, cashTaxRate: none,
    discountRate: informed(0.15, "custo de capital de 15% que usamos")};
}
const ids = {analysisId: uuidV5("offroad:investment-analysis:30000000-0000-4000-8000-000000000711"), entityId: "34675fb4-3a6b-559c-9306-ee9da86bde2d", definitionVersionId: "34675fb4-3a6b-559c-9306-ee9da86bde2d"};

describe("investment premises proposed from a turn", () => {
  it("recognizes a capital question about an identifiable investment, and only that", () => {
    expect(shouldProposeInvestmentPremises("Precisamos financiar a linha nova de embalagem e reduzir a pressão dos vencimentos dos próximos dois anos. Que caminhos fazem sentido?")).toBe(true);
    expect(shouldProposeInvestmentPremises("Revisa a proposta do Itaú")).toBe(false);
    expect(shouldProposeInvestmentPremises("Quanto vence em 2027?")).toBe(false);
  });

  it("derives the work's analysis identity as an RFC UUID v5, the same way every turn", () => {
    // Python: uuid.uuid5(uuid.NAMESPACE_URL, 'offroad:investment-analysis:30000000-0000-4000-8000-000000000711')
    expect(ids.analysisId).toBe("34675fb4-3a6b-559c-9306-ee9da86bde2d");
  });

  it("completes the C32 facts with marked house premises and never defaults the cost of capital", () => {
    const completed = completeInvestmentFacts({extraction: c32Extraction(), ids, currency: "BRL"});
    if (completed.status !== "complete") throw new Error(completed.missing.join(","));
    expect(completed.housePremiseKeys.sort()).toEqual(["annualGrowth", "cashTaxRate", "ramp", "receivableDays", "workingCapitalReturnsAtEnd"]);
    expect(completed.facts.firstYear).toBe(2026); expect(completed.facts.years).toBe(11);
    expect(completed.facts.lostSupplierDays).toEqual({value: "60", origin: "document", source: "Gerencial: prazo médio do fornecedor"});
    const withoutRate = c32Extraction(); withoutRate.discountRate = none;
    expect(completeInvestmentFacts({extraction: withoutRate, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["discountRate"]});
    const netOnly = c32Extraction(); netOnly.annualDisplacedPurchases = none; netOnly.annualNewVariableCost = none;
    expect(completeInvestmentFacts({extraction: netOnly, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["annualDisplacedPurchases", "annualNewVariableCost"]});
  });

  it("builds a proposal whose hypotheses carry origin and no identity until the person confirms", () => {
    const completed = completeInvestmentFacts({extraction: c32Extraction(), ids, currency: "BRL"});
    if (completed.status !== "complete") throw new Error("expected complete");
    const p = buildInvestmentPremiseProposal(completed.facts), q = buildInvestmentPremiseProposal(completed.facts);
    expect(p.fingerprint).toBe(q.fingerprint); expect(p.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(p.methodId).toBe("analyze-investment-project"); expect(p.methodVersion).toBe("2026.10.09-v2");
    expect(p.hypotheses.length).toBeLessThanOrEqual(256);
    expect(p.hypotheses.every(h => h.dimensions.entityId === null && h.dimensions.definitionVersionId === null)).toBe(true);
    expect(p.hypotheses.every(h => h.fieldPath.startsWith(`investment.${ids.analysisId}.`) && /^Origem: /.test(h.reason))).toBe(true);
    expect(p.summary.netAnnualBenefit).toBe("6000000");
    expect(p.summary.premises.find(x => x.key === "discountRate")).toEqual({key: "discountRate", origin: "informed", source: "custo de capital de 15% que usamos"});
  });

  it("never fails the turn: errors are logged and the turn continues without a proposal", async () => {
    const events: string[] = [];
    const base = {message: "Precisamos financiar a linha nova de embalagem. Que caminhos fazem sentido?", recentUserMessages: [], projectId: "30000000-0000-4000-8000-000000000711",
      loadEvidence: async () => [], log: (event: string) => {events.push(event);}};
    expect(await proposeInvestmentPremisesForTurn({...base, extract: async () => {throw new Error("provider down");}})).toBeNull();
    expect(await proposeInvestmentPremisesForTurn({...base, extract: async () => ({invented: true})})).toBeNull();
    const proposed = await proposeInvestmentPremisesForTurn({...base, extract: async () => c32Extraction()});
    expect(proposed?.forAdvisor.status).toBe("proposed"); expect(proposed?.proposal?.facts.analysisId).toBe(ids.analysisId);
    const missing = await proposeInvestmentPremisesForTurn({...base, extract: async () => ({...c32Extraction(), discountRate: none})});
    expect(missing).toEqual({forAdvisor: {status: "missing", missing: ["discountRate"]}, proposal: null});
    expect(await proposeInvestmentPremisesForTurn({...base, projectId: null, extract: async () => c32Extraction()})).toBeNull();
    expect(events).toEqual(["investment_premises.failed", "investment_premises.failed", "investment_premises.proposed", "investment_premises.missing"]);
  });
});
