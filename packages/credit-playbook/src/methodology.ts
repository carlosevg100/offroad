import {financialDefinitionMap} from "@offroad/credit-ontology";
import {z} from "zod";

/**
 * Historical institutional authoring schema, not execution or publication authority.
 *
 * A bank, an asset manager and a credit fund analyse the same company differently: which EBITDA
 * they accept, which adjustments they allow, which thresholds screen a deal, how many scenarios a
 * memo needs, who reviews before whom, how a page is laid out. Knowing finance is not the same as
 * knowing how this house does finance. This object holds the second thing.
 *
 * It never decides what the work is. Intent commands the workflow; the methodology modifies the
 * criteria, the checks and the presentation. And it never holds capabilities: what the
 * institution is able to do lives in `institution_capability_profiles`, with an owner and an
 * origin, and this object only points at it.
 */
const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/, "a decimal written as a string");

const knownDefinitionId = z.string().min(1).refine((id) => financialDefinitionMap.has(id), {
  message: "a financial definition id from packages/credit-ontology",
});

export const definitionAdoptionSchema = z.object({
  id: knownDefinitionId,
  /** Parameters the canonical formula accepts, never a different formula. */
  parameters: z.record(z.string().max(60), z.string().max(120)).default({}),
  note: z.string().max(300).optional(),
});

export const ebitdaAdjustmentPolicySchema = z.object({
  id: z.enum([
    "non_recurring_items",
    "ifrs16_leases",
    "stock_compensation",
    "pro_forma_acquisitions",
    "run_rate_synergies",
    "fx_translation",
    "discontinued_operations",
  ]),
  allowed: z.boolean(),
  capPercentOfEbitda: z.number().min(0).max(100).nullable(),
  requiresEvidence: z.boolean(),
});

export const comparatorSchema = z.enum(["<", "<=", ">", ">="]);

export const thresholdSchema = z.object({
  metric: knownDefinitionId,
  comparator: comparatorSchema,
  value: decimalString,
  scope: z.enum(["screening", "approval", "monitoring"]),
  note: z.string().max(300).optional(),
});

export const eligibilityRuleSchema = z.object({
  key: z.string().min(1).max(80),
  comparator: comparatorSchema,
  value: decimalString,
  unit: z.string().max(20).optional(),
  note: z.string().max(300).optional(),
});

export const scenarioRequirementSchema = z.object({
  id: z.enum(["base", "downside", "stress"]),
  required: z.boolean(),
  shocks: z.array(z.object({driver: z.string().min(1).max(80), change: z.string().min(1).max(80)})).max(20),
});

export const reviewStepSchema = z.object({
  order: z.number().int().min(1),
  responsibility: z.enum(["producer", "coordinator", "reviewer", "decision_maker"]),
  label: z.string().min(1).max(120),
});

export const presentationStandardSchema = z.object({
  language: z.enum(["pt-BR", "en-US"]),
  memoSections: z.array(z.string().min(1).max(120)).min(1).max(40),
  maxPagesByOutput: z.record(z.string().max(60), z.number().int().min(1).max(200)),
  numberLocale: z.enum(["pt-BR", "en-US"]),
});

export const decisionReferenceSchema = z.object({
  reference: z.string().min(1).max(200),
  summary: z.string().min(1).max(600),
  recordedAt: z.string().datetime({offset: true}),
  recordedBy: z.string().uuid(),
});

export const organizationMethodologySchema = z.object({
  schemaVersion: z.literal("organization-methodology.v1"),
  definitions: z.array(definitionAdoptionSchema).max(40),
  ebitdaAdjustments: z.array(ebitdaAdjustmentPolicySchema).max(20),
  thresholds: z.array(thresholdSchema).max(60),
  eligibility: z.array(eligibilityRuleSchema).max(60),
  mandateReferences: z.array(z.object({fundId: z.string().uuid(), label: z.string().max(120)})).max(40),
  presentation: presentationStandardSchema,
  reviewSequence: z.array(reviewStepSchema).max(10),
  minimumScenarios: z.array(scenarioRequirementSchema).max(3),
  mandatoryMetrics: z.array(knownDefinitionId).max(40),
  /** Capabilities are not stored here; the institution profile is the only place they live. */
  capabilitiesReference: z.literal("institution_capability_profiles"),
  priorDecisions: z.array(decisionReferenceSchema).max(500),
  corrections: z.array(decisionReferenceSchema).max(500),
}).superRefine((methodology, ctx) => {
  const orders = methodology.reviewSequence.map((step) => step.order);
  if (new Set(orders).size !== orders.length) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "review steps carry distinct orders"});
  }
  const scenarioIds = methodology.minimumScenarios.map((scenario) => scenario.id);
  if (new Set(scenarioIds).size !== scenarioIds.length) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "a scenario id appears once"});
  }
});
export type OrganizationMethodology = z.infer<typeof organizationMethodologySchema>;
