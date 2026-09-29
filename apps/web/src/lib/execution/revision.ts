import "server-only";

import {readCapitalProcedurePacketBlocks, type ExecutionResultBlocksView, type ExecutionResultCitation, type Freshness} from "@offroad/domain-contracts";
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
export type ExecutionRevision = {
  readonly revisionId: string;
  readonly revisionNo: number;
  readonly recordedAt: string;
  readonly freshness: Freshness;
  readonly pins: ExecutionRevisionPins;
  readonly blocks: ExecutionResultBlocksView;
};

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
  const blocks = readCapitalProcedurePacketBlocks(serving.blocks);
  if (!blocks) return {state: "unavailable"};
  return {state: "ready", revision: {
    revisionId: serving.revision.id,
    revisionNo: serving.revision.revisionNo,
    recordedAt: serving.revision.createdAt,
    freshness: read.freshness,
    pins: {resultFingerprint: manifest.execution.resultFingerprint, packetFingerprint: pinned(manifest.traces, "capital-procedure-packet:"), gatesFingerprint: pinned(manifest.traces, "execution-gates:")},
    blocks,
  }};
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
