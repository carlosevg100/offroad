import {execFileSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {expect, test, type Page} from "@playwright/test";
import messages from "../messages/pt-BR.json";

test("customer grants and revokes private access while workspace tabs stay isolated", async ({browser}) => {
  const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  for (const value of [databaseUrl, supabaseUrl, process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"])
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)) throw new Error("Access E2E requires local synthetic services.");
  const prefix = randomBytes(4).toString("hex");
  const id = (suffix: string) => `${prefix}-0000-4000-9000-${suffix.padStart(12, "0")}`;
  const userB = `${prefix}-0000-4000-8000-000000000002`;
  const emailA = `${prefix}-a@example.invalid`, emailB = `${prefix}-b@example.invalid`;
  const sql = readFileSync(join(__dirname, "support/resource-access-local.sql"), "utf8")
    .replaceAll("a11e0000", prefix).replaceAll("a11e-a@example.invalid", emailA).replaceAll("a11e-b@example.invalid", emailB);
  execFileSync("psql", [databaseUrl, "-q", "-v", "ON_ERROR_STOP=1"], {input: sql, stdio: ["pipe", "pipe", "pipe"]});
  const contextOptions = {baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"};
  const owner = await browser.newContext(contextOptions), member = await browser.newContext(contextOptions);
  const a = await owner.newPage(), b = await member.newPage();
  async function login(page: Page, email: string) {
    await page.goto("/pt-BR/login");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill("Synthetic-Access!2026");
    await page.locator('form button[type="submit"]').click();
    await expect(page).not.toHaveURL(/\/login/);
  }
  const objectPath = `${id("1")}/${id("3")}/synthetic.txt`;
  const auth = await owner.request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: {apikey: key}, data: {email: emailA, password: "Synthetic-Access!2026"},
  });
  expect(auth.ok()).toBeTruthy();
  const token = (await auth.json()).access_token as string;
  const storageHeaders = {apikey: key, authorization: `Bearer ${token}`};
  const upload = await owner.request.post(`${supabaseUrl}/storage/v1/object/opportunity-documents/${objectPath}`, {
    headers: {...storageHeaders, "content-type": "text/plain"}, data: "Synthetic confidential source bytes.",
  });
  expect(upload.ok()).toBeTruthy();
  try {
    await login(a, emailA);
    await login(b, emailB);
    await b.goto("/pt-BR/workspaces");
    await b.getByRole("link", {name: "Synthetic 1B organization", exact: true}).click();
    await expect(b).toHaveURL(new RegExp(`workspace=${id("1")}`));
    const documentUrl = `/pt-BR/app/documents/${id("4")}?workspace=${id("1")}`;
    expect((await b.request.get(documentUrl)).status()).toBe(404);
    expect((await b.request.get(`/pt-BR/app/case/${id("3")}?workspace=${id("1")}`)).status()).toBe(404);
    await b.goto(`/pt-BR/app/access?workspace=${id("1")}`);
    await expect(b.getByText(messages.WorkspaceAccess.denied, {exact: true})).toBeVisible();
    await expect(b.locator('input[name="email"]')).toHaveCount(0);
    await a.goto(`/pt-BR/app/access?workspace=${id("1")}`);
    const grant = a.locator('form').filter({has: a.locator('input[name="command"][value="grant"]')});
    await grant.locator('select[name="user"]').selectOption(userB);
    await grant.locator('select[name="resource"]').selectOption(id("2"));
    await grant.locator('select[name="action"]').selectOption("read");
    await grant.getByRole("button", {name: messages.WorkspaceAccess.grant, exact: true}).click();
    await expect(a.getByRole("status")).toHaveText(messages.WorkspaceAccess.saved);
    const allowed = await b.request.get(documentUrl);
    expect(allowed.status()).toBe(200);
    expect(allowed.headers()["cache-control"]).toContain("no-store");
    expect(await allowed.text()).toBe("Synthetic confidential source bytes.");
    // Even a currently authorized reader cannot mint a bearer URL that survives revocation.
    const sign = await owner.request.post(`${supabaseUrl}/storage/v1/object/sign/opportunity-documents/${objectPath}`, {
      headers: storageHeaders, data: {expiresIn: 3600},
    });
    expect(sign.ok()).toBeFalsy();
    const revoke = a.locator('form').filter({has: a.locator(`input[name="user"][value="${userB}"]`)})
      .filter({has: a.locator('input[name="command"][value="revoke"]')});
    await revoke.getByRole("button", {name: messages.WorkspaceAccess.revoke, exact: true}).click();
    await expect(a.getByRole("status")).toHaveText(messages.WorkspaceAccess.saved);
    expect((await b.request.get(documentUrl)).status()).toBe(404);
    // A second tab has its own URL context; opening the first does not retarget its action.
    const second = await member.newPage();
    await second.goto(`/pt-BR/app/access?workspace=${id("20")}`);
    await b.goto(`/pt-BR/app/access?workspace=${id("1")}`);
    const invite = second.locator('form').filter({has: second.locator('input[name="command"][value="invite"]')});
    await invite.locator('input[name="email"]').fill(`${prefix}-invited@example.invalid`);
    await invite.getByRole("button", {name: messages.WorkspaceAccess.invite, exact: true}).click();
    await expect(second.getByRole("status")).toHaveText(messages.WorkspaceAccess.saved);
    await expect(second).toHaveURL(new RegExp(`workspace=${id("20")}`));
    const invitedOrganization = execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1", "-c",
      `select organization_id from public.organization_invites where invited_by='${userB}' order by created_at desc limit 1`], {encoding: "utf8"}).trim();
    expect(invitedOrganization).toBe(id("20"));
    expect((await b.request.get("/pt-BR/app?workspace=invalid")).status()).toBe(400);
  } finally {
    const removed = await owner.request.delete(`${supabaseUrl}/storage/v1/object/opportunity-documents`, {
      headers: storageHeaders, data: {prefixes: [objectPath]},
    });
    expect(removed.ok()).toBeTruthy();
    await owner.close();
    await member.close();
  }
});
