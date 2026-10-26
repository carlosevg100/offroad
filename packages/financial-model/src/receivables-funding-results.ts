import {z} from "zod";
import {adoptedWeeklyCashOutputSchema} from "./ficha-calculation-results";

// The common adopted-result fields, taken from an existing adopted result so the shapes never drift.
const {schemaVersion: _s, analysisId: _a, perimeter: _p, weekly: _w, exclusions: _e, ...common} = adoptedWeeklyCashOutputSchema.shape;
const text = z.string().min(1).max(2000), decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/), version = z.string().min(1).max(160), date = z.iso.date();
const kind = z.enum(["anchor_program", "fidc", "bank_discount", "bank_line"]);
export const receivablesFundingExclusionReasons = ["zero_balance", "defaulted", "past_due", "remaining_term", "seasoning", "not_assignable", "evidence_unverified",
  "anchor_unverified", "registration_missing", "registration_conflict", "encumbered", "disputed", "related_party", "sector_outside_policy",
  "credit_tier_outside_policy", "debtor_sublimit", "not_offered_to_any_sale_option"] as const;
const reason = z.enum(receivablesFundingExclusionReasons);

export const receivablesFundingOutputSchema = z.strictObject({schemaVersion: z.literal("receivables-funding.v1"), version, currency: z.string().regex(/^[A-Z]{3}$/), referenceDate: date,
  need: z.strictObject({average: decimal, peak: decimal, startDate: date, calendarDays: z.number().int().min(1).max(3660), businessDays: z.number().int().min(1).max(2520),
    profile: z.enum(["seasonal", "structural"])}),
  portfolio: z.strictObject({gross: decimal, assignable: decimal, excluded: decimal,
    items: z.array(z.strictObject({itemId: version, label: text, amount: decimal, assignable: decimal, excluded: decimal, reasons: z.array(reason).max(17),
      curable: z.array(reason).max(2), encumbranceHolder: text.nullable(), releaseEvent: text.nullable()})).min(1).max(32),
    releases: z.array(z.strictObject({itemId: version, amount: decimal, holder: text, releaseEvent: text, assignableAfterRelease: decimal, verified: z.boolean()})).max(32)}),
  options: z.array(z.strictObject({id: version, label: text, kind, recourse: z.enum(["with_recourse", "without_recourse"]), indicative: z.literal(true),
    volume: decimal.nullable(), volumeVerified: z.boolean(),
    byItem: z.array(z.strictObject({itemId: version, offered: z.boolean(), reasons: z.array(reason).max(17), curable: z.array(reason).max(2), retained: decimal,
      sublimitVerified: z.boolean(), unverifiedBy: z.array(z.enum(["largest_debtor", "debtor_set_overlap"])).max(2), sublimitExcess: decimal})).max(32),
    rates: z.strictObject({basis: z.enum(["monthly", "annual", "di_plus"]), quoted: decimal, annualEffective: decimal, monthlyEquivalent: decimal, spreadOverDi: decimal}),
    cost: z.strictObject({amount: decimal, calendarDays: z.number().int(), businessDays: z.number().int(), draws: z.number().int().min(1).max(3660), iofDays: z.number().int().min(0).max(3660), interest: decimal, iof: decimal, fee: decimal,
      total: decimal, allInPeriod: decimal, allInAnnual: decimal}),
    iofApplies: z.boolean(), coversAverage: z.boolean().nullable(), coversPeak: z.boolean().nullable(),
    balanceSheet: z.enum(["derecognized", "tends_to_remain_as_liability", "liability"]), measuredDebtAdded: decimal,
    lien: z.enum(["not_a_guarantee_confirm_with_counsel", "uses_basket", "uses_basket_if_collateralized", "none"]), fitsLienBasket: z.boolean().nullable(),
    leadDays: z.strictObject({min: z.number().int().min(0), max: z.number().int().min(0)}).nullable()})).min(1).max(8),
  ranking: z.array(z.strictObject({id: version, total: decimal, differenceToBankLine: decimal.nullable()})).max(8),
  bankLine: version.nullable(),
  plan: z.strictObject({steps: z.array(z.strictObject({optionId: version, capacity: decimal, amount: decimal, cumulative: decimal})).max(8), covered: decimal, coversPeak: z.boolean(), reserve: version.nullable()}),
  timing: z.strictObject({startBy: date.nullable(), slackDays: z.number().int().nullable(), leadDaysMax: z.number().int().nullable(),
    conditionsPrecedent: z.array(z.strictObject({code: z.enum(["duplicata_registration", "other"]), amount: decimal})).max(2)}),
  dedicatedVehicle: z.strictObject({monthlyAssignable: decimal, thresholdMin: decimal, thresholdMax: decimal, profile: z.enum(["seasonal", "structural"]),
    reading: z.enum(["not_for_seasonal_need", "worth_studying", "below_threshold", "borderline"])}),
  questions: z.array(z.strictObject({code: z.enum(["anchor_program_of_restricted_debtor", "anchor_program_terms", "duplicata_registration_capability"]),
    itemId: version.nullable(), amount: decimal})).max(65),
  gaps: z.array(z.strictObject({item: text, reason: z.enum(["largest_debtor_not_informed", "debtor_set_not_declared_disjoint", "lead_time_not_informed"])})).max(40)});

export const receivablesFundingAdoptedExclusions = ["buyer_contact", "fund_selection", "credit_approval", "legal_opinion", "accounting_opinion", "debtor_dispute_and_related_party_screening", "method_release"] as const;
export const adoptedReceivablesFundingOutputSchema = z.strictObject({...common, schemaVersion: z.literal("adopted-receivables-funding.v1"),
  analysisId: z.uuid(), perimeter: text, funding: receivablesFundingOutputSchema.nullable(),
  exclusions: z.array(z.enum(receivablesFundingAdoptedExclusions)).length(7)
    .refine(v => v.join("|") === receivablesFundingAdoptedExclusions.join("|"), "Exact exclusion ledger required")});
