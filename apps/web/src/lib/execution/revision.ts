import "server-only";

import {readCapitalProcedurePacketBlocks, readCovenantHeadroomPacketBlocks, readDebtCapacityPacketBlocks, readDebtTablePacketBlocks, readFinancingComparisonPacketBlocks, readInvestmentDecisionPacketBlocks, readWeeklyCashPacketBlocks,
  readOperatingProjectionPacketBlocks, readProjectionChallengePacketBlocks, readQuarterUpdatePacketBlocks, readReceivablesFundingPacketBlocks,
  readBoardMaterialPacketBlocks, readDocumentFolderPacketBlocks, readFinancingPathsPacketBlocks, readReceivedProposalPacketBlocks,
  type BoardMaterialResultBlocksView, type DocumentFolderResultBlocksView, type FinancingPathsResultBlocksView, type ReceivedProposalResultBlocksView,
  type OperatingProjectionResultBlocksView, type ProjectionChallengeResultBlocksView, type QuarterUpdateResultBlocksView, type ReceivablesFundingResultBlocksView,
  type CovenantHeadroomResultBlocksView, type DebtCapacityResultBlocksView, type DebtTableResultBlocksView, type WeeklyCashResultBlocksView, type ExecutionResultBlocksView, type ExecutionResultCitation, type FinancingComparisonResultBlocksView, type Freshness, type InvestmentResultBlocksView} from "@offroad/domain-contracts";
import type {SupabaseClient} from "@supabase/supabase-js";

import {artifactServing, readArtifactHead, readArtifactRevision, revisionBelongsTo, type ArtifactRead} from "@/lib/artifacts/authorized-artifact-reader";
import type {Database} from "@/types/database";

/**
 * The registered revision of an execution's result (stage 19, increment 4): one artifact of kind
 * `execution_result` per execution, subject `execution:<id>`, written by the commit. The screen reads
 * it only through the authorized reader and only after the execution's own reader returned the
 * result, so source authority and the read receipt stay with that reader.
 */
export const executionResultSubject = (executionId: string) => `execution:${executionId}`;

/** What the result pins, so the screen can evaluate the MD test over exactly the packet and gate receipt of the revision. */
export type ExecutionRevisionPins = {readonly resultFingerprint: string; readonly packetFingerprint: string | null; readonly gatesFingerprint: string | null};
type ExecutionRevisionBase = {
  readonly revisionId: string;
  readonly revisionNo: number;
  readonly recordedAt: string;
  readonly freshness: Freshness;
  readonly pins: ExecutionRevisionPins;
};
/** A capital result carries its decision blocks; an investment result the case comparison; a
 * comparison of offers its proposals per case; a capacity analysis its limits per schedule; the debt
 * table its instruments and views; covenant headroom its measurements per limit; weekly cash its weeks;
 * the lote 3 results (projection, challenge, receivables funding, quarter update) and the lote 4 results (folder,
 * received proposal, financing paths, board material) their own blocks. */
export type ExecutionRevision = ExecutionRevisionBase & (
  | {readonly kind?: "capital"; readonly blocks: ExecutionResultBlocksView}
  | {readonly kind: "investment"; readonly investment: InvestmentResultBlocksView}
  | {readonly kind: "comparison"; readonly comparison: FinancingComparisonResultBlocksView}
  | {readonly kind: "capacity"; readonly capacity: DebtCapacityResultBlocksView}
  | {readonly kind: "debt_table"; readonly debtTable: DebtTableResultBlocksView}
  | {readonly kind: "covenant_headroom"; readonly covenantHeadroom: CovenantHeadroomResultBlocksView}
  | {readonly kind: "weekly_cash"; readonly weeklyCash: WeeklyCashResultBlocksView}
  | {readonly kind: "operating_projection"; readonly operatingProjection: OperatingProjectionResultBlocksView}
  | {readonly kind: "projection_challenge"; readonly projectionChallenge: ProjectionChallengeResultBlocksView}
  | {readonly kind: "receivables_funding"; readonly receivablesFunding: ReceivablesFundingResultBlocksView}
  | {readonly kind: "quarter_update"; readonly quarterUpdate: QuarterUpdateResultBlocksView}
  | {readonly kind: "document_folder"; readonly documentFolder: DocumentFolderResultBlocksView}
  | {readonly kind: "received_proposal"; readonly receivedProposal: ReceivedProposalResultBlocksView}
  | {readonly kind: "financing_paths"; readonly financingPaths: FinancingPathsResultBlocksView}
  | {readonly kind: "board_material"; readonly boardMaterial: BoardMaterialResultBlocksView});

