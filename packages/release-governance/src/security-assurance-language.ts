export type ForbiddenAssuranceClaim = {
  code: "noncanonical_assurance_language";
  match: string;
};

const highRiskSubjects = /\b(?:soc\s*2(?:\s+type\s+(?:i|ii|1|2))?|iso(?:\s*\/\s*iec)?\s*27001|pentest|pen\s+test|penetration\s+test(?:ing)?|teste\s+de\s+(?:invas[aã]o|penetra[cç][aã]o)|independent(?:ly)?\s+(?:production\s+)?audit|production(?:\s+controls?)?\s+(?:has\s+been\s+)?independently\s+(?:audited|verified|validated)|auditoria\s+independente)\b/giu;

/**
 * Conservative defense-in-depth lint, not a natural-language assurance evaluator. Formal claims
 * and milestones must come from the typed renderer. Any remaining high-risk prose is sent back to
 * review, regardless of polarity, tense or apparent qualification; the lint deliberately does not
 * try to decide whether arbitrary prose is true.
 */
export function findNonCanonicalAssuranceLanguage(
  output: string,
): ForbiddenAssuranceClaim[] {
  const remainder = normalize(output);
  highRiskSubjects.lastIndex = 0;
  const seen = new Set<string>();
  const findings: ForbiddenAssuranceClaim[] = [];
  for (const match of remainder.matchAll(highRiskSubjects)) {
    const normalized = match[0].replace(/\s+/gu, " ").trim();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    findings.push({code: "noncanonical_assurance_language", match: normalized});
  }
  return findings;
}

/** @deprecated Use findNonCanonicalAssuranceLanguage on untrusted narrative fields. */
export function findForbiddenAssuranceClaims(output: string): ForbiddenAssuranceClaim[] {
  return findNonCanonicalAssuranceLanguage(output);
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{Z}\s]+/gu, " ")
    .trim();
}
