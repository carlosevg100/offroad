import {createHash} from "node:crypto";
import {z} from "zod";
import {financialCoreVersion} from "@offroad/financial-core";
import {boardCapitalDiscussionAnalysesSchema, calculateAdoptedBoardCapitalDiscussion} from "./adopted-board-capital-discussion";
import {adoptedBoardCapitalDiscussionOutputSchema} from "./board-capital-discussion-results";

export const boardCapitalDiscussionPacketVersion = "2026.10.27-v1";
const text = z.string().trim().min(1).max(4000), key = z.string().trim().min(1).max(160), hash = z.string().regex(/^[a-f0-9]{64}$/);

/** One request to prepare a board discussion of a capital decision, over the reviewed results the work already holds. */
export const boardCapitalDiscussionPacketInputSchema = z.strictObject({
  schemaVersion: z.literal("board-capital-discussion-packet-input.v1"),
  question: text,
  analysis: boardCapitalDiscussionAnalysesSchema,
});
export type BoardCapitalDiscussionPacketInput = z.infer<typeof boardCapitalDiscussionPacketInputSchema>;
const packetExclusions = ["recalculation", "presentation_delivery", "template_import", "third_party_distribution", "credit_approval"] as const;

export const boardCapitalDiscussionPacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("board-capital-discussion-packet.v1"), executorVersion: z.literal(boardCapitalDiscussionPacketVersion), financialCoreVersion: key,
  question: text, basisFingerprint: hash, scope: boardCapitalDiscussionAnalysesSchema.shape.discussion.shape.scope, entityId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/),
  result: adoptedBoardCapitalDiscussionOutputSchema,
  /** What the answer says, in order: before the material, the outline and the questions that change it;
   * with the material, what was checked, what is pending and, after an omission request, what stays. */
  readings: z.strictObject({
    stage: z.enum(["outline_proposed", "material_prepared"]),
    /** Material withheld because there is time to align the outline first. */
    materialWithheld: z.boolean(),
    deliberations: z.array(z.strictObject({id: key, number: z.number().int(), title: text, text, deadlines: z.array(z.iso.date()).max(4)})).min(1).max(12),
    questionsBeforeMaterial: z.array(z.strictObject({code: key, topicId: key.nullable()})).max(16),
    material: z.strictObject({version: z.number().int(), fingerprint: hash, mainPages: z.number().int(), appendixPages: z.number().int(),
      titles: z.array(z.strictObject({pageId: key, number: z.number().int(), placement: z.enum(["main", "appendix"]), title: text})).max(40),
      fitsAgenda: z.boolean().nullable(), questions: z.number().int(), figuresChecked: z.number().int(), allFiguresMatch: z.literal(true),
      /** Every material fact of the rule (economic readings, marked figures, deadlines) is shown by this version. */
      materialFacts: z.number().int(), materialFactsShown: z.literal(true),
      priorVersionFingerprint: hash.nullable()}).nullable(),
    pending: z.strictObject({indicative: z.array(key).max(24), sources: z.array(key).max(16), authority: z.array(key).max(12), template: z.enum(["not_supplied", "supplied_not_applied"])}),
    omissions: z.array(z.strictObject({id: key, outcome: z.enum(["applied", "refused"]), reason: text, keptFigureIds: z.array(key).max(160)})).max(12),
    priorVersionsKept: z.literal(true), sentToThirdParties: z.literal(false), presented: z.literal(false),
  }).nullable(),
  gaps: z.array(z.strictObject({operand: text, reason: text})).max(1024),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  exclusions: z.array(z.enum(packetExclusions)).length(5).refine((v) => v.join("|") === packetExclusions.join("|"), "Exact exclusion ledger required"),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
export type BoardCapitalDiscussionPacket = z.infer<typeof boardCapitalDiscussionPacketOutputSchema>;

/** Prepares the board discussion of a capital decision from reviewed results, without recalculating them:
 * the deliberations with deadline and authority in urgency order; the outline before any material when there
 * is time to align it, asking only what changes the material; then the pages, each title a conclusion with the
 * number behind it, every number read from a reviewed result by method, version and path and checked against
 * the stated one; the summary for prior reading, the appendix, the likely questions with answers and numbers,
 * the declared pending items, the order conditioned on what the board has seen, and the omission rule: a
 * recommendation may be withdrawn, a material fact is kept, and each version is kept. Deterministic; it never
 * presents, applies an imported template or sends anything to a third party. */
export function prepareBoardCapitalDiscussionPacket(raw: unknown): BoardCapitalDiscussionPacket {
  const input = boardCapitalDiscussionPacketInputSchema.parse(raw);
  const result = adoptedBoardCapitalDiscussionOutputSchema.parse(calculateAdoptedBoardCapitalDiscussion(input.analysis));
  const d = result.discussion;
  const current = d?.versions.at(-1) ?? null;
  const readings = d ? {
    stage: d.stage === "material" ? "material_prepared" as const : "outline_proposed" as const,
    materialWithheld: d.stage === "outline",
    deliberations: (current?.deliberations ?? d.outline.deliberations).map((x) => ({id: x.id, number: x.number, title: x.title, text: x.text, deadlines: x.deadlines.map((t) => t.date)})),
    questionsBeforeMaterial: d.stage === "outline" ? d.outline.questions.map((q) => ({code: q.code, topicId: q.topicId})) : [],
    material: current ? {version: current.version, fingerprint: current.fingerprint, mainPages: current.agenda.mainPages, appendixPages: current.pages.length - current.agenda.mainPages,
      titles: current.pages.map((p) => ({pageId: p.id, number: p.number, placement: p.placement, title: p.title})), fitsAgenda: current.agenda.fits,
      questions: current.questions.length, figuresChecked: d.identity.length, allFiguresMatch: true as const,
      materialFacts: d.materialFacts.figures.length + d.materialFacts.deadlines.length, materialFactsShown: true as const,
      priorVersionFingerprint: d.versions.length > 1 ? d.versions[0]!.fingerprint : null} : null,
    pending: {indicative: d.pending.indicative.map((x) => x.figureId), sources: d.pending.sources.map((s) => s.sourceId), authority: d.pending.authority, template: d.pending.template},
    omissions: d.omissions.map((o) => ({id: o.id, outcome: o.outcome, reason: o.reason, keptFigureIds: o.keptFigureIds})),
    priorVersionsKept: true as const, sentToThirdParties: false as const, presented: false as const,
  } : null;
  const gaps = [...result.gaps, ...(d?.gaps ?? []).map((g) => ({operand: `board_capital.${result.analysisId}.${g.item}`, reason: g.reason}))];
  const status = !d || d.stage === "outline" ? "framed" as const : gaps.length ? "partial" as const : "prepared_for_human_review" as const;
  const payload = {schemaVersion: "board-capital-discussion-packet.v1" as const, executorVersion: boardCapitalDiscussionPacketVersion, financialCoreVersion,
    question: input.question, basisFingerprint: result.basisFingerprint, scope: result.scope, entityId: result.entityId, currency: result.currency,
    result, readings, gaps, status, exclusions: packetExclusions, grantsExecution: false as const, grantsPublication: false as const};
  return boardCapitalDiscussionPacketOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
