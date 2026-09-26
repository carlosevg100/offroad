import {randomBytes} from "node:crypto";
import {expect, test, type Page} from "@playwright/test";
import {institutionalInputFixture} from "../../../packages/financial-model/src/institutional-input.fixture";
import messages from "../messages/pt-BR.json";
import {useLegacyCompanyFixture} from "./support/legacy-workspace";
import {waitForOneTimeCode} from "./support/mail";
import {enableReleasedCapitalMethod} from "./support/released-capital-method";
import {addSourceVersion, localSql, readoptFromVersion, seedSourceBasis, type WorkContinuationSql} from "./support/work-continuation";
import {localWorker, seedInstitutionalFacts} from "./support/work-update-integration";

const updates = messages.App.workUpdates;
const names = messages.App.workUpdateNames;
const executions = messages.App.workExecutions;
const results = messages.InstitutionalModelResult;
const continuation = messages.App.advisorProject.continuation;
const capitalTitle = names.methods["prepare-capital-structure-decision"];
const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const fill = (text: string, values: Record<string, string | number>) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, String(value)), text);
const approveAndCalculate = "Aprovar e calcular";
/** Set while a journey holds the capability released or the worker paused; the hook puts both back even after a timeout. */
let restore: Array<() => void> = [];
test.afterEach(() => {
  const pending = restore;
  restore = [];
  for (const undo of pending.reverse()) undo();
});

async function signUp(page: Page, email: string, password: string) {
  await page.goto("/pt-BR/signup");
  await page.locator('input[name="full_name"]').fill("QA atualizações do trabalho");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirm_password"]').fill(password);
  await page.locator("form.auth-form--registration button[type=submit]").click();
  await expect(page).toHaveURL(/\/pt-BR\/signup\/verify/);
  await page.locator('input[name="token"]').fill(await waitForOneTimeCode(email));
  await page.locator("form.auth-form--verification button[type=submit]").click();
}

/** A private work with its intake session in the fresh workspace, as the execution journey creates them. */
async function privateWork(page: Page, sql: WorkContinuationSql, id: string, email: string): Promise<string> {
  await expect(page).toHaveURL(/\/pt-BR\/onboarding/);
  await page.goto("/pt-BR/onboarding?setup=terms&job=capital_planning");
  await page.locator('input[name="signatory_title"]').fill("Analista");
  await page.locator('input[name="terms_agreed"]').check();
  await page.locator('input[name="information_rights_declared"]').check();
  await page.locator('.private-project-gate__form button[type="submit"]').click();
  await expect(page.locator(".private-project-gate--project")).toBeVisible();
  await page.locator('input[name="project_name"]').fill(`Atualizações sintéticas ${id}`);
  await page.locator('.private-project-gate__form button[type="submit"]').click();
  await expect(page.locator(".intake-collect")).toBeVisible();
  const projectId = sql(`select p.id from public.capital_projects p join auth.users u on u.id=p.created_by where u.email='${email}' order by p.created_at desc limit 1;`);
  expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
  return projectId;
}

/**
 * Loads the work again and opens one of its sections through its navigation link, as a person coming
 * back to the work does. A goto that only changes the fragment keeps the rendered document (and its
 * forms, which the server refuses once stale), and the page's own refresh can put back the fragment
 * the router last recorded, so the section is chosen by its link after the load.
 */
async function openSection(page: Page, projectId: string, section: string) {
  const projectPath = `/pt-BR/app/projects/${projectId}`;
  if (new URL(page.url()).pathname === projectPath) await page.reload();
  else await page.goto(projectPath);
  await page.locator(`.advisor-work-surface__navigation a[href="#${section}"]`).click();
}

/**
 * The institutional model of the work through the product: the financial objective, a configuration
 * over the reconciled facts (its operating cost ratio is the scenario), the review roles and the
 * approval that calculates. Returns once the configuration of this scenario is approved.
 */
