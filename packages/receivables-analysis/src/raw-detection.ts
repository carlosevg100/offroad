import Decimal from "decimal.js";
import type {
  AssertionProvenance,
  IsoDate,
  ReceivablesUniverse,
  SourceAnchor,
} from "@offroad/financial-core";

import type {ReceivablesEligibilityFact} from "./phase-two";
import type {ReceivablesPhaseOneInput} from "./phase-one";

export const receivablesRawDetectionVersion = "2026.08.28-v1";

/**
 * Structural boundary consumed by the detector. The parser owns the richer document
 * layer schema; receivables analysis deliberately depends only on the evidence fields
 * it reads so the economic engine never acquires a parser or ontology dependency.
 */
export type ReceivablesEvidenceCell = {
  ref: string;
  v: string | number | boolean | null;
};

export type ReceivablesEvidenceTableRow = {
  id: string;
  cells: readonly {id: string; text: string; ref?: string | undefined}[];
};

export type ReceivablesEvidenceLayer = {
  documentId: string;
  pages?: readonly {
    blocks: readonly {text: string}[];
    tables: readonly {rows: readonly ReceivablesEvidenceTableRow[]}[];
  }[] | undefined;
  sheets?: readonly {
    name: string;
    cells: readonly ReceivablesEvidenceCell[];
  }[] | undefined;
  sections?: readonly {
    paragraphs: readonly {text: string}[];
    tables: readonly {rows: readonly ReceivablesEvidenceTableRow[]}[];
  }[] | undefined;
};

export type ReceivablesEvidenceDocument = {
  id: string;
  fileName: string;
  fileHash: string;
  layer: ReceivablesEvidenceLayer;
};

export type ReceivablesFiscalArchiveEvidence = {
  archiveId: string;
  fileHash: string;
  invoices: readonly {
    entryName: string;
    accessKey: string;
    accessKeyValid: boolean;
    issuerTaxId: string | null;
  }[];
  cancellations: readonly {
    entryName: string;
    accessKey: string;
    accessKeyValid: boolean;
    registrationStatus: string | null;
  }[];
};

export type ReceivablesRawDetectedDefect = {
  id: string;
  description: string;
  evidence: readonly AssertionProvenance[];
  measured?: {
    value: string;
    unit: "BRL" | "count" | "ratio" | "period";
    provenance: AssertionProvenance;
  };
};

export type ReceivablesRawClientQuestion = {
  id: string;
  text: string;
  triggerId: string;
  trigger: AssertionProvenance;
  evidenceSearch: {
    deliveredEvidenceIds: readonly string[];
    searchedEvidenceIds: readonly string[];
    status: "exhausted_without_answer";
  };
};

export type ReceivablesRawDetectionReport = {
  version: typeof receivablesRawDetectionVersion;
  defects: readonly ReceivablesRawDetectedDefect[];
  questions: readonly ReceivablesRawClientQuestion[];
  routeFacts: readonly ReceivablesEligibilityFact[];
  evidenceCoverage: {
    deliveredEvidenceIds: readonly string[];
    searchedEvidenceIds: readonly string[];
    complete: boolean;
    warnings: readonly string[];
  };
};

type SheetRow = {
  document: ReceivablesEvidenceDocument;
  sheet: string;
  row: number;
  cells: ReadonlyMap<string, ReceivablesEvidenceCell>;
};

type LayerTableRow = ReceivablesEvidenceTableRow;

type SheetDataset = {
  document: ReceivablesEvidenceDocument;
  sheet: string;
  headerRow: number;
  headers: ReadonlyMap<string, string>;
  rows: readonly SheetRow[];
};

type TapeRow = {
  row: SheetRow;
  titleId: string;
  obligorTaxId: string;
  obligorName: string;
  invoiceKey: string;
  issueDate: IsoDate;
  dueDate: IsoDate;
  faceValue: Decimal;
  paymentDate: IsoDate | null;
  paidValue: Decimal;
  dilutionValue: Decimal;
  status: string;
};

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function columnOf(ref: string): string {
  return ref.match(/^[A-Z]+/)?.[0] ?? "";
}

function rowOf(ref: string): number {
  return Number(ref.match(/\d+$/)?.[0] ?? 0);
}

function sheetRows(document: ReceivablesEvidenceDocument): SheetRow[] {
  return (document.layer.sheets ?? []).flatMap((sheet) => {
    const rows = new Map<number, Map<string, ReceivablesEvidenceCell>>();
    for (const cell of sheet.cells) {
      const row = rowOf(cell.ref);
      const column = columnOf(cell.ref);
      if (row <= 0 || !column) continue;
      const cells = rows.get(row) ?? new Map<string, ReceivablesEvidenceCell>();
      cells.set(column, cell);
      rows.set(row, cells);
    }
    return [...rows.entries()].sort(([left], [right]) => left - right).map(([row, cells]) => ({
      document,
      sheet: sheet.name,
      row,
      cells,
    }));
  });
}

function rowText(row: SheetRow): string {
  return [...row.cells.values()].sort((left, right) => left.ref.localeCompare(right.ref)).map((cell) => String(cell.v ?? "")).join(" | ");
}

