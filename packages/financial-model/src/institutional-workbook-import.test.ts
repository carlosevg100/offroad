import {describe, expect, it} from "vitest";
import * as XLSX from "xlsx";

import {buildInstitutionalFinancialModel} from "./institutional-model";
import {institutionalInputFixture} from "./institutional-input.fixture";
import {prepareInstitutionalModelInput} from "./institutional-input";
import {reviewInstitutionalFinancialModel} from "./review";
import {buildInstitutionalWorkbookArtifact, renderInstitutionalFinancialWorkbook} from "./institutional-workbook";
import {readInstitutionalWorkbookIdentity, readInstitutionalWorkbookProposal} from "./institutional-workbook-import";
import type {ApprovedInstitutionalScenario} from "./institutional-runtime";

function approvedScenario(configurationId = "11111111-1111-4111-8111-111111111111"): ApprovedInstitutionalScenario {
  const fixture = institutionalInputFixture();
  const prepared = prepareInstitutionalModelInput(fixture);
  const model = buildInstitutionalFinancialModel(prepared.input!);
  return {
    configurationId, revision: 1, configurationFingerprint: prepared.configurationFingerprint,
    reviewedBy: "22222222-2222-4222-8222-222222222222", reviewedAt: "2026-09-10T03:00:00Z",
    prepared, model, review: reviewInstitutionalFinancialModel(prepared.input!, model),
    sourceBindings: fixture.sources.map(source => ({
      ...source, currency: "BRL", amountScale: "units" as const,
      metadataEvidence: {locator: "Page 1", rationale: "Reviewed normalized monetary units"},
      reviewedBy: "22222222-2222-4222-8222-222222222222", reviewedAt: "2026-09-10T03:00:00Z",
    })),
  };
}

const manifest = "a".repeat(64);
const approvedArtifact = () => buildInstitutionalWorkbookArtifact([approvedScenario()], manifest);

async function productWorkbook(artifact: Awaited<ReturnType<typeof approvedArtifact>>) {
  const {bytes} = await renderInstitutionalFinancialWorkbook(artifact.institutional.scenarios, "en", artifact.institutional.activeScenarioId, true);
  return bytes;
}

/** Find the cell an analyst would click on: a labelled row on the editable Inputs sheet. */
function addressOf(bytes: Uint8Array, sheet: string, label: string, column = "B"): string {
  const rows = XLSX.utils.sheet_to_json(XLSX.read(bytes, {type: "array"}).Sheets[sheet]!, {header: 1, raw: false, defval: ""}) as string[][];
  const index = rows.findIndex(row => row[0] === label);
  if (index < 0) throw new Error(`no row labelled ${label} on ${sheet}`);
  return `${column}${index + 1}`;
}

function editWorkbook(bytes: Uint8Array, edit: (book: XLSX.WorkBook) => void): Uint8Array {
  const book = XLSX.read(bytes, {type: "array"});
  edit(book);
  return new Uint8Array(XLSX.write(book, {bookType: "xlsx", type: "array"}) as ArrayBuffer);
}

const setValue = (sheet: string, address: string, value: number) => (book: XLSX.WorkBook) => {
  book.Sheets[sheet]![address] = {t: "n", v: value};
};

