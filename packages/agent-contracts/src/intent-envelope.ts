import {z} from "zod";

import {dcmWorkEffectSchema, type DcmWorkEffect} from "./work-system";

/**
 * Intent Envelope v1: the unit of routing decided in ADR 0021 and shaped by the architecture
 * review of 4 September 2026. It has two layers on purpose.
 *
 * The routing core is what a classifier can infer from a message with confidence and what is
 * enough to discover the initial work. The governed execution context is everything else the
 * work needs. Part of it comes from the system and the model never writes it: what the caller
 * may do, which evidence regime applies, which organization and documents exist. Part of it can
 * be inferred but has to be confirmed when it is material, because jurisdiction, as-of date
 * and currency are often exactly the ambiguity that changes an analysis.
 *
 * Nothing here is a runtime router yet. The production router stays untouched until the
 * envelope has proven composite intent, correction and abstention in shadow.
 */

export const intentFieldStateSchema = z.enum([
  "explicit",
  "inferred",
  "system",
  "reused_confirmed",
  "ambiguous",
  "unknown",
  "not_applicable",
]);
export type IntentFieldState = z.infer<typeof intentFieldStateSchema>;

/** The nine primary works the router chooses among. Compositions are built on top of them. */
export const primaryWorkSchema = z.enum([
  "find_and_organize",
  "extract_and_reconcile",
  "understand",
  "analyze",
  "model",
  "capital_strategy",
  "read_documents",
  "market",
  "capital_match",
]);
export type PrimaryWork = z.infer<typeof primaryWorkSchema>;

export const intentDepthSchema = z.enum(["point", "preliminary", "institutional"]);
export const intentOutputFormSchema = z.enum(["chat", "artifact", "file"]);
export const intentContinuitySchema = z.enum(["new", "refresh", "monitor", "comparison", "resume"]);
export const workResponsibilitySchema = z.enum([
  "producer",
  "coordinator",
  "reviewer",
  "decision_maker",
  "sponsor",
  "recipient",
  "external_authorizer",
]);
export type WorkResponsibility = z.infer<typeof workResponsibilitySchema>;

export const intentObjectKindSchema = z.enum([
  "organization",
  "user",
  "company",
  "project",
  "operation",
  "instrument",
  "document",
  "claim",
  "model",
  "asset_or_pool",
  "scenario",
  "alternative",
  "material",
  "market",
  "provider",
  "mandate",
  "process",
  "decision",
]);

export const evidenceRegimeSchema = z.enum(["unresolved", "public", "private_authorized", "hybrid", "received"]);
export type EvidenceRegime = z.infer<typeof evidenceRegimeSchema>;
export const authorityGrantSchema = z.enum(["read", "modify", "approve_internal", "share", "introduce"]);
export type AuthorityGrant = z.infer<typeof authorityGrantSchema>;
export const canonicalIntentActionSchema = z.enum([
  "find_and_organize", "extract_and_reconcile", "understand", "answer", "analyze", "model",
  "diagnose", "compare", "structure", "read_document", "prepare_meeting", "prepare_material",
  "review", "prepare_decision", "evaluate", "map_market", "identify_capital", "introduce",
  "monitor", "manage_work",
]);
export type CanonicalIntentAction = z.infer<typeof canonicalIntentActionSchema>;

export const intentDecisionTypeSchema = z.enum(["none", "capital", "credit", "material", "market", "external", "workflow", "document"]);
export type IntentDecisionType = z.infer<typeof intentDecisionTypeSchema>;
export const intentAudienceTypeSchema = z.enum(["self", "internal_senior", "company_management", "board_or_committee", "capital_provider", "market", "unspecified"]);
export type IntentAudienceType = z.infer<typeof intentAudienceTypeSchema>;
export const intentObjectSlotKeySchema = z.enum([
  "entity", "subject", "amount", "currency", "percentage", "basis_points", "ratio",
  "indexer", "tenor_months", "page_count", "count", "cadence",
]);
export type IntentObjectSlotKey = z.infer<typeof intentObjectSlotKeySchema>;

