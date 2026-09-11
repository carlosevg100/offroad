import {createHash} from "node:crypto";
import * as XLSX from "xlsx";
import {checkIdentity} from "@offroad/financial-core";

import {columnLetter, type Cell, type ModelSheet} from "./model";
import {parseVerifiedInstitutionalWorkbookArtifact, renderInstitutionalFinancialWorkbook} from "./institutional-workbook";

/**
 * An edited product workbook, read back as a proposed change.
 *
 * The v2 workbook exists so somebody can argue with the model in Excel. Until now that argument
 * had nowhere to go: the file said "changes do not modify platform approval" and that was the end
 * of it. This module is the way back in, and its whole design is about what it refuses.
 *
 * It never trusts the file. The approved artifact is re-rendered from the database record, cell by
 * cell, and the upload is compared against that rendering: every label, every formula, every
 * historical number must be identical. Only the blue assumption cells on the Inputs sheets may
 * differ, and the fingerprint of everything else is recorded so the review can see that nothing
 * outside those cells moved. A workbook from another revision, another project or with a rewritten
 * formula is refused with the sheet and the cell that gave it away, never quietly accepted and
 * never quietly repaired.
 *
 * What comes out is a proposal, not a change. Applying it is the reviewer's decision, under the
 * project roles, through the same configuration review every other assumption change goes through.
 */

export type InstitutionalWorkbookRefusalReason =
  /** The bytes are not a readable workbook. */
  | "unreadable"
  /** The sheets are not the sheets of this product workbook. */
  | "not_a_product_workbook"
  /** The workbook was produced from a different approved revision or project. */
  | "unknown_revision"
  /** A label, a formula or the layout moved. */
  | "structure_changed"
  /** A historical number, which the company's documents fix, was overwritten. */
  | "historical_value_changed"
  /** An editable cell that is not an assumption moved; the platform is where that changes. */
  | "unsupported_change"
  /** A proposed assumption value is not a usable number or leaves its declared bounds. */
  | "value_invalid"
  /** The file matches the approved revision exactly. */
  | "no_change";

export type InstitutionalWorkbookRefusal = {
  reason: InstitutionalWorkbookRefusalReason;
  sheet: string | null;
  cell: string | null;
  assumptionId: string | null;
  period: string | null;
};

export type InstitutionalWorkbookAssumptionProposal = {
  assumptionId: string;
  label: {pt: string; en: string};
  unit: string;
  period: string;
  approved: string;
  proposed: string;
  difference: string;
  sheet: string;
  cell: string;
};

export type InstitutionalWorkbookProposal = {
  lang: "pt" | "en";
  configurationId: string;
  configurationFingerprint: string;
  sourceManifestFingerprint: string;
  artifactFingerprint: string;
  /**
   * sha256 over every cell that did not move: the whole workbook except the assumption cells the
   * reader edited. Two uploads that change different cells of the same revision disagree here,
   * and any edit outside those cells is refused before this is ever computed.
   */
  structureFingerprint: string;
  /** sha256 of the uploaded bytes, so the same file is never reviewed twice by accident. */
  uploadFingerprint: string;
  changes: InstitutionalWorkbookAssumptionProposal[];
};

export type InstitutionalWorkbookImport =
  | {status: "proposed"; proposal: InstitutionalWorkbookProposal}
  | {status: "refused"; refusal: InstitutionalWorkbookRefusal};

const refuse = (
  reason: InstitutionalWorkbookRefusalReason,
  detail: Partial<Omit<InstitutionalWorkbookRefusal, "reason">> = {},
): InstitutionalWorkbookImport => ({
  status: "refused",
  refusal: {reason, sheet: null, cell: null, assumptionId: null, period: null, ...detail},
});

/** Formulas survive a spreadsheet round trip with cosmetic differences only. */
const normalizeFormula = (value: string) => value.replace(/^=/, "").replace(/\s+/g, "").toUpperCase();

/** The identity a product workbook carries on its own approval register. */
export type InstitutionalWorkbookIdentity = {
  lang: "pt" | "en";
  configurationIds: string[];
  configurationFingerprints: string[];
};

function sheetRows(sheet: XLSX.WorkSheet | undefined): string[][] {
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, {header: 1, raw: false, defval: ""}) as string[][];
}

/**
 * Read who the workbook says it belongs to, without any database record. The caller uses this to
 * find the project and the approved revision before anything is verified against it.
 */
