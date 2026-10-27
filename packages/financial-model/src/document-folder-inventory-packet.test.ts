import {describe, expect, it} from "vitest";
import {prepareDocumentFolderInventoryPacket} from "./document-folder-inventory-packet";
import {auroraFolderBasis, auroraFolderUpdateBasis} from "./document-folder-inventory.test-support";
import {folderPacketInput, folderQuestion} from "./document-folder-inventory-runs.test-support";
import {documentFolderInventoryPacketExecutorContracts} from "./document-folder-inventory-contracts";

describe("document folder inventory packet", {timeout: 120000}, () => {
  it("answers turn 1 in the ficha's order: size, what matters, versions, what was not read, gaps, one question", () => {
    const p = prepareDocumentFolderInventoryPacket(folderPacketInput()), r = p.readings!;
    expect(p.status).toBe("prepared_for_human_review");
    expect(r.opening).toEqual({files: 30, groups: ["Demonstrações", "Gerencial", "Dívida", "Contratos", "Governança", "Carteira", "Ativos", "Outros"], duplicates: 1, superseded: 3, inVault: 2});
    expect(r.decisionFindings!.map((d) => d.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.notRead.map((n) => [n.fileId, n.pages])).toEqual([["f20", [7]], ["f29", null]]);
    expect(r.gaps.map((g) => g.item)).toEqual(["Balancete de março de 2026", "Página 7 legível da cédula de crédito bancário", "Matrícula atualizada do imóvel avaliado no laudo",
      "Demonstrações auditadas da Aurora Logística, se existirem", "Projeção ou fluxo de caixa de 13 semanas atualizado"]);
    expect(r.questions).toHaveLength(1);
    expect([r.numericAnalysis, r.documentsValidated, p.grantsExecution, p.grantsPublication]).toEqual(["none", false, false, false]);
  });
  it("frames, without an inventory, a folder with a file reading that was not adopted", () => {
    const b = auroraFolderBasis(), seal = b.seal();
    const i = {schemaVersion: "document-folder-inventory-packet-input.v1", question: folderQuestion, mode: "organize",
      analysis: {base: {...seal, files: seal.files.map((f) => f.id === "f16" ? {...f, value: {...f.value, decisionId: null, missingReason: "Leitura da tabela de dívida pendente"}} : f)}, update: null}};
    const p = prepareDocumentFolderInventoryPacket(i);
    expect([p.status, p.readings, p.gaps]).toEqual(["framed", null, [{operand: `document_folder_inventory.${seal.analysisId}.file.f16.reading`, reason: "Leitura da tabela de dívida pendente"}]]);
  });
  it("keeps the base inventory and stays partial when the later turn could not be read", () => {
    const base = auroraFolderBasis().seal(), u = auroraFolderUpdateBasis(base.envelope.fingerprint).seal();
    const update = {...u, informed: u.informed.map((x) => ({...x, value: {...x.value, decisionId: null, missingReason: "Resposta não confirmada"}}))};
    const p = prepareDocumentFolderInventoryPacket({schemaVersion: "document-folder-inventory-packet-input.v1", question: folderQuestion, analysis: {base, update}});
    expect(p.status).toBe("partial");
    expect(p.result.status).toBe("base_only");
    expect(p.readings!.opening.files).toBe(30);
  });
  it("review r1: refuses selections that leave out a record the basis holds", () => {
    const i = folderPacketInput();
    i.analysis.base.files = i.analysis.base.files.filter((f) => f.id !== "f19");
    expect(() => prepareDocumentFolderInventoryPacket(i)).toThrow("document_inventory_selection_incomplete");
    const j = folderPacketInput();
    j.analysis.base.decisions = [];
    expect(() => prepareDocumentFolderInventoryPacket(j)).toThrow("document_inventory_selection_incomplete");
  });
  it("publishes strict contracts and is deterministic", () => {
    const c = documentFolderInventoryPacketExecutorContracts();
    expect(c.executor).toEqual({module: "@offroad/financial-model", exportName: "prepareDocumentFolderInventoryPacket", version: "2026.10.27-v1"});
    expect(prepareDocumentFolderInventoryPacket(folderPacketInput({turnTwo: true})).fingerprint).toBe(prepareDocumentFolderInventoryPacket(folderPacketInput({turnTwo: true})).fingerprint);
  });
});
