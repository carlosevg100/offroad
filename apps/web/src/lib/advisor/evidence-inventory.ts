export type EvidenceRequirement = {id: string; requirement_key: string; label: string; status: string; materiality: string; missing_reason: string | null};
export type ExpectedRequirement = {key: string; label: string; materiality: string};

/** An expected but unassessed dimension is not a missing-document finding. Preserve that
 * distinction and include every open assessment rather than silently truncating the first six. */
export function openEvidenceRequirements(expected: readonly ExpectedRequirement[], assessed: readonly EvidenceRequirement[]) {
  const keys = new Set(assessed.map((item) => item.requirement_key));
  const rank: Record<string, number> = {blocking: 0, high: 1, medium: 2, low: 3};
  return [
    ...assessed.filter((item) => ["missing", "partial", "conflicting", "unavailable"].includes(item.status))
      .map((item) => ({id: item.id, label: item.label, status: item.status, materiality: item.materiality, reason: item.missing_reason})),
    ...expected.filter((item) => !keys.has(item.key))
      .map((item) => ({id: `unexamined:${item.key}`, label: item.label, status: "not_examined", materiality: item.materiality, reason: null})),
  ].sort((a, b) => (rank[a.materiality] ?? 9) - (rank[b.materiality] ?? 9));
}