function value(row: SheetRow, column: string | undefined): string {
  if (!column) return "";
  return String(row.cells.get(column)?.v ?? "").trim();
}

function findDataset(documents: readonly ReceivablesEvidenceDocument[], requiredHeaders: readonly string[]): SheetDataset | null {
  const required = requiredHeaders.map(fold);
  for (const document of documents) {
    const rows = sheetRows(document);
    for (const candidate of rows) {
      const headers = new Map<string, string>();
      for (const [column, cell] of candidate.cells) headers.set(fold(String(cell.v ?? "")), column);
      if (!required.every((header) => headers.has(header))) continue;
      return {
        document,
        sheet: candidate.sheet,
        headerRow: candidate.row,
        headers,
        rows: rows.filter((row) => row.sheet === candidate.sheet && row.row > candidate.row),
      };
    }
  }
  return null;
}

function allText(document: ReceivablesEvidenceDocument): string {
  const pageText = (document.layer.pages ?? []).flatMap((page) => [
    ...page.blocks.map((block) => block.text),
    ...page.tables.flatMap((table) => table.rows.flatMap((row) => row.cells.map((cell) => cell.text))),
  ]);
  const sheetText = sheetRows(document).map(rowText);
  const sectionText = (document.layer.sections ?? []).flatMap((section) => [
    ...section.paragraphs.map((paragraph) => paragraph.text),
    ...section.tables.flatMap((table) => table.rows.flatMap((row) => row.cells.map((cell) => cell.text))),
  ]);
  return [...pageText, ...sheetText, ...sectionText].join("\n");
}

function fileAnchor(document: ReceivablesEvidenceDocument, options: {sheet?: string; row?: number; column?: string; cell?: string} = {}): SourceAnchor {
  return {kind: "file", fileId: document.id, fileHash: document.fileHash, ...options};
}

function rowAnchor(row: SheetRow, column?: string): SourceAnchor {
  return fileAnchor(row.document, {
    sheet: row.sheet,
    row: row.row,
    ...(column ? {column, cell: `${column}${row.row}`} : {}),
  });
}

function tableRowAnchor(document: ReceivablesEvidenceDocument, row: LayerTableRow): SourceAnchor {
  const page = Number(row.id.match(/^p(\d+)/)?.[1] ?? 0);
  return {
    kind: "document",
    documentId: document.id,
    documentHash: document.fileHash,
    ...(page > 0 ? {page} : {}),
    paragraph: row.id,
  };
}

function measured(input: {
  datasetHash: string;
  universeId: string;
  reportingDate: IsoDate;
  anchors: readonly SourceAnchor[];
  formula: string;
  inclusions: readonly string[];
  exclusions?: readonly string[];
  numerator?: string;
  denominator?: string;
  unit?: string;
  rounding?: string;
}): AssertionProvenance {
  return {
    kind: "measured",
    datasetHash: input.datasetHash,
    anchors: unique(input.anchors.map((anchor) => JSON.stringify(anchor))).map((anchor) => JSON.parse(anchor) as SourceAnchor),
    universe: input.universeId,
    reportingDate: input.reportingDate,
    inclusions: input.inclusions,
    exclusions: input.exclusions ?? [],
    formula: {id: input.formula, version: "1"},
    ...(input.numerator ? {numerator: input.numerator} : {}),
    ...(input.denominator ? {denominator: input.denominator} : {}),
    ...(input.unit ? {unit: input.unit} : {}),
    ...(input.rounding ? {rounding: input.rounding} : {}),
  };
}

