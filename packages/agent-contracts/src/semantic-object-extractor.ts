import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

import {
  intentObjectCardinalityLimit,
  intentObjectKindSchema,
  intentObjectSlotKeySchema,
  type IntentObjectSlotKey,
} from "./intent-envelope";
import {intentClassifierOutputSchema, type IntentClassifierOutput} from "./intent-classifier";

const nonEmpty = z.string().trim().min(1);
const stableId = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);

const canonicalObjectSlotSchema = z.object({
  key: intentObjectSlotKeySchema,
  value: nonEmpty.max(200),
}).strict();

const SLOT_COMPATIBILITY: Record<z.infer<typeof intentObjectKindSchema>, ReadonlySet<IntentObjectSlotKey>> = {
  organization: new Set(["entity", "subject"]),
  user: new Set(["entity", "subject"]),
  company: new Set(["entity", "subject"]),
  project: new Set(["entity", "subject"]),
  operation: new Set(["entity", "subject", "amount", "currency", "percentage", "basis_points", "ratio", "indexer", "tenor_months"]),
  instrument: new Set(["entity", "subject", "amount", "currency", "percentage", "basis_points", "ratio", "indexer", "tenor_months"]),
  document: new Set(["entity", "subject", "count"]),
  claim: new Set(["subject", "amount", "currency", "percentage", "basis_points", "ratio", "indexer", "tenor_months", "count", "cadence"]),
  model: new Set(["entity", "subject"]),
  asset_or_pool: new Set(["entity", "subject", "amount", "currency", "count"]),
  scenario: new Set(["subject", "amount", "currency", "percentage", "basis_points", "ratio", "indexer", "tenor_months", "cadence"]),
  alternative: new Set(["entity", "subject", "amount", "currency", "percentage", "basis_points", "ratio", "indexer", "tenor_months"]),
  material: new Set(["entity", "subject", "page_count", "count"]),
  market: new Set(["entity", "subject", "percentage", "basis_points", "ratio", "indexer", "tenor_months", "cadence"]),
  provider: new Set(["entity", "subject", "count"]),
  mandate: new Set(["entity", "subject", "amount", "currency", "percentage", "basis_points", "ratio", "indexer", "tenor_months"]),
  process: new Set(["entity", "subject", "count", "cadence"]),
  decision: new Set(["entity", "subject"]),
};

function validateSlotsForKind(
  kind: z.infer<typeof intentObjectKindSchema>,
  slots: readonly z.infer<typeof canonicalObjectSlotSchema>[],
  ctx: z.RefinementCtx,
  path: PropertyKey[] = [],
): void {
  for (const [index, slot] of slots.entries()) {
    if (!SLOT_COMPATIBILITY[kind].has(slot.key)) {
      ctx.addIssue({code: "custom", path: [...path, index, "key"], message: `${slot.key} is not valid for ${kind}`});
    }
  }
}

const canonicalObjectSlotsSchema = z.array(canonicalObjectSlotSchema).min(1).max(12).superRefine((slots, ctx) => {
  const keys = new Set<string>();
  for (const [index, slot] of slots.entries()) {
    if (keys.has(slot.key)) {
      ctx.addIssue({code: "custom", path: [index, "key"], message: "slot keys are unique within an object"});
    }
    keys.add(slot.key);
  }
  const headCount = Number(keys.has("entity")) + Number(keys.has("subject"));
  if (headCount !== 1) ctx.addIssue({code: "custom", message: "an object has exactly one entity or subject head"});
});

const governedObjectiveRevisionSchema = z.object({
  id: stableId,
  revision: z.number().int().positive(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  label: nonEmpty.max(2_000),
}).strict();

const governedSourceManifestSchema = z.object({
  id: stableId,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  documentIds: z.array(z.uuid()).max(500),
  evidenceObjectIds: z.array(stableId).max(500),
}).strict().superRefine((manifest, ctx) => {
  if (new Set(manifest.documentIds).size !== manifest.documentIds.length) {
    ctx.addIssue({code: "custom", path: ["documentIds"], message: "source-manifest document ids are unique"});
  }
  if (new Set(manifest.evidenceObjectIds).size !== manifest.evidenceObjectIds.length) {
    ctx.addIssue({code: "custom", path: ["evidenceObjectIds"], message: "source-manifest evidence object ids are unique"});
  }
});

/**
 * A context object is admitted by the control plane, never inferred by the extractor. The source
 * ids point to the governed object/evidence registry that established it. This gives follow-up
 * turns a compact work memory without turning prior assistant prose into evidence.
 */
export const activeWorkContextObjectSchema = z.object({
  id: stableId,
  ordinal: z.number().int().min(1).max(500),
  kind: intentObjectKindSchema,
  slots: canonicalObjectSlotsSchema,
  label: nonEmpty.max(200),
  governance: z.object({
    state: z.enum(["user_confirmed", "system_resolved"]),
    sourceIds: z.array(stableId).min(1).max(50),
  }).strict(),
}).strict().superRefine((object, ctx) => validateSlotsForKind(object.kind, object.slots, ctx, ["slots"]));

export const activeWorkContextSchema = z.object({
  schemaVersion: z.literal("active-work-context.v2"),
  contextId: stableId,
  organizationId: z.uuid(),
  projectId: z.uuid(),
  revision: z.number().int().positive(),
  state: z.enum(["active", "paused"]),
  objective: governedObjectiveRevisionSchema,
  sourceManifest: governedSourceManifestSchema,
  objects: z.array(activeWorkContextObjectSchema).max(500),
}).strict().superRefine((context, ctx) => {
  if (context.revision !== context.objective.revision) {
    ctx.addIssue({code: "custom", path: ["revision"], message: "context revision is the bound objective revision"});
  }
  if (!context.sourceManifest.evidenceObjectIds.includes(context.projectId)
    || !context.sourceManifest.evidenceObjectIds.includes(context.objective.id)) {
    ctx.addIssue({code: "custom", path: ["sourceManifest", "evidenceObjectIds"], message: "source manifest binds the project and objective revision"});
  }
  const allowedSources = new Set([
    context.sourceManifest.id,
    ...context.sourceManifest.documentIds,
    ...context.sourceManifest.evidenceObjectIds,
  ]);
  const ids = new Set<string>();
  const ordinals = new Set<number>();
  for (const [index, object] of context.objects.entries()) {
    if (ids.has(object.id)) ctx.addIssue({code: "custom", path: ["objects", index, "id"], message: "context object ids are unique"});
    if (ordinals.has(object.ordinal)) ctx.addIssue({code: "custom", path: ["objects", index, "ordinal"], message: "context object ordinals are unique"});
    ids.add(object.id);
    ordinals.add(object.ordinal);
    for (const [sourceIndex, sourceId] of object.governance.sourceIds.entries()) {
      if (!allowedSources.has(sourceId)) {
        ctx.addIssue({code: "custom", path: ["objects", index, "governance", "sourceIds", sourceIndex], message: "context object source belongs to the governed source manifest"});
      }
    }
  }
});
export type ActiveWorkContext = z.infer<typeof activeWorkContextSchema>;

const recentMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(20_000),
}).strict();

