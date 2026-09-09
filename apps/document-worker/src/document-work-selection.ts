import {z} from "zod";
import {documentWorkProductNarrativeSchema, type DocumentWorkProductInput, type DocumentWorkProductNarrative} from "@offroad/domain-contracts";

const authoredText = z.string().trim().min(1).max(600);
/** Compact transport only; persisted products retain their original exact-source contract. */
export const documentWorkSelectionSchema = z.object({
  sections: z.array(z.object({
    key: documentWorkProductNarrativeSchema.shape.sections.element.shape.key,
    title: z.string().trim().min(1).max(120),
    quoteIds: z.array(z.string().regex(/^q[1-9][0-9]*$/)).max(12),
  }).strict()).length(3),
  hypotheses: z.array(z.object({text: authoredText, basisSourceIds: z.array(z.string().regex(/^p[1-9][0-9]*$/)).min(1).max(8), question: authoredText}).strict()).max(3),
  gaps: z.array(z.object({text: authoredText, question: authoredText}).strict()).max(6),
}).strict();
export type DocumentWorkSelection = z.infer<typeof documentWorkSelectionSchema>;
type Quote = {id: string; passageId: string; quote: string; start: number; end: number};
export function completeSourceQuote(source: string, quote: string, locale: "pt-BR" | "en-US"): boolean {
  if (source.trim() === quote || source.split(/\r?\n/).some(line => line.trim() === quote)) return true;
  const starts = new Set<number>(); const ends = new Set<number>();
  for (const segment of new Intl.Segmenter(locale, {granularity: "sentence"}).segment(source)) {
    const text = segment.segment; const trimmed = text.trim();
    if (!trimmed || !/[.!?]["'”’)]*$/.test(trimmed)) continue;
    starts.add(segment.index + text.length - text.trimStart().length);
    ends.add(segment.index + text.trimEnd().length);
  }
  let index = source.indexOf(quote);
  while (index !== -1) {
    if (starts.has(index) && ends.has(index + quote.length)) return true;
    index = source.indexOf(quote, index + 1);
  }
  return false;
}
export function buildDocumentWorkSelectionContext(input: DocumentWorkProductInput) {
  const quotes: Quote[] = [];
  const sources = input.passages.map((passage, index) => {
    const id = `p${index + 1}`;
    const candidates = passage.text.length <= 2000 ? [passage.text] : passage.text.split(/\r?\n/).flatMap(line =>
      line.trim().length <= 2000 ? [line] : [...new Intl.Segmenter(input.locale, {granularity: "sentence"}).segment(line)].map(item => item.segment));
    const local = [...new Set(candidates.map(text => text.trim()))].filter(quote => quote.length >= 12 && quote.length <= 2000 && completeSourceQuote(passage.text, quote, input.locale));
    const availableQuotes = local.map(quote => {
      if (quotes.length >= 500) throw new Error("document_work_product_quote_budget_exceeded");
      const start = passage.text.indexOf(quote);
      const entry = {id: `q${quotes.length + 1}`, passageId: passage.id, quote, start, end: start + quote.length};
      quotes.push(entry);
      return {id: entry.id, start: entry.start, end: entry.end, opening: quote.slice(0, 80)};
    });
    return {id, documentId: passage.documentId, documentName: passage.documentName, anchor: passage.anchor, text: passage.text, availableQuotes};
  });
  return {sources, quotes};
}
/** Rebuild exact quotations in code. The model cannot paraphrase, shorten or alter a selected quote. */
export function hydrateDocumentWorkSelection(input: DocumentWorkProductInput, raw: unknown): DocumentWorkProductNarrative {
  const selection = documentWorkSelectionSchema.parse(raw);
  const context = buildDocumentWorkSelectionContext(input);
  const quotes = new Map(context.quotes.map(quote => [quote.id, quote]));
  const sources = new Map(context.sources.map((source, index) => [source.id, input.passages[index]!.id]));
  return documentWorkProductNarrativeSchema.parse({
    sections: selection.sections.map(section => {
      if (new Set(section.quoteIds).size !== section.quoteIds.length) throw new Error("document_work_product_duplicate_selection");
      return {key: section.key, title: section.title, observations: section.quoteIds.map(id => {
        const quote = quotes.get(id);
        if (!quote) throw new Error("document_work_product_invalid_citation");
        return {text: quote.quote, citations: [{passageId: quote.passageId, quote: quote.quote}]};
      })};
    }),
    hypotheses: selection.hypotheses.map(hypothesis => ({text: hypothesis.text, question: hypothesis.question, basisPassageIds: hypothesis.basisSourceIds.map(id => {
      const source = sources.get(id); if (!source) throw new Error("document_work_product_invalid_citation"); return source;
    })})),
    gaps: selection.gaps,
  });
}
