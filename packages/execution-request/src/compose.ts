import {executionCanonicalText, type ExecutionContract, type ExecutionGates} from "@offroad/agent-contracts";
import {composeBoundCapitalPacketV2, composeBoundCapitalPaths, composeBoundCovenantHeadroom, composeBoundDebtCapacity, composeBoundDebtTable, composeBoundFinancingComparison,
  composeBoundInvestmentPacket, composeBoundOperatingProjection, composeBoundProjectionChallenge, composeBoundReceivablesFunding, composeBoundReceivedProposal, composeBoundWeeklyCash,
  composeQuarterUpdateFromStoredPriors, deriveBoundCapitalScope, inventoryModes} from "@offroad/financial-model";
import {readContextualBasis} from "@offroad/reconciliation";
import {composeExecutionContract, contractBasisVersions, executionContractText, type ExecutionContractBasis, type ExecutionRequestIds} from "./contract";
import {closeExecutionGates, openExecutionGates} from "./gates";
import type {ExecutionGateRefusal} from "./refusal";
import {boardMaterialContractBasis, boardMaterialMethodId, boardMaterialPriorResults, composeBoardMaterialPacket, type BoardMaterialPriorReference,
  type BoardMaterialPriorResult} from "./board-material-compose";
import {composeDocumentFolderRequest, documentFolderMethodId, type DocumentFolderPrior} from "./document-folder-compose";

/** What was asked of an execution: the question, the objectives, the reference date and the situations. */
export type CapitalExecutionAsk = {question: string; objectives: readonly string[]; asOf: string; situationIds: readonly string[]};

export type CapitalExecutionRefusal = ExecutionGateRefusal | "method_unavailable" | "gates_invalid" | "composition_invalid" | "priors_missing";

/** A prior completed execution of the same work that the quarter close updates, as the server returned it:
 * its id, its stored input snapshot (verbatim), the fingerprint of its result packet and the sources its contract pinned. */
export type QuarterUpdatePrior = {executionId: string; inputSnapshot: string; resultFingerprint: string; sources: ExecutionContractBasis["sources"]};
export type QuarterUpdatePriors = {weeklyCash: QuarterUpdatePrior | null; covenant: QuarterUpdatePrior | null};
/** The references the request carries for the database to check, in a fixed order. */
export type PriorResultReference = {role: "weekly_cash" | "covenant"; executionId: string; resultFingerprint: string};
/** A folder update names the inventory it updates (role `inventario`); its stored base is checked byte for byte. */
export type DocumentFolderPriorReference = {role: "inventario"; executionId: string; resultFingerprint: string};
/** What a confirmed folder card asks: its mode, and the latest completed inventory when it is an update. */
export type DocumentFolderAsk = {mode: (typeof inventoryModes)[number]; prior: DocumentFolderPrior | null};
export const quarterUpdateMethodId = "update-after-quarter-close";

export type CapitalExecutionComposition =
  | {ok: false; error: CapitalExecutionRefusal}
  | {ok: false; error: "provenance_denied"; unverifiedSources: ExecutionContractBasis["unverifiedSources"]}
  | {ok: true; contract: ExecutionContract; packet: unknown; gates: ExecutionGates; contractText: string; snapshotText: string; gatesText: string;
    /** Only for the methods that read prior results of the work (quarter close, board material, folder update): the references the request names. */
    priorResults?: PriorResultReference[] | BoardMaterialPriorReference[] | DocumentFolderPriorReference[]};

/** What a method's packet may read beyond its own basis: the quarter close's priors and the dependents asked, the board
 * material's reviewed results and their references, the folder's mode and prior inventory. */
type PacketExtras = {quarter: QuarterUpdatePriors | null; askedDependentIds: readonly string[];
  board: {priors: readonly BoardMaterialPriorResult[]; references: readonly BoardMaterialPriorReference[]} | null; folder: DocumentFolderAsk | null};

/**
 * One capital execution request, composed from the basis the server assembled for its requester
 * and from what was asked, in the order the request action has always followed: the gates that
 * need no packet (registration, released method, situations), the sources that must be pinned
 * with verified bytes, the bound packet over the working basis, the contract that pins exactly
 * that one basis version, then the voice gate and its closed receipt. The web action and the
 * worker's dependency recompute send the three texts this returns, byte for byte. Nothing here
 * reads a database, calls a model or sends anything.
 */
export function composeCapitalExecutionRequest(input: {basis: ExecutionContractBasis; ask: CapitalExecutionAsk; ids: ExecutionRequestIds; now?: Date}): CapitalExecutionComposition {
  return composeMethodExecutionRequest(input);
}

