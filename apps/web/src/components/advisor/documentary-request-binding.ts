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
    accepted(content: string) { attempts.delete(content); },
  };
}
