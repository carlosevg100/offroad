import {describe, expect, it} from "vitest";
import {artifactBlockDraftSchema, financingComparisonPacketBlocks, readFinancingComparisonPacketBlocks, type FinancingComparisonPacketLike} from "./artifact-protocol";
// The packet and blocks the SQL mapping private.execution_result_comparison_blocks_v1 is proved against
// (supabase/tests/comparison_result_artifacts.sql). Synthetic calibration of ficha C02.
import blocksFixture from "./fixtures/comparison-result-blocks.json";
import packetFixture from "./fixtures/comparison-result-packet.json";

describe("the shared comparison result fixture", () => {
  it("is exactly the contract mapping of the shared packet, block by block, and reads back", () => {
    const blocks = financingComparisonPacketBlocks(packetFixture as unknown as FinancingComparisonPacketLike);
    expect(blocks).toEqual(blocksFixture);
    expect((blocksFixture as unknown[]).every((block) => artifactBlockDraftSchema.safeParse(block).success)).toBe(true);
    const view = readFinancingComparisonPacketBlocks(blocks)!;
    expect(view.cases.map((c) => c.id)).toEqual(["base", "bank-stress"]);
    expect(view.proposals).toHaveLength(6); expect(view.framing.nominalSpreadMisleads).toBe(true);
    expect(readFinancingComparisonPacketBlocks(blocks.filter((b) => b.blockKey !== "debt-service"))).toBeNull();
  });
  it("refuses another packet", () => {
    expect(() => financingComparisonPacketBlocks({...(packetFixture as unknown as FinancingComparisonPacketLike), schemaVersion: "x" as never})).toThrow("execution_result_unmappable");
  });
});
