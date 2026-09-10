import {describe, expect, it, vi} from "vitest";
import {createDocumentaryRequestBindings} from "./documentary-request-binding";
import {createAdvisorCommandRecovery} from "./advisor-command-recovery";

describe("documentary request recovery after a brief refresh", () => {
  it("retries the original command and predecessor after a committed request loses its response", async () => {
    const bindings = createDocumentaryRequestBindings();
    const recovery = createAdvisorCommandRecovery(vi.fn().mockReturnValueOnce("first-id").mockReturnValueOnce("next-id"));
    const request = "Compare the proposals";
    const action = vi.fn().mockRejectedValueOnce(new Error("response lost")).mockResolvedValue({ok: true});
    async function submit(current: {briefId: string; fingerprint: string}) {
      const pinned = bindings.forRequest(request, current);
      return recovery.run({key: JSON.stringify([pinned, request]), action: id => action(id, pinned),
        onStart: () => {}, onSettled: () => {}, onAccepted: () => bindings.accepted(request),
        processingError: "busy", unexpectedError: "uncertain"});
    }
    const predecessor = {briefId: "old-brief", fingerprint: "old-fingerprint"};
    const successor = {briefId: "new-brief", fingerprint: "new-fingerprint"};
    expect(await submit(predecessor)).toEqual({ok: false, error: "uncertain"});
    expect(await submit(successor)).toEqual({ok: true});
    expect(action.mock.calls.slice(0, 2)).toEqual([["first-id", predecessor], ["first-id", predecessor]]);
    await submit(successor);
    expect(action.mock.calls[2]).toEqual(["next-id", successor]);
  });
  it("rebinds unchanged text to the refreshed brief after a definite stale rejection", async () => {
    const bindings = createDocumentaryRequestBindings();
    const recovery = createAdvisorCommandRecovery(vi.fn().mockReturnValueOnce("rejected-id").mockReturnValueOnce("fresh-id"));
    const request = "Compare the proposals";
    const action = vi.fn().mockResolvedValueOnce({ok: false, error: "stale"}).mockResolvedValue({ok: true});
    async function submit(current: {briefId: string; fingerprint: string}) {
      const pinned = bindings.forRequest(request, current);
      return recovery.run({key: JSON.stringify([pinned, request]), action: async id => {
        const result = await action(id, pinned);
        if (!result.ok) bindings.rejected(request, result.error);
        return result;
      }, onStart: () => {}, onSettled: () => {}, onAccepted: () => bindings.accepted(request),
      processingError: "busy", unexpectedError: "uncertain"});
    }
    const predecessor = {briefId: "old-brief", fingerprint: "old-fingerprint"};
    const successor = {briefId: "new-brief", fingerprint: "new-fingerprint"};
    expect(await submit(predecessor)).toEqual({ok: false, error: "stale"});
    expect(await submit(successor)).toEqual({ok: true});
    expect(action.mock.calls).toEqual([["rejected-id", predecessor], ["fresh-id", successor]]);
  });
  it("does not unpin a request for other or uncertain failures", () => {
    const bindings = createDocumentaryRequestBindings();
    const original = {briefId: "old", fingerprint: "old"};
    bindings.forRequest("request", original);
    for (const error of ["uncertain", "processing", "save"]) {
      bindings.rejected("request", error);
      expect(bindings.forRequest("request", {briefId: "new", fingerprint: "new"})).toEqual(original);
    }
  });

});
