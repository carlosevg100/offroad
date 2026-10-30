import type {OriginatorRegistryFacts} from "./originator-registry";

/** Explicit synthetic documentary reports; no live query is represented by this fixture. */
export function originatorRegistryFixture(): OriginatorRegistryFacts {
  const identity = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
  const source = (id: string, n: number, quote: string) => ({id, documentId: identity(n), sourceVersionId: identity(n + 100), sha256: String(n).repeat(64).slice(0, 64), anchor: "page:1", quote, origin: "provided_document" as const, consultedAt: "2026-10-29"});
  return {
    asOf: "2026-10-29", rootEntityId: "cedent", requestedAction: "receivables_assignment",
    sources: [source("articles", 1, "Person A: 60%. Holding: 40%."), source("holding-articles", 2, "Person B: 75%. Person C: 25%."), source("identities", 3, "Identities of the three synthetic individuals."), source("old-power", 4, "Person A signs individually."), source("current-power", 5, "Person A and Person B sign jointly for receivables assignments."), source("expired-proxy", 6, "Proxy for Person C expired on 2026-09-30."), source("reports", 7, "Synthetic reports identify the exact legal and natural persons, their query dates and reported results.")],
    nodes: [
      {id: "cedent", label: "Synthetic cedent", kind: "entity", sourceId: "articles", shareholders: [{holderId: "person-a", shareLiteral: "60%", notation: "brazilian_document", ratioConvention: null}, {holderId: "holding", shareLiteral: "40%", notation: "brazilian_document", ratioConvention: null}]},
      {id: "holding", label: "Synthetic holding", kind: "entity", sourceId: "holding-articles", shareholders: [{holderId: "person-b", shareLiteral: "75%", notation: "brazilian_document", ratioConvention: null}, {holderId: "person-c", shareLiteral: "25%", notation: "brazilian_document", ratioConvention: null}]},
      ...["person-a", "person-b", "person-c"].map(id => ({id, label: "Synthetic " + id, kind: "person" as const, sourceId: "identities", shareholders: null})),
    ],
    powers: [
      {id: "old", sourceId: "old-power", entityId: "cedent", action: "receivables_assignment", signatoryIds: ["person-a"], signingMode: "any", validFrom: "2021-01-01", validUntil: null, supersededBy: "current", viaProxy: false},
      {id: "current", sourceId: "current-power", entityId: "cedent", action: "receivables_assignment", signatoryIds: ["person-a", "person-b"], signingMode: "all", validFrom: "2026-08-01", validUntil: null, supersededBy: null, viaProxy: false},
      {id: "proxy", sourceId: "expired-proxy", entityId: "cedent", action: "receivables_assignment", signatoryIds: ["person-c"], signingMode: "any", validFrom: "2026-01-01", validUntil: "2026-09-30", supersededBy: null, viaProxy: true},
    ],
    inForcePowerIds: ["current"],
    screeningPolicy: [
      {kind: "pep", roles: ["beneficial_owner", "signatory"], maxAgeDays: 30},
      {kind: "sanctions", roles: ["cedent", "beneficial_owner", "signatory"], maxAgeDays: 30},
      {kind: "litigation", roles: ["cedent"], maxAgeDays: 30},
      {kind: "negative_news", roles: ["cedent", "beneficial_owner"], maxAgeDays: 30},
    ],
    checks: ["pep", "sanctions", "litigation", "negative_news"].flatMap(kind => (kind === "litigation" ? ["cedent"] : kind === "pep" ? ["person-a", "person-b", "person-c"] : ["cedent", "person-a", "person-b", "person-c"]).map(subjectId => ({id: kind + ":" + subjectId, kind: kind as "pep" | "sanctions" | "litigation" | "negative_news", requestedSubjectId: subjectId, reportedSubjectId: subjectId, identityConfirmed: true, sourceId: "reports", result: "no_hit_reported" as const, disposition: null}))),
  };
}
