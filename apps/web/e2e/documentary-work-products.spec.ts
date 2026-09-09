import {execFileSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {expect, test, type BrowserContext, type Page} from "@playwright/test";
import {waitForOneTimeCode} from "./support/mail";

// Separate provider-backed journey. No completed artifacts or model responses are seeded.
const enabled = process.env.OFFROAD_E2E_DOCUMENT_WORK_PRODUCT === "1";
test.skip(!enabled, "Requires the protected documentary provider gate and an authorized worker.");
test.describe.configure({mode: "serial"});
const runId = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
const account = {email: `e2e-documentary-${runId}@example.com`, password: `Offroad-E2E-${runId}!`, fullName: "QA documental"};
const directory = join(__dirname, "..", "test-results", "documentary-work-products");

function assertLocalDocumentaryEnvironment(): string {
  if (process.env.DOCUMENTARY_WORK_PLANNING_ENABLED !== "true") throw new Error("Documentary planning must be explicitly enabled for this local gate.");
  const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const site = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
  for (const value of [databaseUrl, site]) if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)) throw new Error("Documentary E2E requires loopback services.");
  return databaseUrl;
}

function assertLocalPipeline() {
  const databaseUrl = assertLocalDocumentaryEnvironment();
  // Verify the fresh synthetic workspace's real bootstrap state without changing it.
  // Canary runs the primary job; shadow would enqueue an additional comparison run.
  const proof = execFileSync("psql", [databaseUrl, "-At", "-v", "ON_ERROR_STOP=1", "-v", `email=${account.email}`, "-q"], {input: `
    select count(*) from public.organizations o join auth.users u on u.id=o.created_by
      join public.organization_rollout_policies p on p.organization_id=o.id
      where u.email=:'email' and o.pipeline_enabled and p.state='canary' and not p.external_release_enabled;
  `, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]});
  expect(proof.trim()).toBe("1");
}

const cases = [
  {job: "comparison", request: "Compare estas propostas de financiamento. Quero uma leitura documental preliminar das condições e lacunas, sem cálculos financeiros nem recomendação de crédito.", title: "Comparação documental de propostas"},
  {job: "meeting", request: "Prepare a reunião com esta companhia usando os documentos enviados. Quero uma leitura documental preliminar e perguntas para a conversa, sem cálculos financeiros nem recomendação de crédito.", title: "Preparação para a reunião"},
  {job: "review", request: "Revise esta oportunidade a partir dos documentos enviados. Quero uma leitura documental preliminar das condições e lacunas, sem cálculos financeiros nem recomendação de crédito.", title: "Revisão preliminar da oportunidade"},
] as const;

const files = [
  {name: "proposta-alfa-sintetica.csv", mimeType: "text/csv", buffer: Buffer.from("campo,condicao\nidentificacao,Proposta Alfa - documento sintetico\ncompanhia,Companhia Teste\nwebsite,https://companhia-teste.example\nsetor,Servicos empresariais\ninstrumento,Emprestimo corporativo\nprazo,36 meses\ngarantia,Alienacao fiduciaria de equipamentos\namortizacao,Mensal\n")},
  {name: "proposta-beta-sintetica.csv", mimeType: "text/csv", buffer: Buffer.from("campo,condicao\nidentificacao,Proposta Beta - documento sintetico\ncompanhia,Companhia Teste\nwebsite,https://companhia-teste.example\nsetor,Servicos empresariais\ninstrumento,Emprestimo corporativo\nprazo,48 meses\ngarantia,Fianca corporativa\namortizacao,Trimestral\n")},
];

test.describe("documentary work products with actual provider execution", () => {
  let context: BrowserContext;
  let page: Page;
  test.beforeAll(async ({browser}) => {assertLocalDocumentaryEnvironment(); mkdirSync(directory, {recursive: true}); context = await browser.newContext({viewport: {width: 1440, height: 900}}); page = await context.newPage();});
  test.afterAll(async () => {await context?.close();});
  test("registers a workspace and accepts confidentiality", async () => {
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
    assertLocalPipeline();
  });

  for (const scenario of cases) test(`${scenario.job}: approved documentary plan to persisted result and Word`, async () => {
    test.setTimeout(600_000);
    await page.goto("/pt-BR/app");
    const composer = page.locator(".advisor-composer--start");
    await composer.locator("textarea").fill(scenario.request);
    await composer.locator('input[type="file"]').setInputFiles(files);
    await expect(composer.locator(".advisor-composer__files > span")).toHaveCount(2);
    await composer.locator(".advisor-composer__send").click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/projects\/[0-9a-f-]+$/);
    const preliminary = page.locator(".advisor-private-work__understanding");
    await expect(preliminary).toBeVisible({timeout: 180_000});
    await preliminary.locator('form:has(input[name="decision"][value="confirmed"]) button[type="submit"]').click();
    const brief = page.getByTestId("execution-brief");
    await expect(brief.locator('[data-approval-status="awaiting"]')).toBeVisible({timeout: 180_000});
    await expect(brief.locator(".execution-brief-card__workstreams > li")).toHaveCount(3);
    for (const label of ["Conferir os documentos", "Preparar a leitura", "Entregar e revisar"]) await expect(brief).toContainText(label);
    await brief.locator('[data-approval-status="awaiting"]').getByRole("button", {name: /aprovar|approve/i}).click();
    const work = page.locator(".advisor-work-surface");
    await expect(work.getByRole("heading", {name: scenario.title, exact: true})).toBeVisible({timeout: 180_000});
    for (const file of files) await expect(work).toContainText(file.name);
    if (scenario.job === "comparison") {
      for (const term of ["prazo | 36 meses", "prazo | 48 meses", "garantia | Alienacao fiduciaria de equipamentos", "garantia | Fianca corporativa"]) {
        await expect(work.getByText(term, {exact: true}).first()).toBeVisible();
      }
    }
    await expect(work).toContainText("Análise documental preliminar");
    await expect(brief.locator('.execution-brief-card__workstreams > li[data-progress="completed"]')).toHaveCount(3, {timeout: 120_000});
    const result = await work.locator(".advisor-work-surface__content").innerText();
    const completeText = await work.locator(".advisor-work-surface__content").textContent();
    expect(completeText).not.toBeNull();
    const materialHref = await work.getByRole("link", {name: "Baixar Word", exact: true}).getAttribute("href");
    expect(materialHref).not.toBeNull();
    await work.locator('.advisor-work-surface__navigation a[href="#work-document-review"]').click();
    await expect(page).toHaveURL(/#work-document-review$/);
    await page.reload();
    // Match like-for-like: collapsed source details are excluded from innerText,
    // but included in textContent. Both representations and product identity persist.
    await expect(work.locator(".advisor-work-surface__content")).toHaveText(result, {useInnerText: true});
    await expect(work.locator(".advisor-work-surface__content")).toHaveText(completeText!);
    await expect(work.getByRole("link", {name: "Baixar Word", exact: true})).toHaveAttribute("href", materialHref!);
    const downloaded = page.waitForEvent("download");
    await work.getByRole("link", {name: "Baixar Word", exact: true}).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toMatch(/\.docx$/);
    expect(await download.failure()).toBeNull();
    await download.saveAs(join(directory, `${scenario.job}.docx`));
    await page.screenshot({path: join(directory, `${scenario.job}.png`), fullPage: true});
    writeFileSync(join(directory, `${scenario.job}.json`), JSON.stringify({projectUrl: page.url(), request: scenario.request, result, progress: await brief.locator(".execution-brief-card__workstreams").innerText()}, null, 2));
  });
});
