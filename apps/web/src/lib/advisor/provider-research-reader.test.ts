import {describe, expect, it} from "vitest";
import {publicCapitalCatalogReference} from "@offroad/public-research/capital-catalog";
import {compileProviderResearchArtifact} from "@offroad/work-plan";
import {currentProviderResearch, type ProviderResearchRow} from "./provider-research-reader";
const binding = {projectId: "10000000-0000-4000-8000-000000000001", planId: "10000000-0000-4000-8000-000000000002", planFingerprint: "a".repeat(64)};
const content = compileProviderResearchArtifact({...binding, schemaVersion: "provider-research.v1", scope: "research_only", locale: "pt-BR", objective: "Mapear provedores", asOf: "2026-09-10T00:00:00Z", sourceFingerprint: "b".repeat(64), providers: [], limitations: ["Nenhum registro autorizado no escopo."], shortlistAuthorized: false, externalEffectAllowed: false});
const row: ProviderResearchRow = {id: "artifact", artifact_type: "provider_research", schema_version: "provider-research.v1", artifact_version: 1, status: "draft", plan_id: binding.planId, task_run_id: "run", content};
const runs = [{id: "run", status: "succeeded"}];
describe("currentProviderResearch", () => {
  it("reads a completed research snapshot for the exact current project and plan", () => {
    expect(currentProviderResearch([row], runs, binding)?.research).toEqual(content);
  });
  it("rejects changed content, stale states, wrong plan and unfinished execution", () => {
    for (const changed of [{...row, status: "stale"}, {...row, status: "superseded"}, {...row, schema_version: "unknown"}, {...row, plan_id: "other"}, {...row, task_run_id: "other"}, {...row, content: {...content, objective: "Changed"}}]) {
      expect(currentProviderResearch([changed], runs, binding)).toBeNull();
    }
    expect(currentProviderResearch([row], [{id: "run", status: "running"}], binding)).toBeNull();
    expect(currentProviderResearch([row], runs, {...binding, projectId: "10000000-0000-4000-8000-000000000003"})).toBeNull();
    expect(currentProviderResearch([row], runs, null)).toBeNull();
  });
  it("does not resurrect an earlier snapshot after invalidation of the newest version", () => {
    expect(currentProviderResearch([row, {...row, artifact_version: 2, status: "stale"}], runs, binding)).toBeNull();
  });
});


it("reads pinned v2 without accepting a mislabeled v1 row or unknown catalog", () => {
  const {fingerprint, ...payload} = content;
  expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  const publicContent = compileProviderResearchArtifact({...payload, schemaVersion: "provider-research.v2", publicCatalog: publicCapitalCatalogReference});
  const publicRow = {...row, schema_version: "provider-research.v2", content: publicContent};
  expect(currentProviderResearch([publicRow], runs, binding)?.research).toEqual(publicContent);
  expect(currentProviderResearch([{...publicRow, schema_version: "provider-research.v1"}], runs, binding)).toBeNull();
  expect(currentProviderResearch([{...publicRow, content: {...publicContent, publicCatalog: {...publicCapitalCatalogReference, sourceFingerprint: "f".repeat(64)}}}], runs, binding)).toBeNull();
});