async function institutionalSetup(page: Page, email: string, projectId: string) {
  const fixture = institutionalInputFixture();
  const projectPath = `/pt-BR/app/projects/${projectId}`;
  await page.goto(projectPath);
  const entry = page.getByTestId("new-work-request");
  await entry.locator("summary").click();
  await entry.locator('textarea[name="objective"]').fill("Faça a comparação financeira dos cenários e calcule o serviço da dívida.");
  await expect(page.getByTestId("new-work-preview")).toHaveAttribute("data-kind", "dispatch");
  await entry.getByRole("button", {name: messages.NewWorkRequest.submit, exact: true}).click();
  await expect(page).toHaveURL(/#work-institutional-setup$/);
  // Review roles: the account owns the organization and prepares its own configurations, so it
  // approves them only with the explicit self-approval setting.
  await page.locator('.advisor-work-surface__navigation a[href="#work-project-review"]').click();
  const roles = page.getByTestId("project-review-roles");
  const ownRow = roles.locator(`tr[data-member-email="${email}"]`);
  await ownRow.locator('input[value="preparer"]').click();
  await expect(ownRow.locator('input[value="preparer"]')).toBeChecked();
  await ownRow.locator('input[value="approver"]').click();
  await expect(ownRow.locator('input[value="approver"]')).toBeChecked();
  await roles.locator('select[name="project_self_approval"]').selectOption("allowed");
  await expect(page.getByTestId("project-review-self-approval")).toHaveAttribute("data-effective", "true");
  return {
    fixture,
    /** Submits one scenario and waits for its configuration to be ready for review. */
    async submitScenario(costRatio: string) {
      await openSection(page, projectId, "work-institutional-setup");
      const form = page.getByTestId("institutional-setup-form");
      await expect(form).toBeVisible();
      await form.locator('[name="asOfDate"]').fill("2026-12-31");
      await form.locator('[name="currency"]').fill("BRL");
      await form.locator('[name="baseYear"]').fill("2026");
      await form.locator('[name="horizon"]').fill("1");
      const bindings = {...fixture.configuration.openingBalanceSheet.bindings, baseRevenue: fixture.configuration.revenueSegments[0].baseRevenue,
        taxLossCarryforward: fixture.configuration.taxes.openingTaxLossCarryforward, disallowedInterestCarryforward: fixture.configuration.taxes.openingDisallowedInterestCarryforward};
      for (const [key, binding] of Object.entries(bindings)) {
        const select = form.locator(`[name="history.${key}"]`);
        const option = select.locator("option").filter({hasText: binding.fieldPath});
        await expect(option).toHaveCount(1);
        await select.selectOption((await option.getAttribute("value"))!);
      }
      await form.locator('input[name^="source."][name$=".date"]').fill("2026-12-31");
      await form.locator('input[name^="source."][name$=".currency"]').fill("BRL");
      await form.locator('input[name^="source."][name$=".locator"]').fill("Financials, synthetic reconciled input");
      await form.locator('textarea[name^="source."][name$=".rationale"]').fill("All selected synthetic facts are stated in BRL base units.");
      const premises = {volumeGrowth: "0", priceGrowth: "0", mixEffect: "0", fxEffect: "0", inorganicRevenue: "0", costRatio, existingDepreciation: "0", dso: "0", dio: "0", dpo: "0",
        otherCurrentAssetsRatio: "0", otherCurrentLiabilitiesRatio: "0", cashTaxRate: "0", distributions: "0", minimumCash: "0"};
      for (const [key, value] of Object.entries(premises)) {
        await form.locator(`[name="premise.${key}.2027"]`).fill(value);
        await form.locator(`[name="premise.${key}.rationale"]`).fill("Explicit synthetic annual scenario.");
      }
      await form.getByRole("combobox", {name: messages.InstitutionalSetup.capex, exact: true}).selectOption("none");
      await form.locator('[name="noCapexRationale"]').fill("Explicit synthetic scenario assumes no capex.");
      await form.getByRole("combobox", {name: messages.InstitutionalSetup.debt, exact: true}).selectOption("present");
      await form.locator('[name="debt.0.openingPrincipal"]').fill("100");
      for (const [key, value] of Object.entries({indexer: "fixed", indexationTreatment: "not_applicable", couponTreatment: "cash_paid", couponBase: "opening_principal"})) {
        await form.locator(`[name="debt.0.${key}"]`).selectOption(value);
      }
      for (const key of ["indexationRate", "couponRate", "drawdown", "scheduledPrincipal", "prepayment"]) await form.locator(`[name="debt.0.2027.${key}"]`).fill("0");
      for (const rate of ["indexation", "coupon"]) {
        await form.locator(`select[name="debt.0.2027.${rate}Source"]`).selectOption({label: "Synthetic reconciled accounts.xlsx"});
        await form.locator(`[name="debt.0.2027.${rate}Rationale"]`).fill("Explicit synthetic zero rate.");
      }
      await form.locator('button[type="submit"]').click();
      const reviewLink = page.locator('.advisor-work-surface__navigation a[href="#work-institutional-setup-review"]');
      await expect(reviewLink).toBeVisible({timeout: 120_000});
      await reviewLink.click();
      await expect(page.getByTestId("institutional-setup-review").getByRole("button", {name: approveAndCalculate, exact: true})).toBeEnabled({timeout: 120_000});
    },
    /** Approves the configuration under review, which calculates. */
    async approve() {
      await page.getByTestId("institutional-setup-review").getByRole("button", {name: approveAndCalculate, exact: true}).click();
    },
  };
}

const openUpdate = (workId: string) => `from public.work_continuation_requests r where r.work_id='${workId}' and r.kind='dependency_update'
  and r.status in ('open','awaiting_authorization','scheduled','ready')`;

test("a mixed update of an execution and the financial model is adopted in one act, and only then the recalculated model is current", async ({page}) => {
  test.setTimeout(900_000);
  const sql = localSql(databaseUrl);
  const id = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const email = `e2e-continuation-${id}@example.com`;
  await signUp(page, email, `Offroad-E2E-${id}!`);
  await useLegacyCompanyFixture(page, email);
  const projectId = await privateWork(page, sql, id, email);
  const released = enableReleasedCapitalMethod({databaseUrl, email, projectId});
  restore.push(released.restore);

  // 1. The root execution over version 1 of a balancete, computed by the worker.
  const seeded = seedSourceBasis(sql, {email, projectId});
  await page.goto(`/pt-BR/app/projects/${projectId}/executions`);
  const form = page.locator("form").filter({has: page.getByRole("button", {name: executions.request.submit, exact: true})});
  await form.locator('select[name="versionId"]').selectOption({label: executions.request.revision.replace("{number}", String(seeded.revision))});
  await form.locator('input[name="asOf"]').fill("2026-06-30");
  await form.locator('input[name="question"]').fill("Does the current capital structure carry the 2026 plan?");
  await form.locator('textarea[name="objectives"]').fill("Measure liquidity over the horizon\nName every input the basis lacks");
  await form.getByRole("checkbox", {name: executions.situations.refinancing, exact: true}).check();
  await form.getByRole("button", {name: executions.request.submit, exact: true}).click();
  await expect(page).toHaveURL(new RegExp(`/pt-BR/app/projects/${projectId}/executions/[0-9a-f-]{36}$`), {timeout: 60_000});
  const rootId = new URL(page.url()).pathname.split("/").at(-1)!;
  await expect.poll(() => sql(`select status from public.processing_jobs where execution_id='${rootId}' and kind='work_execution';`),
    {message: "the local worker computes the root execution", timeout: 180_000, intervals: [2_000]}).toBe("succeeded");

  // 2. The first calculation of the financial model: the person approves a configuration over the
  // reconciled facts, and the worker calculates it.
  seedInstitutionalFacts(sql, {email, projectId, facts: institutionalInputFixture().facts});
  const setup = await institutionalSetup(page, email, projectId);
  await setup.submitScenario("50");
  await setup.approve();
  const firstResult = `from private.institutional_model_results x where x.capital_project_id='${projectId}' and x.recompute_candidate_id is null`;
  await expect.poll(() => sql(`select string_agg(x.status,',') ${firstResult};`),
    {message: "the local worker calculates the first result", timeout: 180_000, intervals: [2_000]}).toBe("completed");
  const r0 = sql(`select x.id ${firstResult};`);

  // 3. Version 2 of the balancete: an update opens for the execution and waits for a working basis
  // that uses it.
  const version2 = addSourceVersion(sql, {email, projectId, seeded});
  await expect.poll(() => sql(`select r.status||':'||coalesce((select string_agg(h.hold_kind,',') from private.dependency_recompute_holds h where h.request_id=r.id and h.released_at is null),'') ${openUpdate(projectId)};`),
    {message: "the worker's outbox opens the update and holds it", timeout: 120_000, intervals: [2_000]}).toBe("open:basis_behind_source");
  const updateId = sql(`select r.id ${openUpdate(projectId)};`);

  // 4. A newer configuration of the model approved while the update is open joins it: the graph
  // recalculates the model in the same update, and the worker produces the result. The first result
  // stays the current one, with no download of the recalculation, and the panel says the recalculated
  // result waits in the update, which still waits for a working basis before the person's decision.
  await setup.submitScenario("40");
  await setup.approve();
  const recalculation = `from public.institutional_recompute_candidates c where c.request_id='${updateId}'`;
  await expect.poll(() => sql(`select c.state ${recalculation};`),
    {message: "the local worker recalculates the model inside the open update", timeout: 180_000, intervals: [2_000]}).toBe("settled");
  const r1 = sql(`select c.result_id ${recalculation};`);
  expect(sql(`select status from public.work_continuation_requests where id='${updateId}';`)).toBe("open");
  await openSection(page, projectId, "work-institutional-model-result");
  const panel = page.getByTestId("institutional-model-result");
  const updateLink = panel.getByRole("link", {name: results.openUpdate, exact: true});
  await expect(panel.getByRole("status")).toHaveText(results.status.recalculationWaiting);
  await expect(updateLink).toHaveAttribute("href", `#work-updates/${updateId}`);
  await expect(page.locator(`a[href$="/financial-results/${r1}/xlsx"]`)).toHaveCount(0);

  // 5. The person reads available cash from version 2: the execution is recomputed in the same update,
  // which becomes ready with both recomputations. Later events of that one change, which the update
  // already covers, show inside it.
  readoptFromVersion(sql, {email, projectId, seeded, documentId: version2});
  await expect.poll(() => sql(`select status from public.work_continuation_requests where id='${updateId}';`),
    {message: "the local worker recomputes the execution and the update becomes ready", timeout: 300_000, intervals: [3_000]}).toBe("ready");
  // The results panel says the recalculated result is ready and waits for the person's decision, and
  // its link opens the Updates section on that update (5D).
  await openSection(page, projectId, "work-institutional-model-result");
  await expect(panel.getByRole("status")).toHaveText(results.status.recalculationReady);
  await test.info().attach("recalculation-ready-panel", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});
  await updateLink.click();
  const targeted = page.locator(`article.work-update[data-targeted="true"]`);
  await expect(targeted).toHaveAttribute("id", `work-update-${updateId}`);
  await expect(targeted).toHaveAttribute("data-status", "ready");
  await expect(targeted).toBeInViewport();
  await expect(page.locator('.advisor-work-surface__navigation a[href="#work-updates"]')).toHaveAttribute("aria-current", "true");
  await test.info().attach("recalculation-ready-update", {body: await page.screenshot(), contentType: "image/png"});
  await openSection(page, projectId, "work-updates");
  const ready = page.locator('article.work-update[data-status="ready"]');
  await expect(ready).toContainText(fill(updates.recomputation.settled, {label: capitalTitle}));
  await expect(ready).toContainText(fill(updates.recomputation.institutional.settled, {label: names.institutionalModel}));
  const [firstRevision, secondRevision] = sql(`select string_agg(c.revision::text,',' order by c.revision) from private.institutional_model_configurations c
    where c.capital_project_id='${projectId}' and c.status='approved';`).split(",");
  await expect(ready).toContainText(fill(updates.change.institutional_configuration, {from: firstRevision!, to: secondRevision!}));
  await expect(ready).toContainText(fill(updates.change.source_version, {name: "balancete-sintetico.csv", from: 1, to: 2}));
  const merged = Number(sql(`select count(*) from public.work_continuation_requests where work_id='${projectId}' and status='superseded' and superseded_by_request_id='${updateId}'
    and created_at>=(select created_at from public.work_continuation_requests where id='${updateId}');`));
  if (merged > 0) {
    await expect(ready).toContainText(merged === 1 ? "Inclui 1 mudança registrada depois" : `Inclui ${merged} mudanças registradas depois`);
    await expect(page.locator('details.work-updates__group article.work-update[data-status="superseded"]')).toHaveCount(0);
  }
  await test.info().attach("mixed-update-ready", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});

  // 6. One act adopts both: the milestone references the new execution and model results, then the
  // ones they replace; only now the recalculated model is the current result, with its downloads.
  await ready.getByRole("button", {name: updates.adopt.action, exact: true}).click();
  await ready.getByRole("button", {name: updates.adopt.confirm, exact: true}).click();
  await expect.poll(() => sql(`select status from public.work_continuation_requests where id='${updateId}';`), {timeout: 30_000}).toBe("adopted");
  const milestone = (kind: string, subject: string) => sql(`select id from public.work_milestones where kind='execution_result' and subject_kind='${kind}' and subject_id='${subject}';`);
  const recomputed = sql(`select c.execution_id from public.work_recompute_candidates c where c.request_id='${updateId}' and c.state='settled';`);
  expect(sql(`select array_to_string(m.reference_milestone_ids,',') from public.work_milestones m where m.kind='update_adopted' and m.subject_id='${updateId}';`))
    .toBe([milestone("work_execution", recomputed), milestone("institutional_model_result", r1), milestone("work_execution", rootId), milestone("institutional_model_result", r0)].join(","));
  expect(sql(`select superseded_by from private.institutional_model_results where id='${r0}';`)).toBe(r1);
  await openSection(page, projectId, "work-institutional-model-result");
  await expect(panel.getByRole("status")).toHaveText(results.status.completed);
  await expect(updateLink).toHaveCount(0);
  await expect(page.locator(`a[href$="/financial-results/${r1}/xlsx"]`)).toHaveCount(1);
  await test.info().attach("mixed-update-adopted", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});

  // 7. A follow-up typed in the conversation from the adopted update waits for an execution. From the
  // Updates section it opens the execution request with its text as the objective and its base for
  // reference; the request is validated as any other, and its objective cites the follow-up, which
  // the database links to the new execution (5D).
  await expect.poll(() => sql(`select count(*) from public.agent_messages where work_id='${projectId}' and role='user' and status in ('queued','processing');`),
    {message: "no turn of the conversation is in progress", timeout: 120_000, intervals: [2_000]}).toBe("0");
  const followupText = "Aprofundar a liquidez do plano com a versão 2 do balancete";
  await page.locator(".advisor-composer textarea").fill(followupText);
  await page.locator(".advisor-composer .advisor-composer__send").click();
  const question = page.locator(".continuation-question");
  const recorded = page.locator(".continuation-notice");
  await expect(question.or(recorded)).toBeVisible();
  // The text names no base, so the conversation asks from which approved decision it continues; any
  // of them serves this journey, and the follow-up shows the one chosen.
  if (await question.isVisible()) {
    await question.getByRole("radio").first().check();
    await question.getByRole("button", {name: continuation.question.choose, exact: true}).click();
  }
  await expect(recorded).toBeVisible();
  const followupId = sql(`select r.id from public.work_continuation_requests r where r.work_id='${projectId}' and r.kind='user_followup';`);
  expect(sql(`select status from public.work_continuation_requests where id='${followupId}';`)).toBe("open");
  await openSection(page, projectId, "work-updates");
  const followup = page.locator('article.work-update--followup[data-status="open"]').filter({hasText: followupText});
  await expect(followup).toContainText(updates.followups.execution.none);
  const baseLine = (await followup.locator("p").first().textContent())!.trim();
  expect(baseLine).toMatch(/^Continua a partir de .+, revisão \d+\.$/);
  await followup.getByRole("link", {name: updates.followups.requestExecution, exact: true}).click();
  await expect(page).toHaveURL(new RegExp(`/pt-BR/app/projects/${projectId}/executions\\?followup=${followupId}$`));
  const reference = page.locator(".execution-followup");
  await expect(reference).toContainText(executions.request.followup.title);
  await expect(reference).toContainText(followupText);
  await expect(reference).toContainText(baseLine);
  const cite = page.locator("form").filter({has: page.getByRole("button", {name: executions.request.submit, exact: true})});
  await expect(cite.locator('textarea[name="objectives"]')).toHaveValue(followupText);
  await test.info().attach("followup-request-prefilled", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});
  await cite.locator('input[name="asOf"]').fill("2026-06-30");
  await cite.locator('input[name="question"]').fill("Does the plan still hold with version 2 of the balancete?");
  await cite.getByRole("checkbox", {name: executions.situations.refinancing, exact: true}).check();
  await cite.getByRole("button", {name: executions.request.submit, exact: true}).click();
  await expect(page).toHaveURL(new RegExp(`/pt-BR/app/projects/${projectId}/executions/[0-9a-f-]{36}$`), {timeout: 60_000});
  // The request is linked to the follow-up in its own transaction; the local worker may already have
  // written the result, which makes the follow-up ready.
  const citing = new URL(page.url()).pathname.split("/").at(-1)!;
  expect(sql(`select l.execution_id||':'||(r.status in ('scheduled','ready'))::text from public.work_continuation_requests r
    join private.work_followup_executions l on l.request_id=r.id where r.id='${followupId}';`)).toBe(`${citing}:true`);
  // The follow-up no longer waits for an execution: requested, or already with its result if the
  // local worker was quicker than this page.
  await openSection(page, projectId, "work-updates");
  await expect(page.locator("article.work-update--followup").filter({hasText: followupText})).toHaveAttribute("data-status", /^(scheduled|ready)$/);
});

