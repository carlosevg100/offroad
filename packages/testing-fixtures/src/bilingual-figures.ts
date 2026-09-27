import Decimal from "decimal.js";

/**
 * TEST SUPPORT. Reads the figures a text states the way a reader of its language reads them, to
 * test invariant 9 (bilingual economic identity): `pt-BR` and `en-US` may differ in prose, never in
 * the economic payload.
 *
 * A figure is an amount, a percentage, a multiple, a spread in basis points, a date, a fraction or
 * a plain number (a count of months, a year). Each number is parsed with the separators of its
 * language and nothing else: in pt-BR the dot groups thousands and the comma marks the decimals,
 * in en-US the reverse, so a number written with the other language's separators ("2,19x" in
 * English, "90.3 dias" in Portuguese) is not read as a figure but reported as foreign. Amounts in
 * thousands or millions ("R$ 17,4M", "R$ 45 mil", "R$ 45 thousand") are read at their full value,
 * so the two languages compare by economics rather than by wording. Ordinals ("1º teste") are prose.
 *
 * A text quoted as written from the case (a claim of the brief, the text of a fact) is Portuguese
 * in both documents; it is read as Portuguese on both sides, and every other part of the English
 * text is read as English.
 */

export type FigureLocale = "pt-BR" | "en-US";

export type FigureReading = {
  /** Normalized and sorted: `amount:17400000`, `percent:62.7`, `multiple:2.19`, `bps:250`, `date:2026-12-31`, `fraction:2/3`, `number:48`. */
  figures: string[];
  /** Numbers written in a form the language does not read (the other locale's separators). */
  foreign: string[];
};

const grammar: Record<FigureLocale, RegExp> = {
  "pt-BR": /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/,
  "en-US": /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/,
};

// A scale word ends where the word ends: "M," and "mil." scale a number, "milhares" does not.
const scales: ReadonlyArray<{pattern: RegExp; factor: string}> = [
  {pattern: /^\s?(?:M|mi|milhões|milhão|million|millions)(?![A-Za-zÀ-ÿ])/, factor: "1000000"},
  {pattern: /^\s?(?:bi|bilhões|bilhão|billion|billions)(?![A-Za-zÀ-ÿ])/, factor: "1000000000"},
  {pattern: /^\s?(?:mil|thousand)(?![A-Za-zÀ-ÿ])/, factor: "1000"},
];

function parseNumber(token: string, locale: FigureLocale): Decimal | null {
  if (!grammar[locale].test(token)) return null;
  return new Decimal(locale === "pt-BR" ? token.replace(/\./g, "").replace(",", ".") : token.replace(/,/g, ""));
}

/** The figures of one text in one language. */
export function readFigures(text: string, locale: FigureLocale): FigureReading {
  const figures: string[] = [];
  const foreign: string[] = [];
  const scanned = text
    // ISO dates, so their digits are not read as numbers.
    .replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (date) => {
      figures.push(`date:${date}`);
      return " ";
    })
    // Fractions, written or in words, as the house's conduct policy reads them (LC-07).
    .replace(/\b(?:dois\s+terços|two[-\s]thirds)\b|\b(\d{1,2})\/(\d{1,2})\b/giu, (_match, numerator?: string, denominator?: string) => {
      figures.push(`fraction:${numerator ? `${numerator}/${denominator}` : "2/3"}`);
      return " ";
    });
  for (const match of scanned.matchAll(/(-?)(\d(?:[\d.,]*\d)?)/g)) {
    const start = match.index!;
    const token = match[2]!;
    const digitsAt = start + match[1]!.length;
    const previous = scanned[start - 1] ?? " ";
    // A hyphen is a sign only where a sign can stand; after a letter it joins an identifier, after a
    // digit it joins a range, and the number is read without it.
    const signed = match[1] === "-" && /[\s($]/.test(previous);
    if (/[A-Za-zÀ-ÿ]/.test(previous)) continue;
    const after = scanned.slice(start + match[0].length);
    // An ordinal is prose: "1º teste" is "first test".
    if (/^(?:º|ª|°|st\b|nd\b|rd\b|th\b)/.test(after)) continue;
    const parsed = parseNumber(token, locale);
    if (!parsed) {
      foreign.push(token);
      continue;
    }
    const before = scanned.slice(Math.max(0, digitsAt - 5), digitsAt);
    const value = signed ? parsed.negated() : parsed;
    const scale = scales.find((entry) => entry.pattern.test(after));
    const scaled = scale ? value.times(scale.factor) : value;
    if (/(?:R\$|US\$|BRL|USD)\s?-?$/.test(before)) figures.push(`amount:${scaled.toFixed()}`);
    else if (/^\s?%/.test(after)) figures.push(`percent:${value.toFixed()}`);
    else if (/^x(?![A-Za-z])/.test(after)) figures.push(`multiple:${value.toFixed()}`);
    else if (/^\s?bps\b/.test(after)) figures.push(`bps:${value.toFixed()}`);
    else figures.push(`number:${scaled.toFixed()}`);
  }
  return {figures: figures.sort(), foreign};
}

/** A text in its two languages. */
export type BilingualText = {pt: string; en: string};

