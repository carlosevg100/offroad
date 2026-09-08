import {randomBytes} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";

import {expect, test, type BrowserContext, type Page, type Route} from "@playwright/test";

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

/** Approval is explicit for each newly proposed immutable plan. Reload proves durable state. */
async function approveCurrentPlan(page: Page, loseAcceptedResponse = false) {
  const panel = page.locator('.execution-brief-card__approval');
  await expect.poll(async () => {
    await page.reload();
    return panel.getAttribute("data-approval-status");
  }, {timeout: 180_000}).toBe("awaiting");
  // Read the semantic text; innerText can apply CSS uppercase before/after hydration.
  const version = await page.getByTestId("execution-brief").locator(":scope > header > small").textContent();
  if (!version) throw new Error("the proposed execution brief has no displayed version");
  await page.reload();
  await expect(panel).toHaveAttribute("data-approval-status", "awaiting");
  await expect(page.getByTestId("execution-brief").locator(":scope > header > small")).toHaveText(version);
  let replayed = false;
  let responseLost = false;
  const replayAndLoseResponse = async (route: Route) => {
    if (!replayed && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      replayed = true;
      // Two concurrent deliveries of one command, then a lost client acknowledgement.
      // The database must preserve one accepted execution and reload must recover it.
      await Promise.all([route.fetch(), route.fetch()]);
      await route.abort("failed");
      responseLost = true;
    } else await route.continue();
  };
  if (loseAcceptedResponse) await page.route("**/*", replayAndLoseResponse);
  try {
    await panel.getByRole("button").click();
    if (loseAcceptedResponse) await expect.poll(() => responseLost, {timeout: 60_000}).toBe(true);
    await expect.poll(async () => {
      await page.reload();
      return panel.getAttribute("data-approval-status");
    }, {timeout: 60_000}).toBe("approved");
    if (loseAcceptedResponse) expect(replayed).toBe(true);
    await expect(panel.locator('[role="alert"]')).toHaveCount(0);
  } finally {
    if (loseAcceptedResponse) await page.unroute("**/*", replayAndLoseResponse);
  }
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
    await expect(page).toHaveURL(/\/pt-BR\/onboarding/);
    await page.locator('input[name="use_forms"][value="institutional_work"]').check();
    await page.locator('input[name="institution_name"]').fill("Banco Preview");
    await page.locator('input[name="professional_roles"][value="banker"]').check();
    await page.locator('input[name="practice_areas"][value="investment_banking"]').check();
    await page.locator('input[name="practice_areas"][value="dcm"]').check();
    await page.locator('input[name="primary_objectives"][value="prepare_meetings"]').check();
    await page.locator(".professional-context__actions .button:not(.button--ghost)").click();
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

  test("approval: proposed work survives reload and cannot produce a readout before acceptance", async () => {
    await expect(page.getByTestId("preview-decision-artifact")).toHaveCount(0);
    expect((await assistantMessages(page)).join("\n")).not.toMatch(/Concluí a primeira leitura financeira/);
    await approveCurrentPlan(page, true);
    record("aprovação", "A versão exibida foi aprovada explicitamente antes da análise.");
  });

  test("research and analysis: the first readout stops at the nine-step meeting plan", async () => {
    const readout = await waitForAssistant(page, /Concluí a primeira leitura financeira/, 240_000);
    expect(readout).toContain(MARK);
    expect(readout).toMatch(/Dívida bruta contábil: R\$\s?5\.670,2 milhões/);
    expect(readout).toMatch(/Pico de vencimentos — 2026\/27: R\$\s?1\.229,8 milhões/);
    expect(readout).toMatch(/Covenants e headroom ainda condicionais/);
    expect(readout).toMatch(/Modelo prospectivo integrado incompleto/);
    expect(readout).toMatch(/Para alinhar com o VP/);
    record("primeira devolutiva", readout);
    const work = page.getByTestId("preview-decision-artifact");
    await expect(work).toBeVisible();
    await expect(work.locator(".decision-work__metric")).toHaveCount(6);
    await expect(work.locator(".decision-work__metric").first()).toContainText("Dívida bruta contábil");
    await expect(work.locator(".decision-work__metric details")).toHaveCount(6);
    await expect(work.locator(".decision-work__section--gaps article")).toHaveCount(7);
    await expect(work).toContainText("O que ainda muda a decisão");
    await expect(work).toContainText("Covenants e headroom ainda condicionais");
    await expect(work.getByRole("link", {name: "Baixar planilha"})).toHaveCount(0);
    const executionBrief = page.getByTestId("execution-brief");
    await expect(executionBrief.locator('.execution-brief-card__workstreams > li[data-progress="completed"]')).toHaveCount(4);
    await expect(executionBrief.locator(".execution-brief-card__progress")).toHaveCount(4);
    await expect(executionBrief.locator(".execution-brief-card__progress").first()).toContainText("Concluída");
    const workstreamNarrative = page.getByTestId("execution-brief-activity");
    await expect(workstreamNarrative).toHaveCount(8);
    await expect(page.locator('[data-testid="execution-brief-activity"][data-kind="completed"]')).toHaveCount(4);
    await expect(workstreamNarrative.filter({hasText: "Conferir balanço, caixa e dívida da Camil"})).toHaveCount(2);
    const narrativeBeforeRefresh = await workstreamNarrative.allTextContents();
    expect(narrativeBeforeRefresh.join(" ")).not.toMatch(/TaskSpec|sourceTaskIds|executor|provider|processing_job|\b[CDKMSA][0-9]{2}\b/);
    await page.reload();
    await expect(page.getByTestId("execution-brief-activity")).toHaveCount(8);
    expect(await page.getByTestId("execution-brief-activity").allTextContents()).toEqual(narrativeBeforeRefresh);
    const firstActivity = page.locator(".advisor-thread__activity-event").first();
    await expect(firstActivity).toBeVisible();
    expect(await page.locator('[data-testid="execution-brief"], .advisor-thread__activity-event')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid") ?? "activity")))
      .toEqual(expect.arrayContaining(["execution-brief", "activity"]));
    expect(await page.locator('[data-testid="execution-brief"], .advisor-thread__activity-event')
      .first()
      .getAttribute("data-testid"))
      .toBe("execution-brief");
    await page.screenshot({path: join(outputDirectory, "03-readout.png"), fullPage: true});
  });

  test("governed context: the workflow asks one useful question and the answer advances the project", async () => {
    const question = page.locator(".information-request-card");
    await expect(question).toBeVisible();
    await expect(question.locator("h2")).toContainText("Leitura de refinanciamento");
    await expect(question).toContainText("Por que pergunto");
    await expect(question).toContainText("O que pode mudar");
    await expect(question).toContainText("2 perguntas depois desta");
    await question.getByRole("button", {name: "Alternativas de estrutura de capital mais amplas"}).click();
    await expect(page.locator(".advisor-thread__message.is-user").last()).toContainText("Alternativas de estrutura de capital mais amplas");
    const acknowledgement = await waitForAssistant(page, /Resposta vinculada à pergunta em aberto/);
    record("resposta governada", acknowledgement);
    await approveCurrentPlan(page);
    await expect.poll(async () => {
      await page.reload();
      return page.locator(".advisor-project__header > span").innerText();
    }, {timeout: 240_000}).toContain("Pronto para continuar");
    // The answered stable key remains closed after the workflow runs again; the next question is
    // shown instead of silently reopening the first one.
    await expect(page.locator(".information-request-card h2")).toContainText("Reunião exploratória");
    await expect(page.locator(".information-request-card h2")).not.toContainText("Leitura de refinanciamento");
    await page.screenshot({path: join(outputDirectory, "03a-governed-question.png"), fullPage: true});
  });

  test("plan control: an adjustment is bound to the displayed version and returns as a visible diff", async () => {
    const brief = page.getByTestId("execution-brief");
    const displayedVersion = async () => {
      const label = await page.getByTestId("execution-brief").locator(":scope > header > small").textContent();
      const match = label?.match(/Versão\s+(\d+)/i);
      if (!match) throw new Error(`the execution brief has no numeric version: ${label}`);
      return Number(match[1]);
    };
    const versionBefore = await displayedVersion();
    await brief.getByRole("button", {name: "Ajustar este plano"}).click();
    await expect(brief.locator(".execution-brief-card__edit form")).toBeVisible();
    const adjustment = "Na comparação, priorize flexibilidade antes de custo e retire qualquer bloco de rating sem evidência.";
    await brief.locator(".execution-brief-card__edit textarea").fill(adjustment);
    await brief.getByRole("button", {name: "Enviar ajuste"}).click();
    await expect(page.locator(".advisor-thread__message.is-user").last()).toContainText("priorize flexibilidade");
    const acknowledgement = await waitForAssistant(page, /Ajuste recebido sobre a versão exibida/);
    record("ajuste governado do plano", acknowledgement);
    await expect.poll(async () => {
      await page.reload();
      return displayedVersion();
    }, {timeout: 180_000}).toBeGreaterThan(versionBefore);
    const changes = page.getByTestId("execution-brief-changes");
    await expect(changes).toBeVisible();
    await expect(changes).toContainText("O que mudou nesta versão");
    await approveCurrentPlan(page);
    await expect(page.locator(".advisor-project__header > span")).toContainText("Pronto para continuar", {timeout: 240_000});
    await page.screenshot({path: join(outputDirectory, "03b-governed-plan-edit.png"), fullPage: true});
  });

  test("material: the transition plans three pitch pages from the signed objects", async () => {
    await send(page, "Vamos preparar o material: meu VP quer três páginas de pitch, situação atual, alternativas e impacto nos indicadores.");
    const acknowledged = await waitForAssistant(
      page,
      /Vou planejar o material a partir das informações governadas e rastreáveis: 3 páginas/,
    );
    record("transição para o material", acknowledged);
    await approveCurrentPlan(page);
    const plan = await waitForAssistant(page, /Plano do material a partir das informações governadas e rastreáveis/);
    expect(plan).toMatch(/Estado do plano: (planejado|proposto|proposed)/);
    record("plano do material", plan);
    const decisionArtifact = page.getByTestId("preview-decision-artifact");
    await expect(decisionArtifact).toBeVisible();
    // Planning a material does not publish an improvised file. A download only appears when a
    // renderer has stored exact bytes and bound their immutable fingerprint to the contract.
    await expect(decisionArtifact.getByRole("link", {name: "Baixar planilha"})).toHaveCount(0);
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
    await approveCurrentPlan(page);
    const updated = await waitForAssistant(page, /7 de 9 etapas foram reaproveitadas sem recálculo/);
    expect(updated).toContain(MARK);
    record("atualização incremental", updated);
    const decisionArtifact = page.getByTestId("preview-decision-artifact");
    await expect(decisionArtifact).toContainText("Taxa anual da nova dívida");
    await expect(decisionArtifact).toContainText("15,5% a.a.");
    const briefChanges = page.getByTestId("execution-brief-changes");
    await expect(briefChanges).toBeVisible();
    await expect(briefChanges).toContainText("O que mudou nesta versão");
    await expect(briefChanges).toContainText("Taxa anual da nova dívida");
    await page.screenshot({path: join(outputDirectory, "05-incremental-update.png"), fullPage: true});
    expect(projectUrl).toMatch(/\/pt-BR\/app\/projects\//);
  });
});