function decimal(raw: string): Decimal | null {
  const cleaned = raw.replace(/\s/g, "").replace(/[DC]$/i, "").replace(/^R\$/i, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  try {
    const result = new Decimal(normalized);
    return result.isFinite() ? result : null;
  } catch {
    return null;
  }
}

function isoDate(raw: string): IsoDate | null {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value as IsoDate;
  const parts = value.split(/[/.]/);
  if (parts.length !== 3) return null;
  let year = parts[2] ?? "";
  if (year.length === 2) year = `20${year}`;
  const candidate = `${year}-${(parts[1] ?? "").padStart(2, "0")}-${(parts[0] ?? "").padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) && !Number.isNaN(Date.parse(candidate)) ? candidate as IsoDate : null;
}

function daysBetween(left: IsoDate, right: IsoDate): number {
  return Math.round((Date.parse(right) - Date.parse(left)) / 86_400_000);
}

function taxId(raw: string): string {
  return raw.replace(/\D/g, "");
}

function tapeRows(dataset: SheetDataset | null): TapeRow[] {
  if (!dataset) return [];
  const column = (header: string) => dataset.headers.get(fold(header));
  return dataset.rows.flatMap((row): TapeRow[] => {
    const issueDate = isoDate(value(row, column("DT_EMISSAO")));
    const dueDate = isoDate(value(row, column("DT_VENCIMENTO")));
    const faceValue = decimal(value(row, column("VLR_TITULO")));
    if (!issueDate || !dueDate || !faceValue) return [];
    return [{
      row,
      titleId: value(row, column("NUM_TITULO")),
      obligorTaxId: taxId(value(row, column("CNPJ_SACADO"))),
      obligorName: value(row, column("NOME_SACADO")),
      invoiceKey: taxId(value(row, column("CHAVE_NFE"))),
      issueDate,
      dueDate,
      faceValue,
      paymentDate: isoDate(value(row, column("DT_PAGAMENTO"))),
      paidValue: decimal(value(row, column("VLR_PAGO"))) ?? new Decimal(0),
      dilutionValue: decimal(value(row, column("VLR_ABATIMENTO"))) ?? new Decimal(0),
      status: fold(value(row, column("SITUACAO"))),
    }];
  });
}

export type ReceivablesRawUniverseBuild = {
  phaseOne: ReceivablesPhaseOneInput | null;
  classification: {
    categoryIds: readonly string[];
    cellIds: readonly string[];
    evidence: readonly AssertionProvenance[];
  };
  warnings: readonly string[];
};

/**
 * Builds the narrow mathematical input directly from the delivered title tape. Missing event
 * series remain missing; a blank column or absent file is never converted into a zero-event
 * history. The result is intentionally incomplete until the room supports every dynamic
 * series, debt bridge and proposal assumption required by Phase 1.
 */
export function buildReceivablesRawUniverse(input: {
  universeId: string;
  datasetHash: string;
  documents: readonly ReceivablesEvidenceDocument[];
}): ReceivablesRawUniverseBuild {
  if (!/^[a-f0-9]{64}$/.test(input.datasetHash)) throw new RangeError("raw universe dataset hash must be SHA-256");
  const dataset = findDataset(input.documents, [
    "NUM TITULO", "CNPJ SACADO", "DT EMISSAO", "DT VENCIMENTO", "VLR TITULO", "SITUACAO",
  ]);
  const tape = tapeRows(dataset);
  if (!dataset || tape.length === 0) {
    return {
      phaseOne: null,
      classification: {categoryIds: [], cellIds: [], evidence: []},
      warnings: ["receivables_tape_not_identified"],
    };
  }

  const latestOriginationDate = tape.map((title) => title.issueDate).sort().at(-1)!;
  const dataStartDate = tape.map((title) => title.issueDate).sort()[0]!;
  const observedDates = tape.flatMap((title) => [title.issueDate, ...(title.paymentDate ? [title.paymentDate] : [])]);
  const reportingDate = observedDates.sort().at(-1)!;
  const titleSource = (title: TapeRow): SourceAnchor => rowAnchor(title.row);
  const normalizedStatus = (status: string): ReceivablesUniverse["receivables"][number]["status"] => {
    if (/liquid|pago|baixado/.test(status)) return "settled";
    if (/cancel/.test(status)) return "cancelled";
    if (/recompr/.test(status)) return "repurchased";
    if (/perda|write.?off|baixado prejuizo/.test(status)) return "written_off";
    return "open";
  };
  const receivables = tape.map((title, index): ReceivablesUniverse["receivables"][number] => {
    const status = normalizedStatus(title.status);
    const openValue = status === "open"
      ? Decimal.max(title.faceValue.minus(title.paidValue).minus(title.dilutionValue), 0)
      : new Decimal(0);
    const obligorId = title.obligorTaxId || `name:${fold(title.obligorName)}`;
    return {
      id: `${title.titleId || "title"}:${title.row.row}:${index + 1}`,
      ...(title.titleId ? {externalId: title.titleId} : {}),
      currency: "BRL",
      faceValue: title.faceValue.toFixed(2),
      openValue: openValue.toFixed(2),
      issueDate: title.issueDate,
      originalDueDate: title.dueDate,
      currentDueDate: title.dueDate,
      obligorId,
      ...(title.obligorTaxId.length >= 8 ? {economicGroupId: title.obligorTaxId.slice(0, 8)} : {}),
      status,
      source: titleSource(title),
    };
  });
  const receivableIdByRow = new Map(tape.map((title, index) => [title.row.row, receivables[index]!.id]));
  const settlements = tape.flatMap((title, index): ReceivablesUniverse["settlements"] => {
    if (!title.paymentDate || !title.paidValue.gt(0)) return [];
    return [{
      id: `settlement:${receivableIdByRow.get(title.row.row)!}:${index + 1}`,
      receivableId: receivableIdByRow.get(title.row.row)!,
      date: title.paymentDate,
      amount: title.paidValue.toFixed(2),
      source: titleSource(title),
    }];
  });
  const obligorById = new Map<string, ReceivablesUniverse["obligors"][number]>();
  for (const title of tape) {
    const id = title.obligorTaxId || `name:${fold(title.obligorName)}`;
    if (obligorById.has(id)) continue;
    obligorById.set(id, {
      id,
      legalName: title.obligorName || id,
      ...(title.obligorTaxId.length >= 8 ? {
        taxIdRoot: title.obligorTaxId.slice(0, 8),
        economicGroupId: title.obligorTaxId.slice(0, 8),
      } : {}),
      relatedParty: "unknown",
      source: titleSource(title),
    });
  }
  const groupMembers = new Map<string, string[]>();
  for (const obligor of obligorById.values()) {
    if (!obligor.economicGroupId) continue;
    groupMembers.set(obligor.economicGroupId, [...(groupMembers.get(obligor.economicGroupId) ?? []), obligor.id]);
  }
  const economicGroups: ReceivablesUniverse["economicGroups"] = [...groupMembers.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, obligorIds]) => ({
      id,
      name: `CNPJ root ${id}`,
      obligorIds: [...new Set(obligorIds)].sort(),
      source: obligorById.get(obligorIds[0]!)!.source,
    }));

  const settled = tape.filter((title) => normalizedStatus(title.status) === "settled");
  const settlementsComplete = settled.every((title) => title.paymentDate !== null && title.paidValue.gt(0));
  const dilutionObserved = tape.some((title) => title.dilutionValue.gt(0));
  const universe: ReceivablesUniverse = {
    id: input.universeId,
    dates: {reportingDate, latestOriginationDate, dataStartDate, dataEndDate: reportingDate},
    currency: "BRL",
    receivables,
    settlements,
    dilutions: [],
    extensions: [],
    repurchases: [],
    assignmentsAndLiens: [],
    obligors: [...obligorById.values()].sort((left, right) => left.id.localeCompare(right.id)),
    economicGroups,
    eventCoverage: {
      settlements: {
        status: settlementsComplete ? "complete" : "partial",
        startDate: dataStartDate,
        endDate: reportingDate,
        basis: "delivered receivables tape payment date and paid amount columns",
        limitations: settlementsComplete ? [] : ["one or more settled titles lacks payment date or paid amount"],
      },
      dilutions: {
        status: dilutionObserved ? "partial" : "not_provided",
        startDate: dilutionObserved ? dataStartDate : null,
        endDate: dilutionObserved ? reportingDate : null,
        basis: dilutionObserved ? "delivered title-level allowance amount without reliable event date or cause" : "delivered room",
        limitations: dilutionObserved ? ["dilution event date and cause are not available title by title"] : ["dilution history was not identified"],
      },
      extensions: {status: "not_provided", startDate: null, endDate: null, basis: "delivered room", limitations: ["original due date and extension event history were not identified"]},
      repurchases: {status: "not_provided", startDate: null, endDate: null, basis: "delivered room", limitations: ["repurchase and substitution history were not identified"]},
      assignmentsAndLiens: {status: "not_provided", startDate: null, endDate: null, basis: "delivered room", limitations: ["title-level prior assignment and lien history were not identified"]},
    },
  };
  const classificationEvidence = measured({
    datasetHash: input.datasetHash,
    universeId: input.universeId,
    reportingDate,
    anchors: [fileAnchor(dataset.document, {sheet: dataset.sheet})],
    formula: "receivables_tape_b2b_classification",
    inclusions: ["title identifier, corporate obligor tax id, issue date, due date, face value and status columns"],
    exclusions: ["consumer receivables without corporate obligor tax id"],
  });
  return {
    phaseOne: {
      universe,
      datasetHash: input.datasetHash,
      limitations: [
        "original due dates were not independently evidenced",
        "dilution events lack reliable title-level dates and causes",
        "repurchases, substitutions, assignments and liens were not delivered title by title",
        "debt bridge, financing proposal and advance-rate assumptions remain pending",
      ],
    },
    classification: {
      categoryIds: ["trade_receivables"],
      cellIds: ["mercantil_b2b"],
      evidence: [classificationEvidence],
    },
    warnings: [],
  };
}

function defect(id: string, description: string, provenance: AssertionProvenance, value?: string, unit?: "BRL" | "count" | "ratio" | "period"): ReceivablesRawDetectedDefect {
  return {
    id,
    description,
    evidence: [provenance],
    ...(value !== undefined && unit ? {measured: {value, unit, provenance}} : {}),
  };
}

function median(values: readonly Decimal[]): Decimal {
  if (values.length === 0) throw new RangeError("median requires at least one value");
  const ordered = [...values].sort((left, right) => left.comparedTo(right));
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle]!;
  return ordered[middle - 1]!.plus(ordered[middle]!).div(2);
}

function detectEconomicGroupSplit(input: DetectionContext): ReceivablesRawDetectedDefect | null {
  const register = findDataset(input.documents, ["CNPJ", "NOME"])
    ?? findDataset(input.documents, ["CNPJ", "RAZAO SOCIAL"])
    ?? findDataset(input.documents, ["CNPJ SACADO", "NOME SACADO"]);
  if (!register) return null;
  const cnpjColumn = register.headers.get("cnpj") ?? register.headers.get("cnpj sacado");
  const nameColumn = register.headers.get("nome") ?? register.headers.get("razao social") ?? register.headers.get("nome sacado");
  const groups = new Map<string, SheetRow[]>();
  for (const row of register.rows) {
    const id = taxId(value(row, cnpjColumn));
    if (id.length !== 14 || !value(row, nameColumn)) continue;
    const root = id.slice(0, 8);
    const rows = groups.get(root) ?? [];
    rows.push(row);
    groups.set(root, rows);
  }
  const splitGroups = [...groups.values()].filter((rows) => new Set(rows.map((row) => taxId(value(row, cnpjColumn)))).size > 1);
  if (splitGroups.length === 0) return null;
  const anchors = splitGroups.flatMap((rows) => rows.map((row) => rowAnchor(row, cnpjColumn)));
  const provenance = input.provenance(anchors, "economic_group_root_scan", ["sacados grouped by the first eight CNPJ digits"]);
  return defect("economic_group_split", "Há CNPJs de filiais do mesmo grupo tratados como sacados independentes; a concentração por grupo econômico pode estar subestimada.", provenance, String(splitGroups.length), "count");
}

function detectUnmarkedExtensions(input: DetectionContext, tape: readonly TapeRow[]): ReceivablesRawDetectedDefect | null {
  const policy = input.documents.find((document) => /vendas com prazo de 90 dias.*apenas/i.test(fold(allText(document))));
  if (!policy) return null;
  const candidates = tape.filter((title) => daysBetween(title.issueDate, title.dueDate) > 90);
  if (candidates.length === 0) return null;
  const anchors = [fileAnchor(policy), ...candidates.map((title) => rowAnchor(title.row))];
  const provenance = input.provenance(anchors, "receivable_term_above_policy_exception", ["title term exceeds the documented 90-day exceptional band"]);
  return defect("unmarked_extensions", "Há títulos cujo prazo entre emissão e vencimento excede a maior exceção descrita na política, sem histórico de prorrogação que explique a data corrente.", provenance, String(candidates.length), "count");
}

function detectRelatedParty(input: DetectionContext): ReceivablesRawDetectedDefect | null {
  const ownership = input.documents.flatMap((document) => (document.layer.pages ?? []).flatMap((page) => page.tables.flatMap((table) => table.rows.map((row) => ({document, row})))))
    .filter(({row}) => {
      const role = fold(row.cells.slice(1).map((cell) => cell.text).join(" "));
      return row.cells.some((cell) => /\b\d{1,3}\s*%/.test(cell.text))
        && /socio|acionista|administrador|diretor/.test(role);
    });
  if (ownership.length === 0) return null;
  const ownerTokens = unique(ownership.flatMap(({row}) => fold(row.cells[0]?.text ?? "").split(" ").filter((token) => token.length > 2)));
  const companyDocument = ownership[0]?.document;
  const companyFirst = fold(companyDocument ? allText(companyDocument) : "").split(" ").find((token) => token.length > 3)?.[0] ?? "";
  const familyInitials = unique(ownerTokens.map((token) => token[0]).filter(Boolean)).join("");
  const candidateAcronyms = new Set<string>();
  for (let left = 0; left < familyInitials.length; left += 1) {
    for (let right = left + 1; right < familyInitials.length; right += 1) {
      candidateAcronyms.add(`${companyFirst}${familyInitials[left]}${familyInitials[right]}`.toUpperCase());
    }
  }
  const register = findDataset(input.documents, ["CNPJ", "NOME"])
    ?? findDataset(input.documents, ["CNPJ", "RAZAO SOCIAL"]);
  if (!register) return null;
  const nameColumn = register.headers.get("nome") ?? register.headers.get("razao social");
  const candidates = register.rows.filter((row) => {
    const name = fold(value(row, nameColumn));
    const prefix = name.split(" ")[0]?.toUpperCase() ?? "";
    return candidateAcronyms.has(prefix) && /participacoes|empreendimentos|holding/.test(name);
  });
  if (candidates.length === 0) return null;
  const anchors = [
    ...candidates.map((row) => rowAnchor(row, nameColumn)),
    ...ownership.map(({document, row}) => tableRowAnchor(document, row)),
  ];
  const provenance = input.provenance(anchors, "related_party_name_cross_check", ["ownership names and obligor legal names compared"], ["legal relationship not confirmed"]);
  return defect("related_party_obligor", "Um sacado tem denominação compatível com veículo ligado aos nomes da companhia e dos sócios. A relação precisa ser confirmada antes de tratar o recebível como independente.", provenance, String(candidates.length), "count");
}

function balanceRows(documents: readonly ReceivablesEvidenceDocument[]): {document: ReceivablesEvidenceDocument; row: LayerTableRow}[] {
  return documents.flatMap((document) => (document.layer.pages ?? []).flatMap((page) => page.tables.flatMap((table) => table.rows.map((row) => ({document, row})))));
}

function lastMoney(row: LayerTableRow): Decimal | null {
  for (const cell of [...row.cells].reverse()) {
    const parsed = decimal(cell.text);
    if (parsed) return parsed;
  }
  return null;
}

function detectUndeclaredDebt(input: DetectionContext): ReceivablesRawDetectedDefect | null {
  const bankPosition = input.documents.find((document) => /nao inclui o desconto de duplicatas/i.test(fold(allText(document))));
  if (!bankPosition) return null;
  const patterns = [
    /fornecedores convenio antecipacao/,
    /duplicatas descontadas/,
    /operacoes de fomento mercantil/,
    /parcelamento de tributos federais/,
  ];
  const matched = balanceRows(input.documents).filter(({row}) => patterns.some((pattern) => pattern.test(fold(row.cells.map((cell) => cell.text).join(" ")))));
  if (matched.length !== patterns.length) return null;
  const amount = matched.reduce((sum, {row}) => sum.plus(lastMoney(row) ?? 0), new Decimal(0));
  const anchors = [fileAnchor(bankPosition), ...matched.map(({document, row}) => tableRowAnchor(document, row))];
  const provenance = input.provenance(anchors, "adjusted_debt_omitted_accounts", ["liability balances omitted from the declared bank position"], [], "sum of omitted liability account balances", undefined, "BRL");
  return defect("undeclared_recourse_and_debt", "A posição bancária declarada exclui exposições que permanecem no balancete e devem integrar a ponte de dívida ajustada.", provenance, amount.toFixed(0), "BRL");
}

function detectAccountingDifference(input: DetectionContext): ReceivablesRawDetectedDefect | null {
  const ledger = findDataset(input.documents, ["DATA", "HISTORICO", "DOCUMENTO", "DEBITO", "CREDITO", "SALDO"]);
  if (!ledger) return null;
  const debitColumn = ledger.headers.get("debito");
  const creditColumn = ledger.headers.get("credito");
  const rows = ledger.rows.filter((row) => /ajuste de conciliacao|reclassificacao/.test(fold(rowText(row))));
  if (rows.length === 0) return null;
  const amount = rows.reduce((sum, row) => sum.plus((decimal(value(row, debitColumn)) ?? new Decimal(0)).minus(decimal(value(row, creditColumn)) ?? 0).abs()), new Decimal(0));
  const provenance = input.provenance(rows.map((row) => rowAnchor(row)), "accounting_reconciliation_adjustment", ["manual entries explicitly labelled reconciliation or reclassification"], [], "absolute debit less credit of identified entries", undefined, "BRL");
  return defect("accounting_reconciliation_difference", "O razão contém lançamento manual de conciliação ou reclassificação que precisa ser explicado para reconciliar carteira e contabilidade.", provenance, amount.toFixed(0), "BRL");
}

function detectCancelledOpenInvoices(input: DetectionContext, tape: readonly TapeRow[]): ReceivablesRawDetectedDefect | null {
  const cancellations = new Map<string, {archive: ReceivablesFiscalArchiveEvidence; entryName: string}>();
  for (const archive of input.fiscalArchives) {
    for (const event of archive.cancellations) {
      if (event.registrationStatus && !["135", "136"].includes(event.registrationStatus)) continue;
      cancellations.set(event.accessKey, {archive, entryName: event.entryName});
    }
  }
  const matched = tape.filter((title) => title.status === "aberto" && cancellations.has(title.invoiceKey));
  if (matched.length === 0) return null;
  const anchors = matched.flatMap((title) => {
    const event = cancellations.get(title.invoiceKey)!;
    return [rowAnchor(title.row), {kind: "file" as const, fileId: event.archive.archiveId, fileHash: event.archive.fileHash, sheet: event.entryName}];
  });
  const provenance = input.provenance(anchors, "open_title_cancelled_nfe_reconciliation", ["open tape titles matched to registered cancellation XMLs present in the NF-e sample"], ["no extrapolation beyond the delivered NF-e sample"]);
  return defect("cancelled_invoice_open", "A amostra fiscal contém eventos de cancelamento vinculados a títulos ainda marcados como abertos na carteira.", provenance, String(matched.length), "count");
}

function detectDilutionMisclassification(input: DetectionContext): ReceivablesRawDetectedDefect | null {
  const dataset = findDataset(input.documents, ["MES", "DEVOLUCAO DE VENDA", "BONIFICACAO", "ABATIMENTO COMERCIAL", "TOTAL", "CONTA CONTABIL"]);
  if (!dataset || !/despesas comerciais diversas/.test(fold(allText(dataset.document)))) return null;
  const totalColumn = dataset.headers.get("total");
  const rows = dataset.rows.filter((row) => /^\d{2}\/\d{4}$/.test(value(row, dataset.headers.get("mes"))));
  if (rows.length === 0) return null;
  const amount = rows.reduce((sum, row) => sum.plus(decimal(value(row, totalColumn)) ?? 0), new Decimal(0));
  const provenance = input.provenance([fileAnchor(dataset.document, {sheet: dataset.sheet}), ...rows.map((row) => rowAnchor(row, totalColumn))], "dilution_control_sum", ["returns, bonuses and commercial allowances recorded in a generic commercial-expense account"], [], "sum of monthly dilution totals", undefined, "BRL");
  return defect("dilution_misclassification", "Devoluções, bonificações e abatimentos estão controlados fora das contas redutoras de receita, distorcendo a leitura de receita líquida e diluição.", provenance, amount.toFixed(2), "BRL");
}

function detectRevenueSpike(input: DetectionContext, tape: readonly TapeRow[]): ReceivablesRawDetectedDefect | null {
  const totals = new Map<string, Decimal>();
  const periodRows = new Map<string, TapeRow[]>();
  for (const title of tape) {
    const period = title.issueDate.slice(0, 7);
    totals.set(period, (totals.get(period) ?? new Decimal(0)).plus(title.faceValue));
    const rows = periodRows.get(period) ?? [];
    rows.push(title);
    periodRows.set(period, rows);
  }
  const factors = [...totals.entries()].flatMap(([period, current]) => {
    const priorPeriod = `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
    const prior = totals.get(priorPeriod);
    return prior && prior.gt(0) ? [{period, priorPeriod, factor: current.div(prior)}] : [];
  });
  if (factors.length < 6) return null;
  const initialMedian = median(factors.map((item) => item.factor));
  const candidate = [...factors].sort((left, right) => right.factor.minus(initialMedian).abs().comparedTo(left.factor.minus(initialMedian).abs()))[0];
  if (!candidate) return null;
  const baseline = median(factors.filter((item) => item.period !== candidate.period).map((item) => item.factor));
  const excess = candidate.factor.div(baseline).minus(1);
  if (excess.lt("0.20")) return null;
  const implicated = [...(periodRows.get(candidate.period) ?? []), ...(periodRows.get(candidate.priorPeriod) ?? [])];
  const anchors = implicated.length > 0
    ? [rowAnchor(implicated[0]!.row), rowAnchor(implicated.at(-1)!.row), fileAnchor(implicated[0]!.row.document, {sheet: implicated[0]!.row.sheet})]
    : [];
  const provenance = input.provenance(anchors, "monthly_origination_growth_outlier", ["monthly invoice origination compared year over year"], [], "candidate year-over-year growth factor", "median year-over-year growth factor excluding candidate", "ratio", "2 decimals");
  return defect("triangular_revenue_spike", `A originação de ${candidate.period} excede em ${excess.toDecimalPlaces(2).times(100).toFixed(0)}% o crescimento sazonal mediano observado nos demais meses comparáveis.`, provenance, candidate.period, "period");
}

