/**
 * Frozen corpora the preview may analyse. A company the person names resolves to one of these or
 * to nothing: a company without a frozen base never receives another company's objects, and the
 * router says so instead of guessing. The registry is data; adding a case is adding an entry.
 */
import {case01EvidenceManifest} from "../cases/gc01";

export type PreviewCorpus = {
  caseId: string;
  /** The frozen source pack shipped with the worker image (`SOURCE_PACKS_DIR/<id>/source-pack.json`). */
  sourcePackId: string;
  company: {legalName: string; shortName: string; aliases: string[]; cnpj?: string};
  /** What the base holds, for the reply and the brief. */
  basis: string;
  version: string;
};

export const previewCorpora: PreviewCorpus[] = [
  {
    caseId: case01EvidenceManifest.caseId,
    sourcePackId: "camil",
    company: {
      legalName: "Camil Alimentos S.A.",
      shortName: "Camil",
      aliases: ["camil", "camil alimentos", "camil alimentos s.a.", "camil alimentos sa", "caml3"],
    },
    basis: case01EvidenceManifest.basis,
    version: case01EvidenceManifest.version,
  },
];

/** Lowercase, no accents, no punctuation, single spaces: the form aliases and mentions are compared in. */
export function normalizeMention(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type CorpusResolution =
  | {kind: "resolved"; corpus: PreviewCorpus; mention: string; alias: string}
  | {kind: "unknown"; mentions: string[]}
  | {kind: "none"};

/**
 * Resolves the companies a turn names to a frozen corpus. A mention matches an alias as a whole
 * word sequence, never as a substring, so "Camila Ferreira" is not Camil. Several mentions with
 * one resolvable company resolve to it; mentions with none resolvable are unknown.
 */
export function resolvePreviewCorpus(mentions: string[]): CorpusResolution {
  const cleaned = mentions.map((mention) => mention.trim()).filter((mention) => mention.length > 0);
  if (cleaned.length === 0) return {kind: "none"};
  for (const mention of cleaned) {
    const normalized = normalizeMention(mention);
    if (!normalized) continue;
    for (const corpus of previewCorpora) {
      for (const alias of corpus.company.aliases) {
        const normalizedAlias = normalizeMention(alias);
        if (normalized === normalizedAlias || ` ${normalized} `.includes(` ${normalizedAlias} `)) {
          return {kind: "resolved", corpus, mention, alias};
        }
      }
    }
  }
  return {kind: "unknown", mentions: cleaned};
}

export function corpusByCaseId(caseId: string): PreviewCorpus | null {
  return previewCorpora.find((corpus) => corpus.caseId === caseId) ?? null;
}
