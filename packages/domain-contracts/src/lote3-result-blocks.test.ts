import {describe, expect, it} from "vitest";
import {artifactBlockDraftSchema} from "./artifact-protocol";
import {operatingProjectionPacketBlocks, projectionChallengePacketBlocks, quarterUpdatePacketBlocks, readOperatingProjectionPacketBlocks, readProjectionChallengePacketBlocks,
  readQuarterUpdatePacketBlocks, readReceivablesFundingPacketBlocks, receivablesFundingPacketBlocks, type OperatingProjectionPacketLike, type ProjectionChallengePacketLike,
  type QuarterUpdatePacketLike, type ReceivablesFundingPacketLike} from "./lote3-result-blocks";
// The packets and blocks the SQL mappings are proved against (supabase/tests/lote3_result_artifacts.sql).
// Synthetic calibrations of fichas C24, C26, C35 and C54, without the adopted contributions the mapping never reads.
import projectionBlocks from "./fixtures/operating-projection-result-blocks.json";
import projectionPacket from "./fixtures/operating-projection-result-packet.json";
import challengeBlocks from "./fixtures/projection-challenge-result-blocks.json";
import challengePacket from "./fixtures/projection-challenge-result-packet.json";
import fundingBlocks from "./fixtures/receivables-funding-result-blocks.json";
import fundingPacket from "./fixtures/receivables-funding-result-packet.json";
import quarterBlocks from "./fixtures/quarter-update-result-blocks.json";
import quarterPacket from "./fixtures/quarter-update-result-packet.json";

const valid = (blocks: unknown[]) => blocks.every((b) => artifactBlockDraftSchema.safeParse(b).success);
const without = <T extends {blockKey: string}>(blocks: readonly T[], key: string) => blocks.filter((b) => b.blockKey !== key);
const tampered = <T extends {blockKey: string; claims: readonly {value: unknown}[]}>(blocks: readonly T[], key: string) =>
  blocks.map((b) => b.blockKey === key ? {...b, claims: b.claims.map((c, n) => n === 0 ? {...c, value: "1"} : c)} : b);
const framed = <T extends object>(packet: T, path: string[]) => {
  const p = structuredClone(packet) as Record<string, unknown>;
  p.readings = null;
  let at = p; for (const k of path.slice(0, -1)) at = at[k] as Record<string, unknown>;
  if (path.length) at[path[path.length - 1]!] = null;
  return p as unknown as T;
};

describe("the shared operating projection result fixture (C24)", () => {
  const packet = projectionPacket as unknown as OperatingProjectionPacketLike;
  it("is exactly the contract mapping of the shared packet and reads back", () => {
    const blocks = operatingProjectionPacketBlocks(packet);
    expect(blocks).toEqual(projectionBlocks);
    expect(valid(projectionBlocks as unknown[])).toBe(true);
    const view = readOperatingProjectionPacketBlocks(blocks)!;
    expect(view.framing.calibration).toMatchObject({reportedRevenue: "420", reportedEbitda: "52", reproduces: true});
    expect(view.base.map((r) => Number(r.ebitda).toFixed(1))).toEqual(["54.5", "56.6", "58.8"]);
    expect(view.comparisons.map((c) => c.versionId)).toEqual(["orcamento", "revisao-julho"]);
    expect(view.scenarios.some((s) => s.role === "informed")).toBe(true);
    expect(view.largestCashReduction?.scenarioId).toBe("prazo-60");
    expect(readOperatingProjectionPacketBlocks(without(blocks, "ledger"))).toBeNull();
    expect(readOperatingProjectionPacketBlocks(tampered(blocks, "base"))).toBeNull();
  });
  it("maps a framed packet without numbers and refuses another packet", () => {
    const view = readOperatingProjectionPacketBlocks(operatingProjectionPacketBlocks(framed(packet, [])))!;
    expect([view.base, view.framing.calibration, view.largestCashReduction]).toEqual([[], null, null]);
    expect(() => operatingProjectionPacketBlocks({...packet, schemaVersion: "x" as never})).toThrow("execution_result_unmappable");
  });
});

