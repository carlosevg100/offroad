import {z} from "zod";
import {fingerprintJson} from "@offroad/case-understanding";
import {type EconomicContextAttribute, type EconomicContextCompileRequest} from "@offroad/agent-contracts";
import {compileEconomicContext} from "@offroad/dcm-specialization";
import {
  normalizeSectorContextValue, sectorContextCatalog, sectorContextDimensionLabels,
  sectorContextEvidenceLabels, sectorContextValueLabels,
} from "@offroad/credit-playbook";
import {compileObjectiveToPlan, executionBriefPlanningContextSchema, type ExecutionBriefPlanningContext} from "@offroad/work-plan";

const fields = ["company.sector", "company.subsector", "company.business_model", "company.revenue_model", "company.lifecycle", "company.recourse", "company.jurisdiction"] as const;
export const governedSectorContextInputsSchema = z.object({
  schema_version: z.literal("governed-sector-context-inputs.v1"), as_of: z.iso.date(),
  candidates: z.array(z.object({
    id: z.uuid(), field_path: z.enum(fields), normalized_value: z.unknown(),
    review_state: z.string(), is_primary: z.boolean(), reviewed_by: z.uuid().nullable(), reviewed_at: z.iso.datetime({offset: true}).nullable(),
    entity_name: z.string().nullable(), entity_scope: z.string().nullable(),
    period_start: z.iso.date().nullable(), period_end: z.iso.date().nullable(),
    source_anchor: z.record(z.string(), z.unknown()), anchor_verified: z.boolean().nullable(), extraction_method: z.string(),
    processing_run_id: z.uuid().nullable(), source_document_id: z.uuid().nullable(),
    extraction_document_version: z.number().int().positive().nullable(), extraction_source_sha256: z.string().regex(/^[a-fA-F0-9]{64}$/).nullable(),
  }).strict()).max(100),
  sources: z.array(z.object({
    id: z.uuid(), original_name: z.string(), document_version: z.number().int().positive(), sha256: z.string().regex(/^[a-fA-F0-9]{64}$/).nullable(),
    processing_status: z.string(), scan_verdict: z.string().nullable(),
  }).strict()).max(100),
}).strict();
export type GovernedSectorContextInputs = z.infer<typeof governedSectorContextInputsSchema>;

export function sectorIntentForObjective(message: string): EconomicContextCompileRequest["intent"] | null {
  const kind = compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind;
  if (kind === "factual_question") return "factual_answer";
  if (kind === "capital_matching" || kind === "market_mapping") return "market_matching";
  if (kind === "operation_review") return "contract_review";
  if (kind === "capital_strategy" || kind === "board_decision") return "financing_comparison";
  if (["company_analysis", "risk_matrix", "documents_to_case"].includes(kind)) return "financial_analysis";
  // Preparing material, monitoring or an ambiguous request does not authorize fresh analysis.
  return null;
}

/** Consumes only the capability reader projection, never message/model metadata.
 * Source review and document verification are distinct. A user's edited assertion is attributed
 * to the candidate review itself, not to the document from which the former value was extracted.
 */
