import {beforeEach, describe, expect, it, vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import type {DealStateRow} from "./workbench";
import {materialReviewFixture} from "@/lib/artifacts/material-package-review.test-support";
const mocks = vi.hoisted(() => ({physical: vi.fn(), basis: vi.fn()}));
vi.mock("@/lib/artifacts/capital-material-result", () => ({readCapitalMaterialResult: mocks.physical}));
vi.mock("@/lib/artifacts/material-package-review", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/artifacts/material-package-review")>();
  return {...actual, createMaterialPackageReviewPort: () => ({read: mocks.basis})};
});
import {loadGovernedMaterialPackage, loadNativeMaterialReviewForWork} from "./materials";

function setup() {
  const f = materialReviewFixture(), organizationId = f.u(40), sessionId = f.u(41);
  const make = (type: string, id: string, fp: string, status: string, payload: unknown, dependencies: unknown[] = []): DealStateRow => ({
    id, organization_id: organizationId, intake_session_id: sessionId, object_type: type, object_version: 1,
    status, input_fingerprint: "f".repeat(64), object_fingerprint: fp, payload: payload as DealStateRow["payload"],
    dependencies: dependencies as DealStateRow["dependencies"], created_by: f.basis.preparedBy, created_by_kind: "worker",
    created_at: "2026-10-02T12:00:00Z", updated_at: "2026-10-02T12:00:00Z", superseded_at: null});
  const dep = (type: string, fp: string) => ({objectType: type, objectFingerprint: fp});
  const rows = [make("structure_option", f.u(42), "c".repeat(64), "pending_confirmation", {}),
    make("structure_decision", f.u(43), "d".repeat(64), "confirmed", {}, [dep("structure_option", "c".repeat(64))]),
    make("production_plan", f.basis.productionPlanId, "e".repeat(64), "approved", {artifacts: ["teaser"]}, [dep("structure_decision", "d".repeat(64))]),
    make("material_artifact", f.expected.materialObjectId, f.expected.bundleFingerprint, "pending_confirmation", {
      schemaVersion: "capital-material-projection.v1", revisionId: f.expected.revisionId, recipeId: f.expected.recipeId,
      bundleFingerprint: f.expected.bundleFingerprint, physicalSha256: "a".repeat(64), byteLength: 100}, [dep("production_plan", "e".repeat(64))])];
  const client = {from: vi.fn((table: string) => {
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in"]) q[method] = vi.fn(() => q);
    q.order = vi.fn(async () => ({data: rows, error: null}));
    q.maybeSingle = vi.fn(async () => ({data: table === "document_intake_sessions" ? {capital_project_id: f.expected.workId} : null, error: null}));
    return q;
  })} as unknown as SupabaseClient<Database>;
  const content = {schemaVersion: "2026.08.29-v1", materials: [{kind: "teaser", title: {pt: "Sintético", en: "Synthetic"}, blocks: [], dependsOn: []}],
    financialModel: null, materialTruth: {}, dataRoom: {}};
  mocks.physical.mockResolvedValue({ok: true, content, ...f.expected});
  mocks.basis.mockResolvedValue(f.basis);
  return {f, client, organizationId, sessionId, rows, content};
}
beforeEach(() => vi.resetAllMocks());
describe("native material package loading", () => {
  it("renders the verified physical body under the exact current human basis", async () => {
    const s = setup(), result = await loadGovernedMaterialPackage(s.client, s.organizationId, s.sessionId);
    expect(result?.materials[0]?.title.pt).toBe("Sintético");
    expect(result?.nativeReview?.recipeId).toBe(s.f.expected.recipeId);
    expect(mocks.physical).toHaveBeenCalledWith(s.client, {organizationId: s.organizationId, workId: s.f.expected.workId, projection: s.rows[3]!.payload});
  });
  it("never falls back to an inline body when Storage authority is denied", async () => {
    const s = setup();
    s.rows[3]!.payload = {...s.rows[3]!.payload as Record<string, unknown>, ...s.content, schemaVersion: "capital-material-projection.v1"} as DealStateRow["payload"];
    mocks.physical.mockResolvedValue({ok: false, error: "capital_material_result_withheld"});
    expect(await loadGovernedMaterialPackage(s.client, s.organizationId, s.sessionId)).toBeNull();
    expect(mocks.basis).not.toHaveBeenCalled();
  });
  it("denies a current review basis from another recipe", async () => {
    const s = setup(); mocks.basis.mockResolvedValue({...s.f.basis, recipeId: s.f.u(99)});
    expect(await loadGovernedMaterialPackage(s.client, s.organizationId, s.sessionId)).toBeNull();
  });
  it("denies a malformed verified product and a changed structure chain", async () => {
    const s = setup(); mocks.physical.mockResolvedValue({ok: true, content: {...s.content, extra: "forbidden"}, ...s.f.expected});
    expect(await loadGovernedMaterialPackage(s.client, s.organizationId, s.sessionId)).toBeNull();
    mocks.physical.mockResolvedValue({ok: true, content: s.content, ...s.f.expected});
    s.rows[2]!.dependencies = [];
    expect(await loadGovernedMaterialPackage(s.client, s.organizationId, s.sessionId)).toBeNull();
  });
  it("loads a capital-planning work's native material review without a historical private-case gate", async () => {
    const s = setup();
    expect(await loadNativeMaterialReviewForWork(s.client, s.organizationId, s.sessionId, s.f.expected.workId))
      .toMatchObject({workId: s.f.expected.workId, recipeId: s.f.expected.recipeId});
  });
  it("withholds native work review when physical access or exact work binding is denied", async () => {
    const s = setup();
    expect(await loadNativeMaterialReviewForWork(s.client, s.organizationId, s.sessionId, s.f.u(99))).toBeNull();
    mocks.physical.mockResolvedValue({ok: false, error: "capital_material_result_withheld"});
    expect(await loadNativeMaterialReviewForWork(s.client, s.organizationId, s.sessionId, s.f.expected.workId)).toBeNull();
  });
  it("does not turn an inline historical material into an independent native review", async () => {
    const s = setup(); s.rows[3]!.payload = s.content as DealStateRow["payload"];
    expect(await loadNativeMaterialReviewForWork(s.client, s.organizationId, s.sessionId, s.f.expected.workId)).toBeNull();
    expect(mocks.physical).not.toHaveBeenCalled(); expect(mocks.basis).not.toHaveBeenCalled();
  });

});
