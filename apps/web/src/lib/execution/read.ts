import {createHash} from "node:crypto";
import {z} from "zod";
import {executionCanonicalText, executionGatesSchema, type ExecutionGates} from "@offroad/agent-contracts";
import {covenantHeadroomPacketBlocks, debtTablePacketBlocks, readCovenantHeadroomPacketBlocks, readDebtTablePacketBlocks, readWeeklyCashPacketBlocks, weeklyCashPacketBlocks,
  type CovenantHeadroomPacketLike, type CovenantHeadroomResultBlocksView, type DebtTablePacketLike, type DebtTableResultBlocksView, type WeeklyCashPacketLike, type WeeklyCashResultBlocksView} from "@offroad/domain-contracts";
import {debtCapacityPacketBlocks, financingComparisonPacketBlocks, investmentDecisionPacketBlocks, readDebtCapacityPacketBlocks, readFinancingComparisonPacketBlocks, readInvestmentDecisionPacketBlocks,
  type DebtCapacityPacketLike, type DebtCapacityResultBlocksView, type FinancingComparisonPacketLike, type FinancingComparisonResultBlocksView, type InvestmentDecisionPacketLike, type InvestmentResultBlocksView} from "@offroad/domain-contracts";
import {operatingProjectionPacketBlocks, projectionChallengePacketBlocks, quarterUpdatePacketBlocks, readOperatingProjectionPacketBlocks, readProjectionChallengePacketBlocks,
  readQuarterUpdatePacketBlocks, readReceivablesFundingPacketBlocks, receivablesFundingPacketBlocks, type OperatingProjectionPacketLike, type OperatingProjectionResultBlocksView,
  type ProjectionChallengePacketLike, type ProjectionChallengeResultBlocksView, type QuarterUpdatePacketLike, type QuarterUpdateResultBlocksView,
  type ReceivablesFundingPacketLike, type ReceivablesFundingResultBlocksView} from "@offroad/domain-contracts";
import {boardMaterialPacketBlocks, documentFolderPacketBlocks, readBoardMaterialPacketBlocks, readDocumentFolderPacketBlocks, readReceivedProposalPacketBlocks, receivedProposalPacketBlocks,
  type BoardMaterialPacketLike, type BoardMaterialResultBlocksView, type DocumentFolderPacketLike, type DocumentFolderResultBlocksView, type FinancingPathsResultBlocksView,
  type ReceivedProposalPacketLike, type ReceivedProposalResultBlocksView} from "@offroad/domain-contracts";
import {covenantHeadroomPacketOutputSchema, debtTablePacketOutputSchema, weeklyCashPacketOutputSchema} from "@offroad/financial-model";
import {boardCapitalDiscussionPacketOutputSchema, documentFolderInventoryPacketOutputSchema, receivedProposalPacketOutputSchema} from "@offroad/financial-model";
import {readFinancingPathsResult} from "./financing-paths-read";
import {operatingProjectionPacketOutputSchema, projectionChallengePacketOutputSchema, quarterUpdatePacketOutputSchema, receivablesFundingPacketOutputSchema} from "@offroad/financial-model";
import {capitalProcedurePacketV2OutputSchema, debtCapacityPacketOutputSchema, deriveCapitalChartSeries, evaluateMdTest, financingComparisonPacketOutputSchema, investmentDecisionPacketOutputSchema, type CapitalMdTestGates} from "@offroad/financial-model";
import type {ExecutionRevision, ExecutionRevisionState} from "./revision";

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
  | {evaluated: false; reason: "gates_not_recorded" | "gates_unverified" | "evaluation_failed" | "pins_mismatch"};
