import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {describe, expect, it} from "vitest";
import {legacyGatewayFingerprint, buildEffectiveAdapterRequest, type ModelRef} from "@offroad/model-gateway";
import {prepareCapitalPublicTaskRecipe, reconstructCapitalPublicTaskRequest, capitalPublicTaskRecipeSchema, type CapitalPublicRecipeComponent} from "./capital-public-task-recipe";
const producer = readFileSync(new URL("./origination-thesis.ts", import.meta.url), "utf8");
const system = producer.match(/const ORIGINATION_THESIS_SYSTEM = `([\s\S]*?)`;/)![1]!;
const route: ModelRef = {provider: "anthropic", model: "claude-sonnet-5", effort: "medium"};
const defaults = {maxOutputTokens: 24000, timeoutMs: 10000};
function component(slot: CapitalPublicRecipeComponent["slot"], body: unknown): CapitalPublicRecipeComponent {
  return {slot, id: randomUUID(), version: 1, bodyFingerprint: legacyGatewayFingerprint(body), body};
}
function fixture() {
  const source = component("source", {topic: "identity", provider: "official", retrievedAt: "2026-10-02T00:00:00Z", contentHash: "c".repeat(64), title: "Synthetic financial statement", url: "https://example.test/source", snippet: "R$ 650 milhões; margem 12%.", publishedAt: "2026-09-30"});
  return {system, basis: {jobId: randomUUID(), organizationId: randomUUID(), workId: randomUUID(), planId: randomUUID(), planFingerprint: "a".repeat(64), locale: "pt-BR" as const, asOfDate: "2026-10-02"},
    components: [component("company", {name: "Synthetic company", website: null}), component("brief", {meetingContext: "Discuss public capital alternatives"}),
      component("institution", null), component("research", {status: "succeeded", sourceIds: [source.id]}), source,
      component("revision", null), component("quality_retry", null), component("dependency", {artifactFingerprint: "b".repeat(64)})]};
}
function rehash(value: CapitalPublicRecipeComponent) {value.bodyFingerprint = legacyGatewayFingerprint(value.body);}
function payload(rebuilt: ReturnType<typeof prepareCapitalPublicTaskRecipe>) {const part = rebuilt.prepared.input[0]!; return JSON.parse(part.type === "text" ? part.text : "{}");}
describe("prospective M07 recipe reconstruction", () => {
  it("uses the shared builder and preserves unresolved authority gaps", () => {
    const rebuilt = prepareCapitalPublicTaskRecipe(fixture());
    const actual = reconstructCapitalPublicTaskRequest(rebuilt, route, defaults), expected = buildEffectiveAdapterRequest(rebuilt.prepared, route, defaults);
    expect(actual.adapterRequest).toEqual(expected.adapterRequest); expect(actual.requestFingerprintV1).toBe(expected.requestFingerprintV1);
    expect(actual.ordinalFingerprints()).toEqual(expected.ordinalFingerprints());
    expect(rebuilt.recipe.state).toBe("unresolved"); expect(rebuilt.recipe.gaps).toHaveLength(4);
    expect(rebuilt.prepared.request.task).toBe("origination_thesis"); expect(rebuilt.prepared.request.maxOutputTokens).toBe(24000);
  });
  it("keeps source bytes and private canaries out of metadata", () => {
    const input = fixture(); (input.components[0]!.body as {name: string}).name = "PRIVATE_CANARY"; rehash(input.components[0]!);
    const rebuilt = prepareCapitalPublicTaskRecipe(input);
    expect(JSON.stringify(rebuilt.recipe)).not.toContain("PRIVATE_CANARY"); expect(JSON.stringify(rebuilt.recipe)).not.toContain("https://example.test");
    expect(payload(rebuilt).company.name).toBe("PRIVATE_CANARY");
  });
  it("rejects changed body bytes under an old component pin", () => {
    const input = fixture(); (input.components[4]!.body as {snippet: string}).snippet = "Different source";
    expect(() => prepareCapitalPublicTaskRecipe(input)).toThrow("capital_public_task_recipe_invalid");
  });
  it("pins the full source beyond the consumed truncation", () => {
    const input = fixture(); (input.components[4]!.body as {snippet: string}).snippet = "x".repeat(1200) + "tail-one"; rehash(input.components[4]!);
    const first = prepareCapitalPublicTaskRecipe(input);
    (input.components[4]!.body as {snippet: string}).snippet = "x".repeat(1200) + "tail-two"; rehash(input.components[4]!);
    const second = prepareCapitalPublicTaskRecipe(input);
    expect(first.recipe.reconstructionFingerprint).toBe(second.recipe.reconstructionFingerprint); expect(first.recipe.components).not.toEqual(second.recipe.components);
    expect(payload(second).publicSources[0].snippet).toHaveLength(1200);
  });
  it.each(["missing", "unlisted", "duplicate", "missing_dependency", "missing_absence"])("rejects incomplete closure: %s", mode => {
    const input = fixture();
    if (mode === "missing") input.components.splice(4, 1);
    if (mode === "unlisted") input.components.push(component("source", {topic: "market", title: "Unlisted", url: "https://example.test/other", snippet: "", publishedAt: null}));
    if (mode === "duplicate") input.components.push(input.components[4]!);
    if (mode === "missing_dependency") input.components.pop();
    if (mode === "missing_absence") input.components.splice(2, 1);
    expect(() => prepareCapitalPublicTaskRecipe(input)).toThrow();
  });
  it("preserves economic input across locale changes and pins actual requests", () => {
    const input = fixture(), pt = prepareCapitalPublicTaskRecipe(input);
    const en = prepareCapitalPublicTaskRecipe({...input, basis: {...input.basis, locale: "en-US"}});
    const {locale: _pt, ...ptData} = payload(pt), {locale: _en, ...enData} = payload(en);
    expect(ptData).toEqual(enData); expect(pt.recipe.components).toEqual(en.recipe.components);
    expect(pt.recipe.reconstructionFingerprint).not.toBe(en.recipe.reconstructionFingerprint); expect(ptData.allowedMaterialNumericTokens).toContain("r$650");
  });
  it("owns components and rejects changed instructions", () => {
    const input = fixture(), rebuilt = prepareCapitalPublicTaskRecipe(input);
    (input.components[0]!.body as {name: string}).name = "changed later";
    expect(payload(rebuilt).company.name).toBe("Synthetic company");
    expect(() => prepareCapitalPublicTaskRecipe({...fixture(), system: `${system} changed`})).toThrow();
  });
  it("rejects unknown metadata fields", () => {
    const rebuilt = prepareCapitalPublicTaskRecipe(fixture());
    expect(() => capitalPublicTaskRecipeSchema.parse({...rebuilt.recipe, privateContent: "canary"})).toThrow();
  });
  it("binds correction and retry inputs without silently dropping feedback", () => {
    const input = fixture(); input.components[5] = component("revision", {correctionNote: "Revisit liquidity", priorContent: {hypothesis: "Synthetic"}});
    input.components[6] = component("quality_retry", {attempt: 2, failedTaskFeedback: [{task_id: "M07", code: "numeric_gate"}]});
    const value = payload(prepareCapitalPublicTaskRecipe(input));
    expect(value.requestedCorrection).toBe("Revisit liquidity"); expect(value.qualityRetry.attempt).toBe(2);
    (input.components[6]!.body as {failedTaskFeedback: unknown[]}).failedTaskFeedback = [{task_id: "M02"}]; rehash(input.components[6]!);
    expect(() => prepareCapitalPublicTaskRecipe(input)).toThrow();
  });
  it("keeps explicit zero-source research unresolved instead of inferring a license", () => {
    const input = fixture(); input.components.splice(4, 1);
    input.components[3] = component("research", {status: "abstained", sourceIds: []});
    const rebuilt = prepareCapitalPublicTaskRecipe(input);
    expect(payload(rebuilt).publicSources).toEqual([]); expect(rebuilt.recipe.state).toBe("unresolved");
  });
  it("pins changed institution and dependency components even when not cited", () => {
    const input = fixture(), first = prepareCapitalPublicTaskRecipe(input);
    input.components[2] = component("institution", {institutionName: "Synthetic institution", institutionKind: null,
      operatingModels: [], productFamilies: [], geographies: [], currencies: [], capabilityNotes: null,
      sourceKind: "self_declared", disclosureStatus: "partial", lastConfirmedAt: null});
    input.components[7] = component("dependency", {artifactFingerprint: "d".repeat(64)});
    const second = prepareCapitalPublicTaskRecipe(input);
    expect(first.recipe.components).not.toEqual(second.recipe.components);
    expect(first.recipe.reconstructionFingerprint).not.toBe(second.recipe.reconstructionFingerprint);
  });

});
