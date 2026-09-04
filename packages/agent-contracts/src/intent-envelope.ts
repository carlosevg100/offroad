import {z} from "zod";

import {dcmWorkEffectSchema} from "./work-system";

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

export const evidenceRegimeSchema = z.enum(["public", "private_authorized", "hybrid", "received"]);
export const authorityGrantSchema = z.enum(["read", "modify", "approve_internal", "share", "introduce"]);

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

export const intentEnvelopeSchema = z.object({
  schemaVersion: z.literal("intent-envelope.v1"),
  routingCore: routingCoreSchema,
  executionContext: governedExecutionContextSchema,
  /** One to three primary works, the first being the one the plan starts from. */
  primaryWorks: z.array(z.object({work: primaryWorkSchema, confidence: z.number().min(0).max(1)})).min(1).max(3),
  /** A named composition when one applies (see `namedCompositions`). Never required. */
  composition: z.string().max(60).nullable(),
  effect: dcmWorkEffectSchema,
  createdAt: z.string().datetime({offset: true}),
});
export type IntentEnvelope = z.infer<typeof intentEnvelopeSchema>;

/**
 * The twenty families of the Atlas survive as named compositions: a primary work plus fixed
 * modifier values. Derived as data, the catalogue and the router cannot drift apart.
 */
export const namedCompositions = {
  find_and_organize_information: {atlas: "I01", primaryWorks: ["find_and_organize"], modifiers: {}},
  extract_and_reconcile_data: {atlas: "I02", primaryWorks: ["extract_and_reconcile"], modifiers: {}},
  understand_company_sector_asset: {atlas: "I03", primaryWorks: ["understand"], modifiers: {}},
  answer_a_question: {atlas: "I04", primaryWorks: ["extract_and_reconcile", "understand"], modifiers: {depth: "point"}},
  analyze_performance_and_credit: {atlas: "I05", primaryWorks: ["analyze"], modifiers: {}},
  build_or_review_model: {atlas: "I06", primaryWorks: ["model"], modifiers: {}},
  diagnose_capital_structure: {atlas: "I07", primaryWorks: ["capital_strategy"], modifiers: {stage: "diagnose"}},
  develop_alternatives: {atlas: "I08", primaryWorks: ["capital_strategy"], modifiers: {stage: "compare"}},
  design_indicative_structure: {atlas: "I09", primaryWorks: ["capital_strategy"], modifiers: {stage: "design"}},
  read_contract_covenant_waterfall: {atlas: "I10", primaryWorks: ["read_documents"], modifiers: {}},
  prepare_meeting: {atlas: "I11", primaryWorks: ["understand", "capital_strategy"], modifiers: {outputForm: "artifact", audienceKind: "counterparty"}},
  prepare_material: {atlas: "I12", primaryWorks: ["capital_strategy"], modifiers: {outputForm: "file"}},
  review_work: {atlas: "I13", primaryWorks: ["analyze"], modifiers: {workResponsibility: "reviewer"}},
  prepare_decision: {atlas: "I14", primaryWorks: ["capital_strategy"], modifiers: {outputForm: "file", audienceKind: "committee"}},
  evaluate_received_opportunity: {atlas: "I15", primaryWorks: ["analyze", "read_documents"], modifiers: {evidenceRegime: "received", workResponsibility: "recipient"}},
  map_market_and_precedents: {atlas: "I16", primaryWorks: ["market"], modifiers: {}},
  identify_capital: {atlas: "I17", primaryWorks: ["capital_match"], modifiers: {}},
  introduce: {atlas: "I18", primaryWorks: ["capital_match"], modifiers: {effect: "external"}},
  monitor: {atlas: "I19", primaryWorks: ["find_and_organize", "extract_and_reconcile"], modifiers: {continuity: "monitor"}},
  manage_work: {atlas: "I20", primaryWorks: [], modifiers: {workspaceFunction: true}},
} as const satisfies Record<string, {atlas: string; primaryWorks: readonly PrimaryWork[]; modifiers: Record<string, string | boolean>}>;

export type NamedComposition = keyof typeof namedCompositions;

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
