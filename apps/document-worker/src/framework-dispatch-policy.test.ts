import {describe, expect, it, vi} from "vitest";
import type {ClaimedJob} from "./queue";
import {processAgentOperationBriefJob} from "./agent-operation-brief";
import type {AgentOperationBriefJob} from "./queue";
import type {ModelGateway} from "@offroad/model-gateway";
import {rejectRetiredFrameworkJob} from "./framework-dispatch-policy";

describe("production framework dispatch", () => {
  it("rejects a preview claim even when its historical grant is present, without a retry", async () => {
    const fail = vi.fn().mockResolvedValue(undefined);
    const job = {kind: "capital_project_analysis", payload: {analysis_scope: "integration_preview"}, integration_preview: true} as ClaimedJob;
    expect(await rejectRetiredFrameworkJob(job, {fail})).toBe(true);
    expect(fail).toHaveBeenCalledExactlyOnceWith(job, expect.objectContaining({code: "integration_preview_retired"}), {retryable: false});
  });
  it("refuses an old preview turn before loading context or opening a model", async () => {
    const fail = vi.fn().mockResolvedValue(undefined);
    const loadAgentContext = vi.fn();
    const generate = vi.fn();
    const result = await processAgentOperationBriefJob({kind:"agent_operation_brief", integration_preview:true, payload:{message_id:"synthetic"}} as AgentOperationBriefJob, {queue:{fail,loadAgentContext} as never,gateway:{generate} as unknown as ModelGateway,log:()=>{}});
    expect(result.status).toBe("failed");expect(fail).toHaveBeenCalledOnce();
    expect(loadAgentContext).not.toHaveBeenCalled();expect(generate).not.toHaveBeenCalled();
  });
  it("keeps legitimate capital and R01 jobs under their existing executor gates", async () => {
    const fail = vi.fn();
    for (const job of [{kind: "capital_project_analysis", payload: {analysis_scope: "company_debt_view"}}, {kind: "case_analysis", payload: {}}]) {
      expect(await rejectRetiredFrameworkJob(job as ClaimedJob, {fail})).toBe(false);
    }
    expect(fail).not.toHaveBeenCalled();
  });
  it("propagates an unrecorded rejection rather than claiming that the retired job was closed", async () => {
    const fail = vi.fn().mockRejectedValue(new Error("transport_failed"));
    await expect(rejectRetiredFrameworkJob({kind: "capital_project_analysis", payload: {analysis_scope: "integration_preview"}} as ClaimedJob, {fail})).rejects.toThrow("transport_failed");
  });
});
