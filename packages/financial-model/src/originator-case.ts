import {createHash} from "node:crypto";
import {z} from "zod";
import {readContextualBasis, adoptionBasisEntrySchema} from "@offroad/reconciliation";
import {adoptedAnalysisContextSchema, createAnalysisBinding} from "./adopted-analysis-binding";
import {adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {capacityUuid} from "./debt-capacity-premises";
import type {ProposedHypothesis} from "./investment-premises";
import {originatorCreditReviewFactsSchema, reviewOriginatorCredit} from "./originator-credit-review";
import {originatorRegistryFactsSchema, reviewOriginatorRegistry} from "./originator-registry";
import {originatorCreditReviewResultSchema, originatorRegistryResultSchema} from "./originator-result-schemas";
import {originatorKitFactsSchema, originatorKitResultSchema, reviewOriginatorKit} from "./originator-kit";

const key = z.string().regex(/^[a-z][a-z0-9-]{0,60}$/), hash = z.string().regex(/^[a-f0-9]{64}$/), text = z.string().trim().min(1).max(2000);
export const originatorCaseKinds = ["kit", "credit", "registry"] as const;
const kind = z.enum(originatorCaseKinds);
const origins = ["document", "informed", "house", "estimate"] as const;
const originLabels = {document: "documento", informed: "informado", house: "premissa da casa", estimate: "estimativa"};
const sectionOrigin = z.strictObject({origin: z.enum(origins), source: text});
const context = z.strictObject({caseId: z.uuid(), entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/), openingDate: z.iso.date(), readingDate: z.iso.date(), definitionVersionId: z.uuid()});
export const originatorCaseFactsSchema = z.discriminatedUnion("kind", [
  context.safeExtend({kind: z.literal("kit"), facts: originatorKitFactsSchema, sectionOrigins: z.record(z.string(), sectionOrigin)}),
  context.safeExtend({kind: z.literal("credit"), facts: originatorCreditReviewFactsSchema, sectionOrigins: z.record(z.string(), sectionOrigin)}),
  context.safeExtend({kind: z.literal("registry"), facts: originatorRegistryFactsSchema, sectionOrigins: z.record(z.string(), sectionOrigin)}),
]);
export type OriginatorCaseFacts = z.infer<typeof originatorCaseFactsSchema>;
const json = z.string().min(2).max(3000000).transform((s, c) => {try {return JSON.parse(s) as unknown;} catch {c.addIssue({code: "custom", message: "originator_record_not_json"}); return z.NEVER;}});
const schemas = {kit: originatorKitFactsSchema, credit: originatorCreditReviewFactsSchema, registry: originatorRegistryFactsSchema};
const recordValue = z.strictObject({section: z.string().regex(/^[a-z][a-zA-Z0-9]{0,80}$/), value: json});
const record = z.strictObject({id: key, value: adoptedValueSelectionSchema});
export const adoptedOriginatorCaseSchema = adoptedAnalysisContextSchema.safeExtend({kind, analysisId: z.uuid(), scenario: text, order: adoptedValueSelectionSchema, records: z.array(record).min(1).max(255)});
const root = (k: z.infer<typeof kind>, id: string) => `originator_${k}.${id}.`;
export const originatorCaseAnalysisId = (caseId: string, k: z.infer<typeof kind>) => capacityUuid(`offroad:originator:${k}:${caseId}:analysis`);
const sectionId = (name: string) => name.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)])) : v;
const fingerprint = (v: unknown) => createHash("sha256").update(JSON.stringify(canon(v))).digest("hex");

/** A section has a separate visible origin. The request, fund policy and inter-source links require
 * confirmation just as the documentary readings do; proposing these hypotheses adopts nothing. */
export function proposeOriginatorCaseHypotheses(raw: unknown): ProposedHypothesis[] {
  const input = originatorCaseFactsSchema.parse(raw), schema = schemas[input.kind];
  if (input.openingDate >= input.readingDate || (input.kind === "credit" ? input.facts.analysisDate : input.kind === "kit" ? input.facts.inventory.asOf : input.facts.asOf) !== input.readingDate) throw new Error("originator_case_reading_window_conflict");
  if (input.kind === "credit" && (input.facts.currency !== input.currency || input.facts.perimeter !== input.perimeter)) throw new Error("originator_case_financial_scope_conflict");
  const prefix = root(input.kind, originatorCaseAnalysisId(input.caseId, input.kind));
  const dimensions: ProposedHypothesis["dimensions"] = {entityId: input.entityId, perimeter: input.perimeter, currency: input.currency, periodStart: input.openingDate, periodEnd: input.readingDate, unit: "identity", scale: "1", scenario: "base", definitionVersionId: input.definitionVersionId};
  const names = Object.keys(schema.shape);
  if (Object.keys(input.sectionOrigins).some(n => !names.includes(n))) throw new Error("originator_unknown_section_origin");
  const out: ProposedHypothesis[] = names.map(name => {
    const origin = input.sectionOrigins[name];
    if (!origin) throw new Error("originator_section_origin_missing");
    if ((name === "sources" || name === "contexts") && origin.origin !== "document") throw new Error("originator_source_reading_requires_document_origin");
    const value = (input.facts as Record<string, unknown>)[name];
    return {fieldPath: prefix + "record." + sectionId(name), dimensions, value: {type: "text", value: JSON.stringify({section: name, value: JSON.stringify(value)})}, reason: `Origem: ${originLabels[origin.origin]}. ${origin.source}`};
  });
  out.push({fieldPath: prefix + "order", dimensions, value: {type: "list", value: names.map(sectionId)}, reason: "Origem: premissa da casa. Ordem completa dos registros do caso; nenhum registro adotado pode ser omitido."});
  // This is the immutable working-basis limit, not a reason to silently truncate a source.
  // Leave room for the immutable decision, actor and snapshot metadata under the 1 MiB envelope.
  if (out.length > 256 || JSON.stringify(out).length > 900000) throw new Error("originator_case_above_working_basis_limit");
  return out;
}

