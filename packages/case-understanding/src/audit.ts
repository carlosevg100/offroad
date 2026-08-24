import Decimal from "decimal.js";
import type {ReconciledFact, TracedCalculation} from "@offroad/reconciliation";

/**
 * The rule that makes everything else trustworthy: no number appears that cannot be traced.
 *
 * Every sentence the system writes about a company — in the brief, in the teaser, in the term
 * sheet — is a claim, and a material claim carries the ids of the facts and calculations
 * behind it. This auditor is what stops the claim from being decorative: it re-reads the
 * sentence, finds the numbers actually written in it, and checks that each one appears in the
 * support. A model that writes "EBITDA of R$ 33.4 million" while citing a fact that says 33.0
 * has invented a number, and the citation makes it look worse rather than better.
 *
 * Deliberately blunt about what it lets through. Years, percentages, counts and ordinals are
 * not financial magnitudes and pass without support — otherwise "the three new stores" would
 * need a fact id and the prose would be unwritable. What must be supported is money and
 * multiples: the numbers a credit committee acts on.
 *
 * This runs before anything leaves the building, and a failure blocks rather than warns.
 */

export type AuditableClaim = {
  id: string;
  text: string;
  material: boolean;
  /** Fact keys and calculation ids this claim rests on. */
  supportIds: string[];
  kind: "fact" | "calculation" | "judgment" | "public_source";
  approved?: boolean;
};

export type AuditFinding = {
  claimId: string;
  reason:
    | "material_claim_without_support"
    | "support_not_found"
    | "number_not_in_support"
    | "material_judgment_without_approval";
  detail: string;
};

export type AuditReport = {
  status: "pass" | "blocked";
  /** Share of material claims that survived. */
  coverage: number;
  accepted: string[];
  findings: AuditFinding[];
};

/**
 * Numbers written in prose that a credit reader would act on.
 *
 * Matches Brazilian and international formatting, with an optional magnitude word, and skips
 * what is not a magnitude: a bare year, a percentage, a small ordinal.
 */
export function financialNumbersIn(text: string): string[] {
  const found: string[] = [];
  // Magnitude words are ordered longest-first: `mil` matches inside `milhões`, and an
  // alternation that tries it first turns "33,4 milhões" into thirty-three thousand.
  // Multiples come first because four decimal places in `2.8735x` are decimals, not a
  // thousands group followed by an unrelated digit.
  const pattern =
    /(?<![\w,.])((?:\d+[.,]\d+)(?=\s*x)|\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+[.,]\d+|\d+)\s*(bilh(?:ão|ões)|milh(?:ão|ões)|billion|million|thousand|mil|x)?/gi;

  for (const match of text.matchAll(pattern)) {
    const [whole, raw, magnitude] = match as unknown as [string, string, string | undefined];
    const end = (match.index ?? 0) + whole.length;

    // A percentage is a rate, not a magnitude to source.
    if (text.slice(end, end + 2).trimStart().startsWith("%")) continue;

    const hasSeparator = /[.,]/.test(raw);
    // "três lojas" is prose and "R$ 71 milhões" is a figure: a bare small integer only counts
    // when a magnitude word makes it one.
    if (!magnitude && !hasSeparator && raw.length < 4) continue;
    // A bare four-digit year is not a financial figure.
    if (!magnitude && !hasSeparator && /^(19|20)\d{2}$/.test(raw)) continue;

    found.push(normalizeNumber(raw, magnitude));
  }
  return found;
}

