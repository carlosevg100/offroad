import {normalizeText} from "@offroad/document-intelligence";

/**
 * Deterministic detection of scale declarations ("em milhares de reais" → 1000).
 *
 * This is the single most expensive mistake in credit analysis: a statement in thousands
 * read as units turns R$ 185 million into R$ 185 thousand. The rule here is narrow on
 * purpose — it only reports what the document literally says, with the text and the place
 * it was seen, so a human (or the reconciler) can confirm. It never guesses a scale from
 * the magnitude of the numbers, and it never applies anything: applying a scale is the
 * extractor's job, and only against a declaration it can point at.
 */
export type ScaleDeclaration = {
  scale: number;
  /** Layer id where the sentence was found (`p1`, `sDRE`, `sec2`). */
  where: string;
  /** The literal sentence, so the anchor check can find it in the document. */
  text: string;
};

type ScaleRule = {scale: number; pattern: RegExp};

// Matched against text that has been lowercased and stripped of diacritics
// (`normalizeText`), so "milhões" arrives as "milhoes".
const scaleRules: readonly ScaleRule[] = [
  {scale: 1_000_000_000, pattern: /\b(em|valores em|expressos em|montantes em)?\s*(bilhoes|bilhao)\b/},
  {scale: 1_000_000_000, pattern: /\bin\s+billions\b/},
  {scale: 1_000_000, pattern: /\b(em|valores em|expressos em|montantes em)?\s*(milhoes|milhao)\s*(de\s+reais|de\s+r\$|de\s+dolares)?/},
  {scale: 1_000_000, pattern: /\b(in|amounts in|expressed in)\s+millions\b/},
  {scale: 1_000_000, pattern: /\br\$\s*(milhoes|mm)\b/},
  {scale: 1_000, pattern: /\b(em|valores em|expressos em|montantes em)?\s*milhares\s*(de\s+reais|de\s+r\$|de\s+dolares)?/},
  {scale: 1_000, pattern: /\b(in|amounts in|expressed in)\s+thousands\b/},
  {scale: 1_000, pattern: /\br\$\s*mil\b/},
  {scale: 1_000, pattern: /\br\$\s*'?000\b/},
  {scale: 1_000, pattern: /\bus\$\s*(mil|thousands)\b/},
];

/**
 * `milhares`/`milhoes` also appear in prose that declares nothing ("a empresa investiu 3
 * milhões em 2025"). The discriminator that actually separates the two is what comes
 * immediately before: a quantity ("3 milhões") is prose, a cue or nothing ("em milhares de
 * reais", "(R$ mil)") is a declaration about the numbers that follow. A long narrative
 * sentence is not a table header either.
 */
const quantityBefore = /\d[\d.,\s]*$/;
const maxDeclarationWords = 25;

const sentenceSplit = /(?<=[.;:!?])\s+|\n+|\s{3,}/;

/**
 * Finds scale declarations in one container's text. `where` is the layer id that will be
 * used as the anchor if the extractor cites the declaration.
 */
export function detectScaleDeclarations(text: string, where: string): ScaleDeclaration[] {
  if (!text) return [];
  const found: ScaleDeclaration[] = [];
  const seen = new Set<string>();

  for (const rawSentence of text.split(sentenceSplit)) {
    const sentence = rawSentence.trim();
    if (!sentence || sentence.length > 400) continue;
    if (sentence.split(/\s+/).length > maxDeclarationWords) continue;
    const normalized = normalizeText(sentence);

    for (const rule of scaleRules) {
      const match = rule.pattern.exec(normalized);
      if (!match) continue;

      // "3 milhões" states a quantity; "em milhares de reais" states the scale of a table.
      if (quantityBefore.test(normalized.slice(0, match.index))) continue;

      const key = `${rule.scale}:${sentence}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({scale: rule.scale, where, text: sentence});
      break; // the largest matching scale wins for a given sentence
    }
  }

  return found;
}

/** Convenience for parsers that collect declarations container by container. */
export function collectScaleDeclarations(
  containers: readonly {id: string; text: string}[],
): ScaleDeclaration[] {
  const all: ScaleDeclaration[] = [];
  const seen = new Set<string>();
  for (const container of containers) {
    for (const declaration of detectScaleDeclarations(container.text, container.id)) {
      const key = `${declaration.scale}:${declaration.where}:${declaration.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(declaration);
    }
  }
  return all;
}
