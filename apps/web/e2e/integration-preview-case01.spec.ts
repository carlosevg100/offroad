import {startLegacyConversation} from "./support/legacy-conversation";
import {useLegacyCompanyFixture} from "./support/legacy-workspace";
import {randomBytes} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";

import {expect, test, type BrowserContext, type Page} from "@playwright/test";

import {waitForOneTimeCode} from "./support/mail";

/** Stage 23: even a historical preview grant cannot expose the retired production route.
 * Technical router/native execution proofs remain in unit and physical SDK gates. */
// Playwright loads specs as CommonJS here, so the directory comes from __dirname, as the other journey does.
const here = __dirname;
const runId = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
const account = {email: `e2e-preview-${runId}@example.com`, password: `Offroad-E2E-${runId}!`, fullName: "Analista Preview"};
const outputDirectory = join(here, "..", "test-results", "integration-preview-case01");
const transcript: string[] = [];
test.use({video: "on"});
test.describe.configure({mode: "serial"});

async function assistantMessages(page: Page): Promise<string[]> {
  return page.locator(".advisor-thread__message.is-assistant > div > p:first-of-type").allInnerTexts();
}

function state(workId: string) {
  if (!/^[0-9a-f-]{36}$/.test(workId)) throw new Error("Invalid synthetic work identity");
  const url = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) throw new Error("Retirement proof requires a local synthetic database");
  const query = `select jsonb_build_object('status',j.status,'error',j.last_error,'attempts',j.attempts,'modelCalls',j.model_calls,'modelCostUsd',j.model_cost_usd,
    'previewGranted',exists(select 1 from private.integration_preview_grants g where g.organization_id=j.organization_id and g.enabled),
    'artifacts',(select count(*)from public.capital_project_artifacts a where a.capital_project_id='${workId}'and a.artifact_type like 'preview_%'))
    from public.processing_jobs j where j.kind='agent_operation_brief'and(j.work_id='${workId}'or j.intake_session_id in(select id from public.document_intake_sessions where capital_project_id='${workId}')) order by j.created_at desc limit 1`;
  const value=execFileSync("psql",[url,"-qAt","-v","ON_ERROR_STOP=1","-c",query],{encoding:"utf8"}).trim();
  return value ? JSON.parse(value) : null;
}

function record(step: string, message: string) {
  transcript.push(`\n**Offroad (${step}):** ${message}\n`);
}

test.describe("retired integration preview cannot enter production", () => {
  let context: BrowserContext;
  let page: Page;
  let projectUrl = "";
  let workId = "";

  test.beforeAll(async ({browser}) => {
    mkdirSync(outputDirectory, {recursive: true});
    // The video is the gate's recording: a manually created context records only when asked to,
    // and the file is finalized when the context closes in afterAll.
    context = await browser.newContext({viewport: {width: 1366, height: 900}, recordVideo: {dir: join(outputDirectory, "video"), size: {width: 1366, height: 900}}});
    page = await context.newPage();
  });

  test.afterAll(async () => {
    writeFileSync(join(outputDirectory, "transcript.md"), `# Caso 01 em integration_preview (${new Date().toISOString()})\n${transcript.join("")}\n`);
    await context?.close();
  });

  test("signs up an explicitly granted historical account without exposing the retired banner", async () => {
    await page.goto("/pt-BR/signup");
    await page.locator('input[name="full_name"]').fill(account.fullName);
    await page.locator('input[name="email"]').fill(account.email);
    await page.locator('input[name="password"]').fill(account.password);
    await page.locator('input[name="confirm_password"]').fill(account.password);
    await page.locator("form.auth-form--registration button[type=submit]").click();
    await expect(page).toHaveURL(/\/pt-BR\/signup\/verify/);
    const code = await waitForOneTimeCode(account.email);
    await page.locator('input[name="token"]').fill(code);
    await page.locator("form.auth-form--verification button[type=submit]").click();
    await useLegacyCompanyFixture(page, account.email);
    await expect(page).toHaveURL(/\/pt-BR\/onboarding/);
    await expect(page.locator(".intake-start")).toBeVisible();
    // Account onboarding ends with the one-time confidentiality acceptance and the first private
    // project. Only after that gate does the organization enter the conversational workspace.
    await page.goto("/pt-BR/onboarding?setup=terms&job=capital_planning");
    await expect(page.locator(".private-project-gate--terms h2")).toHaveText("Antes de começar, protegemos suas informações.");
    await page.locator('input[name="signatory_title"]').fill("Analista de Investment Banking");
    await page.locator('input[name="terms_agreed"]').check();
    await page.locator('input[name="information_rights_declared"]').check();
    await page.locator('.private-project-gate__form button[type="submit"]').click();
    await expect(page.locator(".private-project-gate--project")).toBeVisible();
    await page.locator('input[name="project_name"]').fill("Onboarding (validação interna)");
    await page.locator('.private-project-gate__form button[type="submit"]').click();
    await expect(page.locator(".intake-collect")).toBeVisible();
    await page.goto("/pt-BR/app");
    await expect(page.locator(".advisor-start")).toBeVisible();
    await expect(page.getByTestId("integration-preview-banner")).toHaveCount(0);
    await page.screenshot({path: join(outputDirectory, "01-workspace.png"), fullPage: true});
  });

  test("historical grant cannot launch preview context, model calls or artifacts", async () => {
    const prompt = "Prepare material for a historical refinancing preview";
    workId = startLegacyConversation(account.email, prompt);
    await page.goto(`/pt-BR/app/projects/${workId}`);
    projectUrl = page.url();
    await expect(page.getByTestId("integration-preview-banner")).toHaveCount(0);
    await expect.poll(() => state(workId)?.status,{timeout:90_000}).toBe("failed");
    expect(state(workId)).toMatchObject({previewGranted:true,status:"failed",attempts:1,modelCalls:0,modelCostUsd:0,artifacts:0,error:{code:"integration_preview_retired",stage:"claim",retryable:false}});
    expect((await assistantMessages(page)).join("\n")).not.toMatch(/leitura de refinanciamento|Concluí a primeira leitura financeira/);
    await expect(page.getByTestId("preview-decision-artifact")).toHaveCount(0);
    record("barreira", "Historical grant was denied before context and gateway; zero calls and artifacts.");
  });

  test("reload does not revive a denied historical job or enable its readout", async () => {
    await page.reload();
    expect(page.url()).toBe(projectUrl);
    await expect(page.getByTestId("integration-preview-banner")).toHaveCount(0);
    await expect(page.getByTestId("preview-decision-artifact")).toHaveCount(0);
    expect(state(workId)).toMatchObject({status:"failed",attempts:1,modelCalls:0,artifacts:0,error:{code:"integration_preview_retired",retryable:false}});
  });
});
