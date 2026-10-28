import {describe, expect, it} from "vitest";
import {prepareDocumentFolderInventoryPacket} from "@offroad/financial-model";
// Synthetic calibration of ficha C09 from the method's own test support.
import {auroraFolderBasis, auroraFolderUpdateBasis} from "../../../../../packages/financial-model/src/document-folder-inventory.test-support";
import {folderPacketInput, folderQuestion, folderTurnTwoQuestion} from "../../../../../packages/financial-model/src/document-folder-inventory-runs.test-support";
import {checkDocumentFolderPin, composeDocumentFolderRequest, documentFolderMode} from "./document-folder-prior";

const bound = (b: {envelope: {canonical: string; fingerprint: string}; scope: unknown}) => ({envelope: b.envelope, scope: b.scope});

describe("document folder prior inventory (C09)", {timeout: 120000}, () => {
  const base = auroraFolderBasis().seal();
  const stored = composeDocumentFolderRequest({basis: bound(base), question: folderQuestion, mode: "organize", prior: null});
  const packet = prepareDocumentFolderInventoryPacket(stored);
  const prior = {executionId: "a0000000-0000-4000-8000-000000000071", resultFingerprint: packet.fingerprint, inputSnapshot: JSON.stringify(stored)};
  const pin = {executionId: prior.executionId, resultFingerprint: prior.resultFingerprint, baseFingerprint: base.envelope.fingerprint};
  const facts = {priorFingerprint: {value: base.envelope.fingerprint, origin: "house", source: "Base"}};

  it("composes the inventory, and the update against the stored base taken verbatim, as the calibration", () => {
    expect(packet.readings).toEqual(prepareDocumentFolderInventoryPacket(folderPacketInput()).readings);
    const update = auroraFolderUpdateBasis(base.envelope.fingerprint).seal();
    const two = composeDocumentFolderRequest({basis: bound(update), question: folderTurnTwoQuestion, mode: "organize", prior});
    expect(JSON.stringify(two.analysis.base)).toBe(JSON.stringify(stored.analysis.base));
    expect(prepareDocumentFolderInventoryPacket(two).readings).toEqual(prepareDocumentFolderInventoryPacket(folderPacketInput({turnTwo: true})).readings);
    expect(() => composeDocumentFolderRequest({basis: bound(update), question: folderTurnTwoQuestion, mode: "organize", prior: {...prior, inputSnapshot: "{}"}})).toThrow("document_folder_prior_invalid");
  });
  it("goes ahead only over the pinned inventory, and an inventory card only while there is none", () => {
    expect(checkDocumentFolderPin({priorInventory: pin}, facts, prior)).toEqual({ok: true, prior});
    expect(checkDocumentFolderPin({priorInventory: pin}, facts, {...prior, executionId: "a0000000-0000-4000-8000-000000000072"})).toEqual({ok: false, error: "superseded"});
    expect(checkDocumentFolderPin({priorInventory: pin}, facts, {...prior, resultFingerprint: "0".repeat(64)})).toEqual({ok: false, error: "superseded"});
    expect(checkDocumentFolderPin({priorInventory: pin}, {priorFingerprint: {value: "1".repeat(64)}}, prior)).toEqual({ok: false, error: "superseded"});
    expect(checkDocumentFolderPin({priorInventory: pin}, facts, null)).toEqual({ok: false, error: "superseded"});
    expect(checkDocumentFolderPin({priorInventory: null}, {}, null)).toEqual({ok: true, prior: null});
    expect(checkDocumentFolderPin({priorInventory: null}, {}, prior)).toEqual({ok: false, error: "superseded"});
    expect(checkDocumentFolderPin({}, {}, null)).toEqual({ok: false, error: "superseded"});
    expect([documentFolderMode({mode: "organize_only"}), documentFolderMode({mode: "x"})]).toEqual(["organize_only", null]);
  });
});
