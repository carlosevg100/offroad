import {z} from "zod";

import {
  intentContinuitySchema,
  intentDepthSchema,
  intentObjectKindSchema,
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
  composition: z.string().max(120).nullable(),
  /** The one question the classifier would ask first, if it were allowed to ask. */
  firstQuestion: z.string().max(600).nullable(),
  abstain: z.boolean(),
  abstainReason: z.string().max(600).nullable(),
});
export type IntentClassifierOutput = z.infer<typeof intentClassifierOutputSchema>;

/** Stable production classifier instructions, shared verbatim by runtime and gold gate. */
export const INTENT_CLASSIFIER_SYSTEM = `You classify one turn of a debt capital markets conversation into an intent envelope. You do
not answer the request and you do not plan work.

Fill only what the turn, the recent conversation and the listed inputs support. Every field carries
a state and a confidence: "explicit" when the person said it, "inferred" when it follows from what
they said, "ambiguous" when two readings remain, "unknown" when nothing supports a value. Never
guess authority, evidence regime, permissions or documents: they are not yours to fill.

Primary works (choose one to three, most likely first): find_and_organize, extract_and_reconcile,
understand, analyze, model, capital_strategy, read_documents, market, capital_match.
Work responsibility describes the person's role in this work, never their job title: producer,
coordinator, reviewer, decision_maker, sponsor, recipient, external_authorizer.
Depth: point (a delimited question), preliminary, institutional. Continuity: new, refresh,
monitor, comparison, resume.

If the turn is too ambiguous to name a primary work, set abstain to true and say why. If one
question would change the plan, put it in firstQuestion; otherwise leave it null.
Return the requested JSON only.`;
