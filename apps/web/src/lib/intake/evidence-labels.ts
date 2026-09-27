import {resolveFieldPath} from "@offroad/credit-ontology";

type Lang = "pt" | "en";

/**
 * A field path in the words a company recognises, with the period the path carries ("EBITDA
 * (2025)"); null when the ontology does not know the path. A path is never printed (stage 19,
 * second polish): what a claim or a calculation stands on is read in words.
 */
export function fieldPathLabel(path: string, lang: Lang): string | null {
  const resolved = resolveFieldPath(path);
  if (!resolved) return null;
  const period = resolved.params.period ? ` (${resolved.params.period.replace("_", "/")})` : "";
  return `${resolved.definition.labels[lang]}${period}`;
}

/**
 * What a claim or a calculation stands on, in words and without repetition: a calculation of the
 * case by its own label, a field by its ontology label. An identifier with neither is left out of
 * the visible text; the element keeps the identifiers for whoever audits it.
 */
export function evidenceLabels(
  ids: readonly string[],
  lang: Lang,
  calculations: ReadonlyArray<{id: string; labels: {pt: string; en: string}}> = [],
): string[] {
  const labels = ids.flatMap((id) => {
    const calculation = calculations.find((entry) => entry.id === id);
    if (calculation) return [calculation.labels[lang]];
    const label = fieldPathLabel(id, lang);
    return label ? [label] : [];
  });
  return [...new Set(labels)];
}
