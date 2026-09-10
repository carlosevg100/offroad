import {describe, expect, it} from "vitest";
import {compileProviderResearchArtifact, readProviderResearchArtifact, type ProviderResearchPayload} from "./provider-research";

const payload: ProviderResearchPayload = {
  schemaVersion: "provider-research.v1", scope: "research_only",
  projectId: "11111111-1111-4111-8111-111111111111", planId: "22222222-2222-4222-8222-222222222222", planFingerprint: "a".repeat(64),
  locale: "pt-BR", objective: "Pesquisar mandatos de crédito", asOf: "2026-09-09T12:00:00Z", sourceFingerprint: "b".repeat(64),
  providers: [{providerId: "fund-1", name: "Fundo de teste", sourceClass: "registered", observations: [{criterion: "sectors", value: "Energia", provenance: "declared", observedAt: null}], gaps: ["Data da declaração não disponível"]}],
  limitations: ["Pesquisa de registros autorizados; não confirma interesse em uma operação."], shortlistAuthorized: false, externalEffectAllowed: false,
};
const binding = {projectId: payload.projectId, planId: payload.planId, planFingerprint: payload.planFingerprint};
describe("provider research contract", () => {
  it("preserves source status and binds a deterministic research result to its approved plan", () => {
    const artifact = compileProviderResearchArtifact(payload);
    expect(compileProviderResearchArtifact({...payload, providers: [...payload.providers]})).toEqual(artifact);
    expect(readProviderResearchArtifact(artifact, binding)).toEqual(artifact);
    expect(artifact.providers[0]?.observations[0]?.provenance).toBe("declared");
  });
  it("rejects foreign project, stale plan, modified observations and operational permissions", () => {
    const artifact = compileProviderResearchArtifact(payload);
    expect(readProviderResearchArtifact(artifact, {...binding, projectId: payload.planId})).toBeNull();
    expect(readProviderResearchArtifact(artifact, {...binding, planFingerprint: "c".repeat(64)})).toBeNull();
    expect(readProviderResearchArtifact({...artifact, providers: []}, binding)).toBeNull();
    expect(readProviderResearchArtifact({...artifact, shortlistAuthorized: true}, binding)).toBeNull();
    expect(readProviderResearchArtifact({...artifact, contacts: [{email: "test@example.com"}]}, binding)).toBeNull();
  });
});