/** Whether the two languages state the same figures; the quotes are read as Portuguese on both sides. */
export function bilingualFigureDivergence(text: BilingualText, quotes: readonly string[] = []): {pt: FigureReading; en: FigureReading} | null {
  const pt = readFigures(text.pt, "pt-BR");
  let english = text.en;
  const quoted: FigureReading[] = [];
  for (const quote of [...quotes].filter((entry) => /\d/.test(entry)).sort((a, b) => b.length - a.length)) {
    // A quote stands alone: "9% a.a." quoted from a fact is not the tail of "14,9% a.a.".
    const standing = new RegExp(`(?<![\\d.,])${quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d)`, "g");
    english = english.replace(standing, () => {
      quoted.push(readFigures(quote, "pt-BR"));
      return " ";
    });
  }
  const rest = readFigures(english, "en-US");
  const en = {
    figures: [...rest.figures, ...quoted.flatMap((reading) => reading.figures)].sort(),
    foreign: [...rest.foreign, ...quoted.flatMap((reading) => reading.foreign)],
  };
  const same = pt.figures.length === en.figures.length && pt.figures.every((figure, index) => figure === en.figures[index]);
  return same && pt.foreign.length === 0 && en.foreign.length === 0 ? null : {pt, en};
}

type Cell = string | BilingualText;

/**
 * The shape of a governed material as this reader walks it: every block kind of
 * `@offroad/case-materials`, typed structurally so that fixtures need not depend on the package.
 */
export type BilingualMaterialLike = {
  title: BilingualText;
  blocks: ReadonlyArray<
    | {type: "heading" | "paragraph" | "disclaimer"; text: BilingualText}
    | {type: "metrics"; items: ReadonlyArray<{label: BilingualText; formatted: BilingualText}>}
    | {type: "table"; caption: BilingualText; head: readonly BilingualText[]; rows: ReadonlyArray<readonly Cell[]>}
    | {type: "list"; items: readonly BilingualText[]}
    | {type: "kv"; caption?: BilingualText; rows: ReadonlyArray<{label: BilingualText; value: BilingualText; note?: BilingualText}>}
    | {type: "callout"; title: BilingualText; items: ReadonlyArray<{label: BilingualText; value: BilingualText}>}
  >;
  presentationCharts?: ReadonlyArray<{title: BilingualText}>;
};

/** Every text of a material with its two languages and where it sits; a table cell that is one string is printed in both. */
export function bilingualItems(material: BilingualMaterialLike): Array<{path: string} & BilingualText> {
  const items: Array<{path: string} & BilingualText> = [{path: "title", ...material.title}];
  const cell = (value: Cell): BilingualText => (typeof value === "string" ? {pt: value, en: value} : value);
  material.blocks.forEach((block, index) => {
    const at = `${index + 1}.${block.type}`;
    switch (block.type) {
      case "heading": case "paragraph": case "disclaimer": items.push({path: at, ...block.text}); break;
      case "metrics": block.items.forEach((item, row) => items.push({path: `${at}.${row + 1}.label`, ...item.label}, {path: `${at}.${row + 1}.value`, ...item.formatted})); break;
      case "list": block.items.forEach((item, row) => items.push({path: `${at}.${row + 1}`, ...item})); break;
      case "table":
        items.push({path: `${at}.caption`, ...block.caption});
        block.head.forEach((head, column) => items.push({path: `${at}.head.${column + 1}`, ...head}));
        block.rows.forEach((cells, row) => cells.forEach((value, column) => items.push({path: `${at}.${row + 1}.${column + 1}`, ...cell(value)})));
        break;
      case "kv":
        if (block.caption) items.push({path: `${at}.caption`, ...block.caption});
        block.rows.forEach((entry, row) => {
          items.push({path: `${at}.${row + 1}.label`, ...entry.label}, {path: `${at}.${row + 1}.value`, ...entry.value});
          if (entry.note) items.push({path: `${at}.${row + 1}.note`, ...entry.note});
        });
        break;
      case "callout":
        items.push({path: `${at}.title`, ...block.title});
        block.items.forEach((item, row) => items.push({path: `${at}.${row + 1}.label`, ...item.label}, {path: `${at}.${row + 1}.value`, ...item.value}));
        break;
    }
  });
  (material.presentationCharts ?? []).forEach((chart, index) => items.push({path: `chart.${index + 1}.title`, ...chart.title}));
  return items;
}

export type BilingualDivergence = {path: string; pt: string; en: string; ptFigures: string[]; enFigures: string[]; foreign: string[]};

/** The items of a material whose Portuguese and English versions do not state the same figures. */
export function bilingualDivergences(material: BilingualMaterialLike, quotes: readonly string[] = []): BilingualDivergence[] {
  return bilingualItems(material).flatMap((item) => {
    const divergence = bilingualFigureDivergence(item, quotes);
    return divergence ? [{
      path: item.path, pt: item.pt, en: item.en, ptFigures: divergence.pt.figures, enFigures: divergence.en.figures,
      foreign: [...divergence.pt.foreign.map((token) => `pt:${token}`), ...divergence.en.foreign.map((token) => `en:${token}`)],
    }] : [];
  });
}
