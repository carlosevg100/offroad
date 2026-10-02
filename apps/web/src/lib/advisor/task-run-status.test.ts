import {expect, test} from "vitest";
import {effectiveTaskRunStatus} from "./task-run-status";
const now = Date.parse("2026-10-02T12:00:00Z");
test.each(["waiting", "queued", "succeeded", "failed", "blocked", "cancelled"])("preserves the task's recorded %s state independently of later job closure", status => {
  expect(effectiveTaskRunStatus(status, {status: "failed", lease_expires_at: null}, now)).toBe(status);
});
test.each(["failed", "cancelled"])("a running task follows its bound terminal %s job", status => {
  expect(effectiveTaskRunStatus("running", {status, lease_expires_at: "2026-10-02T12:10:00Z"}, now)).toBe(status);
});
test.each([null, {status: "leased", lease_expires_at: null}, {status: "leased", lease_expires_at: "invalid"},
  {status: "leased", lease_expires_at: "2026-10-02T12:00:00Z"}, {status: "succeeded", lease_expires_at: null},
  {status: "awaiting_approval", lease_expires_at: null}])("cannot present missing, expired or closed authority as execution: %j", job => {
  expect(effectiveTaskRunStatus("running", job, now)).toBe("blocked");
});
test("a resumed task is queued until its bound job has a new live lease", () => {
  expect(effectiveTaskRunStatus("running", {status: "queued", lease_expires_at: null}, now)).toBe("queued");
  expect(effectiveTaskRunStatus("running", {status: "leased", lease_expires_at: "2026-10-02T12:00:01Z"}, now)).toBe("running");
});
