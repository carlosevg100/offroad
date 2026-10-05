import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import type {Database} from "@/types/database";
import type {ArtifactImportReviewView} from "@/components/advisor/artifact-import-review";
import {readArtifactRevision} from "./authorized-artifact-reader";

import {artifactImportCandidateSchema, type ArtifactImportCandidate} from "./artifact-import-schema";
export {artifactImportCandidateSchema, type ArtifactImportCandidate} from "./artifact-import-schema";
const uuid = z.uuid();
/** RPCs are new stage-21 contracts, kept explicit until regeneration of the catalogue types. */
export type ArtifactImportRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{data: unknown; error: {code?: string; message?: string} | null}>;
export function artifactImportRpc(client: SupabaseClient<Database>): ArtifactImportRpc {return (name, args) => (client as SupabaseClient).rpc(name, args);}
export async function readArtifactImport(client: SupabaseClient<Database>, input: {candidateId: string; artifactId: string; workId?: string}) {
  if (!uuid.safeParse(input.candidateId).success || !uuid.safeParse(input.artifactId).success) return null;
  const result = await artifactImportRpc(client)("read_artifact_import_candidate_v1", {p_candidate_id: input.candidateId});
  const parsed = artifactImportCandidateSchema.safeParse(result.data);
  if (result.error || !parsed.success || parsed.data.candidateId !== input.candidateId || input.workId && parsed.data.workId !== input.workId) return null;
  if ("artifactId" in parsed.data && parsed.data.artifactId !== input.artifactId) return null;
  return parsed.data;
}
export async function artifactImportReviewView(client: SupabaseClient<Database>, candidate: ArtifactImportCandidate, viewerId: string): Promise<ArtifactImportReviewView | null> {
  if (candidate.withheld) return {id: candidate.candidateId, status: candidate.status, base: null, head: null, items: [], canApply: false, canDiscard: false, requiresDeclaration: false, selfApprovalForbidden: false};
  const read = async (id: string | null) => {
    if (!id) return null;
    const result = await readArtifactRevision(client, {revisionId: id});
    if (!result.ok || result.read.withheld || result.read.artifact.id !== candidate.artifactId || result.read.artifact.workId !== candidate.workId) return null;
    return {revisionNo: result.read.summary.revisionNo, createdAt: result.read.summary.createdAt, title: result.read.artifact.subject};
  };
  const [base, head] = await Promise.all([read(candidate.baseRevisionId), read(candidate.currentHeadRevisionId)]);
  if (!head || candidate.baseRevisionId && !base) return null;
  const current = candidate.comparedHeadRevisionId === candidate.currentHeadRevisionId;
  return {id: candidate.candidateId, status: current || ["queued", "applied", "discarded"].includes(candidate.status) ? candidate.status : "stale", base, head,
    items: (candidate.comparison?.differences ?? []).map(item => ({key: item.key, classification: item.classification,
      base: item.base?.value ?? null, received: item.received?.value ?? null, current: item.current?.value ?? null,
      detachedClaimIds: candidate.contributions?.blockProposals.find(proposal => proposal.blockKey === item.base?.blockKey)?.detachedClaimIds ?? []})),
    // Database is still the authority. Declaration/assignments are loaded by the review container;
    // a candidate read on its own never grants an adoption button.
    canApply: candidate.viewerId === viewerId && candidate.canApply && current && (!candidate.policy.assignmentRequired || candidate.policy.roles.includes("approver")) && (candidate.preparedBy !== viewerId || candidate.policy.selfApprovalAllowed),
    canDiscard: candidate.viewerId === viewerId && candidate.canDiscard, requiresDeclaration: candidate.preparedBy === viewerId && candidate.policy.selfApprovalAllowed, selfApprovalForbidden: candidate.preparedBy === viewerId && !candidate.policy.selfApprovalAllowed};
}
export const artifactImportError = (code?: string): "denied" | "changed" | "save" => code === "42501" || code === "P0002" ? "denied" : ["22023", "23505", "40001", "55000"].includes(code ?? "") ? "changed" : "save";
