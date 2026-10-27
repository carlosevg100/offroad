import {z} from "zod";
import {adoptedWeeklyCashOutputSchema} from "./ficha-calculation-results";
import {boardAuthorities, boardFigureUnits, boardOmissionTargets, boardPageRoles} from "./board-capital-discussion";

// The common adopted-result fields, taken from an existing adopted result so the shapes never drift.
const {schemaVersion: _s, analysisId: _a, perimeter: _p, weekly: _w, exclusions: _e, ...common} = adoptedWeeklyCashOutputSchema.shape;
const text = z.string().min(1).max(4000), key = z.string().min(1).max(160), hash = z.string().regex(/^[a-f0-9]{64}$/), date = z.iso.date();
const decimal = z.string().regex(/^-?\d{1,30}(?:\.\d{1,60})?$/);
const ids = z.array(key).max(160);

const deliberation = z.strictObject({id: key, number: z.number().int().min(1).max(12), title: text, text, recommendationShown: z.boolean(),
  authority: z.enum(boardAuthorities), authorityBasis: text.nullable(),
  deadlines: z.array(z.strictObject({id: key, date, display: key, action: text})).max(4), figureIds: ids, pendingFigureIds: ids});
const page = z.strictObject({id: key, number: z.number().int().min(1).max(40), placement: z.enum(["main", "appendix"]), role: z.enum(boardPageRoles), topicId: key.nullable(),
  title: text, lines: z.array(text).max(16), recommendation: text.nullable(), options: z.array(text).max(8), figureIds: ids, pendingFigureIds: ids, deadlineIds: ids});
export const boardMaterialSchema = z.strictObject({version: z.number().int().min(1).max(2), deliberations: z.array(deliberation).min(1).max(12), pages: z.array(page).min(1).max(40),
  summary: text, summaryFigureIds: ids, appendix: z.array(z.strictObject({id: key, label: text, sourceIds: z.array(key).min(1).max(16), figureIds: ids})).max(16),
  questions: z.array(z.strictObject({id: key, question: text, answer: text, figureIds: ids, pendingFigureIds: ids})).max(24),
  /** Numbers of the final text verified against their markers (render, then verify). */
  verifiedNumbers: z.number().int().min(0),
  /** Which slot of which library template each displayed field binds to which reading or deadline (concept checked). */
  bindings: z.array(z.strictObject({field: text, templateId: key, slot: key, figureId: key.nullable(), deadlineId: key.nullable()})).max(1200),
  agenda: z.strictObject({minutes: z.number().int().nullable(), minutesPerPage: z.number().int(), mainPages: z.number().int(), capacity: z.number().int().nullable(), fits: z.boolean().nullable()}),
  fingerprint: hash});
export type BoardMaterial = z.infer<typeof boardMaterialSchema>;

export const boardCapitalDiscussionOutputSchema = z.strictObject({
  version: z.literal("2026.10.27-v1"), stage: z.enum(["outline", "material"]), timeToAlign: z.boolean(), daysBefore: z.number().int().min(0),
  outline: z.strictObject({
    deliberations: z.array(z.strictObject({id: key, number: z.number().int(), title: text, text, authority: z.enum(boardAuthorities),
      deadlines: z.array(z.strictObject({id: key, date, action: text})).max(4)})).min(1).max(12),
    narrative: z.array(z.enum(boardPageRoles)).max(9),
    questions: z.array(z.strictObject({code: z.enum(["template", "agenda_minutes", "board_has_seen"]), topicId: key.nullable(), label: text.nullable()})).max(16)}),
  /** Identity check: every number on the material against the reviewed result it is read from. */
  identity: z.array(z.strictObject({figureId: key, sourceId: key, methodId: key, methodVersion: key, packetFingerprint: hash, path: text, unit: z.enum(boardFigureUnits),
    scale: z.enum(["reais", "millions", "ratio", "native"]), period: z.enum(["annual", "none"]), presentation: key, value: text, rounded: text, stated: text.nullable(), display: text, matches: z.literal(true)})).max(160),
  omissions: z.array(z.strictObject({id: key, target: z.enum(boardOmissionTargets), targetId: key, requestedBy: text, outcome: z.enum(["applied", "refused"]), reason: text, keptFigureIds: ids})).max(12),
  /** The first version as composed and, after an omission request, the second: the earlier version is kept. */
  versions: z.array(boardMaterialSchema).max(2),
  gaps: z.array(z.strictObject({item: text, reason: z.enum(["figure_pending_reviewed_result", "layout_exceeds_page", "pages_exceed_agenda", "recommendation_removed_without_options", "label_not_in_dictionary"])})).max(256),
  pending: z.strictObject({indicative: z.array(z.strictObject({figureId: key, reason: text})).max(24),
    sources: z.array(z.strictObject({sourceId: key, methodId: key, status: key, reasons: z.array(text).max(64)})).max(16),
    authority: ids, template: z.enum(["not_supplied", "supplied_not_applied"])}),
  /** The material facts by rule: every economic reading, every figure marked material and every deadline; each version shows all of them. */
  materialFacts: z.strictObject({figures: ids, deadlines: ids}),
  priorVersionsKept: z.literal(true), sentToThirdParties: z.literal(false), presented: z.literal(false),
});

export const boardCapitalDiscussionExclusions = ["recalculation", "presentation_delivery", "template_import", "third_party_distribution", "credit_approval", "method_release"] as const;
const sourceReference = z.strictObject({id: key, methodId: key, methodVersion: key, executorVersion: key.nullable(), packetSchemaVersion: key, packetFingerprint: hash, status: key});
export const adoptedBoardCapitalDiscussionOutputSchema = z.strictObject({...common, schemaVersion: z.literal("adopted-board-capital-discussion.v1"),
  analysisId: z.uuid(), perimeter: text, sources: z.array(sourceReference).max(16), discussion: boardCapitalDiscussionOutputSchema.nullable(),
  exclusions: z.array(z.enum(boardCapitalDiscussionExclusions)).length(6)
    .refine((v) => v.join("|") === boardCapitalDiscussionExclusions.join("|"), "Exact exclusion ledger required")});
export type AdoptedBoardCapitalDiscussionOutput = z.infer<typeof adoptedBoardCapitalDiscussionOutputSchema>;
