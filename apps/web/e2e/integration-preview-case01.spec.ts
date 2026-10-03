import {startLegacyConversation} from "./support/legacy-conversation";
import {useLegacyCompanyFixture} from "./support/legacy-workspace";
import {randomBytes} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";

import {expect, test, type BrowserContext, type Page} from "@playwright/test";

import {waitForOneTimeCode} from "./support/mail";

/** Historical preview is readable only. Its unbound approval may never launch
 * analysis or materials. Native capture, licensed sources and execution are
 * verified by the replacement preview consumer gate, not by replaying this route. */
// Playwright loads specs as CommonJS here, so the directory comes from __dirname, as the other journey does.
const here = __dirname;
const runId = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
const account = {email: `e2e-preview-${runId}@example.com`, password: `Offroad-E2E-${runId}!`, fullName: "Analista Preview"};
const outputDirectory = join(here, "..", "test-results", "integration-preview-case01");
const transcript: string[] = [];
const MARK = "[Validação interna, integration_preview]";

test.use({video: "on"});
test.describe.configure({mode: "serial"});

async function assistantMessages(page: Page): Promise<string[]> {
  return page.locator(".advisor-thread__message.is-assistant > div > p:first-of-type").allInnerTexts();
}

/** The worker answers asynchronously; the page refreshes while work is active, and the test reloads otherwise. */
async function waitForAssistant(page: Page, pattern: RegExp, timeoutMs = 180_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = await assistantMessages(page);
    const found = messages.find((message) => pattern.test(message));
    if (found) return found;
    await page.waitForTimeout(4_000);
    await page.reload();
  }
  throw new Error(`no assistant message matched ${pattern} within ${timeoutMs} ms; last messages: ${JSON.stringify(await assistantMessages(page)).slice(0, 2_000)}`);
}

function record(step: string, message: string) {
  transcript.push(`\n**Offroad (${step}):** ${message}\n`);
}

test.describe("integration_preview: Case 01 end to end", () => {
  let context: BrowserContext;
  let page: Page;
  let projectUrl = "";

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

  test("signs up a banker and sees the internal validation banner", async () => {
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
    await page.screenshot({path: join(outputDirectory, "01-workspace.png"), fullPage: true});
  });

  test("prompt: the first turn proposes analysis and names the three points to align with the VP", async () => {
    const prompt = "Sou analista no time de Investment Banking. Meu VP me pediu para preparar material para uma reunião com a Camil na segunda. Ele falou em refinanciamento, mas não disse que tese quer levar nem que formato espera.";
    transcript.push(`\n**Analista:** ${prompt}\n`);
    // This frozen preview evaluates the legacy executor, not the new intake-free entry.
    const historicalWorkId = startLegacyConversation(account.email, prompt);
    await page.goto(`/pt-BR/app/projects/${historicalWorkId}`);
    await expect(page).toHaveURL(/\/pt-BR\/app\/projects\/[0-9a-f-]+$/);
    projectUrl = page.url();
    // The internal validation banner sits on every workspace screen of a granted organization.
    await expect(page.locator('[data-testid="integration-preview-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="integration-preview-banner"]')).toContainText("integration_preview");
    const alignment = await waitForAssistant(page, /\(1\) leitura de refinanciamento/);
    expect(alignment).toContain(MARK);
    expect(alignment).toMatch(/\(2\) reunião exploratória/);
    expect(alignment).toMatch(/\(3\) briefing interno/);
    record("alinhamento", alignment);
    // The person sees the request-specific plan before the long-running analysis returns. This is
    // the product agreement, not a generic activity list and not the internal TaskSpec graph.
    const executionBrief = page.getByTestId("execution-brief");
    await expect(executionBrief).toBeVisible();
    await expect(executionBrief.locator("h2")).toHaveText("Plano deste trabalho");
    await expect(executionBrief.locator(".execution-brief-card__objective")).toContainText("Camil");
    await expect(executionBrief.locator(".execution-brief-card__workstreams > li")).toHaveCount(4);
    await expect(executionBrief).toContainText("Conferir balanço, caixa e dívida da Camil");
    await expect(executionBrief).toContainText("Testar serviço da dívida, covenants e downside");
    await expect(executionBrief).toContainText("Comparar os caminhos de refinanciamento");
    await expect(executionBrief).toContainText("Planejar a devolutiva");
    const visiblePlanText = await executionBrief.innerText();
    expect(visiblePlanText).not.toMatch(/sourceTaskIds|executionAuthority|TaskSpec|\b[CDKMSA][0-9]{2}\b/);
    await page.screenshot({path: join(outputDirectory, "02-alignment.png"), fullPage: true});
  });

  test("an unbound historical preview remains readable but cannot authorize a readout", async () => {
    const panel = page.locator('.execution-brief-card__approval');
    await expect(panel).toHaveAttribute("data-approval-status", "awaiting");
    await expect(panel.getByRole("button")).toBeDisabled();
    await expect(page.getByTestId("preview-decision-artifact")).toHaveCount(0);
    expect((await assistantMessages(page)).join("\n")).not.toMatch(/Concluí a primeira leitura financeira/);
    await page.reload();
    expect(page.url()).toBe(projectUrl);
    await expect(panel.getByRole("button")).toBeDisabled();
    await expect(page.getByTestId("preview-decision-artifact")).toHaveCount(0);
    record("barreira", "O executor histórico sem captura/revisão nativa não autoriza análise ou materiais.");
  });
});
