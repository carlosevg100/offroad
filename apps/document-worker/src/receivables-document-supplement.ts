import {createHash} from "node:crypto";

import Decimal from "decimal.js";

import {
  applyReceivablesSupplementPatch,
  newReceivablesSupplementDraft,
  type ReceivablesSupplementDraft,
  receivablesDocumentSupplementContract,
  receivablesSupplementPatchSchema,
  type ReceivablesEvidenceDocument,
  type ReceivablesPhaseOneInput,
  type ReceivablesSupplementFieldPath,
  type ReceivablesSupplementPatch,
} from "@offroad/receivables-analysis";

type Cell = {ref: string; v: string | number | boolean | null};
type SheetRow = {document: ReceivablesEvidenceDocument; sheet: string; row: number; cells: Map<string, Cell>};
type Table = {document: ReceivablesEvidenceDocument; sheet: string; headerRow: number; columns: Map<string, string>; rows: SheetRow[]};

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function column(ref: string): string { return ref.match(/^[A-Z]+/)?.[0] ?? ""; }
function rowNumber(ref: string): number { return Number(ref.match(/\d+$/)?.[0] ?? 0); }

function rowsOf(document: ReceivablesEvidenceDocument): SheetRow[] {
  return (document.layer.sheets ?? []).flatMap((sheet) => {
    const rows = new Map<number, Map<string, Cell>>();
    for (const cell of sheet.cells) {
      const row = rowNumber(cell.ref);
      const col = column(cell.ref);
      if (!row || !col) continue;
      const current = rows.get(row) ?? new Map<string, Cell>();
      current.set(col, cell);
      rows.set(row, current);
    }
    return [...rows.entries()].sort(([left], [right]) => left - right).map(([row, cells]) => ({document, sheet: sheet.name, row, cells}));
  });
}

function findTable(documents: readonly ReceivablesEvidenceDocument[], required: readonly string[], sheetName?: string): Table | null {
  const expected = required.map(fold);
  const matches: Table[] = [];
  for (const document of documents) {
    const rows = rowsOf(document);
    for (const candidate of rows) {
      if (sheetName && fold(candidate.sheet) !== fold(sheetName)) continue;
      const columns = new Map<string, string>();
      for (const [col, cell] of candidate.cells) columns.set(fold(String(cell.v ?? "")), col);
      if (!expected.every((header) => columns.has(header))) continue;
      matches.push({
        document, sheet: candidate.sheet, headerRow: candidate.row, columns,
        rows: rows.filter((row) => row.sheet === candidate.sheet && row.row > candidate.row
          && [...row.cells.values()].some((cell) => String(cell.v ?? "").trim() !== "")),
      });
    }
  }
  return matches.length === 1 ? matches[0]! : null;
}

function text(table: Table, row: SheetRow, header: string): string {
  const col = table.columns.get(fold(header));
  return col ? String(row.cells.get(col)?.v ?? "").trim() : "";
}

/** Normalize explicit decimal/grouping conventions without rounding or guessing a lone
 * three-digit separator (1.234 may mean either 1234 or 1.234). */
function numericText(value: string): string | null {
  const raw = value.trim().replace(/\s/g, "").replace(/^R\$/i, "").replace(/x$/i, "");
  if (/^\d+$/.test(raw)) return raw;
  if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(raw)) return raw.replace(/\./g, "").replace(",", ".");
  if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(raw)) return raw.replace(/,/g, "");
  if (/^\d+[.,]\d+$/.test(raw) && !/^\d{1,3}[.,]\d{3}$/.test(raw)) return raw.replace(",", ".");
  return null;
}
function money(value: string): string | null {
  const normalized = numericText(value);
  if (normalized === null) return null;
  const decimal = new Decimal(normalized);
  return decimal.decimalPlaces() > 2 ? null : decimal.toFixed(2);
}

function bool(value: string): boolean | null {
  const normalized = fold(value);
  if (["sim", "yes", "true", "1"].includes(normalized)) return true;
  if (["nao", "no", "false", "0"].includes(normalized)) return false;
  return null;
}

function scalar(value: string): Decimal | null {
  const normalized = numericText(value);
  return normalized === null ? null : new Decimal(normalized);
}

type GovernedInputDefinition = readonly [
  key: string,
  path: ReceivablesSupplementFieldPath,
  kind: "integer" | "percentage" | "boolean" | "registration_rule" | "string_list" | "money" | "multiple",
  format: string,
];

