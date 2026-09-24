import {createHash} from "node:crypto";
import {z} from "zod";
import {executionCanonicalText, executionGatesSchema, type ExecutionGates} from "@offroad/agent-contracts";
import {capitalProcedurePacketV2OutputSchema, deriveCapitalChartSeries, evaluateMdTest, type CapitalMdTestGates} from "@offroad/financial-model";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const outcome = z.enum(["succeeded", "partial"]);
const committed = z.object({outcome, reason: z.string(), resultFingerprint: hash, canonicalResult: z.string(), committedAt: z.string()});
const withheld = z.object({withheld: z.literal("inputs_not_current"), outcome, reason: z.string(), resultFingerprint: hash, committedAt: z.string()});
/** The gate receipt the v2 producer stored with the execution; null for one requested through v1. */
const receipt = z.object({gatesVersion: z.string(), blocked: z.boolean(), fingerprint: hash, canonical: z.unknown(), createdAt: z.string()});
/** What a participant reads back: identity and state always, result bytes only while inputs are
 * current, and the gate receipt when the request carried one. */
export const workExecutionReadSchema = z.object({
  schemaVersion: z.literal("work-execution-read.v2"),
  executionId: z.uuid(), workId: z.uuid(), requestId: z.uuid(), processingRunId: z.uuid(), createdAt: z.string(),
  job: z.object({status: z.string(), attempts: z.number().int().nonnegative(), lastErrorCode: z.string().nullable(), availableAt: z.string().nullable(), updatedAt: z.string()}).nullable(),
  run: z.object({status: z.string(), completedAt: z.string().nullable(), usage: z.unknown()}).nullable(),
  manifest: z.object({contractFingerprint: hash, inputFingerprint: hash, purpose: z.string().nullable(), method: z.object({methodId: z.string(), methodVersion: z.string()}).loose().nullable(), budget: z.unknown(), requestedAt: z.string().nullable()}).nullable(),
  operation: z.object({state: z.string(), settledOutcome: z.string().nullable(), settledReason: z.string().nullable(), resultFingerprint: z.string().nullable()}).nullable(),
  result: z.union([z.null(), withheld, committed]),
  inputsCurrent: z.boolean(),
  gates: receipt.nullable(),
});
export const workExecutionListSchema = z.array(z.object({
  executionId: z.uuid(), requestId: z.uuid(), processingRunId: z.uuid(), createdAt: z.string(),
  jobStatus: z.string().nullable(), runStatus: z.string().nullable(), outcome: z.string().nullable(), reason: z.string().nullable(), purpose: z.string().nullable(),
}));

type PacketOutput = z.infer<typeof capitalProcedurePacketV2OutputSchema>;
export type WorkExecutionState = "queued" | "leased" | "succeeded" | "partial" | "failed" | "withheld" | "unknown";
export type WorkExecutionPacket = {
  status: "framed" | "partial" | "prepared_for_human_review"; question: string; asOf: string;
  alternatives: Array<{id: string; label: string; kind: string; calculated: boolean}>;
  informationGaps: Array<{subjectId: string | null; code: string; reason: string}>;
  contractualGaps: Array<{subjectId: string; code: string}>;
  nextRequirements: string[]; unresolved: string[]; contributions: number; fingerprint: string;
};
/** The receipt as the screen shows it: every state when its bytes match the stored fingerprint,
 * and only the fingerprint when they do not. */
export type WorkExecutionGates = {verified: false; fingerprint: string; createdAt: string}
  | ({verified: true; fingerprint: string; createdAt: string} & Pick<ExecutionGates, "gatesVersion" | "blocked" | "companyRegistration" | "research" | "methodSelection" | "conventions" | "voice">);
/** One MD test question: its status and the code behind it. There is no overall verdict. */
export type WorkExecutionMdQuestion = {id: string; status: "pass"} | {id: string; status: "fail"; reasonCodes: string[]}
  | {id: string; status: "not_applicable"; scopeCode: string} | {id: string; status: "human_required"; reasonCode: string};
export type WorkExecutionMdTest = {evaluated: true; questions: WorkExecutionMdQuestion[]}
  | {evaluated: false; reason: "gates_not_recorded" | "gates_unverified" | "evaluation_failed"};
