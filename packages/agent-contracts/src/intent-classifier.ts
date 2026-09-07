import {z} from "zod";

import {
  intentContinuitySchema,
  intentDepthSchema,
  intentObjectKindSchema,
  namedCompositionSchema,
  primaryWorkSchema,
  workResponsibilitySchema,
} from "./intent-envelope";

export const intentClassifierInputSchema = z.object({
  locale: z.enum(["pt-BR", "en-US"]),
  latestUserMessage: z.string().min(1),
  recentConversation: z.array(z.object({role: z.string().min(1), content: z.string()})).max(8),
  entryJob: z.string().nullable(),
  documentCount: z.number().int().nonnegative(),
  professionalContext: z.object({
    useForms: z.array(z.string()),
    professionalRoles: z.array(z.string()),
    practiceAreas: z.array(z.string()),
    primaryObjectives: z.array(z.string()),
  }).nullable(),
});
export type IntentClassifierInput = z.infer<typeof intentClassifierInputSchema>;

/** Parse once before JSON serialization so runtime and evals send the same bounded shape. */
export function buildIntentClassifierInput(input: IntentClassifierInput): IntentClassifierInput {
  return intentClassifierInputSchema.parse(input);
}

/**
 * The exact model-written portion of an Intent Envelope. It lives beside the envelope contract
 * so the worker and the gold gate cannot silently test different prompts or schemas.
 *
 * This schema is intentionally more permissive than the persisted envelope: prompted JSON is
 * not grammar-bound. The worker clamps strings and lists and stamps authority, evidence and
 * tenant fields from the control plane before persistence.
 */
const inferredClassifierField = <T extends z.ZodTypeAny>(value: T) => z.object({
  value,
  state: z.enum(["explicit", "inferred", "ambiguous", "unknown", "not_applicable"]),
  confidence: z.number().min(0).max(1).nullish(),
  basis: z.string().max(200).nullish(),
});

export const intentClassifierOutputSchema = z.object({
  routingCore: z.object({
    action: inferredClassifierField(z.array(z.string().min(1).max(400)).min(1).max(16)),
    object: inferredClassifierField(z.array(z.object({kind: intentObjectKindSchema, reference: z.string().max(400).nullish()})).min(1).max(24)),
    desiredOutcome: inferredClassifierField(z.string().min(1).max(1_200)),
    decision: inferredClassifierField(z.string().max(1_200).nullable()),
    audience: inferredClassifierField(z.array(z.string().min(1).max(200)).min(1).max(12)),
    depth: inferredClassifierField(intentDepthSchema),
    continuity: inferredClassifierField(intentContinuitySchema),
    workResponsibility: inferredClassifierField(z.array(workResponsibilitySchema).min(1).max(8)),
  }),
  inferableContext: z.object({
    jurisdiction: inferredClassifierField(z.array(z.string().min(1).max(40)).max(8)),
    asOfDate: inferredClassifierField(z.string().max(40).nullable()),
    currency: inferredClassifierField(z.string().max(12).nullable()),
    deadline: inferredClassifierField(z.string().max(300).nullable()),
    sponsorInstruction: inferredClassifierField(z.string().max(2_000).nullable()),
    constraints: inferredClassifierField(z.array(z.string().max(600)).max(40)),
    urgency: inferredClassifierField(z.enum(["now", "today", "this_week", "ongoing"]).nullable()),
    availableInputs: inferredClassifierField(z.array(z.string().max(400)).max(80)),
  }),
  primaryWorks: z.array(z.object({work: primaryWorkSchema, confidence: z.number().min(0).max(1)})).min(1).max(6),
  composition: namedCompositionSchema.nullable(),
  /** The one question the classifier would ask first, if it were allowed to ask. */
  firstQuestion: z.string().max(600).nullable(),
  abstain: z.boolean(),
  abstainReason: z.string().max(600).nullable(),
});
export type IntentClassifierOutput = z.infer<typeof intentClassifierOutputSchema>;

/** Stable production classifier instructions, shared verbatim by runtime and gold gate. */
export const INTENT_CLASSIFIER_SYSTEM = `You classify one turn of a debt capital markets conversation into an intent envelope. You do
not answer the request and you do not plan or execute the work.

Fill only what the turn, the recent conversation and the listed inputs support. Every field carries
a state and a confidence: "explicit" when the person said it, "inferred" when it follows from what
they said, "ambiguous" when two readings remain, "unknown" when nothing supports a value. Never
guess authority, evidence regime, permissions or documents: they are not yours to fill.

Primary works (choose one to three, the work that must start first goes first): find_and_organize,
extract_and_reconcile, understand, analyze, model, capital_strategy, read_documents, market,
capital_match. Do not add a generic work when the turn names a bounded one. A point question about
a number starts with extract_and_reconcile. An explicit assumption change starts with model. A
market terms question starts with market. A received opportunity triage starts with analyze. A
structure request with attached material starts with extract_and_reconcile before strategy.

Composition is either null or exactly one of these identifiers. Never describe a sequence in this
field:
find_and_organize_information, extract_and_reconcile_data, understand_company_sector_asset,
answer_a_question, analyze_performance_and_credit, build_or_review_model,
diagnose_capital_structure, develop_alternatives, design_indicative_structure,
read_contract_covenant_waterfall, prepare_meeting, prepare_material, review_work,
prepare_decision, evaluate_received_opportunity, map_market_and_precedents, identify_capital,
introduce, monitor, manage_work.

Choose the composition that names the requested outcome, not an intermediate step. In particular:
- preparing for a client or management conversation is prepare_meeting;
- producing an explicitly requested deck, memo or model output is prepare_material;
- preparing a decision for a board or committee is prepare_decision;
- explaining or tracing a bounded number is answer_a_question;
- changing an existing model assumption is build_or_review_model;
- challenging existing work is review_work;
- screening a received investment proposal is evaluate_received_opportunity;
- designing a receivables or other debt structure is design_indicative_structure;
- asking to send or connect externally is introduce, even if authorization is still missing;
- collecting without analysis is find_and_organize_information;
- asking for market terms or precedents is map_market_and_precedents;
- analysing covenant headroom or credit performance is analyze_performance_and_credit.

Work responsibility describes the person's role in this work, never their job title: producer,
coordinator, reviewer, decision_maker, sponsor, recipient, external_authorizer.
Producer applies when the person asks the system to create or analyse. Reviewer applies when they
ask for a challenge or review. Coordinator applies when they orchestrate a structure, process or
capital outreach. Decision_maker applies when they own the choice being prepared; sponsor applies
when they own the broader programme. Multiple responsibilities may apply.

Depth: point only for a bounded factual question or a truly context-free request; preliminary for
early exploration, triage or idea generation; institutional for an existing deliverable, decision,
full structure or model update. Continuity: use resume for a follow-up that continues prior work,
refresh for an assumption or data update, monitor for recurring surveillance, comparison for an
explicit comparison, and new when there is no prior work or the person explicitly replaces the
prior objective.

If the turn is too ambiguous to identify the referenced object and desired outcome, set abstain to
true, composition to null and ask one question that identifies both. If one answer would change the
work family, ordering, audience or deliverable, put that single question in firstQuestion.
Questions about missing evidence belong to the downstream coverage engine, not here, unless the
missing fact changes the workflow itself. For a point explanation, explicit model update, review,
collection-only request, market query or bounded covenant analysis, leave firstQuestion null.
Return the requested JSON only.`;
