import {z} from "zod";
import {artifactBlockDraftSchema, freezeArtifactValue, type ArtifactBlockDraft} from "./artifact-protocol";

/**
 * Result blocks of the board discussion of capital (ficha C47, prepare-board-capital-discussion 2026.10.27-v1). Each
 * block copies a part of the packet as it is, so the SQL mapping `private.execution_result_board_material_blocks_v1`
 * mirrors it key for key; nothing is recomputed. The material shown is the latest version; an earlier version is
 * listed by its fingerprint. Readers return null on any unknown, missing or inconsistent block.
 */
type Json = null | boolean | number | string | readonly Json[] | {readonly [k: string]: Json};
type Gap = {readonly operand: string; readonly reason: string};
type Claim = {claimId: string; kind: "calculation"; value: string; unit: string | null; period: string | null; supportIds: string[]};
type Block = {blockKey: string; kind: "section" | "table"; content: Record<string, Json>; claims: Claim[]};
type BlockLike = {readonly blockKey: string; readonly kind: string; readonly content: unknown; readonly claims: unknown};

type Deadline = {readonly id: string; readonly date: string; readonly action: string};
type Deliberation = {readonly id: string; readonly number: number; readonly title: string; readonly text: string; readonly authority: string; readonly recommendationShown?: boolean;
  readonly deadlines: readonly Deadline[]};
type Page = {readonly id: string; readonly number: number; readonly placement: string; readonly role: string; readonly title: string; readonly lines: readonly string[];
  readonly recommendation: string | null; readonly options: readonly string[]; readonly pendingFigureIds: readonly string[]};
type Version = {readonly version: number; readonly fingerprint: string; readonly deliberations: readonly Deliberation[]; readonly pages: readonly Page[]; readonly summary: string;
  readonly appendix: readonly {readonly id: string; readonly label: string; readonly sourceIds: readonly string[]}[];
  readonly questions: readonly {readonly id: string; readonly question: string; readonly answer: string}[];
  readonly agenda: {readonly minutes: number | null; readonly minutesPerPage: number; readonly mainPages: number; readonly capacity: number | null; readonly fits: boolean | null}};
type Identity = {readonly figureId: string; readonly sourceId: string; readonly methodId: string; readonly methodVersion: string; readonly packetFingerprint: string; readonly path: string;
  readonly unit: string; readonly value: string; readonly rounded: string; readonly display: string; readonly matches: boolean};

/** The board discussion packet as the result protocol reads it. */
export type BoardMaterialPacketLike = {
  readonly schemaVersion: "board-capital-discussion-packet.v1"; readonly status: "framed" | "partial" | "prepared_for_human_review"; readonly question: string; readonly currency: string;
  readonly fingerprint: string;
  readonly result: {readonly sources: readonly {readonly id: string; readonly methodId: string; readonly methodVersion: string; readonly packetFingerprint: string; readonly status: string}[];
    readonly discussion: null | {
      readonly stage: "outline" | "material"; readonly timeToAlign: boolean; readonly daysBefore: number;
      readonly outline: {readonly deliberations: readonly Deliberation[]; readonly narrative: readonly string[]; readonly questions: readonly {readonly code: string; readonly topicId: string | null; readonly label: string | null}[]};
      readonly identity: readonly Identity[];
      readonly omissions: readonly {readonly id: string; readonly target: string; readonly targetId: string; readonly requestedBy: string; readonly outcome: string; readonly reason: string; readonly keptFigureIds: readonly string[]}[];
      readonly versions: readonly Version[];
      readonly pending: {readonly indicative: readonly {readonly figureId: string; readonly reason: string}[];
        readonly sources: readonly {readonly sourceId: string; readonly methodId: string; readonly status: string; readonly reasons: readonly string[]}[];
        readonly authority: readonly string[]; readonly template: string};
      readonly pendingFigures: readonly {readonly figureId: string; readonly methodId: string; readonly path: string; readonly reason: string}[];
      readonly priorVersionsKept: boolean; readonly sentToThirdParties: boolean; readonly presented: boolean;
    }};
  readonly readings: null | {readonly material: null | {readonly allFiguresMatch: boolean; readonly materialFacts: number; readonly materialFactsShown: boolean; readonly verifiedNumbers: number}};
  readonly gaps: readonly Gap[]; readonly exclusions: readonly string[];
};

