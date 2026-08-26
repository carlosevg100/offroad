import {createHash} from "node:crypto";
import {z} from "zod";

/**
 * Market-sensitive numbers and house policy parameters live here, not inside procedure prose.
 * Missing values are explicit blockers. They are never replaced by a model estimate.
 */
export const referenceDataRegistryVersion = "2026.08.26-v6";

export const referenceDataStatusSchema = z.enum(["required_missing", "draft", "approved", "expired"]);
export type ReferenceDataStatus = z.infer<typeof referenceDataStatusSchema>;

export const referenceDataEntrySchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
  version: z.string().regex(/^\d{4}\.\d{2}\.\d{2}-v\d+$/),
  category: z.enum(["house_policy", "market_observation", "scenario", "legal_reference", "methodology_parameter"]),
  status: referenceDataStatusSchema,
  description: z.string().trim().min(1),
  value: z.union([z.number(), z.string(), z.boolean(), z.record(z.string(), z.unknown()), z.array(z.unknown())]).nullable(),
  unit: z.string().trim().min(1).nullable(),
  source: z.object({
    title: z.string().trim().min(1),
    url: z.url().optional(),
    observedBy: z.string().trim().min(1).optional(),
  }).nullable(),
  asOf: z.iso.date().nullable(),
  validUntil: z.iso.date().nullable(),
  owner: z.string().trim().min(1),
  scope: z.string().trim().min(1),
  houseProcedureIds: z.array(z.string().regex(/^(IN|EMP|Q|D|OP|ES|PR|MA|MK|RF|LC)-\d{2}$/)).min(1),
}).strict().superRefine((entry, context) => {
  if (entry.status !== "approved") return;
  if (entry.value === null) context.addIssue({code: "custom", path: ["value"], message: "approved reference data requires a value"});
  if (entry.source === null) context.addIssue({code: "custom", path: ["source"], message: "approved reference data requires a source"});
  if (entry.asOf === null) context.addIssue({code: "custom", path: ["asOf"], message: "approved reference data requires an as-of date"});
  if (entry.validUntil === null) context.addIssue({code: "custom", path: ["validUntil"], message: "approved reference data requires an expiry date"});
});
export type ReferenceDataEntry = z.infer<typeof referenceDataEntrySchema>;

const missing = (
  key: string,
  category: ReferenceDataEntry["category"],
  description: string,
  owner: string,
  houseProcedureIds: string[],
): ReferenceDataEntry => referenceDataEntrySchema.parse({
  key,
  version: referenceDataRegistryVersion,
  category,
  status: "required_missing",
  description,
  value: null,
  unit: null,
  source: null,
  asOf: null,
  validUntil: null,
  owner,
  scope: "growth_capex vertical and reusable house procedure compilation",
  houseProcedureIds,
});

/**
 * This first registry is intentionally honest: it records every value family required by the
 * candidate vertical and keeps it blocked until a dated source and accountable owner exist.
 */
