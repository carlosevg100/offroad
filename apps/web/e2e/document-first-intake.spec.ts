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
const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
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
async function awaitIntakeAnalysis(page: Page, inspectPlan?: (approval: Locator) => Promise<void>) {
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
    if (inspectPlan) await inspectPlan(approval);
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

  test("accepts high-confidence suggestions and confirms the case", async ({}, testInfo) => {
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

    await page.locator(".intake-review__reanalyze button[type=submit]").click();
    await awaitIntakeAnalysis(page, async (approval) => {
      // Worker-backed CI must reach a newly proposed plan before substantive analysis.
      // Local runs without a worker retain the existing fixture route in the helper above.
      const context = page.getByTestId("intake-execution-approval").getByTestId("execution-brief-planning-context");
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
      await page.screenshot({path: testInfo.outputPath("sector-context-desktop.png"), fullPage: true, scale: "css"});
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
        // PNG IHDR width also catches painted overflow outside an otherwise narrow root box.
        expect(screenshot.readUInt32BE(16)).toBe(390);
      } finally {
        await page.setViewportSize(desktopViewport);
      }
      await expect(approval.getByRole("button", {name: /aprovar|approve/i})).toBeEnabled();
      await expect(page.locator(".intake-review")).toHaveCount(0);
    });
    await expect(page.locator(".intake-case-review-actions")).toBeVisible();
    await page.locator(".intake-review__toolbar form").first().locator("button[type=submit]").click();
    // Confirmation copy is about the decision, not an internal field count. Prove the bulk action
    // itself on the evidence register instead of leaking that implementation detail into the UI.
    await expect(page.locator(".intake-field.is-confirmed")).toHaveCount(dataRoomExpectations.acceptedAfterBulkAccept);

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
});