export function readInstitutionalWorkbookIdentity(bytes: Uint8Array): InstitutionalWorkbookIdentity | null {
  let book: XLSX.WorkBook;
  try { book = XLSX.read(bytes, {type: "array"}); } catch { return null; }
  for (const [lang, registerName, idLabel] of [["pt", "Registro de aprovação", "Configuração"], ["en", "Approval register", "Configuration"]] as const) {
    const rows = sheetRows(book.Sheets[registerName]);
    if (rows.length === 0) continue;
    const configurationIds = rows.filter(row => row[0] === idLabel).map(row => String(row[1] ?? ""));
    const configurationFingerprints = rows.filter(row => row[0] === "Configuration SHA-256").map(row => String(row[1] ?? ""));
    if (configurationIds.length === 0 || configurationIds.length !== configurationFingerprints.length) return null;
    return {lang, configurationIds, configurationFingerprints};
  }
  return null;
}

type ExpectedCell = {sheet: string; address: string; cell: Cell; rowKey: string; column: number};

function expectedGrid(sheets: readonly ModelSheet[], lang: "pt" | "en"): Map<string, ExpectedCell> {
  const grid = new Map<string, ExpectedCell>();
  for (const sheet of sheets) {
    sheet.rows.forEach((row, rowIndex) => row.cells.forEach((cell, columnIndex) => {
      const address = `${columnLetter(columnIndex)}${rowIndex + 1}`;
      grid.set(`${sheet.name[lang]}!${address}`, {sheet: sheet.name[lang], address, cell, rowKey: row.key, column: columnIndex});
    }));
  }
  return grid;
}

/** The number a spreadsheet cell holds, canonicalized through the deterministic core. */
function canonicalNumber(value: unknown): string | null {
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isFinite(raw)) return null;
  try { return checkIdentity({id: "workbook.cell", left: raw, right: 0}).difference; } catch { return null; }
}

/**
 * Verify the upload against the approved revision and extract the assumption cells that moved.
 * `artifact` is the record the database holds; nothing in the file is allowed to contradict it.
 */