export const semanticObjectExtractorInputSchema = z.object({
  locale: z.enum(["pt-BR", "en-US"]),
  latestUserMessage: nonEmpty.max(20_000),
  recentConversation: z.array(recentMessageSchema).max(8),
  activeWorkContext: activeWorkContextSchema.nullable(),
}).strict();
export type SemanticObjectExtractorInput = z.infer<typeof semanticObjectExtractorInputSchema>;

/** Parse once before JSON serialization so runtime and evals send the same bounded shape. */
export function buildSemanticObjectExtractorInput(input: SemanticObjectExtractorInput): SemanticObjectExtractorInput {
  return semanticObjectExtractorInputSchema.parse(input);
}

/** Text spans use JavaScript UTF-16 offsets, matching String.slice in runtime and evals. */
export const semanticTextSpanSchema = z.object({
  source: z.enum(["latest_user_message", "recent_user_message"]),
  messageIndex: z.number().int().min(0).max(7).nullable(),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  text: nonEmpty.max(600),
}).strict().superRefine((span, ctx) => {
  if (span.end <= span.start) ctx.addIssue({code: "custom", path: ["end"], message: "span end is greater than start"});
  if (span.source === "latest_user_message" && span.messageIndex !== null) {
    ctx.addIssue({code: "custom", path: ["messageIndex"], message: "latest message spans have a null messageIndex"});
  }
  if (span.source === "recent_user_message" && span.messageIndex === null) {
    ctx.addIssue({code: "custom", path: ["messageIndex"], message: "recent message spans identify their input array index"});
  }
});
export type SemanticTextSpan = z.infer<typeof semanticTextSpanSchema>;

const headCandidateSchema = z.object({
  key: z.enum(["entity", "subject"]),
  span: semanticTextSpanSchema,
}).strict();

const modifierCandidateSchema = z.object({
  key: z.enum([
    "amount", "currency", "percentage", "basis_points", "ratio", "indexer",
    "tenor_months", "page_count", "count", "cadence",
  ]),
  span: semanticTextSpanSchema,
}).strict();

const semanticObjectCandidateSchema = z.object({
  candidateId: z.string().regex(/^candidate-[1-9]\d*$/),
  kind: intentObjectKindSchema,
  head: headCandidateSchema,
  modifiers: z.array(modifierCandidateSchema).max(10),
}).strict().superRefine((candidate, ctx) => {
  const keys = new Set<string>();
  for (const [index, modifier] of candidate.modifiers.entries()) {
    if (keys.has(modifier.key)) {
      ctx.addIssue({code: "custom", path: ["modifiers", index, "key"], message: "modifier keys are unique within an object"});
    }
    keys.add(modifier.key);
  }
});

const activeContextReferenceSchema = z.object({
  contextObjectId: stableId,
  trigger: semanticTextSpanSchema,
}).strict();

const unresolvedReferenceSchema = z.object({
  span: semanticTextSpanSchema,
  reason: z.enum(["no_governed_match", "multiple_governed_matches", "missing_referent"]),
}).strict();

const excludedSpanSchema = z.object({
  span: semanticTextSpanSchema,
  reason: z.enum(["deadline_or_date", "quoted_example", "negated_request", "non_object_metadata"]),
}).strict();

const excludedSemanticHeadSpanSchema = z.object({
  span: semanticTextSpanSchema,
  reason: z.enum(["quoted_example", "negated_request", "non_object_metadata"]),
}).strict();

/**
 * Model-written extractor output. It carries raw, attributable spans only. Canonical values,
 * final ids, ordering, context imports, completeness and fingerprints are code-owned.
 */
export const semanticObjectExtractorOutputSchema = z.object({
  objects: z.array(semanticObjectCandidateSchema).max(intentObjectCardinalityLimit),
  activeContextReferences: z.array(activeContextReferenceSchema).max(intentObjectCardinalityLimit),
  unresolvedReferences: z.array(unresolvedReferenceSchema).max(12),
  excludedQuantitativeSpans: z.array(excludedSpanSchema).max(24),
  /** Explicitly accounts for a detected non-numeric head that is not an active object. */
  excludedSemanticHeadSpans: z.array(excludedSemanticHeadSpanSchema).max(24).default([]),
}).strict().superRefine((output, ctx) => {
  const candidateIds = new Set<string>();
  for (const [index, object] of output.objects.entries()) {
    if (candidateIds.has(object.candidateId)) {
      ctx.addIssue({code: "custom", path: ["objects", index, "candidateId"], message: "candidate ids are unique"});
    }
    candidateIds.add(object.candidateId);
  }
  const contextIds = new Set<string>();
  for (const [index, reference] of output.activeContextReferences.entries()) {
    if (contextIds.has(reference.contextObjectId)) {
      ctx.addIssue({code: "custom", path: ["activeContextReferences", index, "contextObjectId"], message: "a context object is referenced at most once"});
    }
    contextIds.add(reference.contextObjectId);
  }
});
export type SemanticObjectExtractorOutput = z.infer<typeof semanticObjectExtractorOutputSchema>;

export const normalizedSemanticObjectSchema = z.object({
  id: z.string().regex(/^object-[1-9]\d*$/),
  ordinal: z.number().int().positive(),
  kind: intentObjectKindSchema,
  slots: canonicalObjectSlotsSchema,
  source: z.discriminatedUnion("type", [
    z.object({type: z.literal("text"), spans: z.array(semanticTextSpanSchema).min(1).max(12)}).strict(),
    z.object({type: z.literal("active_work_context"), contextId: stableId, contextRevision: z.number().int().positive(), contextObjectId: stableId, trigger: semanticTextSpanSchema}).strict(),
  ]),
}).strict().superRefine((object, ctx) => validateSlotsForKind(object.kind, object.slots, ctx, ["slots"]));
export type NormalizedSemanticObject = z.infer<typeof normalizedSemanticObjectSchema>;

const coverageIssueSchema = z.object({
  code: z.enum([
    "invalid_source_span", "assistant_text_is_not_evidence", "unknown_context_object",
    "context_not_active", "unresolved_reference", "uncovered_quantitative_mention",
    "invalid_slot_for_kind", "normalization_failed", "duplicate_atomic_object",
    "no_semantic_object",
    "invalid_exclusion_reason",
    "historical_text_is_not_governed_context",
    "uncovered_semantic_head",
    "merged_semantic_heads",
    "semantic_head_multiply_claimed",
    "object_cardinality_exceeded",
  ]),
  severity: z.enum(["error", "warning"]),
  detail: nonEmpty.max(600),
}).strict();

