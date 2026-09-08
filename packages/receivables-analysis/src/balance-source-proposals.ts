import {z} from "zod";
import type {ReceivablesEvidenceDocument, ReceivablesEvidenceTableRow} from "./raw-detection";

const anchorSchema = z.object({
  id: z.string().min(1).max(1024), text: z.string().max(512), truncated: z.literal(true).optional(),
  bbox: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]).nullable().optional(),
});
const roleSchema = z.enum(["closing_balance", "opening_balance", "debit", "credit", "outstanding_balance"]);
const contextKindSchema = z.enum(["period", "as_of", "issued_at", "entity", "perimeter", "unit"]);

/** These are source observations, never accepted facts or authority to calculate. */
export const balanceSourceProposalSchema = z.object({
  id: z.string().min(1), sourceId: z.string().min(1), sourceLabel: z.string().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/), documentVersion: z.number().int().positive().nullable(),
  containerId: z.string().min(1), page: z.number().int().positive().optional(), sheet: z.string().optional(),
  reviewState: z.literal("proposed"), calculationUse: z.literal("not_permitted"),
  columns: z.array(z.object({role: roleSchema, header: anchorSchema})).min(1).max(16),
  context: z.array(z.object({kind: contextKindSchema, anchor: anchorSchema})).max(32),
  rows: z.array(z.object({id: z.string().min(1), cells: z.array(anchorSchema).max(16)})).max(12),
  issues: z.array(z.enum(["review_required", "source_version_missing", "entity_not_identified", "perimeter_not_identified", "unit_not_identified", "economic_date_not_identified", "multiple_economic_date_references", "multiple_balance_columns", "column_geometry_unavailable", "source_context_unanchored", "source_rows_truncated", "source_context_truncated", "source_cells_truncated", "source_text_truncated"])),
});
export type BalanceSourceProposal = z.infer<typeof balanceSourceProposalSchema>;
export const balanceSourceAssessmentSchema = z.object({
  schemaVersion: z.literal("balance-source-proposals.v1"),
  reportingDate: z.iso.date(),
  proposals: z.array(balanceSourceProposalSchema).max(16),
  issues: z.array(z.literal("assessment_limit_reached")).max(1),
});
export type BalanceSourceAssessment = z.infer<typeof balanceSourceAssessmentSchema>;

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const roles = new Map<string, z.infer<typeof roleSchema>>([
  ["saldo atual", "closing_balance"], ["saldo final", "closing_balance"], ["closing balance", "closing_balance"],
  ["saldo anterior", "opening_balance"], ["opening balance", "opening_balance"],
  ["debito", "debit"], ["debitos", "debit"], ["debit", "debit"],
  ["credito", "credit"], ["creditos", "credit"], ["credit", "credit"],
  ["saldo devedor", "outstanding_balance"], ["outstanding balance", "outstanding_balance"],
]);
type SourceText = {id?: string | undefined; text: string; bbox?: readonly [number, number, number, number] | null | undefined};
const anchor = (cell: SourceText & {id: string}): z.infer<typeof anchorSchema> => ({
  id: cell.id, text: cell.text.slice(0, 512), ...(cell.text.length > 512 ? {truncated: true as const} : {}),
  ...(cell.bbox === undefined ? {} : {bbox: cell.bbox === null ? null : [...cell.bbox] as [number, number, number, number]}),
});

function contextKinds(text: string): z.infer<typeof contextKindSchema>[] {
  const value = fold(text);
  return [
    ...(/\bperiodo\b|\bperiod\b/.test(value) ? ["period" as const] : []),
    ...(/\bdata[- ]?base\b|\bbase\s*:?\s*\d|\bas of\b/.test(value) ? ["as_of" as const] : []),
    ...(/\bemissao\b|\bemitido\b|\bissued\b/.test(value) ? ["issued_at" as const] : []),
    ...(/\bcnpj\b|\btax id\b/.test(value) ? ["entity" as const] : []),
    ...(/\bconsolidado\b|\bindividual\b|\bcontroladora\b|\bconsolidated\b|\bstandalone\b/.test(value) ? ["perimeter" as const] : []),
    ...(/\br\$|\breais\b|\bbrl\b|\busd\b|\beur\b|\bmilhares\b|\bthousands\b/.test(value) ? ["unit" as const] : []),
  ];
}

/**
 * Preserve all relevant competing declarations in their own source container. In
 * particular, issue date is not reporting date and an entity name is not a perimeter.
 * No cell is assigned to a balance column until a separate governed review exists.
 */
