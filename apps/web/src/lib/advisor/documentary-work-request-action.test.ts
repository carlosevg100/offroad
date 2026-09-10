import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {documentWorkPlanSnapshot} from "@offroad/work-plan";
const workspace = vi.hoisted(() => ({rpc: vi.fn(), read: vi.fn(), require: vi.fn()}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: workspace.require, requireUser: workspace.require}));
vi.mock("next/server", () => ({after: vi.fn()}));
import {requestAdvisorDocumentaryWork} from "@/app/[locale]/app/advisor-actions";
const input = {locale: "pt-BR", projectId: "10000000-0000-4000-8000-000000000001", executionBriefId: "10000000-0000-4000-8000-000000000002", expectedFingerprint: "a".repeat(64), messageId: "10000000-0000-4000-8000-000000000003", content: "Compare estas propostas."};
beforeEach(() => {
  vi.stubEnv("DOCUMENTARY_WORK_PLANNING_ENABLED", "true");
  vi.clearAllMocks();
  const query = {select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: workspace.read};
  workspace.require.mockResolvedValue({organization: {id: "tenant-from-session"}, supabase: {rpc: workspace.rpc, from: () => query}});
  workspace.read.mockResolvedValue({data: {entry_job: "capital_planning"}, error: null});
  workspace.rpc.mockResolvedValue({error: null});
});
afterEach(() => vi.unstubAllEnvs());
describe("documentary request command", () => {
  it("derives entry from authorized project and sends one atomic version-bound command", async () => {
    expect(await requestAdvisorDocumentaryWork(input)).toEqual({ok: true});
    expect(workspace.rpc).toHaveBeenCalledExactlyOnceWith("request_documentary_work_revision_v1", {
      p_project_id: input.projectId, p_execution_brief_id: input.executionBriefId,
      p_expected_fingerprint: input.expectedFingerprint, p_message_id: input.messageId,
      p_locale: input.locale, p_content: input.content, p_plan: documentWorkPlanSnapshot("capital_planning"),
    });
  });
  it.each(["Calcule o DSCR e compare estas propostas.", "Prepare um modelo financeiro.", "Envie documentos ao mercado."])("never downgrades quantitative or external work: %s", async content => {
    expect(await requestAdvisorDocumentaryWork({...input, content})).toEqual({ok: false, error: "invalid"});
    expect(workspace.rpc).not.toHaveBeenCalled();
  });
  it("does not submit when the documentary gate is off", async () => {
    vi.stubEnv("DOCUMENTARY_WORK_PLANNING_ENABLED", "false");
    expect(await requestAdvisorDocumentaryWork(input)).toEqual({ok: false, error: "processing"});
    expect(workspace.require).not.toHaveBeenCalled();
  });
  it("surfaces concurrent revisions as stale without an unbound fallback", async () => {
    workspace.rpc.mockResolvedValue({error: {code: "40001", message: "execution_brief_edit_stale"}});
    expect(await requestAdvisorDocumentaryWork(input)).toEqual({ok: false, error: "stale"});
    expect(workspace.rpc).toHaveBeenCalledTimes(1);
  });
});
