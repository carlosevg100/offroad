import {randomBytes} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";

import {expect, test, type BrowserContext, type Page} from "@playwright/test";

import {waitForOneTimeCode} from "./support/mail";

/**
 * live_intelligence_preview: the Case 01 journey with the semantic router deciding each turn
 * (one model call per turn, under the worker's budget), against a local stack running the worker
 * with a real model key. It runs only in the "Live preview gate" workflow (LIVE_PREVIEW=1).
 *
 * What it measures: five paraphrases of the analyst's request reach the same composition and the
 * same frozen corpus; a company without a corpus never receives the Camil objects; a CFO preparing
 * a board decision is routed as such; a question about a number is answered from the objects; a
 * material request and a premise change go through the same live router. The reply of every live
 * turn starts with a machine-readable line (composition, company, corpus, audience, depth, model,
 * calls, cost) that this journey parses into the gate report.
 */
const here = __dirname;
const runId = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
const account = {email: `e2e-preview-${runId}@example.com`, password: `Offroad-E2E-${runId}!`, fullName: "Analista Live"};
const outputDirectory = join(here, "..", "test-results", "live-intelligence-preview");
const transcript: string[] = [];
const journey: Array<{step: string; prompt: string; headline: Record<string, string>; reply: string}> = [];
const LIVE_MARK = "[Validação interna, live_intelligence_preview]";

test.skip(!process.env.LIVE_PREVIEW, "live gate only: needs the worker with a model key (LIVE_PREVIEW=1)");
test.use({video: "on"});
test.describe.configure({mode: "serial"});

async function assistantMessages(page: Page): Promise<string[]> {
  return page.locator(".advisor-thread__message.is-assistant > div > p:first-of-type").allInnerTexts();
}