function governedValue(kind: GovernedInputDefinition[2], value: string): unknown | null {
  if (kind === "boolean") return bool(value);
  if (kind === "registration_rule") return option(value, {
    obrigatorio: "required", required: "required",
    "quando aplicavel": "required_when_applicable", "required when applicable": "required_when_applicable",
    "nao obrigatorio": "not_required", "not required": "not_required",
  });
  if (kind === "string_list") {
    if (/^(todos|all)$/i.test(value.trim())) return [];
    const values = [...new Set(value.split(/[;,]/).map((item) => item.trim()).filter(Boolean))];
    return values.length > 0 && values.length <= 100 ? values : null;
  }
  const parsed = scalar(value.replace(/%$/, ""));
  if (!parsed) return null;
  if (kind === "integer") return parsed.isInteger() && parsed.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER) ? parsed.toNumber() : null;
  if (kind === "percentage") return parsed.lessThanOrEqualTo(100) ? parsed.dividedBy(100).toFixed() : null;
  if (kind === "money") return parsed.decimalPlaces() > 2 ? null : parsed.toFixed(2);
  return parsed.toFixed();
}

function governedFields(table: Table, definitions: readonly GovernedInputDefinition[]) {
  const byKey = new Map(definitions.map((definition) => [definition[0], definition]));
  const accepted = new Map<string, {path: ReceivablesSupplementFieldPath; value: unknown}>();
  const invalid = new Set<string>();
  for (const row of table.rows) {
    const key = text(table, row, "CAMPO");
    const raw = text(table, row, "VALOR");
    if (!raw) continue;
    const definition = byKey.get(key);
    if (!definition || accepted.has(key) || invalid.has(key)) {
      invalid.add(key || `row_${row.row}`);
      accepted.delete(key);
      continue;
    }
    const value = governedValue(definition[2], raw);
    if (value === null) {
      invalid.add(key);
      continue;
    }
    accepted.set(key, {path: definition[1], value});
  }
  return {fields: [...accepted.values()], invalid: [...invalid].sort()};
}

