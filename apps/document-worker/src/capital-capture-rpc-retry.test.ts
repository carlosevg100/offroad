import {afterEach, describe, expect, it, vi} from "vitest";
import {retryCapitalCaptureRpc} from "./capital-capture-rpc-retry";

afterEach(() => vi.useRealTimers());
describe("capital capture lock retry", () => {
  it("retries explicit lock conflicts and returns the successful response", async () => {
    vi.useFakeTimers();
    const command = vi.fn().mockResolvedValueOnce({error: {code: "40001", message: "capital_capture_retry"}})
      .mockResolvedValueOnce({error: {code: "40001", message: "capital_capture_retry"}})
      .mockResolvedValue({error: null, data: "original-receipt"});
    const response = retryCapitalCaptureRpc(command);
    await vi.runAllTimersAsync();
    expect(await response).toEqual({error: null, data: "original-receipt"});
    expect(command).toHaveBeenCalledTimes(3);
  });
  it.each([
    {code: "40001", message: "capital_capture_context_changed"},
    {code: "42501", message: "capital_capture_retry"},
    {code: "40001", message: "unknown_conflict"},
  ])("does not retry context changes, denial or unknown conflicts: %j", async error => {
    const command = vi.fn().mockResolvedValue({error});
    expect(await retryCapitalCaptureRpc(command)).toEqual({error});
    expect(command).toHaveBeenCalledTimes(1);
  });
  it("bounds retries and preserves the original error", async () => {
    vi.useFakeTimers();
    const error = {code: "40001", message: "capital_capture_retry"};
    const command = vi.fn().mockResolvedValue({error});
    const response = retryCapitalCaptureRpc(command);
    await vi.runAllTimersAsync();
    expect(await response).toEqual({error});
    expect(command).toHaveBeenCalledTimes(8);
  });
});