export const semanticObjectCompilationSchema = z.object({
  schemaVersion: z.literal("semantic-object-compilation.v1"),
  status: z.enum(["complete", "incomplete", "rejected"]),
  // Diagnostic objects preserve the complete bounded provider response even when the combined
  // text + context cardinality exceeds the accepted per-turn limit. usableObjects stays empty.
  objects: z.array(normalizedSemanticObjectSchema).max(intentObjectCardinalityLimit * 2),
  usableObjects: z.array(normalizedSemanticObjectSchema).max(intentObjectCardinalityLimit),
  coverage: z.object({
    sourceSpansChecked: z.number().int().nonnegative(),
    quantitativeMentions: z.number().int().nonnegative(),
    quantitativeMentionsCovered: z.number().int().nonnegative(),
    semanticHeadMentions: z.number().int().nonnegative(),
    semanticHeadMentionsCovered: z.number().int().nonnegative(),
    activeContextReferencesChecked: z.number().int().nonnegative(),
    issues: z.array(coverageIssueSchema).max(200),
  }).strict(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((compilation, ctx) => {
  const {fingerprint, ...body} = compilation;
  if (fingerprintJson(body) !== fingerprint) {
    ctx.addIssue({code: "custom", path: ["fingerprint"], message: "compilation fingerprint matches its complete canonical body"});
  }
  for (const [index, object] of compilation.objects.entries()) {
    if (object.ordinal !== index + 1 || object.id !== `object-${index + 1}`) {
      ctx.addIssue({code: "custom", path: ["objects", index], message: "final object ids and ordinals are contiguous in canonical order"});
    }
  }
  const errorCount = compilation.coverage.issues.filter(({severity}) => severity === "error").length;
  if (compilation.coverage.quantitativeMentionsCovered > compilation.coverage.quantitativeMentions) {
    ctx.addIssue({code: "custom", path: ["coverage", "quantitativeMentionsCovered"], message: "covered quantitative mentions cannot exceed detected mentions"});
  }
  if (compilation.coverage.semanticHeadMentionsCovered > compilation.coverage.semanticHeadMentions) {
    ctx.addIssue({code: "custom", path: ["coverage", "semanticHeadMentionsCovered"], message: "covered semantic heads cannot exceed detected heads"});
  }
  if (compilation.status === "complete") {
    if (compilation.objects.length === 0 || errorCount > 0
      || fingerprintJson(compilation.usableObjects) !== fingerprintJson(compilation.objects)) {
      ctx.addIssue({code: "custom", path: ["status"], message: "complete compilation has objects, no errors and exposes exactly those objects as usable"});
    }
  } else if (compilation.usableObjects.length > 0) {
    ctx.addIssue({code: "custom", path: ["usableObjects"], message: "incomplete or rejected compilation exposes no usable objects"});
  }
});
export type SemanticObjectCompilation = z.infer<typeof semanticObjectCompilationSchema>;

export const SEMANTIC_OBJECT_KIND_DEFINITIONS = {
  organization: "the institution or legal organization represented by a person; not the operating company being analysed",
  user: "a specific person whose identity or own profile is itself the subject",
  company: "the operating company, issuer, borrower, sponsor or acquisition target under examination",
  project: "the persistent workspace or named project that contains work over time; not a financing transaction",
  operation: "a financing, transaction, acquisition, expansion or other bounded economic undertaking",
  instrument: "a debt security, facility, loan, covenant or named financing instrument",
  document: "one document, file, filing, spreadsheet or explicitly grouped document class",
  claim: "one proposition, metric, risk, discrepancy or condition that can be tested independently",
  model: "a financial model, forecast, calculation model or sensitivity model",
  asset_or_pool: "an asset, collateral package, receivables pool or other identifiable economic pool",
  scenario: "one coherent assumption set or requested change to variables",
  alternative: "one independently selectable strategic, capital or financing alternative",
  material: "a requested deliverable such as a deck, memo, pitch, spreadsheet or analysis pack",
  market: "a sector, market, pricing environment, comparable universe or precedent set",
  provider: "an investor, lender, bank, fund or other potential capital provider",
  mandate: "an investment, credit or financing mandate and its eligibility criteria",
  process: "a meeting, monitoring routine, workstream, status or recurring operating process",
  decision: "an explicit choice, approval, recommendation or decision question to be prepared",
} as const satisfies Record<z.infer<typeof intentObjectKindSchema>, string>;

export const SEMANTIC_OBJECT_NORMALIZATION_CONTRACT = `
- Text offsets are JavaScript UTF-16 offsets and every span must reproduce source.slice(start, end) exactly.
- "entity" is only a proper name or identifier-specific entity. A generic class, topic or quality uses "subject".
- Amounts are base-unit integer decimal text; currency is ISO-4217; percentages are fractional decimal text;
  basis points are integer text; ratios are decimal multiples; indexers are uppercase canonical codes;
  tenor is integer months; page_count and count are integer text; cadence is one of daily, weekly,
  monthly, quarterly, semiannual, annual or one_time.
- The model returns raw spans, never its own converted number. Code performs and verifies normalization.
- No unsupported derivation: a normalized modifier must be directly stated in its attributed span.
`.trim();

const objectDefinitionsPrompt = Object.entries(SEMANTIC_OBJECT_KIND_DEFINITIONS)
  .map(([kind, definition]) => `- ${kind}: ${definition}`)
  .join("\n");

/** Stable prompt for a bounded second pass; it never routes, plans, answers or executes. */
export const SEMANTIC_OBJECT_EXTRACTOR_SYSTEM = `You extract the semantic objects referenced by one user turn. You do not
classify intent, answer, plan, infer authority, retrieve evidence or execute work.

Kinds:
${objectDefinitionsPrompt}

Atomic reference rule:
- Return one object for every independently referable semantic head. Do not merge a company, operation,
  material, claim, model, instrument, scenario, alternative, document or provider into one object.
- A list of alternatives produces one alternative object per named option. Separately named documents
  produce separate document objects. A plural document class is one object; attach count only when the
  number is explicit. Quantitative modifiers remain on the one head they modify.
- Do not split one head into separate objects merely because it has multiple modifiers.
- The accepted turn cardinality is ${intentObjectCardinalityLimit} text objects plus governed references
  combined. If the turn contains more, return every attributable candidate so code can mark the turn
  incomplete; never silently truncate, merge or choose a preferred subset.

Attribution and order:
- Every new object has one exact head span and zero or more exact modifier spans from user-authored text.
  Never cite assistant text. Use UTF-16 offsets matching JavaScript String.slice.
- New object candidates and context-reference triggers must cite the latest user message. Earlier
  conversation is interpretation-only: it can help detect that a reference is unresolved, but it can
  never promote historical prose into an object or provide an evidence span.
- activeWorkContext is control-plane-governed memory. When the turn refers to one of those objects, return
  its id in activeContextReferences with the textual trigger. Do not copy or rewrite that context object.
  Context references are appended after text objects by code.
- If a pronoun or ellipsis has no unique governed referent, declare it in unresolvedReferences.
- A non-numeric head detected in the turn must be represented by one atomic object, declared unresolved,
  or placed in excludedSemanticHeadSpans with an exact, supported reason. Never omit it silently.

Head and modifier rules:
- entity is only a proper name or identifier-specific entity; generic classes and qualitative subjects use subject.
- The head span is the shortest source phrase that still identifies the object. A modifier span may overlap
  its head span when a phrase such as "R$ 50 milhões" supplies both amount and currency.
- Exclude dates, deadlines, quoted examples, negated requests and other non-object numeric metadata only by
  listing their exact span and a permitted reason. Never hide an uncertain object as excluded metadata.

Normalization contract (performed by code, included here so spans carry sufficient evidence):
${SEMANTIC_OBJECT_NORMALIZATION_CONTRACT}

Return the requested JSON only.`;

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, um: 1, uma: 1, one: 1, dois: 2, duas: 2, two: 2, tres: 3, three: 3,
  quatro: 4, four: 4, cinco: 5, five: 5, seis: 6, six: 6, sete: 7, seven: 7,
  oito: 8, eight: 8, nove: 9, nine: 9, dez: 10, ten: 10, onze: 11, eleven: 11,
  doze: 12, twelve: 12,
};

const normalizeSearchText = (value: string): string => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
  .replace(/\s+/g, " ")
  .trim();

const normalizeLexical = (value: string): string => value.normalize("NFKC").replace(/\s+/g, " ").trim();

function parseNumberToken(raw: string): number | null {
  const text = normalizeSearchText(raw);
  for (const [word, number] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return number;
  }
  const match = text.match(/[-+]?\d[\d.,]*/);
  if (!match) return null;
  let token = match[0]!;
  const comma = token.lastIndexOf(",");
  const dot = token.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    token = comma > dot ? token.replace(/\./g, "").replace(",", ".") : token.replace(/,/g, "");
  } else if (comma >= 0) {
    const decimals = token.length - comma - 1;
    token = decimals === 3 ? token.replace(/,/g, "") : token.replace(",", ".");
  } else if (dot >= 0) {
    const decimals = token.length - dot - 1;
    if (decimals === 3 && /^\d{1,3}(?:\.\d{3})+$/.test(token)) token = token.replace(/\./g, "");
  }
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

const canonicalDecimal = (value: number): string => {
  if (Object.is(value, -0)) return "0";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(12)));
};