const inferable = <T extends z.ZodTypeAny>(value: T) => z.object({
  value,
  state: intentFieldStateSchema,
  /** 0 to 1. Required whenever the state is inferred or ambiguous. */
  confidence: z.number().min(0).max(1).optional(),
  /** Where the inference came from, so it stays corrigible. Never a document value. */
  basis: z.string().max(300).optional(),
}).superRefine((field, ctx) => {
  if ((field.state === "inferred" || field.state === "ambiguous") && field.confidence === undefined) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "an inferred or ambiguous field carries a confidence"});
  }
});

/** A field only the control plane may fill. Its state is always `system`. */
const systemProvided = <T extends z.ZodTypeAny>(value: T) => z.object({value, state: z.literal("system")});

export const routingCoreSchema = z.object({
  action: inferable(z.array(z.string().min(1).max(60)).min(1).max(8)),
  object: inferable(z.array(z.object({
    kind: intentObjectKindSchema,
    reference: z.string().max(200).optional(),
  })).min(1).max(12)),
  desiredOutcome: inferable(z.string().min(1).max(300)),
  decision: inferable(z.string().max(300).nullable()),
  audience: inferable(z.array(z.string().min(1).max(80)).min(1).max(6)),
  depth: inferable(intentDepthSchema),
  continuity: inferable(intentContinuitySchema),
  workResponsibility: inferable(z.array(workResponsibilitySchema).min(1).max(4)),
});
export type RoutingCore = z.infer<typeof routingCoreSchema>;

