import type {ArtifactReview, ExactReviewTarget} from "./review-protocol";

/** An act addresses one tenant/work/artifact/revision/audience; a matching byte hash alone is insufficient. */
export function approvalCoversRevision(target: ExactReviewTarget, approval: ArtifactReview, history: readonly ArtifactReview[]): boolean {
  const matches = (other: ExactReviewTarget) => (Object.keys(target) as (keyof ExactReviewTarget)[]).every((key) => target[key] === other[key]);
  if ((approval.act !== "approve" && approval.act !== "reaffirm") || !matches(approval.target)) return false;
  if (history.some((act) => act.act === "revoke_approval" && act.basisReviewId === approval.id && matches(act.target))) return false;
  if (approval.act === "approve") return true;
  const visited = new Set<string>([approval.id]);
  let candidate = approval;
  while (candidate.act === "reaffirm") {
    // SQL checks cardinality(visited) >= 128 before accepting the base approval: at most
    // 127 reaffirmations may precede it. Our set also contains the current candidate.
    if (visited.size >= 128 || candidate.changeReport?.outcome !== "cosmetic" || candidate.basisReviewId === null || visited.has(candidate.basisReviewId)) return false;
    const base = history.find((act) => act.id === candidate.basisReviewId);
    if (!base || base.target.organizationId !== target.organizationId || base.target.workId !== target.workId
      || base.target.artifactId !== target.artifactId || base.target.audience !== target.audience
      || base.target.revisionId === candidate.target.revisionId
      || history.some((act) => act.act === "revoke_approval" && act.basisReviewId === base.id
        && act.target.organizationId === base.target.organizationId && act.target.revisionId === base.target.revisionId)) return false;
    visited.add(base.id); candidate = base;
  }
  return candidate.act === "approve";
}
