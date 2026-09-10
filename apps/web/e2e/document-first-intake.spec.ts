import {receivablesR01Fixture} from "./support/receivables-r01-fixture";
import {receivablesScopeFixture} from "./support/receivables-scope-fixture";
import {execFileSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {join} from "node:path";
import {expect, test, type BrowserContext, type Locator, type Page} from "@playwright/test";

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
const runId = `${Date.now().toString(36)}${randomBytes(8).toString("hex")}`;
const initialProjectName = `Projeto Horizonte ${runId}`;
const secondaryProjectName = `Projeto Desconhecido ${runId}`;
const companyDebtProjectName = `Projeto Dívida ${runId}`;
const workspaceGroupName = `Camil ${runId}`;
const renamedWorkspaceGroupName = `Camil — Dívida ${runId}`;
const account = {
  email: `e2e-${runId}@example.com`,
  password: `Offroad-E2E-${runId}!`,
  fullName: "QA Offroad",
};

test.describe.configure({mode: "serial"});

async function expectNoErrorNotice(page: Page) {
  await expect(page.locator(".form-notice--error")).toHaveCount(0);
}

/** The default local fixture has no worker. Worker-backed runs must explicitly require consent. */
async function awaitIntakeAnalysis(page: Page) {
  const panel = page.getByTestId("intake-execution-approval");
  const review = page.locator(".intake-review");
  if (process.env.OFFROAD_E2E_REQUIRE_EXECUTION_APPROVAL === "1") {
    await expect(panel).toBeVisible({timeout: 120_000});
  } else {
    await expect(panel.or(review).first()).toBeVisible({timeout: 120_000});
  }
  if (await panel.isVisible()) {
    const approval = panel.locator('[data-approval-status="awaiting"]');
    await expect(approval).toBeVisible({timeout: 120_000});
    await expect(review).toHaveCount(0);
    await approval.getByRole("button", {name: /aprovar|approve/i}).click();
  }
  await expect(review).toBeVisible({timeout: 120_000});
}

async function openFolder(page: Page, folderName: string) {
  const folder = page.locator(".app-rail__folder").filter({hasText: folderName});
  await expect(folder).toHaveCount(1);
  const toggle = folder.locator(".app-rail__item--folder");
  if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
  return folder;
}

/** Conversations are listed flat under Recentes; only folders holding more than one nest. */
function railProject(page: Page, name: string) {
  return page.locator(".app-rail__item").filter({hasText: name}).first();
}

/**
 * Opening the action menu is two steps, and both have to be asserted. Clicking the
 * trigger and then reaching straight for a button inside the portal hides whether the
 * menu ever appeared, which turns a menu that closes on its own into a four-minute
 * timeout instead of a clear failure.
 */
async function openActionMenu(page: Page, trigger: Locator) {
  await trigger.click();
  const menu = page.locator(".workspace-project-actions__menu--floating");
  await expect(menu).toBeVisible();
  return menu;
}

async function completeCompanyMilestone(page: Page) {
  await expect(page.locator(".intake-company")).toBeVisible();
  await expect(page.locator(".intake-collect")).toContainText("ETAPA 1 DE 7");
  await page.locator('input[name="company_name"]').fill("Rede Horizonte Supermercados");
  await page.locator('input[name="legal_name"]').fill("Rede Horizonte Supermercados S.A.");
  await page.locator('input[name="legal_identifier"]').fill("12.345.678/0001-95");
  // A user should not need to know that native URL fields require a protocol.
  // The server stores the canonical HTTPS form and the journey advances normally.
  await page.locator('input[name="website"]').fill("redehorizonte.example.com");
  await page.locator('textarea[name="description"]').fill("Rede regional de supermercados com operação no Sudeste e plano de expansão de lojas.");
  await page.locator('.intake-company__actions button[type="submit"]').click();
  await expect(page.locator(".intake-operation__options")).toBeVisible();
  await expect(page.locator(".intake-collect")).toContainText("ETAPA 2 DE 7");
}

async function chooseOperation(page: Page, archetype = "growth_expansion") {
  const option = page.locator(`input[name="archetype"][value="${archetype}"]`);
  await page.locator(`.intake-operation__option:has(input[value="${archetype}"])`).click();
  await expect(option).toBeChecked();
  await page.locator(".intake-operation__actions button[type=submit]").click();
  await expect(page.locator(".intake-brief")).toBeVisible();
}

async function startPrivateProject(page: Page, projectName: string, acceptTerms = false) {
  // The first private project still belongs to account onboarding: confidentiality is accepted
  // once before the account enters the conversational workspace. The legacy document workflow is
  // reached only after that one-time gate and remains directly addressable for executor coverage.
  await page.goto("/pt-BR/onboarding?setup=terms&job=capital_planning");

  if (acceptTerms) {
    await expect(page.locator(".private-project-gate--terms h2")).toHaveText("Antes de começar, protegemos suas informações.");
    await expect(page.locator(".private-project-gate--terms")).toContainText("Nada vai ao mercado sem outro aceite");
    await expect(page.locator(".private-project-gate--terms")).toContainText("Este aceite não comprova representação perante terceiros");
    await page.locator(".private-project-gate__full-terms summary").click();
    await expect(page.locator(".private-project-gate__full-terms")).toContainText("4. NENHUMA DISTRIBUIÇÃO AUTOMÁTICA");
    await expect(page.locator(".private-project-gate__full-terms")).toContainText("Este Termo não constitui contratação de assessoria, exclusividade, mandato");
    // The signatory's relation to the company is stated here, at acceptance, and not carried
    // from the account: the same person can be a CFO on one project and an advisor on the next.
    await expect(page.locator('input[name="signatory_name"]')).toHaveValue(account.fullName);
    await page.locator('input[name="signatory_title"]').fill("Diretora financeira");
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
  let primaryProjectUrl = "";
  let confirmedOpportunityUrl = "";

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
    // Account creation asks for identity and nothing else: no market side, no job title.
    // Everything that shapes the work is asked by the professional onboarding below.
    await expect(page.locator('input[name="entry_path"]')).toHaveCount(0);
    await expect(page.locator('input[name="job_title"]')).toHaveCount(0);
    await page.locator('input[name="full_name"]').fill(account.fullName);
    await page.locator('input[name="email"]').fill(account.email);
    await page.locator('input[name="password"]').fill(account.password);
    await page.locator('input[name="confirm_password"]').fill(account.password);
    await page.locator("form.auth-form--registration button[type=submit]").click();

    await expect(page).toHaveURL(/\/pt-BR\/signup\/verify/);
    // The verification screen names the address the code went to, read from the pending cookie.
    await expect(page.locator(".auth-form__heading p")).toContainText(account.email);
    const code = await waitForOneTimeCode(account.email);
    await page.locator('input[name="token"]').fill(code);
    await page.locator("form.auth-form--verification button[type=submit]").click();

    await expect(page).toHaveURL(/\/pt-BR\/onboarding/);
    await expect(page.locator(".professional-context--onboarding")).toBeVisible();
    // Nothing arrives pre-answered: this screen exists to ask, not to assume, and where someone
    // works is only asked once they have said they work somewhere.
    await expect(page.locator('input[name="use_forms"]:checked')).toHaveCount(0);
    await expect(page.locator('input[name="institution_name"]')).toHaveCount(0);
    await page.locator('input[name="use_forms"][value="institutional_work"]').check();
    await page.locator('input[name="institution_name"]').fill("Rede Horizonte Supermercados");
    // Several roles and several areas at once, which is the point of the new shape.
    await page.locator('input[name="professional_roles"][value="cfo"]').check();
    await page.locator('input[name="professional_roles"][value="treasury"]').check();
    await page.locator('input[name="practice_areas"][value="treasury"]').check();
    await page.locator('input[name="practice_areas"][value="corporate_finance"]').check();
    await page.locator('input[name="primary_objectives"][value="evaluate_capital_options"]').check();
    await page.locator(".professional-context__actions .button:not(.button--ghost)").click();

    await expect(page.locator(".intake-start")).toBeVisible();
    await expect(page.locator(".workspace-welcome h1")).toHaveText("Bem-vindo.");
    await expect(page.locator(".intake-welcome__roles")).toContainText("Você faz");
    await expect(page.locator(".intake-welcome__roles")).toContainText("A Offroad faz");
    await expect(page.getByText("Vamos preparar seu primeiro case.")).toHaveCount(0);
  });

  test("starts with documents, uploads the data room and processes it", async () => {
    await page.goto("/pt-BR/onboarding");
    await startPrivateProject(page, initialProjectName, true);
    await expect(page).toHaveURL(/\/pt-BR\/app\/new\?mode=documents&session=.*step=company/);
    primaryProjectUrl = page.url().replace(/&step=company.*$/, "");
    await expect(page.locator(".intake-guide__back")).toHaveText("Voltar à etapa anterior");
    await expect(page.locator(".intake-guide__restart")).toHaveCount(0);
    await completeCompanyMilestone(page);

    // The operation type frames the first reading. The brief and any material the user already
    // has are then read together before the system asks for a tailored evidence package.
    await expect(page.locator(".intake-brief")).toHaveCount(0);
    await chooseOperation(page);
    await expectNoErrorNotice(page);

    // The project flow remains navigable without changing lifecycle state.
    await page.locator(".intake-guide__back").click();
    await expect(page).toHaveURL(/step=operation/);
    await expect(page.locator(".intake-operation__options")).toBeVisible();
    await chooseOperation(page);

    // Typed the way a person types, not the way a parser prefers.
    await page.locator("#brief-objective").fill("Abrir três lojas e ampliar a capacidade logística da rede.");
    await page.locator("#brief-amount").fill("45 milhões");
    await page.locator(".intake-brief__advanced > summary").click();
    await page.locator("#brief-term").fill("60");
    await page.locator("#brief-grace").fill("12");
    await page.locator("#brief-sector").fill("varejo alimentar");
    await page.locator("#brief-geography").fill("sp");
    await page.locator("#brief-rate").fill("CDI + 4");
    await page.locator("#collateral-recebiveis").check();
    await page.locator("#collateral-imovel").check();
    await page.locator(".intake-operation-materials .intake-upload input[type=file]").setInputFiles(dataRoomFiles);
    await expect(page.locator(".intake-operation-materials .intake-upload__files header span")).toHaveText(
      String(dataRoomExpectations.documents),
      {timeout: 120_000},
    );
    await page.locator(".intake-operation-context__actions button[type=submit]").click();

    await expectNoErrorNotice(page);
    await expect(page.locator(".preliminary-understanding")).toBeVisible({timeout: 120_000});
    await expect(page.locator(".preliminary-understanding__grid")).toContainText("Rede Horizonte Supermercados");
    await expect(page.locator(".preliminary-understanding__grid")).toContainText("Crescimento / Expansão");
    await page.locator(".preliminary-understanding__decision form button[type=submit]").click();

    await expect(page.locator(".intake-request-list")).toBeVisible();
    await expect(page.locator(".intake-upload")).toBeVisible();
    await expect(page.locator(".workspace-inspector")).toHaveCount(0);
    await expect(page.locator(".intake-upload__files header span")).toHaveText(String(dataRoomExpectations.documents), {timeout: 120_000});
    await expectNoErrorNotice(page);

    const analyze = page.locator(".intake-collect__process form button[type=submit]");
    await expect(analyze).toBeEnabled({timeout: 60_000});
    await analyze.click();

    await awaitIntakeAnalysis(page);
    const stats = page.locator(".intake-review__stats");
    await expect(stats.locator("span").nth(0)).toContainText(String(dataRoomExpectations.documents));
    await expect(stats.locator("span").nth(1)).toContainText(String(dataRoomExpectations.candidates));
    await expect(stats.locator("span").nth(2)).toContainText(String(dataRoomExpectations.openIssues));
    await expect(page.locator(".intake-issues__list article")).toHaveCount(dataRoomExpectations.openIssues);
    // The R$49m vs ~R$50m conflict is preserved as an explicit issue, never silently reconciled.
    await expect(page.locator(".intake-issues__list")).toContainText(/49 milhões/);
  });

  test("accepts high-confidence suggestions and confirms the case", async () => {
    await page.goto(`${primaryProjectUrl}&step=documents`);
    await expect(page.locator(".intake-review")).toBeVisible();

    // Reading the files does not invent the five qualitative facts that decide whether an
    // expansion case is defensible. The request ladder must ask them, persist each answer, and
    // feed the answers back into the same case engine before a diagnostic can be confirmed.
    const qualitativeAnswers: Record<string, string> = {
      info_why_now: "Os três pontos já estão contratados e as obras precisam começar em março; sem a operação, a companhia perde os pontos e os depósitos.",
      info_business_model: "Rede de supermercados de vizinhança no interior de São Paulo, com receita de venda no varejo e margem sustentada por escala de compras e marca própria.",
      info_customer_concentration: "Venda pulverizada ao consumidor final; nenhum cliente representa mais de 1% da receita e não há contratos comerciais concentrados.",
      info_ramp_history: "As duas últimas lojas atingiram R$ 800 mil de receita mensal no mês 12 e estabilizaram perto de R$ 1,1 milhão entre os meses 18 e 20.",
      info_capex_actual: "A última unidade custou R$ 14,6 milhões contra orçamento de R$ 12,0 milhões; o desvio veio de obra civil e equipamentos de refrigeração.",
    };
    for (const [requirementId, answer] of Object.entries(qualitativeAnswers)) {
      const form = page.locator(`.intake-information__form:has(input[name="requirement_id"][value="${requirementId}"])`);
      await expect(form).toBeVisible();
      await form.locator("textarea[name=answer]").fill(answer);
      await form.locator("button[type=submit]").click();
      await expect(form).toHaveCount(0);
    }

    await page.locator(".intake-review__reanalyze button[type=submit]").click();
    await awaitIntakeAnalysis(page);
    await expect(page.locator(".intake-case-review-actions")).toBeVisible();
    await page.locator(".intake-review__toolbar form").first().locator("button[type=submit]").click();
    // Confirmation copy is about the decision, not an internal field count. Prove the bulk action
    // itself on the evidence register instead of leaking that implementation detail into the UI.
    await expect(page.locator(".intake-field.is-confirmed")).toHaveCount(dataRoomExpectations.acceptedAfterBulkAccept);

    // Review the actual extracted candidate through the same form available to the borrower.
    // The synthetic source files and their extraction expectations remain unchanged.
    const evidence = page.locator(".intake-review__evidence");
    if (await evidence.getAttribute("open") === null) await evidence.locator(":scope > summary").click();
    const sector = page.locator(".intake-field").filter({has: page.locator("label > span", {hasText: /^Setor$/})});
    await expect(sector).toHaveCount(1);
    const sectorGroup = page.locator(".intake-group").filter({has: sector});
    if (await sectorGroup.getAttribute("open") === null) await sectorGroup.locator(":scope > summary").click();
    await sector.locator('input[name="normalized_value"]').fill("varejo");
    await sector.locator('button[name="decision"][value="edit"]').click();
    await expect(sector).toHaveClass(/is-confirmed/);
    await expect(sector.locator('input[name="normalized_value"]')).toHaveValue("varejo");

    await page.locator('.intake-confirm input[name="confirmation"]').check();
    await page.locator(".intake-confirm button[type=submit]").click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/opportunities\//, {timeout: 60_000});
    confirmedOpportunityUrl = page.url();
    await expect(page.locator(".deal-workspace__topbar h1")).toHaveText(initialProjectName);
    await expectNoErrorNotice(page);
  });

  test("opens the governed workspace with its source context", async () => {
    await page.goto("/pt-BR/app");
    await expect(page.locator(".advisor-start")).toBeVisible();
    await expect(page.locator(".app-rail__scroll")).toContainText(initialProjectName);

    await page.goto(confirmedOpportunityUrl);
    await expect(page.locator(".deal-workspace__topbar h1")).toHaveText(initialProjectName);
    await expect(page.locator(".deal-workspace__topbar dl dd").nth(2)).toHaveText(String(dataRoomExpectations.documents));
    await expect(page.locator(".deal-control-panel")).toContainText("Análises vinculadas às informações de origem.");
  });

  test("an unknown document set yields the honest empty state in the workspace flow", async () => {
    await page.goto("/pt-BR/app/new");
    await expect(page.locator(".private-project-gate--terms")).toBeVisible();
    await expect(page.locator(".private-project-gate__accepted")).toHaveCount(0);
    await expect(page.locator('input[name="terms_agreed"]')).not.toBeChecked();
    await expect(page.locator('input[name="information_rights_declared"]')).not.toBeChecked();
    await page.locator('input[name="signatory_title"]').fill("Diretora financeira");
    await page.locator('input[name="terms_agreed"]').check();
    await page.locator('input[name="information_rights_declared"]').check();
    await page.locator('.private-project-gate__form button[type="submit"]').click();
    await expect(page.locator(".private-project-gate--project")).toBeVisible();
    await page.locator('.private-project-gate__form input[name="project_name"]').fill(secondaryProjectName);
    await expect(page.locator('input[name="representation_declared"]')).toHaveAttribute("type", "hidden");
    await page.locator('.private-project-gate__form button[type="submit"]').click();
    await expect(page).toHaveURL(/mode=documents&session=.*step=company/);
    await expect(page.locator(".intake-collect")).toBeVisible();
    await expect(page.locator('input[name="company_name"]')).toHaveValue("");
    await expect(page.locator('input[name="legal_name"]')).toHaveValue("");
    await expect(page.locator('input[name="website"]')).toHaveValue("");
    await expect(page.locator('textarea[name="description"]')).toHaveValue("");
    await expect(page.locator('input[name="legal_identifier"]')).toHaveAttribute("placeholder", "Digite o CNPJ");
    await completeCompanyMilestone(page);

    await chooseOperation(page);
    await page.locator("#brief-objective").fill("Financiar a abertura de uma nova unidade.");
    await page.locator("#brief-amount").fill("1 milhão");
    await page.locator(".intake-brief__advanced > summary").click();
    await page.locator("#brief-sector").fill("varejo alimentar");
    await page.locator("#brief-geography").fill("SP");
    await page.locator(".intake-operation-context__actions button[type=submit]").click();
    await expect(page.locator(".preliminary-understanding")).toBeVisible({timeout: 120_000});
    await expect(page.locator(".preliminary-understanding__grid")).toContainText("Financiar a abertura de uma nova unidade.");
    await page.locator(".preliminary-understanding__decision form button[type=submit]").click();
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
    await awaitIntakeAnalysis(page);
    await expect(page.locator(".intake-review__empty")).toBeVisible();
    await expect(page.locator(".intake-issues__list article")).toHaveCount(1);
    await expect(page.locator(".intake-field")).toHaveCount(0);
  });

  test("lists, opens, renames and removes projects from the workspace navigator", async () => {
    await page.goto("/pt-BR/app");
    const projectList = page.locator(".app-rail__scroll");
    await expect(projectList).toContainText(initialProjectName);
    await expect(projectList).toContainText(secondaryProjectName);

    const secondaryProject = railProject(page, secondaryProjectName);
    const renameMenu = await openActionMenu(page, secondaryProject.locator(".workspace-project-actions__trigger"));
    const renamedProjectName = `Projeto Renomeado ${runId}`;
    await renameMenu.locator(".workspace-project-actions__plain").click();
    await renameMenu.locator('input[name="project_name"]').fill(renamedProjectName);
    await renameMenu.locator('form:has(input[name="project_name"]) button[type="submit"]').click();
    await expect(projectList).toContainText(renamedProjectName);

    const archiveMenu = await openActionMenu(page, railProject(page, renamedProjectName).locator(".workspace-project-actions__trigger"));
    page.once("dialog", (dialog) => dialog.accept());
    await archiveMenu.locator(".workspace-project-actions__archive").click();
    await expect(page.locator(".app-rail__item").filter({hasText: renamedProjectName})).toHaveCount(0);
    await expect(projectList).toContainText(initialProjectName);
  });

  test("proposes a public debt-lens analysis from the company alone", async () => {
    await page.goto("/pt-BR/app/new/company-debt");

    await expect(page.locator(".origination-setup__header h1")).toHaveText("Entenda o balanço antes de escolher a operação.");
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    const form = page.locator("form.origination-form");
    await expect(form.locator('textarea[name="focus"]')).not.toHaveAttribute("required", "");
    await expect(form.locator('textarea[name="known_context"]')).not.toHaveAttribute("required", "");
    await form.locator('input[name="project_name"]').fill(companyDebtProjectName);
    await form.locator('input[name="company_name"]').fill("Companhia Pública Exemplo");
    await form.locator('input[name="company_website"]').fill("companhia-publica.example.com");
    await form.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/pt-BR\/app\/projects\/[0-9a-f-]+$/);
    await expect(page.locator(".advisor-project__conversation")).toBeVisible();
    const specializedWork = page.locator(".advisor-context-section__open");
    await expect(specializedWork).toBeVisible();
    await specializedWork.click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/projects\/[0-9a-f-]+$/);
    // Direct setup has the same consent boundary as the chat. Opening work cannot start it.
    await expect.poll(async () => {
      await page.reload();
      return page.locator(".execution-brief-card__approval").getAttribute("data-approval-status");
    }, {timeout: 180_000}).toBe("awaiting");
    await expect(page.getByTestId("execution-brief")).toContainText("Companhia Pública Exemplo");
    await expect(page.locator(".execution-brief-card__approval button")).toBeEnabled();
    await expect(page.locator(".origination-working")).toHaveCount(0);

    await page.goto("/pt-BR/app");
    const createdProject = railProject(page, companyDebtProjectName);
    await expect(createdProject).toBeVisible();
    const createdMenu = await openActionMenu(page, createdProject.locator(".workspace-project-actions__trigger"));
    page.once("dialog", (dialog) => dialog.accept());
    await createdMenu.locator(".workspace-project-actions__archive").click();
    await expect(page.locator(".app-rail__item").filter({hasText: companyDebtProjectName})).toHaveCount(0);
  });

  test("creates and reopens one conversational project from the workspace composer", async () => {
    await page.goto("/pt-BR/app");
    await page.getByRole("button", {name: "Nova pasta"}).first().click();
    await page.locator('.app-rail__create input[name="group_name"]').fill(workspaceGroupName);
    await page.locator('.app-rail__create button[type="submit"]').click();
    await expect(page).toHaveURL(/\/pt-BR\/app\?group=[0-9a-f-]+$/);

    let workspaceGroup = page.locator(".app-rail__folder").filter({hasText: workspaceGroupName});
    const groupMenu = await openActionMenu(page, workspaceGroup.locator(".workspace-project-actions__trigger"));
    await groupMenu.locator(".workspace-project-actions__plain").click();
    await groupMenu.locator('input[name="group_name"]').fill(renamedWorkspaceGroupName);
    await groupMenu.locator('form:has(input[name="group_name"]) button[type="submit"]').click();
    await expect(page.locator(".app-rail__scroll")).toContainText(renamedWorkspaceGroupName);

    workspaceGroup = page.locator(".app-rail__folder").filter({hasText: renamedWorkspaceGroupName});
    const newConversationMenu = await openActionMenu(page, workspaceGroup.locator(".workspace-project-actions__trigger"));
    await newConversationMenu.getByRole("link", {name: "Nova conversa"}).click();
    await expect(page.locator(".advisor-start__head h1")).toContainText("Como a Offroad pode te ajudar?");
    await expect(page.locator(".advisor-start__project-context")).toContainText(renamedWorkspaceGroupName);
    const request = `Conversa ${runId}: planejar R$ 20 milhões`;
    await page.locator(".advisor-composer--start textarea").fill(request);
    await page.locator(".advisor-composer--start .advisor-composer__send").click();

    await expect(page).toHaveURL(/\/pt-BR\/app\/projects\/[0-9a-f-]+$/);
    await expect(page.locator(".advisor-project__conversation")).toBeVisible();
    await expect(page.locator(".advisor-thread")).toContainText(request);
    await expect(page.locator(".advisor-project__context")).toContainText("Plano de trabalho");

    // Simulate a lost action response without touching the database. The draft survives both
    // attempts and the exact retry carries the same server idempotency key.
    const commandBodies: string[] = [];
    const failCommand = async (route: import("@playwright/test").Route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        commandBodies.push(request.postData() ?? "");
        await route.abort("connectionfailed");
      } else {
        await route.continue();
      }
    };
    await page.route("**/app/projects/**", failCommand);
    const draft = "Preservar este pedido após falha de conexão";
    const followUp = page.locator(".advisor-composer textarea");
    const send = page.locator(".advisor-composer .advisor-composer__send");
    await followUp.fill(draft);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await send.click();
      await expect(page.locator(".form-notice--error")).toContainText("Seu texto foi preservado");
      await expect(followUp).toHaveValue(draft);
      await expect(send).toBeEnabled();
    }
    expect(commandBodies).toHaveLength(2);
    const messageIds = commandBodies.map((body) => /"messageId":"([0-9a-f-]+)"/.exec(body)?.[1]);
    expect(messageIds[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(messageIds[1]).toBe(messageIds[0]);
    await page.unroute("**/app/projects/**", failCommand);

    const projectUrl = page.url();
    await page.goto("/pt-BR/app");
    const folder = await openFolder(page, renamedWorkspaceGroupName);
    const project = folder.locator(".app-rail__item").filter({hasText: request}).first();
    await expect(project).toBeVisible();
    await project.locator("a").first().click();
    await expect(page).toHaveURL(projectUrl);

    await page.goto("/pt-BR/app");
    workspaceGroup = page.locator(".app-rail__folder").filter({hasText: renamedWorkspaceGroupName});
    const folderArchiveMenu = await openActionMenu(page, workspaceGroup.locator(".workspace-project-actions__trigger"));
    page.once("dialog", (dialog) => dialog.accept());
    await folderArchiveMenu.locator(".workspace-project-actions__archive").click();
    await expect(page.locator(".app-rail__folder").filter({hasText: renamedWorkspaceGroupName})).toHaveCount(0);
  });

  test("honors the private-document workflow chosen by attaching", async () => {
    await page.goto("/pt-BR/app");
    const request = `Caso privado ${runId}: compreender, conciliar e diagnosticar antes de estruturar`;
    const projectTitle = request.slice(0, 80);
    const composer = page.locator(".advisor-composer--start");
    await composer.locator("textarea").fill(request);
    // Attaching is what selects the private route now; the entry carries no starter buttons.
    await composer.locator('input[type="file"]').setInputFiles(dataRoomFiles.slice(0, 1));
    await expect(composer.locator(".advisor-composer__files > span")).toHaveCount(1);
    await composer.locator(".advisor-composer__send").click();

    await expect(page).toHaveURL(/\/pt-BR\/app\/projects\/[0-9a-f-]+$/);
    await expect(page.locator(".advisor-project__composer-wrap footer span")).toHaveText("Projeto privado");
    await expect(page.locator(".advisor-private-work__understanding")).toBeVisible({timeout: 120_000});
    await expect(page.locator(".advisor-private-work__understanding h2")).toHaveText("O que entendemos até aqui");

    await page.goto("/pt-BR/app");
    const project = railProject(page, projectTitle);
    await expect(project).toBeVisible();
    const privateMenu = await openActionMenu(page, project.locator(".workspace-project-actions__trigger"));
    page.once("dialog", (dialog) => dialog.accept());
    await privateMenu.locator(".workspace-project-actions__archive").click();
    await expect(page.locator(".app-rail__item").filter({hasText: projectTitle})).toHaveCount(0);
  });

  test("starts and processes an advisor project from documents alone", async () => {
    await page.goto("/pt-BR/app");
    const composer = page.locator(".advisor-composer--start");

    // A prepared package is itself a valid request. The user does not need to restate the
    // company or capital need before the system reads what was attached.
    await composer.locator('input[type="file"]').setInputFiles(dataRoomFiles);
    await expect(composer.locator(".advisor-composer__files > span")).toHaveCount(dataRoomExpectations.documents);
    await expect(composer.locator("textarea")).toHaveValue("");
    await expect(composer.locator(".advisor-composer__send")).toBeEnabled();
    await composer.locator(".advisor-composer__send").click();

    await expect(page).toHaveURL(/\/pt-BR\/app\/projects\/[0-9a-f-]+$/);
    await expect(page.locator(".advisor-project__composer-wrap footer span")).toHaveText("Projeto privado");
    const inventory = page.getByTestId("evidence-inventory");
    await expect(inventory.locator(".advisor-evidence-inventory__summary")).toContainText(`${dataRoomExpectations.documents} arquivos recebidos`);
    await inventory.getByText("Ver documentos recebidos", {exact: true}).click();
    await expect(inventory.locator(".advisor-evidence-inventory__files > li")).toHaveCount(dataRoomExpectations.documents);
    await expect(page.locator(".advisor-private-work__understanding")).toBeVisible({timeout: 120_000});
    await expect(page.locator(".advisor-private-work__understanding h2")).toHaveText("O que entendemos até aqui");
  });

  test("compares uploaded proposals through the worker and preserves the work product after reload", async ({}, testInfo) => {
    test.skip(process.env.OFFROAD_E2E_DOCUMENT_WORK_PRODUCT !== "1", "Requires a worker with an authorized narrative provider; no generated result is seeded.");
    await page.goto("/pt-BR/app");
    const composer = page.locator(".advisor-composer--start");
    await composer.locator("textarea").fill("Compare estas propostas de financiamento. Prepare uma comparação documental preliminar das condições e das informações que faltam. Documentos sintéticos para teste.");
    await composer.locator('input[type="file"]').setInputFiles([
      {name: "proposta-alfa-sintetica.csv", mimeType: "text/csv", buffer: Buffer.from("campo,condicao\nidentificacao,Proposta Alfa - documento sintetico\ncompanhia,Companhia Teste\ninstrumento,Emprestimo corporativo\nprazo,36 meses\ngarantia,Alienacao fiduciaria de equipamentos\namortizacao,Mensal\n")},
      {name: "proposta-beta-sintetica.csv", mimeType: "text/csv", buffer: Buffer.from("campo,condicao\nidentificacao,Proposta Beta - documento sintetico\ncompanhia,Companhia Teste\ninstrumento,Emprestimo corporativo\nprazo,48 meses\ngarantia,Fianca corporativa\namortizacao,Trimestral\n")},
    ]);
    await expect(composer.locator(".advisor-composer__files > span")).toHaveCount(2);
    await composer.locator(".advisor-composer__send").click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/projects\/[0-9a-f-]+$/);
    const projectUrl = page.url();
    // Private uploads first produce an understanding for the user to confirm. The
    // confirmation action invokes processIntakeSession again; only then may the
    // governed analysis dispatch become available for approval. Do not bypass this
    // gate by treating the initial upload as approval of a full analysis.
    const preliminary = page.locator(".advisor-private-work__understanding");
    await expect(preliminary).toBeVisible({timeout: 180_000});
    await expect(preliminary.locator("h2")).toHaveText("O que entendemos até aqui");
    await preliminary.locator('form:has(input[name="decision"][value="confirmed"]) button[type="submit"]').click();
    await expectNoErrorNotice(page);
    await expect(page.locator(".advisor-private-work__request")).toBeVisible({timeout: 120_000});
    const approval = page.getByTestId("execution-brief").locator('[data-approval-status="awaiting"]');
    await expect(approval).toBeVisible({timeout: 120_000});
    await approval.getByRole("button", {name: /aprovar|approve/i}).click();
    const work = page.locator(".advisor-work-surface");
    await expect(work).toBeVisible({timeout: 180_000});
    await expect(work.getByRole("heading", {name: "Comparação documental de propostas", exact: true}).last()).toBeVisible();
    await expect(work).toContainText("proposta-alfa-sintetica.csv");
    await expect(work).toContainText("proposta-beta-sintetica.csv");
    await expect(work).toContainText("Análise documental preliminar");
    const rendered = await work.locator(".advisor-work-surface__content").innerText();
    await work.locator(".advisor-work-surface__navigation a").first().click();
    await expect(page).toHaveURL(/#work-/);
    const linkedUrl = page.url();
    await page.reload();
    await expect(work.locator(".advisor-work-surface__content")).toHaveText(rendered);
    const downloadPromise = page.waitForEvent("download");
    await work.getByRole("link", {name: "Baixar Word", exact: true}).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.docx$/);
    expect(await download.failure()).toBeNull();
    await download.saveAs(testInfo.outputPath("comparison.docx"));
    await page.screenshot({path: testInfo.outputPath("comparison-desktop.png"), fullPage: true});
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(linkedUrl);
    await expect(work).toBeVisible();
    await page.locator(".advisor-work-mobile-nav").getByRole("button", {name: "Conversa", exact: true}).click();
    await expect(page.locator(".advisor-composer textarea")).toBeVisible();
    await page.locator(".advisor-composer textarea").fill("Rascunho preservado");
    await page.locator(".advisor-work-mobile-nav").getByRole("button", {name: /Trabalho/}).click();
    await expect(work).toBeVisible();
    await page.screenshot({path: testInfo.outputPath("comparison-mobile.png"), fullPage: true});
    await page.locator(".advisor-work-mobile-nav").getByRole("button", {name: "Conversa", exact: true}).click();
    await expect(page.locator(".advisor-composer textarea")).toHaveValue("Rascunho preservado");
    await page.setViewportSize({width: 1280, height: 720});
    expect(projectUrl).toContain("/app/projects/");
  });

  test("signs out and logs back in with the password", async () => {
    await page.goto("/pt-BR/app");
    // Signing out moved into the account menu at the foot of the rail.
    await page.locator(".app-rail__account").click();
    await expect(page.locator(".app-rail__menu")).toBeVisible();
    await page.locator(".app-rail__menu form button[type=submit]").click();
    await expect(page).toHaveURL(/\/pt-BR\/?$/);

    await page.goto("/pt-BR/login");
    await page.locator('input[name="email"]').fill(account.email);
    await page.locator('input[name="password"]').fill(account.password);
    await page.locator("form button.auth-form__primary").click();
    await expect(page).toHaveURL(/\/pt-BR\/app/);
    await expect(page.locator(".advisor-start")).toBeVisible();
    await expect(page.locator(".app-rail__scroll")).toContainText(initialProjectName);
  });

  test("renders reviewed sector context from a real worker proposal with synthetic local job setup", async ({}, testInfo) => {
    const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    const databaseAddress = new URL(databaseUrl);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(databaseAddress.hostname) || databaseAddress.port !== "54322" || databaseAddress.pathname !== "/postgres") throw new Error("Sector planning setup is restricted to the local test database on port 54322.");
    const sessionId = new URL(primaryProjectUrl, "http://localhost").searchParams.get("session");
    if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error("Missing synthetic intake session.");
    const output = execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1", "-v", `session_id=${sessionId}`, "-v", `owner_email=${account.email}`, "-f", join(__dirname, "support", "sector-planning-local.sql")], {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]});
    const {projectId, targetId} = JSON.parse(output.trim().split("\n").at(-1) ?? "{}");
    if (![projectId, targetId].every((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))) throw new Error("Synthetic setup did not return its project and target identities.");
    type ProposalDiagnostic = {status: string; fingerprint: string | null; lastError: unknown; planners: {id: string; status: string; lastError: unknown}[]};
    let diagnostic: ProposalDiagnostic | null = null;
    try {
      await expect.poll(() => {
        const result = execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1", "-v", `target_id=${targetId}`], {
          encoding: "utf8", input: `select jsonb_build_object('status',j.status,'lastError',j.last_error,'fingerprint',b.visible_snapshot->>'fingerprint','planners',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'status',p.status,'lastError',p.last_error)) from public.processing_jobs p where p.organization_id=j.organization_id and p.intake_session_id=j.intake_session_id and p.kind='execution_brief_proposal' and p.payload->>'approval_target_job_id'=j.id::text),'[]'::jsonb)) from public.processing_jobs j left join public.capital_project_execution_brief_dispatches d on d.organization_id=j.organization_id and d.processing_job_id=j.id left join public.capital_project_execution_briefs b on b.organization_id=d.organization_id and b.id=d.execution_brief_id where j.id=:'target_id'::uuid;`,
        });
        diagnostic = JSON.parse(result.trim() || "null") as ProposalDiagnostic | null;
        // Stop waiting as soon as a terminal error exists; assertions below preserve failure.
        return diagnostic === null || Boolean(diagnostic.fingerprint)
          || ["failed", "cancelled"].includes(diagnostic.status)
          || diagnostic.planners.some((planner) => ["failed", "cancelled"].includes(planner.status));
      }, {timeout: 120_000, intervals: [1000, 2000, 5000]}).toBe(true);
    } finally {
      // Only this loopback synthetic target and its own planner jobs are included.
      await testInfo.attach("sector-planner-diagnostic", {body: JSON.stringify({projectId, targetId, diagnostic}, null, 2), contentType: "application/json"});
    }
    const state = diagnostic as ProposalDiagnostic | null;
    expect(state, "The exact synthetic target must exist").not.toBeNull();
    const failureDetail = JSON.stringify(state);
    expect(state!.planners.some((planner) => ["failed", "cancelled"].includes(planner.status)), `The real planner failed: ${failureDetail}`).toBe(false);
    expect(state!.status, failureDetail).toBe("awaiting_approval");
    expect(state!.fingerprint, failureDetail).toMatch(/^[a-f0-9]{64}$/);
    const expectedFingerprint = state!.fingerprint;
    await page.goto(`/pt-BR/app/projects/${projectId}`);
    const card = page.locator(`[data-testid="execution-brief"][data-brief-fingerprint="${expectedFingerprint}"]`);
    await expect(card).toBeVisible({timeout: 120_000});
    const approval = card.locator('[data-approval-status="awaiting"]');
    await expect(approval).toBeVisible();
    const context = card.getByTestId("execution-brief-planning-context");
    await expect(context).toBeVisible();
    await expect(context).toContainText("Contexto e pontos a examinar");
    await expect(context).toContainText("Ainda não examinado");
    const object = context.locator(":scope > details").first();
    await object.locator(":scope > summary").click();
    const attribute = object.locator("dl > div").filter({has: page.locator("dt", {hasText: /^Setor$/})});
    await expect(attribute).toContainText("Varejo");
    await expect(attribute).toContainText("Confirmado no contexto");
    await attribute.getByText("Referências do contexto", {exact: true}).click();
    await expect(attribute.getByText("Informação revisada pelo usuário", {exact: false})).toBeVisible();
    await expect(attribute.getByText("Revisão do usuário", {exact: true})).toBeVisible();
    await expect(attribute).toContainText("reviewed_at:");
    const desktopViewport = page.viewportSize();
    if (!desktopViewport) throw new Error("The planning context visual check requires a configured viewport.");
    await context.scrollIntoViewIfNeeded();
    const desktopImage = await page.screenshot({path: testInfo.outputPath("sector-context-desktop.png"), fullPage: true, scale: "css"});
    await testInfo.attach("sector-context-desktop", {body: desktopImage, contentType: "image/png"});
    try {
      await page.setViewportSize({width: 390, height: 844});
      await context.scrollIntoViewIfNeeded();
      await expect.poll(() => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 1)).toBe(true);
      const bounds = await context.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.width).toBeLessThanOrEqual(390);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
      const screenshot = await page.screenshot({path: testInfo.outputPath("sector-context-mobile.png"), fullPage: true, scale: "css"});
      await testInfo.attach("sector-context-mobile", {body: screenshot, contentType: "image/png"});
      // PNG IHDR width also catches painted overflow outside an otherwise narrow root box.
      expect(screenshot.readUInt32BE(16)).toBe(390);
    } finally {
      await page.setViewportSize(desktopViewport);
    }
    await expect(approval.getByRole("button", {name: /aprovar|approve/i})).toBeEnabled();
    await expect(page.locator(".intake-review")).toHaveCount(0);

    expect(testInfo.attachments.filter((attachment) => attachment.contentType === "image/png")).toHaveLength(2);
    // Leave substantive work held: this test exercises no provider and grants no dispatch.
  });
  test("confirms a synthetic pool and reporting date before approving its real worker plan", async ({}, testInfo) => {
    const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    const address = new URL(databaseUrl);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(address.hostname) || address.port !== "54322" || address.pathname !== "/postgres") throw new Error("Scope fixture requires the isolated local database.");
    const sessionId = new URL(primaryProjectUrl, "http://localhost").searchParams.get("session")!;
    const fixture = await receivablesScopeFixture();
    const sql = (query: string) => execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1", "-v", `session_id=${sessionId}`], {encoding: "utf8", input: query});
    execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1", "-v", `session_id=${sessionId}`, "-v", `owner_email=${account.email}`, "-v", `fixture=${JSON.stringify(fixture)}`, "-f", join(__dirname, "support", "receivables-scope-local.sql")], {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]});
    const projectId = sql("select capital_project_id from public.document_intake_sessions where id=:'session_id'::uuid;").trim();
    await page.goto(`/pt-BR/app/projects/${projectId}`);
    const scope = page.getByTestId("receivables-scope-card");
    await expect(scope).toBeVisible();
    await scope.locator('input[name="primaryTape"]').first().check();
    for (const source of fixture.sources.slice(2)) await scope.locator(`input[name="complementDocumentIds"][value="${source.id}"]`).check();
    await scope.locator('input[name="reportingDate"]').fill("2026-08-31");
    await scope.locator('input[name="scopeConfirmed"]').check();
    const capture = async (label: string) => {
      const desktop = page.viewportSize();
      if (!desktop) throw new Error("Scope QA requires a viewport.");
      await testInfo.attach(`${label}-desktop`, {body: await page.screenshot({fullPage: true, scale: "css"}), contentType: "image/png"});
      try {
        await page.setViewportSize({width: 390, height: 844});
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        await testInfo.attach(`${label}-mobile`, {body: await page.screenshot({fullPage: true, scale: "css"}), contentType: "image/png"});
      } finally {
        await page.setViewportSize(desktop);
      }
    };
    await scope.scrollIntoViewIfNeeded();
    await capture("synthetic-pool-confirmation");
    await scope.getByRole("button", {name: "Confirmar escopo e revisar plano"}).click();
    await expect.poll(() => sql("select count(*) from private.receivables_evidence_scopes where intake_session_id=:'session_id'::uuid;").trim()).toBe("1");
    await expect.poll(() => sql("select count(*) from public.capital_project_execution_brief_dispatches d join public.processing_jobs j on j.id=d.processing_job_id join public.document_intake_sessions s on s.id=j.intake_session_id where s.id=:'session_id'::uuid and j.processing_run_id=s.current_run_id and j.status='awaiting_approval';").trim(), {timeout: 120_000}).toBe("1");
    await page.reload();
    const brief = page.getByTestId("execution-brief");
    await expect(brief).toContainText("2026-08-31");
    await brief.scrollIntoViewIfNeeded();
    await capture("synthetic-approved-scope-plan");
    await brief.getByRole("button", {name: /aprovar|approve/i}).click();
    await expect.poll(() => sql("select count(*) from public.capital_project_execution_brief_events e where e.capital_project_id=(select capital_project_id from public.document_intake_sessions where id=:'session_id'::uuid) and e.event_type='accepted' and e.event_payload->>'processingJobId' in (select id::text from public.processing_jobs where processing_run_id=(select current_run_id from public.document_intake_sessions where id=:'session_id'::uuid));").trim(), {timeout: 30_000}).not.toBe("0");
    await expect.poll(() => sql("select result_summary#>>'{case_state,receivablesVertical,status}' from public.document_intake_sessions where id=:'session_id'::uuid;").trim(), {timeout: 120_000}).toBe("analyzed");
    // A persisted report is not proof of completion: the operating-control write follows it.
    await expect.poll(() => sql("select j.status from public.processing_jobs j join public.document_intake_sessions s on s.id=j.intake_session_id where s.id=:'session_id'::uuid and j.processing_run_id=s.current_run_id and j.kind='case_analysis' order by j.created_at desc limit 1;").trim(), {timeout: 120_000}).toBe("succeeded");
    const report = sql("select result_summary#>'{case_state,receivablesVertical}' from public.document_intake_sessions where id=:'session_id'::uuid;");
    const result = JSON.parse(report);
    expect(result.pipeline.phaseOne.universe.reportingDate).toBe("2026-08-31");
    expect(result.pipeline.phaseOne.universe.id).toContain(fixture.sources[0]!.id);
    // Assert the economic result, not substrings that might also occur inside source hashes.
    expect(Number(result.pipeline.phaseOne.staticMetrics.portfolio.titleCount.value)).toBe(1);
    expect(Number(result.pipeline.phaseOne.staticMetrics.portfolio.totalOpenValue.value)).toBe(1000);
    const storedScope = JSON.parse(sql("select jsonb_build_object('id', id, 'fingerprint', fingerprint) from private.receivables_evidence_scopes where intake_session_id=:'session_id'::uuid order by confirmed_at desc,id desc limit 1;"));
    expect(result.evidenceScope).toEqual(storedScope);
    const periods = result.supportPeriodAssessment;
    expect(periods.schemaVersion).toBe("receivables-support-periods.v1");
    expect(periods.entries).toHaveLength(37);
    expect(periods.reportingDate).toBe("2026-08-31");
    expect(periods.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({sourceId: fixture.sources[2]!.id, rawDate: "2026-08-31", qualification: "included"}),
      expect.objectContaining({sourceId: fixture.sources[2]!.id, rawDate: "2026-09-01", qualification: "subsequent"}),
      expect.objectContaining({sourceId: fixture.sources[2]!.id, rawDate: null, qualification: "missing"}),
      expect.objectContaining({sourceId: fixture.sources[3]!.id, rawDate: "09/2026", qualification: "subsequent"}),
      expect.objectContaining({sourceId: fixture.sources[5]!.id, rawDate: "2026-09-02T12:00:00-03:00", qualification: "subsequent"}),
    ]));
    expect(result.balanceSourceAssessment.schemaVersion).toBe("balance-source-proposals.v1");
    expect(result.balanceSourceAssessment.reportingDate).toBe("2026-08-31");
    expect(result.balanceSourceAssessment.proposals).toHaveLength(1);
    const balanceProposal = result.balanceSourceAssessment.proposals[0];
    expect(balanceProposal).toMatchObject({sourceId: fixture.sources[4]!.id, sourceHash: fixture.sources[4]!.sourceHash, documentVersion: 1, reviewState: "proposed", calculationUse: "not_permitted"});
    expect(balanceProposal.columns.map((column: {role: string}) => column.role)).toEqual(["opening_balance", "closing_balance"]);
    expect(balanceProposal.context).toEqual(expect.arrayContaining([
      expect.objectContaining({kind: "period", anchor: expect.objectContaining({text: "Periodo 01/01/2026 a 31/08/2026"})}),
      expect.objectContaining({kind: "issued_at", anchor: expect.objectContaining({text: "Emissao 02/09/2026"})}),
    ]));
    expect(balanceProposal.rows[0].cells.map((cell: {text: string}) => cell.text)).toEqual(["1", "Saldo sintetico", "700", "100", "999999"]);
    expect(balanceProposal.amount).toBeUndefined();
    expect(result.evidenceCoverage.complete).toBe(false);
    expect(result.methodReadiness.methodExecutionAllowed).toBe(false);
    expect(result.defects.find((defect: {id: string}) => defect.id === "accounting_reconciliation_difference")?.measured).toBeUndefined();
    expect(result.defects.some((defect: {id: string}) => defect.id === "cancelled_invoice_open")).toBe(false);
    expect(result.defects.find((defect: {id: string}) => defect.id === "dilution_misclassification")?.measured.value).toBe("100.00");
    await page.reload();
    const assessment = page.getByTestId("receivables-support-periods");
    await expect(assessment).toBeVisible();
    await expect(assessment.locator('[data-period-qualification]')).toHaveCount(25);
    const nextPage = assessment.getByRole("button", {name: "Próxima"});
    await nextPage.click();
    await expect(assessment.locator('[data-period-qualification]')).toHaveCount(periods.entries.length - 25);
    await assessment.getByRole("button", {name: "Anterior"}).click();
    await expect(assessment.locator('[data-period-qualification]')).toHaveCount(25);
    await nextPage.click();
    await assessment.locator('[data-period-qualification="missing"] > summary').first().click();
    await assessment.scrollIntoViewIfNeeded();
    await capture("synthetic-support-periods-pt");
    const balancePanel = page.getByTestId("balance-source-proposals");
    await expect(balancePanel).toBeVisible();
    await balancePanel.locator("details > summary").first().click();
    await expect(balancePanel).toContainText("Synthetic balance.csv");
    await expect(balancePanel).toContainText("Saldo atual");
    await expect(balancePanel).toContainText("Emissao 02/09/2026");
    await expect(balancePanel).not.toContainText("999999");
    await balancePanel.scrollIntoViewIfNeeded();
    await capture("synthetic-balance-proposals-pt");
    await page.goto(`/en-US/app/projects/${projectId}`);
    const englishAssessment = page.getByTestId("receivables-support-periods");
    await expect(englishAssessment).toBeVisible();
    await expect(englishAssessment.locator('[data-period-qualification]')).toHaveCount(25);
    await englishAssessment.getByRole("button", {name: "Next"}).click();
    await expect(englishAssessment.locator('[data-period-qualification]')).toHaveCount(periods.entries.length - 25);
    await englishAssessment.locator('[data-period-qualification="missing"] > summary').first().click();
    await englishAssessment.scrollIntoViewIfNeeded();
    await capture("synthetic-support-periods-en");
    const englishBalances = page.getByTestId("balance-source-proposals");
    await expect(englishBalances).toBeVisible();
    await englishBalances.locator("details > summary").first().click();
    await expect(englishBalances).toContainText("References for reviewing balances");
    await expect(englishBalances).toContainText("Saldo atual");
    await expect(englishBalances).not.toContainText("999999");
    await englishBalances.scrollIntoViewIfNeeded();
    await capture("synthetic-balance-proposals-en");
  });

  test("collects a governed R01 premise beside source diligence and persists only internal validation", async ({}, testInfo) => {
    const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    const address = new URL(databaseUrl);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(address.hostname) || address.port !== "54322" || address.pathname !== "/postgres") throw new Error("R01 fixture requires the isolated local database.");
    const sessionId = new URL(primaryProjectUrl, "http://localhost").searchParams.get("session")!;
    const fixture = await receivablesR01Fixture();
    const sql = (query: string) => execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1", "-v", `session_id=${sessionId}`], {encoding: "utf8", input: query}).trim();
    execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1", "-v", `session_id=${sessionId}`, "-v", `owner_email=${account.email}`, "-v", `fixture=${JSON.stringify(fixture)}`, "-f", join(__dirname, "support", "receivables-scope-local.sql")], {stdio: ["ignore", "pipe", "pipe"]});
    const projectId = sql("select capital_project_id from public.document_intake_sessions where id=:'session_id'::uuid;");
    await page.goto(`/pt-BR/app/projects/${projectId}`);
    const scope = page.getByTestId("receivables-scope-card");
    await scope.locator("label").filter({hasText: "Synthetic governed R01.xlsx"}).filter({hasText: "CARTEIRA"}).filter({has: page.locator('input[name="primaryTape"]')}).locator("input").check();
    for (const support of await scope.locator('input[name="complementDocumentIds"]').all()) await support.uncheck();
    for (const supportSheet of await scope.locator('input[name="primarySupportSheets"]').all()) await supportSheet.check();
    await expect(scope.locator('input[name="primarySupportSheets"][value="Excluded pool"]')).toHaveCount(0);
    await scope.locator('input[name="reportingDate"]').fill("2026-08-31");
    await scope.locator('input[name="scopeConfirmed"]').check();
    await scope.getByRole("button", {name: "Confirmar escopo e revisar plano"}).click();
    const currentJob = "select j.status from public.processing_jobs j join public.document_intake_sessions s on s.id=j.intake_session_id where s.id=:'session_id'::uuid and j.processing_run_id=s.current_run_id and j.kind='case_analysis' order by j.created_at desc limit 1;";
    await expect.poll(() => sql(currentJob), {timeout: 120_000}).toBe("awaiting_approval");
    await page.reload();
    await page.getByTestId("execution-brief").getByRole("button", {name: /aprovar|approve/i}).click();
    await expect.poll(() => sql(currentJob), {timeout: 120_000}).toBe("succeeded");
    const selectedScope = JSON.parse(sql("select scope from private.receivables_evidence_scopes where intake_session_id=:'session_id'::uuid order by confirmed_at desc,id desc limit 1;"));
    expect(selectedScope.schemaVersion).toBe("receivables-evidence-scope.v2");
    expect(selectedScope.primarySupportSheets).toEqual(["CEDENTE", "CONTABIL", "ESTRUTURA", "POLITICA", "RECEBIMENTOS"]);
    const initialRun = sql("select current_run_id from public.document_intake_sessions where id=:'session_id'::uuid;");
    const initialDraft = JSON.parse(sql("select draft from private.receivables_method_supplement_drafts where intake_session_id=:'session_id'::uuid order by created_at desc,revision desc limit 1;"));
    expect(initialDraft.fields["/structure/advanceRate"]).toBeUndefined();
    expect(initialDraft.sections.titles.value).toHaveLength(2);
    expect(sql("select count(*) from public.capital_project_information_requests where capital_project_id=(select capital_project_id from public.document_intake_sessions where id=:'session_id'::uuid) and source_namespace='receivables_method_r01_evidence' and status='open';")).not.toBe("0");
    const request = JSON.parse(sql("select jsonb_build_object('id',id,'question',question) from public.capital_project_information_requests where capital_project_id=(select capital_project_id from public.document_intake_sessions where id=:'session_id'::uuid) and source_namespace='receivables_method_r01_fields' and status='open' order by created_at desc limit 1;"));
    await page.reload();
    await page.locator('.information-request-card__selector select').selectOption(request.id);
    const answer = page.locator('article.information-request-card').filter({has: page.getByRole("heading", {name: request.question, exact: true})});
    await answer.locator('input[type="number"]').fill("50");
    await answer.locator('button[type="submit"]').click();
    await expect.poll(() => sql("select current_run_id from public.document_intake_sessions where id=:'session_id'::uuid;"), {timeout: 120_000}).not.toBe(initialRun);
    await expect.poll(() => sql(currentJob), {timeout: 120_000}).toMatch(/awaiting_approval|succeeded/);
    if (sql(currentJob) === "awaiting_approval") {
      await page.reload();
      await page.getByTestId("execution-brief").getByRole("button", {name: /aprovar|approve/i}).click();
    }
    await expect.poll(() => sql(currentJob), {timeout: 120_000}).toBe("succeeded");
    const refreshed = JSON.parse(sql("select draft from private.receivables_method_supplement_drafts where intake_session_id=:'session_id'::uuid order by created_at desc,revision desc limit 1;"));
    expect(refreshed.fields["/structure/advanceRate"].value).toBe("0.5");
    expect(refreshed.sections.titles).toEqual(initialDraft.sections.titles);
    const result = JSON.parse(sql("select result_summary#>'{case_state,receivablesVertical}' from public.document_intake_sessions where id=:'session_id'::uuid;"));
    expect(result.methodExecution).toMatchObject({status: "succeeded", mode: "internal_shadow", externalEffectAllowed: false});
    const persisted = JSON.parse(sql("select jsonb_build_object('outputFingerprint',r.output_fingerprint,'inputFingerprint',r.input_fingerprint) from private.receivables_specialist_shadow_runs r join public.document_intake_sessions s on s.id=r.intake_session_id where s.id=:'session_id'::uuid and r.processing_run_id=s.current_run_id order by r.created_at desc limit 1;"));
    expect(result.methodExecution.outputFingerprint).toBe(persisted.outputFingerprint);
    expect(result.methodExecution.inputFingerprint).toBe(persisted.inputFingerprint);
    await page.reload();
    await expect(page.locator('.information-request-card__selector option').filter({hasText: request.question})).toHaveCount(0);
    await testInfo.attach("r01-current-internal-validation", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});
  });

});