const bound = z.strictObject({envelope: adoptedAnalysisContextSchema.shape.envelope, scope: adoptedAnalysisContextSchema.shape.scope});
export const boundOriginatorCaseSchema = bound.safeExtend({kind, question: text});
export const originatorCasePacketInputSchema = z.strictObject({schemaVersion: z.literal("originator-case-packet-input.v1"), question: text, analysis: adoptedOriginatorCaseSchema});
export function composeBoundOriginatorCase(raw: unknown) {
  const input = boundOriginatorCaseSchema.parse(raw), basis = readContextualBasis(input.envelope, input.scope);
  const regex = new RegExp(`^originator_${input.kind}\\.([0-9a-f-]{36})\\.`);
  const entries = basis.entries.filter(e => regex.test(e.fieldPath));
  const ids = [...new Set(entries.map(e => regex.exec(e.fieldPath)![1]!))];
  if (ids.length !== 1) throw new Error("originator_case_analysis_missing_or_ambiguous");
  const prefix = root(input.kind, ids[0]!), anchor = entries.find(e => e.fieldPath === prefix + "order");
  if (!anchor) throw new Error("originator_case_order_missing");
  const d = anchor.dimensions;
  function selection(path: string): z.infer<typeof adoptedValueSelectionSchema> {
    const matches = entries.filter(e => e.fieldPath === prefix + path);
    if (matches.length === 1) {const e = matches[0]!; return {decisionId: e.decisionId, definitionVersionId: e.dimensions.definitionVersionId!, definitionKind: e.definitionKind, missingReason: null};}
    return {decisionId: null, definitionVersionId: d.definitionVersionId!, definitionKind: anchor!.definitionKind, missingReason: matches.length ? "More than one contribution adopted for the record" : "Record not adopted"};
  }
  const names = Object.keys(schemas[input.kind].shape).map(sectionId);
  if (entries.some(e => e.fieldPath !== prefix + "order" && !names.some(n => e.fieldPath === prefix + "record." + n))) throw new Error("originator_case_unknown_adopted_record");
  return originatorCasePacketInputSchema.parse({schemaVersion: "originator-case-packet-input.v1", question: input.question,
    analysis: {envelope: input.envelope, scope: input.scope, kind: input.kind, analysisId: ids[0], scenario: d.scenario, entityId: d.entityId, perimeter: d.perimeter, currency: d.currency, openingDate: d.periodStart, endDate: d.periodEnd, numericInterpretations: [], order: selection("order"), records: names.map(id => ({id, value: selection("record." + id)}))}});
}

const binding = z.strictObject({operand: text, decisionId: z.uuid().nullable(), interpretationDecisionIds: z.array(z.uuid())});
export const originatorCasePacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("originator-case-packet.v1"), executorVersion: z.literal("2026.10.30-v1"), kind, question: text,
  analysisId: z.uuid(), scope: adoptedAnalysisContextSchema.shape.scope, entityId: z.uuid(), basisFingerprint: hash,
  credit: originatorCreditReviewResultSchema.nullable(), registry: originatorRegistryResultSchema.nullable(),
  kit: originatorKitResultSchema.nullable(),
  gaps: z.array(z.strictObject({operand: text, reason: text})), bindings: z.array(binding), contributions: z.array(adoptionBasisEntrySchema),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]), grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
export type OriginatorCasePacket = z.infer<typeof originatorCasePacketOutputSchema>;

export const originatorKitPacketInputSchema = originatorCasePacketInputSchema.safeExtend({analysis: adoptedOriginatorCaseSchema.safeExtend({kind: z.literal("kit")})});
export const originatorCreditPacketInputSchema = originatorCasePacketInputSchema.safeExtend({analysis: adoptedOriginatorCaseSchema.safeExtend({kind: z.literal("credit")})});
export const originatorRegistryPacketInputSchema = originatorCasePacketInputSchema.safeExtend({analysis: adoptedOriginatorCaseSchema.safeExtend({kind: z.literal("registry")})});
export const originatorKitPacketOutputSchema = originatorCasePacketOutputSchema.safeExtend({kind: z.literal("kit"), credit: z.null(), registry: z.null()});
export const originatorCreditPacketOutputSchema = originatorCasePacketOutputSchema.safeExtend({kind: z.literal("credit"), kit: z.null(), registry: z.null()});
export const originatorRegistryPacketOutputSchema = originatorCasePacketOutputSchema.safeExtend({kind: z.literal("registry"), kit: z.null(), credit: z.null()});

