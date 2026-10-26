import {describe, expect, it} from "vitest";
import {prepareReceivablesFundingPacket} from "./receivables-funding-packet";
import {calculateAdoptedReceivablesFunding} from "./adopted-receivables-funding";
import {adoptedReceivablesFundingOutputSchema} from "./receivables-funding-results";
import {receivablesFundingPacketExecutorContracts} from "./receivables-funding-contracts";
import {auroraReceivablesFunding, auroraReceivablesFundingBasis} from "./receivables-funding.test-support";

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
      ["linha-giro", null, "1.82", true, "liability"], ["desconto-bancario", "24.3", "1.99", true, "liability"], ["fidc-sem-coobrigacao", "10", "2.08", false, "derecognized"]]);
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
  it("keeps the reason of a lot fully cut by the debtor sublimit through the adopted reader", () => {
    const k = auroraReceivablesFunding(), e = k.items.find((i) => i.id === "rede-e")!;
    const split = {...k, items: [...k.items.filter((i) => i.id !== "rede-e"), {...e, id: "rede-e-lote-1", amount: "3"}, {...e, id: "rede-e-lote-2", amount: "1.5"}]};
    const p = prepareReceivablesFundingPacket({schemaVersion: "receivables-funding-packet-input.v1", question, analysis: auroraReceivablesFundingBasis(split).seal()});
    expect(p.readings!.exclusions.find((x) => x.itemId === "rede-e-lote-2")).toMatchObject({amount: "1.5", reasons: ["debtor_sublimit"]});
    expect([p.readings!.assignable, p.readings!.exclusions.every((x) => x.reasons.length > 0)]).toEqual(["25", true]);
  });
  it("costs the discount through the adopted reader when the time in use is shorter, equal or longer than the rollover term", () => {
    const at = (calendarDays: number) => prepareReceivablesFundingPacket({schemaVersion: "receivables-funding-packet-input.v1", question,
      analysis: auroraReceivablesFundingBasis({...auroraReceivablesFunding(), calendarDays, businessDays: Math.round(calendarDays * 0.7)}).seal()})
      .result.funding!.options.find((o) => o.id === "desconto-bancario")!.cost;
    expect([30, 50, 51].map((d) => {const c = at(d); return [c.draws, c.iofDays, n(c.iof, 6)];})).toEqual([[1, 30, "0.106420"], [1, 50, "0.134300"], [2, 51, "0.200294"]]);
  });
  it("allocates lots of one debtor with different maturities by exact flow through the adopted reader, in any order", () => {
    const k = auroraReceivablesFunding(), short = {...k.items[3]!, id: "curto", label: "Sacado, lote curto", amount: "3", dueDate: "2026-10-15", creditTier: "standard" as const, registration: "registered" as const, debtorKey: "sacado-unico"};
    const long = {...short, id: "longo", label: "Sacado, lote longo", amount: "2", dueDate: "2027-01-15"};
    const fund = (id: string, rate: string, cap: string, term: number) => ({...k.options[1]!, id, label: id, rate: {basis: "monthly" as const, rate},
      eligibility: {...k.options[1]!.eligibility!, sublimitPerDebtor: cap, sublimitGroup: null, maxRemainingTermDays: term}});
    for (const items of [[short, long], [long, short], [{...short, id: "curto-1", amount: "1"}, long, {...short, id: "curto-2", amount: "2"}]]) {
      const p = prepareReceivablesFundingPacket({schemaVersion: "receivables-funding-packet-input.v1", question, analysis: auroraReceivablesFundingBasis({...k, items,
        options: [fund("barato", "0.01", "2", 180), fund("restrito", "0.02", "3", 60), k.options[4]!], needAverage: "5", needPeak: "5"}).seal()});
      expect([p.readings!.assignable, p.readings!.exclusions, p.readings!.planCoversPeak]).toEqual(["5", [], true]);
      expect(p.readings!.plan.map((s) => [s.optionId, s.capacity, s.amount, s.cumulative])).toEqual([["barato", "2", "2", "2"], ["restrito", "3", "3", "5"]]);
    }
  });
  it("shows residual capacity per step through the adopted reader, with independent or shared sublimits", () => {
    const k = auroraReceivablesFunding(), a = {...k.items[3]!, id: "sacado-a", label: "Sacado A", amount: "5", creditTier: "selected" as const, registration: "registered" as const, debtorKey: "sacado-a"};
    const b = {...a, id: "sacado-b", label: "Sacado B", creditTier: "standard" as const, debtorKey: "sacado-b"};
    const fund = (id: string, rate: string, tier: "selected" | "standard", group: string | null) => ({...k.options[1]!, id, label: id, rate: {basis: "monthly" as const, rate},
      eligibility: {...k.options[1]!.eligibility!, sublimitPerDebtor: "3", sublimitGroup: group, minCreditTier: tier}});
    for (const [group, capacity] of [[null, "5"], ["mesmos-fundos", "3"]] as const) for (const items of [[a, b], [b, {...a, id: "sacado-a-2", amount: "2"}, {...a, id: "sacado-a-1", amount: "3"}]]) {
      const p = prepareReceivablesFundingPacket({schemaVersion: "receivables-funding-packet-input.v1", question, analysis: auroraReceivablesFundingBasis({...k, items,
        options: [fund("barato", "0.01", "selected", group), fund("caro", "0.02", "standard", group), k.options[4]!], needAverage: "8", needPeak: "8"}).seal()});
      expect(p.readings!.plan.map((s) => [s.optionId, s.capacity, s.amount])).toEqual([["barato", "3", "3"], ["caro", capacity, capacity]]);
    }
  });
});
