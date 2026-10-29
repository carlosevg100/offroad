import {execFileSync} from "node:child_process";
import {createHash, randomBytes} from "node:crypto";
import {expect, test} from "@playwright/test";

import {waitForOneTimeCode} from "./support/mail";

test("a folder larger than twenty files survives a partial failure and a same-selection retry", async ({page}, testInfo) => {
  const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  for (const value of [databaseUrl, process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"])
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)) throw new Error("Upload proof requires isolated local services.");
  const sql = (query: string) => execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1"], {input: query, encoding: "utf8"}).trim();
  const runId = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const email = `e2e-upload-${runId}@example.com`, password = `Offroad-E2E-${runId}!`;
  await page.goto("/pt-BR/signup");
  await page.locator('input[name="full_name"]').fill("QA upload sintético");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirm_password"]').fill(password);
  await page.locator("form.auth-form--registration button[type=submit]").click();
  await expect(page).toHaveURL(/\/pt-BR\/signup\/verify/);
  await page.locator('input[name="token"]').fill(await waitForOneTimeCode(email));
  await page.locator("form.auth-form--verification button[type=submit]").click();
  await expect(page).toHaveURL(/\/pt-BR\/app(?:\?|$)/);
  await page.locator(".advisor-composer--start textarea").fill(`Preciso organizar os documentos da companhia. Teste sintético ${runId}`);
  await page.locator(".advisor-composer--start textarea").press("Enter");
  await expect(page).toHaveURL(/\/app\/projects\/[0-9a-f-]{36}/);
  const projectId = new URL(page.url()).pathname.split("/").at(-1)!;
  expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
  // Accept synthetic owner's terms through the same authenticated command as the existing readiness journey.
  sql(`begin;select set_config('request.jwt.claim.sub',(select created_by::text from public.capital_projects where id='${projectId}'),true);select set_config('request.headers',json_build_object('x-offroad-workspace',(select organization_id from public.capital_projects where id='${projectId}'))::text,true);set local role authenticated;select public.accept_private_workspace_terms('pt-BR','Synthetic upload owner','',true,true);select public.prepare_work_document_intake_v1('${projectId}','pt-BR');commit;`);
  // This journey proves the production enqueue branch. Fresh local workspaces deliberately
  // default to the deterministic fixture path, which publishes no worker jobs.
  sql(`begin;update public.organizations set pipeline_enabled=true where id=(select organization_id from public.capital_projects where id='${projectId}');update public.organization_rollout_policies set state='canary',promotion_basis='Synthetic isolated upload enqueue proof' where organization_id=(select organization_id from public.capital_projects where id='${projectId}');commit;`);
  await page.reload();

  const files = Array.from({length: 31}, (_, index) => ({name: `synthetic-${index + 1}.csv`, mimeType: "text/csv", buffer: Buffer.from(`metric,value\nliquidity.available_cash,${index + 1}\n`)}));
  const storageRoute = "**/storage/v1/object/opportunity-documents/**";
  const registrationRoute = "**/rest/v1/rpc/register_intake_document_command";
  let lostAcknowledgment = false;
  await page.route(registrationRoute, async (route) => {
    if (!lostAcknowledgment && route.request().postDataJSON()?.p_original_name === "synthetic-3.csv") {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      lostAcknowledgment = true;
      // The command committed; only its response to the browser is lost.
      await route.abort("failed");
    } else await route.continue();
  });
  await page.route(storageRoute, async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("-synthetic-2.csv")) {
      await route.fulfill({status: 503, contentType: "application/json", body: JSON.stringify({message: "Synthetic unavailable storage request"})});
    } else await route.continue();
  });
  const input = page.locator('.advisor-composer input[type="file"]');
  const chooseFiles = async (selected: typeof files) => {
    // The real chooser proves that the client handler is active after reload. Assigning
    // files directly to the SSR input can dispatch change before React has hydrated it.
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", {name: "Anexar documentos", exact: true}).click(),
    ]);
    await chooser.setFiles(selected);
  };
  await chooseFiles([...files, {name: "synthetic-refused.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ")}]);
  const sourceQuery = `select d.id,d.original_name,d.sha256 from public.source_documents d join public.document_intake_sessions s on s.id=d.intake_session_id where s.capital_project_id='${projectId}'`;
  await expect.poll(() => sql(`select count(*) from (${sourceQuery}) d`), {timeout: 120_000}).toBe("30");
  await expect(input).toBeEnabled({timeout: 120_000});
  await expect(input).toHaveValue("");
  expect(lostAcknowledgment).toBe(true);
  await expect(page.locator("ul.form-notice--error li")).toHaveText(["synthetic-2.csv", "synthetic-refused.exe"]);
  await testInfo.attach("partial-upload-desktop", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});
  const viewport = page.viewportSize()!;
  await page.setViewportSize({width: 390, height: 844});
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await testInfo.attach("partial-upload-mobile", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});
  await page.setViewportSize(viewport);
  // A failed sibling must not leave the thirty registered files without any processing run.
  await expect.poll(() => sql(`select count(*) from public.processing_jobs j join public.document_intake_sessions s on s.id=j.intake_session_id where s.capital_project_id='${projectId}'`)).not.toBe("0");

  await page.unroute(storageRoute);
  await page.unroute(registrationRoute);
  await chooseFiles(files);
  await expect.poll(() => sql(`select count(*) from (${sourceQuery}) d`), {timeout: 120_000}).toBe("31");
  await expect(input).toBeEnabled({timeout: 120_000});
  await expect(input).toHaveValue("");
  await expect(page.locator(".form-notice--error")).toHaveCount(0);
  const stored = JSON.parse(sql(`select json_agg(d) from (${sourceQuery}) d`)) as {id: string; original_name: string; sha256: string}[];
  for (const file of files) expect(stored.find((row) => row.original_name === file.name)?.sha256).toBe(createHash("sha256").update(file.buffer).digest("hex"));
  expect(sql(`select count(*) from public.source_documents d join public.document_intake_sessions s on s.id=d.intake_session_id join storage.objects o on o.bucket_id=d.bucket_id and o.name=d.object_path where s.capital_project_id='${projectId}'`)).toBe("31");
  await testInfo.attach("upload-retry-accounting", {body: JSON.stringify({selected: 32, registeredBeforeRetry: 30, registeredAfterRetry: stored.length, hashesVerified: files.length}), contentType: "application/json"});
});