test("a recalculation of the financial model declined before the worker runs it writes nothing", async ({page}) => {
  test.setTimeout(600_000);
  const worker = localWorker();
  test.skip(worker === null, "needs the local worker the E2E job starts");
  const sql = localSql(databaseUrl);
  const id = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const email = `e2e-continuation-${id}@example.com`;
  await signUp(page, email, `Offroad-E2E-${id}!`);
  await useLegacyCompanyFixture(page, email);
  const projectId = await privateWork(page, sql, id, email);
  seedInstitutionalFacts(sql, {email, projectId, facts: institutionalInputFixture().facts});
  const setup = await institutionalSetup(page, email, projectId);
  await setup.submitScenario("50");
  await setup.approve();
  await expect.poll(() => sql(`select string_agg(status,',') from private.institutional_model_results where capital_project_id='${projectId}';`),
    {message: "the local worker calculates the first result", timeout: 180_000, intervals: [2_000]}).toBe("completed");
  await setup.submitScenario("40");

  // The worker is paused before the approval, so the recalculation the graph schedules waits in the queue.
  worker!.pause();
  restore.push(worker!.resume);
  await setup.approve();
  const candidate = `from public.institutional_recompute_candidates c where c.work_id='${projectId}'`;
  await expect.poll(() => sql(`select c.state ${candidate};`), {message: "the approval schedules the recalculation through the graph", timeout: 60_000}).toBe("scheduled");
  const r1 = sql(`select c.result_id ${candidate};`);
  const job = sql(`select j.id from public.processing_jobs j where j.payload->>'message_id'='${r1}';`);
  expect(sql(`select status from public.processing_jobs where id='${job}';`)).toBe("queued");

  await openSection(page, projectId, "work-updates");
  const scheduled = page.locator('article.work-update[data-status="scheduled"]');
  const entry = scheduled.locator('li.work-update__recomputation[data-kind="institutional"]');
  await expect(entry).toContainText(fill(updates.recomputation.institutional.scheduled, {label: names.institutionalModel}));
  await entry.getByRole("button", {name: updates.recomputation.declineOne, exact: true}).click();
  await entry.locator("select").selectOption("not_needed");
  await entry.getByRole("button", {name: updates.decline.confirm, exact: true}).click();
  await expect.poll(() => sql(`select c.state||':'||c.reason ${candidate};`), {timeout: 30_000}).toBe("declined:person_declined:not_needed");
  expect(sql(`select status||':'||(last_error->>'reason') from public.processing_jobs where id='${job}';`)).toBe("cancelled:person_declined");
  // Its only recalculation declined, the update itself is declined and moves to the earlier updates.
  expect(sql(`select r.status from public.work_continuation_requests r join public.institutional_recompute_candidates c on c.request_id=r.id where c.work_id='${projectId}';`)).toBe("declined");
  await openSection(page, projectId, "work-updates");
  const earlier = page.locator("details.work-updates__group");
  await earlier.locator("summary").click();
  const declined = earlier.locator('article.work-update[data-status="declined"]');
  await expect(declined).toContainText(updates.status.declined);
  await expect(declined).toContainText(fill(updates.recomputation.institutional.declined, {label: names.institutionalModel}));
  await test.info().attach("recalculation-declined", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});

  // The worker resumes: the cancelled job is not run and no result is written after the decline.
  worker!.resume();
  restore = restore.filter((undo) => undo !== worker!.resume);
  await page.waitForTimeout(12_000);
  expect(sql(`select status from private.institutional_model_results where id='${r1}';`)).toBe("queued");
  expect(sql(`select status from public.processing_jobs where id='${job}';`)).toBe("cancelled");
  expect(sql(`select count(*) from private.institutional_model_results where capital_project_id='${projectId}' and status='completed';`)).toBe("1");
});