/**
 * - `absent`: no revision (an execution committed before the producer, or a result the producer could
 *   not map); the screen shows what it showed before.
 * - `unavailable`: the read failed or its answer did not parse; the screen withholds the result instead of falling back to raw bytes.
 * - `withheld`: the database withheld the revision from this reader; nothing of the result is shown.
 * - `ready`: the blocks of the revision, with its pins.
 * - `mismatch`: a requested revision that is not this execution's; the page answers as for a missing one.
 */
export type ExecutionRevisionState =
  | {readonly state: "absent" | "unavailable" | "withheld" | "mismatch"}
  | {readonly state: "ready"; readonly revision: ExecutionRevision};

const pinned = (traces: readonly string[], prefix: string) => {
  const values = traces.filter((trace) => trace.startsWith(prefix)).map((trace) => trace.slice(prefix.length));
  return values.length === 1 && /^[a-f0-9]{64}$/.test(values[0]!) ? values[0]! : null;
};

/** The state of one read, pure: serving, the execution the manifest names, the blocks and the pins. */
export function executionRevisionFromRead(read: ArtifactRead, executionId: string): ExecutionRevisionState {
  const serving = artifactServing(read);
  if (!serving.serve) return {state: "withheld"};
  const manifest = serving.revision.manifest;
  if (manifest.kind !== "execution_result" || manifest.execution?.executionId !== executionId) return {state: "unavailable"};
  const base = (prefix: string): ExecutionRevisionBase => ({
    revisionId: serving.revision.id,
    revisionNo: serving.revision.revisionNo,
    recordedAt: serving.revision.createdAt,
    freshness: read.freshness,
    pins: {resultFingerprint: manifest.execution!.resultFingerprint, packetFingerprint: pinned(manifest.traces, prefix), gatesFingerprint: pinned(manifest.traces, "execution-gates:")},
  });
  // The packet trace names the result's kind; each kind has exactly one reader of its blocks.
  if (pinned(manifest.traces, "investment-decision-packet:")) {
    const investment = readInvestmentDecisionPacketBlocks(serving.blocks);
    return investment ? {state: "ready", revision: {...base("investment-decision-packet:"), kind: "investment", investment}} : {state: "unavailable"};
  }
  if (pinned(manifest.traces, "financing-comparison-packet:")) {
    const comparison = readFinancingComparisonPacketBlocks(serving.blocks);
    return comparison ? {state: "ready", revision: {...base("financing-comparison-packet:"), kind: "comparison", comparison}} : {state: "unavailable"};
  }
  if (pinned(manifest.traces, "debt-capacity-packet:")) {
    const capacity = readDebtCapacityPacketBlocks(serving.blocks);
    return capacity ? {state: "ready", revision: {...base("debt-capacity-packet:"), kind: "capacity", capacity}} : {state: "unavailable"};
  }
  if (pinned(manifest.traces, "debt-table-packet:")) {
    const debtTable = readDebtTablePacketBlocks(serving.blocks);
    return debtTable ? {state: "ready", revision: {...base("debt-table-packet:"), kind: "debt_table", debtTable}} : {state: "unavailable"};
  }
  if (pinned(manifest.traces, "covenant-headroom-packet:")) {
    const covenantHeadroom = readCovenantHeadroomPacketBlocks(serving.blocks);
    return covenantHeadroom ? {state: "ready", revision: {...base("covenant-headroom-packet:"), kind: "covenant_headroom", covenantHeadroom}} : {state: "unavailable"};
  }
  if (pinned(manifest.traces, "weekly-cash-packet:")) {
    const weeklyCash = readWeeklyCashPacketBlocks(serving.blocks);
    return weeklyCash ? {state: "ready", revision: {...base("weekly-cash-packet:"), kind: "weekly_cash", weeklyCash}} : {state: "unavailable"};
  }
  if (pinned(manifest.traces, "operating-projection-packet:")) {
    const operatingProjection = readOperatingProjectionPacketBlocks(serving.blocks);
    return operatingProjection ? {state: "ready", revision: {...base("operating-projection-packet:"), kind: "operating_projection", operatingProjection}} : {state: "unavailable"};
  }
  if (pinned(manifest.traces, "projection-challenge-packet:")) {
    const projectionChallenge = readProjectionChallengePacketBlocks(serving.blocks);
    return projectionChallenge ? {state: "ready", revision: {...base("projection-challenge-packet:"), kind: "projection_challenge", projectionChallenge}} : {state: "unavailable"};
  }
  if (pinned(manifest.traces, "receivables-funding-packet:")) {
    const receivablesFunding = readReceivablesFundingPacketBlocks(serving.blocks);
    return receivablesFunding ? {state: "ready", revision: {...base("receivables-funding-packet:"), kind: "receivables_funding", receivablesFunding}} : {state: "unavailable"};
  }
  if (pinned(manifest.traces, "quarter-update-packet:")) {
    const quarterUpdate = readQuarterUpdatePacketBlocks(serving.blocks);
    return quarterUpdate ? {state: "ready", revision: {...base("quarter-update-packet:"), kind: "quarter_update", quarterUpdate}} : {state: "unavailable"};
  }
  // Lote 4: each packet's trace names its schema without the version suffix.
  if (pinned(manifest.traces, "document-folder-inventory-packet:")) {
    const documentFolder = readDocumentFolderPacketBlocks(serving.blocks);
    return documentFolder ? {state: "ready", revision: {...base("document-folder-inventory-packet:"), kind: "document_folder", documentFolder}} : {state: "unavailable"};
  }
  if (pinned(manifest.traces, "received-proposal-packet:")) {
    const receivedProposal = readReceivedProposalPacketBlocks(serving.blocks);
    return receivedProposal ? {state: "ready", revision: {...base("received-proposal-packet:"), kind: "received_proposal", receivedProposal}} : {state: "unavailable"};
  }
  if (pinned(manifest.traces, "capital-structure-paths-packet:")) {
    const financingPaths = readFinancingPathsPacketBlocks(serving.blocks);
    return financingPaths ? {state: "ready", revision: {...base("capital-structure-paths-packet:"), kind: "financing_paths", financingPaths}} : {state: "unavailable"};
  }
  if (pinned(manifest.traces, "board-capital-discussion-packet:")) {
    const boardMaterial = readBoardMaterialPacketBlocks(serving.blocks);
    return boardMaterial ? {state: "ready", revision: {...base("board-capital-discussion-packet:"), kind: "board_material", boardMaterial}} : {state: "unavailable"};
  }
  const blocks = readCapitalProcedurePacketBlocks(serving.blocks);
  if (!blocks) return {state: "unavailable"};
  return {state: "ready", revision: {...base("capital-procedure-packet:"), blocks}};
}

