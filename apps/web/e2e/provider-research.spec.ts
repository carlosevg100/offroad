import {startLegacyConversation} from "./support/legacy-conversation";
import {useLegacyCompanyFixture} from "./support/legacy-workspace";
import {randomBytes} from "node:crypto";
import {expect, test} from "@playwright/test";
import {waitForOneTimeCode} from "./support/mail";

// Runs with the normal local worker, without provider credentials, seeded results or model calls.
test("unbound historical provider work cannot authorize research; current market navigation stays isolated", async ({page}) => {
  const base = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) throw new Error("Provider research E2E requires a local synthetic workspace.");
  const id = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const email = `e2e-providers-${id}@example.com`;
  const password = `Offroad-E2E-${id}!`;
  await page.goto("/pt-BR/signup");
  await page.locator('input[name="full_name"]').fill("QA pesquisa de financiadores");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirm_password"]').fill(password);
  await page.locator("form.auth-form--registration button[type=submit]").click();
  await expect(page).toHaveURL(/\/pt-BR\/signup\/verify/);
  await page.locator('input[name="token"]').fill(await waitForOneTimeCode(email));
  await page.locator("form.auth-form--verification button[type=submit]").click();
  await useLegacyCompanyFixture(page, email);
    await expect(page).toHaveURL(/\/pt-BR\/onboarding/);
  await expect(page.locator(".intake-start")).toBeVisible();
  await page.goto("/pt-BR/onboarding?setup=terms&job=capital_planning");
  await page.locator('input[name="signatory_title"]').fill("Analista");
  await page.locator('input[name="terms_agreed"]').check();
  await page.locator('input[name="information_rights_declared"]').check();
  await page.locator('.private-project-gate__form button[type="submit"]').click();
  await expect(page.locator(".private-project-gate--project")).toBeVisible();
  // Account onboarding becomes workspace-ready only when its first project is created.
  // Creating the shell does not start document analysis or seed the research result.
  await page.locator('input[name="project_name"]').fill(`Onboarding sintético ${id}`);
  await page.locator('.private-project-gate__form button[type="submit"]').click();
  await expect(page.locator(".intake-collect")).toBeVisible();
  const request = "Pesquise os financiadores e mandatos disponíveis para minha organização.";
  const historicalWorkId = startLegacyConversation(email, request, true);
  await page.goto(`/pt-BR/app/projects/${historicalWorkId}`);
  const brief = page.getByTestId("execution-brief");
  await expect(brief.locator('[data-approval-status="awaiting"]')).toBeVisible({timeout: 120_000});
  await expect(brief).toContainText(request);
  await expect(brief.locator(".execution-brief-card__workstreams > li")).toHaveCount(3);
  const research = page.getByTestId("provider-research-work");
  await expect(research).toHaveCount(0);
  // Historical context has no server-side native capture/review receipt. It is
  // readable, but cannot authorize work through the retired approval path.
  await expect(brief.locator('[data-approval-status="awaiting"]').getByRole("button", {name: /aprovar|approve/i})).toBeDisabled();
  await expect(brief.getByRole("checkbox")).toHaveCount(0);
  await page.reload();
  await expect(brief.locator('[data-approval-status="awaiting"]').getByRole("button", {name: /aprovar|approve/i})).toBeDisabled();
  await expect(research).toHaveCount(0);
  const projectPath = new URL(page.url()).pathname;
  // Actual authenticated market navigation exercises client messages, hydration and separation
  // from the already persisted private research artifact. No external links are followed.
  await page.locator('.app-rail__nav a[href="/pt-BR/app/market"]').click();
  await expect(page).toHaveURL(/\/pt-BR\/app\/market$/);
  await expect(page.getByRole("heading", {name: "Encontre o caminho para o capital."})).toBeVisible();
  await page.getByLabel("Buscar", {exact: true}).fill("Pátria");
  await expect(page.locator("main article")).toHaveCount(1);
  await page.getByLabel("Estrutura a pesquisar").selectOption("receivables");
  await expect(page.locator("main article")).toContainText("Estratégia pública compatível");
  await page.getByRole("button", {name: "Cadastros oficiais", exact: true}).click();
  await page.getByLabel("Base de origem").selectOption("bcb_root");
  await page.getByLabel("Buscar nome ou CNPJ").fill("61190658");
  await expect(page.locator("main article")).toHaveCount(1);
  await expect(page.locator("main article")).toContainText("8 dígitos; não é CNPJ completo");
  await expect(page.locator("main article")).toContainText("Sem mandato, ticket, taxa, capacidade ou apetite verificados.");
  await expect(page.locator('main article a[href^="https://olinda.bcb.gov.br/"]')).toHaveCount(1);
  await page.getByRole("button", {name: "Operações e taxas históricas", exact: true}).click();
  await expect(page.locator("main article")).toHaveCount(5);
  await expect(page.locator("main article").filter({hasText: "MOVIB2"})).toContainText("Investidores / financiadores não identificados na fonte.");
  await expect(page.locator("main article").filter({hasText: "MOVIB2"}).getByRole("link")).toHaveAttribute("href", /^https:\/\//);
  await page.goto(projectPath);
  await expect(page.getByTestId("provider-research-work")).toHaveCount(0);


});
