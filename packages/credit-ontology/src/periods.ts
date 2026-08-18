import {z} from "zod";

export const periodKindSchema = z.enum(["month", "quarter", "year", "ytd", "ltm", "projection"]);
export type PeriodKind = z.infer<typeof periodKindSchema>;

/** Assurance/basis of the numbers in a period (never mixed in one series). */
export const accountingBasisSchema = z.enum(["audited", "reviewed", "accounting", "management", "projection"]);
export type AccountingBasis = z.infer<typeof accountingBasisSchema>;

export const entityScopeSchema = z.enum(["consolidated", "standalone", "segment"]);
export type EntityScope = z.infer<typeof entityScopeSchema>;

export const entityRoleSchema = z.enum(["borrower", "holding", "subsidiary", "guarantor", "related_party", "other"]);
export type EntityRole = z.infer<typeof entityRoleSchema>;

export const canonicalPeriodSchema = z.object({
  kind: periodKindSchema,
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  fiscalYear: z.number().int().min(1990).max(2100).optional(),
  /** Months covered (1 for month, 3 for quarter, 12 for year/ltm, n for ytd). */
  months: z.number().int().min(1).max(60),
});
export type CanonicalPeriod = z.infer<typeof canonicalPeriodSchema>;

/**
 * Parses the compact period tokens used in field paths:
 * `2025` (year), `2026_07` (interim ending July 2026), `2026_07m7`? — no: the
 * fixture encodes YTD length in the metric suffix (`revenue_7m`); this helper
 * only turns the token into calendar bounds. Returns null when unparseable.
 */
export function parsePeriodToken(token: string): {startsOn: string; endsOn: string; kind: PeriodKind; fiscalYear: number} | null {
  const year = /^(\d{4})$/.exec(token);
  if (year) {
    const y = Number(year[1]);
    return {startsOn: `${y}-01-01`, endsOn: `${y}-12-31`, kind: "year", fiscalYear: y};
  }
  const month = /^(\d{4})_(\d{2})$/.exec(token);
  if (month) {
    const y = Number(month[1]);
    const m = Number(month[2]);
    if (m < 1 || m > 12) return null;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const mm = String(m).padStart(2, "0");
    return {startsOn: `${y}-${mm}-01`, endsOn: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`, kind: "month", fiscalYear: y};
  }
  return null;
}

/** LTM is always derived: 12M prior + YTD current − YTD prior (Blueprint §15). */
export const ltmDerivation = {
  formula: "annual_prior + ytd_current - ytd_prior",
  requires: ["annual_prior", "ytd_current", "ytd_prior"] as const,
};
