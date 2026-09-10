import {beforeAll, describe, expect, it} from "vitest";
import {buildInstitutionalFinancialModel, buildInstitutionalWorkbookArtifact, prepareInstitutionalModelInput, reviewInstitutionalFinancialModel} from "@offroad/financial-model";
import {institutionalInputFixture} from "../../../../../packages/financial-model/src/institutional-input.fixture";
import {prepareInstitutionalComparison} from "./institutional-scenario-comparison";
import {parseInstitutionalModelResult} from "./institutional-model-results";

const projectId = "10000000-0000-4000-8000-000000000001";
const actor = "22222222-2222-4222-8222-222222222222";
async function result(revision: number) {
  const f = institutionalInputFixture();
  const prepared = prepareInstitutionalModelInput(f);
  const model = buildInstitutionalFinancialModel(prepared.input!);
  const configurationId = `11111111-1111-4111-8111-${String(revision).padStart(12, "0")}`;
  const approved = {configurationId, revision, configurationFingerprint: prepared.configurationFingerprint, reviewedBy: actor, reviewedAt: "2026-09-10T03:00:00Z", prepared, model, review: reviewInstitutionalFinancialModel(prepared.input!, model), sourceBindings: f.sources.map(s => ({...s, currency: "BRL", amountScale: "units" as const, metadataEvidence: {locator: "Page 1", rationale: "Reviewed units"}, reviewedBy: actor, reviewedAt: "2026-09-10T03:00:00Z"}))};
  const artifact = await buildInstitutionalWorkbookArtifact([approved], "a".repeat(64));
  return {id: `33333333-3333-4333-8333-${String(revision).padStart(12, "0")}`, status: "completed" as const, configurationId, configurationFingerprint: approved.configurationFingerprint, sourceManifestFingerprint: "a".repeat(64), artifact, blockers: [], createdAt: approved.reviewedAt};
}
let current: Awaited<ReturnType<typeof result>>;
let earlier: Awaited<ReturnType<typeof result>>;
beforeAll(async () => {current = await result(2); earlier = await result(1);});
describe("reviewed institutional comparison", () => {
  it("recomputes exact approved metrics and preserves non-computable ratios", () => {
    const comparison = prepareInstitutionalComparison(current)!;
    expect(comparison.periods[0]!.values.dscr).toBeNull();
    expect(comparison.periods[0]!.values.ebitda).toBe(buildInstitutionalFinancialModel(current.artifact.institutional.scenarios[0]!.input).periods[0]!.ebitda);
    expect(comparison.sources[0]!.version).toBeTruthy();
    expect(comparison.assumptions.length).toBeGreaterThan(0);
    expect(prepareInstitutionalComparison(earlier)!.compatibilityKey).toBe(comparison.compatibilityKey);
  });
  it("fails closed on altered artifact, configuration binding or manifest", () => {
    for (const changed of [{...current, configurationFingerprint: "b".repeat(64)}, {...current, sourceManifestFingerprint: "b".repeat(64)}, {...current, artifact: {...current.artifact, fingerprint: "b".repeat(64)}}]) expect(prepareInstitutionalComparison(changed)).toBeNull();
  });
  it("exposes only verified, completed same-source comparisons and deduplicates current", () => {
    const parsed = parseInstitutionalModelResult({projectId, latest: current, comparisonResults: [current, earlier, {...earlier, status: "queued"}, {...earlier, sourceManifestFingerprint: "b".repeat(64)}]}, projectId)!;
    expect(parsed.comparisons?.map(s => s.revision)).toEqual([2, 1]);
    expect(parsed.id).toBe(current.id);
  });
  it("does not attach comparisons to stale results or wrong-project responses", () => {
    const payload = {projectId, latest: {...current, status: "stale"}, comparisonResults: [earlier]};
    expect(parseInstitutionalModelResult(payload, projectId)?.comparisons).toBeUndefined();
    expect(parseInstitutionalModelResult(payload, actor)).toBeNull();
  });
});
