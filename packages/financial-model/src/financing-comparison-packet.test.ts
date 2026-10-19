import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {matchesMethodValue} from "@offroad/credit-playbook";
import {financingComparisonPacketExecutorContracts} from "./financing-comparison-contracts";
import {financingComparisonPacketOutputSchema, prepareFinancingComparisonPacket} from "./financing-comparison-packet";
import {calculateAdoptedFinancingComparison} from "./adopted-financing-comparison";
import {c02Ids, c02PacketInput} from "./financing-comparison.test-support";

// Expectations come from the independent oracle modelo_c02.py (resultados.json).
const P = Decimal.clone({precision: 60});
const r4 = (v: string) => new P(v).toDecimalPlaces(4).toNumber();

describe("C02 decision packet: proposals compared on the company in every adopted scenario", {timeout: 120000}, () => {
  const sealed = c02PacketInput().seal();
  const packet = prepareFinancingComparisonPacket(sealed);
  it("validates against its published contract and grants nothing", () => {
    const contract = financingComparisonPacketExecutorContracts();
    expect(matchesMethodValue(contract.inputs.value, sealed)).toBe(true);
    expect(matchesMethodValue(contract.outputs.value, packet)).toBe(true);
    expect(() => financingComparisonPacketOutputSchema.parse({...packet, grantsExecution: true})).toThrow();
    expect(packet.status).toBe("prepared_for_human_review");
  });
  it("eliminates the proposal that runs out of cash in the bank's case before any preference", () => {
    const [base, stress] = packet.comparison.cases;
    expect(base!.viableProposalIds).toEqual([c02Ids.itau, c02Ids.santander, c02Ids.fundo]);
    expect(stress!.proposals.find((p) => p.proposalId === c02Ids.itau)!.eliminatoryFacts).toEqual(["cash_below_zero"]);
    expect(r4(stress!.proposals.find((p) => p.proposalId === c02Ids.itau)!.minimumCash.amount)).toBe(-0.261);
    expect(packet.comparison.viableInEveryCaseProposalIds).toEqual([c02Ids.santander, c02Ids.fundo]);
    expect(packet.comparison.conclusionChangingCaseIds).toEqual(["bank-stress"]);
  });
  it("states covenant headroom in EBITDA at the worst test date, on each lender's own definition", () => {
    for (const [n, c] of packet.comparison.cases.entries()) {
      const kernel = (calculateAdoptedFinancingComparison(sealed.cases[n]!.analysis) as {comparison: {proposals: {id: string; covenant: {limit: string; worst: {period: string}; rows: {period: string; netDebt: string; trailingEbitda: string}[]}}[]}}).comparison;
      for (const p of c.proposals) {
        const k = kernel.proposals.find((x) => x.id === p.proposalId)!.covenant, row = k.rows.find((r) => r.period === k.worst.period)!;
        // EBITDA that can be lost: E - ND / limit, equal to ratio headroom times E over the limit.
        expect(new Decimal(p.covenant.ebitdaHeadroom).minus(new Decimal(row.trailingEbitda).minus(new Decimal(row.netDebt).div(k.limit))).abs().lt("1e-15")).toBe(true);
        expect(new Decimal(p.covenant.ebitdaHeadroom).minus(new Decimal(p.covenant.headroom).times(row.trailingEbitda).div(k.limit)).abs().lt("1e-15")).toBe(true);
        expect(new Decimal(p.covenant.ebitdaHeadroom).gt(0)).toBe(new Decimal(p.covenant.headroom).gt(0));
      }
    }
  });
  it("shows the lowest nominal spread is not the lowest equivalent cost", () => {
    expect(packet.comparison.nominalSpreadMisleads).toBe(true);
    expect(packet.comparison.cases[0]!.lowestEquivalentCostProposalId).toBe(c02Ids.fundo);
    expect(packet.comparison.cases[0]!.highestMinimumCashProposalId).toBe(c02Ids.fundo);
    expect(r4(packet.comparison.cases[0]!.proposals.find((p) => p.proposalId === c02Ids.fundo)!.covenant.headroom)).toBe(0.8712);
  });
  it("refuses a stress that edits another stress, a second base and a silent case", () => {
    const a = c02PacketInput().seal(); a.cases[1]!.changes = [];
    expect(() => prepareFinancingComparisonPacket(a)).toThrow("must say what it changes");
    const b = c02PacketInput().seal(); (b.cases[1] as {role: string}).role = "base";
    expect(() => prepareFinancingComparisonPacket(b)).toThrow("Exactly one base case is required");
    const c = c02PacketInput().seal(); c.cases[1]!.analysis.inheritedScenario = "other";
    expect(() => prepareFinancingComparisonPacket(c)).toThrow("A case may inherit only the base scenario");
  });
});