export const governedExecutionContextSchema = z.object({
  evidenceRegime: systemProvided(evidenceRegimeSchema),
  authority: systemProvided(z.array(authorityGrantSchema)),
  organizationId: systemProvided(z.string().uuid()),
  projectId: systemProvided(z.string().uuid().nullable()),
  availableDocumentIds: systemProvided(z.array(z.string().uuid()).max(500)),
  jurisdiction: inferable(z.array(z.string().min(2).max(8)).max(4)),
  asOfDate: inferable(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  currency: inferable(z.string().length(3).nullable()),
  deadline: inferable(z.string().max(80).nullable()),
  sponsorInstruction: inferable(z.string().max(500).nullable()),
  constraints: inferable(z.array(z.string().max(200)).max(20)),
  language: inferable(z.enum(["pt-BR", "en-US"])),
  urgency: inferable(z.enum(["now", "today", "this_week", "ongoing"]).nullable()),
  availableInputs: inferable(z.array(z.string().max(120)).max(40)),
});
export type GovernedExecutionContext = z.infer<typeof governedExecutionContextSchema>;

export const namedCompositionKeys = [
  "find_and_organize_information",
  "extract_and_reconcile_data",
  "understand_company_sector_asset",
  "answer_a_question",
  "analyze_performance_and_credit",
  "build_or_review_model",
  "diagnose_capital_structure",
  "develop_alternatives",
  "design_indicative_structure",
  "read_contract_covenant_waterfall",
  "prepare_meeting",
  "prepare_material",
  "review_work",
  "prepare_decision",
  "evaluate_received_opportunity",
  "map_market_and_precedents",
  "identify_capital",
  "introduce",
  "monitor",
  "manage_work",
] as const;
export const namedCompositionSchema = z.enum(namedCompositionKeys);
export type NamedComposition = z.infer<typeof namedCompositionSchema>;

export type NamedCompositionPolicy = {
  atlas: `I${string}`;
  canonicalAction: CanonicalIntentAction;
  primaryWorks: readonly [PrimaryWork, ...PrimaryWork[]];
  primaryWorkVariants?: readonly [{
    when: "documents_present";
    primaryWorks: readonly [PrimaryWork, ...PrimaryWork[]];
  }];
  depth: z.infer<typeof intentDepthSchema>;
  workResponsibilities: readonly [WorkResponsibility, ...WorkResponsibility[]];
  effect: DcmWorkEffect;
  classifierGuidance: string;
};

/**
 * Single executable policy for the twenty Atlas families. Schema validation, classifier
 * canonicalization, system stamping and eval fingerprints all consume this object. Adding a
 * second composition table anywhere else is a policy fork and must fail review.
 */
export const namedCompositions = {
  find_and_organize_information: {atlas: "I01", canonicalAction: "find_and_organize", primaryWorks: ["find_and_organize"], depth: "preliminary", workResponsibilities: ["producer"], effect: "none", classifierGuidance: "collect or organize information without analysis"},
  extract_and_reconcile_data: {atlas: "I02", canonicalAction: "extract_and_reconcile", primaryWorks: ["extract_and_reconcile"], depth: "institutional", workResponsibilities: ["producer"], effect: "none", classifierGuidance: "extract, spread, reconcile or explain discrepancies in supplied data"},
  understand_company_sector_asset: {atlas: "I03", canonicalAction: "understand", primaryWorks: ["understand"], depth: "preliminary", workResponsibilities: ["producer"], effect: "none", classifierGuidance: "understand a company, sector or asset without a narrower requested outcome"},
  answer_a_question: {atlas: "I04", canonicalAction: "answer", primaryWorks: ["extract_and_reconcile"], depth: "point", workResponsibilities: ["producer"], effect: "none", classifierGuidance: "explain or trace a bounded fact, number or instrument question"},
  analyze_performance_and_credit: {atlas: "I05", canonicalAction: "analyze", primaryWorks: ["analyze", "model"], depth: "preliminary", workResponsibilities: ["producer"], effect: "none", classifierGuidance: "analyze financial performance, credit risk, covenant headroom or downside"},
  build_or_review_model: {atlas: "I06", canonicalAction: "model", primaryWorks: ["model"], depth: "institutional", workResponsibilities: ["producer"], effect: "none", classifierGuidance: "build, audit or change assumptions in a financial model"},
  diagnose_capital_structure: {atlas: "I07", canonicalAction: "diagnose", primaryWorks: ["capital_strategy", "analyze", "model"], depth: "institutional", workResponsibilities: ["producer"], effect: "none", classifierGuidance: "diagnose debt, liquidity, maturities, repricing or capital structure"},
  develop_alternatives: {atlas: "I08", canonicalAction: "compare", primaryWorks: ["capital_strategy", "analyze", "model"], depth: "preliminary", workResponsibilities: ["producer"], effect: "none", classifierGuidance: "develop or compare capital alternatives without selecting final terms"},
  design_indicative_structure: {atlas: "I09", canonicalAction: "structure", primaryWorks: ["capital_strategy", "analyze"], primaryWorkVariants: [{when: "documents_present", primaryWorks: ["extract_and_reconcile", "capital_strategy", "analyze"]}], depth: "institutional", workResponsibilities: ["producer", "coordinator"], effect: "none", classifierGuidance: "design an indicative debt or receivables structure; supplied documents must be extracted and reconciled first"},
  read_contract_covenant_waterfall: {atlas: "I10", canonicalAction: "read_document", primaryWorks: ["read_documents", "analyze"], depth: "institutional", workResponsibilities: ["producer"], effect: "none", classifierGuidance: "read or test a contract, covenant clause, formula or payment waterfall"},
  prepare_meeting: {atlas: "I11", canonicalAction: "prepare_meeting", primaryWorks: ["understand", "capital_strategy", "model"], depth: "preliminary", workResponsibilities: ["producer", "coordinator"], effect: "none", classifierGuidance: "prepare for a client or management meeting; understanding precedes strategy and modelling, including financing meetings"},
  prepare_material: {atlas: "I12", canonicalAction: "prepare_material", primaryWorks: ["capital_strategy", "analyze", "model"], depth: "institutional", workResponsibilities: ["producer", "coordinator"], effect: "none", classifierGuidance: "produce an explicitly requested deck, memo, spreadsheet or other material"},
  review_work: {atlas: "I13", canonicalAction: "review", primaryWorks: ["analyze"], depth: "institutional", workResponsibilities: ["producer", "reviewer"], effect: "none", classifierGuidance: "challenge, critique or quality-review existing work"},
  prepare_decision: {atlas: "I14", canonicalAction: "prepare_decision", primaryWorks: ["capital_strategy", "analyze", "model"], depth: "institutional", workResponsibilities: ["producer", "sponsor"], effect: "none", classifierGuidance: "prepare a recommendation or decision for a board or committee"},
  evaluate_received_opportunity: {atlas: "I15", canonicalAction: "evaluate", primaryWorks: ["analyze", "read_documents"], depth: "preliminary", workResponsibilities: ["producer", "reviewer"], effect: "none", classifierGuidance: "screen a received investment or financing opportunity"},
  map_market_and_precedents: {atlas: "I16", canonicalAction: "map_market", primaryWorks: ["market"], depth: "preliminary", workResponsibilities: ["producer"], effect: "none", classifierGuidance: "map current market terms, pricing, comparables or precedents"},
  identify_capital: {atlas: "I17", canonicalAction: "identify_capital", primaryWorks: ["capital_match", "market"], depth: "preliminary", workResponsibilities: ["producer", "coordinator"], effect: "none", classifierGuidance: "identify or shortlist suitable capital providers without contacting them"},
  introduce: {atlas: "I18", canonicalAction: "introduce", primaryWorks: ["capital_match"], depth: "institutional", workResponsibilities: ["coordinator"], effect: "external", classifierGuidance: "send, connect or introduce an opportunity to an external party"},
  monitor: {atlas: "I19", canonicalAction: "monitor", primaryWorks: ["find_and_organize", "extract_and_reconcile", "analyze"], depth: "preliminary", workResponsibilities: ["producer"], effect: "none", classifierGuidance: "monitor recurring changes and alert on a defined condition"},
  manage_work: {atlas: "I20", canonicalAction: "manage_work", primaryWorks: ["find_and_organize"], depth: "point", workResponsibilities: ["coordinator"], effect: "propose_state", classifierGuidance: "manage project status, versions, open work or comments"},
} as const satisfies Record<NamedComposition, NamedCompositionPolicy>;

export function compositionPolicy(composition: NamedComposition): NamedCompositionPolicy {
  return namedCompositions[composition];
}

export function resolveCompositionPrimaryWorks(
  composition: NamedComposition,
  context: {documentsPresent: boolean},
): readonly [PrimaryWork, ...PrimaryWork[]] {
  const policy = compositionPolicy(composition);
  const variant = context.documentsPresent ? policy.primaryWorkVariants?.find(({when}) => when === "documents_present") : undefined;
  return variant?.primaryWorks ?? policy.primaryWorks;
}

export function intentCompositionPolicyPrompt(): string {
  return namedCompositionKeys.map((composition) => {
    const policy = compositionPolicy(composition);
    const variants = policy.primaryWorkVariants?.map(({when, primaryWorks}) => `; when ${when}: ${primaryWorks.join(" -> ")}`).join("") ?? "";
    return `- ${composition}: ${policy.classifierGuidance}; works: ${policy.primaryWorks.join(" -> ")}${variants}; depth: ${policy.depth}`;
  }).join("\n");
}

const sameOrderedValues = <T extends string>(actual: readonly T[], expected: readonly T[]): boolean =>
  actual.length === expected.length && actual.every((value, index) => value === expected[index]);
const assertsRoutedMeaning = (state: IntentFieldState): boolean => state === "explicit" || state === "inferred" || state === "system" || state === "reused_confirmed";

export const intentEnvelopeSchema = z.object({
  schemaVersion: z.literal("intent-envelope.v1"),
  routingCore: routingCoreSchema,
  executionContext: governedExecutionContextSchema,
  /** One to three primary works, the first being the one the plan starts from. */
  primaryWorks: z.array(z.object({work: primaryWorkSchema, confidence: z.number().min(0).max(1)})).min(1).max(3),
  /** A named composition when one applies. Unknown strings are rejected at the boundary. */
  composition: namedCompositionSchema.nullable(),
  effect: dcmWorkEffectSchema,
  createdAt: z.string().datetime({offset: true}),
}).superRefine((envelope, ctx) => {
  if (envelope.composition === null) {
    const checks: Array<[boolean, (string | number)[], string]> = [
      [envelope.effect === "none", ["effect"], "an unnamed route can have no committed or external effect"],
      [!envelope.routingCore.action.value.includes("introduce"), ["routingCore", "action"], "an unnamed route cannot introduce externally"],
      [!envelope.routingCore.workResponsibility.value.includes("external_authorizer"), ["routingCore", "workResponsibility"], "an unnamed route cannot claim external authorization"],
    ];
    for (const [valid, path, message] of checks) if (!valid) ctx.addIssue({code: z.ZodIssueCode.custom, path, message});
    return;
  }
  const policy = compositionPolicy(envelope.composition);
  const works = envelope.primaryWorks.map(({work}) => work);
  const expectedWorks = resolveCompositionPrimaryWorks(envelope.composition, {
    documentsPresent: envelope.executionContext.availableDocumentIds.value.length > 0,
  });
  if (!sameOrderedValues(works, expectedWorks)) {
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ["primaryWorks"], message: "primary works must match the canonical composition policy"});
  }
  if (!sameOrderedValues(envelope.routingCore.action.value, [policy.canonicalAction])) {
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ["routingCore", "action"], message: "action must match the canonical composition policy"});
  }
  if (!assertsRoutedMeaning(envelope.routingCore.action.state)) {
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ["routingCore", "action", "state"], message: "a routed action has an asserted state"});
  }
  if (!assertsRoutedMeaning(envelope.routingCore.object.state)) {
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ["routingCore", "object", "state"], message: "routed objects have an asserted state"});
  }
  if (envelope.routingCore.decision.value !== null && !assertsRoutedMeaning(envelope.routingCore.decision.state)) {
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ["routingCore", "decision", "state"], message: "a routed decision has an asserted state"});
  }
  if (!(envelope.routingCore.audience.value.length === 1 && envelope.routingCore.audience.value[0] === "unspecified")
    && !assertsRoutedMeaning(envelope.routingCore.audience.state)) {
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ["routingCore", "audience", "state"], message: "a routed audience has an asserted state"});
  }
  if (envelope.routingCore.depth.value !== policy.depth) {
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ["routingCore", "depth"], message: "depth must match the canonical composition policy"});
  }
  if (!sameOrderedValues(envelope.routingCore.workResponsibility.value, policy.workResponsibilities)) {
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ["routingCore", "workResponsibility"], message: "responsibilities must match the canonical composition policy"});
  }
  if (envelope.effect !== policy.effect) {
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ["effect"], message: "effect must match the canonical composition policy"});
  }
});
export type IntentEnvelope = z.infer<typeof intentEnvelopeSchema>;

/**
 * The fields the model may never fill. A classifier output that marks any of them as inferred
 * is rejected before it reaches a plan.
 */
export function systemFieldViolations(envelope: IntentEnvelope): string[] {
  const context = envelope.executionContext;
  const violations: string[] = [];
  for (const [key, field] of Object.entries({
    evidenceRegime: context.evidenceRegime,
    authority: context.authority,
    organizationId: context.organizationId,
    projectId: context.projectId,
    availableDocumentIds: context.availableDocumentIds,
  })) {
    if (field.state !== "system") violations.push(key);
  }
  return violations;
}

/**
 * Whether a field that can be inferred still needs the person before the work relies on it:
 * only when it is material to the decision and was not stated or confirmed.
 */
export function needsConfirmation(field: {state: IntentFieldState; confidence?: number}, material: boolean): boolean {
  if (!material) return false;
  if (field.state === "explicit" || field.state === "reused_confirmed" || field.state === "system") return false;
  return true;
}
