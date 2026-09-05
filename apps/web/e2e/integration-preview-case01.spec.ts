import {randomBytes} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";

import {expect, test, type BrowserContext, type Page} from "@playwright/test";

import {waitForOneTimeCode} from "./support/mail";

/**
 * The Case 01 endgame inside the product, in integration_preview mode, against a local stack
 * running the worker: prompt → alignment → research and analysis → first readout with objects,
 * sources, gaps and alternatives → "vamos preparar o material" → material plan → question about a
 * number → premise change → incremental update. Every assistant message carries the preview mark,
 * every object comes from an executor of a method in the implemented rung, and no model is called.
 *
 * The run is recorded (video on) and its transcript is written next to the test results.
 */
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

async function send(page: Page, message: string) {
  transcript.push(`\n**Analista:** ${message}\n`);
  await page.locator(".advisor-composer textarea").fill(message);
  await page.locator(".advisor-composer__send").click();
  await expect(page.locator(".advisor-thread__message.is-user").last()).toContainText(message.slice(0, 40));
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
    context = await browser.newContext();
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
    await expect(page).toHaveURL(/\/pt-BR\/onboarding/);
    await page.locator('input[name="use_forms"][value="institutional_work"]').check();
    await page.locator('input[name="institution_name"]').fill("Banco Preview");
    await page.locator('input[name="professional_roles"][value="banker"]').check();
    await page.locator('input[name="practice_areas"][value="investment_banking"]').check();
    await page.locator('input[name="practice_areas"][value="dcm"]').check();
    await page.locator('input[name="primary_objectives"][value="prepare_meetings"]').check();
    await page.locator(".professional-context__actions .button:not(.button--ghost)").click();
    await expect(page.locator(".intake-start")).toBeVisible();
    await page.goto("/pt-BR/app");
    await expect(page.locator(".advisor-start")).toBeVisible();
    await page.screenshot({path: join(outputDirectory, "01-workspace.png"), fullPage: true});
  });

  test("prompt: the first turn starts the analysis and names the three points to align with the VP", async () => {
    const prompt = "Sou analista no time de Investment Banking. Meu VP me pediu para preparar material para uma reunião com a Camil na segunda. Ele falou em refinanciamento, mas não disse que tese quer levar nem que formato espera.";
    transcript.push(`\n**Analista:** ${prompt}\n`);
    await page.locator(".advisor-composer--start textarea").fill(prompt);
    await page.locator(".advisor-composer--start .advisor-composer__send").click();
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
    await page.screenshot({path: join(outputDirectory, "02-alignment.png"), fullPage: true});
  });

  test("research and analysis: the first readout arrives with the nine objects, their states, gaps and alternatives", async () => {
    const readout = await waitForAssistant(page, /Primeira devolutiva do Caso 01/, 240_000);
    expect(readout).toContain(MARK);
    expect(readout).toMatch(/Mapear a dívida instrumento a instrumento: incompleto/);
    expect(readout).toMatch(/Comparar as alternativas antes e depois: comparado/);
    expect(readout).toMatch(/Lacunas declaradas/);
    expect(readout).toMatch(/Para alinhar com o VP/);
    record("primeira devolutiva", readout);
    const work = page.locator('[data-testid="integration-preview-work"]');
    await expect(work).toBeVisible();
    await expect(work.locator(".preview-work__section")).toHaveCount(9);
    await expect(work.locator('[data-artifact-type="preview_debt_ledger"] .preview-work__state')).toContainText("incompleto");
    await expect(work.locator('[data-artifact-type="preview_alternatives"] .preview-work__state')).toContainText("comparado");
    await expect(work.locator('[data-artifact-type="preview_covenants"] .preview-work__gaps')).toBeVisible();
    await expect(page.locator(".advisor-context-section--activity > div small")).toHaveText("9/9");
    await page.screenshot({path: join(outputDirectory, "03-readout.png"), fullPage: true});
  });

  test("material: the transition plans three pitch pages from the signed objects", async () => {
    await send(page, "Vamos preparar o material: meu VP quer três páginas de pitch, situação atual, alternativas e impacto nos indicadores.");
    const acknowledged = await waitForAssistant(page, /Vou planejar o material a partir dos objetos já assinados: 3 páginas/);
    record("transição para o material", acknowledged);
    const plan = await waitForAssistant(page, /Plano do material a partir dos objetos assinados/);
    expect(plan).toMatch(/Estado do plano: (planejado|proposto|proposed)/);
    record("plano do material", plan);
    const brief = page.locator('[data-artifact-type="preview_meeting_brief"]');
    await expect(brief).toBeVisible();
    await expect(brief.locator(".preview-work__pages ol li")).toHaveCount(3);
    await page.screenshot({path: join(outputDirectory, "04-material-plan.png"), fullPage: true});
  });

  test("question: a number is traced back to its object, definition and anchors", async () => {
    await send(page, "De onde saiu essa alavancagem de 4,7x?");
    const answer = await waitForAssistant(page, /reconcile-covenant-definitions/);
    expect(answer).toContain(MARK);
    expect(answer).toMatch(/deb-1[1345]/);
    record("origem do número", answer);
  });

  test("premise change: only the alternatives and the plan recompute, the rest replays by fingerprint", async () => {
    await send(page, "Altere a taxa da nova dívida para 15,50% a.a.");
    const acknowledged = await waitForAssistant(page, /Premissa registrada \(taxa da nova dívida 15[.,]50% a\.a\.\)/);
    record("premissa alterada", acknowledged);
    const updated = await waitForAssistant(page, /7 de 9 etapas replicaram sem recálculo/);
    expect(updated).toContain(MARK);
    record("atualização incremental", updated);
    await expect(page.locator('[data-artifact-type="preview_alternatives"] .preview-work__premises')).toContainText("newDebtAnnualRate = 0.155");
    await page.screenshot({path: join(outputDirectory, "05-incremental-update.png"), fullPage: true});
    expect(projectUrl).toMatch(/\/pt-BR\/app\/projects\//);
  });
});
