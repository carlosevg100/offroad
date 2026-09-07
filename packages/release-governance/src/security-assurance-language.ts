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
    predicate: /\b(?:certified|compliant|examined|attested|ready|complete|issued|certificad[ao]s?|auditad[ao]s?|pront[ao]s?|complet[ao]s?|conclu[ií]d[ao]s?|emitid[ao]s?|vigente|em\s+conformidade)\b/gu,
  },
  {
    code: "pentest_claim",
    subject: /\b(?:pentest|pen\s+test|penetration\s+test(?:ing)?|teste\s+de\s+(?:invas[aã]o|penetra[cç][aã]o))\b/gu,
    predicate: /\b(?:passed|approved|completed|clean|verified|validated|aprovad[ao]s?|conclu[ií]d[ao]s?|limp[ao]s?|verificad[ao]s?|validad[ao]s?)\b/gu,
  },
  {
    code: "live_assurance_claim",
    subject: /\b(?:live|production(?:\s+controls?)?|operating|produ[cç][aã]o(?:\s+controles?)?|opera[cç][aã]o)\b/gu,
    predicate: /\b(?:passed|verified|validated|attested|assured|proven|audited|aprovad[ao]s?|verificad[ao]s?|validad[ao]s?|atestad[ao]s?|comprovad[ao]s?|auditad[ao]s?)\b/gu,
  },
];

const maximumBridgeTokens = 12;
const maximumPolarityTokens = 12;
const negationToken = /^(?:not|no|never|without|neither|nor|cannot|n[aã]o|nunca|jamais|sem)$/u;
const contractionNegation = /\b(?:isn t|aren t|wasn t|weren t|hasn t|haven t|hadn t|didn t|doesn t|don t|can t|couldn t|shouldn t|won t)\b/u;
const contrastBoundary = /\b(?:but|however|although|and|mas|por[eé]m|contudo|todavia|e)\b/gu;
const deferredPredicate = /\b(?:yet\s+to\s+be|still\s+(?:needs?\s+to\s+be|must\s+be|to\s+be)|needs?\s+to\s+be|ainda\s+(?:por\s+ser|precisa\s+ser|deve\s+ser|n[aã]o))\s*$/u;
const futurePredicate = /(?:^|\s)(?:will|shall|going\s+to|scheduled\s+to|expected\s+to|planned\s+to|vai\s+ser|ser[aá]|ser[aã]o|estar[aá]|estar[aã]o)(?=\s|$)/u;
const subordinateAssuranceObject = /\b(?:gap|readiness)\s+assessment\b|\b(?:remediation|implementation)\s+(?:plan|project|roadmap)\b|\bcertification\s+(?:plan|project|roadmap)\b|\b(?:avalia[cç][aã]o\s+de\s+lacunas|plano\s+de\s+remedia[cç][aã]o|projeto\s+de\s+certifica[cç][aã]o)\b/u;

const compactDashBeforeAssuranceSubject = new RegExp(
  String.raw`[\u2014\u2013-](?=\s*(?:${claimFamilies.map(({subject}) => subject.source).join("|")}))`,
  "gu",
);

type LocatedText = {start: number; end: number; text: string};

function normalizeAssuranceClauses(output: string): string[] {
  return output
    .normalize("NFKC")
    // Format characters include zero-width joiners/spaces and soft hyphens. They must not split a
    // prohibited token (for example, `certi\u200bfied`).
    .replace(/\p{Cf}/gu, "")
    .toLocaleLowerCase("en-US")
    // ISO/IEC is one standard name, not two assurance propositions separated by a slash.
    .replace(/\biso\s*\/\s*iec\b/gu, "iso iec")
    // A compact dash starts a new proposition only when its right side is another assurance
    // subject. This separates "not certified—ISO 27001 is certified" without breaking the
    // label-value compounds "SOC 2—certified" and "SOC 2-certified".
    .replace(/[.!?;\r\n]+/gu, "\n")
    .replace(compactDashBeforeAssuranceSubject, "\n")
    .replace(/\s+[\u2014\u2013-]\s+|[,/]+|\b(?:while|enquanto)\b/gu, "\n")
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

function localPairStart(clause: string, pairStart: number) {
  const priorTokens = [...clause.slice(0, pairStart).matchAll(/\S+/gu)];
  return priorTokens.at(-maximumPolarityTokens)?.index ?? 0;
}

function predicateIsNegated(clause: string, subject: LocatedText, predicate: LocatedText): boolean {
  const pairStart = Math.min(subject.start, predicate.start);
  let prefix = clause.slice(localPairStart(clause, pairStart), predicate.start);
  let lastBoundaryEnd = 0;
  contrastBoundary.lastIndex = 0;
  for (const boundary of prefix.matchAll(contrastBoundary)) lastBoundaryEnd = boundary.index + boundary[0].length;
  prefix = prefix.slice(lastBoundaryEnd).trim();

  if (deferredPredicate.test(prefix) || futurePredicate.test(prefix)) return true;

  const tokens = prefix.split(/\s+/u).filter(Boolean).slice(-maximumPolarityTokens);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (!negationToken.test(tokens[index]!)) continue;
    // "not only certified" is additive emphasis, not negative polarity.
    if (tokens[index] === "not" && tokens[index + 1] === "only") continue;
    return true;
  }
  return contractionNegation.test(prefix);
}

function predicateDescribesSubordinateObject(clause: string, subject: LocatedText, predicate: LocatedText): boolean {
  const start = Math.min(subject.start, predicate.start);
  const end = Math.max(subject.end, predicate.end);
  return subordinateAssuranceObject.test(clause.slice(start, end));
}

/** Defense in depth for text that leaves the typed inventory as a human-readable assurance view. */
export function findForbiddenAssuranceClaims(output: string): ForbiddenAssuranceClaim[] {
  const findings: ForbiddenAssuranceClaim[] = [];
  const seen = new Set<string>();
  for (const clause of normalizeAssuranceClauses(output)) {
    for (const family of claimFamilies) {
      const subjects = locate(family.subject, clause);
      const predicates = locate(family.predicate, clause);
      for (const predicate of predicates) {
        const subject = subjects
          .map((candidate) => ({candidate, distance: bridgeTokenCount(candidate, predicate, clause)}))
          .filter(({distance}) => distance <= maximumBridgeTokens)
          .sort((left, right) => left.distance - right.distance || left.candidate.start - right.candidate.start)[0]?.candidate;
        if (!subject
          || predicateIsNegated(clause, subject, predicate)
          || predicateDescribesSubordinateObject(clause, subject, predicate)) continue;
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
  return findings;
}
