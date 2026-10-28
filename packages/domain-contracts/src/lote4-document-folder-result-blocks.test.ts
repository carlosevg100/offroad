import {describe, expect, it} from "vitest";
import {artifactBlockDraftSchema} from "./artifact-protocol";
import {documentFolderPacketBlocks, readDocumentFolderPacketBlocks, type DocumentFolderPacketLike} from "./lote4-document-folder-result-blocks";
// The packets and blocks the SQL mapping is proved against: synthetic calibration of ficha C09 (Aurora, turns 1 and 2),
// without the adopted contributions and bindings the mapping never reads.
import folderBlocks from "./fixtures/document-folder-result-blocks.json";
import folderPacket from "./fixtures/document-folder-result-packet.json";
import updateBlocks from "./fixtures/document-folder-update-result-blocks.json";
import updatePacket from "./fixtures/document-folder-update-result-packet.json";

const valid = (blocks: unknown[]) => blocks.every((b) => artifactBlockDraftSchema.safeParse(b).success);
const without = <T extends {blockKey: string}>(blocks: readonly T[], key: string) => blocks.filter((b) => b.blockKey !== key);
const tampered = <T extends {blockKey: string; claims: readonly {value: unknown}[]}>(blocks: readonly T[], key: string) =>
  blocks.map((b) => b.blockKey === key ? {...b, claims: b.claims.map((c, n) => n === 0 ? {...c, value: "1"} : c)} : b);

describe("the shared document folder result fixture (C09, turn 1)", () => {
  const packet = folderPacket as unknown as DocumentFolderPacketLike;
  it("is exactly the contract mapping of the shared packet and reads back", () => {
    const blocks = documentFolderPacketBlocks(packet);
    expect(blocks).toEqual(folderBlocks);
    expect(valid(folderBlocks as unknown[])).toBe(true);
    const view = readDocumentFolderPacketBlocks(blocks)!;
    expect(view.framing.opening).toEqual({files: 30, groups: ["Demonstrações", "Gerencial", "Dívida", "Contratos", "Governança", "Carteira", "Ativos", "Outros"], duplicates: 1, superseded: 3, inVault: 2});
    expect(view.inventory.rows).toHaveLength(30);
    expect(view.inventory.rows.find((r) => r.fileId === "f30")?.duplicateOf).toBe("f01");
    expect(view.inventory.rows.find((r) => r.fileId === "f20")?.unreadablePages).toEqual([7]);
    expect(view.decisionFindings.stated).toBe(true);
    expect(view.decisionFindings.rows.map((d) => d.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(view.generalFindings).toEqual({stated: false, rows: []});
    expect(view.notRead.map((n) => [n.fileId, n.pages])).toEqual([["f20", [7]], ["f29", null]]);
    expect(view.questions).toHaveLength(1);
    expect([view.update, view.framing.numericAnalysis, view.framing.documentsValidated]).toEqual([null, "none", false]);
    expect(readDocumentFolderPacketBlocks(without(blocks, "versions"))).toBeNull();
    expect(readDocumentFolderPacketBlocks(tampered(blocks, "framing"))).toBeNull();
    expect(readDocumentFolderPacketBlocks([...blocks, blocks[0]!])).toBeNull();
  });
  it("maps a framed packet without an inventory and refuses another packet", () => {
    const framed = {...structuredClone(packet), status: "framed" as const, readings: null, result: {...packet.result, inventory: null, priorInventory: null}};
    const view = readDocumentFolderPacketBlocks(documentFolderPacketBlocks(framed))!;
    expect([view.inventory.rows, view.framing.opening, view.decisionFindings.stated, view.questions]).toEqual([[], null, false, []]);
    expect(() => documentFolderPacketBlocks({...packet, schemaVersion: "x" as never})).toThrow("execution_result_unmappable");
  });
});

describe("the shared document folder update fixture (C09, turn 2)", () => {
  const packet = updatePacket as unknown as DocumentFolderPacketLike;
  it("carries only the rows the arrival touched, the identity check it allowed and the informed fact", () => {
    const blocks = documentFolderPacketBlocks(packet);
    expect(blocks).toEqual(updateBlocks);
    expect(valid(updateBlocks as unknown[])).toBe(true);
    const view = readDocumentFolderPacketBlocks(blocks)!;
    expect(view.update).toMatchObject({rowsUpdated: ["f20"], rowsAdded: ["s02"], rowsPreserved: 29,
      identityChecks: [{id: "f12-months", status: "matches", reported: "27000000", recomposed: "27000000"}],
      informed: [{statement: "A minuta não foi para nenhum banco.", author: "Controller da Aurora", date: "2026-09-02"}]});
    expect(view.questions).toEqual([]);
    expect(readDocumentFolderPacketBlocks(tampered(blocks, "update"))).toBeNull();
  });
});
