import {createHash} from "node:crypto";
import {z} from "zod";
import {assessReceivablesFunding, financialCoreVersion, type ReceivablesFundingInput} from "@offroad/financial-core";
import {adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {adoptedAnalysisContextSchema, createAnalysisBinding} from "./adopted-analysis-binding";
import {receivablesFundingAdoptedExclusions} from "./receivables-funding-results";

const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/), words = z.string().trim().min(1).max(2000);
const unsigned = z.string().regex(/^\d{1,24}(?:\.\d{1,20})?$/), ratio = z.string().regex(/^\d{1,4}(?:\.\d{1,20})?$/), whole = z.string().regex(/^\d{1,7}$/);
const optional = selection.nullable();

/** One question about turning a receivables portfolio into funding. The period runs from the
 * portfolio's reference date (the opening date) to the end of the need. Buckets and options are
 * adopted field by field; an option without eligibility is the bank line. */
export const adoptedReceivablesFundingInputSchema = adoptedAnalysisContextSchema.safeExtend({
  analysisId: z.uuid(), scenario: z.string().trim().min(1).max(160),
  needAverage: selection, needPeak: selection, needStartDate: selection, calendarDays: selection, businessDays: selection, annualDi: selection,
  averageTermDays: selection, needProfile: selection, vehicleThresholdMin: selection, vehicleThresholdMax: selection, lienBasketRemaining: optional,
  items: z.array(z.strictObject({id: key, label: selection, amount: selection, contract: selection, encumbrance: selection, encumbranceHolder: optional, releaseEvent: optional,
    originDate: selection, dueDate: selection, registration: selection, creditTier: selection, anchorProgram: selection, debtorCount: optional, largestDebtorAmount: optional})).min(1).max(16),
  options: z.array(z.strictObject({id: key, label: selection, kind: selection, recourse: selection, rateBasis: selection, rate: selection,
    iofDaily: selection, iofDailyCapDays: selection, iofAdditional: selection, rolloverDays: optional, upfrontFee: selection, collateral: selection,
    leadDaysMin: optional, leadDaysMax: optional,
    eligibility: z.strictObject({maxDaysPastDue: selection, maxRemainingTermDays: selection, registrationRule: selection, minCreditTier: selection,
      sublimitPerDebtor: optional, anchorItemIds: optional}).nullable()})).min(1).max(8),
}).refine(i => i.endDate > i.openingDate, "Invalid horizon")
  .refine(i => new Set(i.items.map(x => x.id)).size === i.items.length, "Duplicate item")
  .refine(i => new Set(i.options.map(x => x.id)).size === i.options.length, "Duplicate option");
export type AdoptedReceivablesFundingInput = z.infer<typeof adoptedReceivablesFundingInputSchema>;

/** Receivables funding over one adopted basis: every amount, date, contract and encumbrance state,
 * eligibility term, rate, tax and lead time is an adopted contribution read in its own context.
 * The reference date is the period's opening date. Nothing contacts a buyer or names a fund. */
