import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {matchesMethodValue} from "@offroad/credit-playbook";
import {financingComparisonPacketExecutorContracts} from "./financing-comparison-contracts";
import {financingComparisonPacketOutputSchema, prepareFinancingComparisonPacket} from "./financing-comparison-packet";
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
    expect(stress!.proposals.find((p) => p.proposalId === c02Ids.itau)!.eliminatoryFacts).toEqual(["cash_shortfall"]);
    expect(r4(stress!.proposals.find((p) => p.proposalId === c02Ids.itau)!.minimumCash.amount)).toBe(-0.261);
    expect(packet.comparison.viableInEveryCaseProposalIds).toEqual([c02Ids.santander, c02Ids.fundo]);
    expect(packet.comparison.conclusionChangingCaseIds).toEqual(["bank-stress"]);
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
