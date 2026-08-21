import type {LayerIndex} from "@offroad/document-intelligence";

/**
 * Row passes: the deterministic answer to the wide-table failure.
 *
 * Aurora's debt schedule measured it precisely. The whole sheet fit in one chunk, the model was
 * asked for thirty-four targets including every `debt.instruments.{i}.*` pattern, and it
 * returned one candidate with zero absences: not a reading error, a refusal to enumerate. Asked
 * to expand seven rows by seven fields in one breath, a model under-produces, and no prompt
 * wording fixes a task that should never have been one task.
 *
 * So the orchestration does the enumeration and the model does the reading. Each data row of a
 * detected table becomes its own pass: the header, the row, and the indexed field patterns with
 * `{i}` already bound to that row's number. The model's task collapses to "read eight cells",
 * which is the size of task it is reliable at, and the row anchor arrives attached, so every
 * candidate cites the line it came from.
 */

export type TableRowPass = {
  tableId: string;
  /** 1-based position among the table's data rows: the {i} this pass binds. */
  instance: number;
  rowAnchorId: string;
  /** Ready-to-render evidence: the column header (when the table has one) and the row. */
  evidenceText: string;
};

const isRowId = (id: string): boolean => /\.r\d+$/.test(id);
const headerish = (text: string): boolean => /[a-zA-Zà-úÀ-Ú]/.test(text) && !/\d{3}[.,]\d{3}/.test(text);
/** Total and subtotal rows summarise other rows; an instrument named "Total" is a defect. */
const aggregateRow = (text: string): boolean => /^(total|subtotal|soma)\b/i.test(text.trim());

export function tableRowPasses(index: LayerIndex, options: {minRows?: number; maxRows?: number} = {}): TableRowPass[] {
  const minRows = options.minRows ?? 3;
  const maxRows = options.maxRows ?? 60;

  const rowsByTable = new Map<string, Array<{id: string; text: string}>>();
  for (const anchor of index.byId.values()) {
    if (anchor.precision !== "row" || !isRowId(anchor.id)) continue;
    const tableId = anchor.id.replace(/\.r\d+$/, "");
    if (!rowsByTable.has(tableId)) rowsByTable.set(tableId, []);
    rowsByTable.get(tableId)!.push({id: anchor.id, text: anchor.text});
  }

  const passes: TableRowPass[] = [];
  for (const [tableId, rows] of rowsByTable) {
    const aggregate = index.byId.get(tableId);
    const firstLine = aggregate?.text.split("\n", 1)[0] ?? "";

    // Three shapes of header, told apart deterministically: a header the parser detected (the
    // aggregate's first line is not the first row), a header sitting in the first row (headerish
    // text, no big numbers), or none.
    let header: string | null = null;
    let dataRows = rows;
    if (rows.length > 0 && firstLine !== rows[0]!.text && headerish(firstLine)) {
      header = firstLine;
    } else if (rows.length > 1 && headerish(rows[0]!.text)) {
      header = rows[0]!.text;
      dataRows = rows.slice(1);
    }

    const cleaned = dataRows.filter((row) => row.text.trim() !== "" && !aggregateRow(row.text));
    if (cleaned.length < minRows || cleaned.length > maxRows) continue;

    cleaned.forEach((row, position) => {
      passes.push({
        tableId,
        instance: position + 1,
        rowAnchorId: row.id,
        evidenceText: [
          ...(header ? [`colunas: ${header}`] : []),
          `[${row.id}] ${row.text}`,
        ].join("\n"),
      });
    });
  }
  return passes;
}