const num = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const claim = z.strictObject({claimId: z.string(), kind: z.literal("calculation"), value: num, unit: z.string().nullable(), period: z.string().nullable(), supportIds: z.array(z.string())});
const noClaims = z.array(z.never()).length(0);
const rows = <T extends z.ZodType>(row: T) => z.strictObject({rows: z.array(row)});
/** The economic units: an identity row of one of these is a number of the material, carried as a claim. */
const economic = new Set(["money", "rate", "multiple", "years", "months", "bps", "count"]);

function finish(drafts: Block[]): readonly ArtifactBlockDraft[] {
  const blocks = drafts.map((draft) => artifactBlockDraftSchema.parse(draft));
  if (new Set(blocks.map((b) => b.blockKey)).size !== blocks.length) throw new Error("duplicate_block_key");
  const claims = blocks.flatMap((b) => b.claims.map((c) => c.claimId));
  if (new Set(claims).size !== claims.length) throw new Error("duplicate_claim_id");
  return freezeArtifactValue(blocks);
}
const copy = <T>(value: T): Json => value === undefined ? null : JSON.parse(JSON.stringify(value)) as Json;
const claimed = (rows: readonly Identity[]) => rows.filter((r) => economic.has(r.unit) && /^-?\d+(?:\.\d+)?$/.test(r.value));

export function boardMaterialPacketBlocks(packet: BoardMaterialPacketLike): readonly ArtifactBlockDraft[] {
  if (packet.schemaVersion !== "board-capital-discussion-packet.v1") throw new Error("execution_result_unmappable");
  const d = packet.result.discussion, current = d?.versions.at(-1) ?? null, m = packet.readings?.material ?? null;
  const identity = d?.identity ?? [];
  if (identity.some((r) => r.figureId.length > 140)) throw new Error("execution_result_unmappable");
  const deliberations = (current?.deliberations ?? d?.outline.deliberations ?? []).map((x) => ({id: x.id, number: x.number, title: x.title, text: x.text, authority: x.authority,
    recommendationShown: x.recommendationShown ?? null, deadlines: x.deadlines.map((t) => ({id: t.id, date: t.date, action: t.action}))}));
  return finish([
    {blockKey: "framing", kind: "section", claims: [], content: {status: packet.status, question: packet.question, currency: packet.currency,
      stage: d?.stage ?? null, timeToAlign: d?.timeToAlign ?? null, daysBefore: d?.daysBefore ?? null,
      version: current?.version ?? null, materialFingerprint: current?.fingerprint ?? null, priorVersionFingerprint: d && d.versions.length > 1 ? d.versions[0]!.fingerprint : null,
      agenda: copy(current?.agenda ?? null), allFiguresMatch: m?.allFiguresMatch ?? null, materialFacts: m?.materialFacts ?? null, materialFactsShown: m?.materialFactsShown ?? null,
      verifiedNumbers: m?.verifiedNumbers ?? null, priorVersionsKept: d?.priorVersionsKept ?? null, sentToThirdParties: d?.sentToThirdParties ?? null, presented: d?.presented ?? null}},
    {blockKey: "deliberations", kind: "table", claims: [], content: {rows: copy(deliberations)}},
    {blockKey: "outline", kind: "section", claims: [], content: {narrative: copy(d?.outline.narrative ?? []), questions: copy(d?.outline.questions ?? [])}},
    {blockKey: "pages", kind: "table", claims: [], content: {rows: (current?.pages ?? []).map((p) => ({id: p.id, number: p.number, placement: p.placement, role: p.role, title: p.title,
      lines: copy(p.lines), recommendation: p.recommendation, options: copy(p.options), pendingFigureIds: copy(p.pendingFigureIds)}))}},
    {blockKey: "summary", kind: "section", claims: [], content: {text: current?.summary ?? null}},
    {blockKey: "questions", kind: "table", claims: [], content: {rows: (current?.questions ?? []).map((q) => ({id: q.id, question: q.question, answer: q.answer}))}},
    {blockKey: "appendix", kind: "table", claims: [], content: {rows: (current?.appendix ?? []).map((a) => ({id: a.id, label: a.label, sourceIds: copy(a.sourceIds)}))}},
    {blockKey: "identity", kind: "table", content: {rows: identity.map((r) => ({figureId: r.figureId, sourceId: r.sourceId, methodId: r.methodId, methodVersion: r.methodVersion,
      packetFingerprint: r.packetFingerprint, path: r.path, unit: r.unit, value: r.value, rounded: r.rounded, display: r.display, matches: r.matches}))},
      claims: claimed(identity).map((r) => ({claimId: `figure:${r.figureId}`, kind: "calculation", value: r.value, unit: r.unit === "money" ? packet.currency : r.unit, period: null, supportIds: [r.packetFingerprint]}))},
    {blockKey: "pending", kind: "section", claims: [], content: {indicative: copy(d?.pending.indicative ?? []), sources: copy(d?.pending.sources ?? []), authority: copy(d?.pending.authority ?? []),
      template: d?.pending.template ?? null, figures: copy(d?.pendingFigures ?? [])}},
    {blockKey: "omissions", kind: "table", claims: [], content: {rows: copy(d?.omissions ?? [])}},
    {blockKey: "versions", kind: "table", claims: [], content: {rows: (d?.versions ?? []).map((v) => ({version: v.version, fingerprint: v.fingerprint, mainPages: v.agenda.mainPages}))}},
    {blockKey: "sources", kind: "table", claims: [], content: {rows: packet.result.sources.map((s) => ({id: s.id, methodId: s.methodId, methodVersion: s.methodVersion, packetFingerprint: s.packetFingerprint, status: s.status}))}},
    {blockKey: "information-gaps", kind: "table", claims: [], content: {rows: packet.gaps.map((g) => ({operand: g.operand, reason: g.reason}))}},
    {blockKey: "exclusions", kind: "section", claims: [], content: {items: [...packet.exclusions]}},
  ]);
}