/** The packet composer of each released method, chosen by the method the server's basis names. */
const packetComposers: Record<string, (basis: ExecutionContractBasis, ask: CapitalExecutionAsk, extras: PacketExtras) => unknown> = {
  "prepare-capital-structure-decision": (basis, ask) => {
    const scope = {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId};
    const snapshot = readContextualBasis(basis.envelope, scope);
    return composeBoundCapitalPacketV2({envelope: basis.envelope, scope, question: ask.question, objectives: [...ask.objectives], asOf: ask.asOf, ...deriveBoundCapitalScope(snapshot, ask.asOf)});
  },
  "analyze-investment-project": (basis, ask) =>
    composeBoundInvestmentPacket({envelope: basis.envelope, scope: {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId}, question: ask.question}),
  "compare-financing-proposals": (basis, ask) =>
    composeBoundFinancingComparison({envelope: basis.envelope, scope: {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId}, question: ask.question}),
  "assess-debt-capacity": (basis, ask) =>
    composeBoundDebtCapacity({envelope: basis.envelope, scope: {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId}, question: ask.question}),
  "build-company-debt-table": (basis, ask) =>
    composeBoundDebtTable({envelope: basis.envelope, scope: {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId}, question: ask.question}),
  "measure-covenant-headroom": (basis, ask) =>
    composeBoundCovenantHeadroom({envelope: basis.envelope, scope: {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId}, question: ask.question}),
  "project-weekly-cash": (basis, ask) =>
    composeBoundWeeklyCash({envelope: basis.envelope, scope: {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId}, question: ask.question}),
  "build-operating-projection": (basis, ask) =>
    composeBoundOperatingProjection({envelope: basis.envelope, scope: {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId}, question: ask.question}),
  "challenge-financial-projection": (basis, ask) =>
    composeBoundProjectionChallenge({envelope: basis.envelope, scope: {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId}, question: ask.question}),
  "monetize-receivables-for-working-capital": (basis, ask) =>
    composeBoundReceivablesFunding({envelope: basis.envelope, scope: {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId}, question: ask.question}),
  // The quarter close executes on its one basis; the prior weekly cash and covenant analyses are copied
  // verbatim from the stored inputs of the prior completed executions, which the database checks byte for byte.
  [quarterUpdateMethodId]: (basis, ask, extras) => composeQuarterUpdatePacket(basis, ask, extras.quarter!, extras.askedDependentIds),
  // Lote 4. The received proposal and the financing paths read only their adopted basis.
  "evaluate-received-proposal": (basis, ask) =>
    composeBoundReceivedProposal({envelope: basis.envelope, scope: {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId}, question: ask.question}),
  "evaluate-financing-paths": (basis, ask) =>
    composeBoundCapitalPaths({envelope: basis.envelope, scope: {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId}, question: ask.question}),
  // The folder: the inventory on its basis, or the update against the prior inventory's stored base taken verbatim.
  [documentFolderMethodId]: (basis, ask, extras) => composeDocumentFolderRequest({basis: {envelope: basis.envelope,
    scope: {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId}}, question: ask.question, mode: extras.folder!.mode, prior: extras.folder!.prior}),
  // The board material: the discussion on its basis with each reviewed result the basis names, verbatim from its stored row.
  [boardMaterialMethodId]: (basis, ask, extras) => composeBoardMaterialPacket(basis, ask, extras.board!.priors, extras.board!.references),
};

/** The quarter close packet: the close on this basis, the priors verbatim from their stored inputs, and the dependents the
 * person asked to update, which travel with the question (one that is not recomputed makes the packet partial). */
export function composeQuarterUpdatePacket(basis: ExecutionContractBasis, ask: CapitalExecutionAsk, priors: QuarterUpdatePriors, askedDependentIds: readonly string[]) {
  return composeQuarterUpdateFromStoredPriors({update: {envelope: basis.envelope, scope: {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId}},
    question: ask.question, prior: {weeklyCash: priors.weeklyCash!.inputSnapshot, covenant: priors.covenant!.inputSnapshot}, askedDependentIds: [...askedDependentIds]});
}

/** The prior results a quarter close request names, weekly cash first. */
export function quarterUpdatePriorResults(priors: QuarterUpdatePriors): PriorResultReference[] | null {
  if (!priors.weeklyCash || !priors.covenant) return null;
  return [{role: "weekly_cash", executionId: priors.weeklyCash.executionId, resultFingerprint: priors.weeklyCash.resultFingerprint},
    {role: "covenant", executionId: priors.covenant.executionId, resultFingerprint: priors.covenant.resultFingerprint}];
}
/** The contract pins the close's sources and, after them, every source a prior pinned that the close does not,
 * so the closure and the read gate of the result cover what the priors were computed from. */