export function verifyOriginatorCasePacket(raw: unknown): OriginatorCasePacket {
  const p = originatorCasePacketOutputSchema.parse(raw), {fingerprint: named, ...body} = p;
  if (fingerprint(body) !== named) throw new Error("originator_packet_fingerprint_mismatch");
  if ((p.kind !== "credit" && p.credit !== null) || (p.kind !== "kit" && p.kit !== null) || (p.kind !== "registry" && p.registry !== null)) throw new Error("originator_packet_result_kind_conflict");
  const result = p.kind === "credit" ? p.credit : p.kind === "kit" ? p.kit : p.registry;
  const status = result === null ? "framed" : p.gaps.length ? "partial" : "prepared_for_human_review";
  if (p.status !== status) throw new Error("originator_packet_status_conflict");
  return p;
}

/** The packet executes only on the confirmed immutable basis obtained by the normal authorized SQL
 * reader. It never accepts a second facts object alongside that basis. No raw JSON is trusted as a
 * credit decision or as proof of a live bureau/registry query. */
export function prepareOriginatorCasePacket(raw: unknown): OriginatorCasePacket {
  const input = originatorCasePacketInputSchema.parse(raw), a = input.analysis, b = createAnalysisBinding(a, []), prefix = root(a.kind, a.analysisId);
  const names = Object.keys(schemas[a.kind].shape), expected = names.map(sectionId);
  if (a.records.length !== expected.length || new Set(a.records.map(r => r.id)).size !== a.records.length || a.records.some(r => !expected.includes(r.id))) throw new Error("originator_case_record_coverage_incomplete");
  const order = b.read(a.order, prefix + "order", a.scenario, "identity", "list", z.array(key));
  if (order && JSON.stringify(order) !== JSON.stringify(expected)) throw new Error("originator_case_record_order_conflict");
  const facts: Record<string, unknown> = {};
  for (const r of a.records) {
    const value = b.read(r.value, prefix + "record." + r.id, a.scenario, "identity", "text", json.pipe(recordValue));
    if (!value) continue;
    if (!names.includes(value.section) || sectionId(value.section) !== r.id) throw new Error("originator_case_record_section_conflict");
    facts[value.section] = value.value;
  }
  let credit: ReturnType<typeof reviewOriginatorCredit> | null = null, registry: ReturnType<typeof reviewOriginatorRegistry> | null = null, kit: ReturnType<typeof reviewOriginatorKit> | null = null;
  if (!b.gaps.length) {
    if (a.kind === "credit") {
      const f = originatorCreditReviewFactsSchema.parse(facts);
      if (f.analysisDate !== a.endDate || f.perimeter !== a.perimeter || f.currency !== a.currency) throw new Error("originator_case_financial_scope_conflict");
      credit = reviewOriginatorCredit(f);
    } else if (a.kind === "registry") {const f = originatorRegistryFactsSchema.parse(facts); if (f.asOf !== a.endDate) throw new Error("originator_case_reading_window_conflict"); registry = reviewOriginatorRegistry(f);}
    else {const f = originatorKitFactsSchema.parse(facts); if (f.inventory.asOf !== a.endDate || f.inventory.currency !== a.currency) throw new Error("originator_case_reading_window_conflict"); kit = reviewOriginatorKit(f);}
  }
  const gaps = [...b.gaps, ...credit?.gaps ?? [], ...kit?.gaps ?? [], ...registry?.gaps.map(g => ({operand: g.subjectId ?? "registry", reason: g.code})) ?? []];
  const payload = {schemaVersion: "originator-case-packet.v1" as const, executorVersion: "2026.10.30-v1" as const, kind: a.kind, question: input.question, analysisId: a.analysisId, scope: a.scope, entityId: a.entityId, basisFingerprint: a.envelope.fingerprint,
    credit, registry, kit, gaps, bindings: b.bindings, contributions: [...b.used.values()], status: !credit && !registry && !kit ? "framed" as const : gaps.length ? "partial" as const : "prepared_for_human_review" as const, grantsExecution: false as const, grantsPublication: false as const};
  return verifyOriginatorCasePacket({...payload, fingerprint: fingerprint(payload)});
}

export function prepareOriginatorKitPacket(raw: unknown) {return originatorKitPacketOutputSchema.parse(prepareOriginatorCasePacket(originatorKitPacketInputSchema.parse(raw)));}
export function prepareOriginatorCreditPacket(raw: unknown) {return originatorCreditPacketOutputSchema.parse(prepareOriginatorCasePacket(originatorCreditPacketInputSchema.parse(raw)));}
export function prepareOriginatorRegistryPacket(raw: unknown) {return originatorRegistryPacketOutputSchema.parse(prepareOriginatorCasePacket(originatorRegistryPacketInputSchema.parse(raw)));}
