type ReviewedBrief = {briefId: string; fingerprint: string};

/** A lost reply can outlive a refreshed brief. Retain the reviewed predecessor in memory so
 * retry reaches the original idempotent command instead of creating a second work request. */
export function createDocumentaryRequestBindings() {
  const attempts = new Map<string, ReviewedBrief>();
  return {
    forRequest(content: string, current: ReviewedBrief): ReviewedBrief {
      const existing = attempts.get(content);
      if (existing) return existing;
      const pinned = {...current};
      attempts.set(content, pinned);
      return pinned;
    },
    rejected(content: string, error: string) {
      // A returned stale response means the atomic RPC rolled back. Rebind after refresh;
      // uncertain transport failures must keep the predecessor for idempotent replay.
      if (error === "stale") attempts.delete(content);
    },
    accepted(content: string) { attempts.delete(content); },
  };
}
