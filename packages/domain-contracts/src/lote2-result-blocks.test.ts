import {describe, expect, it} from "vitest";
import {artifactBlockDraftSchema} from "./artifact-protocol";
import {covenantHeadroomPacketBlocks, debtTablePacketBlocks, readCovenantHeadroomPacketBlocks, readDebtTablePacketBlocks, readWeeklyCashPacketBlocks, weeklyCashPacketBlocks,
  type CovenantHeadroomPacketLike, type DebtTablePacketLike, type WeeklyCashPacketLike} from "./lote2-result-blocks";
// The packets and blocks the SQL mappings are proved against (supabase/tests/lote2_result_artifacts.sql).
// Synthetic calibrations of fichas C10, C12 and C18, without the adopted contributions the mapping never reads.
import debtTableBlocks from "./fixtures/debt-table-result-blocks.json";
import debtTablePacket from "./fixtures/debt-table-result-packet.json";
import covenantBlocks from "./fixtures/covenant-headroom-result-blocks.json";
import covenantPacket from "./fixtures/covenant-headroom-result-packet.json";
import weeklyBlocks from "./fixtures/weekly-cash-result-blocks.json";
import weeklyPacket from "./fixtures/weekly-cash-result-packet.json";

const valid = (blocks: unknown[]) => blocks.every((b) => artifactBlockDraftSchema.safeParse(b).success);
const without = <T extends {blockKey: string}>(blocks: readonly T[], key: string) => blocks.filter((b) => b.blockKey !== key);
const tampered = <T extends {blockKey: string; claims: readonly {value: unknown}[]}>(blocks: readonly T[], key: string) =>
  blocks.map((b) => b.blockKey === key ? {...b, claims: b.claims.map((c, n) => n === 0 ? {...c, value: "1"} : c)} : b);

describe("the shared debt table result fixture (C10)", () => {
  it("is exactly the contract mapping of the shared packet and reads back", () => {
    const blocks = debtTablePacketBlocks(debtTablePacket as unknown as DebtTablePacketLike);
    expect(blocks).toEqual(debtTableBlocks);
    expect(valid(debtTableBlocks as unknown[])).toBe(true);
    const view = readDebtTablePacketBlocks(blocks)!;
    expect(view.instruments.map((r) => r.principal)).toEqual(["60", "40", "30"]);
    expect(view.views.map((v) => v.total)).toEqual(["130", "131.8", "138", "144"]);
    expect(view.security.crossDefault?.chain.map((c) => [c.instrumentId, c.threshold])).toEqual([["ccb-bradesco", "5"], ["debenture-1", "10"]]);
    expect(view.framing.readings?.completenessRequest).toBe(true);
    expect(readDebtTablePacketBlocks(without(blocks, "profile"))).toBeNull();
    expect(readDebtTablePacketBlocks(tampered(blocks, "views"))).toBeNull();
  });
  it("refuses another packet", () => {
    expect(() => debtTablePacketBlocks({...(debtTablePacket as unknown as DebtTablePacketLike), schemaVersion: "x" as never})).toThrow("execution_result_unmappable");
    const long = structuredClone(debtTablePacket) as unknown as {result: {table: {rows: {id: string}[]}}};
    long.result.table.rows[0]!.id = "x".repeat(141);
    expect(() => debtTablePacketBlocks(long as unknown as DebtTablePacketLike)).toThrow("execution_result_unmappable");
  });
});

describe("the shared covenant headroom result fixture (C12)", () => {
  it("is exactly the contract mapping of the shared packet and reads back", () => {
    const blocks = covenantHeadroomPacketBlocks(covenantPacket as unknown as CovenantHeadroomPacketLike);
    expect(blocks).toEqual(covenantBlocks);
    expect(valid(covenantBlocks as unknown[])).toBe(true);
    const view = readCovenantHeadroomPacketBlocks(blocks)!;
    expect(view.framing.readings?.headline.measurementId).toBe("dez26-base");
    expect(view.framing.readings?.policyBindsFirst).toBe(true);
    expect(view.measurements.length).toBeGreaterThan(1);
    expect(readCovenantHeadroomPacketBlocks(without(blocks, "effects"))).toBeNull();
    expect(readCovenantHeadroomPacketBlocks(tampered(blocks, "framing"))).toBeNull();
  });
  it("refuses another packet", () => {
    expect(() => covenantHeadroomPacketBlocks({...(covenantPacket as unknown as CovenantHeadroomPacketLike), schemaVersion: "x" as never})).toThrow("execution_result_unmappable");
  });
});

describe("the shared weekly cash result fixture (C18)", () => {
  it("is exactly the contract mapping of the shared packet and reads back", () => {
    const blocks = weeklyCashPacketBlocks(weeklyPacket as unknown as WeeklyCashPacketLike);
    expect(blocks).toEqual(weeklyBlocks);
    expect(valid(weeklyBlocks as unknown[])).toBe(true);
    const view = readWeeklyCashPacketBlocks(blocks)!;
    expect(view.framing.readings?.tightestWeek).toEqual({weekStart: "2026-12-21", closing: "7.48118286", belowMinimum: true});
    expect(view.framing.readings?.weeksBelowMinimum).toEqual(["2026-12-14", "2026-12-21"]);
    expect(view.weeks.filter((w) => w.caseId === view.cases[0]!.id).length).toBeGreaterThan(10);
    expect(readWeeklyCashPacketBlocks(without(blocks, "calendar"))).toBeNull();
    expect(readWeeklyCashPacketBlocks(tampered(blocks, "framing"))).toBeNull();
  });
  it("refuses another packet", () => {
    expect(() => weeklyCashPacketBlocks({...(weeklyPacket as unknown as WeeklyCashPacketLike), schemaVersion: "x" as never})).toThrow("execution_result_unmappable");
  });
});
