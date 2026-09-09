import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {renderApprovedFinancialWorkbook, type ApprovedWorkbookBinding} from "./approved-download";
import {buildFinancialModel} from "./model";
import {governedWorkbookRendererVersion, toGovernedXlsxBuffer} from "./governed-workbook";
import {toXlsxBuffer} from "./workbook";

const model = () => buildFinancialModel({archetypeId: "other", facts: [], calculations: [], filenames: new Map(), lang: "pt", requestedAmount: "12000000", requestedTermMonths: 48, requestedGraceMonths: 6});
const receipt = (bytes: Uint8Array) => ({sha256: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.byteLength});
const metadata = {title: "Modelo", asOfDate: "2026-09-09", currency: "BRL", scale: "unidades", classification: "confidential" as const};

describe("approved workbook reproduction", () => {
  it("preserves historical plain exports only when their exact bytes match", async () => {
    const financialModel = model();
    const original = toXlsxBuffer(financialModel, "pt");
    const binding = {workbooks: {pt: receipt(original), en: receipt(original)}};
    expect(await renderApprovedFinancialWorkbook(financialModel, "pt", binding)).toEqual(original);
    expect(await renderApprovedFinancialWorkbook(financialModel, "pt", {workbooks: {...binding.workbooks, pt: {...binding.workbooks.pt, byteSize: 1}}})).toBeNull();
  });
  it("requires matching renderer, metadata and economic content", async () => {
    const financialModel = model();
    const original = await toGovernedXlsxBuffer(financialModel, "pt", metadata);
    const binding: ApprovedWorkbookBinding = {workbooks: {pt: receipt(original.bytes), en: receipt(original.bytes)}, rendering: {rendererVersion: governedWorkbookRendererVersion, metadata: {pt: metadata, en: metadata}}};
    expect(await renderApprovedFinancialWorkbook(financialModel, "pt", binding)).toEqual(original.bytes);
    expect(await renderApprovedFinancialWorkbook(financialModel, "pt", {...binding, rendering: {...binding.rendering!, rendererVersion: "unknown"}})).toBeNull();
    expect(await renderApprovedFinancialWorkbook(financialModel, "pt", {workbooks: binding.workbooks})).toBeNull();
    const changed = buildFinancialModel({archetypeId: "other", facts: [], calculations: [], filenames: new Map(), lang: "pt", requestedAmount: "13000000", requestedTermMonths: 48, requestedGraceMonths: 6});
    expect(await renderApprovedFinancialWorkbook(changed, "pt", binding)).toBeNull();
  });
});