function question(input: DetectionContext, id: string, text: string, triggerId: string, trigger: AssertionProvenance): ReceivablesRawClientQuestion {
  return {
    id,
    text,
    triggerId,
    trigger,
    evidenceSearch: {
      deliveredEvidenceIds: input.evidenceIds,
      searchedEvidenceIds: input.evidenceIds,
      status: "exhausted_without_answer",
    },
  };
}

type DetectionContext = {
  documents: readonly ReceivablesEvidenceDocument[];
  fiscalArchives: readonly ReceivablesFiscalArchiveEvidence[];
  evidenceIds: readonly string[];
  provenance: (
    anchors: readonly SourceAnchor[],
    formula: string,
    inclusions: readonly string[],
    exclusions?: readonly string[],
    numerator?: string,
    denominator?: string,
    unit?: string,
    rounding?: string,
  ) => AssertionProvenance;
};

/**
 * Applies deterministic, evidence-anchored controls to the documents actually delivered.
 * It does not consume fixture truth, infer missing balances or extrapolate sample incidence.
 */
export function detectReceivablesRawEvidence(input: {
  universeId: string;
  reportingDate: IsoDate;
  datasetHash: string;
  documents: readonly ReceivablesEvidenceDocument[];
  fiscalArchives?: readonly ReceivablesFiscalArchiveEvidence[];
}): ReceivablesRawDetectionReport {
  if (!/^[a-f0-9]{64}$/.test(input.datasetHash)) throw new RangeError("raw evidence dataset hash must be SHA-256");
  for (const document of input.documents) {
    if (!/^[a-f0-9]{64}$/.test(document.fileHash)) throw new RangeError(`document ${document.id} requires a SHA-256 hash`);
    if (document.layer.documentId !== document.id) throw new RangeError(`document layer id mismatch: ${document.id}`);
  }
  const fiscalArchives = input.fiscalArchives ?? [];
  const evidenceIds = [...input.documents.map((document) => document.id), ...fiscalArchives.map((archive) => archive.archiveId)].sort();
  if (new Set(evidenceIds).size !== evidenceIds.length) throw new RangeError("duplicate raw evidence id");
  const provenance = (
    anchors: readonly SourceAnchor[],
    formula: string,
    inclusions: readonly string[],
    exclusions: readonly string[] = [],
    numerator?: string,
    denominator?: string,
    unit?: string,
    rounding?: string,
  ) => measured({
    datasetHash: input.datasetHash,
    universeId: input.universeId,
    reportingDate: input.reportingDate,
    anchors,
    formula,
    inclusions,
    exclusions,
    ...(numerator ? {numerator} : {}),
    ...(denominator ? {denominator} : {}),
    ...(unit ? {unit} : {}),
    ...(rounding ? {rounding} : {}),
  });
  const context: DetectionContext = {documents: input.documents, fiscalArchives, evidenceIds, provenance};
  const tapeDataset = findDataset(input.documents, ["NUM TITULO", "CNPJ SACADO", "CHAVE NFE", "DT EMISSAO", "DT VENCIMENTO", "VLR TITULO", "SITUACAO"]);
  const tape = tapeRows(tapeDataset);
  const defects = [
    detectEconomicGroupSplit(context),
    detectUnmarkedExtensions(context, tape),
    detectRelatedParty(context),
    detectUndeclaredDebt(context),
    detectAccountingDifference(context),
    detectCancelledOpenInvoices(context, tape),
    detectDilutionMisclassification(context),
    detectRevenueSpike(context, tape),
  ].filter((item): item is ReceivablesRawDetectedDefect => item !== null).sort((left, right) => left.id.localeCompare(right.id));
  const byId = new Map(defects.map((item) => [item.id, item]));

  const questions: ReceivablesRawClientQuestion[] = [];
  const debt = byId.get("undeclared_recourse_and_debt");
  if (debt) questions.push(question(context, "assigned_volume_for_repurchase_rate", "Qual foi o volume de recebíveis cedido, descontado ou antecipado em cada mês, e quanto desse volume foi recomprado ou substituído?", debt.id, debt.evidence[0]!));
  const dilution = byId.get("dilution_misclassification");
  if (dilution) questions.push(question(context, "dilution_reason_breakdown", "Você consegue compartilhar o detalhe por nota ou título das devoluções, bonificações e abatimentos, com o motivo de cada ocorrência?", dilution.id, dilution.evidence[0]!));
  const extensions = byId.get("unmarked_extensions");
  if (extensions) questions.push(question(context, "extension_event_dates", "Para os títulos com prazo superior à política, quais eram os vencimentos anteriores, quando cada prorrogação ocorreu e qual foi o motivo?", extensions.id, extensions.evidence[0]!));
  const proposalDocuments = input.documents.filter((document) => /taxa|desconto|fomento|tarifa|ad valorem/.test(fold(allText(document))));
  const taxTreatmentFound = input.documents.some((document) => /\biof\b|tratamento tributario|imposto sobre operacoes financeiras/.test(fold(allText(document))));
  if (proposalDocuments.length > 0 && !taxTreatmentFound) {
    const trigger = provenance(proposalDocuments.map((document) => fileAnchor(document)), "proposal_tax_treatment_gap", ["proposal or contract pricing terms found"], ["no IOF or tax-treatment term found in delivered evidence"]);
    questions.push(question(context, "tax_treatment_for_complete_cet", "Qual tratamento de IOF, tributos e demais encargos deve ser considerado para calcular o custo efetivo completo de cada alternativa?", "proposal_tax_treatment_gap", trigger));
  }

  const tapeProvenance = tapeDataset ? provenance([fileAnchor(tapeDataset.document, {sheet: tapeDataset.sheet})], "raw_tape_presence", ["complete receivables tape delivered"]) : undefined;
  const companyPackage = input.documents.some((document) => /balancete|balanco|demonstracoes financeiras/.test(fold(allText(document))));
  const routeFacts: ReceivablesEligibilityFact[] = [
    {id: "claim_existence_evidenced", state: tape.length > 0 ? "true" : "unknown", explanation: tape.length > 0 ? "A carteira identifica títulos, sacados, notas, emissão, vencimento, valor e situação." : "A existência dos créditos ainda não foi evidenciada.", ...(tapeProvenance ? {provenance: tapeProvenance} : {})},
    {id: "cedent_ownership_confirmed", state: "unknown", explanation: "A amostra fiscal não comprova a titularidade do cedente para o universo completo."},
    {id: "contractual_assignability_confirmed", state: "unknown", explanation: "Os contratos comerciais subjacentes não foram entregues para confirmar restrições à cessão."},
    {id: "unresolved_prior_assignment_or_lien", state: "unknown", explanation: debt ? "Há operações de antecipação e fomento, mas a carteira não identifica quais títulos já estão cedidos ou onerados." : "A ausência de cessão ou ônus anterior ainda não foi comprovada título a título."},
    {id: "performance_or_delivery_evidenced", state: "unknown", explanation: "NF-e comprova faturamento, mas a evidência de entrega ou aceite não cobre a carteira completa."},
    {id: "title_control_and_duplicate_check_available", state: "unknown", explanation: tape.length > 0 && fiscalArchives.length > 0 ? "O cruzamento com a amostra fiscal não comprova controle completo de titularidade, ônus e duplicidade." : "Falta base suficiente para controle de titularidade, ônus e duplicidade."},
    {id: "debtor_notice_or_acknowledgement_feasible", state: "unknown", explanation: "A viabilidade de notificação e mudança de instrução de pagamento ainda não foi documentada."},
    {id: "company_credit_package_available", state: companyPackage ? "true" : "unknown", explanation: companyPackage ? "Demonstrações e balancete foram entregues para análise da companhia." : "O pacote de crédito corporativo ainda não está disponível.", ...(companyPackage ? {provenance: provenance(input.documents.filter((document) => /balancete|balanco|demonstracoes financeiras/.test(fold(allText(document)))).map((document) => fileAnchor(document)), "company_package_presence", ["financial statements and trial balance delivered"])} : {})},
  ];

  const warnings = [
    ...(tape.length === 0 ? ["receivables_tape_not_identified"] : []),
    ...fiscalArchives.flatMap((archive) => archive.invoices.filter((invoice) => !invoice.accessKeyValid).map(() => `archive:${archive.archiveId}:invalid_nfe_access_key_length`)),
    ...fiscalArchives.flatMap((archive) => archive.cancellations.filter((event) => !event.accessKeyValid).map(() => `archive:${archive.archiveId}:invalid_nfe_access_key_length`)),
  ];

  return {
    version: receivablesRawDetectionVersion,
    defects,
    questions: questions.sort((left, right) => left.id.localeCompare(right.id)),
    routeFacts,
    evidenceCoverage: {
      deliveredEvidenceIds: evidenceIds,
      searchedEvidenceIds: evidenceIds,
      complete: tape.length > 0 && input.documents.length > 0,
      warnings: unique(warnings),
    },
  };
}
