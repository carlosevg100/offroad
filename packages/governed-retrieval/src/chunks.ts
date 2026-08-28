import {createHash} from "node:crypto";

import type {DocumentLayer, LayerTable} from "@offroad/document-intelligence";

import {caseChunkSchema, type CaseChunk} from "./schema";

export const governedRetrievalVersion = "2026.08.24-v1";
export const maxSemanticTabularCells = 5_000;

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildCaseChunks(input: {
  organizationId: string;
  intakeSessionId: string;
  opportunityId?: string;
  sourceDocumentId: string;
  documentVersion: number;
  sourceLabel: string;
  layer: DocumentLayer;
  locale?: "pt-BR" | "en-US" | "mixed";
  maxCharacters?: number;
}): CaseChunk[] {
  const containers: Array<{anchor: Record<string, unknown>; key: string; text: string; tags: string[]}> = [];
  const tabularCellCount = (input.layer.sheets ?? []).reduce(
    (total, sheet) => total + sheet.cells.length,
    0,
  );
  const operationalTape =
    (input.layer.kind === "spreadsheet" || input.layer.kind === "csv") &&
    tabularCellCount > maxSemanticTabularCells;

  for (const page of input.layer.pages ?? []) {
    containers.push({
      key: `p${page.n}`,
      anchor: {kind: "page", id: `p${page.n}`, page: page.n},
      text: [
        ...page.blocks.map((block) => block.text),
        ...page.tables.flatMap(tableText),
      ].join("\n"),
      tags: ["page", page.scanned ? "ocr" : "native"],
    });
  }

  for (const sheet of input.layer.sheets ?? []) {
    containers.push({
      key: `s${sheet.name}`,
      anchor: {
        kind: "sheet",
        id: `s${sheet.name}`,
        sheet: sheet.name,
        ...(operationalTape ? {representation: "schema_digest"} : {}),
      },
      text: operationalTape
        ? operationalTapeDigest({
            sourceLabel: input.sourceLabel,
            sheet,
            locale: input.locale ?? "mixed",
          })
        : [
            ...sheet.cells.map((cell) => `${cell.ref}: ${cell.v === null ? "" : String(cell.v)}`),
            ...sheet.tables.flatMap(tableText),
          ].join("\n"),
      tags: [
        "sheet",
        sheet.hidden ? "hidden" : "visible",
        ...(operationalTape ? ["operational_tape", "schema_digest", "full_evidence_preserved"] : []),
      ],
    });
  }

  for (const section of input.layer.sections ?? []) {
    containers.push({
      key: section.id,
      anchor: {kind: "section", id: section.id},
      text: [
        section.heading ?? "",
        ...section.paragraphs.map((paragraph) => paragraph.text),
        ...section.tables.flatMap(tableText),
      ].join("\n"),
      tags: ["section"],
    });
  }

  for (const slide of input.layer.slides ?? []) {
    containers.push({
      key: `sl${slide.n}`,
      anchor: {kind: "slide", id: `sl${slide.n}`, slide: slide.n},
      text: [
        ...slide.blocks.map((block) => block.text),
        ...slide.tables.flatMap(tableText),
        slide.notes ?? "",
      ].join("\n"),
      tags: ["slide"],
    });
  }

  // Narrative and ordinary tabular documents remain passage-addressable. Operational tapes are
  // represented above by a deterministic schema digest because their complete row-level evidence
  // already lives in the immutable document layer and the receivables evidence fragment. Copying
  // millions of cells into a semantic index adds no economic evidence and makes a short RPC depend
  // on GIN-indexing an entire ledger.
  const maxCharacters = input.maxCharacters ?? 12_000;
  return containers.flatMap((container) =>
    splitText(container.text, maxCharacters).flatMap((content, part) => {
      if (content.trim().length < 20) return [];
      const key = `${input.sourceDocumentId}:v${input.documentVersion}:${container.key}:${part + 1}`;
      return [caseChunkSchema.parse({
        id: key,
        source: "case",
        organizationId: input.organizationId,
        intakeSessionId: input.intakeSessionId,
        ...(input.opportunityId ? {opportunityId: input.opportunityId} : {}),
        sourceDocumentId: input.sourceDocumentId,
        documentVersion: input.documentVersion,
        content,
        contentHash: sha256(content),
        citation: {
          key,
          label: `${input.sourceLabel}, ${container.key}${part > 0 ? `, parte ${part + 1}` : ""}`,
          anchor: {...container.anchor, part: part + 1},
          sourceDocumentId: input.sourceDocumentId,
        },
        locale: input.locale ?? "mixed",
        tags: container.tags,
      })];
    }),
  );
}