export async function readInstitutionalWorkbookProposal(input: {bytes: Uint8Array; artifact: unknown}): Promise<InstitutionalWorkbookImport> {
  const artifact = parseVerifiedInstitutionalWorkbookArtifact(input.artifact);
  if (!artifact) return refuse("unknown_revision");
  if (artifact.version !== "institutional-workbook-editable.v2") return refuse("not_a_product_workbook");

  const identity = readInstitutionalWorkbookIdentity(input.bytes);
  if (!identity) return refuse("unreadable");
  const approvedIds = artifact.institutional.scenarios.map(scenario => scenario.configurationId);
  const approvedFingerprints = artifact.institutional.scenarios.map(scenario => scenario.configurationFingerprint);
  if (identity.configurationIds.join("|") !== approvedIds.join("|")
    || identity.configurationFingerprints.join("|") !== approvedFingerprints.join("|")) {
    return refuse("unknown_revision");
  }

  let book: XLSX.WorkBook;
  try { book = XLSX.read(input.bytes, {type: "array"}); } catch { return refuse("unreadable"); }

  const lang = identity.lang;
  let rendered: Awaited<ReturnType<typeof renderInstitutionalFinancialWorkbook>>;
  try {
    rendered = await renderInstitutionalFinancialWorkbook(artifact.institutional.scenarios, lang, artifact.institutional.activeScenarioId, true);
  } catch { return refuse("unknown_revision"); }
  const expectedSheetNames = rendered.model.sheets.map(sheet => sheet.name[lang]);
  // The cover sheet is written by the workbook writer and carries no economics.
  const uploadedSheetNames = book.SheetNames.slice(1);
  if (uploadedSheetNames.join("|") !== expectedSheetNames.join("|")) return refuse("not_a_product_workbook");

  const grid = expectedGrid(rendered.model.sheets, lang);
  const assumptions = new Map(artifact.institutional.scenarios.flatMap(scenario =>
    scenario.input.assumptionBook.assumptions.map(assumption => [`${scenario.configurationId}:${assumption.id}`, assumption])));
  const scenarioOfSheet = new Map<string, string>();
  rendered.model.sheets.forEach(sheet => {
    const match = /^institutional_(?:live|build)_(\d+)$/.exec(sheet.key);
    if (match) scenarioOfSheet.set(sheet.name[lang], artifact.institutional.scenarios[Number(match[1])]!.configurationId);
  });
  // The editable Inputs sheet of scenario n sits immediately after that scenario's live sheet.
  rendered.model.sheets.forEach((sheet, index) => {
    if (sheet.key !== "assumptions") return;
    const owner = rendered.model.sheets[index - 1];
    if (owner) scenarioOfSheet.set(sheet.name[lang], scenarioOfSheet.get(owner.name[lang]) ?? "");
  });

  const changes: InstitutionalWorkbookAssumptionProposal[] = [];
  const structure: string[] = [];

  for (const [key, expected] of grid) {
    const [sheetName, address] = key.split("!") as [string, string];
    const uploaded = book.Sheets[sheetName]?.[address] as XLSX.CellObject | undefined;
    const detail = {sheet: sheetName, cell: address};

    if (expected.cell.formula) {
      if (!uploaded?.f || normalizeFormula(uploaded.f) !== normalizeFormula(expected.cell.formula)) return refuse("structure_changed", detail);
      structure.push(`${key}=f:${normalizeFormula(uploaded.f)}`);
      continue;
    }
    if (expected.cell.value === undefined || expected.cell.value === "") {
      if (uploaded && uploaded.v !== undefined && uploaded.v !== "") return refuse("structure_changed", detail);
      continue;
    }
    if (uploaded?.f) return refuse("structure_changed", detail);

    if (typeof expected.cell.value === "number") {
      const proposed = canonicalNumber(uploaded?.v);
      const approved = canonicalNumber(expected.cell.value);
      if (proposed === null || approved === null) return refuse("structure_changed", detail);
      if (proposed === approved) { structure.push(`${key}=n:${proposed}`); continue; }
      if (expected.cell.role !== "input") return refuse("historical_value_changed", detail);
      const assumptionId = expected.rowKey.startsWith("assumption.") ? expected.rowKey.slice("assumption.".length) : null;
      if (!assumptionId) return refuse("unsupported_change", detail);
      const scenarioId = scenarioOfSheet.get(sheetName) ?? "";
      const assumption = assumptions.get(`${scenarioId}:${assumptionId}`);
      const period = artifact.periods[expected.column - 1];
      if (!assumption || !period || assumption.values[period] === undefined) return refuse("structure_changed", detail);
      const approvedValue = assumption.values[period]!;
      if ((assumption.lowerBound !== undefined && Number(proposed) < Number(assumption.lowerBound))
        || (assumption.upperBound !== undefined && Number(proposed) > Number(assumption.upperBound))) {
        return refuse("value_invalid", {...detail, assumptionId, period});
      }
      changes.push({
        assumptionId, label: assumption.label, unit: assumption.unit, period,
        approved: approvedValue, proposed,
        difference: checkIdentity({id: `${assumptionId}.${period}`, left: proposed, right: approvedValue}).difference,
        sheet: sheetName, cell: address,
      });
      continue;
    }
    if (String(uploaded?.v ?? "") !== String(expected.cell.value)) return refuse("structure_changed", detail);
    structure.push(`${key}=s:${String(expected.cell.value)}`);
  }

  for (const sheetName of uploadedSheetNames) {
    for (const address of Object.keys(book.Sheets[sheetName] ?? {})) {
      if (address.startsWith("!")) continue;
      if (!grid.has(`${sheetName}!${address}`)) return refuse("structure_changed", {sheet: sheetName, cell: address});
    }
  }

  if (changes.length === 0) return refuse("no_change");
  return {
    status: "proposed",
    proposal: {
      lang,
      configurationId: artifact.institutional.activeScenarioId,
      configurationFingerprint: artifact.institutional.scenarios.find(s => s.configurationId === artifact.institutional.activeScenarioId)!.configurationFingerprint,
      sourceManifestFingerprint: artifact.institutional.sourceManifestFingerprint,
      artifactFingerprint: artifact.fingerprint,
      structureFingerprint: createHash("sha256").update(structure.join("\n")).digest("hex"),
      uploadFingerprint: createHash("sha256").update(input.bytes).digest("hex"),
      changes: changes.sort((a, b) => a.assumptionId.localeCompare(b.assumptionId) || a.period.localeCompare(b.period)),
    },
  };
}