function magnitude(raw: string): number {
  const text = normalizeSearchText(raw);
  if (/\b(bilhao|bilhoes|billion|bn)\b/.test(text)) return 1_000_000_000;
  if (/\b(milhao|milhoes|million|mn|mm)\b/.test(text)) return 1_000_000;
  if (/\b(mil|thousand|k)\b/.test(text)) return 1_000;
  return 1;
}

function normalizeSlotValue(key: IntentObjectSlotKey, raw: string): string | null {
  const text = normalizeSearchText(raw);
  if (key === "entity" || key === "subject") return normalizeLexical(raw);
  if (key === "currency") {
    if (/\bbrl\b|r\$|\breais?\b/.test(text)) return "BRL";
    if (/\busd\b|us\$|u\$|\bdolares?\b|\bdollars?\b/.test(text)) return "USD";
    if (/\beur\b|€|\beuros?\b/.test(text)) return "EUR";
    const code = raw.match(/\b[A-Za-z]{3}\b/)?.[0]?.toUpperCase();
    return code ?? null;
  }
  if (key === "indexer") {
    const indexer = text.match(/\b(cdi|ipca|selic|sofr|libor|igpm|igp-m|tjlp|tr)\b/)?.[1];
    return indexer ? indexer.replace("igp-m", "igpm").toUpperCase() : null;
  }
  if (key === "cadence") {
    if (/\b(diari[oa]|diariamente|daily)\b/.test(text)) return "daily";
    if (/\b(semanal|semanalmente|toda semana|weekly)\b/.test(text)) return "weekly";
    if (/\b(mensal|mensalmente|todo mes|monthly)\b/.test(text)) return "monthly";
    if (/\b(trimestral|trimestralmente|todo trimestre|quarterly)\b/.test(text)) return "quarterly";
    if (/\b(semestral|semestralmente|semiannual|semi-annual)\b/.test(text)) return "semiannual";
    if (/\b(anual|anualmente|todo ano|annual|annually|yearly)\b/.test(text)) return "annual";
    if (/\b(uma vez|pontual|one[- ]?time)\b/.test(text)) return "one_time";
    return null;
  }
  const number = parseNumberToken(raw);
  if (number === null) return null;
  if (key === "amount") return canonicalDecimal(number * magnitude(raw));
  if (key === "percentage") return /%|\bpercent(?:age)?\b|\bpor cento\b/.test(text) ? canonicalDecimal(number / 100) : null;
  if (key === "basis_points") return /\bbps?\b|\bbasis points?\b|\bpontos?-base\b/.test(text) && Number.isInteger(number) ? String(number) : null;
  if (key === "page_count") return /\bpaginas?\b|\bpages?\b/.test(text) && Number.isInteger(number) ? String(number) : null;
  if (key === "count") {
    return Number.isInteger(number) ? String(number) : null;
  }
  if (key === "ratio") return /x\b|\bvezes\b|\bmultiples?\b/.test(text) ? canonicalDecimal(number) : null;
  if (key === "tenor_months") {
    if (/\b(ano|anos|year|years)\b/.test(text)) return canonicalDecimal(number * 12);
    if (/\b(mes|meses|month|months)\b/.test(text)) return canonicalDecimal(number);
    return null;
  }
  return null;
}

function sourceText(input: SemanticObjectExtractorInput, span: SemanticTextSpan): string | null {
  if (span.source === "latest_user_message") return input.latestUserMessage;
  const message = span.messageIndex === null ? undefined : input.recentConversation[span.messageIndex];
  return message?.role === "user" ? message.content : null;
}

function validateSpan(input: SemanticObjectExtractorInput, span: SemanticTextSpan): "valid" | "assistant" | "invalid" {
  if (span.source === "recent_user_message" && span.messageIndex !== null
    && input.recentConversation[span.messageIndex]?.role === "assistant") return "assistant";
  const source = sourceText(input, span);
  if (source === null || span.end > source.length) return "invalid";
  return source.slice(span.start, span.end) === span.text ? "valid" : "invalid";
}

