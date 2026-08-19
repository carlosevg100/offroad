import type {IndexedAnchor, LayerIndex} from "@offroad/document-intelligence";

/**
 * Turns an indexed layer into the evidence the extractor reads.
 *
 * Every line carries the anchor id the model must cite, because a number without the exact
 * place it came from is not a fact here — it is a guess that survived. The renderer therefore
 * never invents, merges or reflows content: it selects a granularity and prints ids.
 *
 * Granularity is chosen per container. A table row is the useful unit — it carries the label
 * and the values together, which is what makes "Receita líquida" mean the number beside it —
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
  /** Longest single line kept intact; anything longer is cut with an explicit marker. */
  maxLineChars?: number;
};

/**
 * Sized by what has to come *out*, not by what fits going in.
 *
 * A dense financial statement produces roughly one candidate per number, and each candidate
 * costs a few hundred output tokens. At 60k characters of evidence the audited statements of
 * this data room asked for more candidates than a single response could hold: the answer hit
 * the output ceiling, stopped mid-JSON, and the whole chunk was lost — the most important
 * document in the room contributed nothing, silently, while the run looked successful.
 * Smaller chunks cost a few more calls and remove that failure mode.
 */
const DEFAULT_MAX_CHARS = 18_000;
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

  const lines: Line[] = [];
  for (const anchor of index.byId.values()) {
    if (isContainer(anchor)) continue;
    if (isTableAggregate(anchor.id)) continue;
    if (isTableCell(anchor.id)) continue;

    const container = anchor.containerId ?? "";
    // A spreadsheet whose tables were detected is read by rows; one without them, by cells.
    if (anchor.precision === "cell" && !isRow(anchor.id) && containersWithRows.has(container)) continue;

    const text = clip(anchor.text, maxLineChars);
    if (!text) continue;
    lines.push({anchorId: anchor.id, text, container: containerLabel(anchor)});
  }
  return lines;
}

/** Renders the layer into one or more chunks, each under the character ceiling. */
export function renderEvidence(index: LayerIndex, options: RenderOptions = {}): EvidenceChunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const lines = selectLines(index, options);

  const chunks: {parts: string[]; anchorIds: string[]; size: number}[] = [];
  let current = {parts: [] as string[], anchorIds: [] as string[], size: 0};
  let lastContainer: string | null = null;

  const flush = () => {
    if (current.parts.length === 0) return;
    chunks.push(current);
    current = {parts: [], anchorIds: [], size: 0};
    lastContainer = null;
  };

  for (const line of lines) {
    const header = line.container === lastContainer ? null : `--- ${line.container} ---`;
    const rendered = `[${line.anchorId}] ${line.text}`;
    const cost = rendered.length + 1 + (header ? header.length + 1 : 0);

    if (current.size > 0 && current.size + cost > maxChars) flush();

    if (line.container !== lastContainer) {
      current.parts.push(`--- ${line.container} ---`);
      current.size += line.container.length + 9;
      lastContainer = line.container;
    }
    current.parts.push(rendered);
    current.anchorIds.push(line.anchorId);
    current.size += rendered.length + 1;
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
