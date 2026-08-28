import {createHash} from "node:crypto";

import type {DocumentLayer, LayerTable} from "@offroad/document-intelligence";

import {caseChunkSchema, type CaseChunk} from "./schema";

export const governedRetrievalVersion = "2026.08.24-v1";

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
      anchor: {kind: "sheet", id: `s${sheet.name}`, sheet: sheet.name},
      text: [
        ...sheet.cells.map((cell) => `${cell.ref}: ${cell.v === null ? "" : String(cell.v)}`),
        ...sheet.tables.flatMap(tableText),
      ].join("\n"),
      tags: ["sheet", sheet.hidden ? "hidden" : "visible"],
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

  // Operational tapes contain millions of characters in a single sheet. Use the database's
  // governed maximum so the same evidence is preserved with fewer rows, audits and GIN entries.
  // Explicit smaller values remain available to callers and tests that need finer passages.
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