function exclusionIsSupported(input: SemanticObjectExtractorInput, excluded: z.infer<typeof excludedSpanSchema>): boolean {
  const source = sourceText(input, excluded.span);
  if (source === null) return false;
  const normalized = normalizeSearchText(excluded.span.text);
  if (excluded.reason === "deadline_or_date") {
    return /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b|\b(?:hoje|amanha|today|tomorrow)\b/.test(normalized);
  }
  if (excluded.reason === "quoted_example") {
    const before = source.slice(0, excluded.span.start);
    const after = source.slice(excluded.span.end);
    const quotePairs: Array<[string, string]> = [["\"", "\""], ["'", "'"], ["“", "”"], ["‘", "’"]];
    return quotePairs.some(([open, close]) => {
      if (open === close) return before.split(open).length % 2 === 0 && after.indexOf(close) >= 0;
      return before.lastIndexOf(open) > before.lastIndexOf(close) && after.indexOf(close) >= 0;
    });
  }
  if (excluded.reason === "negated_request") {
    const window = normalizeSearchText(source.slice(Math.max(0, excluded.span.start - 100), excluded.span.start));
    return /\b(?:nao|sem|nunca|jamais|evite|not|without|never|avoid)\b/.test(window);
  }
  // Non-object metadata is deliberately narrow; business quantities cannot be hidden here.
  const surrounding = normalizeSearchText(source.slice(Math.max(0, excluded.span.start - 40), Math.min(source.length, excluded.span.end + 20)));
  return /\b(?:versao|version|turno|turn|tentativa|attempt|item|passo|step)\s*(?:n(?:o|umber)?\.?\s*)?\d+\b/.test(surrounding);
}

type QuantityMention = {source: SemanticTextSpan["source"]; messageIndex: number | null; start: number; end: number; text: string};

type SemanticHeadMention = {
  source: "latest_user_message";
  messageIndex: null;
  start: number;
  end: number;
  text: string;
  expectedKind: z.infer<typeof intentObjectKindSchema> | null;
};

/**
 * Independent, code-owned coverage vocabulary for the domain heads that materially change a
 * credit-work route. It is deliberately not used to create objects or infer their meaning. Its
 * only authority is negative: a detected head that the model omitted or merged blocks use.
 */
const SEMANTIC_HEAD_PATTERNS: readonly {
  kind: z.infer<typeof intentObjectKindSchema>;
  pattern: RegExp;
}[] = [
  {kind: "operation", pattern: /\b(?:operaç(?:ão|ões)|operac(?:ao|oes)|transaç(?:ão|ões)|transac(?:ao|oes)|captaç(?:ão|ões)|captac(?:ao|oes)|financiamento|refinanciamento|aquisiç(?:ão|ões)|aquisic(?:ao|oes)|expans(?:ão|ões)|expans(?:ao|oes))\b/giu},
  {kind: "material", pattern: /\b(?:memo|memorando|deck|apresentaç(?:ão|ões)|apresentac(?:ao|oes)|pitch|teaser|cim|term[ -]?sheet|planilha|spreadsheet|relat(?:ó|o)rio|report|one[ -]?pager|material|materiais)\b/giu},
  {kind: "instrument", pattern: /\b(?:debênture|debentures?|ccb|cri|cra|fidc|bond|bonds|loan|facility|empréstimo|emprestimo|nota comercial|commercial paper|project finance|acquisition finance)\b/giu},
  {kind: "document", pattern: /\b(?:documento|documentos|arquivo|arquivos|balanço|balanco|balancete|contrato|escritura|waiver)\b/giu},
  {kind: "model", pattern: /\b(?:modelo financeiro|financial model|projeç(?:ão|ões)|projec(?:ao|oes)|forecast|sensibilidade|sensitivity)\b/giu},
  {kind: "asset_or_pool", pattern: /\b(?:recebíveis|recebiveis|carteira|pool|garantia|garantias|colateral|collateral|ativo|ativos)\b/giu},
  {kind: "scenario", pattern: /\b(?:cenário|cenarios?|cenario|scenario|downside|upside|stress case|caso de estresse)\b/giu},
  {kind: "alternative", pattern: /\b(?:alternativa|alternativas|opç(?:ão|ões)|opc(?:ao|oes))\b/giu},
  {kind: "market", pattern: /\b(?:mercado|market|setor|sector|comparáveis|comparaveis|comparables|precedentes|precedents)\b/giu},
  {kind: "provider", pattern: /\b(?:investidor|investidores|financiador|financiadores|lender|lenders|fundo|fundos|banco|bancos|provider|providers)\b/giu},
  {kind: "mandate", pattern: /\b(?:mandato|mandate|política de investimento|politica de investimento|investment policy)\b/giu},
  {kind: "decision", pattern: /\b(?:decisão|decisao|decision|aprovação|aprovacao|approval)\b/giu},
];

const INTRODUCED_ENTITY_PATTERN = /\b(?:a|o|as|os|da|do|das|dos|na|no|nas|nos|com\s+a|com\s+o|sobre\s+a|sobre\s+o|empresa|companhia|banco|gestora|fundo|at|from|for|with|company|bank|fund)\s+([\p{Lu}][\p{L}\p{N}&.-]*(?:\s+(?:(?:d[aeo]s?|e|and|of)\s+)?[\p{Lu}][\p{L}\p{N}&.-]*){0,4})\b/gu;
const ENTITY_HEAD_STOP = new Set([
  "vp", "md", "cfo", "ceo", "dcm", "ib", "ri", "board",
  // Jurisdictions are classifier context, not named semantic objects merely because Portuguese
  // places them after a preposition.
  "brasil", "brazil", "eua", "usa", "us", "estados unidos", "united states", "latam", "america latina", "europa", "europe",
]);

function governedEntityMentions(input: SemanticObjectExtractorInput): SemanticHeadMention[] {
  const text = input.latestUserMessage;
  const matches: SemanticHeadMention[] = [];
  for (const match of text.matchAll(INTRODUCED_ENTITY_PATTERN)) {
    const entity = match[1]!;
    if (ENTITY_HEAD_STOP.has(normalizeSearchText(entity))) continue;
    const start = match.index! + match[0].lastIndexOf(entity);
    matches.push({source: "latest_user_message", messageIndex: null, start, end: start + entity.length, text: entity, expectedKind: null});
  }
  for (const object of input.activeWorkContext?.objects ?? []) {
    const entity = object.slots.find(({key}) => key === "entity")?.value;
    if (!entity) continue;
    let start = text.toLocaleLowerCase(input.locale).indexOf(entity.toLocaleLowerCase(input.locale));
    while (start >= 0) {
      matches.push({source: "latest_user_message", messageIndex: null, start, end: start + entity.length, text: text.slice(start, start + entity.length), expectedKind: object.kind});
      start = text.toLocaleLowerCase(input.locale).indexOf(entity.toLocaleLowerCase(input.locale), start + entity.length);
    }
  }
  return matches;
}