/** The decisive number of one chart piece and its period, to be read as text. */
export type WorkExecutionDecisiveNumber = {pieceId: string; questionCode: string; alternativeId: string; unit: string; value: string; periodLabel: string};
export type WorkExecutionView = {
  executionId: string; workId: string; requestId: string; processingRunId: string; createdAt: string;
  state: WorkExecutionState; outcome: "succeeded" | "partial" | null; reason: string | null; inputsCurrent: boolean;
  job: {status: string; attempts: number; lastErrorCode: string | null; updatedAt: string} | null;
  manifest: {purpose: string | null; methodId: string | null; methodVersion: string | null; requestedAt: string | null; contractFingerprint: string; inputFingerprint: string} | null;
  gates: WorkExecutionGates | null;
  result: null | {withheld: true; resultFingerprint: string; committedAt: string}
    | {withheld: false; resultFingerprint: string; committedAt: string; packet: WorkExecutionPacket | null; marker: {status: string; reason: string} | null;
      mdTest: WorkExecutionMdTest | null; decisiveNumbers: WorkExecutionDecisiveNumber[] | null};
};
export type WorkExecutionListItem = {executionId: string; createdAt: string; state: WorkExecutionState; outcome: string | null; reason: string | null; purpose: string | null};

const known: Record<string, WorkExecutionState> = {queued: "queued", leased: "leased", succeeded: "succeeded", partial: "partial", failed: "failed"};
export function workExecutionState(input: {withheld?: boolean; outcome: string | null; jobStatus: string | null}): WorkExecutionState {
  if (input.withheld) return "withheld";
  if (input.outcome === "succeeded" || input.outcome === "partial") return input.outcome;
  return (input.jobStatus ? known[input.jobStatus] : undefined) ?? "unknown";
}

/** The committed bytes are either the published packet or the worker's partial marker. */
function parseCommittedResult(canonicalResult: string): {data: PacketOutput | null; marker: {status: string; reason: string} | null} {
  let parsed: unknown;
  try { parsed = JSON.parse(canonicalResult); } catch { return {data: null, marker: null}; }
  const packet = capitalProcedurePacketV2OutputSchema.safeParse(parsed);
  if (packet.success) return {data: packet.data, marker: null};
  const marker = z.object({status: z.literal("partial"), reason: z.string()}).strict().safeParse(parsed);
  return {data: null, marker: marker.success ? marker.data : null};
}

function packetView(data: PacketOutput): WorkExecutionPacket {
  const d = data.decision;
  return {status: data.status, question: d.question, asOf: d.asOf,
    alternatives: d.alternatives.map(a => ({id: a.id, label: a.label, kind: a.kind, calculated: a.projection.summary !== null})),
    informationGaps: d.informationGaps, contractualGaps: data.contractualGaps, nextRequirements: d.nextRequirements, unresolved: d.unresolved,
    contributions: d.provenance.contributionIds.length, fingerprint: data.fingerprint};
}

/** Anything other than the published packet or the marker is shown by fingerprint only: this
 * screen never narrates a result it cannot validate. */
export function readCommittedResult(canonicalResult: string): {packet: WorkExecutionPacket | null; marker: {status: string; reason: string} | null} {
  const {data, marker} = parseCommittedResult(canonicalResult);
  return {packet: data ? packetView(data) : null, marker};
}

/** The receipt is shown only when its bytes are the canonical text of a closed gates record whose
 * SHA-256 is the fingerprint the database computed and whose version and block flag match the
 * receipt row; anything else keeps only the fingerprint. */
export function projectExecutionGates(raw: z.infer<typeof receipt>): WorkExecutionGates {
  const unverified = {verified: false as const, fingerprint: raw.fingerprint, createdAt: raw.createdAt};
  const parsed = executionGatesSchema.safeParse(raw.canonical);
  if (!parsed.success) return unverified;
  const bytes = executionCanonicalText(parsed.data);
  if (createHash("sha256").update(bytes, "utf8").digest("hex") !== raw.fingerprint || parsed.data.gatesVersion !== raw.gatesVersion || parsed.data.blocked !== raw.blocked) return unverified;
  const {gatesVersion, blocked, companyRegistration, research, methodSelection, conventions, voice} = parsed.data;
  return {verified: true, fingerprint: raw.fingerprint, createdAt: raw.createdAt, gatesVersion, blocked, companyRegistration, research, methodSelection, conventions, voice};
}

/** The gate states the MD test reads, taken from the receipt: the rubric needs states and counts,
 * never the versions, the registry metadata or the method identity. */