export function quarterUpdateContractBasis(basis: ExecutionContractBasis, priors: QuarterUpdatePriors): ExecutionContractBasis {
  const seen = new Set(basis.sources.map((s) => s.sourceVersionId)), sources = [...basis.sources];
  for (const prior of [priors.weeklyCash, priors.covenant]) for (const s of prior?.sources ?? []) if (!seen.has(s.sourceVersionId)) {seen.add(s.sourceVersionId); sources.push(s);}
  return {...basis, sources};
}

/** Same order and refusals as the capital request, for any method with a packet composer. */
export function composeMethodExecutionRequest(input: {basis: ExecutionContractBasis; ask: CapitalExecutionAsk; ids: ExecutionRequestIds; now?: Date; priors?: QuarterUpdatePriors;
  /** Quarter close only: the dependents the person explicitly asked to update, by id. */
  askedDependentIds?: readonly string[];
  /** Board material only: the latest completed result of each source role, as the server returned them. */
  boardPriors?: readonly BoardMaterialPriorResult[];
  /** Folder only: the mode the card was proposed with and the prior inventory it updates, if any. */
  documentFolder?: DocumentFolderAsk}): CapitalExecutionComposition {
  const {ask} = input;
  const methodId = input.basis.profile.method.methodId;
  const composePacket = packetComposers[methodId];
  if (!composePacket) return {ok: false, error: "method_unavailable"};
  // Only the quarter close, the board material and the folder read beyond their basis; every other method ignores the
  // extras and composes as before.
  const quarter = methodId === quarterUpdateMethodId, boardMaterial = methodId === boardMaterialMethodId, folder = methodId === documentFolderMethodId;
  if (folder && !input.documentFolder) return {ok: false, error: "priors_missing"};
  const quarterResults = quarter && input.priors ? quarterUpdatePriorResults(input.priors) : null;
  if (quarter && !quarterResults) return {ok: false, error: "priors_missing"};
  const boardResults = boardMaterial && input.boardPriors ? boardMaterialPriorResults(input.basis, input.boardPriors) : null;
  if (boardMaterial && !boardResults) return {ok: false, error: "priors_missing"};
  const folderPrior = folder ? input.documentFolder!.prior : null;
  const priorResults = quarterResults ?? boardResults
    ?? (folderPrior ? [{role: "inventario" as const, executionId: folderPrior.executionId, resultFingerprint: folderPrior.resultFingerprint}] : null);
  const basis = quarter ? quarterUpdateContractBasis(input.basis, input.priors!)
    : boardMaterial ? boardMaterialContractBasis(input.basis, input.boardPriors!, boardResults!) : input.basis;
  const opened = openExecutionGates({company: basis.company, method: basis.profile.method, situationIds: ask.situationIds, referenceDate: ask.asOf});
  if (!opened.ok) return {ok: false, error: opened.error};
  // Every adopted source must be pinned with verified bytes and current rights, or the database
  // refuses the payload; naming the sources here spares the round trip and says which ones.
  if (basis.unverifiedSources.length) return {ok: false, error: "provenance_denied", unverifiedSources: basis.unverifiedSources};
  let packet: unknown; let snapshotText: string; let contract: ExecutionContract; let contractText: string;
  try {
    packet = composePacket(basis, ask, {quarter: quarter ? input.priors! : null, askedDependentIds: quarter ? input.askedDependentIds ?? [] : [],
      board: boardMaterial ? {priors: input.boardPriors!, references: boardResults!} : null, folder: folder ? input.documentFolder! : null});
    snapshotText = executionCanonicalText(packet);
    contract = composeExecutionContract(basis, snapshotText, input.ids, input.now);
    contractText = executionContractText(contract);
  } catch { return {ok: false, error: "composition_invalid"}; }
  // The gates are evaluated over one basis version, and the producer accepts only a contract that
  // pins exactly that one.
  const pinned = contractBasisVersions(contract);
  if (pinned.length !== 1 || pinned[0] !== basis.versionId) return {ok: false, error: "composition_invalid"};
  // A receipt that cannot be built as the closed schema is never sent in any other shape.
  let closed: ReturnType<typeof closeExecutionGates>;
  try { closed = closeExecutionGates(opened, packet); } catch { return {ok: false, error: "gates_invalid"}; }
  if (!closed.ok) return {ok: false, error: closed.error};
  return {ok: true, contract, packet, gates: closed.gates, contractText, snapshotText, gatesText: closed.text, ...priorResults ? {priorResults} : {}};
}