function semanticHeadMentions(input: SemanticObjectExtractorInput): SemanticHeadMention[] {
  const text = input.latestUserMessage;
  const mentions: SemanticHeadMention[] = SEMANTIC_HEAD_PATTERNS.flatMap(({kind, pattern}) =>
    [...text.matchAll(new RegExp(pattern.source, pattern.flags))].map((match) => ({
      source: "latest_user_message" as const,
      messageIndex: null,
      start: match.index!, end: match.index! + match[0].length, text: match[0], expectedKind: kind,
    })),
  );
  mentions.push(...governedEntityMentions(input));
  const ordered = mentions.sort((left, right) => left.start - right.start || right.end - left.end);
  const unique: SemanticHeadMention[] = [];
  for (const mention of ordered) {
    const duplicate = unique.find((existing) => existing.start === mention.start && existing.end === mention.end);
    if (duplicate) {
      if (duplicate.expectedKind === null && mention.expectedKind !== null) duplicate.expectedKind = mention.expectedKind;
      continue;
    }
    // A capitalized proper-name heuristic must not create a second head over a more specific
    // domain phrase (for example, "Project Finance").
    if (mention.expectedKind === null && unique.some((existing) => overlaps(existing, mention))) continue;
    unique.push(mention);
  }
  const sorted = unique.sort((left, right) => left.start - right.start || right.end - left.end);
  const coalesced: SemanticHeadMention[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index]!;
    const next = sorted[index + 1];
    // A proper name that contains a domain class is one referent ("Banco ABC"), even when the
    // independent named-entity pass and the domain vocabulary start at the same byte. Preserve
    // the code-owned domain kind and the widest attributable span.
    if (next && overlaps(current, next)
      && current.start <= next.start && current.end >= next.end
      && current.expectedKind === null && next.expectedKind !== null) {
      coalesced.push({...next, start: current.start, end: current.end, text: text.slice(current.start, current.end)});
      index += 1;
      continue;
    }
    if (next && overlaps(current, next)
      && current.expectedKind !== null && current.expectedKind === next.expectedKind) {
      coalesced.push({
        ...current,
        start: Math.min(current.start, next.start),
        end: Math.max(current.end, next.end),
        text: text.slice(Math.min(current.start, next.start), Math.max(current.end, next.end)),
      });
      index += 1;
      continue;
    }
    // A provider class immediately followed by its proper name is one referent, not two heads:
    // "banco JP Morgan" / "fundo Prisma Capital". This coalescing is deliberately narrow so
    // independent heads such as "Camil ... memo ... operação" remain separate.
    if (current.expectedKind === "provider" && next?.expectedKind === null
      && /^\s+$/u.test(text.slice(current.end, next.start))) {
      coalesced.push({...current, end: next.end, text: text.slice(current.start, next.end)});
      index += 1;
      continue;
    }
    // "precedentes e condições de mercado" names one market comparison set. This narrow
    // coalescer does not join repeated alternatives, instruments or other independently
    // selectable objects merely because they share a kind.
    if (current.expectedKind === "market" && next?.expectedKind === "market"
      && /^\s+(?:e|and)\s+(?:condiç(?:ão|ões)|condic(?:ao|oes)|conditions?)\s+(?:de|do|da|of)\s+$/iu.test(text.slice(current.end, next.start))) {
      coalesced.push({...current, end: next.end, text: text.slice(current.start, next.end)});
      index += 1;
      continue;
    }
    coalesced.push(current);
  }
  return coalesced;
}

const QUANTITY_PATTERN = /(?:\b(?:R\$|US\$|U\$|BRL|USD|EUR)\s*\d[\d.,]*(?:\s*(?:mil|milh(?:ao|oes)|million|billion|mn|bn|k))?|\b\d[\d.,]*\s*(?:%|bps?\b|basis points?\b|x\b|vezes\b|anos?\b|years?\b|mes(?:es)?\b|months?\b|paginas?\b|pages?\b)|\b(?:um|uma|dois|duas|tres|three|quatro|four|cinco|five|seis|six|sete|seven|oito|eight|nove|nine|dez|ten|onze|eleven|doze|twelve)\s+(?:anos?|years?|mes(?:es)?|months?|paginas?|pages?|planilhas?|spreadsheets?|fundos?|funds?)\b)/giu;

function quantityMentions(input: SemanticObjectExtractorInput, usedRecentMessageIndexes: ReadonlySet<number>): QuantityMention[] {
  const sources: Array<{source: QuantityMention["source"]; messageIndex: number | null; text: string}> = [
    {source: "latest_user_message", messageIndex: null, text: input.latestUserMessage},
    ...input.recentConversation.map((message, messageIndex) => ({source: "recent_user_message" as const, messageIndex, text: message.content}))
      .filter(({messageIndex}) => usedRecentMessageIndexes.has(messageIndex) && input.recentConversation[messageIndex]?.role === "user"),
  ];
  return sources.flatMap(({source, messageIndex, text}) => [...text.matchAll(QUANTITY_PATTERN)].map((match) => ({
    source, messageIndex, start: match.index!, end: match.index! + match[0].length, text: match[0],
  })));
}

const overlaps = (left: {source: string; messageIndex: number | null; start: number; end: number}, right: {source: string; messageIndex: number | null; start: number; end: number}): boolean =>
  left.source === right.source && left.messageIndex === right.messageIndex && left.start < right.end && right.start < left.end;

const sourceRank = (input: SemanticObjectExtractorInput, span: SemanticTextSpan): number => span.source === "latest_user_message"
  ? 0
  : 1 + (input.recentConversation.length - 1 - (span.messageIndex ?? 0));

function compareTextCandidates(input: SemanticObjectExtractorInput, left: z.infer<typeof semanticObjectCandidateSchema>, right: z.infer<typeof semanticObjectCandidateSchema>): number {
  const rank = sourceRank(input, left.head.span) - sourceRank(input, right.head.span);
  if (rank !== 0) return rank;
  if (left.head.span.start !== right.head.span.start) return left.head.span.start - right.head.span.start;
  const kind = intentObjectKindSchema.options.indexOf(left.kind) - intentObjectKindSchema.options.indexOf(right.kind);
  return kind !== 0 ? kind : left.candidateId.localeCompare(right.candidateId);
}

function addIssue(issues: z.infer<typeof coverageIssueSchema>[], code: z.infer<typeof coverageIssueSchema>["code"], detail: string, severity: "error" | "warning" = "error"): void {
  issues.push({code, severity, detail: detail.slice(0, 600)});
}

/**
 * Converts attributable candidates into canonical object instances. Any structural, source,
 * normalization or coverage error fails closed: diagnostic objects remain visible, but
 * usableObjects is empty until the complete extraction passes.
 */
