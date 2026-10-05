import {createHash, randomUUID} from "node:crypto";
import {expect, type APIResponse, type Page} from "@playwright/test";

/** Exercises the real source-gated route selection, queue and worker receipt before bytes.
 * Direct legacy GET is deliberately not an export command and must never be a raw fallback. */
export async function requestRoundtripDownload(page: Page, route: string): Promise<APIResponse> {
  const selectedUrl = new URL(route, page.url());selectedUrl.searchParams.set("exportContext", "1");
  const selected = await page.request.get(selectedUrl.href);
  expect(selected.status(), await selected.text()).toBe(200);
  const context = await selected.json() as {artifactId: string; revisionId: string; locale: string; format: string; variant: string};
  const endpoint = new URL(`/${context.locale}/app/artifacts/${context.artifactId}/exports`, page.url());
  const workspace = selectedUrl.searchParams.get("workspace");if (workspace) endpoint.searchParams.set("workspace", workspace);
  const queued = await page.request.post(endpoint.href, {headers: {origin: endpoint.origin}, data: {revisionId: context.revisionId, format: context.format, variant: context.variant, commandId: randomUUID()}});
  expect(queued.status(), await queued.text()).toBe(202);
  const result = (await queued.json()).result as {taskId?: string; receiptId: string | null};
  let receiptId = result.receiptId;
  if (!receiptId) {
    expect(result.taskId).toBeTruthy();
    const taskUrl = new URL(endpoint);taskUrl.searchParams.set("taskId", result.taskId!);
    await expect.poll(async () => {
      const response = await page.request.get(taskUrl.href);expect(response.status(), await response.text()).toBe(200);
      const task = (await response.json()).task as {status: string; receiptId: string | null; failureCode: string | null};
      expect(["failed", "cancelled"].includes(task.status), JSON.stringify(task)).toBe(false);
      receiptId = task.receiptId;return receiptId;
    }, {timeout: 90000}).not.toBeNull();
  }
  const downloaded = await page.request.get(route);
  expect(downloaded.status(), await downloaded.text()).toBe(200);
  const bytes = await downloaded.body();
  expect(downloaded.headers()["x-artifact-revision"]).toBe(context.revisionId);
  expect(downloaded.headers()["x-artifact-sha256"]).toBe(createHash("sha256").update(bytes).digest("hex"));
  expect(downloaded.headers()["cache-control"]).toContain("no-store");
  return downloaded;
}
