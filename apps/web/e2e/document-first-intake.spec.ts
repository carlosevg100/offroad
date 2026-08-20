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
    await expect(page.locator('input[name="journey"][value="company"]')).toBeChecked();
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
  });

  test("starts with documents, uploads the data room and processes it", async () => {
    await page.goto("/pt-BR/onboarding");
    await page.locator(".intake-start__card.is-recommended button[type=submit]").click();
    await expect(page.locator(".intake-collect")).toBeVisible();

    // The operation decides the checklist; the brief decides who could buy the paper. Neither
    // needs a document, and both come before the upload in the conversation a desk actually has.
    await expect(page.locator(".intake-brief")).toHaveCount(0);
    await page.locator('.intake-operation__options button[value="growth_expansion"]').click();
    await expect(page.locator(".intake-brief")).toBeVisible();
    await expectNoErrorNotice(page);

    // Typed the way a person types, not the way a parser prefers.
    await page.locator("#brief-amount").fill("45 milhões");
    await page.locator("#brief-term").fill("60");
    await page.locator("#brief-grace").fill("12");
    await page.locator("#brief-sector").fill("varejo alimentar");
    await page.locator("#brief-geography").fill("sp");
    await page.locator("#brief-rate").fill("CDI + 4");
    await page.locator("#collateral-recebiveis").check();
    await page.locator("#collateral-imovel").check();
    await page.locator(".intake-brief__form button[type=submit]").click();

    await expectNoErrorNotice(page);
    // It came back as a number the desk can compute with, and the state was normalised.
    await expect(page.locator("#brief-amount")).toHaveValue("45.000.000");
    await expect(page.locator("#brief-geography")).toHaveValue("SP");
    await expect(page.locator("#brief-rate")).toHaveValue("CDI + 4");
    await expect(page.locator("#collateral-recebiveis")).toBeChecked();
    await expect(page.locator("#collateral-imovel")).toBeChecked();
    // Nothing was invented for the question nobody is expected to answer.
    await expect(page.locator("#instrument-debenture")).not.toBeChecked();

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

  test("submits onboarding and sees the case in the workspace with its evidence", async () => {
    await page.goto("/pt-BR/onboarding");
    await expect(page.locator(".onboarding-review")).toBeVisible();
    await page.locator(".onboarding-actions button.button:not(.button--ghost)").click();
    await expect(page).toHaveURL(/\/pt-BR\/app\?welcome=1/);
    await expect(page.locator(".opportunity-table [role=listitem]")).toHaveCount(1);
    await expect(page.locator(".opportunity-table")).toContainText(/Rede Horizonte Supermercados/);

    await page.locator(".opportunity-table [role=listitem]").first().click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/opportunities\//);
    const metrics = page.locator(".workbench-metrics article");
    await expect(page.locator(".credit-room__header h1")).toContainText(/Rede Horizonte Supermercados/);
    // documents = 8, evidence facts = accepted primaries
    await expect(metrics.nth(0).locator("strong")).toHaveText(String(dataRoomExpectations.documents));
    await expect(metrics.nth(1).locator("strong")).toHaveText(String(dataRoomExpectations.acceptedAfterBulkAccept));
  });

  test("an unknown document set yields the honest empty state in the workspace flow", async () => {
    await page.goto("/pt-BR/app/new");
    await page.locator(".intake-start__card.is-recommended button[type=submit]").click();
    await expect(page).toHaveURL(/mode=documents&session=/);
    await expect(page.locator(".intake-collect")).toBeVisible();

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