const deadline = z.strictObject({id: z.string(), date: z.iso.date(), action: z.string()});
const spec = {
  framing: {kind: "section" as const, claims: noClaims, content: z.strictObject({status: z.enum(["framed", "partial", "prepared_for_human_review"]), question: z.string(), currency: z.string(),
    stage: z.enum(["outline", "material"]).nullable(), timeToAlign: z.boolean().nullable(), daysBefore: z.number().int().nullable(), version: z.number().int().nullable(),
    materialFingerprint: hash.nullable(), priorVersionFingerprint: hash.nullable(),
    agenda: z.strictObject({minutes: z.number().int().nullable(), minutesPerPage: z.number().int(), mainPages: z.number().int(), capacity: z.number().int().nullable(), fits: z.boolean().nullable()}).nullable(),
    allFiguresMatch: z.boolean().nullable(), materialFacts: z.number().int().nullable(), materialFactsShown: z.boolean().nullable(), verifiedNumbers: z.number().int().nullable(),
    priorVersionsKept: z.boolean().nullable(), sentToThirdParties: z.boolean().nullable(), presented: z.boolean().nullable()})},
  deliberations: {kind: "table" as const, claims: noClaims, content: rows(z.strictObject({id: z.string(), number: z.number().int(), title: z.string(), text: z.string(),
    authority: z.enum(["board", "executive", "shareholders"]), recommendationShown: z.boolean().nullable(), deadlines: z.array(deadline)}))},
  outline: {kind: "section" as const, claims: noClaims, content: z.strictObject({narrative: z.array(z.string()),
    questions: z.array(z.strictObject({code: z.enum(["template", "agenda_minutes", "board_has_seen"]), topicId: z.string().nullable(), label: z.string().nullable()}))})},
  pages: {kind: "table" as const, claims: noClaims, content: rows(z.strictObject({id: z.string(), number: z.number().int(), placement: z.enum(["main", "appendix"]), role: z.string(), title: z.string(),
    lines: z.array(z.string()), recommendation: z.string().nullable(), options: z.array(z.string()), pendingFigureIds: z.array(z.string())}))},
  summary: {kind: "section" as const, claims: noClaims, content: z.strictObject({text: z.string().nullable()})},
  questions: {kind: "table" as const, claims: noClaims, content: rows(z.strictObject({id: z.string(), question: z.string(), answer: z.string()}))},
  appendix: {kind: "table" as const, claims: noClaims, content: rows(z.strictObject({id: z.string(), label: z.string(), sourceIds: z.array(z.string())}))},
  identity: {kind: "table" as const, claims: z.array(claim), content: rows(z.strictObject({figureId: z.string(), sourceId: z.string(), methodId: z.string(), methodVersion: z.string(),
    packetFingerprint: hash, path: z.string(), unit: z.string(), value: z.string(), rounded: z.string(), display: z.string(), matches: z.literal(true)}))},
  pending: {kind: "section" as const, claims: noClaims, content: z.strictObject({indicative: z.array(z.strictObject({figureId: z.string(), reason: z.string()})),
    sources: z.array(z.strictObject({sourceId: z.string(), methodId: z.string(), status: z.string(), reasons: z.array(z.string())})), authority: z.array(z.string()),
    template: z.enum(["not_supplied", "supplied_not_applied"]).nullable(), figures: z.array(z.strictObject({figureId: z.string(), methodId: z.string(), path: z.string(), reason: z.string()}))})},
  omissions: {kind: "table" as const, claims: noClaims, content: rows(z.strictObject({id: z.string(), target: z.enum(["recommendation", "page", "figure", "deadline"]), targetId: z.string(),
    requestedBy: z.string(), outcome: z.enum(["applied", "refused"]), reason: z.string(), keptFigureIds: z.array(z.string())}))},
  versions: {kind: "table" as const, claims: noClaims, content: rows(z.strictObject({version: z.number().int(), fingerprint: hash, mainPages: z.number().int()}))},
  sources: {kind: "table" as const, claims: noClaims, content: rows(z.strictObject({id: z.string(), methodId: z.string(), methodVersion: z.string(), packetFingerprint: hash, status: z.string()}))},
  "information-gaps": {kind: "table" as const, claims: noClaims, content: rows(z.strictObject({operand: z.string(), reason: z.string()}))},
  exclusions: {kind: "section" as const, claims: noClaims, content: z.strictObject({items: z.array(z.string())})},
};
type Spec = typeof spec;
type Content<K extends keyof Spec> = z.infer<Spec[K]["content"]>;
export type BoardMaterialResultBlocksView = {
  readonly framing: Content<"framing">; readonly deliberations: Content<"deliberations">["rows"]; readonly outline: Content<"outline">;
  readonly pages: Content<"pages">["rows"]; readonly summary: string | null; readonly questions: Content<"questions">["rows"]; readonly appendix: Content<"appendix">["rows"];
  readonly identity: Content<"identity">["rows"]; readonly pending: Content<"pending">; readonly omissions: Content<"omissions">["rows"];
  readonly versions: Content<"versions">["rows"]; readonly sources: Content<"sources">["rows"]; readonly informationGaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function readBoardMaterialPacketBlocks(blocks: readonly BlockLike[]): BoardMaterialResultBlocksView | null {
  const byKey = new Map<string, BlockLike>();
  for (const b of blocks) {if (byKey.has(b.blockKey)) return null; byKey.set(b.blockKey, b);}
  const out: Record<string, {content: unknown; claims: unknown}> = {};
  for (const [key, s] of Object.entries(spec)) {
    const b = byKey.get(key);
    if (!b || b.kind !== s.kind) return null;
    const content = s.content.safeParse(b.content), claims = s.claims.safeParse(b.claims);
    if (!content.success || !claims.success) return null;
    out[key] = {content: content.data, claims: claims.data};
    byKey.delete(key);
  }
  if (byKey.size) return null;
  const identity = (out.identity!.content as Content<"identity">).rows;
  // One claim per economic identity row, carrying exactly its value; nothing more.
  const expected = identity.filter((r) => economic.has(r.unit) && /^-?\d+(?:\.\d+)?$/.test(r.value)).map((r) => [`figure:${r.figureId}`, r.value, r.packetFingerprint]);
  const got = (out.identity!.claims as Claim[]).map((c) => [c.claimId, c.value, c.supportIds.join(",")]);
  if (JSON.stringify(got) !== JSON.stringify(expected)) return null;
  const c = <K extends keyof Spec>(k: K) => out[k]!.content as Content<K>;
  return freezeArtifactValue({framing: c("framing"), deliberations: c("deliberations").rows, outline: c("outline"), pages: c("pages").rows, summary: c("summary").text,
    questions: c("questions").rows, appendix: c("appendix").rows, identity, pending: c("pending"), omissions: c("omissions").rows, versions: c("versions").rows,
    sources: c("sources").rows, informationGaps: c("information-gaps").rows, exclusions: c("exclusions").items}) as BoardMaterialResultBlocksView;
}