/**
 * The head revision of the execution's result, or the exact one a link names. A named revision that
 * does not resolve to this execution's result is a mismatch; the head that does not exist is absent.
 */
export async function loadExecutionRevision(supabase: SupabaseClient<Database>, input: {workId: string; executionId: string; revisionId?: string | null}): Promise<ExecutionRevisionState> {
  const target = {workId: input.workId, kind: "execution_result" as const, subject: executionResultSubject(input.executionId)};
  if (input.revisionId) {
    const exact = await readArtifactRevision(supabase, {revisionId: input.revisionId});
    if (!exact.ok) return exact.error === "artifact_revision_not_found" ? {state: "mismatch"} : {state: "unavailable"};
    return revisionBelongsTo(exact.read, target) ? executionRevisionFromRead(exact.read, input.executionId) : {state: "mismatch"};
  }
  const head = await readArtifactHead(supabase, target);
  if (!head.ok) return head.error === "artifact_revision_not_found" ? {state: "absent"} : {state: "unavailable"};
  return executionRevisionFromRead(head.read, input.executionId);
}

/** Where a conversation answer that cites an execution result links: the execution's screen on the exact revision it cited. */
export function executionResultHref(locale: string, workId: string, citation: Pick<ExecutionResultCitation, "executionId" | "revisionId">): string {
  return `/${locale}/app/projects/${workId}/executions/${citation.executionId}?revision=${citation.revisionId}`;
}
