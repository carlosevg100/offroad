import {z} from "zod";

export const localeSchema = z.enum(["pt-BR", "en-US"]);
export const currencySchema = z.string().regex(/^[A-Z]{3}$/);
export const decimalStringSchema = z.string().regex(/^-?\d+(?:\.\d+)?$/);
export const uuidSchema = z.uuid();

/** Public-only context supplied for an origination meeting thesis. The contract intentionally
 * excludes uploaded documents, confidential values and lender instructions. */
export const originationThesisBriefSchema = z.object({
  meetingContext: z.string().trim().min(10).max(5_000),
  thesisToTest: z.string().trim().max(3_000).optional(),
  audience: z.string().trim().max(240).optional(),
  meetingDate: z.iso.date().optional(),
});

/** One governed synthesis shape shared by the worker and the product renderer. */
export const originationMeetingBriefSchema = z.object({
  executiveRead: z.string().min(60).max(2_400),
  companySnapshot: z.string().min(40).max(1_800),
  debtLensSignals: z.array(z.object({
    finding: z.string().min(20).max(900),
    relevance: z.string().min(20).max(900),
    sourceUrls: z.array(z.url()).min(1).max(4),
    confidence: z.enum(["high", "medium", "low"]),
  })).max(10),
  financingAngles: z.array(z.object({
    title: z.string().min(5).max(180),
    route: z.string().min(3).max(180),
    rationale: z.string().min(30).max(1_200),
    sourceUrls: z.array(z.url()).min(1).max(4),
    prerequisites: z.array(z.string().min(5).max(500)).min(1).max(8),
    disconfirmers: z.array(z.string().min(5).max(500)).min(1).max(8),
  })).max(6),
  meetingQuestions: z.array(z.object({
    question: z.string().min(10).max(500),
    whyItMatters: z.string().min(10).max(700),
    answerChanges: z.string().min(10).max(700),
  })).min(3).max(14),
  unknowns: z.array(z.string().min(8).max(600)).min(1).max(14),
  suggestedOpening: z.string().min(30).max(1_200),
});

export const originationMeetingBriefArtifactSchema = originationMeetingBriefSchema.extend({
  schemaVersion: z.literal("origination-meeting-brief.v1"),
  asOfDate: z.iso.date(),
  company: z.object({name: z.string().min(2), website: z.url().nullable()}),
  sources: z.array(z.object({
    title: z.string().min(1),
    url: z.url(),
    topic: z.enum(["identity", "news", "sector", "regulation", "market"]),
    publishedAt: z.string().nullable(),
    provider: z.enum(["perplexity", "openai", "official", "mcp"]),
  })),
  researchStatus: z.enum(["succeeded", "partial", "abstained"]),
  scopeBoundary: z.string().min(20),
  provenance: z.object({
    provider: z.enum(["anthropic", "openai"]),
    model: z.string().min(1),
    executorVersion: z.string().min(3),
  }),
});

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
  "changes_requested",
  "declined",
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

export const capitalProviderKindSchema = z.enum([
  "fidc",
  "credit_fund",
  "securitizadora",
  "bank",
  "family_office",
  "multi_strategy",
  "factoring",
  "development_agency",
  "finance_company",
  "alternative_lender",
  "other",
  "unknown",
]);

export const matchCriterionSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.object({pt: z.string().min(1), en: z.string().min(1)}),
  outcome: z.enum(["fits", "conflicts", "unknown", "not_assessed"]),
  hard: z.boolean(),
  mandate: z.string().nullable(),
  transaction: z.string().nullable(),
  explanation: z.object({pt: z.string().min(1), en: z.string().min(1)}),
  resolvedBy: z.string().nullable(),
  divergent: z.boolean(),
});

export const matchCandidateSchema = z.object({
  providerId: z.string().min(1),
  providerName: z.string().min(1),
  providerKind: capitalProviderKindSchema,
  providerSource: z.enum(["directory", "registered"]),
  fundDirectoryId: uuidSchema.nullable(),
  providerOrganizationId: uuidSchema.nullable(),
  providerFundId: uuidSchema.nullable(),
  verdict: z.enum(["fits", "possible", "excluded"]),
  eligibleForShortlist: z.boolean(),
  mandateFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sourceClasses: z.array(z.enum([
    "direct_confirmation", "public_rule", "governed_observation", "unconfirmed",
  ])),
  rationale: z.string().min(1),
  criteria: z.array(matchCriterionSchema),
  confirmations: z.array(z.string()),
  governanceBlockers: z.array(z.string()),
  staleMonths: z.number().nonnegative().nullable(),
  divergences: z.array(z.string()),
  order: z.number().int().positive(),
}).superRefine((candidate, context) => {
  const validDirectory = candidate.providerSource === "directory"
    && candidate.fundDirectoryId === candidate.providerId
    && candidate.providerOrganizationId === null
    && candidate.providerFundId === null;
  const validRegistered = candidate.providerSource === "registered"
    && candidate.fundDirectoryId === null
    && candidate.providerOrganizationId !== null
    && candidate.providerFundId === candidate.providerId;
  if (!validDirectory && !validRegistered) {
    context.addIssue({
      code: "custom",
      message: "provider reference does not match provider source",
    });
  }
});

