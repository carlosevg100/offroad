import {expect, test, type Page} from "@playwright/test";

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
  test.beforeAll(() => {
    assertDataRoomPresent();
  });

  test("signs up with e-mail verification and lands on onboarding", async ({page}) => {
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

  test("starts with documents, uploads the data room and processes it", async ({page}) => {
    await page.goto("/pt-BR/onboarding");
    await page.locator(".intake-start__card.is-recommended button[type=submit]").click();
    await expect(page.locator(".intake-collect")).toBeVisible();

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

  test("accepts high-confidence suggestions and confirms the case", async ({page}) => {
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

  test("submits onboarding and sees the case in the workspace with its evidence", async ({page}) => {
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

  test("an unknown document set yields the honest empty state in the workspace flow", async ({page}) => {
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

  test("signs out and logs back in with the password", async ({page}) => {
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
