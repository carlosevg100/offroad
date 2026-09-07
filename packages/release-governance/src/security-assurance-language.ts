export type ForbiddenAssuranceClaim = {
  code: "certification_claim" | "pentest_claim" | "live_assurance_claim";
  match: string;
};

const positiveModifiers = "(?:(?:now|currently|fully|successfully|independently|formally|officially|completely|agora|atualmente|integralmente|totalmente|independentemente|formalmente|oficialmente|com\\s+sucesso)\\s+){0,3}";

const forbiddenPatterns: Array<{code: ForbiddenAssuranceClaim["code"]; pattern: RegExp}> = [
  {
    code: "certification_claim",
    pattern: new RegExp(`\\b(?:soc\\s*2(?:\\s+type\\s+(?:i|ii|1|2))?|iso(?:\\s+iec)?\\s*27001|gdpr|lgpd)\\s+(?:copula\\s+)?${positiveModifiers}(?:certified|compliant|examined|attested|ready|certificad[ao]s?|em\\s+conformidade|auditad[ao]s?|pront[ao]s?)\\b`, "gu"),
  },
  {
    code: "certification_claim",
    pattern: /\b(?:certified|compliant|examined|attested|certificad[ao]s?|em\s+conformidade|auditad[ao]s?)\s+(?:under|against|for|pela?s?|com)\s+(?:soc\s*2|iso(?:\s+iec)?\s*27001|gdpr|lgpd)\b/gu,
  },
  {
    code: "pentest_claim",
    pattern: new RegExp(`\\b(?:pentest|pen\\s+test|penetration\\s+test|teste\\s+de\\s+(?:invas[aã]o|penetra[cç][aã]o))\\s+(?:copula\\s+)?${positiveModifiers}(?:passed|approved|completed|clean|verified|aprovad[ao]s?|conclu[ií]d[ao]s?|limp[ao]s?|verificad[ao]s?)\\b`, "gu"),
  },
  {
    code: "live_assurance_claim",
    pattern: new RegExp(`\\b(?:live|production|operating|produ[cç][aã]o|opera[cç][aã]o)\\s+(?:state\\s+)?(?:copula\\s+)?${positiveModifiers}(?:verified|attested|assured|proven|verificad[ao]s?|atestad[ao]s?|comprovad[ao]s?)\\b`, "gu"),
  },
  {
    code: "live_assurance_claim",
    pattern: /\b(?:verified|attested|assured|proven|verificad[ao]s?|atestad[ao]s?|comprovad[ao]s?)\s+(?:live|in\s+production|operating|em\s+produ[cç][aã]o|em\s+opera[cç][aã]o)\b/gu,
  },
];

function normalizeAssuranceText(output: string): string {
  return output
    .normalize("NFKC")
    // Format characters include zero-width joiners/spaces and soft hyphens. They must not split a
    // prohibited token (for example, `certi\u200bfied`).
    .replace(/\p{Cf}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/\b(?:has\s+been|have\s+been|has|have|is|are|was|were|est[aá]|est[aã]o|foi|foram|é)\b/gu, " copula ")
    .replace(/[\p{P}\p{S}\p{Z}\s]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function isExplicitlyNegated(normalized: string, matchIndex: number): boolean {
  const prefix = normalized.slice(Math.max(0, matchIndex - 48), matchIndex);
  return /(?:^|\s)(?:not|no|never|n[aã]o|nunca|sem)\s+(?:(?:currently|yet|ainda|copula)\s+){0,2}$/u.test(prefix);
}

/** Defense in depth for text that leaves the typed inventory as a human-readable assurance view. */
export function findForbiddenAssuranceClaims(output: string): ForbiddenAssuranceClaim[] {
  const normalized = normalizeAssuranceText(output);
  const findings: ForbiddenAssuranceClaim[] = [];
  for (const {code, pattern} of forbiddenPatterns) {
    pattern.lastIndex = 0;
    for (const match of normalized.matchAll(pattern)) {
      if (!isExplicitlyNegated(normalized, match.index)) findings.push({code, match: match[0]});
    }
  }
  return findings;
}
