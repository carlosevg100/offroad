import {z} from "zod";
import {executors} from "@offroad/credit-playbook";
const text = z.string(); const list = z.array(text);
const money = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const anchor = z.strictObject({document: text, clause: text.optional(), page: z.number().int().positive().optional(), note: text.optional()});
const trace = z.strictObject({calculations: z.array(z.strictObject({id: text, formula: text, operands: z.record(text, text), result: text, unit: text})),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/), outputFingerprint: z.string().regex(/^[a-f0-9]{64}$/)});
const amount = z.strictObject({value: money, anchor});
const row = z.strictObject({period: text, opening_principal: money, indexation_factor: money, indexation_accrued: money,
  indexation_capitalized: money, indexation_paid: money, coupon_factor: money, coupon_accrued: money, coupon_paid: money,
  coupon_carried: money, principal_paid: money.nullable(), closing_principal: money.nullable(), calendar_anchor: anchor});
const totals = z.strictObject({cash_interest: money, cash_indexation: money, indexation_capitalized: money, principal_paid: money.nullable()});
const treatment = z.enum(["capitalized_principal", "cash_paid", "not_indexed"]);
const roundingLayer = z.strictObject({decimals: z.number().int(), mode: z.enum(["round", "truncate"])});
export const capitalContractInterestOutputSchema = z.strictObject({
  schema_version: z.literal("method.build-interest-and-indexation-schedule.v8"), event_conventions: executors.interestEventConventionsSchema,
  reference_date: z.iso.date(), unit: text, state: z.enum(["complete", "partial", "blocked"]), block_reasons: list, assumptions: list,
  schedule_by_series: z.array(z.strictObject({series_id: text, label: text, indexer: text, remuneration: text,
    opening_principal: amount.extend({basis: text}), opening_accrued: amount.nullable(), first_coupon_complete: z.boolean(),
    curve: z.strictObject({id: text, asOf: z.iso.date(), title: text, anchor}).nullable(),
    rounding: z.strictObject({indexFactor: roundingLayer, spreadFactor: roundingLayer, interestFactor: roundingLayer,
      dailyAccumulation: roundingLayer, amount: roundingLayer, anchor}).nullable(),
    principal_projection: z.enum(["scheduled", "insufficient_evidence"]), treatment,
    treatment_scenarios: z.array(z.strictObject({treatment, rows: z.array(row), totals})).nullable(), rows: z.array(row).nullable(), totals: totals.nullable(),
    anchors: z.strictObject({balance: anchor, terms: anchor.nullable(), payments: anchor.nullable(), amortization: anchor.nullable(), indexation: anchor.nullable()}),
  })),
  schedule_aggregate: z.strictObject({
    by_period: z.array(z.strictObject({period: text, cash_interest: money, cash_indexation: money, indexation_capitalized: money, principal_paid: money.nullable(), closing_principal: money.nullable()})),
    by_indexer: z.array(z.strictObject({indexer: text, cash_interest: money, cash_indexation: money, indexation_capitalized: money, closing_principal: money.nullable(), series: list})),
    opening_principal_projected: money, principal_projection_complete: z.boolean(), treatment_scenarios_pending: list,
  }).nullable(),
  ledger_coverage: z.strictObject({projected_nominal: money, ledger: money, ledger_basis: text, share: money, share_note: text,
    series_projected: z.number().int(), series_in_ledger: z.number().int(), series_omitted: list, anchor}).nullable(),
  accounting_bridge: z.strictObject({period: text,
    interest: z.strictObject({projected: money.nullable(), accounting: money, difference: money.nullable(), anchor}),
    indexation: z.strictObject({projected: money.nullable(), accounting: money, difference: money.nullable(), anchor}).nullable(),
    total: z.strictObject({projected: money.nullable(), accounting: money, difference: money.nullable()}),
    state: z.enum(["compared", "insufficient_evidence"]), reason: text.nullable(),
  }).nullable(),
  uncovered_series: z.array(z.strictObject({series_id: text, reason: text, state: z.literal("insufficient_evidence")})), trace,
});
export const capitalContractCovenantOutputSchema = z.strictObject({
  schema_version: z.literal("method.reconcile-covenant-definitions.v14"), as_of_date: z.iso.date(), unit: text,
  state: z.enum(["resolved", "conditioned", "blocked"]), block_reasons: list,
  covenants: z.array(z.strictObject({instrument: text, source: z.enum(["indenture", "trustee_report"]), indexName: text,
    direction: z.enum(["maximum", "minimum"]).nullable(),
    definitions: z.strictObject({netDebt: text, netDebtComponents: list, ebitda: text,
      ebitdaAdjustments: z.array(z.strictObject({id: text, kind: text, description: text, anchor, obligation: amount.extend({asOf: z.iso.date()}).nullable()})),
      anchors: z.strictObject({netDebt: anchor, ebitda: anchor})}).nullable(),
    measurement: z.strictObject({frequency: text, basis: text, fiscalYearEnd: text, nextMeasurementDate: z.iso.date()}).nullable(),
    tiers: z.array(z.strictObject({index: z.number().int(), limit: money, condition: text, state: z.enum(["applies", "ended", "not_yet", "unproven", "n/a"]), anchor})),
    applicableLimit: money.nullable(), limitState: z.enum(["resolved", "reported_by_trustee", "insufficient_evidence"]), limitConditions: list,
    reportedMeasurement: z.strictObject({value: money, asOf: z.iso.date()}).nullable(),
    netDebtByDefinition: z.strictObject({value: money, formula: text, operands: z.record(text, text), anchors: z.record(text, anchor),
      residualAssumedZero: z.boolean(), numeratorObligations: money.nullable()}).nullable(),
    legalConditions: list,
    index: z.strictObject({value: money, basis: z.enum(["computed_from_components", "reported"]),
      ebitda: z.strictObject({value: money, basis: z.enum(["opened", "implied_from_reported"])}).nullable(), anchor}).nullable(),
    notes: list, comparability: z.enum(["comparable", "conditional", "not_comparable", "no_index"]), comparabilityReasons: list,
    headroom: z.strictObject({absolute: money, relative: money.nullable(), basis: text}).nullable(), status: z.enum(["within_limit", "above_limit_interim", "unresolved"]),
  })),
  unproven_conditions: list, uncovered_terms: z.array(z.strictObject({id: text, state: z.literal("insufficient_evidence"), reason: text})),
  legal_conditions: list, trace,
});