async function waitForAssistant(page: Page, pattern: RegExp, timeoutMs = 240_000): Promise<string> {
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

/** The first line of a live reply: `key=value · key=value …` after the mark. */
function parseHeadline(reply: string): Record<string, string> {
  const line = reply.split("\n")[0] ?? "";
  const body = line.startsWith(LIVE_MARK) ? line.slice(LIVE_MARK.length).trim() : line;
  return Object.fromEntries(body.split(" · ").map((part) => {
    const index = part.indexOf("=");
    return index > 0 ? [part.slice(0, index).trim(), part.slice(index + 1).trim()] : [part.trim(), ""];
  }));
}

function record(step: string, prompt: string, reply: string) {
  transcript.push(`\n**Analista:** ${prompt}\n\n**Offroad (${step}):** ${reply}\n`);
  journey.push({step, prompt, headline: parseHeadline(reply), reply});
}

async function startProject(page: Page, prompt: string): Promise<string> {
  await page.goto("/pt-BR/app");
  await expect(page.locator(".advisor-start")).toBeVisible();
  await page.locator(".advisor-composer--start textarea").fill(prompt);
  await page.locator(".advisor-composer--start .advisor-composer__send").click();
  await expect(page).toHaveURL(/\/pt-BR\/app\/projects\/[0-9a-f-]+$/);
  return page.url();
}

async function send(page: Page, message: string) {
  await page.locator(".advisor-composer textarea").fill(message);
  await page.locator(".advisor-composer__send").click();
  await expect(page.locator(".advisor-thread__message.is-user").last()).toContainText(message.slice(0, 40));
}

const paraphrases = [
  "Sou analista no time de Investment Banking. Meu VP me pediu para preparar material para uma reunião com a Camil na segunda. Ele falou em refinanciamento, mas não disse que tese quer levar nem que formato espera.",
  "Preciso montar um material para o meu VP levar à Camil na segunda. Ele mencionou refinanciamento, sem definir tese nem formato.",
  "Reunião com a Camil segunda-feira: o VP quer algo sobre refinanciamento das debêntures, mas não fechou o ângulo nem o entregável.",
  "Me ajuda a preparar a conversa com a Camil? O tema é refinanciamento; ainda não sei se ele quer alternativas mais amplas ou só a rolagem.",
  "Time de IB aqui. Pauta da segunda: Camil e refinanciamento. Quero chegar com uma leitura da dívida e opções, formato a definir.",
];

test.describe("live_intelligence_preview: Case 01 with the semantic router", () => {
  let context: BrowserContext;
  let page: Page;
  let firstProjectUrl = "";

  test.beforeAll(async ({browser}) => {
    mkdirSync(outputDirectory, {recursive: true});
    context = await browser.newContext({viewport: {width: 1366, height: 900}, recordVideo: {dir: join(outputDirectory, "video"), size: {width: 1366, height: 900}}});
    page = await context.newPage();
  });

  test.afterAll(async () => {
    writeFileSync(join(outputDirectory, "transcript.md"), `# Caso 01 em live_intelligence_preview (${new Date().toISOString()})\n${transcript.join("")}\n`);
    writeFileSync(join(outputDirectory, "journey.json"), JSON.stringify({runId, account: account.email, journey}, null, 2));
    await context?.close();
  });

  test("signs up a banker and enters the workspace through the confidentiality gate", async () => {
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
    await page.locator('input[name="institution_name"]').fill("Banco Live");
    await page.locator('input[name="professional_roles"][value="banker"]').check();
    await page.locator('input[name="practice_areas"][value="investment_banking"]').check();
    await page.locator('input[name="practice_areas"][value="dcm"]').check();
    await page.locator('input[name="primary_objectives"][value="prepare_meetings"]').check();
    await page.locator(".professional-context__actions .button:not(.button--ghost)").click();
    await expect(page.locator(".intake-start")).toBeVisible();
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
  });

  test("five paraphrases of the analyst's request reach the same composition and the same frozen corpus", async () => {
    for (const [index, prompt] of paraphrases.entries()) {
      const url = await startProject(page, prompt);
      if (index === 0) firstProjectUrl = url;
      const reply = await waitForAssistant(page, /live_intelligence_preview\] composição=/);
      record(`paráfrase ${index + 1}`, prompt, reply);
      const headline = parseHeadline(reply);
      expect(headline["composição"], `paraphrase ${index + 1}: ${reply.slice(0, 300)}`).toBe("prepare_meeting");
      expect(headline["corpus"]).toBe("gc01-analista-ib-camil");
      expect(headline["chamadas"]).toBe("1");
      expect(Number(headline["custo"]?.replace("US$ ", ""))).toBeGreaterThan(0);
    }
    await page.screenshot({path: join(outputDirectory, "01-paraphrases.png"), fullPage: true});
  });

  test("a company without a frozen corpus never receives the Camil objects", async () => {
    const prompt = "Preciso preparar uma reunião com a Magazine Luiza sobre refinanciamento das debêntures dela, para o meu VP, na quarta.";
    await startProject(page, prompt);
    const reply = await waitForAssistant(page, /live_intelligence_preview\] composição=/);
    record("outra companhia", prompt, reply);
    const headline = parseHeadline(reply);
    expect(headline["composição"]).toBe("nenhuma");
    expect(headline["corpus"]).toBe("nenhum");
    expect(reply).toContain("Magazine Luiza");
    expect(reply).not.toMatch(/4,72x|5\.670\.186|Camil Alimentos/);
    // Either a bounded public research ran (sources listed) or the router said it was unavailable; both are honest, neither borrows Camil.
    expect(reply).toMatch(/Pesquisa pública/);
    await page.screenshot({path: join(outputDirectory, "02-other-company.png"), fullPage: true});
  });

  test("a CFO preparing a board decision is routed as prepare_decision for the board", async () => {
    const prompt = "Sou CFO da Camil. Preciso levar ao conselho, na reunião do mês que vem, a decisão de refinanciar ou não as debêntures que vencem em 2027, com as alternativas e o impacto nos covenants.";
    await startProject(page, prompt);
    const reply = await waitForAssistant(page, /live_intelligence_preview\] composição=/);
    record("CFO e conselho", prompt, reply);
    const headline = parseHeadline(reply);
    expect(headline["composição"]).toBe("prepare_decision");
    expect(headline["corpus"]).toBe("gc01-analista-ib-camil");
    expect(headline["audiência"]).toBe("board");
    await page.screenshot({path: join(outputDirectory, "03-cfo-board.png"), fullPage: true});
  });

  test("the first project completes its readout from the nine deterministic objects", async () => {
    await page.goto(firstProjectUrl);
    const readout = await waitForAssistant(page, /Primeira devolutiva do Caso 01/, 300_000);
    transcript.push(`\n**Offroad (primeira devolutiva, projeto 1):** ${readout}\n`);
    await expect(page.locator('[data-testid="integration-preview-work"] .preview-work__section')).toHaveCount(9);
    await page.screenshot({path: join(outputDirectory, "04-readout.png"), fullPage: true});
  });

  test("a question about a number is answered from the signed objects", async () => {
    const prompt = "De onde saiu essa alavancagem de 4,7x?";
    await send(page, prompt);
    const reply = await waitForAssistant(page, /live_intelligence_preview\] composição=nenhuma[^\n]*\n[\s\S]*reconcile-covenant-definitions/);
    record("origem do número", prompt, reply);
    expect(reply).toContain("reconcile-covenant-definitions");
  });

  test("a material request plans the pages from the objects", async () => {
    const prompt = "Vamos preparar o material: meu VP quer três páginas de pitch, situação atual, alternativas e impacto nos indicadores.";
    await send(page, prompt);
    const reply = await waitForAssistant(page, /live_intelligence_preview\] composição=prepare_material/);
    record("material", prompt, reply);
    const plan = await waitForAssistant(page, /Plano do material a partir dos objetos assinados/);
    transcript.push(`\n**Offroad (plano do material):** ${plan}\n`);
    expect(page.locator('[data-testid="integration-preview-work"] .preview-work__pages ol li')).toHaveCount(3);
  });

  test("a premise change recomputes only what depends on it", async () => {
    const prompt = "Altere a taxa da nova dívida para 15,50% a.a.";
    await send(page, prompt);
    const reply = await waitForAssistant(page, /live_intelligence_preview\] composição=change_premise/);
    record("premissa", prompt, reply);
    const update = await waitForAssistant(page, /7 de 10 etapas replicaram sem recálculo/);
    transcript.push(`\n**Offroad (atualização incremental):** ${update}\n`);
    await page.screenshot({path: join(outputDirectory, "05-premise-change.png"), fullPage: true});
  });

  test("an answer to an open question changes scope, audience and depth, and the plan recompiles", async () => {
    // The readout lists questions the model wrote from the objects' gaps; answering the first one
    // with a scope, an audience and a depth must recompile the plan, not restart it.
    const readout = (await assistantMessages(page)).find((message) => /Para alinhar com o VP/.test(message)) ?? "";
    const firstQuestion = readout.match(/\(1\) ([^(]+?)(?: \(2\)|$)/)?.[1]?.trim() ?? "";
    const prompt = `Sobre a sua pergunta "${firstQuestion.slice(0, 120)}": leitura ampla de alternativas, é para o conselho e precisa ser institucional.`;
    await send(page, prompt);
    const reply = await waitForAssistant(page, /live_intelligence_preview\] composição=(deepen|change_premise)/);
    record("resposta à pergunta", prompt, reply);
    expect(reply).toContain("Respostas aplicadas");
    expect(parseHeadline(reply)["audiência"]).toBe("board");
    const update = await waitForAssistant(page, /etapas replicaram sem recálculo|Primeira devolutiva do Caso 01/, 300_000);
    transcript.push(`\n**Offroad (plano recompilado):** ${update}\n`);
  });
  test("the material is a real file, regenerated from the objects after the premise change", async () => {
    // The synthesis artifact is served as a Word file and as a spreadsheet, built from the signed
    // objects; a later version after the premise change carries a higher artifact version.
    const projectId = firstProjectUrl.split("/").pop()!;
    const base = `/pt-BR/app/projects/${projectId}/preview/material`;
    const docx = await page.request.get(`${base}?format=docx`);
    expect(docx.status()).toBe(200);
    expect(docx.headers()["content-type"]).toContain("wordprocessingml");
    const docxBody = await docx.body();
    expect(docxBody.byteLength).toBeGreaterThan(2_000);
    writeFileSync(join(outputDirectory, "material.docx"), docxBody);
    const xlsx = await page.request.get(`${base}?format=xlsx`);
    expect(xlsx.status()).toBe(200);
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
    writeFileSync(join(outputDirectory, "material.xlsx"), await xlsx.body());
    const version = Number(docx.headers()["x-preview-artifact-version"]);
    expect(version).toBeGreaterThanOrEqual(2);
    transcript.push(`\n**Arquivo:** material.docx (versão ${version}, ${docxBody.byteLength} bytes) e material.xlsx gerados dos objetos assinados.\n`);
  });
});
