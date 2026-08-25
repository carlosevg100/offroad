import {createHash} from "node:crypto";

export type ScopeSuggestionInput = {
  suggestionId: string;
  entityId: string;
  legalName: string;
  suggestedRole: "other";
};

type ExtractedCandidate = Record<string, unknown>;

const normalizedName = (value: string) => value
  .normalize("NFKC")
  .trim()
  .replace(/\s+/g, " ")
  .toLocaleLowerCase("pt-BR");

/**
 * Converts only anchored, high-confidence entity mentions into review suggestions.
 *
 * The extractor does not know the legal role of a related company. Assigning `guarantor`,
 * `holding` or `target` here would turn a mention into an economic-perimeter decision, so every
 * new name starts as `other` and a tenant member decides its role on the guided screen.
 */
export function buildScopeSuggestionInputs(candidates: readonly ExtractedCandidate[]): ScopeSuggestionInput[] {
  const byName = new Map<string, string>();
  for (const candidate of candidates) {
    if (candidate.anchor_verified !== true || typeof candidate.confidence !== "number" || candidate.confidence < 0.8) continue;
    if (typeof candidate.entity_name !== "string" || candidate.entity_name.trim().length < 2) continue;
    const legalName = candidate.entity_name.trim().replace(/\s+/g, " ");
    const key = normalizedName(legalName);
    if (!byName.has(key)) byName.set(key, legalName);
  }

  return [...byName.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, legalName]) => {
      const digest = createHash("sha256").update(key).digest("hex");
      return {
        suggestionId: `scope-suggestion:${digest.slice(0, 32)}`,
        entityId: `document-entity:${digest.slice(0, 32)}`,
        legalName,
        suggestedRole: "other",
      };
    });
}

/** Stable UUID for an append-only event emitted by a retryable document job. */
export function deterministicJobEventId(jobId: string, purpose: "scope-suggestions" | "advisor-authorization"): string {
  const bytes = Buffer.from(createHash("sha256").update(`${jobId}:${purpose}`).digest("hex").slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

