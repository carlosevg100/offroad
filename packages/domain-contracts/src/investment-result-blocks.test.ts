import {describe, expect, it} from "vitest";
import {artifactBlockDraftSchema, investmentDecisionPacketBlocks, readInvestmentDecisionPacketBlocks, type InvestmentDecisionPacketLike} from "./artifact-protocol";
// The packet and blocks the SQL mapping private.execution_result_investment_blocks_v1 is proved against
// (supabase/tests/investment_result_artifacts.sql). Synthetic calibration of ficha C32.
import blocksFixture from "./fixtures/investment-result-blocks.json";
import packetFixture from "./fixtures/investment-result-packet.json";

describe("the shared investment result fixture", () => {
  it("is exactly the contract mapping of the shared packet, block by block", () => {
    const blocks = investmentDecisionPacketBlocks(packetFixture as unknown as InvestmentDecisionPacketLike);
    expect(blocks).toEqual(blocksFixture);
    expect((blocksFixture as unknown[]).every((block) => artifactBlockDraftSchema.safeParse(block).success)).toBe(true);
    expect(readInvestmentDecisionPacketBlocks(blocks)?.metrics.map((m) => m.caseId)).toEqual(["base", "economy-4", "capex-120", "slower-start", "defer-12"]);
  });
});