function date(value: string): string | null {
  const match = value.match(/^(\d{2})[/.](\d{2})[/.](\d{4})$/);
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

function option<T extends string>(value: string, values: Record<string, T>): T | null {
  return values[fold(value)] ?? null;
}

function sheetEvidence(table: Table, key: string) {
  return {sourceClass: "provided_document" as const, sourceId: table.document.id, anchor: `sheet:${table.sheet};header:${table.headerRow};key:${key}`};
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Reads only explicit, contract-named columns. It never defaults a missing legal control to
 * true or an absent cash event to zero. An ambiguous sheet or partial title partition yields no
 * section and remains visible as a readiness gap. */
export function buildReceivablesDocumentSupplementPatch(input: {
  phaseOne: ReceivablesPhaseOneInput;
  documents: readonly ReceivablesEvidenceDocument[];
}): {patch: ReceivablesSupplementPatch | null; extractedSections: string[]; omittedSections: string[]} {
  const sections: Record<string, {value: unknown}> = {};
  const fields: Array<{path: ReceivablesSupplementFieldPath; value: unknown}> = [];
  const evidence: Record<string, unknown> = {};
  const extractedSections: string[] = [];
  const omittedSections: string[] = [];

  const cedentTable = findTable(input.documents, receivablesDocumentSupplementContract.sheets.cedent.requiredHeaders);
  const cedentRow = cedentTable?.rows.length === 1 ? cedentTable.rows[0]! : null;
  const servicingRole = cedentTable && cedentRow ? option(text(cedentTable, cedentRow, "PAPEL_SERVICING"), {
    cedente: "cedent", cedent: "cedent", terceiro: "third_party", "third party": "third_party",
    compartilhado: "shared", shared: "shared",
  }) : null;
  if (cedentTable && cedentRow && servicingRole && text(cedentTable, cedentRow, "CEDENTE_ID") && text(cedentTable, cedentRow, "RAZAO_SOCIAL")) {
    sections.cedent = {value: {id: text(cedentTable, cedentRow, "CEDENTE_ID"), legalName: text(cedentTable, cedentRow, "RAZAO_SOCIAL"), servicingRole}};
    evidence.cedentAndServicing = [sheetEvidence(cedentTable, "CEDENTE_ID")];
    extractedSections.push("cedent");
  } else omittedSections.push("cedent");

  const titleTable = findTable(input.documents, receivablesDocumentSupplementContract.sheets.titles.requiredHeaders);
  const sourceByExternalId = new Map<string, string[]>();
  for (const receivable of input.phaseOne.universe.receivables) {
    if (!receivable.externalId) continue;
    sourceByExternalId.set(receivable.externalId, [...(sourceByExternalId.get(receivable.externalId) ?? []), receivable.id]);
  }
  const titleRows = titleTable?.rows.flatMap((row) => {
    if (!titleTable) return [];
    const externalId = text(titleTable, row, "NUM_TITULO");
    const sourceIds = sourceByExternalId.get(externalId) ?? [];
    const collected = money(text(titleTable, row, "VLR_RECEBIDO_PERIODO"));
    const defaulted = money(text(titleTable, row, "SALDO_INADIMPLENTE"));
    const recovered = money(text(titleTable, row, "RECUPERADO_PERIODO"));
    const dilution = money(text(titleTable, row, "DILUICAO_PERIODO"));
    const repurchased = money(text(titleTable, row, "RECOMPRA_PERIODO"));
    const substituted = money(text(titleTable, row, "SUBSTITUICAO_PERIODO"));
    const assignable = bool(text(titleTable, row, "CEDIVEL"));
    const verified = bool(text(titleTable, row, "LASTRO_VERIFICADO"));
    const registration = option(text(titleTable, row, "REGISTRO"), {registrado: "registered", registered: "registered", "nao aplicavel": "not_required", "not required": "not_required", ausente: "missing", missing: "missing", conflito: "conflict", conflict: "conflict"});
    const encumbrance = option(text(titleTable, row, "ONUS"), {livre: "free", free: "free", penhorado: "pledged", pledged: "pledged", cedido: "assigned", assigned: "assigned", desconhecido: "unknown", unknown: "unknown"});
    const disputed = bool(text(titleTable, row, "DISPUTADO"));
    const relatedParty = bool(text(titleTable, row, "PARTE_RELACIONADA"));
    const debtorSector = text(titleTable, row, "SETOR_SACADO");
    if (sourceIds.length !== 1 || !debtorSector || [collected, defaulted, recovered, dilution, repurchased, substituted, assignable, verified, registration, encumbrance, disputed, relatedParty].some((value) => value === null)) return [];
    return [{sourceReceivableId: sourceIds[0]!, debtorSector, collectedInPeriod: collected!, defaultedBalance: defaulted!, recoveredInPeriod: recovered!, dilutionInPeriod: dilution!, repurchasedInPeriod: repurchased!, substitutedInPeriod: substituted!, assignable: assignable!, evidenceVerified: verified!, registration: registration!, encumbrance: encumbrance!, disputed: disputed!, relatedParty: relatedParty!}];
  }) ?? [];
  if (titleTable && titleRows.length === titleTable.rows.length && titleRows.length === input.phaseOne.universe.receivables.length && new Set(titleRows.map((row) => row.sourceReceivableId)).size === titleRows.length) {
    sections.titles = {value: titleRows};
    const reference = sheetEvidence(titleTable, "NUM_TITULO");
    evidence.titleLegalControls = [reference];
    evidence.performanceHistory = [reference];
    extractedSections.push("titles");
  } else omittedSections.push("titles");

  const cashTable = findTable(input.documents, receivablesDocumentSupplementContract.sheets.cashReceipts.requiredHeaders);
  const cashRows = cashTable?.rows.flatMap((row) => {
    if (!cashTable) return [];
    const id = text(cashTable, row, "ID_RECEBIMENTO");
    const receivedAt = date(text(cashTable, row, "DATA_RECEBIMENTO"));
    const amount = money(text(cashTable, row, "VALOR_RECEBIMENTO"));
    const linkedAccount = bool(text(cashTable, row, "CONTA_VINCULADA"));
    const externalId = text(cashTable, row, "NUM_TITULO");
    const sourceIds = externalId ? sourceByExternalId.get(externalId) ?? [] : [];
    if (!id || !receivedAt || !amount || linkedAccount === null || (externalId && sourceIds.length !== 1)) return [];
    return [{id, receivedAt, amount, sourceReceivableId: externalId ? sourceIds[0]! : null, debtorId: text(cashTable, row, "CNPJ_SACADO").replace(/\D/g, "") || null, linkedAccount, duplicateOf: text(cashTable, row, "DUPLICADO_DE") || null, sourceDocumentId: cashTable.document.id, sourceAnchor: `sheet:${cashTable.sheet};row:${row.row};key:${id}`, anchorVerified: true}];
  }) ?? [];
  if (cashTable && cashRows.length > 0 && cashRows.length === cashTable.rows.length && new Set(cashRows.map((row) => row.id)).size === cashRows.length) {
    sections.cashReceipts = {value: cashRows};
    evidence.cashReconciliation = [sheetEvidence(cashTable, "ID_RECEBIMENTO")];
    extractedSections.push("cashReceipts");
  } else omittedSections.push("cashReceipts");

  const accountingTable = findTable(input.documents, receivablesDocumentSupplementContract.sheets.accounting.requiredHeaders);
  const accountingRow = accountingTable?.rows.length === 1 ? accountingTable.rows[0]! : null;
  const accounting = accountingTable && accountingRow ? {
    grossReceivablesBalance: money(text(accountingTable, accountingRow, "SALDO_CONTAS_A_RECEBER")),
    allowanceBalance: money(text(accountingTable, accountingRow, "PROVISAO")),
    reportedCollectionsInPeriod: money(text(accountingTable, accountingRow, "RECEBIMENTOS_PERIODO")),
  } : null;
  if (accountingTable && accounting && Object.values(accounting).every((value) => value !== null)) {
    sections.accounting = {value: accounting};
    evidence.accountingReconciliation = [sheetEvidence(accountingTable, "SALDO_CONTAS_A_RECEBER")];
    extractedSections.push("accounting");
  } else omittedSections.push("accounting");

  const policyContract = receivablesDocumentSupplementContract.sheets.policy;
  const policyTable = findTable(input.documents, policyContract.requiredHeaders, policyContract.name);
  if (policyTable) {
    const parsed = governedFields(policyTable, policyContract.inputs);
    fields.push(...parsed.fields);
    omittedSections.push(...parsed.invalid.map((key) => `policy.${key}`));
    if (parsed.fields.length > 0) {
      evidence.eligibilityPolicy = [sheetEvidence(policyTable, "CAMPO")];
      extractedSections.push("policy");
    } else omittedSections.push("policy");
  } else omittedSections.push("policy");

  const structureContract = receivablesDocumentSupplementContract.sheets.structure;
  const structureTable = findTable(input.documents, structureContract.requiredHeaders, structureContract.name);
  if (structureTable) {
    const parsed = governedFields(structureTable, structureContract.inputs);
    fields.push(...parsed.fields);
    omittedSections.push(...parsed.invalid.map((key) => `structure.${key}`));
    if (parsed.fields.length > 0) {
      evidence.facilityAndWaterfall = [sheetEvidence(structureTable, "CAMPO")];
      extractedSections.push("structure");
    } else omittedSections.push("structure");
  } else omittedSections.push("structure");

  if (Object.keys(sections).length === 0 && fields.length === 0) return {patch: null, extractedSections, omittedSections};
  const suppliedEvidence = Object.values(evidence).flat() as Array<{sourceClass: "provided_document"; sourceId: string; anchor: string}>;
  const contentFingerprint = createHash("sha256").update(stable({sourceDatasetHash: input.phaseOne.datasetHash, sections, fields, evidence})).digest("hex");
  const patch = receivablesSupplementPatchSchema.parse({
    schemaVersion: "2026.09.07-v1",
    patchId: `document-adapter:${contentFingerprint}`,
    sourceDatasetHash: input.phaseOne.datasetHash,
    suppliedBy: {actorType: "document_worker", actorId: "receivables-document-adapter:2026.09.10-v2", suppliedAt: `${input.phaseOne.universe.dates.reportingDate}T00:00:00.000Z`, evidence: suppliedEvidence},
    sections, fields, evidence,
  });
  return {patch, extractedSections, omittedSections};
}

/** Preserve successor revisions on refresh: an already stored document patch
 * must not be replayed against the newer user-premise draft. */
export function prepareReceivablesDocumentSupplement(input: {
  phaseOne: ReceivablesPhaseOneInput;
  documents: readonly ReceivablesEvidenceDocument[];
  storedDraft?: ReceivablesSupplementDraft | undefined;
}) {
  const baseDraft = input.storedDraft?.sourceDatasetHash === input.phaseOne.datasetHash
    ? input.storedDraft : newReceivablesSupplementDraft(input.phaseOne.datasetHash);
  const extracted = buildReceivablesDocumentSupplementPatch(input);
  const patch = extracted.patch && !baseDraft.appliedPatchIds.includes(extracted.patch.patchId)
    ? extracted.patch : null;
  const nextDraft = patch ? applyReceivablesSupplementPatch({draft: baseDraft, patch}) : baseDraft;
  return {...extracted, patch, nextDraft};
}
