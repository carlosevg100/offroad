import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {analysisTestId as id} from "./adopted-analysis.test-support";
import {composeBoundInvestmentPacket} from "./investment-decision-composer";
import {prepareInvestmentDecisionPacket} from "./investment-decision-packet";
import {proposeInvestmentHypotheses, type InvestmentFacts} from "./investment-premises";

const D = Decimal.clone({precision: 60});
const informed = (source: string) => ({origin: "informed" as const, source});
const house = (source: string) => ({origin: "house" as const, source});
/** Ficha C32: what the CFO said, what the management report shows and the house premises. */
export function c32Facts(): InvestmentFacts {
  return {analysisId: id(3004), entityId: id(3001), perimeter: "standalone", currency: "BRL", definitionVersionId: id(3003), firstYear: 2026, years: 11,
    capex: {value: [{year: 2026, amount: "10000000"}, {year: 2027, amount: "8000000"}], ...informed("R$ 10 milhões em novembro e dezembro e R$ 8 milhões no começo de 2027")},
    operationStart: {value: "2027-05-01", ...informed("Entra em operação em maio de 2027")},
    ramp: {value: {stageMonths: [3], stageLoads: ["0.5"]}, ...house("Três meses a meia carga")},
    annualIncrementalRevenue: {value: "0", ...informed("A linha não gera receita nova")},
    annualDisplacedPurchases: {value: "30000000", origin: "document", source: "Gerencial: gasto anual com embalagem comprada"},
    annualNewVariableCost: {value: "19500000", origin: "document", source: "Estudo interno: insumos da produção própria"},
    annualNewFixedCost: {value: "4500000", origin: "document", source: "Estudo interno: custo fixo da linha"},
    annualGrowth: {value: "0.04", ...house("Crescimento de volume de 4% ao ano")}, annualMaintenance: {value: "600000", ...house("Manutenção de R$ 0,6 milhão por ano")},
    usefulLifeYears: {value: 10, ...house("Vida útil de 10 anos")}, cashTaxRate: {value: "0.34", ...house("IR e CSLL de 34% no lucro real")},
    receivableDays: {value: "0", ...house("Sem receita nova")}, inventoryDays: {value: "45", ...house("Estoque de insumos de 45 dias")},
    newSupplierDays: {value: "30", ...house("Prazo dos fornecedores de insumos de 30 dias")}, lostSupplierDays: {value: "60", origin: "document", source: "Gerencial: prazo médio de 60 dias do fornecedor atual"},
    discountRate: {value: "0.15", ...house("Custo de capital de 15% ao ano")}, workingCapitalReturnsAtEnd: {value: true, ...house("Giro volta no fim da vida útil")},
    sensitivities: {benefitFactor: {value: "0.66666666666666666667", ...house("Economia de R$ 4 milhões")}, capexFactor: {value: "1.2", ...house("Capex 20% maior")},
      startDelayMonths: {value: 6, ...house("Partida seis meses mais tarde")}, deferMonths: {value: 12, ...house("Adiar doze meses")}}};
}

function basisOf(hypotheses: ReturnType<typeof proposeInvestmentHypotheses>) {
  const entries: AdoptionBasisEntry[] = hypotheses.map((h, n) => ({decisionId: id(5000 + n), slotKey: createHash("sha256").update(JSON.stringify([h.fieldPath, h.dimensions])).digest("hex"),
    kind: "hypothesis", fieldPath: h.fieldPath, dimensions: h.dimensions, value: h.value as AdoptionBasisEntry["value"], observationId: null, referenceValue: null,
    referenceDimensions: null, definitionKind: "managerial", actorId: id(3005), reason: h.reason}));
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(3500), setId: id(3006), workId: id(3007), purpose: "prepare-capital-structure-decision",
    contextKey: "investment", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const canonical = JSON.stringify(snapshot);
  return {envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}, scope: {workId: id(3007), purpose: snapshot.purpose, versionId: id(3500)}};
}

describe("investment hypotheses proposed from facts", () => {
  it("round-trips C32 facts through the adopted basis into the independent values", () => {
    const hypotheses = proposeInvestmentHypotheses(c32Facts());
    expect(hypotheses.length).toBeLessThanOrEqual(256);
    const packet = prepareInvestmentDecisionPacket(composeBoundInvestmentPacket({...basisOf(hypotheses), question: "A linha se paga?"}));
    const m = Object.fromEntries(packet.comparison.metrics.map(x => [x.caseId, x]));
    // Unrounded values recomputed independently in the technical review of 2026.10.09-v2.
    const npv = (k: string) => new D(m[k]!.netPresentValue!).div(1000000).toDecimalPlaces(6).toNumber();
    expect(npv("base")).toBeCloseTo(0.732203, 5); expect(npv("benefit-lower")).toBeCloseTo(-6.350985, 5);
    expect(npv("capex-higher")).toBeCloseTo(-2.080283, 5); expect(npv("slower-start")).toBeCloseTo(-0.98103, 5); expect(npv("defer-12")).toBeCloseTo(1.375813, 5);
    expect(m.base!.startupWorkingCapital).toBe("5812500");
    expect(packet.comparison.conclusionChangingCaseIds).toEqual(["benefit-lower", "capex-higher", "slower-start"]);
    // Company baseline is not proposed here: the packet says what is missing instead of inventing it.
    expect(packet.status).toBe("partial");
    expect([...new Set(packet.gaps.map(g => g.operand.split(".").slice(2).join(".")))]).toEqual(["company"]);
  });

  it("states the origin of every proposed number and adopts only what a sensitivity changes", () => {
    const hypotheses = proposeInvestmentHypotheses(c32Facts());
    expect(hypotheses.every(h => /^Origem: (documento|informado|premissa da casa|estimativa)\./.test(h.reason))).toBe(true);
    expect(hypotheses.find(h => h.fieldPath.endsWith("project.annualAvoidedOperatingCost") && h.dimensions.scenario === "base")!.reason)
      .toBe("Origem: documento. Gerencial: gasto anual com embalagem comprada");
    expect(hypotheses.filter(h => h.dimensions.scenario === "slower-start").map(h => h.fieldPath.split(".").slice(2).join("."))).toEqual(
      ["case.role", "case.label", "case.changes", "case.inherits", "project.ramp.operationStartMonth"]);
    expect(hypotheses.find(h => h.fieldPath.endsWith("case.label") && h.dimensions.scenario === "benefit-lower")!.value.value).toBe("Benefício anual de R$ 4 milhões");
  });

  it("refuses incoherent facts", () => {
    const f = c32Facts(); f.ramp.value.stageLoads = [];
    expect(() => proposeInvestmentHypotheses(f)).toThrow("Ramp stages and loads must align");
    const g = c32Facts(); g.capex.value.push({year: 2040, amount: "1"});
    expect(() => proposeInvestmentHypotheses(g)).toThrow("Capex outside the horizon");
  });
});