/** The decisive number of one chart piece and its period, to be read as text. */
export type WorkExecutionDecisiveNumber = {pieceId: string; questionCode: string; alternativeId: string; unit: string; value: string; periodLabel: string};
export type WorkExecutionView = {
  executionId: string; workId: string; requestId: string; processingRunId: string; createdAt: string;
  state: WorkExecutionState; outcome: "succeeded" | "partial" | null; reason: string | null; inputsCurrent: boolean;
  job: {status: string; attempts: number; lastErrorCode: string | null; updatedAt: string} | null;
  manifest: {purpose: string | null; methodId: string | null; methodVersion: string | null; requestedAt: string | null; contractFingerprint: string; inputFingerprint: string} | null;
  gates: WorkExecutionGates | null;
  /**
   * `inputs_not_current`: the execution's reader withheld the bytes. `revision_restricted`: the bytes
   * came back but the database withheld the registered revision from this reader, so nothing of the
   * result is shown. With a result, `source` says where the screen took it from: the blocks of the
   * registered revision, or the committed packet of an execution that has no revision.
   */
  result: null | {withheld: true; reason: "inputs_not_current" | "revision_restricted"; resultFingerprint: string; committedAt: string}
    | {withheld: false; source: "packet" | "revision"; resultFingerprint: string; committedAt: string; packet: WorkExecutionPacket | null; marker: {status: string; reason: string} | null;
      mdTest: WorkExecutionMdTest | null; decisiveNumbers: WorkExecutionDecisiveNumber[] | null;
      /** The case comparison of an investment analysis; absent for a capital result. */
      investment?: InvestmentResultBlocksView | null;
      /** The offers compared per case (ficha C02). */
      comparison?: FinancingComparisonResultBlocksView | null;
      /** The capacity per limit and schedule (ficha C04). */
      capacity?: DebtCapacityResultBlocksView | null;
      /** The company's debt table per instrument and view (ficha C10). */
      debtTable?: DebtTableResultBlocksView | null;
      /** The headroom against each covenant and the board policy (ficha C12). */
      covenantHeadroom?: CovenantHeadroomResultBlocksView | null;
      /** Cash week by week to the horizon (ficha C18). */
      weeklyCash?: WeeklyCashResultBlocksView | null;
      /** The projection by driver with its calibration, comparisons and sensitivities (ficha C24). */
      operatingProjection?: OperatingProjectionResultBlocksView | null;
      /** The plan read against the reference, assumption by assumption (ficha C26). */
      projectionChallenge?: ProjectionChallengeResultBlocksView | null;
      /** The portfolio against each funding option and the bank line (ficha C35). */
      receivablesFunding?: ReceivablesFundingResultBlocksView | null;
      /** The quarter close carried into the weekly cash and the covenant test (ficha C54). */
      quarterUpdate?: QuarterUpdateResultBlocksView | null;
      /** The folder inventory with versions, findings and gaps by purpose (ficha C09). */
      documentFolder?: DocumentFolderResultBlocksView | null;
      /** A received proposal against the use, the cash, the limits and the price (ficha C01). */
      receivedProposal?: ReceivedProposalResultBlocksView | null;
      /** The financing paths on one basis (the 2027 plan of ficha C32). */
      financingPaths?: FinancingPathsResultBlocksView | null;
      /** The board's capital structure discussion (ficha C47). */
      boardMaterial?: BoardMaterialResultBlocksView | null;
      revision: {revisionNo: number; recordedAt: string; freshness: "current" | "stale" | "unknown"} | null};
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

/** The committed bytes of an investment analysis, read through the same blocks its revision carries. */
export function readInvestmentResult(canonicalResult: string): InvestmentResultBlocksView | null {
  try {
    const parsed = investmentDecisionPacketOutputSchema.safeParse(JSON.parse(canonicalResult));
    return parsed.success ? readInvestmentDecisionPacketBlocks(investmentDecisionPacketBlocks(parsed.data as unknown as InvestmentDecisionPacketLike)) : null;
  } catch { return null; }
}

/** The committed bytes of a comparison of offers, read through the same blocks its revision carries. */
export function readComparisonResult(canonicalResult: string): FinancingComparisonResultBlocksView | null {
  try {
    const parsed = financingComparisonPacketOutputSchema.safeParse(JSON.parse(canonicalResult));
    return parsed.success ? readFinancingComparisonPacketBlocks(financingComparisonPacketBlocks(parsed.data as unknown as FinancingComparisonPacketLike)) : null;
  } catch { return null; }
}

/** The committed bytes of a capacity analysis, read through the same blocks its revision carries. */
export function readCapacityResult(canonicalResult: string): DebtCapacityResultBlocksView | null {
  try {
    const parsed = debtCapacityPacketOutputSchema.safeParse(JSON.parse(canonicalResult));
    return parsed.success ? readDebtCapacityPacketBlocks(debtCapacityPacketBlocks(parsed.data as unknown as DebtCapacityPacketLike)) : null;
  } catch { return null; }
}

/** The committed bytes of a debt table, read through the same blocks its revision carries. */
export function readDebtTableResult(canonicalResult: string): DebtTableResultBlocksView | null {
  try {
    const parsed = debtTablePacketOutputSchema.safeParse(JSON.parse(canonicalResult));
    return parsed.success ? readDebtTablePacketBlocks(debtTablePacketBlocks(parsed.data as unknown as DebtTablePacketLike)) : null;
  } catch { return null; }
}

/** The committed bytes of a covenant headroom reading, read through the same blocks its revision carries. */
export function readCovenantHeadroomResult(canonicalResult: string): CovenantHeadroomResultBlocksView | null {
  try {
    const parsed = covenantHeadroomPacketOutputSchema.safeParse(JSON.parse(canonicalResult));
    return parsed.success ? readCovenantHeadroomPacketBlocks(covenantHeadroomPacketBlocks(parsed.data as unknown as CovenantHeadroomPacketLike)) : null;
  } catch { return null; }
}

/** The committed bytes of a weekly cash projection, read through the same blocks its revision carries. */
export function readWeeklyCashResult(canonicalResult: string): WeeklyCashResultBlocksView | null {
  try {
    const parsed = weeklyCashPacketOutputSchema.safeParse(JSON.parse(canonicalResult));
    return parsed.success ? readWeeklyCashPacketBlocks(weeklyCashPacketBlocks(parsed.data as unknown as WeeklyCashPacketLike)) : null;
  } catch { return null; }
}

/** The committed bytes of an operating projection, read through the same blocks its revision carries. */
export function readOperatingProjectionResult(canonicalResult: string): OperatingProjectionResultBlocksView | null {
  try {
    const parsed = operatingProjectionPacketOutputSchema.safeParse(JSON.parse(canonicalResult));
    return parsed.success ? readOperatingProjectionPacketBlocks(operatingProjectionPacketBlocks(parsed.data as unknown as OperatingProjectionPacketLike)) : null;
  } catch { return null; }
}

/** The committed bytes of a projection challenge, read through the same blocks its revision carries. */
export function readProjectionChallengeResult(canonicalResult: string): ProjectionChallengeResultBlocksView | null {
  try {
    const parsed = projectionChallengePacketOutputSchema.safeParse(JSON.parse(canonicalResult));
    return parsed.success ? readProjectionChallengePacketBlocks(projectionChallengePacketBlocks(parsed.data as unknown as ProjectionChallengePacketLike)) : null;
  } catch { return null; }
}

/** The committed bytes of a receivables funding reading, read through the same blocks its revision carries. */
export function readReceivablesFundingResult(canonicalResult: string): ReceivablesFundingResultBlocksView | null {
  try {
    const parsed = receivablesFundingPacketOutputSchema.safeParse(JSON.parse(canonicalResult));
    return parsed.success ? readReceivablesFundingPacketBlocks(receivablesFundingPacketBlocks(parsed.data as unknown as ReceivablesFundingPacketLike)) : null;
  } catch { return null; }
}

/** The committed bytes of a quarter update, read through the same blocks its revision carries. */
export function readQuarterUpdateResult(canonicalResult: string): QuarterUpdateResultBlocksView | null {
  try {
    const parsed = quarterUpdatePacketOutputSchema.safeParse(JSON.parse(canonicalResult));
    return parsed.success ? readQuarterUpdatePacketBlocks(quarterUpdatePacketBlocks(parsed.data as unknown as QuarterUpdatePacketLike)) : null;
  } catch { return null; }
}

/** The committed bytes of a folder inventory, read through the same blocks its revision carries. */
export function readDocumentFolderResult(canonicalResult: string): DocumentFolderResultBlocksView | null {
  try {
    const parsed = documentFolderInventoryPacketOutputSchema.safeParse(JSON.parse(canonicalResult));
    return parsed.success ? readDocumentFolderPacketBlocks(documentFolderPacketBlocks(parsed.data as unknown as DocumentFolderPacketLike)) : null;
  } catch { return null; }
}

/** The committed bytes of a received proposal reading, read through the same blocks its revision carries. */
export function readReceivedProposalResult(canonicalResult: string): ReceivedProposalResultBlocksView | null {
  try {
    const parsed = receivedProposalPacketOutputSchema.safeParse(JSON.parse(canonicalResult));
    return parsed.success ? readReceivedProposalPacketBlocks(receivedProposalPacketBlocks(parsed.data as unknown as ReceivedProposalPacketLike)) : null;
  } catch { return null; }
}

/** The committed bytes of a board capital discussion, read through the same blocks its revision carries. */
export function readBoardMaterialResult(canonicalResult: string): BoardMaterialResultBlocksView | null {
  try {
    const parsed = boardCapitalDiscussionPacketOutputSchema.safeParse(JSON.parse(canonicalResult));
    return parsed.success ? readBoardMaterialPacketBlocks(boardMaterialPacketBlocks(parsed.data as unknown as BoardMaterialPacketLike)) : null;
  } catch { return null; }
}
export {readFinancingPathsResult};

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

/** The packet as the screen shows it, taken from the blocks of the registered revision instead of the bytes. */
type CapitalRevision = Extract<ExecutionRevision, {readonly blocks: unknown}>;
function blocksPacketView(revision: CapitalRevision): WorkExecutionPacket {
  const {framing, alternatives, informationGaps, contractualGaps, nextRequirements} = revision.blocks;
  return {status: framing.status, question: framing.question, asOf: framing.asOf,
    alternatives: alternatives.map(a => ({id: a.id, label: a.label, kind: a.kind, calculated: a.calculated})),
    informationGaps: informationGaps.map(g => ({subjectId: g.subjectId, code: g.code, reason: g.reason})),
    contractualGaps: contractualGaps.map(g => ({subjectId: g.subjectId, code: g.code})), nextRequirements: [...nextRequirements], unresolved: [],
    contributions: framing.contributionCount, fingerprint: revision.pins.packetFingerprint ?? ""};
}

/** The MD test of a registered result: the one evaluator, over the committed packet and the gate
 * receipt the revision pinned. A packet or a receipt read now that is not the pinned one is not
 * evaluated; a receipt whose bytes do not match its fingerprint stays unverified, as before. */
function pinnedMdTestOf(data: PacketOutput | null, gates: WorkExecutionGates | null, resultFingerprint: string, revision: CapitalRevision): WorkExecutionMdTest {
  const {pins} = revision;
  if (!data || resultFingerprint !== pins.resultFingerprint || data.fingerprint !== pins.packetFingerprint || (gates?.fingerprint ?? null) !== pins.gatesFingerprint) {
    return {evaluated: false, reason: "pins_mismatch"};
  }
  return mdTestOf(data, gates);
}

/** The view of one read of `read_work_execution_v2`, with the registered revision when the page read it. */
export function projectWorkExecution(raw: unknown, registered?: ExecutionRevisionState): WorkExecutionView {
  const r = workExecutionReadSchema.parse(raw);
  const gates = r.gates === null ? null : projectExecutionGates(r.gates);
  let result: WorkExecutionView["result"] = null;
  if (r.result !== null && "withheld" in r.result) result = {withheld: true, reason: "inputs_not_current", resultFingerprint: r.result.resultFingerprint, committedAt: r.result.committedAt};
  else if (r.result !== null && registered && ["withheld", "unavailable", "mismatch"].includes(registered.state)) result = {withheld: true, reason: "revision_restricted", resultFingerprint: r.result.resultFingerprint, committedAt: r.result.committedAt};
  else if (r.result !== null && registered?.state === "ready" && registered.revision.kind === "investment") {
    const {revision} = registered;
    result = {withheld: false, source: "revision", resultFingerprint: r.result.resultFingerprint, committedAt: r.result.committedAt, packet: null, marker: null,
      mdTest: null, decisiveNumbers: null, investment: revision.investment,
      revision: {revisionNo: revision.revisionNo, recordedAt: revision.recordedAt, freshness: revision.freshness}};
  } else if (r.result !== null && registered?.state === "ready" && registered.revision.kind !== undefined && registered.revision.kind !== "capital") {
    const {revision} = registered;
    const view = revision.kind === "comparison" ? {comparison: revision.comparison} : revision.kind === "capacity" ? {capacity: revision.capacity}
      : revision.kind === "debt_table" ? {debtTable: revision.debtTable} : revision.kind === "covenant_headroom" ? {covenantHeadroom: revision.covenantHeadroom}
      : revision.kind === "weekly_cash" ? {weeklyCash: revision.weeklyCash}
      : revision.kind === "operating_projection" ? {operatingProjection: revision.operatingProjection} : revision.kind === "projection_challenge" ? {projectionChallenge: revision.projectionChallenge}
      : revision.kind === "receivables_funding" ? {receivablesFunding: revision.receivablesFunding} : revision.kind === "quarter_update" ? {quarterUpdate: revision.quarterUpdate}
      : revision.kind === "document_folder" ? {documentFolder: revision.documentFolder} : revision.kind === "received_proposal" ? {receivedProposal: revision.receivedProposal}
      : revision.kind === "financing_paths" ? {financingPaths: revision.financingPaths} : revision.kind === "board_material" ? {boardMaterial: revision.boardMaterial} : {};
    result = {withheld: false, source: "revision", resultFingerprint: r.result.resultFingerprint, committedAt: r.result.committedAt, packet: null, marker: null,
      mdTest: null, decisiveNumbers: null, ...view,
      revision: {revisionNo: revision.revisionNo, recordedAt: revision.recordedAt, freshness: revision.freshness}};
  } else if (r.result !== null && registered?.state === "ready" && (registered.revision.kind === undefined || registered.revision.kind === "capital")) {
    const {data} = parseCommittedResult(r.result.canonicalResult);
    const {revision} = registered;
    result = {withheld: false, source: "revision", resultFingerprint: r.result.resultFingerprint, committedAt: r.result.committedAt, packet: blocksPacketView(revision), marker: null,
      mdTest: pinnedMdTestOf(data, gates, r.result.resultFingerprint, revision), decisiveNumbers: revision.blocks.decisiveNumbers.map(n => ({...n})),
      revision: {revisionNo: revision.revisionNo, recordedAt: revision.recordedAt, freshness: revision.freshness}};
  } else if (r.result !== null) {
    const {data, marker} = parseCommittedResult(r.result.canonicalResult);
    const investment = data || marker ? null : readInvestmentResult(r.result.canonicalResult);
    const comparison = data || marker || investment ? null : readComparisonResult(r.result.canonicalResult);
    const capacity = data || marker || investment || comparison ? null : readCapacityResult(r.result.canonicalResult);
    const debtTable = data || marker || investment || comparison || capacity ? null : readDebtTableResult(r.result.canonicalResult);
    const covenantHeadroom = data || marker || investment || comparison || capacity || debtTable ? null : readCovenantHeadroomResult(r.result.canonicalResult);
    const weeklyCash = data || marker || investment || comparison || capacity || debtTable || covenantHeadroom ? null : readWeeklyCashResult(r.result.canonicalResult);
    const before = data || marker || investment || comparison || capacity || debtTable || covenantHeadroom || weeklyCash;
    const operatingProjection = before ? null : readOperatingProjectionResult(r.result.canonicalResult);
    const projectionChallenge = before || operatingProjection ? null : readProjectionChallengeResult(r.result.canonicalResult);
    const receivablesFunding = before || operatingProjection || projectionChallenge ? null : readReceivablesFundingResult(r.result.canonicalResult);
    const quarterUpdate = before || operatingProjection || projectionChallenge || receivablesFunding ? null : readQuarterUpdateResult(r.result.canonicalResult);
    const lote3 = before || operatingProjection || projectionChallenge || receivablesFunding || quarterUpdate;
    const documentFolder = lote3 ? null : readDocumentFolderResult(r.result.canonicalResult);
    const receivedProposal = lote3 || documentFolder ? null : readReceivedProposalResult(r.result.canonicalResult);
    const financingPaths = lote3 || documentFolder || receivedProposal ? null : readFinancingPathsResult(r.result.canonicalResult);
    const boardMaterial = lote3 || documentFolder || receivedProposal || financingPaths ? null : readBoardMaterialResult(r.result.canonicalResult);
    result = {withheld: false, source: "packet", resultFingerprint: r.result.resultFingerprint, committedAt: r.result.committedAt, packet: data ? packetView(data) : null, marker,
      mdTest: data ? mdTestOf(data, gates) : null, decisiveNumbers: data ? decisiveNumbersOf(data) : null, investment, comparison, capacity, debtTable, covenantHeadroom, weeklyCash,
      operatingProjection, projectionChallenge, receivablesFunding, quarterUpdate, documentFolder, receivedProposal, financingPaths, boardMaterial, revision: null};
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
