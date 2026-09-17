import {execFileSync, spawn} from "node:child_process";
import {randomBytes} from "node:crypto";
import {createServer} from "node:net";
import {join} from "node:path";
import {expect, test} from "@playwright/test";
import {waitForOneTimeCode} from "./support/mail";

test("standalone work persists through logout and receives documents without changing identity", async ({page, context}) => {
  const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  for (const value of [databaseUrl, base, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"]) {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)) throw new Error("Synthetic local services required");
  }
  const id = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const email = `e2e-persistent-${id}@example.com`, password = `Offroad-E2E-${id}!`;
  const sql = (query: string) => execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1"], {input: query, encoding: "utf8"}).trim();
  await page.goto("/pt-BR/signup");
  await page.locator('input[name="full_name"]').fill("QA trabalho persistente");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirm_password"]').fill(password);
  await page.locator("form.auth-form--registration button[type=submit]").click();
  await expect(page).toHaveURL(/\/signup\/verify/);
  await page.locator('input[name="token"]').fill(await waitForOneTimeCode(email));
  await page.locator("form.auth-form--verification button[type=submit]").click();
  await expect(page).toHaveURL(/\/pt-BR\/app(?:\?|$)/);
  const question = `Quais questões orientam uma decisão de estrutura de capital? ${id}`;
  await page.locator(".advisor-composer--start textarea").fill(question);
  await page.locator(".advisor-composer--start textarea").press("Enter");
  await expect(page).toHaveURL(/\/app\/projects\/[0-9a-f-]{36}/);
  const workId = new URL(page.url()).pathname.split("/").at(-1)!;
  expect(workId).toMatch(/^[0-9a-f-]{36}$/);
  const workUrl = page.url();
  await expect(page.locator(".advisor-thread")).toContainText(question);
  const state = JSON.parse(sql(`select json_build_object(
    'company',p.company_id,'folder',p.workspace_group_id,
    'intakes',(select count(*) from public.document_intake_sessions where capital_project_id=p.id),
    'plans',(select count(*) from public.capital_project_plans where capital_project_id=p.id),
    'workMessages',(select count(*) from public.agent_messages where work_id=p.id))
    from public.capital_projects p where p.id='${workId}';`));
  expect(state).toEqual({company: null, folder: null, intakes: 0, plans: 0, workMessages: 1});
  // This synthetic transport history is explicitly not a model-quality evaluation.
  // Runtime publication, capability and revocation are exercised by the SQL/worker contracts.
  sql(`begin;
    select set_config('request.jwt.claim.sub',(select created_by::text from public.capital_projects where id='${workId}'),true);
    update public.processing_jobs set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null where work_id='${workId}' and status in ('queued','leased');
    update public.agent_messages set status='completed',error_code=null where work_id='${workId}' and role='user';
    insert into public.agent_messages(id,organization_id,work_id,conversation_id,role,status,content,locale,reply_to_message_id,metadata,created_by)
    select gen_random_uuid(),organization_id,work_id,conversation_id,'assistant','completed','Synthetic persisted transport response','pt-BR',id,'{"synthetic":true}',created_by from public.agent_messages where work_id='${workId}' and role='user';
    update public.agent_conversations set state='idle' where work_id='${workId}';
    commit;`);
  await page.reload();
  await expect(page.locator(".advisor-thread")).toContainText("Synthetic persisted transport response");
  // A fresh application process loads the same durable history. The shared test server
  // keeps running, so this deploy-resume check cannot interrupt the other journeys.
  const socket = createServer();
  await new Promise<void>(resolve => socket.listen(0, "127.0.0.1", resolve));
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("Test port unavailable");
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  const restarted = spawn(process.execPath, [join(__dirname, "..", "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(address.port)],
    {cwd: join(__dirname, ".."), env: process.env, stdio: "ignore"});
  const freshBase = new URL(base); freshBase.port = String(address.port);
  try {
    await expect.poll(async () => {
      try { return (await fetch(new URL("/pt-BR", freshBase))).status; } catch { return 0; }
    }, {timeout: 30_000}).toBe(200);
    const freshWork = new URL(workUrl); freshWork.port = String(address.port);
    await page.goto(freshWork.toString());
    await expect(page.locator(".advisor-thread")).toContainText(question);
    await expect(page.locator(".advisor-thread")).toContainText("Synthetic persisted transport response");
  } finally {
    restarted.kill("SIGTERM");
    await new Promise<void>(resolve => {
      if (restarted.exitCode !== null) return resolve();
      const timeout = setTimeout(() => {restarted.kill("SIGKILL"); resolve();}, 5000);
      restarted.once("exit", () => {clearTimeout(timeout); resolve();});
    });
  }
  await page.goto(workUrl);
  await context.clearCookies();
  await page.goto(workUrl);
  await expect(page).toHaveURL(/\/login/);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form.auth-form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/pt-BR\/app(?:\/|\?|$)/);
  await page.goto(workUrl);
  await expect(page.locator(".advisor-thread")).toContainText(question);
  await expect(page.locator(".advisor-thread")).toContainText("Synthetic persisted transport response");
  await page.goto("/pt-BR/app/new?setup=terms");
  await page.locator('input[name="terms_agreed"]').check();
  await page.locator('input[name="information_rights_declared"]').check();
  await page.locator('.private-project-gate__form button[type="submit"]').click();
  await expect(page.locator('.private-project-gate__accepted').first()).toBeVisible();
  await page.goto(workUrl);
  await page.locator('.advisor-composer input[type="file"]').setInputFiles({
    name: "synthetic-work-context.txt", mimeType: "text/plain", buffer: Buffer.from("Synthetic work continuation. No real company or financial data."),
  });
  await expect.poll(() => Number(sql(`select count(*) from public.source_documents d join public.document_intake_sessions s on s.id=d.intake_session_id where s.capital_project_id='${workId}';`))).toBe(1);
  await page.reload();
  await expect(page).toHaveURL(workUrl);
  await expect(page.locator(".advisor-thread")).toContainText(question);
  await expect(page.locator(".advisor-thread")).toContainText("Synthetic persisted transport response");
  expect(Number(sql(`select count(*) from public.document_intake_sessions where capital_project_id='${workId}';`))).toBe(1);
  await test.info().attach("persistent-work-after-upload", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});
});