describe("imported product workbook", () => {
  it("reads the identity the workbook carries, without any database record", async () => {
    const artifact = await approvedArtifact();
    const identity = readInstitutionalWorkbookIdentity(await productWorkbook(artifact));
    expect(identity).toEqual({
      lang: "en",
      configurationIds: ["11111111-1111-4111-8111-111111111111"],
      configurationFingerprints: [artifact.institutional.scenarios[0]!.configurationFingerprint],
    });
    expect(readInstitutionalWorkbookIdentity(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("extracts only the assumption cell that was edited, with its exact difference", async () => {
    const artifact = await approvedArtifact();
    const bytes = await productWorkbook(artifact);
    const address = addressOf(bytes, "Inputs 1", "cost-ratio");
    const edited = editWorkbook(bytes, setValue("Inputs 1", address, 0.45));

    const result = await readInstitutionalWorkbookProposal({bytes: edited, artifact});
    expect(result.status).toBe("proposed");
    if (result.status !== "proposed") return;
    expect(result.proposal.changes).toEqual([{
      assumptionId: "cost-ratio", label: {pt: "cost-ratio", en: "cost-ratio"}, unit: "percent",
      period: "2027", approved: "0.5", proposed: "0.45", difference: "-0.05",
      sheet: "Inputs 1", cell: address,
    }]);
    expect(result.proposal.configurationId).toBe("11111111-1111-4111-8111-111111111111");
    expect(result.proposal.sourceManifestFingerprint).toBe(manifest);
    expect(result.proposal.artifactFingerprint).toBe(artifact.fingerprint);
    expect(result.proposal.structureFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.proposal.uploadFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("records the same untouched structure whichever assumption cell moved", async () => {
    const artifact = await approvedArtifact();
    const bytes = await productWorkbook(artifact);
    const costRatio = addressOf(bytes, "Inputs 1", "cost-ratio");
    const first = await readInstitutionalWorkbookProposal({bytes: editWorkbook(bytes, setValue("Inputs 1", costRatio, 0.45)), artifact});
    const second = await readInstitutionalWorkbookProposal({bytes: editWorkbook(bytes, setValue("Inputs 1", costRatio, 0.4)), artifact});
    expect(first.status).toBe("proposed");
    expect(second.status).toBe("proposed");
    if (first.status !== "proposed" || second.status !== "proposed") return;
    expect(first.proposal.structureFingerprint).toBe(second.proposal.structureFingerprint);
    expect(first.proposal.uploadFingerprint).not.toBe(second.proposal.uploadFingerprint);
  });

  it("refuses an untouched file instead of proposing an empty change", async () => {
    const artifact = await approvedArtifact();
    const result = await readInstitutionalWorkbookProposal({bytes: await productWorkbook(artifact), artifact});
    expect(result).toEqual({status: "refused", refusal: {reason: "no_change", sheet: null, cell: null, assumptionId: null, period: null}});
  });

  it("refuses a rewritten formula and names the cell", async () => {
    const artifact = await approvedArtifact();
    const bytes = await productWorkbook(artifact);
    const edited = editWorkbook(bytes, book => { book.Sheets["Calculations 1"]!.B2 = {t: "n", v: 999}; });
    const result = await readInstitutionalWorkbookProposal({bytes: edited, artifact});
    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.refusal.reason).toBe("structure_changed");
    expect(result.refusal.sheet).toBe("Calculations 1");
    expect(result.refusal.cell).toBe("B2");
  });

  it("refuses an overwritten historical number", async () => {
    const artifact = await approvedArtifact();
    const bytes = await productWorkbook(artifact);
    const address = addressOf(bytes, "Inputs 1", "activity: historical revenue");
    const result = await readInstitutionalWorkbookProposal({bytes: editWorkbook(bytes, setValue("Inputs 1", address, 9999)), artifact});
    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.refusal).toMatchObject({reason: "historical_value_changed", sheet: "Inputs 1", cell: address});
  });

  it("refuses a renamed label and an added cell", async () => {
    const artifact = await approvedArtifact();
    const bytes = await productWorkbook(artifact);
    const renamed = editWorkbook(bytes, book => { book.Sheets["Inputs 1"]!.A2 = {t: "s", v: "whatever"}; });
    expect((await readInstitutionalWorkbookProposal({bytes: renamed, artifact})).status).toBe("refused");
    const added = editWorkbook(bytes, book => {
      book.Sheets["Inputs 1"]!.Z90 = {t: "n", v: 1};
      book.Sheets["Inputs 1"]!["!ref"] = "A1:Z90";
    });
    const result = await readInstitutionalWorkbookProposal({bytes: added, artifact});
    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.refusal).toMatchObject({reason: "structure_changed", sheet: "Inputs 1", cell: "Z90"});
  });

  it("refuses a workbook produced from another approved revision", async () => {
    const mine = await approvedArtifact();
    const theirs = await buildInstitutionalWorkbookArtifact([approvedScenario("33333333-3333-4333-8333-333333333333")], manifest);
    const bytes = await productWorkbook(theirs);
    const address = addressOf(bytes, "Inputs 1", "cost-ratio");
    const result = await readInstitutionalWorkbookProposal({bytes: editWorkbook(bytes, setValue("Inputs 1", address, 0.45)), artifact: mine});
    expect(result).toEqual({status: "refused", refusal: {reason: "unknown_revision", sheet: null, cell: null, assumptionId: null, period: null}});
  });

  it("refuses bytes that are not a workbook and a record it cannot verify", async () => {
    const artifact = await approvedArtifact();
    expect(await readInstitutionalWorkbookProposal({bytes: new Uint8Array([1, 2, 3]), artifact})).toMatchObject({status: "refused", refusal: {reason: "unreadable"}});
    const tampered = structuredClone(artifact);
    tampered.institutional.scenarios[0]!.input.openingBalanceSheet.unrestrictedCash = "777";
    expect(await readInstitutionalWorkbookProposal({bytes: await productWorkbook(artifact), artifact: tampered}))
      .toMatchObject({status: "refused", refusal: {reason: "unknown_revision"}});
  });
});