export function mdTestGatesOf(gates: Pick<ExecutionGates, "companyRegistration" | "research" | "methodSelection" | "conventions" | "voice">): CapitalMdTestGates {
  return {
    companyRegistration: gates.companyRegistration,
    research: gates.research,
    methodSelection: {situationIds: [...gates.methodSelection.situationIds]},
    conventions: gates.conventions.map(({key, effective}) => ({key, effective})),
    voice: {blockCount: gates.voice.blockCount, warnCount: gates.voice.warnCount},
  };
}

/** The MD test over the committed packet and the receipt: each question with its status and code.
 * The evaluator's outcome counts are left out on purpose; a count of passes reads as a verdict. */
function mdTestOf(data: PacketOutput, gates: WorkExecutionGates | null): WorkExecutionMdTest {
  if (!gates) return {evaluated: false, reason: "gates_not_recorded"};
  if (!gates.verified) return {evaluated: false, reason: "gates_unverified"};
  try {
    const result = evaluateMdTest({packet: data, gates: mdTestGatesOf(gates)});
    return {evaluated: true, questions: result.questions.map((question): WorkExecutionMdQuestion => {
      switch (question.status) {
        case "pass": return {id: question.id, status: "pass"};
        case "fail": return {id: question.id, status: "fail", reasonCodes: [...question.reasonCodes]};
        case "not_applicable": return {id: question.id, status: "not_applicable", scopeCode: question.scopeCode};
        case "human_required": return {id: question.id, status: "human_required", reasonCode: question.reasonCode};
      }
    })};
  } catch { return {evaluated: false, reason: "evaluation_failed"}; }
}

/** Each chart piece's decisive number and its period, as the series derives them from the packet.
 * Nothing is drawn here; rendering follows the house chart rules in a separate piece of work. */
function decisiveNumbersOf(data: PacketOutput): WorkExecutionDecisiveNumber[] | null {
  try {
    return deriveCapitalChartSeries(data).pieces.map(piece => ({pieceId: piece.pieceId, questionCode: piece.questionCode, alternativeId: piece.alternativeId,
      unit: piece.unit, value: piece.decisiveNumber.value, periodLabel: piece.conclusion.values.periodLabel}));
  } catch { return null; }
}

export function projectWorkExecution(raw: unknown): WorkExecutionView {
  const r = workExecutionReadSchema.parse(raw);
  const gates = r.gates === null ? null : projectExecutionGates(r.gates);
  let result: WorkExecutionView["result"] = null;
  if (r.result !== null && "withheld" in r.result) result = {withheld: true, resultFingerprint: r.result.resultFingerprint, committedAt: r.result.committedAt};
  else if (r.result !== null) {
    const {data, marker} = parseCommittedResult(r.result.canonicalResult);
    result = {withheld: false, resultFingerprint: r.result.resultFingerprint, committedAt: r.result.committedAt, packet: data ? packetView(data) : null, marker,
      mdTest: data ? mdTestOf(data, gates) : null, decisiveNumbers: data ? decisiveNumbersOf(data) : null};
  }
  return {executionId: r.executionId, workId: r.workId, requestId: r.requestId, processingRunId: r.processingRunId, createdAt: r.createdAt,
    state: workExecutionState({withheld: result?.withheld, outcome: r.result?.outcome ?? null, jobStatus: r.job?.status ?? null}),
    outcome: r.result?.outcome ?? null, reason: r.result?.reason ?? null, inputsCurrent: r.inputsCurrent,
    job: r.job ? {status: r.job.status, attempts: r.job.attempts, lastErrorCode: r.job.lastErrorCode, updatedAt: r.job.updatedAt} : null,
    manifest: r.manifest ? {purpose: r.manifest.purpose, methodId: r.manifest.method?.methodId ?? null, methodVersion: r.manifest.method?.methodVersion ?? null,
      requestedAt: r.manifest.requestedAt, contractFingerprint: r.manifest.contractFingerprint, inputFingerprint: r.manifest.inputFingerprint} : null,
    gates, result};
}

export function projectWorkExecutionList(raw: unknown, pageSize = 25): {items: WorkExecutionListItem[]; nextCursor: string | null} {
  const rows = workExecutionListSchema.parse(raw);
  const items = rows.slice(0, pageSize).map(row => ({executionId: row.executionId, createdAt: row.createdAt, outcome: row.outcome, reason: row.reason, purpose: row.purpose,
    state: workExecutionState({outcome: row.outcome, jobStatus: row.jobStatus})}));
  return {items, nextCursor: rows.length > pageSize ? items[pageSize - 1]!.executionId : null};
}
