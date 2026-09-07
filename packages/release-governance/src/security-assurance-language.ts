export type ForbiddenAssuranceClaim = {
  code: "certification_claim" | "pentest_claim" | "live_assurance_claim";
  match: string;
};

type ClaimFamily = {
  code: ForbiddenAssuranceClaim["code"];
  subject: RegExp;
  predicate: RegExp;
};

/*
 * Assurance is a proposition, not a keyword pair. Each family identifies its subject and complete
 * predicate independently. This admits auxiliaries and adverbs between them (for example, "has
 * successfully been certified") while the polarity pass below decides whether the predicate is
 * asserted or explicitly negated.
 */
const claimFamilies: readonly ClaimFamily[] = [
  {
    code: "certification_claim",
    subject: /\b(?:soc\s*2(?:\s+type\s+(?:i|ii|1|2))?|iso(?:\s+iec)?\s*27001|gdpr|lgpd)\b/gu,
    predicate: /\b(?:certified|compliant|examined|attested|ready|certificad[ao]s?|auditad[ao]s?|pront[ao]s?|em\s+conformidade)\b/gu,
  },
  {
    code: "pentest_claim",
    subject: /\b(?:pentest|pen\s+test|penetration\s+test|teste\s+de\s+(?:invas[aã]o|penetra[cç][aã]o))\b/gu,
    predicate: /\b(?:passed|approved|completed|clean|verified|validated|aprovad[ao]s?|conclu[ií]d[ao]s?|limp[ao]s?|verificad[ao]s?|validad[ao]s?)\b/gu,
  },
  {
    code: "live_assurance_claim",
    subject: /\b(?:live|production(?:\s+controls?)?|operating|produ[cç][aã]o(?:\s+controles?)?|opera[cç][aã]o)\b/gu,
    predicate: /\b(?:verified|validated|attested|assured|proven|verificad[ao]s?|validad[ao]s?|atestad[ao]s?|comprovad[ao]s?)\b/gu,
  },
];

const maximumBridgeTokens = 12;
const maximumPolarityTokens = 12;
const negationToken = /^(?:not|no|never|without|neither|nor|n[aã]o|nunca|jamais|sem)$/u;
const contractionNegation = /\b(?:isn t|aren t|wasn t|weren t|hasn t|haven t|hadn t|didn t|doesn t|don t)\b/u;
const contrastBoundary = /\b(?:but|however|although|and|mas|por[eé]m|contudo|todavia|e)\b/gu;
const deferredPredicate = /\b(?:yet\s+to\s+be|still\s+to\s+be|ainda\s+(?:por\s+ser|n[aã]o))\s*$/u;

type LocatedText = {start: number; end: number; text: string};

function normalizeAssuranceClauses(output: string): string[] {
  return output
    .normalize("NFKC")
    // Format characters include zero-width joiners/spaces and soft hyphens. They must not split a
    // prohibited token (for example, `certi\u200bfied`).
    .replace(/\p{Cf}/gu, "")
    .toLocaleLowerCase("en-US")
    // Sentence punctuation ends polarity scope. Colons and dashes intentionally do not:
    // "Pentest: passed" and "SOC 2—certified" are single propositions.
    .replace(/[.!?;\r\n]+/gu, "\n")
    .split("\n")
    .map((clause) => clause.replace(/[\p{P}\p{S}\p{Z}\s]+/gu, " ").trim().replace(/\s+/gu, " "))
    .filter(Boolean);
}

function locate(pattern: RegExp, clause: string): LocatedText[] {
  pattern.lastIndex = 0;
  return [...clause.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    text: match[0],
  }));
}

function bridgeTokenCount(left: LocatedText, right: LocatedText, clause: string): number {
  const start = Math.min(left.end, right.end);
  const end = Math.max(left.start, right.start);
  if (end <= start) return 0;
  return clause.slice(start, end).trim().split(/\s+/u).filter(Boolean).length;
}

function predicateIsNegated(clause: string, predicateStart: number): boolean {
  let prefix = clause.slice(0, predicateStart);
  let lastBoundaryEnd = 0;
  contrastBoundary.lastIndex = 0;
  for (const boundary of prefix.matchAll(contrastBoundary)) lastBoundaryEnd = boundary.index + boundary[0].length;
  prefix = prefix.slice(lastBoundaryEnd).trim();

  if (deferredPredicate.test(prefix)) return true;

  const tokens = prefix.split(/\s+/u).filter(Boolean).slice(-maximumPolarityTokens);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (!negationToken.test(tokens[index]!)) continue;
    // "not only certified" is additive emphasis, not negative polarity.
    if (tokens[index] === "not" && tokens[index + 1] === "only") continue;
    return true;
  }
  return contractionNegation.test(prefix);
}

/** Defense in depth for text that leaves the typed inventory as a human-readable assurance view. */
export function findForbiddenAssuranceClaims(output: string): ForbiddenAssuranceClaim[] {
  const findings: ForbiddenAssuranceClaim[] = [];
  const seen = new Set<string>();
  for (const clause of normalizeAssuranceClauses(output)) {
    for (const family of claimFamilies) {
      const subjects = locate(family.subject, clause);
      const predicates = locate(family.predicate, clause);
      for (const subject of subjects) {
        for (const predicate of predicates) {
          if (bridgeTokenCount(subject, predicate, clause) > maximumBridgeTokens) continue;
          if (predicateIsNegated(clause, predicate.start)) continue;
          const start = Math.min(subject.start, predicate.start);
          const end = Math.max(subject.end, predicate.end);
          const match = clause.slice(start, end);
          const key = `${family.code}:${match}`;
          if (seen.has(key)) continue;
          findings.push({code: family.code, match});
          seen.add(key);
        }
      }
    }
  }
  return findings;
}