export function compileSemanticObjects(
  rawInput: SemanticObjectExtractorInput,
  rawOutput: z.input<typeof semanticObjectExtractorOutputSchema>,
): SemanticObjectCompilation {
  const input = semanticObjectExtractorInputSchema.parse(rawInput);
  const output = semanticObjectExtractorOutputSchema.parse(rawOutput);
  const issues: z.infer<typeof coverageIssueSchema>[] = [];
  let sourceSpansChecked = 0;
  let activeContextReferencesChecked = 0;
  const normalized: Array<Omit<NormalizedSemanticObject, "id" | "ordinal">> = [];
  const modifierSpans: SemanticTextSpan[] = [];
  const acceptedHeads: Array<{span: SemanticTextSpan; kind: z.infer<typeof intentObjectKindSchema>}> = [];
  const usedRecentMessageIndexes = new Set<number>();

  for (const candidate of [...output.objects].sort((left, right) => compareTextCandidates(input, left, right))) {
    const spans = [candidate.head.span, ...candidate.modifiers.map(({span}) => span)];
    for (const span of spans) if (span.source === "recent_user_message" && span.messageIndex !== null) usedRecentMessageIndexes.add(span.messageIndex);
    let candidateValid = true;
    for (const span of spans) {
      sourceSpansChecked += 1;
      const validity = validateSpan(input, span);
      if (validity === "assistant") {
        addIssue(issues, "assistant_text_is_not_evidence", `${candidate.candidateId} cites assistant message ${span.messageIndex}`);
        candidateValid = false;
      } else if (validity === "invalid") {
        addIssue(issues, "invalid_source_span", `${candidate.candidateId} has a span that does not reproduce its source: ${span.text}`);
        candidateValid = false;
      } else if (span.source !== "latest_user_message") {
        addIssue(issues, "historical_text_is_not_governed_context", `${candidate.candidateId} attempts to promote historical user text: ${span.text}`);
        candidateValid = false;
      }
    }
    const slotCandidates = [{key: candidate.head.key as IntentObjectSlotKey, span: candidate.head.span}, ...candidate.modifiers];
    const slots: Array<{key: IntentObjectSlotKey; value: string}> = [];
    for (const slot of slotCandidates) {
      if (!SLOT_COMPATIBILITY[candidate.kind].has(slot.key)) {
        addIssue(issues, "invalid_slot_for_kind", `${slot.key} is not valid for ${candidate.kind}`);
        candidateValid = false;
        continue;
      }
      const value = normalizeSlotValue(slot.key, slot.span.text);
      if (value === null) {
        addIssue(issues, "normalization_failed", `${slot.key} could not be normalized from: ${slot.span.text}`);
        candidateValid = false;
        continue;
      }
      slots.push({key: slot.key, value});
      if (slot.key !== "entity" && slot.key !== "subject") modifierSpans.push(slot.span);
    }
    if (candidateValid) {
      acceptedHeads.push({span: candidate.head.span, kind: candidate.kind});
      normalized.push({
        kind: candidate.kind,
        slots: slots.sort((left, right) => intentObjectSlotKeySchema.options.indexOf(left.key) - intentObjectSlotKeySchema.options.indexOf(right.key)),
        source: {type: "text", spans},
      });
    }
  }

  const context = input.activeWorkContext;
  const contextOrdinal = new Map(context?.objects.map((object) => [object.id, object.ordinal]) ?? []);
  const contextReferences = [...output.activeContextReferences].sort((left, right) =>
    (contextOrdinal.get(left.contextObjectId) ?? Number.MAX_SAFE_INTEGER) - (contextOrdinal.get(right.contextObjectId) ?? Number.MAX_SAFE_INTEGER)
      || left.contextObjectId.localeCompare(right.contextObjectId));
  for (const reference of contextReferences) {
    activeContextReferencesChecked += 1;
    sourceSpansChecked += 1;
    const validity = validateSpan(input, reference.trigger);
    if (validity === "assistant") addIssue(issues, "assistant_text_is_not_evidence", `context trigger cites assistant message ${reference.trigger.messageIndex}`);
    else if (validity === "invalid") addIssue(issues, "invalid_source_span", `context trigger does not reproduce its source: ${reference.trigger.text}`);
    else if (reference.trigger.source !== "latest_user_message") addIssue(issues, "historical_text_is_not_governed_context", `context trigger must be in the current turn: ${reference.trigger.text}`);
    if (!context) {
      addIssue(issues, "unknown_context_object", `no active work context contains ${reference.contextObjectId}`);
      continue;
    }
    if (context.state !== "active") {
      addIssue(issues, "context_not_active", `context ${context.contextId} is ${context.state}`);
      continue;
    }
    const object = context.objects.find(({id}) => id === reference.contextObjectId);
    if (!object) {
      addIssue(issues, "unknown_context_object", `${reference.contextObjectId} is not in governed context ${context.contextId}`);
      continue;
    }
    if (validity !== "valid" || reference.trigger.source !== "latest_user_message") continue;
    normalized.push({
      kind: object.kind,
      slots: [...object.slots].sort((left, right) => intentObjectSlotKeySchema.options.indexOf(left.key) - intentObjectSlotKeySchema.options.indexOf(right.key)),
      source: {type: "active_work_context", contextId: context.contextId, contextRevision: context.revision, contextObjectId: object.id, trigger: reference.trigger},
    });
  }

  for (const unresolved of output.unresolvedReferences) {
    sourceSpansChecked += 1;
    const validity = validateSpan(input, unresolved.span);
    if (validity === "assistant") addIssue(issues, "assistant_text_is_not_evidence", `unresolved reference cites assistant message ${unresolved.span.messageIndex}`);
    else if (validity === "invalid") addIssue(issues, "invalid_source_span", `unresolved reference span does not reproduce its source: ${unresolved.span.text}`);
    else if (unresolved.span.source !== "latest_user_message") addIssue(issues, "historical_text_is_not_governed_context", `unresolved reference must be attributable to the current turn: ${unresolved.span.text}`);
    addIssue(issues, "unresolved_reference", `${unresolved.reason}: ${unresolved.span.text}`);
  }

  const excluded = output.excludedQuantitativeSpans.filter((entry) => {
    const {span} = entry;
    sourceSpansChecked += 1;
    const validity = validateSpan(input, span);
    if (validity === "valid" && span.source === "latest_user_message" && exclusionIsSupported(input, entry)) return true;
    if (validity === "valid") {
      addIssue(issues, span.source === "latest_user_message" ? "invalid_exclusion_reason" : "historical_text_is_not_governed_context", `${entry.reason} is not supported by its source context: ${span.text}`);
      return false;
    }
    addIssue(issues, validity === "assistant" ? "assistant_text_is_not_evidence" : "invalid_source_span", `excluded span is not valid user evidence: ${span.text}`);
    return false;
  });

  const semanticExclusions = output.excludedSemanticHeadSpans.filter((entry) => {
    sourceSpansChecked += 1;
    const validity = validateSpan(input, entry.span);
    if (validity === "valid" && entry.span.source === "latest_user_message" && exclusionIsSupported(input, entry)) return true;
    if (validity === "valid") {
      addIssue(issues, entry.span.source === "latest_user_message" ? "invalid_exclusion_reason" : "historical_text_is_not_governed_context", `${entry.reason} is not supported by its source context: ${entry.span.text}`);
      return false;
    }
    addIssue(issues, validity === "assistant" ? "assistant_text_is_not_evidence" : "invalid_source_span", `excluded semantic head is not valid user evidence: ${entry.span.text}`);
    return false;
  });

  const quantities = quantityMentions(input, usedRecentMessageIndexes);
  let quantitativeMentionsCovered = 0;
  for (const quantity of quantities) {
    const covered = modifierSpans.some((span) => overlaps(quantity, span))
      || excluded.some(({span}) => overlaps(quantity, span));
    if (covered) quantitativeMentionsCovered += 1;
    else addIssue(issues, "uncovered_quantitative_mention", `${quantity.text} at ${quantity.source}:${quantity.messageIndex ?? "latest"}:${quantity.start}`);
  }

  const heads = semanticHeadMentions(input);
  let semanticHeadMentionsCovered = 0;
  for (const head of heads) {
    const claimingHeads = acceptedHeads.filter(({span}) => overlaps(head, span));
    const explicitlyAccounted = output.unresolvedReferences.some(({span}) => span.source === "latest_user_message" && overlaps(head, span))
      || semanticExclusions.some(({span}) => overlaps(head, span));
    if (claimingHeads.length === 1 || explicitlyAccounted) semanticHeadMentionsCovered += 1;
    if (claimingHeads.length === 0 && !explicitlyAccounted) {
      addIssue(issues, "uncovered_semantic_head", `${head.expectedKind ?? "named_entity"}:${head.text} at latest:${head.start}`);
    } else if (claimingHeads.length > 1) {
      addIssue(issues, "semantic_head_multiply_claimed", `${head.text} is claimed by ${claimingHeads.length} object heads`);
    }
  }
  for (const {span: candidateHead} of acceptedHeads) {
    const claimed = heads.filter((head) => overlaps(head, candidateHead));
    if (claimed.length > 1) {
      addIssue(issues, "merged_semantic_heads", `${candidateHead.text} merges independently detected heads: ${claimed.map(({text}) => text).join(" | ")}`);
    }
  }

  const seenAtomicObjects = new Set<string>();
  for (const object of normalized) {
    const identity = fingerprintJson({kind: object.kind, slots: object.slots, source: object.source});
    if (seenAtomicObjects.has(identity)) addIssue(issues, "duplicate_atomic_object", `${object.kind} is duplicated with the same source and slots`);
    seenAtomicObjects.add(identity);
  }
  if (normalized.length > intentObjectCardinalityLimit) {
    addIssue(issues, "object_cardinality_exceeded", `${normalized.length} objects exceed the per-turn limit of ${intentObjectCardinalityLimit}`);
  }
  if (normalized.length === 0) addIssue(issues, "no_semantic_object", "the extraction did not establish any attributable semantic object");

  const objects = normalized.map((object, index) => normalizedSemanticObjectSchema.parse({
    ...object, id: `object-${index + 1}`, ordinal: index + 1,
  }));
  const hasStructuralError = issues.some(({code, severity}) => severity === "error"
    && code !== "unresolved_reference" && code !== "uncovered_quantitative_mention"
    && code !== "uncovered_semantic_head" && code !== "object_cardinality_exceeded"
    && code !== "no_semantic_object");
  const status = hasStructuralError ? "rejected" as const : issues.some(({severity}) => severity === "error") ? "incomplete" as const : "complete" as const;
  const body = {
    schemaVersion: "semantic-object-compilation.v1" as const,
    status,
    objects,
    usableObjects: status === "complete" ? objects : [],
    coverage: {
      sourceSpansChecked,
      quantitativeMentions: quantities.length,
      quantitativeMentionsCovered,
      semanticHeadMentions: heads.length,
      semanticHeadMentionsCovered,
      activeContextReferencesChecked,
      issues,
    },
  };
  return semanticObjectCompilationSchema.parse({...body, fingerprint: fingerprintJson(body)});
}