export function proposeBalanceSources(documents: readonly ReceivablesEvidenceDocument[], reportingDate: string): BalanceSourceAssessment {
  const proposals: BalanceSourceProposal[] = [];
  let limitReached = false;
  let payloadBytes = 0;
  for (const document of [...documents].sort((a, b) => a.id.localeCompare(b.id))) {
    if (limitReached) break;
    const add = (containerId: string, rows: readonly ReceivablesEvidenceTableRow[], context: readonly SourceText[], location: {page?: number; sheet?: string}) => {
      for (let index = 0; index < rows.length; index += 1) {
        if (limitReached) break;
        const header = rows[index]!;
        const allColumns = header.cells.flatMap((cell) => {
          const role = roles.get(fold(cell.text));
          return role ? [{role, header: anchor(cell)}] : [];
        });
        if (!allColumns.some((column) => column.role === "closing_balance" || column.role === "outstanding_balance")) continue;
        if (proposals.length >= 16) { limitReached = true; break; }
        const columns = allColumns.slice(0, 16);
        // A repeated header starts a new candidate; never inherit it across pages/tables.
        let end = index + 1;
        while (end < rows.length && !rows[end]!.cells.some((cell) => {
          const role = roles.get(fold(cell.text));
          return role === "closing_balance" || role === "outstanding_balance";
        })) end += 1;
        // Bound the scan itself, not only its output: repeated headers cannot multiply
        // an entire sheet prefix. Omitted context is explicit and never authorizes use.
        const contextTexts: SourceText[] = context.slice(0, 64);
        let contextTruncated = context.length > 64;
        let visited = 0;
        contextScan: for (let rowIndex = 0; rowIndex <= index; rowIndex += 1) {
          for (const cell of rows[rowIndex]!.cells) {
            if (visited >= 128) { contextTruncated = true; break contextScan; }
            contextTexts.push(cell); visited += 1;
          }
        }
        const observed = contextTexts.flatMap((cell) => cell.id ? contextKinds(cell.text).map((kind) => ({kind, anchor: anchor({...cell, id: cell.id!})})) : []);
        const unique = new Map(observed.map((item) => [`${item.kind}:${item.anchor.id}`, item]));
        const allContexts = [...unique.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.anchor.id.localeCompare(b.anchor.id));
        const contexts = allContexts.slice(0, 32);
        const has = (kind: z.infer<typeof contextKindSchema>) => contexts.some((item) => item.kind === kind);
        const issues: BalanceSourceProposal["issues"] = ["review_required"];
        if (!document.layer.documentVersion) issues.push("source_version_missing");
        if (!has("entity")) issues.push("entity_not_identified");
        if (!has("perimeter")) issues.push("perimeter_not_identified");
        if (!has("unit")) issues.push("unit_not_identified");
        const economic = contexts.filter((item) => item.kind === "period" || item.kind === "as_of");
        if (economic.length === 0) issues.push("economic_date_not_identified");
        if (economic.length > 1) issues.push("multiple_economic_date_references");
        if (new Set(columns.map((item) => item.role)).size !== columns.length) issues.push("multiple_balance_columns");
        if (location.page !== undefined && columns.some((column) => !column.header.bbox)) issues.push("column_geometry_unavailable");
        if (contextTexts.some((cell) => !cell.id && contextKinds(cell.text).length > 0)) issues.push("source_context_unanchored");
        const sourceRows = rows.slice(index + 1, end);
        if (contextTruncated || allContexts.length > 32) issues.push("source_context_truncated");
        if (allColumns.length > 16 || sourceRows.slice(0, 12).some((row) => row.cells.length > 16)) issues.push("source_cells_truncated");
        if ([...columns.map((column) => column.header), ...contexts.map((item) => item.anchor)].some((item) => item.truncated) || sourceRows.slice(0, 12).some((row) => row.cells.slice(0, 16).some((cell) => cell.text.length > 512))) issues.push("source_text_truncated");
        if (sourceRows.length > 12) issues.push("source_rows_truncated");
        const proposal: BalanceSourceProposal = {
          id: `${document.id}:${containerId}:${header.id}`, sourceId: document.id, sourceLabel: document.fileName,
          sourceHash: document.fileHash, documentVersion: document.layer.documentVersion ?? null, containerId, ...location,
          reviewState: "proposed", calculationUse: "not_permitted", columns, context: contexts,
          rows: sourceRows.slice(0, 12).map((row) => ({id: row.id, cells: row.cells.slice(0, 16).map(anchor)})), issues,
        };
        const bytes = new TextEncoder().encode(JSON.stringify(proposal)).byteLength;
        if (payloadBytes + bytes > 250_000) { limitReached = true; break; }
        payloadBytes += bytes; proposals.push(proposal);
      }
    };
    for (const page of document.layer.pages ?? []) {
      for (const table of page.tables) {
        // A container without a stable anchor cannot become a proposal.
        if (!table.id || !page.n) continue;
        add(table.id, table.rows, page.blocks, {page: page.n});
      }
    }
    for (const sheet of document.layer.sheets ?? []) {
      const grouped = new Map<number, {id: string; text: string; column: string}[]>();
      for (const cell of sheet.cells) {
        const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(cell.ref);
        if (!match) continue;
        const row = Number(match[2]);
        if (!Number.isSafeInteger(row)) continue;
        const entries = grouped.get(row) ?? [];
        entries.push({id: `s${sheet.name}!${cell.ref}`, text: String(cell.v ?? ""), column: match[1]!});
        grouped.set(row, entries);
      }
      const ordinal = (column: string) => [...column].reduce((n, character) => n * 26 + character.charCodeAt(0) - 64, 0);
      const rows = [...grouped].sort(([a], [b]) => a - b).map(([n, cells]) => ({id: `s${sheet.name}!row${n}`, cells: cells.sort((a, b) => ordinal(a.column) - ordinal(b.column))}));
      add(`s${sheet.name}`, rows, [], {sheet: sheet.name});
    }
  }
  return balanceSourceAssessmentSchema.parse({schemaVersion: "balance-source-proposals.v1", reportingDate, proposals, issues: limitReached ? ["assessment_limit_reached"] : []});
}
