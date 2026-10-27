import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {composeBoundDocumentFolderInventory} from "./document-folder-inventory-composer";
import {prepareDocumentFolderInventoryPacket} from "./document-folder-inventory-packet";
import {proposeDocumentFolderInventoryHypotheses, proposeDocumentFolderUpdateHypotheses, type DocumentFolderInventoryFacts} from "./document-folder-inventory-premises";
import {auroraFolderFacts, auroraFolderUpdateFacts} from "./document-folder-inventory.test-support";
import {folderPacketInput, folderQuestion, folderTurnTwoQuestion} from "./document-folder-inventory-runs.test-support";
import {analysisTestId as id} from "./adopted-analysis.test-support";
import type {ProposedHypothesis} from "./investment-premises";

function sealed(entries: AdoptionBasisEntry[], version: number) {
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(version), setId: id(6), workId: id(7), purpose: "synthetic document folder",
    contextKey: "pasta", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const canonical = JSON.stringify(snapshot);
  return {entries, envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}, scope: {workId: id(7), purpose: snapshot.purpose, versionId: id(version)}};
}
function adopt(hypotheses: ProposedHypothesis[], first: number, version: number) {
  let n = first;
  return sealed(hypotheses.map((h) => ({decisionId: id(n++), slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
    kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null,
    definitionKind: "managerial", actorId: id(5), reason: h.reason}) as AdoptionBasisEntry), version);
}
const bound = (a: ReturnType<typeof sealed>) => ({envelope: a.envelope, scope: a.scope});

describe("C09 premises proposed from facts with origin, adopted, composed and organized", {timeout: 120000}, () => {
  it("stays inside the basis limit and states the origin of every premise", () => {
    const h = proposeDocumentFolderInventoryHypotheses(auroraFolderFacts());
    expect(h.length).toBeLessThanOrEqual(256);
    expect(h.every((x) => x.reason.startsWith("Origem:"))).toBe(true);
    expect(h.filter((x) => x.fieldPath.endsWith(".reading")).every((x) => x.reason.startsWith("Origem: documento."))).toBe(true);
  });
  it("reproduces the calibrated inventory of both turns from the composed bases", () => {
    const base = adopt(proposeDocumentFolderInventoryHypotheses(auroraFolderFacts()), 9000, 600);
    const one = prepareDocumentFolderInventoryPacket(composeBoundDocumentFolderInventory({base: bound(base), question: folderQuestion}));
    const ref = prepareDocumentFolderInventoryPacket(folderPacketInput());
    expect(one.status).toBe("prepared_for_human_review");
    expect(one.readings).toEqual(ref.readings);
    expect(one.result.inventory).toEqual(ref.result.inventory);
    const update = adopt(proposeDocumentFolderUpdateHypotheses(auroraFolderUpdateFacts(base.envelope.fingerprint)), 9500, 601);
    const two = prepareDocumentFolderInventoryPacket(composeBoundDocumentFolderInventory({base: bound(base), update: bound(update), question: folderTurnTwoQuestion}));
    const ref2 = prepareDocumentFolderInventoryPacket(folderPacketInput({turnTwo: true}));
    expect(two.status).toBe("prepared_for_human_review");
    expect(two.readings).toEqual(ref2.readings);
    expect(two.result.inventory).toEqual(ref2.result.inventory);
  });
  it("reports a record adopted twice as missing, never picking one", () => {
    const a = adopt(proposeDocumentFolderInventoryHypotheses(auroraFolderFacts()), 9000, 600);
    const e = a.entries.find((x) => x.fieldPath.endsWith(".file.f16.reading"))!;
    const twice = sealed([...a.entries, {...e, decisionId: id(9999), slotKey: createHash("sha256").update("second reading").digest("hex")}], 600);
    const input = composeBoundDocumentFolderInventory({base: bound(twice), question: folderQuestion});
    expect(input.analysis.base.files.find((f) => f.id === "f16")!.value.missingReason).toBe("2 contributions match file.f16.reading for scenario base; keep one value per slot in the working basis");
    expect(prepareDocumentFolderInventoryPacket(input).status).toBe("framed");
  });
  it("keeps the arrival order the facts declared", () => {
    const facts = auroraFolderFacts();
    facts.files.reverse();
    const p = prepareDocumentFolderInventoryPacket(composeBoundDocumentFolderInventory({base: bound(adopt(proposeDocumentFolderInventoryHypotheses(facts), 9000, 600)), question: folderQuestion}));
    // Arriving first, the copy is the document and the original becomes its copy: identity is by hash and arrival, never by name.
    expect(p.result.inventory!.rows.find((r) => r.situation.duplicateOf)!.fileId).toBe("f01");
  });
  it("refuses inconsistent facts before proposing premises", () => {
    const refuse = (change: (f: DocumentFolderInventoryFacts) => void, message: string) => {const f = auroraFolderFacts(); change(f); expect(() => proposeDocumentFolderInventoryHypotheses(f)).toThrow(message);};
    refuse((f) => {f.files[1]!.value.fileId = "f01";}, "Duplicate file");
    refuse((f) => {f.files[0]!.origin = "estimate";}, "A file reading comes from the document");
    refuse((f) => {f.readingDate = "2024-12-31";}, "The reading date must come after the start of the window");
    const u = auroraFolderUpdateFacts("0".repeat(64));
    u.informed[0]!.origin = "house";
    expect(() => proposeDocumentFolderUpdateHypotheses(u)).toThrow("An informed fact is informed by the person");
  });
});