/**
 * Content-free acceptance result for a model gateway. JSON shape is only the first boundary: an
 * extractor attempt is successful only when deterministic source, normalization and coverage
 * compilation is complete. Stable codes let the gateway repair/fallback without echoing customer
 * text into prompts or telemetry.
 */
export function validateSemanticObjectOutput(
  input: SemanticObjectExtractorInput,
  output: SemanticObjectExtractorOutput,
): {accepted: true} | {accepted: false; issues: Array<{path: string; code: string; message: string}>} {
  const compilation = compileSemanticObjects(input, output);
  if (compilation.status === "complete") return {accepted: true};
  // An extractor may legitimately establish that the current turn has no attributable object
  // or that its reference cannot be resolved from governed work memory. That is a successful,
  // fail-closed abstention, not malformed provider output and therefore must not consume a repair
  // or provider fallback. Coverage omissions, invalid spans, cardinality breaches and every
  // structural rejection remain validation failures.
  const honestAbstentionCodes = new Set(["unresolved_reference", "no_semantic_object"]);
  if (compilation.status === "incomplete"
    && compilation.coverage.issues.length > 0
    && compilation.coverage.issues.every(({code}) => honestAbstentionCodes.has(code))) {
    return {accepted: true};
  }
  const issues = compilation.coverage.issues.slice(0, 12).map((issue, index) => ({
    path: `coverage.issues.${index}`,
    code: issue.code,
    message: `Deterministic semantic-object validation failed: ${issue.code}.`,
  }));
  return {
    accepted: false,
    issues: issues.length > 0 ? issues : [{
      path: "coverage",
      code: "semantic_object_coverage_incomplete",
      message: "Deterministic semantic-object coverage is incomplete.",
    }],
  };
}

/**
 * Pure orchestration seam for the gateway/worker. The classifier remains responsible for intent;
 * this function replaces only its object field after independent semantic compilation. An
 * incomplete or rejected extraction clears asserted object meaning so canonicalization abstains
 * rather than falling back to the classifier's bundled object guess.
 */
export function applySemanticObjectCompilation(
  rawIntent: IntentClassifierOutput,
  rawCompilation: SemanticObjectCompilation,
): IntentClassifierOutput {
  const intent = intentClassifierOutputSchema.parse(rawIntent);
  const compilation = semanticObjectCompilationSchema.parse(rawCompilation);
  if (compilation.status !== "complete" || compilation.usableObjects.length === 0) {
    return intentClassifierOutputSchema.parse({
      ...intent,
      routingCore: {
        ...intent.routingCore,
        object: {
          value: [], state: "unknown", confidence: null,
          basis: `semantic object compilation ${compilation.status}:${compilation.fingerprint.slice(0, 16)}`,
        },
      },
      abstain: true,
      abstainReason: "semantic_object_coverage_incomplete",
    });
  }
  return intentClassifierOutputSchema.parse({
    ...intent,
    routingCore: {
      ...intent.routingCore,
      object: {
        value: compilation.usableObjects.map(({id, ordinal, kind, slots}) => ({id, ordinal, kind, slots})),
        ...(compilation.usableObjects.every(({source}) => source.type === "text")
          ? {
              state: "explicit" as const,
              confidence: null,
              basis: `attributable current-turn semantic object compilation:${compilation.fingerprint.slice(0, 16)}`,
            }
          : {
              state: "inferred" as const,
              // A verified span proves attribution, not that a pronoun-to-context match is certain.
              // Preserve the router's calibrated uncertainty and cap it below certainty.
              confidence: Math.min(intent.routingCore.object.confidence ?? 0.5, 0.95),
              basis: `governed context reference semantic object compilation:${compilation.fingerprint.slice(0, 16)}`,
            }),
      },
    },
  });
}
