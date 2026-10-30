import {z} from "zod";
import {calculateOriginatorOwnership, normalizeOriginatorNumber, receivablesDaysBetween, type OriginatorOwnershipNode} from "@offroad/financial-core";
import {originatorSourceReferenceSchema, originatorLiteralInQuote, assertOriginatorSourceVersions} from "./originator-evidence";
export {originatorSourceReferenceSchema} from "./originator-evidence";

const key = z.string().trim().min(1).max(160), text = z.string().trim().min(1).max(4000);
const shareholder = z.strictObject({holderId: key, shareLiteral: z.string().trim().min(1).max(100), notation: z.enum(["brazilian_document", "decimal_notation"]), ratioConvention: z.enum(["percent", "fraction"]).nullable()});
export const originatorRegistryFactsSchema = z.strictObject({
  asOf: z.iso.date(), rootEntityId: key,
  sources: z.array(originatorSourceReferenceSchema).max(1000),
  nodes: z.array(z.strictObject({id: key, label: text, kind: z.enum(["person", "entity"]), sourceId: key, shareholders: z.array(shareholder).max(1000).nullable()})).min(1).max(1000),
  requestedAction: z.enum(["receivables_assignment", "guarantee", "borrowing"]),
  powers: z.array(z.strictObject({id: key, sourceId: key, entityId: key, action: z.enum(["receivables_assignment", "guarantee", "borrowing"]), signatoryIds: z.array(key).min(1).max(50), signingMode: z.enum(["all", "any"]), validFrom: z.iso.date(), validUntil: z.iso.date().nullable(), supersededBy: key.nullable(), viaProxy: z.boolean()})).max(500),
  /** The selected texts in force are confirmed in the premise card, not chosen from file names. */
  inForcePowerIds: z.array(key).max(50),
  screeningPolicy: z.array(z.strictObject({kind: z.enum(["pep", "sanctions", "litigation", "negative_news"]), roles: z.array(z.enum(["cedent", "beneficial_owner", "signatory"])).min(1).max(3), maxAgeDays: z.number().int().min(0).max(3650)})).max(12).nullable(),
  checks: z.array(z.strictObject({id: key, kind: z.enum(["pep", "sanctions", "litigation", "negative_news"]), requestedSubjectId: key, reportedSubjectId: key.nullable(), identityConfirmed: z.boolean(), sourceId: key, result: z.enum(["no_hit_reported", "hit_reported", "inconclusive"]), disposition: text.nullable()})).max(10000),
});
export type OriginatorRegistryFacts = z.infer<typeof originatorRegistryFactsSchema>;

