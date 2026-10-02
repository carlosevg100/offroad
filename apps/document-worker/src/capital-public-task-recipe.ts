/** Prospective reconstruction only. Hashes and references do not authorize consumption. */
import {createHash} from "node:crypto";
import {z} from "zod";
import {collaborativeAdvisoryPolicy, workspaceJourneyBlueprint} from "@offroad/agent-contracts";
import {originationThesisBriefSchema, originationSeniorReadoutSchema} from "@offroad/domain-contracts";
import {prepareGatewayInput, buildEffectiveAdapterRequest, assertGatewaySchemaUnchanged, legacyGatewayFingerprint, providerDataPolicyVersion, type ModelRef} from "@offroad/model-gateway";
import {researchSourceSchema} from "@offroad/public-research";
import {institutionCapabilitiesSchema} from "./advisor-context";
import {materialNumericTokens} from "./material-numeric-tokens";

export const capitalPublicTaskRecipeVersion = "capital-public-task-recipe.m07.v1";
// Pin of the existing producer's instructions; the consumer supplies their actual bytes.
const systemSha256 = "9cb22a6f263d825c293daf948e348a5956a794e876cb78bb64ed8c00488af30d";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const slot = z.enum(["company", "brief", "institution", "research", "source", "revision", "quality_retry", "dependency"]);
const reference = z.strictObject({slot, id: z.uuid(), version: z.number().int().positive(), bodyFingerprint: hash});
export const capitalPublicTaskRecipeSchema = z.strictObject({
  schemaVersion: z.literal(capitalPublicTaskRecipeVersion), state: z.literal("unresolved"),
  jobId: z.uuid(), organizationId: z.uuid(), workId: z.uuid(), planId: z.uuid(), planFingerprint: hash,
  locale: z.enum(["pt-BR", "en-US"]), asOfDate: z.iso.date(),
  taskId: z.literal("M07"), executorVersion: z.literal("2026.09.03-v6"),
  transformationVersion: z.literal("origination-public-sources-1200.v1"), systemSha256: z.literal(systemSha256),
  components: z.array(reference).min(7).max(1000),
  reconstructionFingerprint: hash,
  gaps: z.tuple([z.literal("server_recipe_receipt_required"), z.literal("current_component_authority_required"),
    z.literal("retention_and_source_closure_required"), z.literal("task_and_accepted_body_binding_required")]),
});
export type CapitalPublicTaskRecipe = z.infer<typeof capitalPublicTaskRecipeSchema>;
export type CapitalPublicRecipeComponent = z.infer<typeof reference> & {body: unknown};
const companySchema = z.strictObject({name: z.string().min(1), website: z.string().nullable()});
const researchSchema = z.strictObject({status: z.enum(["succeeded", "partial", "abstained"]), sourceIds: z.array(z.uuid()).max(500)});
const sourceSchema = researchSourceSchema.strict();
const revisionSchema = z.strictObject({correctionNote: z.string(), priorContent: z.record(z.string(), z.unknown())}).nullable();
const qualitySchema = z.strictObject({attempt: z.number().int().positive(), failedTaskFeedback: z.array(z.record(z.string(), z.unknown()))}).nullable();
const basisSchema = capitalPublicTaskRecipeSchema.pick({jobId: true, organizationId: true, workId: true, planId: true, planFingerprint: true, locale: true, asOfDate: true});
function deny(): never {throw new Error("capital_public_task_recipe_invalid");}
function own<T>(value: T): T {
  if (value && typeof value === "object") {for (const child of Object.values(value)) own(child); Object.freeze(value);} return value;
}
function components(values: readonly CapitalPublicRecipeComponent[]) {
  const result = values.map(value => {
    const pinned = z.strictObject({...reference.shape, body: z.unknown()}).parse(structuredClone(value));
    if (legacyGatewayFingerprint(pinned.body) !== pinned.bodyFingerprint) deny();
    return own(pinned);
  });
  if (new Set(result.map(value => `${value.slot}:${value.id}`)).size !== result.length) deny();
  for (const required of ["company", "brief", "institution", "research", "revision", "quality_retry"] as const) {
    if (result.filter(value => value.slot === required).length !== 1) deny();
  }
  if (!result.some(value => value.slot === "dependency")) deny();
  return result;
}
/** Components contain ephemeral bytes supplied by the authorized reader. This pure
 * function cannot prove that reader, license, persisted dependency or server receipt. */