export function calculateAdoptedReceivablesFunding(raw: unknown) {
  const input = adoptedReceivablesFundingInputSchema.parse(raw), prefix = `receivables_funding.${input.analysisId}.`, sc = input.scenario;
  const monetary = [input.needAverage, input.needPeak, input.vehicleThresholdMin, input.vehicleThresholdMax, ...input.lienBasketRemaining ? [input.lienBasketRemaining] : [],
    ...input.items.flatMap(i => [i.amount, ...i.largestDebtorAmount ? [i.largestDebtorAmount] : []]),
    ...input.options.flatMap(o => o.eligibility?.sublimitPerDebtor ? [o.eligibility.sublimitPerDebtor] : [])];
  const b = createAnalysisBinding(input, monetary);
  let complete = true;
  const need = <T>(v: T | null): T => {if (v === null) complete = false; return v as T;};
  const read = <T>(s: z.infer<typeof selection>, path: string, unit: string, type: "number" | "text" | "date" | "list", schema: z.ZodType<T>) => need(b.read(s, prefix + path, sc, unit, type, schema));
  const maybe = <T>(s: z.infer<typeof selection> | null, path: string, unit: string, type: "number" | "text" | "date" | "list", schema: z.ZodType<T>) => s === null ? null : read(s, path, unit, type, schema);
  const n = (v: string | null) => v === null ? null : Number(v);
  const items = input.items.map(i => {
    const p = `item.${i.id}.`;
    return {id: i.id, label: read(i.label, p + "label", "text", "text", words), amount: read(i.amount, p + "amount", "currency", "number", unsigned),
      contract: read(i.contract, p + "contract", "convention", "text", z.enum(["assignable", "prohibited_without_consent"])),
      encumbrance: read(i.encumbrance, p + "encumbrance", "convention", "text", z.enum(["free", "assigned", "pledged"])),
      encumbranceHolder: maybe(i.encumbranceHolder, p + "encumbranceHolder", "text", "text", words), releaseEvent: maybe(i.releaseEvent, p + "releaseEvent", "text", "text", words),
      originDate: read(i.originDate, p + "originDate", "date", "date", z.iso.date()), dueDate: read(i.dueDate, p + "dueDate", "date", "date", z.iso.date()),
      registration: read(i.registration, p + "registration", "convention", "text", z.enum(["registered", "not_required", "missing"])),
      creditTier: read(i.creditTier, p + "creditTier", "convention", "text", z.enum(["selected", "standard"])),
      anchorProgram: read(i.anchorProgram, p + "anchorProgram", "convention", "text", z.enum(["active", "none", "unknown"])),
      debtorCount: n(maybe(i.debtorCount, p + "debtorCount", "count", "number", whole)),
      largestDebtorAmount: maybe(i.largestDebtorAmount, p + "largestDebtorAmount", "currency", "number", unsigned)};
  });
  const options = input.options.map(o => {
    const p = `option.${o.id}.`, e = o.eligibility;
    return {id: o.id, label: read(o.label, p + "label", "text", "text", words),
      kind: read(o.kind, p + "kind", "convention", "text", z.enum(["anchor_program", "fidc", "bank_discount", "bank_line"])),
      recourse: read(o.recourse, p + "recourse", "convention", "text", z.enum(["with_recourse", "without_recourse"])),
      rate: {basis: read(o.rateBasis, p + "rateBasis", "convention", "text", z.enum(["monthly", "annual", "di_plus"])), rate: read(o.rate, p + "rate", "ratio", "number", ratio)},
      iofDaily: read(o.iofDaily, p + "iofDaily", "ratio", "number", ratio), iofDailyCapDays: Number(read(o.iofDailyCapDays, p + "iofDailyCapDays", "days", "number", whole)),
      iofAdditional: read(o.iofAdditional, p + "iofAdditional", "ratio", "number", ratio), rolloverDays: n(maybe(o.rolloverDays, p + "rolloverDays", "days", "number", whole)),
      upfrontFee: read(o.upfrontFee, p + "upfrontFee", "ratio", "number", ratio),
      collateral: read(o.collateral, p + "collateral", "convention", "text", z.enum(["none", "receivables_assignment", "unknown"])),
      leadDaysMin: n(maybe(o.leadDaysMin, p + "leadDaysMin", "days", "number", whole)), leadDaysMax: n(maybe(o.leadDaysMax, p + "leadDaysMax", "days", "number", whole)),
      eligibility: e === null ? null : {maxDaysPastDue: Number(read(e.maxDaysPastDue, p + "maxDaysPastDue", "days", "number", whole)),
        maxRemainingTermDays: Number(read(e.maxRemainingTermDays, p + "maxRemainingTermDays", "days", "number", whole)),
        registrationRule: read(e.registrationRule, p + "registrationRule", "convention", "text", z.enum(["required", "not_required"])),
        minCreditTier: read(e.minCreditTier, p + "minCreditTier", "convention", "text", z.enum(["selected", "standard"])),
        sublimitPerDebtor: maybe(e.sublimitPerDebtor, p + "sublimitPerDebtor", "currency", "number", unsigned),
        anchorItemIds: maybe(e.anchorItemIds, p + "anchorItemIds", "identity", "list", z.array(key).min(1).max(16)) ?? []}};
  });
  const kernelInput: ReceivablesFundingInput = {currency: input.currency, referenceDate: input.openingDate, items, options,
    needAverage: read(input.needAverage, "needAverage", "currency", "number", unsigned), needPeak: read(input.needPeak, "needPeak", "currency", "number", unsigned),
    needStartDate: read(input.needStartDate, "needStartDate", "date", "date", z.iso.date()),
    calendarDays: Number(read(input.calendarDays, "calendarDays", "days", "number", whole)), businessDays: Number(read(input.businessDays, "businessDays", "days", "number", whole)),
    annualDi: read(input.annualDi, "annualDi", "ratio", "number", ratio), averageTermDays: Number(read(input.averageTermDays, "averageTermDays", "days", "number", whole)),
    needProfile: read(input.needProfile, "needProfile", "convention", "text", z.enum(["seasonal", "structural"])),
    dedicatedVehicleThreshold: {min: read(input.vehicleThresholdMin, "vehicleThresholdMin", "currency", "number", unsigned), max: read(input.vehicleThresholdMax, "vehicleThresholdMax", "currency", "number", unsigned)},
    lienBasketRemaining: maybe(input.lienBasketRemaining, "lienBasketRemaining", "currency", "number", unsigned)};
  const funding = complete ? assessReceivablesFunding(kernelInput) : null;
  const payload = {schemaVersion: "adopted-receivables-funding.v1" as const, financialCoreVersion, scope: input.scope, analysisId: input.analysisId,
    entityId: input.entityId, perimeter: input.perimeter, currency: input.currency, basisFingerprint: input.envelope.fingerprint, funding,
    gaps: b.gaps, bindings: b.bindings, normalization: b.normalization, contributions: [...b.used.values()],
    status: funding ? "partial_composition" as const : "missing_inputs" as const,
    derivedDependencies: [{result: "receivables_funding", decisionIds: [...b.used.keys()]}],
    classification: [...b.used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: [...receivablesFundingAdoptedExclusions],
    grantsExecution: false as const, grantsPublication: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
