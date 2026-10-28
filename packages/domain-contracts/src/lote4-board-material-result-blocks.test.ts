import {describe, expect, it} from "vitest";
import {artifactBlockDraftSchema} from "./artifact-protocol";
import {boardMaterialPacketBlocks, readBoardMaterialPacketBlocks, type BoardMaterialPacketLike} from "./lote4-board-material-result-blocks";
// The packet and blocks the SQL mapping is proved against: the synthetic calibration of ficha C47 at turn three (the
// chair's request applied, the first version kept), without the adopted contributions and bindings the mapping never reads.
import blocksFixture from "./fixtures/board-material-result-blocks.json";
import packetFixture from "./fixtures/board-material-result-packet.json";

const packet = packetFixture as unknown as BoardMaterialPacketLike;
const without = <T extends {blockKey: string}>(blocks: readonly T[], key: string) => blocks.filter((b) => b.blockKey !== key);

describe("the shared board material result fixture (C47)", () => {
  it("is exactly the contract mapping of the shared packet and reads back", () => {
    const blocks = boardMaterialPacketBlocks(packet);
    expect(blocks).toEqual(blocksFixture);
    expect(blocksFixture.every((b) => artifactBlockDraftSchema.safeParse(b).success)).toBe(true);
    const view = readBoardMaterialPacketBlocks(blocks)!;
    expect(view.framing).toMatchObject({stage: "material", version: 2, allFiguresMatch: true, materialFactsShown: true, priorVersionsKept: true, sentToThirdParties: false, presented: false});
    expect(view.framing.priorVersionFingerprint).toBe(view.versions[0]!.fingerprint);
    expect(view.deliberations.map((d) => [d.id, d.deadlines.map((t) => t.date)])).toEqual([["linha", ["2026-10-02"]], ["safra", ["2026-10-16"]],
      ["vencimentos", ["2026-10-31", "2026-11-15"]], ["politica", []]]);
    expect(view.pages[0]!.title).toBe("Pedimos quatro decisões; três têm prazo");
    const line = view.pages.find((p) => p.id === "linha")!;
    expect([line.recommendation, line.options.length]).toEqual([null, 3]);
    expect(view.omissions).toEqual([expect.objectContaining({id: "linha-sem-recomendacao", outcome: "applied"})]);
    expect(view.questions).toHaveLength(10);
    expect(view.pending.indicative.map((x) => x.figureId)).toEqual(["programs", "spread-a"]);
    expect(view.identity.find((r) => r.figureId === "divida-total")).toMatchObject({display: "R$ 130 milhões", matches: true});
    expect(view.sources).toHaveLength(9);
    expect(readBoardMaterialPacketBlocks(without(blocks, "identity"))).toBeNull();
    // The adopted identity of the plan's CCB and the Bradesco row of the debt table, as the result publishes it.
    expect(view.links).toEqual([{id: "ccb-bradesco", planSourceId: "plano-2027", instrumentId: "ccb-bradesco", tableSourceId: "tabela-divida", rowId: "ccb-bradesco"}]);
    expect(readBoardMaterialPacketBlocks(without(blocks, "links"))).toBeNull();
    const tampered = blocks.map((b) => b.blockKey === "identity" ? {...b, claims: b.claims.map((c, n) => n === 0 ? {...c, value: "1"} : c)} : b);
    expect(readBoardMaterialPacketBlocks(tampered)).toBeNull();
    expect(readBoardMaterialPacketBlocks([...blocks, blocks[0]!])).toBeNull();
  });
  it("maps the outline before any material, and a packet without discussion, and refuses another packet", () => {
    const d = packet.result.discussion!;
    const outline = {...packet, status: "framed", readings: {material: null},
      result: {...packet.result, discussion: {...d, stage: "outline", versions: [], identity: [], omissions: []}}} as unknown as BoardMaterialPacketLike;
    const view = readBoardMaterialPacketBlocks(boardMaterialPacketBlocks(outline))!;
    expect([view.framing.stage, view.pages, view.summary, view.framing.version]).toEqual(["outline", [], null, null]);
    expect(view.deliberations.map((x) => x.recommendationShown)).toEqual([null, null, null, null]);
    const empty = readBoardMaterialPacketBlocks(boardMaterialPacketBlocks({...packet, readings: null, result: {...packet.result, discussion: null}}))!;
    expect([empty.deliberations, empty.identity, empty.framing.stage]).toEqual([[], [], null]);
    expect(() => boardMaterialPacketBlocks({...packet, schemaVersion: "x" as never})).toThrow("execution_result_unmappable");
  });
});
