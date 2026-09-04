import {financialDefinitionMap} from "@offroad/credit-ontology";
import {z} from "zod";

/**
 * How an institution works, as data.
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

/**
 * What Offroad does when an organization has not said otherwise. It imposes no lending
 * threshold, because Offroad is not a lender; it does require the scenarios and metrics an
 * institutional read needs.
 */
export const houseMethodology: OrganizationMethodology = organizationMethodologySchema.parse({
  schemaVersion: "organization-methodology.v1",
  definitions: ["adjusted_ebitda", "net_debt", "leverage", "dscr", "interest_coverage", "cfads", "collateral_coverage"]
    .map((id) => ({id, parameters: {}})),
  ebitdaAdjustments: [
    {id: "non_recurring_items", allowed: true, capPercentOfEbitda: 15, requiresEvidence: true},
    {id: "ifrs16_leases", allowed: true, capPercentOfEbitda: null, requiresEvidence: true},
    {id: "stock_compensation", allowed: false, capPercentOfEbitda: null, requiresEvidence: true},
    {id: "pro_forma_acquisitions", allowed: false, capPercentOfEbitda: null, requiresEvidence: true},
    {id: "run_rate_synergies", allowed: false, capPercentOfEbitda: null, requiresEvidence: true},
    {id: "fx_translation", allowed: false, capPercentOfEbitda: null, requiresEvidence: true},
    {id: "discontinued_operations", allowed: true, capPercentOfEbitda: null, requiresEvidence: true},
  ],
  thresholds: [],
  eligibility: [],
  mandateReferences: [],
  presentation: {
    language: "pt-BR",
    memoSections: ["Resumo", "Companhia", "Desempenho", "Dívida e liquidez", "Estrutura", "Riscos e mitigantes", "Cenários", "Recomendação e condições"],
    maxPagesByOutput: {meeting_brief: 3, credit_memo: 12, board_paper: 15, pitch: 8},
    numberLocale: "pt-BR",
  },
  reviewSequence: [
    {order: 1, responsibility: "producer", label: "Produção"},
    {order: 2, responsibility: "reviewer", label: "Revisão técnica"},
    {order: 3, responsibility: "decision_maker", label: "Decisão"},
  ],
  minimumScenarios: [
    {id: "base", required: true, shocks: []},
    {id: "downside", required: true, shocks: [{driver: "ebitda", change: "-20%"}, {driver: "cdi", change: "+200bp"}]},
    {id: "stress", required: false, shocks: [{driver: "ebitda", change: "-35%"}, {driver: "cdi", change: "+400bp"}]},
  ],
  mandatoryMetrics: ["leverage", "dscr", "interest_coverage"],
  capabilitiesReference: "institution_capability_profiles",
  priorDecisions: [],
  corrections: [],
});

/**
 * The house methodology with an organization's own on top. Lists keyed by id are overridden
 * entry by entry; thresholds, eligibility and references accumulate; presentation and review
 * sequence are replaced whole when the organization states them.
 */
export function resolveMethodology(organization: Partial<OrganizationMethodology> | null | undefined): OrganizationMethodology {
  if (!organization) return houseMethodology;
  const byId = <T extends {id: string}>(base: readonly T[], override: readonly T[] | undefined): T[] => {
    const merged = new Map(base.map((entry) => [entry.id, entry]));
    for (const entry of override ?? []) merged.set(entry.id, entry);
    return [...merged.values()];
  };
  return organizationMethodologySchema.parse({
    ...houseMethodology,
    definitions: byId(houseMethodology.definitions, organization.definitions),
    ebitdaAdjustments: byId(houseMethodology.ebitdaAdjustments, organization.ebitdaAdjustments),
    thresholds: [...houseMethodology.thresholds, ...(organization.thresholds ?? [])],
    eligibility: [...houseMethodology.eligibility, ...(organization.eligibility ?? [])],
    mandateReferences: [...houseMethodology.mandateReferences, ...(organization.mandateReferences ?? [])],
    presentation: organization.presentation ?? houseMethodology.presentation,
    reviewSequence: organization.reviewSequence?.length ? organization.reviewSequence : houseMethodology.reviewSequence,
    minimumScenarios: byId(houseMethodology.minimumScenarios, organization.minimumScenarios),
    mandatoryMetrics: [...new Set([...houseMethodology.mandatoryMetrics, ...(organization.mandatoryMetrics ?? [])])],
    priorDecisions: organization.priorDecisions ?? [],
    corrections: organization.corrections ?? [],
  });
}

/**
 * The checks a methodology adds to a verifier: one per threshold and one per required
 * scenario and mandatory metric. They change what blocks, never what the numbers are.
 */
export function methodologyChecks(methodology: OrganizationMethodology): Array<{id: string; kind: "threshold" | "scenario" | "metric"; description: string}> {
  return [
    ...methodology.thresholds.map((threshold) => ({
      id: `threshold:${threshold.scope}:${threshold.metric}`,
      kind: "threshold" as const,
      description: `${threshold.metric} ${threshold.comparator} ${threshold.value} (${threshold.scope})`,
    })),
    ...methodology.minimumScenarios.filter((scenario) => scenario.required).map((scenario) => ({
      id: `scenario:${scenario.id}`,
      kind: "scenario" as const,
      description: `scenario ${scenario.id} present`,
    })),
    ...methodology.mandatoryMetrics.map((metric) => ({
      id: `metric:${metric}`,
      kind: "metric" as const,
      description: `${metric} computed with a trace`,
    })),
  ];
}
