import {createHash} from "node:crypto";
import {governedWorkbookRendererVersion, toGovernedXlsxBuffer, type GovernedWorkbookMetadata} from "./governed-workbook";
import type {FinancialModel} from "./model";
import {toXlsxBuffer} from "./workbook";

export type ApprovedWorkbookBinding = {
  workbooks: {pt: {sha256: string; byteSize: number}; en: {sha256: string; byteSize: number}};
  rendering?: {rendererVersion: string; metadata: {pt: GovernedWorkbookMetadata; en: GovernedWorkbookMetadata}};
};

/** Reproduce the compiled workbook, never bless new bytes by replacing its approved hash. */
export async function renderApprovedFinancialWorkbook(model: FinancialModel, lang: "pt" | "en", artifact: ApprovedWorkbookBinding): Promise<Uint8Array | null> {
  if (artifact.rendering && artifact.rendering.rendererVersion !== governedWorkbookRendererVersion) return null;
  const bytes = artifact.rendering
    ? (await toGovernedXlsxBuffer(model, lang, artifact.rendering.metadata[lang])).bytes
    : toXlsxBuffer(model, lang);
  const expected = artifact.workbooks[lang];
  return bytes.byteLength === expected.byteSize && createHash("sha256").update(bytes).digest("hex") === expected.sha256 ? bytes : null;
}