/** Documentary findings support the registry officer's decision. They do not approve a company. */
export function reviewOriginatorRegistry(raw: unknown) {
  const f = originatorRegistryFactsSchema.parse(raw);
  assertOriginatorSourceVersions(f.sources);
  const sources = new Map(f.sources.map(s => [s.id, s]));
  if (sources.size !== f.sources.length || new Set(f.nodes.map(n => n.id)).size !== f.nodes.length || new Set(f.powers.map(p => p.id)).size !== f.powers.length || new Set(f.checks.map(c => c.id)).size !== f.checks.length) throw new Error("originator_registry_duplicate_record");
  const sourceOf = (id: string) => {const source = sources.get(id); if (!source) throw new Error("originator_registry_source_missing"); if (source.consultedAt > f.asOf) throw new Error("originator_registry_future_source"); return source;};
  const gaps: Array<{code: string; subjectId: string | null; sourceId: string | null}> = [];
  const findings: Array<{code: string; subjectId: string | null; sourceId: string; detail: string | null}> = [];
  const traces: ReturnType<typeof normalizeOriginatorNumber>["trace"][] = [];
  const nodes: OriginatorOwnershipNode[] = [];
  for (const node of f.nodes) {
    const source = sourceOf(node.sourceId);
    if (node.kind === "person" && node.shareholders?.length) throw new Error("originator_registry_person_has_shareholders");
    const shareholders: NonNullable<OriginatorOwnershipNode["shareholders"]>[number][] = [];
    let complete = node.shareholders !== null;
    for (const edge of node.shareholders ?? []) {
      if (!originatorLiteralInQuote(edge.shareLiteral, source.quote)) {gaps.push({code: "ownership_literal_not_in_quote", subjectId: edge.holderId, sourceId: source.id}); complete = false; continue;}
      try {
        const value = normalizeOriginatorNumber({literal: edge.shareLiteral, notation: edge.notation, unit: "ratio", currency: null, declaredScale: null, representation: null, ratioConvention: edge.ratioConvention});
        shareholders.push({holderId: edge.holderId, share: value.value}); traces.push(value.trace);
      } catch {gaps.push({code: "ownership_share_unresolved", subjectId: edge.holderId, sourceId: source.id}); complete = false;}
    }
    nodes.push({id: node.id, kind: node.kind, shareholders: complete ? shareholders : null});
  }
  const ownership = calculateOriginatorOwnership({rootEntityId: f.rootEntityId, nodes});
  for (const unresolved of ownership.unresolved) gaps.push({code: `ownership_${unresolved.reason}`, subjectId: unresolved.entityId, sourceId: f.nodes.find(n => n.id === unresolved.entityId)?.sourceId ?? null});
  const powers = new Map(f.powers.map(p => [p.id, p]));
  if (new Set(f.inForcePowerIds).size !== f.inForcePowerIds.length) throw new Error("originator_registry_power_selection_duplicate");
  const validPowers: typeof f.powers = [];
  for (const p of f.powers) {
    sourceOf(p.sourceId);
    if (p.validUntil !== null && p.validUntil < p.validFrom) throw new Error("originator_registry_power_dates_invalid");
    if (p.supersededBy !== null) {
      const successor = powers.get(p.supersededBy);
      if (!successor || successor.entityId !== p.entityId || successor.action !== p.action || successor.validFrom < p.validFrom) throw new Error("originator_registry_power_successor_invalid");
    }
    if (p.validUntil !== null && p.validUntil < f.asOf) findings.push({code: p.viaProxy ? "proxy_expired" : "power_expired", subjectId: p.entityId, sourceId: p.sourceId, detail: p.id});
  }
  for (const id of f.inForcePowerIds) {
    const p = powers.get(id); if (!p) throw new Error("originator_registry_selected_power_missing");
    if (p.entityId !== f.rootEntityId || p.action !== f.requestedAction) {gaps.push({code: "power_scope_mismatch", subjectId: p.entityId, sourceId: p.sourceId}); continue;}
    if (p.validFrom > f.asOf || (p.validUntil !== null && p.validUntil < f.asOf)) {gaps.push({code: "selected_power_outside_validity", subjectId: p.entityId, sourceId: p.sourceId}); continue;}
    if (p.supersededBy !== null && powers.get(p.supersededBy)!.validFrom <= f.asOf) {gaps.push({code: "selected_power_superseded", subjectId: p.entityId, sourceId: p.sourceId}); continue;}
    if (p.signatoryIds.some(id => !f.nodes.some(n => n.id === id && n.kind === "person"))) {gaps.push({code: "signatory_identity_missing", subjectId: p.entityId, sourceId: p.sourceId}); continue;}
    validPowers.push(p);
  }
  if (!validPowers.length) gaps.push({code: "current_signing_powers_missing", subjectId: f.rootEntityId, sourceId: null});
  const signatures = new Set(validPowers.map(p => JSON.stringify({mode: p.signingMode, people: [...p.signatoryIds].sort()})));
  if (signatures.size > 1) gaps.push({code: "signing_powers_conflict", subjectId: f.rootEntityId, sourceId: null});
  const selected = new Set(f.inForcePowerIds);
  for (const p of f.powers) if (!selected.has(p.id) && p.entityId === f.rootEntityId && p.action === f.requestedAction && p.validFrom <= f.asOf && (p.validUntil === null || p.validUntil >= f.asOf) && (p.supersededBy === null || powers.get(p.supersededBy)!.validFrom > f.asOf)) {
    if (validPowers.some(v => JSON.stringify({mode: v.signingMode, people: [...v.signatoryIds].sort()}) !== JSON.stringify({mode: p.signingMode, people: [...p.signatoryIds].sort()}))) gaps.push({code: "unresolved_competing_power", subjectId: f.rootEntityId, sourceId: p.sourceId});
  }
  const signatories = [...new Set(validPowers.flatMap(p => p.signatoryIds))].sort();
  const readings = f.checks.map(c => {
    sourceOf(c.sourceId);
    if (!f.nodes.some(n => n.id === c.requestedSubjectId)) throw new Error("originator_registry_screening_subject_unknown");
    const attributed = c.identityConfirmed && c.reportedSubjectId !== null && c.reportedSubjectId === c.requestedSubjectId;
    if (!attributed) findings.push({code: "screening_not_attributed", subjectId: c.requestedSubjectId, sourceId: c.sourceId, detail: c.id});
    if (attributed && c.result === "hit_reported") findings.push({code: "reported_hit_for_responsible_review", subjectId: c.requestedSubjectId, sourceId: c.sourceId, detail: c.disposition});
    return {id: c.id, kind: c.kind, subjectId: c.requestedSubjectId, sourceId: c.sourceId, attributed, result: c.result, disposition: c.disposition};
  });
  if (f.screeningPolicy === null || !f.screeningPolicy.length) gaps.push({code: "screening_policy_missing", subjectId: null, sourceId: null});
  const requirements = new Map<string, {kind: NonNullable<typeof f.screeningPolicy>[number]["kind"]; subjectId: string; maxAgeDays: number}>();
  for (const rule of f.screeningPolicy ?? []) {
    const subjects = new Set(rule.roles.flatMap(role => role === "cedent" ? [f.rootEntityId] : role === "beneficial_owner" ? ownership.resolvedPersons.map(p => p.personId) : signatories));
    for (const subjectId of subjects) {
      const key = `${rule.kind}:${subjectId}`, old = requirements.get(key);
      requirements.set(key, {kind: rule.kind, subjectId, maxAgeDays: Math.min(old?.maxAgeDays ?? rule.maxAgeDays, rule.maxAgeDays)});
    }
  }
  for (const requirement of requirements.values()) {
    const matches = readings.filter(c => c.kind === requirement.kind && c.subjectId === requirement.subjectId && c.attributed && c.result !== "inconclusive");
    const fresh = matches.filter(c => receivablesDaysBetween(sourceOf(c.sourceId).consultedAt as Parameters<typeof receivablesDaysBetween>[0], f.asOf as Parameters<typeof receivablesDaysBetween>[1]) <= requirement.maxAgeDays);
    if (!fresh.length) gaps.push({code: matches.length ? "screening_stale" : "screening_missing_or_unattributed", subjectId: requirement.subjectId, sourceId: null});
    if (fresh.some(c => c.result === "hit_reported" && c.disposition === null)) gaps.push({code: "reported_hit_disposition_missing", subjectId: requirement.subjectId, sourceId: fresh.find(c => c.result === "hit_reported" && c.disposition === null)!.sourceId});
    if (fresh.some(c => c.result === "hit_reported") && fresh.some(c => c.result === "no_hit_reported")) gaps.push({code: "screening_results_conflict", subjectId: requirement.subjectId, sourceId: null});
  }
  return {schemaVersion: "originator-registry-documentary-review.v1" as const, executorVersion: "2026.10.30-v1" as const, asOf: f.asOf, rootEntityId: f.rootEntityId,
    ownership, signing: {status: validPowers.length && signatures.size === 1 && !gaps.some(g => g.code.includes("power") || g.code === "signatory_identity_missing") ? "documented" as const : "pending" as const, action: f.requestedAction, powers: validPowers.map(p => ({id: p.id, signingMode: p.signingMode, signatoryIds: p.signatoryIds, sourceId: p.sourceId})), signatoryIds: signatories},
    screenings: readings, gaps, findings, sources: f.sources, traces: [...traces, ...ownership.traces],
    status: gaps.length ? "pending_evidence" as const : "prepared_for_registry_decision" as const,
    decisions: {registry: "pending_human_decision" as const, credit: "outside_scope" as const, operation: "not_authorized" as const},
    documentsAuthenticated: false as const, liveQueriesPerformedByThisExecutor: false as const};
}
