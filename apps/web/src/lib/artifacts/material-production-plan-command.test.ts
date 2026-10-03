import {describe, expect, it, vi} from "vitest";
import {approveNativeMaterialProductionPlan} from "./material-production-plan-command";
const u = (n: number) => `aa320000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {workId: u(1), planId: u(2), planFingerprint: "a".repeat(64), commandId: u(3)};
const basis = {schemaVersion: "capital-material-production-plan.v1", workId: u(1), planId: u(2), planFingerprint: input.planFingerprint};
const receipt = {schemaVersion: "capital-material-plan-approval.v1", workId: u(1), precursorId: u(4), proposedPlanId: u(2),
  approvedPlanId: u(5), approvedPlanFingerprint: "b".repeat(64), jobId: u(6), runId: u(7), replayed: false};
describe("native production plan atomic command", () => {
  it("reads the exact basis and makes one atomic approval with the original command id", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({data: basis, error: null}).mockResolvedValueOnce({data: receipt, error: null});
    expect(await approveNativeMaterialProductionPlan({rpc}, input)).toEqual(receipt);
    expect(rpc.mock.calls.map(c => c[0])).toEqual(["read_material_production_plan_v1", "approve_material_production_plan_v1"]);
    expect(rpc.mock.calls[1]?.[1]).toEqual({p_work_id: u(1), p_plan_id: u(2), p_plan_fingerprint: input.planFingerprint, p_command_id: u(3)});
  });
  it.each([{workId: u(99)}, {planId: u(99)}, {planFingerprint: "c".repeat(64)}])("never writes under a swapped basis %j", async patch => {
    const rpc = vi.fn().mockResolvedValue({data: {...basis, ...patch}, error: null});
    await expect(approveNativeMaterialProductionPlan({rpc}, input)).rejects.toThrow("basis_changed");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("does not retry a denied native basis through the old writer or queue", async () => {
    const rpc = vi.fn().mockResolvedValue({data: null, error: {message: "42501"}});
    await expect(approveNativeMaterialProductionPlan({rpc}, input)).rejects.toThrow("basis_denied");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects an approval receipt for another plan", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({data: basis, error: null}).mockResolvedValueOnce({data: {...receipt, proposedPlanId: u(99)}, error: null});
    await expect(approveNativeMaterialProductionPlan({rpc}, input)).rejects.toThrow("identity_mismatch");
  });
});
