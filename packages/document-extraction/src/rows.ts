import type {FieldDefinition} from "@offroad/credit-ontology";
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

const fold = (text: string): string => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * The words a table must carry to deserve a pass per row, taken from the indexed fields' own
 * labels and synonyms. Camil measured the alternative: 913 passes over a 62-page ITR, one per
 * row of every table including the tax reconciliation and the share count, US$ 7,80 and an
 * hour and twenty minutes, for zero debt instruments. A table that names no lender, balance,
 * rate, maturity, customer or share is not a table the indexed fields live in.
 */
const GENERIC_WORDS = new Set(["valor", "value", "total", "data", "date", "nome", "name", "base", "tipo", "type", "item", "descricao", "description", "numero", "number", "periodo", "period", "conta", "amount", "anual", "annual", "mensal", "monthly", "percent", "share", "other", "outro", "outros", "detail", "entity", "entidade", "papel", "role"]);

export function tableCues(fields: readonly FieldDefinition[]): string[] {
  const cues = new Set<string>();
  for (const field of fields) {
    for (const text of [field.labels.pt, field.labels.en, ...field.synonyms.pt, ...field.synonyms.en]) {
      for (const word of fold(text).split(/[^a-z0-9]+/)) if (word.length >= 4 && !GENERIC_WORDS.has(word)) cues.add(word);
    }
  }
  return [...cues];
}

export function tableRowPasses(index: LayerIndex, options: {minRows?: number; maxRows?: number; fields?: readonly FieldDefinition[]} = {}): TableRowPass[] {
  const minRows = options.minRows ?? 3;
  const maxRows = options.maxRows ?? 60;
  const cues = options.fields ? tableCues(options.fields) : null;

  const rowsByTable = new Map<string, Array<{id: string; text: string}>>();
  for (const anchor of index.byId.values()) {
    if (anchor.precision !== "row" || !isRowId(anchor.id)) continue;
    const tableId = anchor.id.replace(/\.r\d+$/, "");
    if (!rowsByTable.has(tableId)) rowsByTable.set(tableId, []);
    rowsByTable.get(tableId)!.push({id: anchor.id, text: anchor.text});
  }

  const passes: TableRowPass[] = [];
  // The instance runs across tables, not within each one. Camil measured the alternative: the
  // debenture table, the swap table and the sensitivity table each started at 1, so
  // `debt.instruments.1.balance` was three different numbers from one document and the
  // reconciliation saw a contradiction where the filing had three tables.
  let instance = 0;
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
    if (cues) {
      const sample = fold([header ?? "", ...cleaned.slice(0, 3).map((row) => row.text)].join(" "));
      // Two distinct cues, because one word ("saldo", "participacao") turns up in half the notes.
      if (cues.filter((cue) => sample.includes(cue)).length < 2) continue;
    }

    cleaned.forEach((row) => {
      instance += 1;
      passes.push({
        tableId,
        instance,
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
