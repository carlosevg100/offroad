import {beforeEach, describe, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({workspace: vi.fn(), refresh: vi.fn(), rpc: vi.fn(), project: vi.fn()}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: mocks.workspace}));
vi.mock("next/cache", () => ({revalidatePath: mocks.refresh}));
import {materialReviewFixture} from "@/lib/artifacts/material-package-review.test-support";
import {reviewMaterialPackage} from "./material-package-review-actions";
const f = materialReviewFixture();
const command = {locale: "pt-BR", projectId: f.expected.workId, revisionId: f.expected.revisionId,
  fingerprint: f.basis.manifestFingerprint, act: "approve", declared: true, commandId: f.u(20), note: "", basisReviewId: null};
const eq = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); eq.mockReturnValue({eq, maybeSingle: mocks.project});
  mocks.project.mockResolvedValue({data: {id: command.projectId}, error: null});
  mocks.rpc.mockImplementation(async (name: string) => name === "read_material_package_review_basis_v1" ? {data: f.basis, error: null} : {
    data: {schemaVersion: "capital-material-package-review.v1", workId: command.projectId, revisionId: command.revisionId,
      reviewId: f.u(21), decisionId: f.u(22), act: "approve", effect: "request_followup_brief", jobId: f.u(23), runId: f.u(24), replayed: false}, error: null});
  mocks.workspace.mockResolvedValue({organization: {id: f.u(30)}, supabase: {rpc: mocks.rpc, from: () => ({select: () => ({eq})})}});
});
describe("native material review action", () => {
  it("uses the current tenant and one atomic act requesting a brief", async () => {
    expect(await reviewMaterialPackage(command)).toEqual({ok: true});
    expect(eq).toHaveBeenCalledWith("organization_id", f.u(30));
    expect(mocks.rpc.mock.calls.map(c => c[0])).toEqual(["read_material_package_review_basis_v1", "decide_material_package_v1"]);
    expect(mocks.rpc.mock.calls[1]?.[1]).toMatchObject({p_command_id: command.commandId, p_self_approval_declared: true});
  });
  it("rejects caller-supplied tenant or effects before reading", async () => {
    expect(await reviewMaterialPackage({...command, organizationId: f.u(99)})).toEqual({ok: false, error: "save"});
    expect(await reviewMaterialPackage({...command, effect: "queue_execution"})).toEqual({ok: false, error: "save"});
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("denies a foreign project before the native reader", async () => {
    mocks.project.mockResolvedValue({data: null, error: null});
    expect(await reviewMaterialPackage(command)).toEqual({ok: false, error: "denied"}); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects changed manifest without writing", async () => {
    expect(await reviewMaterialPackage({...command, fingerprint: "c".repeat(64)})).toEqual({ok: false, error: "changed"});
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
  it("honors revocation between read and the atomic act", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "read_material_package_review_basis_v1"
      ? {data: f.basis, error: null} : {data: null, error: {message: "material_package_review_denied"}});
    expect(await reviewMaterialPackage(command)).toEqual({ok: false, error: "denied"}); expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