function operationalTapeDigest(input: {
  sourceLabel: string;
  sheet: NonNullable<DocumentLayer["sheets"]>[number];
  locale: "pt-BR" | "en-US" | "mixed";
}): string {
  const firstPopulatedByColumn = new Map<string, {row: number; value: string}>();
  let maxRow = 0;

  for (const cell of input.sheet.cells) {
    const matched = /^([A-Z]+)(\d+)$/.exec(cell.ref.toUpperCase());
    if (!matched) continue;
    const [, column = "", rawRow = "0"] = matched;
    const row = Number(rawRow);
    if (Number.isFinite(row)) maxRow = Math.max(maxRow, row);
    if (cell.v === null || cell.v === undefined) continue;
    const value = String(cell.v).replace(/\s+/g, " ").trim();
    if (!value) continue;
    const current = firstPopulatedByColumn.get(column);
    if (!current || row < current.row) firstPopulatedByColumn.set(column, {row, value});
  }

  const fields = [...firstPopulatedByColumn.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en", {numeric: true}))
    .slice(0, 80)
    .map(([column, entry]) => `${column}: ${entry.value.slice(0, 160)}`)
    .join(" | ");

  const portuguese = input.locale !== "en-US";
  return portuguese
    ? [
        `Base operacional: ${input.sourceLabel}`,
        `Aba: ${input.sheet.name}`,
        `Escala observada: ${maxRow || "não determinada"} linhas; ${input.sheet.cells.length} células preenchidas.`,
        `Campos identificados pela primeira célula preenchida de cada coluna: ${fields || "não identificados"}.`,
        "O conteúdo linha a linha está preservado na camada documental íntegra e é consumido pelo motor determinístico de recebíveis. Este índice contém somente o mapa rastreável da base, sem duplicar a carteira como texto semântico.",
      ].join("\n")
    : [
        `Operational dataset: ${input.sourceLabel}`,
        `Sheet: ${input.sheet.name}`,
        `Observed scale: ${maxRow || "undetermined"} rows; ${input.sheet.cells.length} populated cells.`,
        `Fields identified from the first populated cell in each column: ${fields || "not identified"}.`,
        "The complete row-level content is preserved in the immutable document layer and consumed by the deterministic receivables engine. This index keeps only the traceable dataset map instead of duplicating the ledger as semantic text.",
      ].join("\n");
}

function tableText(table: LayerTable): string[] {
  return [
    ...(table.header ? [table.header.join(" | ")] : []),
    ...table.rows.map((row) => row.cells.map((cell) => cell.text).join(" | ")),
  ];
}

function splitText(value: string, maxCharacters: number): string[] {
  const normalized = value.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= maxCharacters) return [normalized];

  const lines = normalized.split(/\n+/);
  const parts: string[] = [];
  let current = "";
  for (const line of lines) {
    if (line.length > maxCharacters) {
      if (current) parts.push(current);
      current = "";
      for (let offset = 0; offset < line.length; offset += maxCharacters) {
        parts.push(line.slice(offset, offset + maxCharacters));
      }
      continue;
    }
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxCharacters) {
      parts.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}