/** "1.234.567,89" → "1234567.89"; "33,4 milhões" → "33400000"; "2,87x" → "2.87". */
export function normalizeNumber(raw: string, magnitude?: string): string {
  const dots = (raw.match(/\./g) ?? []).length;
  const commas = (raw.match(/,/g) ?? []).length;
  let normalized = raw;

  if (dots > 0 && commas > 0) {
    const decimalSeparator = raw.lastIndexOf(".") > raw.lastIndexOf(",") ? "." : ",";
    normalized = raw.split(decimalSeparator === "." ? "," : ".").join("");
    if (decimalSeparator === ",") normalized = normalized.replace(",", ".");
  } else if (commas > 0) {
    // A trailing `x` denotes a multiple, so `1,452x` is one point four five two rather than
    // one thousand four hundred and fifty-two. The regex passes the `x` as the magnitude.
    if (magnitude?.toLowerCase() === "x") normalized = raw.replace(",", ".");
    // A single comma before exactly three digits is a thousands separator in en-US prose.
    else normalized = /,\d{3}$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(",", ".");
  } else if (dots > 0) {
    normalized = magnitude?.toLowerCase() === "x"
      ? raw
      : /\.\d{3}$/.test(raw) && dots >= 1 && !/\.\d{1,2}$/.test(raw)
        ? raw.replace(/\./g, "")
        : raw;
  }

  const value = new Decimal(normalized || "0");
  const multipliers: Record<string, string> = {
    mil: "1000",
    thousand: "1000",
    milhão: "1000000",
    milhões: "1000000",
    million: "1000000",
    bilhão: "1000000000",
    bilhões: "1000000000",
    billion: "1000000000",
  };
  const key = magnitude?.toLowerCase();
  const multiplier = key ? multipliers[key] : undefined;
  // Keep the precision written in multiples such as 1.452x. Currency claims still normalise
  // cleanly because Decimal removes insignificant trailing zeroes.
  return (multiplier ? value.times(multiplier) : value).toDecimalPlaces(8).toFixed();
}

/** Two figures agree if they round to the same number at the precision the prose used. */
function agrees(claimed: string, supported: string): boolean {
  const a = new Decimal(claimed);
  const b = new Decimal(supported);
  if (a.isZero() && b.isZero()) return true;
  if (a.isZero() || b.isZero()) return false;
  // Prose rounds; 33.4 million against 33,412,880 is the same fact stated readably.
  return b.minus(a).abs().dividedBy(b.abs()).lte("0.02");
}

/** A text fact may contain punctuation that resembles a malformed decimal, such as `S.A.`. */
function numericSupport(value: string): string | null {
  const candidate = value.replace(/[^\d.-]/g, "");
  if (!candidate) return null;
  try {
    return new Decimal(candidate).isFinite() ? value : null;
  } catch {
    return null;
  }
}

export function auditClaims(input: {
  claims: readonly AuditableClaim[];
  facts: readonly ReconciledFact[];
  calculations: readonly TracedCalculation[];
}): AuditReport {
  const factById = new Map<string, string>();
  for (const fact of input.facts) {
    const key = [fact.key.fieldPath, fact.key.periodEnd ?? ""].join("|");
    factById.set(key, fact.value);
    factById.set(fact.key.fieldPath, fact.value);
  }
  for (const calculation of input.calculations) factById.set(calculation.id, calculation.value);

  const findings: AuditFinding[] = [];
  const accepted: string[] = [];

  for (const claim of input.claims) {
    if (!claim.material) {
      accepted.push(claim.id);
      continue;
    }

    if (claim.supportIds.length === 0) {
      findings.push({claimId: claim.id, reason: "material_claim_without_support", detail: "nenhum id de suporte"});
      continue;
    }

    const unknown = claim.supportIds.filter((id) => !factById.has(id));
    if (unknown.length > 0) {
      findings.push({claimId: claim.id, reason: "support_not_found", detail: unknown.join(", ")});
      continue;
    }

    if (claim.kind === "judgment" && !claim.approved) {
      findings.push({claimId: claim.id, reason: "material_judgment_without_approval", detail: "julgamento material sem aprovação"});
      continue;
    }

    const supported = claim.supportIds
      .map((id) => numericSupport(factById.get(id)!))
      .filter((value): value is string => value !== null);
    const written = financialNumbersIn(claim.text);
    const unsupported = written.filter((number) => !supported.some((value) => agrees(number, value)));

    if (unsupported.length > 0) {
      findings.push({
        claimId: claim.id,
        reason: "number_not_in_support",
        detail: `${unsupported.join(", ")} não aparece(m) em nenhum fato ou cálculo citado`,
      });
      continue;
    }

    accepted.push(claim.id);
  }

  const material = input.claims.filter((claim) => claim.material);
  const acceptedMaterial = material.filter((claim) => accepted.includes(claim.id)).length;

  return {
    status: findings.length === 0 ? "pass" : "blocked",
    coverage: material.length === 0 ? 1 : Number((acceptedMaterial / material.length).toFixed(4)),
    accepted,
    findings,
  };
}
