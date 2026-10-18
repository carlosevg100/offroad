import {describe, expect, it} from "vitest";
import {investmentDecisionPacketBlocks, readInvestmentDecisionPacketBlocks, type InvestmentDecisionPacketLike} from "@offroad/domain-contracts";
import {prepareInvestmentDecisionPacket} from "@offroad/financial-model";
import {c32PacketInput} from "../../../../../packages/financial-model/src/investment-decision-packet.test-support";

const packet = () => {const f = c32PacketInput({quantum: "10000"}); f.seal(); return prepareInvestmentDecisionPacket(f.input) as unknown as InvestmentDecisionPacketLike;};

describe("investment decision result as artifact blocks", () => {
  it("maps the C32 packet into blocks a reader takes back without recomputing", () => {
    const p = packet(), blocks = investmentDecisionPacketBlocks(p);
    expect(blocks.map(b => b.blockKey)).toEqual(["framing", "cases", "metrics", "conclusion", "information-gaps", "exclusions"]);
    const view = readInvestmentDecisionPacketBlocks(blocks)!;
    expect(view.framing).toMatchObject({status: "prepared_for_human_review", baseCaseId: "base", caseCount: 5});
    expect(view.conclusionChangingCaseIds).toEqual(["economy-4", "capex-120", "slower-start"]);
    const base = view.metrics.find(m => m.caseId === "base")!;
    expect(Number(base.netPresentValue) / 1e6).toBeCloseTo(0.73, 2);
    expect(base.companyMinimumCashWithout).toBe("20000000"); expect(base.companyMinimumCashWithoutDate).toBe("2025-12-31");
    expect(blocks.find(b => b.blockKey === "metrics")!.claims.map(c => c.claimId).slice(0, 3)).toEqual(["npv:base", "irr:base", "payback:base"]);
  });

  it("refuses tampered, missing or unknown blocks", () => {
    const blocks = [...investmentDecisionPacketBlocks(packet())];
    expect(readInvestmentDecisionPacketBlocks(blocks.filter(b => b.blockKey !== "conclusion"))).toBeNull();
    expect(readInvestmentDecisionPacketBlocks([...blocks, {blockKey: "extra", kind: "section", content: {}, claims: []}])).toBeNull();
    const metrics = blocks.find(b => b.blockKey === "metrics")!;
    const forged = {...metrics, claims: metrics.claims.map((c, i) => i ? c : {...c, value: "999"})};
    expect(readInvestmentDecisionPacketBlocks(blocks.map(b => b.blockKey === "metrics" ? forged : b))).toBeNull();
    expect(() => investmentDecisionPacketBlocks({...packet(), schemaVersion: "capital-procedure-packet.v2"} as never)).toThrow("execution_result_unmappable");
  });
});

describe("the shared fixture the SQL mapping is proved against", () => {
  it("keeps of each case result only what the blocks read, so it maps exactly as the full packet", async () => {
    const fixture = (await import("../../../../../packages/domain-contracts/src/fixtures/investment-result-blocks.json")).default;
    expect(investmentDecisionPacketBlocks(packet())).toEqual(fixture);
  });
});
