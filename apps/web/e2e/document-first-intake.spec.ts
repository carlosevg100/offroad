import {expect, test, type BrowserContext, type Page} from "@playwright/test";

import {assertDataRoomPresent, dataRoomExpectations, dataRoomFiles} from "./support/data-room";
import {waitForOneTimeCode} from "./support/mail";

/**
 * The critical borrower journey, end to end, against a local Supabase stack:
 * signup → 6-digit code → onboarding (documents first) → upload the synthetic Rede Horizonte
 * data room → server-side processing → assisted review → confirmation → case in the workspace →
 * unknown documents produce the honest empty state → sign-out and password login.
 *
 * Every step is one test in a serial group so a failure names the exact step.
 */
const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const initialProjectName = `Projeto Horizonte ${runId}`;
const updatedProjectName = `Projeto Horizonte Atualizado ${runId}`;
const account = {
  email: `e2e-${runId}@example.com`,
  password: `Offroad-E2E-${runId}!`,
  fullName: "QA Offroad",
  jobTitle: "Diretora financeira",
};

test.describe.configure({mode: "serial"});

async function expectNoErrorNotice(page: Page) {
  await expect(page.locator(".form-notice--error")).toHaveCount(0);
}

async function completeCompanyMilestone(page: Page) {
  await expect(page.locator(".intake-company")).toBeVisible();
  await expect(page.locator(".intake-collect")).toContainText("ETAPA 1 DE 7");
  await page.locator('input[name="company_name"]').fill("Rede Horizonte Supermercados");
  await page.locator('input[name="legal_name"]').fill("Rede Horizonte Supermercados S.A.");
  await page.locator('input[name="website"]').fill("https://redehorizonte.example.com");
  await page.locator('textarea[name="description"]').fill("Rede regional de supermercados com operação no Sudeste e plano de expansão de lojas.");
  await page.locator('.intake-company__actions button[type="submit"]').click();
  await expect(page.locator(".intake-operation__options")).toBeVisible();
  await expect(page.locator(".intake-collect")).toContainText("ETAPA 2 DE 7");
}

async function startPrivateProject(page: Page, projectName: string, acceptTerms = false) {
  await page.locator(".intake-welcome__action a").click();

  if (acceptTerms) {
    await expect(page.locator(".private-project-gate--terms h2")).toHaveText("Antes de começar, protegemos suas informações.");
    await expect(page.locator(".private-project-gate--terms")).toContainText("Nada vai ao mercado sem outro aceite");
    await expect(page.locator(".private-project-gate--terms")).toContainText("Este aceite não comprova representação perante terceiros");
    await page.locator(".private-project-gate__full-terms summary").click();
    await expect(page.locator(".private-project-gate__full-terms")).toContainText("4. NENHUMA DISTRIBUIÇÃO AUTOMÁTICA");
    await expect(page.locator(".private-project-gate__full-terms")).toContainText("Este Termo não constitui contratação de assessoria, exclusividade, mandato");
    await page.locator('input[name="terms_agreed"]').check();
    await page.locator('input[name="information_rights_declared"]').check();
    await page.locator('.private-project-gate__form button[type="submit"]').click();
  }

  await expect(page.locator(".private-project-gate--project")).toBeVisible();
  await page.locator('input[name="project_name"]').fill(projectName);
  await expect(page.locator('input[name="identity_policy"][value="identified_restricted"]')).toBeChecked();
  await expect(page.locator('input[name="representation_declared"]')).toHaveAttribute("type", "hidden");
  await expect(page.locator('input[name="representation_declared"]')).toHaveValue("confirmed");
  await page.locator('.private-project-gate__form button[type="submit"]').click();
  await expect(page.locator(".intake-collect")).toBeVisible();
}

