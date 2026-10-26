import {describe, expect, it} from "vitest";
import {prepareReceivablesFundingPacket} from "./receivables-funding-packet";
import {calculateAdoptedReceivablesFunding} from "./adopted-receivables-funding";
import {adoptedReceivablesFundingOutputSchema} from "./receivables-funding-results";
import {receivablesFundingPacketExecutorContracts} from "./receivables-funding-contracts";
import {auroraReceivablesFundingBasis} from "./receivables-funding.test-support";

const question = "Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?";
const packet = () => prepareReceivablesFundingPacket({schemaVersion: "receivables-funding-packet-input.v1", question, analysis: auroraReceivablesFundingBasis().seal()});
const n = (v: string | null | undefined, p = 1) => Number(v).toFixed(p);
describe("receivables funding packet", () => {
  it("leads with the assignable part of the gross and the reason for every exclusion", () => {
    const p = packet(), r = p.readings!;
    expect([r.gross, r.assignable, n(r.assignableShare, 3)]).toEqual(["62", "25", "0.403"]);
    expect(r.exclusions.map((e) => [e.itemId, e.amount, e.reasons, e.holder])).toEqual([["rede-a", "19.8", ["not_assignable"], null], ["redes-c-d", "12", ["encumbered"], "Bradesco"],
      ["rede-e", "1.5", ["debtor_sublimit"], null], ["rede-f", "1.5", ["debtor_sublimit"], null], ["vencidos", "2.2", ["past_due"], null]]);
    // The varejo's largest debtor is not in the case: the FIDC volume stands as an upper bound and the packet says so.
    expect(p.status).toBe("partial");
    expect(p.gaps.map((g) => g.reason)).toEqual(["largest_debtor_not_informed", "largest_debtor_not_informed"]);
  });
  it("compares every option with the bank line on the same amount and time, rates converted", () => {
    const r = packet().readings!;
    expect(r.options.map((o) => [o.id, o.volume, n(o.cost, 2), o.iofApplies, o.balanceSheet])).toEqual([
      ["risco-sacado-b", "3.7", "1.33", false, "derecognized"], ["fidc-com-coobrigacao", "21.3", "1.75", false, "tends_to_remain_as_liability"],
      ["linha-giro", null, "1.82", true, "liability"], ["desconto-bancario", "24.3", "1.96", true, "liability"], ["fidc-sem-coobrigacao", "10", "2.08", false, "derecognized"]]);
    expect(r.plan.map((s) => [s.optionId, s.cumulative])).toEqual([["risco-sacado-b", "3.7"], ["fidc-com-coobrigacao", "25"]]);
    expect([r.bankLineReserve, r.startBy, r.slackDays, r.dedicatedVehicle.reading]).toEqual(["linha-giro", "2026-09-16", 1, "not_for_seasonal_need"]);
    expect(r.questions.map((q) => q.code)).toEqual(["anchor_program_of_restricted_debtor", "duplicata_registration_capability"]);
    expect(r.process).toEqual({buyers: "several_in_parallel", buyersNamed: false, buyersContacted: false, approvalPromised: false});
  });
  it("is deterministic, validated and publishes its contracts", () => {
    expect(packet().fingerprint).toBe(packet().fingerprint);
    expect(adoptedReceivablesFundingOutputSchema.parse(calculateAdoptedReceivablesFunding(auroraReceivablesFundingBasis().seal())).status).toBe("partial_composition");
    expect(receivablesFundingPacketExecutorContracts().executor).toEqual({module: "@offroad/financial-model", exportName: "prepareReceivablesFundingPacket", version: "2026.10.26-v1"});
  });
});
