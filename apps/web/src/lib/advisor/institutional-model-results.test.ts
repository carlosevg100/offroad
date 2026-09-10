import {describe, expect, it, vi} from "vitest";
import {loadInstitutionalModelResult, parseInstitutionalModelResult} from "./institutional-model-results";

const projectId = "10000000-0000-4000-8000-000000000001";
const latest = {id: "20000000-0000-4000-8000-000000000001", status: "queued", configurationId: "30000000-0000-4000-8000-000000000001", configurationFingerprint: "a".repeat(64), sourceManifestFingerprint: "b".repeat(64), artifact: null, blockers: [], createdAt: "2026-09-10T00:00:00Z"};
describe("institutional model result boundary", () => {
  it("rejects a response for a different project", () => {
    expect(parseInstitutionalModelResult({projectId, latest}, "40000000-0000-4000-8000-000000000001")).toBeNull();
  });
  it.each(["queued", "blocked", "stale"])("preserves %s without manufacturing downloadable output", status => {
    expect(parseInstitutionalModelResult({projectId, latest: {...latest, status}}, projectId)).toEqual({...latest, status, artifact: null});
  });
  it("does not accept completed without a validated artifact", () => {
    expect(parseInstitutionalModelResult({projectId, latest: {...latest, status: "completed"}}, projectId)).toBeNull();
  });
  it("fails closed on a database access failure", async () => {
    const rpc = vi.fn().mockResolvedValue({data: {projectId, latest}, error: {code: "42501"}});
    expect(await loadInstitutionalModelResult({rpc} as never, projectId)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("read_institutional_model_results_v1", {p_project_id: projectId});
  });
});