test.describe("Document-first intake (company journey)", () => {
  // One browser context for the whole journey so the authenticated session carries across steps.
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({browser}) => {
    assertDataRoomPresent();
    // Contexts created from the `browser` fixture inherit the config's trace/video/screenshot options.
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await page.screenshot({path: testInfo.outputPath("failure.png"), fullPage: true}).catch(() => undefined);
    }
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("signs up with e-mail verification and lands on onboarding", async () => {
    await page.goto("/pt-BR/signup");
    // Company journey is the default selection.
    await expect(page.locator('input[name="entry_path"][value="origination"]')).toBeChecked();
    await expect(page.locator('input[name="originating_role"][value="company"]')).toBeChecked();
    await page.locator('input[name="full_name"]').fill(account.fullName);
    await page.locator('input[name="job_title"]').fill(account.jobTitle);
    await page.locator('input[name="email"]').fill(account.email);
    await page.locator('input[name="password"]').fill(account.password);
    await page.locator('input[name="confirm_password"]').fill(account.password);
    await page.locator("form.auth-form--registration button[type=submit]").click();

    await expect(page).toHaveURL(/\/pt-BR\/signup\/verify/);
    const code = await waitForOneTimeCode(account.email);
    await page.locator('input[name="token"]').fill(code);
    await page.locator("form.auth-form--verification button[type=submit]").click();

    await expect(page).toHaveURL(/\/pt-BR\/onboarding/);
    await expect(page.locator(".intake-start")).toBeVisible();
    await expect(page.locator(".workspace-welcome h1")).toHaveText("Bem-vindo.");
    await expect(page.locator(".intake-welcome__roles")).toContainText("Você faz");
    await expect(page.locator(".intake-welcome__roles")).toContainText("A Offroad faz");
    await expect(page.getByText("Vamos preparar seu primeiro case.")).toHaveCount(0);
  });

  test("starts with documents, uploads the data room and processes it", async () => {
    await page.goto("/pt-BR/onboarding");
    await startPrivateProject(page, initialProjectName, true);
    await expect(page.locator(".workspace-welcome h1")).toHaveText("Vamos começar o processo para estruturar sua captação.");
    await expect(page.locator(".workspace-welcome")).toContainText("Leva cerca de dez minutos. O resto é com a gente.");
    await expect(page.locator(".intake-guide__back")).toHaveText("Voltar à etapa anterior");
    await expect(page.locator(".intake-guide__restart")).toHaveCount(0);

    // Project setup is a real preceding step. Editing it is reversible and keeps the same intake
    // session instead of cancelling the financing behind a Back link.
    await page.locator(".intake-guide__back").click();
    await expect(page).toHaveURL(/setup=project/);
    await expect(page.locator(".private-project-gate--project")).toBeVisible();
    await expect(page.locator('input[name="project_name"]')).toHaveValue(initialProjectName);
    await page.locator('input[name="project_name"]').fill(updatedProjectName);
    await page.locator('.private-project-gate__form button[type="submit"]').click();
    await expect(page).toHaveURL(/stage=company/);
    await completeCompanyMilestone(page);

    // The operation decides the checklist; the brief decides who could buy the paper. Neither
    // needs a document, and both come before the upload in the conversation a desk actually has.
    await expect(page.locator(".intake-brief")).toHaveCount(0);
    await page.locator('.intake-operation__options button[value="growth_expansion"]').click();
    await expect(page.locator(".intake-brief")).toBeVisible();
    await expectNoErrorNotice(page);

    // The guided onboarding is navigable in both directions without changing lifecycle state.
    await page.locator(".intake-guide__back").click();
    await expect(page).toHaveURL(/stage=operation/);
    await expect(page.locator(".intake-operation__options")).toBeVisible();
    await page.locator(".intake-guide__back").click();
    await expect(page).toHaveURL(/stage=company/);
    await expect(page.locator(".intake-company")).toBeVisible();
    await page.locator(".intake-guide__back").click();
    await expect(page.locator(".private-project-gate--project")).toBeVisible();
    await expect(page.locator('input[name="project_name"]')).toHaveValue(updatedProjectName);
    await page.locator('.private-project-gate__form button[type="submit"]').click();
    await expect(page.locator(".intake-company")).toBeVisible();
    await page.goto("/pt-BR/onboarding?stage=operation");
    await page.locator('.intake-operation__options button[value="growth_expansion"]').click();
    await expect(page.locator(".intake-brief")).toBeVisible();

    // Typed the way a person types, not the way a parser prefers.
    await page.locator("#brief-amount").fill("45 milhões");
    await page.locator("#brief-term").fill("60");
    await page.locator("#brief-grace").fill("12");
    await page.locator("#brief-sector").fill("varejo alimentar");
    await page.locator("#brief-geography").fill("sp");
    await page.locator(".intake-brief__advanced > summary").click();
    await page.locator("#brief-rate").fill("CDI + 4");
    await page.locator("#collateral-recebiveis").check();
    await page.locator("#collateral-imovel").check();
    await page.locator(".intake-brief__form button[type=submit]").click();

    await expectNoErrorNotice(page);
    await expect(page.locator(".intake-request-list")).toBeVisible();
    await expect(page.locator(".intake-upload")).toBeVisible();
    await expect(page.locator(".agent-panel")).toBeVisible();
    await expect(page.locator(".agent-panel__header h3")).toHaveText("Converse sobre a operação");
    await expect(page.locator(".agent-panel footer")).toContainText("Nada muda na operação sem sua confirmação.");

    await page.locator(".intake-upload input[type=file]").setInputFiles(dataRoomFiles);
    await expect(page.locator(".intake-upload__files header span")).toHaveText(String(dataRoomExpectations.documents), {timeout: 120_000});
    await expectNoErrorNotice(page);

    const analyze = page.locator(".intake-collect__process form button[type=submit]");
    await expect(analyze).toBeEnabled({timeout: 60_000});
    await analyze.click();

    await expect(page.locator(".intake-review")).toBeVisible({timeout: 120_000});
    const stats = page.locator(".intake-review__stats");
    await expect(stats.locator("span").nth(0)).toContainText(String(dataRoomExpectations.documents));
    await expect(stats.locator("span").nth(1)).toContainText(String(dataRoomExpectations.candidates));
    await expect(stats.locator("span").nth(2)).toContainText(String(dataRoomExpectations.openIssues));
    await expect(page.locator(".intake-issues__list article")).toHaveCount(dataRoomExpectations.openIssues);
    // The R$49m vs ~R$50m conflict is preserved as an explicit issue, never silently reconciled.
    await expect(page.locator(".intake-issues__list")).toContainText(/49 milhões/);
  });

  test("accepts high-confidence suggestions and confirms the case", async () => {
    await page.goto("/pt-BR/onboarding");
    await expect(page.locator(".intake-review")).toBeVisible();
    await page.locator(".intake-review__toolbar form").first().locator("button[type=submit]").click();
    await expect(page.locator(".intake-confirm p")).toContainText(String(dataRoomExpectations.acceptedAfterBulkAccept));

    await page.locator('.intake-confirm input[name="confirmation"]').check();
    await page.locator(".intake-confirm button[type=submit]").click();
    await expect(page.locator(".onboarding-review")).toBeVisible({timeout: 60_000});
    await expect(page.locator(".onboarding-review")).toContainText(/Rede Horizonte/);
    await expectNoErrorNotice(page);
  });

  test("submits onboarding and opens the governed workspace with its source context", async () => {
    await page.goto("/pt-BR/onboarding");
    await expect(page.locator(".onboarding-review")).toBeVisible();
    await page.locator(".onboarding-actions button.button:not(.button--ghost)").click();
    await expect(page).toHaveURL(/\/pt-BR\/app\?welcome=1/);
    await expect(page.locator(".opportunity-table [role=listitem]")).toHaveCount(1);
    await expect(page.locator(".opportunity-table")).toContainText(/Rede Horizonte Supermercados/);

    await page.locator(".opportunity-table [role=listitem]").first().click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/opportunities\//);
    await expect(page.locator(".deal-workspace__topbar h1")).toHaveText(updatedProjectName);
    await expect(page.locator(".deal-workspace__topbar dl dd").nth(2)).toHaveText(String(dataRoomExpectations.documents));
    await expect(page.locator(".deal-control-panel")).toContainText("Análises vinculadas às informações de origem.");
  });

  test("an unknown document set yields the honest empty state in the workspace flow", async () => {
    await page.goto("/pt-BR/app/new");
    await expect(page.locator(".private-project-gate--project")).toBeVisible();
    await page.locator('input[name="project_name"]').fill(`Projeto Desconhecido ${runId}`);
    await page.locator('input[name="representation_declared"]').check();
    await page.locator('.private-project-gate__form button[type="submit"]').click();
    await expect(page).toHaveURL(/mode=documents&session=/);
    await expect(page.locator(".intake-collect")).toBeVisible();

    await page.locator('.intake-operation__options button[value="growth_expansion"]').click();
    await page.locator("#brief-amount").fill("1 milhão");
    await page.locator("#brief-sector").fill("varejo alimentar");
    await page.locator("#brief-geography").fill("SP");
    await page.locator(".intake-brief__form button[type=submit]").click();
    await expect(page.locator(".intake-upload")).toBeVisible();

    await page.locator(".intake-upload input[type=file]").setInputFiles({
      name: "balancete-desconhecido.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(`Balancete sintético ${runId}\nReceita 1.000,00\n`, "utf8"),
    });
    await expect(page.locator(".intake-upload__files header span")).toHaveText("1", {timeout: 60_000});
    await expectNoErrorNotice(page);
    // Removal while the session is open works, then upload again.
    await page.locator(".intake-upload__remove button").first().click();
    await expect(page.locator(".intake-upload__files")).toHaveCount(0);
    await page.locator(".intake-upload input[type=file]").setInputFiles({
      name: "balancete-desconhecido.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(`Balancete sintético ${runId}\nReceita 1.000,00\n`, "utf8"),
    });
    await expect(page.locator(".intake-upload__files header span")).toHaveText("1", {timeout: 60_000});

    const analyze = page.locator(".intake-collect__process form button[type=submit]");
    await expect(analyze).toBeEnabled({timeout: 60_000});
    await analyze.click();
    await expect(page.locator(".intake-review")).toBeVisible({timeout: 120_000});
    await expect(page.locator(".intake-review__empty")).toBeVisible();
    await expect(page.locator(".intake-issues__list article")).toHaveCount(1);
    await expect(page.locator(".intake-field")).toHaveCount(0);
  });

  test("signs out and logs back in with the password", async () => {
    await page.goto("/pt-BR/app");
    await page.locator(".app-sidebar__footer form button[type=submit]").click();
    await expect(page).toHaveURL(/\/pt-BR\/?$/);

    await page.goto("/pt-BR/login");
    await page.locator('input[name="email"]').fill(account.email);
    await page.locator('input[name="password"]').fill(account.password);
    await page.locator("form button.auth-form__primary").click();
    await expect(page).toHaveURL(/\/pt-BR\/app/);
    await expect(page.locator(".opportunity-table [role=listitem]")).toHaveCount(1);
  });
});
