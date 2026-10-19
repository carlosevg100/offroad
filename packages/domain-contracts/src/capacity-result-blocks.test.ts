import {describe, expect, it} from "vitest";
import {artifactBlockDraftSchema, debtCapacityPacketBlocks, readDebtCapacityPacketBlocks, type DebtCapacityPacketLike} from "./artifact-protocol";
// The packet and blocks the SQL mapping private.execution_result_capacity_blocks_v1 is proved against
// (supabase/tests/capacity_result_artifacts.sql). Synthetic calibration of ficha C04.
import blocksFixture from "./fixtures/capacity-result-blocks.json";
import packetFixture from "./fixtures/capacity-result-packet.json";

describe("the shared capacity result fixture", () => {
  it("is exactly the contract mapping of the shared packet, block by block, and reads back", () => {
    const blocks = debtCapacityPacketBlocks(packetFixture as unknown as DebtCapacityPacketLike);
    expect(blocks).toEqual(blocksFixture);
    expect((blocksFixture as unknown[]).every((block) => artifactBlockDraftSchema.safeParse(block).success)).toBe(true);
    const view = readDebtCapacityPacketBlocks(blocks)!;
    expect(view.cases.map((c) => c.id)).toEqual(["informed", "phased"]);
    expect(view.capacity.map((c) => [c.caseId, c.bindingLimitId, c.bindingDate, c.bindingScenario])).toEqual([["informed", "covenant", "2028-12-31", "adverse"], ["phased", "covenant", "2029-12-31", "adverse"]]);
    expect(view.review.map((r) => [r.caseId, r.scenario, r.fits])).toEqual([["informed", "base", false], ["informed", "adverse", false], ["phased", "base", true], ["phased", "adverse", true]]);
    expect(view.plan.every((p) => p.caseId === "informed")).toBe(true);
    expect(readDebtCapacityPacketBlocks(blocks.filter((b) => b.blockKey !== "plan"))).toBeNull();
  });
  it("refuses another packet", () => {
    expect(() => debtCapacityPacketBlocks({...(packetFixture as unknown as DebtCapacityPacketLike), schemaVersion: "x" as never})).toThrow("execution_result_unmappable");
  });
});