export function buildGovernedSectorPlanning(input: {
  inputs?: GovernedSectorContextInputs | undefined;
  sessionId: string; companyLabel: string; locale: "pt-BR" | "en-US"; objective: string;
}): ExecutionBriefPlanningContext | undefined {
  if (!input.inputs || input.inputs.candidates.length === 0) return undefined;
  const packet = governedSectorContextInputsSchema.parse(input.inputs);
  const lang = input.locale === "pt-BR" ? "pt" : "en";
  const objectId = `intake-company:${input.sessionId}`;
  const attributes: EconomicContextAttribute[] = [];
  const visible: ExecutionBriefPlanningContext["objects"][number]["attributes"] = [];
  const gaps: ExecutionBriefPlanningContext["objects"][number]["gaps"] = [];
  const say = (pt: string, en: string) => lang === "pt" ? pt : en;
  for (const candidate of [...packet.candidates].sort((a, b) => a.id.localeCompare(b.id))) {
    if (["rejected", "superseded", "not_applicable"].includes(candidate.review_state)) continue;
    const dimension = candidate.field_path.slice("company.".length) as EconomicContextAttribute["dimension"];
    const raw = typeof candidate.normalized_value === "string" ? candidate.normalized_value.trim() : null;
    const value = raw ? normalizeSectorContextValue(dimension, raw) : null;
    const source = packet.sources.find((item) => item.id === candidate.source_document_id);
    const locator = JSON.stringify(candidate.source_anchor);
    const usableLocator = locator !== "{}" && locator.length <= 2_000;
    const reviewed = candidate.is_primary && candidate.reviewed_by !== null && candidate.reviewed_at !== null;
    const wrongEntity = candidate.entity_scope === "segment"
      || (candidate.entity_name !== null && normalized(candidate.entity_name) !== normalized(input.companyLabel));
    const originalSource = source !== undefined && candidate.extraction_document_version === source.document_version
      && source.sha256 !== null && candidate.extraction_source_sha256 === source.sha256
      && source.processing_status === "ready" && source.scan_verdict === "clean"
      && candidate.anchor_verified === true && usableLocator;
    const userReview = reviewed && (candidate.review_state === "edited" || (candidate.review_state === "accepted" && candidate.extraction_method === "user_entry"));
    const documentReview = reviewed && candidate.review_state === "accepted" && candidate.entity_name !== null && originalSource;
    const hasPartialPeriod = Boolean(candidate.period_start) !== Boolean(candidate.period_end);
    const reversedPeriod = candidate.period_start !== null && candidate.period_end !== null && candidate.period_start > candidate.period_end;
    const invalidPeriod = hasPartialPeriod || reversedPeriod;
    const confirmed = !wrongEntity && !invalidPeriod && (userReview || documentReview);
    const basis = userReview && !wrongEntity ? "user_review" : documentReview && !wrongEntity ? "reviewed_document" : "unverified";
    const version = userReview ? fingerprintJson(candidate) : source ? `${source.document_version}:${source.sha256 ?? "unknown"}` : fingerprintJson(candidate);
    const anchor = userReview ? `reviewed_at:${candidate.reviewed_at}` : usableLocator ? locator : say("Localização ainda não verificada", "Location not yet verified");
    visible.push({
      dimension, label: sectorContextDimensionLabels[dimension][lang] + (candidate.period_start || candidate.period_end ? ` (${candidate.period_start ?? "?"} → ${candidate.period_end ?? "?"})` : ""),
      value: value ? sectorContextValueLabels[value]?.[lang] ?? raw : raw && raw.length <= 500 ? raw : null,
      status: value === null ? "unknown" : wrongEntity ? "conflicting" : confirmed ? "confirmed" : "proposed",
      sources: [{label: userReview ? say("Informação revisada pelo usuário", "User-reviewed information") : source?.original_name ?? say("Origem ainda não vinculada", "Source not yet bound"), version, anchor, basis}],
    });
    if (wrongEntity) gaps.push({id: `${candidate.id}:scope`, label: say("Este dado tem outro perímetro ou entidade. Confirme sua aplicação à companhia antes de utilizá-lo.", "This fact has another perimeter or entity. Confirm its applicability to this company before use.")});
    if (value === null) gaps.push({id: `${candidate.id}:vocabulary`, label: say("A classificação recebida ainda não tem uma correspondência técnica suportada.", "The received classification does not yet have a supported technical mapping.")});
    if (invalidPeriod) gaps.push({id: `${candidate.id}:period`, label: say("O período está incompleto ou invertido; confirme início e término antes de aplicar este contexto.", "The period is incomplete or reversed; confirm start and end before applying this context.")});
    const attribute: EconomicContextAttribute = {
      dimension, value, status: value === null ? "unknown" : wrongEntity ? "conflicting" : confirmed && !hasPartialPeriod ? "confirmed" : "proposed",
      evidenceRefs: confirmed ? [{sourceId: userReview ? `review:${candidate.id}` : source!.id, sourceVersion: version, anchor}] : [],
      ...(!invalidPeriod && candidate.period_start && candidate.period_end ? {period: {start: candidate.period_start, end: candidate.period_end}} : {}),
    };
    const same = attributes.find((item) => item.dimension === attribute.dimension && item.value === attribute.value && JSON.stringify(item.period) === JSON.stringify(attribute.period));
    // A primary reviewed value takes precedence over the same non-primary proposal. Different
    // values remain distinct, never silently selected by extraction order.
    if (!same) attributes.push(attribute);
    else {
      const lastVisible = visible.pop()!;
      if (attribute.status === "conflicting" || (attribute.status === "confirmed" && same.status !== "conflicting")) {
        visible[attributes.indexOf(same)] = lastVisible;
        Object.assign(same, attribute);
      }
    }
  }
  const intent = sectorIntentForObjective(input.objective);
  const plan = intent ? compileEconomicContext({schemaVersion: "economic-context-compile-request.v1", context: {schemaVersion: "economic-context.v1", asOf: packet.as_of, objects: [{id: objectId, type: "company", attributes}]}, intent, targetObjectIds: [objectId]}) : null;
  const requirements = (plan?.requirements ?? []).map((requirement) => ({
    id: requirement.activationFingerprint + ":" + requirement.requirementId,
    label: sectorContextCatalog.find((module) => module.id === requirement.moduleId)!.labels[lang] + (requirement.period ? ` (${requirement.period.start} → ${requirement.period.end})` : ""),
    evidenceNeeded: requirement.evidenceNeeded.map((id) => {
      const label = sectorContextEvidenceLabels[id]?.[lang];
      if (!label) throw new Error("sector_requirement_translation_missing");
      return label;
    }), status: "not_examined" as const, methodStatus: "specified" as const,
  }));
  const gapLabels = {
    context_missing: say("Ainda falta contexto econômico aplicável a este objeto.", "Applicable economic context is still missing for this object."),
    attribute_unresolved: say("Há classificações que ainda precisam de revisão ou comprovação da fonte.", "Some classifications still require review or source verification."),
    attribute_uncovered: say("Parte do contexto ainda não possui um método setorial associado nesta versão.", "Part of the context does not yet have an associated sector method in this version."),
    module_context_incomplete: say("Faltam características complementares para delimitar os pontos a examinar.", "Companion characteristics are missing to determine the matters to examine."),
    non_overlapping_periods: say("Os períodos das classificações não coincidem; a combinação não foi aplicada.", "Classification periods do not overlap; the combination was not applied."),
    composition_limit: say("O contexto exige mais detalhamento para uma composição segura.", "The context requires further refinement for safe composition."),
  };
  for (const code of new Set(plan?.gaps.map((gap) => gap.code) ?? [])) gaps.push({id: `coverage:${code}`, label: gapLabels[code]});
  return executionBriefPlanningContextSchema.parse({
    schemaVersion: "sector-planning-context.v1", mode: "planning_only",
    contextFingerprint: fingerprintJson({...packet, candidates: [...packet.candidates].sort((a, b) => a.id.localeCompare(b.id)), sources: [...packet.sources].sort((a, b) => a.id.localeCompare(b.id))}),
    planFingerprint: plan?.fingerprint ?? fingerprintJson({intent: null, attributes}),
    objects: [{id: objectId, label: input.companyLabel, attributes: visible, requirements,
      // Repeated candidate issues share a single user-facing gap; no arbitrary truncation.
      gaps: [...new Map(gaps.map((gap) => [gap.label, gap])).values()],
    }],
  });
}
function normalized(value: string): string {return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");}
