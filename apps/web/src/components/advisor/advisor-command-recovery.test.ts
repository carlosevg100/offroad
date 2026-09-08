import {describe, expect, it, vi} from "vitest";

import {createAdvisorCommandRecovery, type AdvisorCommandResult} from "./advisor-command-recovery";

describe("advisor command recovery", () => {
  it.each(["message", "plan_edit", "answer"])("preserves %s draft and command ID after a lost response", async (kind) => {
    const createId = vi.fn().mockReturnValueOnce("original-id").mockReturnValueOnce("new-id");
    const recovery = createAdvisorCommandRecovery(createId);
    const saved = new Set<string>();
    let draft = "Keep this private draft";
    let busy = false;
    let loseResponse = true;
    const action = vi.fn(async (id: string): Promise<AdvisorCommandResult> => {
      saved.add(id); // The database committed, but its acknowledgement was lost.
      if (loseResponse) throw new Error("network unavailable");
      return {ok: true};
    });
    const input = {
      key: JSON.stringify([kind, "project", "version", draft]),
      action,
      onStart: () => { busy = true; },
      onAccepted: () => { draft = ""; },
      onSettled: () => { busy = false; },
      processingError: "processing", unexpectedError: "save",
    };
    expect(await recovery.run(input)).toEqual({ok: false, error: "save"});
    expect(draft).toBe("Keep this private draft");
    expect(busy).toBe(false);
    loseResponse = false;
    expect(await recovery.run(input)).toEqual({ok: true});
    expect(draft).toBe("");
    expect(busy).toBe(false);
    expect(saved.size).toBe(1);
    expect(action.mock.calls.map(([id]) => id)).toEqual(["original-id", "original-id"]);
    // After confirmed acceptance, an intentional new command may use identical text.
    await recovery.run(input);
    expect(action.mock.calls.at(-1)).toEqual(["new-id"]);
  });

  it("allows retry after an explicit temporary rejection without clearing input", async () => {
    const recovery = createAdvisorCommandRecovery(() => "same-id");
    const accepted = vi.fn();
    const settled = vi.fn();
    const action = vi.fn<() => Promise<AdvisorCommandResult>>()
      .mockResolvedValueOnce({ok: false, error: "processing"})
      .mockResolvedValueOnce({ok: true});
    const input = {key: "message", action, onStart: vi.fn(), onAccepted: accepted,
      onSettled: settled, processingError: "processing", unexpectedError: "save"};
    expect(await recovery.run(input)).toEqual({ok: false, error: "processing"});
    expect(accepted).not.toHaveBeenCalled();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(await recovery.run(input)).toEqual({ok: true});
    expect(accepted).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledTimes(2);
  });

  it("blocks concurrent commands before React can render the pending state", async () => {
    const recovery = createAdvisorCommandRecovery(() => "id");
    let finish!: (value: AdvisorCommandResult) => void;
    const action = vi.fn(() => new Promise<AdvisorCommandResult>((resolve) => { finish = resolve; }));
    const settled = vi.fn();
    const input = {key: "first", action, onStart: vi.fn(), onSettled: settled,
      processingError: "processing", unexpectedError: "save"};
    const first = recovery.run(input);
    expect(await recovery.run({...input, key: "second"})).toEqual({ok: false, error: "processing"});
    expect(action).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
    finish({ok: true});
    await first;
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("separates edited content and target versions, while retaining the unresolved original", async () => {
    let sequence = 0;
    const recovery = createAdvisorCommandRecovery(() => `id-${++sequence}`);
    const action = vi.fn(async (): Promise<AdvisorCommandResult> => ({ok: false, error: "save"}));
    const input = {action, onStart: vi.fn(), onSettled: vi.fn(), processingError: "processing", unexpectedError: "save"};
    for (const key of ["projectA:plan1:original", "projectA:plan1:edited", "projectA:plan2:original", "projectB:plan1:original", "projectA:plan1:original"]) {
      await recovery.run({...input, key});
    }
    expect(action.mock.calls).toEqual([["id-1"], ["id-2"], ["id-3"], ["id-4"], ["id-1"]]);
  });
});