export function prepareCapitalPublicTaskRecipe(input: {
  basis: z.input<typeof basisSchema>; components: readonly CapitalPublicRecipeComponent[]; system: string;
}) {
  try {
    const basis = basisSchema.parse(structuredClone(input.basis)), all = components(input.components);
    if (createHash("sha256").update(input.system).digest("hex") !== systemSha256) deny();
    const get = (name: z.infer<typeof slot>) => all.find(component => component.slot === name)!.body;
    const company = companySchema.parse(get("company")), meetingBrief = originationThesisBriefSchema.strict().parse(get("brief"));
    const institutionCapabilities = institutionCapabilitiesSchema.strict().nullable().parse(get("institution"));
    const research = researchSchema.parse(get("research"));
    const delivered = all.filter(component => component.slot === "source");
    if (new Set(research.sourceIds).size !== research.sourceIds.length || delivered.length !== research.sourceIds.length
      || research.sourceIds.some(id => !delivered.some(component => component.id === id))) deny();
    const publicSources = research.sourceIds.map(id => {
      const source = sourceSchema.parse(delivered.find(component => component.id === id)!.body);
      return {topic: source.topic, title: source.title, url: source.url, snippet: source.snippet.slice(0, 1200), publishedAt: source.publishedAt};
    });
    const revision = revisionSchema.parse(get("revision")), retry = qualitySchema.parse(get("quality_retry"));
    if (retry?.failedTaskFeedback.some(feedback => feedback.task_id !== "M07")) deny();
    const modelInput = own({locale: basis.locale, asOfDate: basis.asOfDate, company, meetingBrief,
      institutionCapabilities, journeyBlueprint: structuredClone(workspaceJourneyBlueprint("origination_thesis")), collaborativeAdvisoryPolicy: structuredClone(collaborativeAdvisoryPolicy),
      researchStatus: research.status, allowedMaterialNumericTokens: materialNumericTokens(JSON.stringify({meetingBrief, publicSources})), publicSources,
      qualityRetry: retry ? {attempt: retry.attempt,
        instruction: "Re-audit every amount, percentage, multiple and tenor against allowedMaterialNumericTokens. Remove or make qualitative any expression that is not present verbatim in that exhaustive whitelist.",
        failedTaskFeedback: retry.failedTaskFeedback} : null,
      ...(revision ? {requestedCorrection: revision.correctionNote, priorWorkProduct: revision.priorContent} : {}),
    });
    const prepared = prepareGatewayInput({task: "origination_thesis", system: input.system,
      input: [{type: "text", text: JSON.stringify(modelInput)}], schema: originationSeniorReadoutSchema,
      schemaName: "origination_senior_readout_v2", metadata: {jobId: basis.jobId, projectId: basis.workId, publicSourceCount: String(publicSources.length), revision: revision ? "true" : "false"}, maxOutputTokens: 24000, cacheKey: "origination-senior-readout-v6",
      dataHandling: {classification: "confidential", purpose: "case_analysis", requiredPolicyVersion: providerDataPolicyVersion}});
    const recipe = own(capitalPublicTaskRecipeSchema.parse({...basis, schemaVersion: capitalPublicTaskRecipeVersion, state: "unresolved",
      taskId: "M07", executorVersion: "2026.09.03-v6", transformationVersion: "origination-public-sources-1200.v1", systemSha256,
      components: all.map(({body: _body, ...ref}) => ref), reconstructionFingerprint: prepared.inputFingerprint,
      gaps: ["server_recipe_receipt_required", "current_component_authority_required", "retention_and_source_closure_required", "task_and_accepted_body_binding_required"]}));
    // The ephemerals are intentionally separate from the persistable metadata DTO.
    return Object.freeze({recipe, prepared});
  } catch {return deny();}
}
/** Delegates route/default/repair serialization to the gateway's existing builder. */
export function reconstructCapitalPublicTaskRequest(
  reconstructed: ReturnType<typeof prepareCapitalPublicTaskRecipe>, route: ModelRef,
  defaults: {maxOutputTokens: number; timeoutMs: number},
) {
  capitalPublicTaskRecipeSchema.parse(reconstructed.recipe);
  assertGatewaySchemaUnchanged(reconstructed.prepared);
  if (reconstructed.prepared.inputFingerprint !== reconstructed.recipe.reconstructionFingerprint) deny();
  return buildEffectiveAdapterRequest(reconstructed.prepared, route, defaults);
}