export const referenceDataRegistry = [
  missing("policy.intake.request_batch.max_items", "house_policy", "Maximum number of active client requests in one intake batch.", "Head de Operações e Evidências", ["IN-13", "IN-14"]),
  missing("policy.intake.archetype-requirements", "house_policy", "Minimum, target and ideal evidence requirements and accepted substitutes by financing archetype.", "Head de Operações e Evidências", ["IN-03", "IN-04", "IN-05", "IN-06", "IN-07", "IN-08", "IN-09", "IN-10", "IN-11", "IN-12"]),
  missing("policy.privacy.permitted-background-sources", "legal_reference", "Permitted sources, purposes, access controls, retention and review requirements for company and controller background checks.", "Responsável de Privacidade e Jurídico", ["EMP-13", "EMP-14", "LC-08"]),
  missing("policy.reconciliation.tolerance", "methodology_parameter", "Numerical tolerance by statement, currency, scale and period for reconciliation gates.", "Head de Análise Financeira", ["Q-13", "Q-16", "Q-17"]),
  missing("policy.financial.materiality", "methodology_parameter", "Materiality thresholds by statement, account, currency, scale, period and data quality.", "Head de Análise Financeira", ["Q-01", "Q-04", "Q-05", "Q-07", "Q-09", "Q-12", "Q-15", "D-01"]),
  missing("policy.financial.normalization", "methodology_parameter", "Approved treatment catalogue for reported, reclassified, adjusted and scenario financial views.", "Head de Análise Financeira", ["Q-01", "Q-02", "Q-12"]),
  missing("policy.cash-flow.bridge", "methodology_parameter", "Complete bridge from EBITDA to CFADS and cash available for debt service, including lease convention and restricted cash.", "Head de Análise Financeira", ["Q-02", "D-08", "D-26"]),
  missing("policy.capex.maintenance", "methodology_parameter", "Asset-specific maintenance-capex estimation hierarchy, confidence bands and evidence requirements.", "Head de Análise Financeira", ["Q-03", "EMP-19", "OP-02"]),
  missing("policy.revenue-quality.cutoff", "methodology_parameter", "Sector and seasonality-aware cut-off, returns and end-of-period concentration rules.", "Head de Análise Financeira", ["Q-05", "RF-08"]),
  missing("policy.related-party.materiality", "methodology_parameter", "Materiality and treatment rules for related-party revenue, cost, loans and guarantees.", "Head de Análise Financeira", ["Q-07", "D-10", "D-11", "RF-09"]),
  missing("policy.seasonality.materiality", "methodology_parameter", "Seasonality windows and amplitude bands used in liquidity, working-capital and debt-service design.", "Head de Análise Financeira", ["Q-04", "Q-11", "ES-08", "ES-24"]),
  missing("policy.currency.exposure", "methodology_parameter", "Materiality, mix window and scenario conventions for currency exposure and hedging.", "Head de Análise Financeira", ["Q-12", "D-12", "D-13", "D-27"]),
  missing("policy.receivables.aging", "methodology_parameter", "Aging buckets, renegotiation treatment, provision coverage and eligibility methodology by portfolio.", "Head de Análise Financeira", ["Q-14", "D-07", "ES-11", "ES-12", "RF-02"]),
  missing("policy.debt.views", "methodology_parameter", "Required reconciled debt views and inclusion rules by analytical purpose.", "Head de Análise Financeira", ["D-01", "D-07", "D-16", "D-24"]),
  missing("policy.debt.cost-reconciliation", "methodology_parameter", "Cost, balance, period and component conventions for reconciling debt expense.", "Head de Análise Financeira", ["D-02", "D-17", "D-25"]),
  missing("policy.debt.maturity-concentration", "methodology_parameter", "Maturity concentration and refinancing-risk bands by debt type and borrower profile.", "Head de Análise Financeira", ["D-03", "D-18", "ES-10"]),
  missing("policy.debt.renewal-scenarios", "scenario", "Renewal assumptions by facility commitment, tenor, creditor behavior and scenario.", "Head de Análise Financeira", ["D-05", "D-21", "D-28"]),
  missing("policy.concentration.materiality", "methodology_parameter", "Materiality bands for customer, supplier, creditor and revenue concentration findings.", "Head de Análise Financeira", ["EMP-03", "EMP-10", "D-04"]),
  missing("policy.business_plan.scenarios", "house_policy", "Minimum base, downside and sensitivity scenario definitions by archetype.", "Head de DCM e Estruturação", ["EMP-07", "EMP-08", "Q-10", "Q-11"]),
  missing("policy.capacity.minimum_headroom", "house_policy", "Minimum headroom methodology by metric, business profile and downside.", "Head de DCM e Estruturação", ["D-26", "ES-04", "ES-25", "ES-27"]),
  missing("scenario.interest_rate.parallel_shock", "scenario", "Versioned interest-rate shock used in debt-service and covenant sensitivities.", "Head de Análise Financeira", ["D-27"]),
  missing("scenario.market.multi-factor", "scenario", "Governed base, downside and severe scenarios across rates, inflation, foreign exchange and correlated operating effects.", "Head de Análise Financeira", ["D-27", "OP-04", "MA-13"]),
  missing("scenario.short_term_non_renewal", "scenario", "Versioned assumptions for non-renewal of short-term lines.", "Head de Análise Financeira", ["D-28"]),
  missing("policy.transaction-sizing.materiality", "house_policy", "Materiality for request-to-calculated differences, residual uses, buffers and excess funding.", "Head de DCM e Estruturação", ["OP-01", "OP-02", "OP-07", "ES-45"]),
  missing("policy.transaction-sizing.residual", "house_policy", "Zero or explicitly approved residual tolerance for sources-and-uses identities by currency and scale.", "Head de DCM e Estruturação", ["OP-02"]),
  missing("policy.transaction-sizing.execution-buffer", "house_policy", "Permitted execution-buffer methodology by archetype and project maturity.", "Head de DCM e Estruturação", ["OP-01", "OP-07"]),
  missing("policy.transaction-costs", "methodology_parameter", "Complete transaction-cost catalogue and treatment by instrument and source of payment.", "Head de DCM e Estruturação", ["OP-01", "OP-02", "OP-03"]),
  missing("policy.conditions-precedent.catalogue", "house_policy", "Conditions-precedent catalogue by use of proceeds, archetype and evidence required for satisfaction.", "Head de DCM e Estruturação", ["OP-09"]),
  missing("policy.disbursement.lag", "methodology_parameter", "Maximum permitted lag between physical uses and financing availability by archetype.", "Head de DCM e Estruturação", ["OP-08", "OP-11"]),
  missing("policy.mixed-use.general-purpose", "house_policy", "Maximum unidentified general-corporate-purpose use and classification rules for mixed-use operations.", "Head de DCM e Estruturação", ["OP-13"]),
  missing("policy.wait-analysis", "house_policy", "Required comparison of waiting cost, expected structural gain, milestone and client decision.", "Head de DCM e Estruturação", ["OP-12"]),
  missing("policy.structure.collateral_haircuts", "methodology_parameter", "Collateral-specific eligibility, haircut and coverage conventions.", "Head de DCM e Estruturação", ["ES-08", "ES-09", "ES-10", "ES-11", "ES-12", "ES-13", "ES-14", "ES-15", "ES-16", "ES-17", "ES-18", "ES-19"]),
  missing("policy.structure.covenant_headroom", "methodology_parameter", "Covenant calibration and minimum headroom conventions by metric and downside.", "Head de DCM e Estruturação", ["ES-23", "ES-24", "ES-25", "ES-26", "ES-27", "ES-28", "ES-29", "ES-30", "ES-31", "ES-32"]),
  missing("policy.structure.leverage-bands", "market_observation", "Versioned leverage bands by sector, cyclicality, size, security and risk profile.", "Head de DCM e Estruturação", ["ES-01", "ES-03", "ES-23", "ES-45"]),
  missing("policy.structure.coverage-floors", "house_policy", "Minimum DSCR and auxiliary ICR floors by profile, scenario and amortisation format.", "Head de DCM e Estruturação", ["ES-02", "ES-03", "ES-04", "ES-05", "ES-24"]),
  missing("policy.structure.repayment-design", "methodology_parameter", "Rules for SAC, Price, bullet, balloon, grace, PIK, seasonality and ramp-up design.", "Head de DCM e Estruturação", ["ES-05", "ES-06", "ES-07", "ES-08", "ES-09"]),
  missing("policy.structure.construction-delay", "methodology_parameter", "Required delay margin by project and construction archetype.", "Head de DCM e Estruturação", ["ES-09"]),
  missing("policy.structure.reserve-account", "house_policy", "Reserve-account sizing, funding, replenishment and lock-up mechanics by risk profile.", "Head de DCM e Estruturação", ["ES-08", "ES-09", "ES-17", "ES-25"]),
  missing("policy.structure.collateral-coverage", "market_observation", "Minimum post-haircut collateral coverage by borrower and facility profile.", "Head de DCM e Estruturação", ["ES-03", "ES-11", "ES-13", "ES-20"]),
  missing("policy.structure.appraisal-validity", "house_policy", "Maximum appraisal age and independence requirements by asset class.", "Head de DCM e Estruturação", ["ES-13", "ES-15"]),
  missing("policy.structure.maturity-concentration", "house_policy", "Maximum consolidated maturity concentration by period and borrower profile.", "Head de DCM e Estruturação", ["ES-10", "ES-42"]),
  missing("policy.structure.cross-default-threshold", "house_policy", "Cross-default threshold and scope by company size and group perimeter.", "Head de DCM e Estruturação", ["ES-28", "ES-33"]),
  missing("policy.structure.reporting-cadence", "house_policy", "Feasible information obligations and delivery windows by reporting capability.", "Head de DCM e Estruturação", ["ES-30"]),
  missing("policy.structure.cure-waiver", "house_policy", "Cure periods, equity-cure limits and waiver process by event type.", "Head de DCM e Estruturação", ["ES-32", "ES-33"]),
  missing("policy.structure.acceleration-events", "legal_reference", "Current calibrated catalogue of indicative acceleration events and materiality conventions.", "Head Jurídico e Head de DCM", ["ES-33", "ES-34", "ES-35"]),
  missing("policy.structure.corporate-authority", "legal_reference", "Corporate authorisation and guarantee-capacity requirements by issuer and guarantor legal form.", "Head Jurídico e Head de DCM", ["ES-36", "ES-37", "ES-42"]),
  missing("policy.structure.intercreditor", "legal_reference", "Intercreditor trigger, priority, standstill and consent requirements.", "Head Jurídico e Head de DCM", ["ES-22", "ES-39", "ES-42"]),
  missing("policy.structure.minimum-sellable", "market_observation", "Minimum sellable structure and complexity budget by ticket, buyer type and execution route.", "Head de Mercado e Distribuição", ["ES-40", "ES-41", "ES-44"]),
  missing("policy.structure.route-catalogue", "legal_reference", "Versioned separation of asset, obligation document, financing mechanism, vehicle, investor and required service providers.", "Head Jurídico e Head de DCM", ["ES-41", "ES-44"]),
  missing("policy.structure.mandate-ticket", "market_observation", "Confirmed ticket and indivisibility constraints from currently aligned mandates.", "Head de Mercado e Distribuição", ["ES-41", "ES-45"]),
  missing("market.pricing.curves", "market_observation", "Comparable private-credit pricing observations normalized for index, date, tenor, size and security.", "Head de Mercado e Distribuição", ["PR-01", "PR-02", "PR-03", "PR-04", "PR-05", "PR-06", "PR-07", "PR-10", "PR-11", "PR-12", "PR-13"]),
  missing("policy.pricing.sample-quality", "methodology_parameter", "Minimum sample, comparability, weighting, validity and abstention rules for pricing references.", "Head de Mercado e Distribuição", ["PR-01", "PR-02", "PR-03", "PR-04", "PR-07", "PR-09", "PR-12"]),
  missing("policy.pricing.communication-width", "house_policy", "Minimum and maximum supported width for communicating an indicative pricing range.", "Head de Mercado e Distribuição", ["PR-01", "PR-09"]),
  missing("policy.pricing.regime", "methodology_parameter", "Current market-regime identifier and the recorded conditions that invalidate prior observations.", "Head de Mercado e Distribuição", ["PR-02", "PR-07", "PR-12", "PR-13"]),
  missing("market.pricing.security-premiums", "market_observation", "Observed paired security-package deltas with count, source, date and validity.", "Head de Mercado e Distribuição", ["PR-03", "PR-08"]),
  missing("market.pricing.tenor-curve", "market_observation", "Observed tenor curve and appetite breakpoints by risk profile.", "Head de Mercado e Distribuição", ["PR-04"]),
  missing("market.pricing.size-liquidity", "market_observation", "Observed ticket, fixed-cost, liquidity and distribution adjustments.", "Head de Mercado e Distribuição", ["PR-05"]),
  missing("market.pricing.indexer-basis", "market_observation", "Current indexer curves, mandate acceptance and normalization bases.", "Head de Mercado e Distribuição", ["PR-02", "PR-06", "PR-10"]),
  missing("policy.pricing.cost-catalogue", "methodology_parameter", "Source hierarchy and annualization method for issuance, legal, security, monitoring and distribution costs.", "Head de DCM e Estruturação", ["PR-10", "PR-11"]),
  missing("market.pricing.observation-registry", "market_observation", "Authorized pricing observations with source, status, quality, confidentiality and aggregate-use controls.", "Head de Mercado e Distribuição", ["PR-02", "PR-07", "PR-12", "PR-13"]),
  missing("market.instrument.eligibility", "legal_reference", "Current legal, corporate and operational eligibility constraints by instrument and structure.", "Head de DCM e Estruturação", ["ES-03", "ES-42", "ES-43"]),
  missing("market.mandates", "market_observation", "Versioned institution, vehicle, mandate, contact and appetite observations used for screening.", "Head de Mercado e Distribuição", ["MK-01", "MK-02", "MK-03", "MK-04", "MK-05", "MK-06", "MK-07", "MK-08", "MK-09", "MK-10", "MK-11", "MK-12", "MK-13", "MK-14"]),
  missing("policy.market.mandate_max_age", "house_policy", "Maximum age by mandate field before it becomes stale or requires confirmation.", "Head de Mercado e Distribuição", ["MK-11", "MK-12", "MK-13"]),
  missing("policy.market.distribution-waves", "house_policy", "Authorized recipient limits, learning gates and expansion conditions for qualified introductions.", "Head de Mercado e Distribuição", ["MK-15", "MK-16", "MK-17", "MK-18"]),
  missing("policy.material.question-sets", "house_policy", "Versioned anticipated Q&A coverage by archetype and materiality.", "Head de Materiais Institucionais", ["MA-22", "MA-23"]),
  missing("policy.material.numeric_rounding", "house_policy", "Rounding, display and cross-material comparison rules for every financial metric.", "Head de Materiais Institucionais", ["MA-28", "MA-30", "MA-31"]),
  missing("policy.qc.numeric_tolerance", "house_policy", "Independent QC tolerances by calculation and material output, including zero-tolerance identities.", "Responsável independente de Quality Control", ["MA-31", "MA-32", "LC-01"]),
  missing("policy.red-flags.detectors", "methodology_parameter", "Versioned detector windows, thresholds, evidence minima and known false positives for RF-01 through RF-17.", "Head de DCM e Quality Control", ["RF-01", "RF-02", "RF-03", "RF-04", "RF-05", "RF-06", "RF-07", "RF-08", "RF-09", "RF-10", "RF-11", "RF-12", "RF-13", "RF-14", "RF-15", "RF-16", "RF-17"]),
  missing("policy.red-flags.materiality", "house_policy", "Severity, family composition, escalation, external-output blocking and mandate-decision rules.", "Head de DCM e Quality Control", ["RF-18", "RF-19"]),
  missing("policy.red-flags.response-sla", "house_policy", "Operational response windows, acceptable substitutes and decline-communication timing.", "Head de DCM e Quality Control", ["RF-15", "RF-20"]),
  missing("market.peer-benchmarks", "market_observation", "Dated peer and sector operating ranges used only when comparability and source are governed.", "Head de Análise Financeira", ["RF-03"]),
] as const satisfies readonly ReferenceDataEntry[];

export const referenceDataKeys = referenceDataRegistry.map((entry) => entry.key);
export const referenceDataRegistryHash = createHash("sha256")
  .update(stableJson(referenceDataRegistry))
  .digest("hex");

export function unresolvedReferenceData(keys: readonly string[]): ReferenceDataEntry[] {
  const requested = new Set(keys);
  return referenceDataRegistry.filter((entry) => requested.has(entry.key) && entry.status !== "approved");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
