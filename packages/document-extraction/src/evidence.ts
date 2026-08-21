import type {IndexedAnchor, LayerIndex} from "@offroad/document-intelligence";

/**
 * Turns an indexed layer into the evidence the extractor reads.
 *
 * Every line carries the anchor id the model must cite, because a number without the exact
 * place it came from is not a fact here, it is a guess that survived. The renderer therefore
 * never invents, merges or reflows content: it selects a granularity and prints ids.
 *
 * Granularity is chosen per container. A table row is the useful unit, it carries the label
 * and the values together, which is what makes "Receita líquida" mean the number beside it,
 * and cell ids are derivable from it (`<row>.c1`, `<row>.c2`, …), so the model can cite a
 * single cell without the renderer spending characters on every one. Containers with no rows
 * fall back to their cells, which is what a spreadsheet export without detected tables looks
 * like.
 */

export type EvidenceChunk = {
  /** Rendered text, ready to hand to the model. */
  text: string;
  /** Anchor ids that appear in this chunk, in document order. */
  anchorIds: string[];
  /** 1-based position, for logs and for telling the model where it is. */
  index: number;
  total: number;
};

export type RenderOptions = {
  /**
   * Character ceiling per chunk. A large document becomes several calls rather than one
   * truncated call: silently dropping half a balance sheet would produce an extraction that
   * looks complete and is not.
   */
  maxChars?: number;
  /**
   * Never pack two containers into one window. Nimbus measured why: a workbook whose first
   * sheet is 40 customers by 24 months and whose second is a ten-line summary was read in one
   * call, and the summary's ARR, MRR and burn never came back. A sheet read alone is a sheet
   * the model actually reads.
   */
  oneContainerPerChunk?: boolean;
  /** Longest single line kept intact; anything longer is cut with an explicit marker. */
  maxLineChars?: number;
};

/**
 * Sized by what has to come *out*, not by what fits going in, but measured, not guessed.
 *
 * The history in three runs: at 60k a dense statement asked for more candidates than one
 * response could hold and the whole chunk died at the output ceiling; at 18k recall got
 * *worse* (44.6% → 40.0%), because tiny windows cut the table header away from its rows and
 * the model lost period and scale. 40k with structural packing (whole sheets/pages together,
 * headers repeated on a split) keeps context intact, and per-candidate salvage now means a
 * ceiling-hit response loses its tail, not the document.
 */
const DEFAULT_MAX_CHARS = 40_000;
const DEFAULT_MAX_LINE_CHARS = 2_000;

const isTableAggregate = (id: string) => /\.t\d+$/.test(id);
const isRow = (id: string) => /\.r\d+$/.test(id);
const isTableCell = (id: string) => /\.r\d+\.c\d+$/.test(id);

/** Anchors that stand for a whole page/sheet/section/slide, or the document itself. */
const isContainer = (anchor: IndexedAnchor) => anchor.precision === "page" || anchor.precision === "document";

function containerLabel(anchor: IndexedAnchor): string {
  if (anchor.sheet) return `sheet ${anchor.sheet}`;
  if (anchor.page !== undefined) return `page ${anchor.page}`;
  return anchor.containerId ? `section ${anchor.containerId}` : "document";
}

function clip(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  // Truncation is always visible. A quietly shortened row would still look citable.
  return `${collapsed.slice(0, max)} …[linha truncada]`;
}

type Line = {anchorId: string; text: string; container: string};

/**
 * Selects the lines worth showing, in document order.
 *
 * Skipped on purpose: container anchors (their text is the concatenation of what is already
 * being printed), table aggregates (same reason) and individual table cells (derivable from
 * their row). What remains is the smallest set that still lets every fact be cited.
 */
