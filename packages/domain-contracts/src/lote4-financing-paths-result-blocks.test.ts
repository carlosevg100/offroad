import {describe, expect, it} from "vitest";
import {artifactBlockDraftSchema} from "./artifact-protocol";
import {financingPathsPacketBlocks, readFinancingPathsPacketBlocks, type FinancingPathsPacketLike} from "./lote4-financing-paths-result-blocks";
// The packet and blocks the SQL mapping is proved against: the synthetic calibration of ficha C32 (Aurora, BRL millions),
// with only the adopted contributions the mapping reads (the instrument labels).
import blocksFixture from "./fixtures/financing-paths-result-blocks.json";
import packetFixture from "./fixtures/financing-paths-result-packet.json";

const packet = packetFixture as unknown as FinancingPathsPacketLike;
const without = <T extends {blockKey: string}>(blocks: readonly T[], key: string) => blocks.filter((b) => b.blockKey !== key);
const tampered = <T extends {blockKey: string; claims: readonly {value: unknown}[]}>(blocks: readonly T[], key: string) =>
  blocks.map((b) => b.blockKey === key ? {...b, claims: b.claims.map((c, n) => n === 0 ? {...c, value: "1"} : c)} : b);

describe("the shared financing paths result fixture (C32)", () => {
  it("is exactly the contract mapping of the shared packet and reads back", () => {
    const blocks = financingPathsPacketBlocks(packet);
    expect(blocks).toEqual(blocksFixture);
    expect((blocksFixture as unknown[]).every((b) => artifactBlockDraftSchema.safeParse(b).success)).toBe(true);
    const view = readFinancingPathsPacketBlocks(blocks)!;
    expect([view.framing.withoutAction?.firstBelowMinimum, view.framing.withoutAction?.peakYear.year]).toEqual(["2026-12-31", 2027]);
    expect([view.recommendation?.pathId, view.recommendation?.longInstrument?.issueFloorInsideGates, view.alternative?.pathId]).toEqual(["sem-linha-debenture", "74.44", "banco-sem-linha"]);
    expect(view.paths.map((p) => p.id)[0]).toBe("sem-linha-debenture");
    expect(view.cash).toHaveLength(10);
    expect(view.cash[1]).toMatchObject({periodId: "2026-12-31"});
    expect(Number(view.cash[1]!.withoutAction)).toBeLessThan(0);
    expect(view.instruments.find((i) => i.id === "ccb-bradesco")?.label).toBe("CCB Bradesco");
    expect(view.instruments).toHaveLength(13);
    expect(view.amortization.find((a) => a.pathId === "sem-linha-debenture" && a.profileId === "cinco-anos")).toMatchObject({passes: false, label: "Amortização de 2029 a 2031"});
    expect(view.wouldChange?.sensitivities.map((s) => s.recommendationHolds)).toEqual([false, false, false]);
    for (const key of ["framing", "recommendation", "paths", "cash", "instruments", "amortization", "would-change", "information-gaps", "exclusions"])
      expect(readFinancingPathsPacketBlocks(without(blocks, key)), key).toBeNull();
    for (const key of ["framing", "recommendation", "paths"]) expect(readFinancingPathsPacketBlocks(tampered(blocks, key)), key).toBeNull();
  });
  it("refuses a recommendation that is not a path inside every gate of its own table", () => {
    const blocks = financingPathsPacketBlocks(packet).map((b) => b.blockKey !== "paths" ? b
      : {...b, content: {rows: (b.content as {rows: {id: string; eligible: boolean}[]}).rows.map((r) => r.id === "sem-linha-debenture" ? {...r, eligible: false} : r)}});
    expect(readFinancingPathsPacketBlocks(blocks)).toBeNull();
  });
  it("maps a framed packet without numbers and refuses another packet", () => {
    const framed = {...structuredClone(packet), readings: null, result: {...packet.result, evaluation: null}, status: "framed" as const};
    const view = readFinancingPathsPacketBlocks(financingPathsPacketBlocks(framed))!;
    expect([view.paths, view.cash, view.recommendation, view.framing.withoutAction, view.wouldChange]).toEqual([[], [], null, null, null]);
    expect(view.instruments).toHaveLength(13);
    expect(() => financingPathsPacketBlocks({...packet, schemaVersion: "x" as never})).toThrow("execution_result_unmappable");
  });
});
