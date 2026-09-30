import {beforeEach, describe, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({workspace: vi.fn(), rpc: vi.fn(), project: vi.fn(), refresh: vi.fn()}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: mocks.workspace}));
vi.mock("next/cache", () => ({revalidatePath: mocks.refresh}));
import {setProjectReviewPolicyV2, setOrganizationReviewPolicyV2} from "./review-actions";
const projectId = "30000000-0000-4000-8000-000000000001";
const organizationId = "20000000-0000-4000-8000-000000000001";
const pc = {expectedPolicyFingerprint: "a".repeat(64), locale: "pt-BR", projectId, selfApproval: "inherit", assignmentRequired: "required"};
const oc = {expectedPolicyFingerprint: "b".repeat(64), locale: "pt-BR", projectId, selfApprovalAllowed: false, assignmentRequired: true};
const pr = {schemaVersion: "project-review-policy-write.v2", project_id: projectId, organization_id: organizationId, policy_fingerprint: "c".repeat(64), organization_policy_fingerprint: "b".repeat(64),
 assignment_required: {effective: true, project: "required", organization: false}, self_approval: {effective: false, project: "inherit", organization: false}};
const or = {schemaVersion: "organization-review-policy-write.v2", organization_id: organizationId, policy_fingerprint: "d".repeat(64), self_approval_allowed: false, assignment_required: true};
const eq = vi.fn();
beforeEach(() => {
 vi.clearAllMocks(); eq.mockReturnValue({eq, maybeSingle: mocks.project}); mocks.project.mockResolvedValue({data: {id: projectId}, error: null});
 mocks.workspace.mockResolvedValue({organization: {id: organizationId}, supabase: {rpc: mocks.rpc, from: () => ({select: () => ({eq})})}});
 mocks.rpc.mockImplementation(name => Promise.resolve({data: name === "set_capital_project_review_policy_v2" ? pr : or, error: null}));
});
describe("content review policy v2 actions", () => {
 it("sends the exact project pair and validates returned scope", async () => {
  expect(await setProjectReviewPolicyV2(pc)).toEqual({ok: true});
  expect(mocks.rpc).toHaveBeenCalledWith("set_capital_project_review_policy_v2", {p_project_id: projectId, p_self_approval: "inherit", p_assignment_required: "required", p_expected_policy_fingerprint: pc.expectedPolicyFingerprint});
  expect(mocks.refresh).toHaveBeenCalledWith(`/pt-BR/app/projects/${projectId}`);
 });
 it("derives organization and verifies the refresh project belongs to it", async () => {
  expect(await setOrganizationReviewPolicyV2(oc)).toEqual({ok: true});
  expect(eq).toHaveBeenCalledWith("organization_id", organizationId);
  expect(mocks.rpc).toHaveBeenCalledWith("set_organization_review_policy_v2", {p_organization_id: organizationId, p_self_approval_allowed: false, p_assignment_required: true, p_expected_policy_fingerprint: oc.expectedPolicyFingerprint});
 });
 it.each([ {...pc, expectedPolicyFingerprint: undefined}, {...pc, expectedPolicyFingerprint: "invalid"}, {...pc, organizationId}, {...pc, assignmentRequired: undefined}, {...pc, selfApproval: "unknown"} ])("rejects injected tenant or invalid project pair", async value => {
  expect(await setProjectReviewPolicyV2(value)).toEqual({ok: false, error: "invalid"}); expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it.each([ {...oc, expectedPolicyFingerprint: undefined}, {...oc, organizationId}, {...oc, assignmentRequired: undefined}, {...oc, selfApprovalAllowed: "false"} ])("rejects injected tenant or invalid organization pair", async value => {
  expect(await setOrganizationReviewPolicyV2(value)).toEqual({ok: false, error: "invalid"}); expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("denies an out-of-workspace refresh project before organization mutation", async () => {
  mocks.project.mockResolvedValue({data: null, error: null}); expect(await setOrganizationReviewPolicyV2(oc)).toEqual({ok: false, error: "denied"}); expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it.each([["42501", "denied"], ["P0002", "not_found"], ["22023", "invalid"], ["XX000", "save"]])("honors %s from the final project writer", async (code, error) => {
  mocks.rpc.mockResolvedValue({data: null, error: {code}}); expect(await setProjectReviewPolicyV2(pc)).toEqual({ok: false, error}); expect(mocks.refresh).not.toHaveBeenCalled();
 });
 it("asks for a fresh policy after a CAS denial without retrying", async () => {
  mocks.rpc.mockResolvedValue({data: null, error: {code: "40001", message: "policy_changed"}});
  expect(await setProjectReviewPolicyV2(pc)).toEqual({ok: false, error: "policy_changed"}); expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.refresh).not.toHaveBeenCalled();
 });
 it.each([null, {...pr, organization_id: "20000000-0000-4000-8000-000000000002"}, {...pr, project_id: "30000000-0000-4000-8000-000000000002"}, {...pr, assignment_required: {effective: false, project: "not_required", organization: false}}, {...pr, extra: true}])("does not claim success from a malformed or mismatched project return", async data => {
  mocks.rpc.mockResolvedValue({data, error: null}); expect(await setProjectReviewPolicyV2(pc)).toEqual({ok: false, error: "save"}); expect(mocks.refresh).not.toHaveBeenCalled();
 });
 it.each([null, {...or, organization_id: "20000000-0000-4000-8000-000000000002"}, {...or, assignment_required: false}])("does not claim success from a malformed or mismatched organization return", async data => {
  mocks.rpc.mockResolvedValue({data, error: null}); expect(await setOrganizationReviewPolicyV2(oc)).toEqual({ok: false, error: "save"}); expect(mocks.refresh).not.toHaveBeenCalled();
 });
});
