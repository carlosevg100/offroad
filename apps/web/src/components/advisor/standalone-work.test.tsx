import {beforeEach, describe, expect, it, vi} from "vitest";
import type {WorkReviewDashboard} from "@/lib/advisor/work-review-dashboard";
import type {ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
const mocks = vi.hoisted(() => ({policy: vi.fn(), workspace: vi.fn(), capture: vi.fn(), rpc: vi.fn(), review: vi.fn()}));
vi.mock("@/lib/advisor/project-review-policy-context", () => ({loadProjectReviewPolicyContext: mocks.policy}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: mocks.workspace}));
vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => key}));
vi.mock("./artifact-roundtrip-work", () => ({ArtifactRoundtripWork: () => <div data-testid="artifact-roundtrip"/>}));
vi.mock("./project-review-roles", () => ({ProjectReviewRoles: ({context, dashboard}: {context: {canManage: boolean}; dashboard: WorkReviewDashboard | null}) => {mocks.review(dashboard); return <section data-testid="policy-v2" data-manage={String(context.canManage)} data-viewer={dashboard?.viewerId}>Content review</section>;}}));
vi.mock("./advisor-project", () => ({AdvisorProject: (props: {workSections: {id: string; content: ReactNode}[]}) => {mocks.capture(props); return <main>{props.workSections.map(s => <div key={s.id}>{s.content}</div>)}</main>;}}));
vi.mock("./work-updates", () => ({WorkUpdates: () => <div/>}));
vi.mock("./work-participation-panel", () => ({WorkParticipationPanel: () => <div/>}));
vi.mock("@/components/advisor/work-vault-panel", () => ({WorkVaultPanel: () => <div/>}));
vi.mock("@/components/advisor/work-context-panel", () => ({WorkContextPanel: () => <div/>}));
vi.mock("@/lib/advisor/advisor-project-copy", () => ({advisorProjectCopy: async () => ({})}));
vi.mock("@/lib/execution/revision", () => ({executionResultHref: () => ""}));
vi.mock("@/lib/advisor/work-updates-reader", () => ({loadWorkUpdates: async () => null}));
vi.mock("@/lib/advisor/work-activity", () => ({summarizeWorkActivity: () => ({})}));
vi.mock("@/lib/advisor/work-activity-reader", () => ({loadWorkActivity: async () => ({})}));
import {StandaloneWork} from "./standalone-work";
const project = {id: "30000000-0000-4000-8000-000000000001", project_name: "Synthetic work", access_basis: "public_information"};
const org = "20000000-0000-4000-8000-000000000001";
const viewer = "10000000-0000-4000-8000-000000000001";
const dashboard: WorkReviewDashboard = {schemaVersion: "work-review-dashboard.v1", workId: project.id, organizationId: org, viewerId: viewer, canReport: true, canManage: false, revisions: [], decisions: [], decisionsTruncated: false, nextDecisionCursor: null, assignments: [], nextCursor: null};
beforeEach(() => {
 vi.clearAllMocks();
 const chain = {eq: vi.fn(), order: vi.fn()}; chain.eq.mockReturnValue(chain); chain.order.mockReturnValue({order: async () => ({data: [], error: null})});
 mocks.workspace.mockResolvedValue({organization: {id: org}, userId: viewer, supabase: {rpc: mocks.rpc, from: () => ({select: () => chain})}});
 mocks.rpc.mockResolvedValue({data: dashboard, error: null});
 mocks.policy.mockResolvedValue({projectId: project.id, organizationId: org, regime: "open", canManage: false});
});
describe("content review without an intake session", () => {
 it("uses the same scoped content-review surface without creating or requiring intake", async () => {
  const html = renderToStaticMarkup(await StandaloneWork({locale: "pt-BR", project})); expect(html).toContain('data-testid="policy-v2"');
  expect(mocks.rpc).toHaveBeenCalledWith("read_work_review_dashboard_v1", {p_work_id: project.id, p_before_id: null, p_before_decision_id: null});
  expect(mocks.review).toHaveBeenCalledWith(dashboard);
  expect(html).toContain(`data-viewer="${viewer}"`);
  expect(mocks.policy).toHaveBeenCalledWith(expect.anything(), project.id, org); expect(mocks.capture.mock.calls[0][0].sessionId).toBeNull();
 });
 it("keeps the surface read only without manage", async () => expect(renderToStaticMarkup(await StandaloneWork({locale: "en-US", project}))).toContain('data-manage="false"'));
 it("shows unavailable when the authorized loader refuses the context, without a legacy fallback", async () => {
  mocks.policy.mockResolvedValue(null); const html = renderToStaticMarkup(await StandaloneWork({locale: "pt-BR", project}));
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(html).toContain("unavailable"); expect(html).not.toContain('data-testid="policy-v2"');
 });
 it("withholds refused history without hiding the authorized review policy", async () => {
  mocks.rpc.mockResolvedValue({data: null, error: {code: "42501"}});
  const html = renderToStaticMarkup(await StandaloneWork({locale: "pt-BR", project}));
  expect(html).toContain('data-testid="policy-v2"'); expect(mocks.review).toHaveBeenCalledWith(null);
 });
 it.each(["workId", "organizationId", "viewerId"] as const)("withholds history whose %s does not match the current workspace actor", async key => {
  mocks.rpc.mockResolvedValue({data: {...dashboard, [key]: "90000000-0000-4000-8000-000000000001"}, error: null});
  renderToStaticMarkup(await StandaloneWork({locale: "pt-BR", project})); expect(mocks.review).toHaveBeenCalledWith(null);
 });
});
