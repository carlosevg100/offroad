import {z} from "zod";

export const localeSchema = z.enum(["pt-BR", "en-US"]);
export const currencySchema = z.string().regex(/^[A-Z]{3}$/);
export const decimalStringSchema = z.string().regex(/^-?\d+(?:\.\d+)?$/);
export const uuidSchema = z.uuid();

export const taskEnvelopeSchema = z.object({
  taskId: uuidSchema,
  organizationId: uuidSchema,
  opportunityId: uuidSchema.optional(),
  actorUserId: uuidSchema,
  locale: localeSchema,
  purpose: z.string().min(3).max(200),
  permittedEvidenceScopes: z.array(z.string()).max(50),
  allowedTools: z.array(z.string()).max(30),
  inputVersion: z.string().min(1),
  outputSchemaVersion: z.string().min(1),
  budget: z.object({
    maxToolCalls: z.number().int().positive().max(100),
    maxTokens: z.number().int().positive(),
    deadline: z.iso.datetime(),
  }),
});

export const sourceAnchorSchema = z.object({
  sourceDocumentId: uuidSchema,
  version: z.number().int().positive(),
  page: z.number().int().positive().optional(),
  sheet: z.string().optional(),
  cellRange: z.string().optional(),
  quoteHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

export const claimSchema = z.object({
  id: uuidSchema,
  kind: z.enum(["fact", "calculation", "judgment", "public_source"]),
  material: z.boolean(),
  text: z.string().min(1),
  supportIds: z.array(uuidSchema),
  approved: z.boolean().default(false),
});

export const scenarioTermsSchema = z.object({
  currency: currencySchema,
  amount: decimalStringSchema,
  termMonths: z.number().int().min(1).max(360),
  amortizationMonths: z.number().int().min(0).max(360),
  annualCashRate: decimalStringSchema,
  upfrontFeeRate: decimalStringSchema,
  structure: z.enum(["senior_secured", "unitranche", "receivables", "asset_backed", "mezzanine"]),
  collateralTypes: z.array(z.string()),
  minimumDscr: decimalStringSchema,
});

export const opportunityProjectionSchema = z.object({
  id: uuidSchema,
  sector: z.string().min(1),
  geography: z.string().min(1),
  currency: currencySchema,
  amountMin: decimalStringSchema,
  amountMax: decimalStringSchema,
  termMonthsMin: z.number().int().positive(),
  termMonthsMax: z.number().int().positive(),
  structureTypes: z.array(z.string()),
  collateralTypes: z.array(z.string()),
});

export const dealWorkflowStageSchema = z.enum([
  "understand",
  "diagnose",
  "structure",
  "prepare",
  "match",
  "introduce",
  "capture_feedback",
]);

export const dealStateObjectTypeSchema = z.enum([
  "understanding_snapshot",
  "finding_register",
  "clarification_batch",
  "structure_option",
  "structure_decision",
  "production_plan",
  "material_artifact",
  "package_review",
  "match_screen",
  "release_authorization",
]);

export const dealStateObjectStatusSchema = z.enum([
  "draft",
  "pending_confirmation",
  "confirmed",
  "approved",
  "stale",
  "superseded",
]);

export const dealStateDependencySchema = z.object({
  objectType: dealStateObjectTypeSchema,
  objectFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});

export const dealStateObjectSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  intakeSessionId: uuidSchema,
  objectType: dealStateObjectTypeSchema,
  objectVersion: z.number().int().positive(),
  status: dealStateObjectStatusSchema,
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  objectFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z.record(z.string(), z.unknown()),
  dependencies: z.array(dealStateDependencySchema).max(100),
  createdBy: uuidSchema,
  createdAt: z.iso.datetime({offset: true}),
  supersededAt: z.iso.datetime({offset: true}).nullable(),
});

export const dealWorkflowGatesSchema = z.object({
  understandingConfirmed: z.boolean(),
  structureConfirmed: z.boolean(),
  productionPlanApproved: z.boolean(),
  packageApproved: z.boolean(),
  releaseAuthorized: z.boolean(),
});

export const dealWorkflowStateSchema = z.object({
  stage: dealWorkflowStageSchema,
  gates: dealWorkflowGatesSchema,
  objectFingerprints: z.partialRecord(
    dealStateObjectTypeSchema,
    z.string().regex(/^[a-f0-9]{64}$/),
  ),
});

export const initialDealWorkflowState: DealWorkflowState = {
  stage: "diagnose",
  gates: {
    understandingConfirmed: false,
    structureConfirmed: false,
    productionPlanApproved: false,
    packageApproved: false,
    releaseAuthorized: false,
  },
  objectFingerprints: {},
};

const acceptedStatuses = new Set<DealStateObjectStatus>(["confirmed", "approved"]);

export function deriveDealWorkflowState(objects: readonly DealStateObject[]): DealWorkflowState {
  const active = new Map<DealStateObjectType, DealStateObject>();
  for (const object of objects) {
    if (object.status === "stale" || object.status === "superseded") continue;
    const current = active.get(object.objectType);
    if (!current || object.objectVersion > current.objectVersion) active.set(object.objectType, object);
  }

  const accepted = (type: DealStateObjectType) => {
    const object = active.get(type);
    return object !== undefined && acceptedStatuses.has(object.status);
  };
  const approved = (type: DealStateObjectType) => active.get(type)?.status === "approved";
  const gates: DealWorkflowGates = {
    understandingConfirmed: accepted("understanding_snapshot"),
    structureConfirmed: accepted("structure_decision"),
    productionPlanApproved: approved("production_plan"),
    packageApproved: approved("package_review"),
    releaseAuthorized: approved("release_authorization"),
  };

  let stage: DealWorkflowStage = "diagnose";
  if (gates.understandingConfirmed) stage = "structure";
  if (gates.understandingConfirmed && gates.structureConfirmed && gates.productionPlanApproved) stage = "prepare";
  if (stage === "prepare" && gates.packageApproved) stage = "match";
  if (stage === "match" && gates.releaseAuthorized) stage = "introduce";

  return dealWorkflowStateSchema.parse({
    stage,
    gates,
    objectFingerprints: Object.fromEntries(
      [...active].map(([type, object]) => [type, object.objectFingerprint]),
    ),
  });
}

const stageOrder: Record<DealWorkflowStage, number> = {
  understand: 0,
  diagnose: 1,
  structure: 2,
  prepare: 3,
  match: 4,
  introduce: 5,
  capture_feedback: 6,
};

export function dealWorkflowAllows(state: DealWorkflowState, stage: DealWorkflowStage): boolean {
  return stageOrder[state.stage] >= stageOrder[stage];
}

export type TaskEnvelope = z.infer<typeof taskEnvelopeSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type ScenarioTerms = z.infer<typeof scenarioTermsSchema>;
export type OpportunityProjection = z.infer<typeof opportunityProjectionSchema>;
export type DealWorkflowStage = z.infer<typeof dealWorkflowStageSchema>;
export type DealStateObjectType = z.infer<typeof dealStateObjectTypeSchema>;
export type DealStateObjectStatus = z.infer<typeof dealStateObjectStatusSchema>;
export type DealStateObject = z.infer<typeof dealStateObjectSchema>;
export type DealWorkflowGates = z.infer<typeof dealWorkflowGatesSchema>;
export type DealWorkflowState = z.infer<typeof dealWorkflowStateSchema>;