describe("the shared projection challenge result fixture (C26)", () => {
  const packet = challengePacket as unknown as ProjectionChallengePacketLike;
  it("is exactly the contract mapping of the shared packet and reads back", () => {
    const blocks = projectionChallengePacketBlocks(packet);
    expect(blocks).toEqual(challengeBlocks);
    expect(valid(challengeBlocks as unknown[])).toBe(true);
    const view = readProjectionChallengePacketBlocks(blocks)!;
    expect(view.framing.largestAssumptionId).toBe("preco");
    expect(view.framing.recommendation?.kind).toBe("present_plan_as_upside_case");
    expect(view.assumptions.map((a) => a.assumptionId)).toEqual(["preco", "volume", "fixos", "prazo-capex"]);
    expect(view.rulers.capacity).toMatchObject({maximumQuantity: "118", aboveWithoutInvestment: true});
    expect(readProjectionChallengePacketBlocks(without(blocks, "rulers"))).toBeNull();
    expect(readProjectionChallengePacketBlocks(tampered(blocks, "framing"))).toBeNull();
    expect(readProjectionChallengePacketBlocks(tampered(blocks, "assumptions"))).toBeNull();
  });
  it("maps a framed packet without numbers and refuses another packet", () => {
    const view = readProjectionChallengePacketBlocks(projectionChallengePacketBlocks(framed(packet, [])))!;
    expect([view.assumptions, view.framing.gap]).toEqual([[], null]);
    expect(() => projectionChallengePacketBlocks({...packet, schemaVersion: "x" as never})).toThrow("execution_result_unmappable");
  });
});

describe("the shared receivables funding result fixture (C35)", () => {
  const packet = fundingPacket as unknown as ReceivablesFundingPacketLike;
  it("is exactly the contract mapping of the shared packet and reads back", () => {
    const blocks = receivablesFundingPacketBlocks(packet);
    expect(blocks).toEqual(fundingBlocks);
    expect(valid(fundingBlocks as unknown[])).toBe(true);
    const view = readReceivablesFundingPacketBlocks(blocks)!;
    expect([view.framing.gross, view.framing.assignable]).toEqual(["62", "25"]);
    expect(view.options.every((o) => o.label !== null)).toBe(true);
    expect(view.plan.map((s) => s.optionId)).toEqual(["risco-sacado-b", "fidc-com-coobrigacao"]);
    expect(view.portfolio.find((i) => i.itemId === "rede-a")?.reasons).toEqual(["not_assignable"]);
    expect(view.informationGaps).toHaveLength(2);
    expect(readReceivablesFundingPacketBlocks(without(blocks, "releases"))).toBeNull();
    expect(readReceivablesFundingPacketBlocks(tampered(blocks, "options"))).toBeNull();
  });
  it("maps a framed packet without numbers and refuses another packet", () => {
    const view = readReceivablesFundingPacketBlocks(receivablesFundingPacketBlocks(framed(packet, ["result", "funding"])))!;
    expect([view.options, view.portfolio, view.framing.assignable, view.framing.referenceDate]).toEqual([[], [], null, null]);
    expect(() => receivablesFundingPacketBlocks({...packet, schemaVersion: "x" as never})).toThrow("execution_result_unmappable");
  });
});

describe("the shared quarter update result fixture (C54)", () => {
  const packet = quarterPacket as unknown as QuarterUpdatePacketLike;
  it("is exactly the contract mapping of the shared packet and reads back", () => {
    const blocks = quarterUpdatePacketBlocks(packet);
    expect(blocks).toEqual(quarterBlocks);
    expect(valid(quarterBlocks as unknown[])).toBe(true);
    const view = readQuarterUpdatePacketBlocks(blocks)!;
    expect(view.framing.tightestWeek?.updated).toEqual({weekStart: "2026-12-21", closing: "4.39270974"});
    expect(view.framing.topUp?.needExceedsLimit).toBe(true);
    expect(view.bridges.map((b) => [b.lineId, b.deviation])).toEqual([["ebitda", "-0.4"], ["caixa", "-1.7"]]);
    expect(view.dependents.rows.filter((d) => d.status === "stale").map((d) => d.id)).toEqual(["material-sondagem"]);
    expect(view.openQuestions).toHaveLength(1);
    expect(readQuarterUpdatePacketBlocks(without(blocks, "covenant"))).toBeNull();
    expect(readQuarterUpdatePacketBlocks(tampered(blocks, "framing"))).toBeNull();
  });
  it("maps a framed packet without numbers and refuses another packet", () => {
    const view = readQuarterUpdatePacketBlocks(quarterUpdatePacketBlocks(framed(packet, ["result", "update"])))!;
    expect([view.lines, view.framing.tightestWeek, view.covenant, view.action.steps]).toEqual([[], null, null, []]);
    expect(() => quarterUpdatePacketBlocks({...packet, schemaVersion: "x" as never})).toThrow("execution_result_unmappable");
  });
});