export const matchScreenSchema = z.object({
  schemaVersion: z.literal("2026.08.29-v3"),
  status: z.enum([
    "ready_for_review", "needs_mandate_refresh", "no_eligible_mandates", "not_screened",
  ]),
  packageReviewFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  materialArtifactFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  materialTruthFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  matchingFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  candidates: z.array(matchCandidateSchema),
  summary: z.object({
    screened: z.number().int().nonnegative(),
    eligible: z.number().int().nonnegative(),
    possible: z.number().int().nonnegative(),
    excluded: z.number().int().nonnegative(),
    blockedByGovernance: z.number().int().nonnegative(),
  }),
  structuralExclusions: z.array(z.string()),
  noContactAuthorized: z.literal(true),
  approval: z.object({
    selectedProviderIds: z.array(z.string().min(1)).min(1),
    actorId: uuidSchema,
    approvedAt: z.iso.datetime({offset: true}),
    scope: z.literal("match_shortlist_only"),
  }).optional(),
});

export const dealWorkflowGatesSchema = z.object({
  understandingConfirmed: z.boolean(),
  structureOptionCurrent: z.boolean().default(false),
  structureConfirmed: z.boolean(),
  productionPlanApproved: z.boolean(),
  packageApproved: z.boolean(),
  matchApproved: z.boolean().default(false),
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
    structureOptionCurrent: false,
    structureConfirmed: false,
    productionPlanApproved: false,
    packageApproved: false,
    matchApproved: false,
    releaseAuthorized: false,
  },
  objectFingerprints: {},
};

const acceptedStatuses = new Set<DealStateObjectStatus>(["confirmed", "approved"]);

export function deriveDealWorkflowState(objects: readonly DealStateObject[]): DealWorkflowState {
  const latest = new Map<DealStateObjectType, DealStateObject>();
  for (const object of objects) {
    const current = latest.get(object.objectType);
    if (!current || object.objectVersion > current.objectVersion) latest.set(object.objectType, object);
  }

  const active = new Map(
    [...latest].filter(([, object]) => object.status !== "stale" && object.status !== "superseded"),
  );

  const accepted = (type: DealStateObjectType) => {
    const object = active.get(type);
    return object !== undefined && acceptedStatuses.has(object.status);
  };
  const approved = (type: DealStateObjectType) => active.get(type)?.status === "approved";
  const dependsOn = (type: DealStateObjectType, upstreamType: DealStateObjectType) => {
    const object = active.get(type);
    const upstream = active.get(upstreamType);
    return object !== undefined
      && upstream !== undefined
      && object.dependencies.some((dependency) => (
        dependency.objectType === upstreamType
        && dependency.objectFingerprint === upstream.objectFingerprint
      ));
  };
  const understandingConfirmed = accepted("understanding_snapshot");
  const structureOptionCurrent = understandingConfirmed
    && active.get("structure_option")?.status === "pending_confirmation"
    && dependsOn("structure_option", "understanding_snapshot");
  const structureConfirmed = structureOptionCurrent
    && accepted("structure_decision")
    && dependsOn("structure_decision", "structure_option");
  const productionPlanApproved = structureConfirmed
    && approved("production_plan")
    && dependsOn("production_plan", "structure_decision");
  const materialArtifactCurrent = productionPlanApproved
    && active.get("material_artifact")?.status === "pending_confirmation"
    && dependsOn("material_artifact", "production_plan");
  const packageApproved = materialArtifactCurrent
    && approved("package_review")
    && dependsOn("package_review", "production_plan")
    && dependsOn("package_review", "material_artifact");
  const matchApproved = packageApproved
    && approved("match_screen")
    && dependsOn("match_screen", "package_review")
    && dependsOn("match_screen", "material_artifact");
  const releaseAuthorized = matchApproved
    && approved("release_authorization")
    && dependsOn("release_authorization", "match_screen");
  const gates: DealWorkflowGates = {
    understandingConfirmed,
    structureOptionCurrent,
    structureConfirmed,
    productionPlanApproved,
    packageApproved,
    matchApproved,
    releaseAuthorized,
  };

  let stage: DealWorkflowStage = "diagnose";
  if (gates.understandingConfirmed) stage = "structure";
  if (gates.structureConfirmed) stage = "prepare";
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
export type OriginationThesisBrief = z.infer<typeof originationThesisBriefSchema>;
export type OriginationMeetingBrief = z.infer<typeof originationMeetingBriefSchema>;
export type OriginationMeetingBriefArtifact = z.infer<typeof originationMeetingBriefArtifactSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type ScenarioTerms = z.infer<typeof scenarioTermsSchema>;
export type OpportunityProjection = z.infer<typeof opportunityProjectionSchema>;
export type DealWorkflowStage = z.infer<typeof dealWorkflowStageSchema>;
export type DealStateObjectType = z.infer<typeof dealStateObjectTypeSchema>;
export type DealStateObjectStatus = z.infer<typeof dealStateObjectStatusSchema>;
export type DealStateObject = z.infer<typeof dealStateObjectSchema>;
export type DealWorkflowGates = z.infer<typeof dealWorkflowGatesSchema>;
export type DealWorkflowState = z.infer<typeof dealWorkflowStateSchema>;
export type CapitalProviderKind = z.infer<typeof capitalProviderKindSchema>;
export type MatchCriterion = z.infer<typeof matchCriterionSchema>;
export type MatchCandidate = z.infer<typeof matchCandidateSchema>;
export type MatchScreen = z.infer<typeof matchScreenSchema>;