export function selectLines(index: LayerIndex, options: RenderOptions = {}): Line[] {
  const maxLineChars = options.maxLineChars ?? DEFAULT_MAX_LINE_CHARS;

  const containersWithRows = new Set<string>();
  for (const anchor of index.byId.values()) {
    if (isRow(anchor.id) && anchor.containerId) containersWithRows.add(anchor.containerId);
  }

  // The index stores a table's rows before the table itself, but the reader needs the columns
  // before the first row, "Receita | 185.400 | 172.900" means nothing until the years arrive.
  // So: collect each table's header first, then emit it right before its first row.
  const headerByTable = new Map<string, Line>();
  for (const anchor of index.byId.values()) {
    if (!isTableAggregate(anchor.id)) continue;
    const header = anchor.text.split("\n", 1)[0] ?? "";
    // A table without a detected header starts with its first data row; repeating that line
    // as "columns" would state a falsehood, so only headerish lines qualify.
    const isHeaderish = header.length > 0 && !/\d{3}[.,]\d{3}/.test(header);
    if (isHeaderish) {
      headerByTable.set(anchor.id, {anchorId: anchor.id, text: `colunas: ${clip(header, maxLineChars)}`, container: containerLabel(anchor)});
    }
  }

  const lines: Line[] = [];
  const emittedHeaders = new Set<string>();
  for (const anchor of index.byId.values()) {
    if (isContainer(anchor)) continue;
    if (isTableAggregate(anchor.id)) continue;
    if (isTableCell(anchor.id)) continue;

    const container = anchor.containerId ?? "";
    // A spreadsheet whose tables were detected is read by rows; one without them, by cells.
    if (anchor.precision === "cell" && !isRow(anchor.id) && containersWithRows.has(container)) continue;

    if (isRow(anchor.id)) {
      const tableId = anchor.id.replace(/\.r\d+$/, "");
      const headerLine = headerByTable.get(tableId);
      if (headerLine && !emittedHeaders.has(tableId)) {
        emittedHeaders.add(tableId);
        lines.push(headerLine);
      }
    }

    const text = clip(anchor.text, maxLineChars);
    if (!text) continue;
    lines.push({anchorId: anchor.id, text, container: containerLabel(anchor)});
  }
  return lines;
}

/**
 * Renders the layer into chunks that respect the document's own structure.
 *
 * Chunk boundaries fall between containers (pages, sheets, sections) whenever the budget
 * allows: a sheet read whole is a sheet whose labels, columns and totals stay in one view.
 * Only a container that alone exceeds the budget is split, and then every table header line
 * seen so far in that container is repeated at the top of the continuation, so a row never
 * arrives without its columns. That header repetition is the fix for the measured regression
 * where "Receita | 185.400 | 172.900" reached the model with no years attached.
 */
export function renderEvidence(index: LayerIndex, options: RenderOptions = {}): EvidenceChunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const lines = selectLines(index, options);

  // Group into containers first: structure decides boundaries, size only forces them.
  const groups: {container: string; lines: Line[]}[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && last.container === line.container) last.lines.push(line);
    else groups.push({container: line.container, lines: [line]});
  }

  const chunks: {parts: string[]; anchorIds: string[]; size: number}[] = [];
  let current = {parts: [] as string[], anchorIds: [] as string[], size: 0};

  const flush = () => {
    if (current.parts.length === 0) return;
    chunks.push(current);
    current = {parts: [], anchorIds: [], size: 0};
  };

  const push = (part: string, anchorId?: string) => {
    current.parts.push(part);
    current.size += part.length + 1;
    if (anchorId) current.anchorIds.push(anchorId);
  };

  for (const group of groups) {
    const rendered = group.lines.map((line) => ({line, text: `[${line.anchorId}] ${line.text}`}));
    const groupSize = group.container.length + 9 + rendered.reduce((sum, item) => sum + item.text.length + 1, 0);

    // Whole container fits: keep it together, starting a new chunk if the current one is busy.
    if (groupSize <= maxChars) {
      if (current.size > 0 && (options.oneContainerPerChunk || current.size + groupSize > maxChars)) flush();
      push(`--- ${group.container} ---`);
      for (const item of rendered) push(item.text, item.line.anchorId);
      continue;
    }

    // The container alone exceeds the budget: split it, repeating its header lines so a row
    // never loses its columns across the cut.
    flush();
    const headerLines: string[] = [];
    push(`--- ${group.container} ---`);
    for (const item of rendered) {
      if (current.size + item.text.length + 1 > maxChars && current.anchorIds.length > 0) {
        flush();
        push(`--- ${group.container} (continuação) ---`);
        for (const headerLine of headerLines) push(headerLine);
      }
      push(item.text, item.line.anchorId);
      if (item.line.text.startsWith("colunas: ")) headerLines.push(item.text);
    }
    flush();
  }
  flush();

  const total = chunks.length;
  return chunks.map((chunk, position) => ({
    text: chunk.parts.join("\n"),
    anchorIds: chunk.anchorIds,
    index: position + 1,
    total,
  }));
}
