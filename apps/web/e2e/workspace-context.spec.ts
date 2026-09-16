import {randomBytes} from "node:crypto";
import {expect, test} from "@playwright/test";
import {waitForOneTimeCode} from "./support/mail";

test("personal registration needs no company and two tabs retain explicit context", async ({page, context, request}) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  for (const value of [supabaseUrl, base]) {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)) throw new Error("Synthetic local services required");
  }
  const id = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const email = `e2e-context-${id}@example.com`, password = `Offroad-E2E-${id}!`;
  await page.goto(`${base}/pt-BR/signup`);
  await expect(page.locator('input[name="job_title"], input[name="legal_identifier"]')).toHaveCount(0);
  await page.locator('input[name="full_name"]').fill("QA contexto pessoal");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirm_password"]').fill(password);
  await page.locator("form.auth-form--registration button[type=submit]").click();
  await expect(page).toHaveURL(/\/signup\/verify/);
  await page.locator('input[name="token"]').fill(await waitForOneTimeCode(email));
  await page.locator("form.auth-form--verification button[type=submit]").click();
  await expect(page).toHaveURL(/\/pt-BR\/app(?:\?|$)/);
  await expect(page.locator(".advisor-composer--start")).toBeVisible();
  await expect(page.locator('input[name="legal_identifier"]')).toHaveCount(0);
  await page.goto(`${base}/pt-BR/app/new?setup=terms`);
  await expect(page.locator('.private-project-gate--terms')).toBeVisible();
  await expect(page.locator('input[name="signatory_title"]')).toHaveCount(0);
  await page.locator('input[name="terms_agreed"]').check();
  await page.locator('input[name="information_rights_declared"]').check();
  await page.locator('.private-project-gate__form button[type="submit"]').click();
  await expect(page.locator('.private-project-gate__accepted').first()).toBeVisible();

  const apikey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const signIn = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {headers: {apikey}, data: {email, password}});
  expect(signIn.ok()).toBe(true);
  const token = (await signIn.json()).access_token as string;
  const headers = {apikey, Authorization: `Bearer ${token}`};
  const current = await request.post(`${supabaseUrl}/rest/v1/rpc/get_workspace_context_v1`, {headers, data: {}});
  expect(current.ok()).toBe(true);
  const personal = await current.json();
  expect(personal.workspace_kind).toBe("personal");
  expect(personal.capabilities.origination_representation).toBe(false);
  const create = await request.post(`${supabaseUrl}/rest/v1/rpc/create_organization_with_owner_v1`, {
    headers, data: {p_organization_type: "institutional", p_name: `Instituição sintética ${id}`},
  });
  expect(create.ok()).toBe(true);
  const secondId = await create.json() as string;
  await page.goto(`${base}/pt-BR/app`);
  await expect(page).toHaveURL(/\/pt-BR\/workspaces$/);
  const other = await context.newPage();
  await page.goto(`${base}/pt-BR/app?workspace=${personal.organization_id}`);
  await other.goto(`${base}/pt-BR/app?workspace=${secondId}`);
  await expect(other.locator(".workspace-context-navigation")).toContainText(`Instituição sintética ${id}`);
  await expect(page.locator(".workspace-context-navigation")).not.toContainText(`Instituição sintética ${id}`);
  await context.addCookies([{name: "offroad-workspace", value: secondId, url: base}]);
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`workspace=${personal.organization_id}`));
  await expect(page.locator(".workspace-context-navigation")).not.toContainText(`Instituição sintética ${id}`);
  const retarget = await page.request.post(`${base}/pt-BR/app/access?workspace=${secondId}`, {
    headers: {referer: `${base}/pt-BR/app/access?workspace=${personal.organization_id}`}, data: {},
  });
  expect(retarget.status()).toBe(400);
  // A caller cannot inject the proxy's internal selection header.
  const forged = await page.request.get(`${base}/pt-BR/app`, {headers: {"x-offroad-workspace": secondId}, maxRedirects: 0});
  expect(forged.headers().location).toContain("/workspaces");
});
