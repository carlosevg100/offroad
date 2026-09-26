import {execFileSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {expect, test} from "@playwright/test";
import messages from "../messages/pt-BR.json";
import {useLegacyCompanyFixture} from "./support/legacy-workspace";
import {waitForOneTimeCode} from "./support/mail";
import {enableReleasedCapitalMethod, releasedCapitalMethod} from "./support/released-capital-method";

const basisCopy = messages.App.adoptionBasis;
const copy = messages.App.workExecutions;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const whole = (text: string) => new RegExp(`^${escapeRegExp(text)}$`);
/** Set while this journey holds the capability released; the hook puts it back even after a timeout. */
let restoreRelease: (() => void) | undefined;
test.afterEach(() => {
 const restore = restoreRelease;
 restoreRelease = undefined;
 restore?.();
});

test("a v4 capital execution is refused until the company under analysis is registered, then the local worker computes it", async ({page}) => {
 test.setTimeout(420_000);
 const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
 for (const value of [databaseUrl, process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"])
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)) throw new Error("The execution journey requires local synthetic services.");
 const sql = (query: string) => execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1"], {input: query, encoding: "utf8"}).trim();
 const id = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
 const email = `e2e-execution-${id}@example.com`, password = `Offroad-E2E-${id}!`;
 const holding = "Synthetic Holding", company = "Synthetic Operating Company";

 // 1. A fresh user, workspace and project, as the contextual adoption journey creates them.
 await page.goto("/pt-BR/signup");
 await page.locator('input[name="full_name"]').fill("QA execução de capital");
 await page.locator('input[name="email"]').fill(email);
 await page.locator('input[name="password"]').fill(password);
 await page.locator('input[name="confirm_password"]').fill(password);
 await page.locator("form.auth-form--registration button[type=submit]").click();
 await expect(page).toHaveURL(/\/pt-BR\/signup\/verify/);
 await page.locator('input[name="token"]').fill(await waitForOneTimeCode(email));
 await page.locator("form.auth-form--verification button[type=submit]").click();
 await useLegacyCompanyFixture(page, email);
 await expect(page).toHaveURL(/\/pt-BR\/onboarding/);
 await page.goto("/pt-BR/onboarding?setup=terms&job=capital_planning");
 await page.locator('input[name="signatory_title"]').fill("Analista");
 await page.locator('input[name="terms_agreed"]').check();
 await page.locator('input[name="information_rights_declared"]').check();
 await page.locator('.private-project-gate__form button[type="submit"]').click();
 await expect(page.locator(".private-project-gate--project")).toBeVisible();
 await page.locator('input[name="project_name"]').fill(`Execução sintética ${id}`);
 await page.locator('.private-project-gate__form button[type="submit"]').click();
 await expect(page.locator(".intake-collect")).toBeVisible();
 const projectId = sql(`select p.id from public.capital_projects p join auth.users u on u.id=p.created_by where u.email='${email}' order by p.created_at desc limit 1;`);
 expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
 const executionCount = () => sql(`select count(*) from public.work_executions where work_id='${projectId}';`);

 // What production holds before the founder's first request: the producer grant for the workspace
 // and the universal release of the v4 profile. It comes first because the server assembles the
 // basis, which already refuses a workspace without either, before the company gate is read.
 const released = enableReleasedCapitalMethod({databaseUrl, email, projectId});
 restoreRelease = released.restore;
 const revision = (n: number) => page.getByRole("navigation", {name: basisCopy.versions, exact: true}).getByRole("link", {name: basisCopy.version.replace("{number}", String(n)), exact: true});
 const details = (summary: string) => page.locator("details").filter({has: page.getByText(summary, {exact: true})});
 async function open(summary: string) {
  if (await details(summary).getAttribute("open") === null) await details(summary).getByText(summary, {exact: true}).click();
  return details(summary).locator("form");
 }
 async function registerEntity(name: string, value: string, role: "parent" | "subject") {
  const form = await open(basisCopy.defineEntity);
  await form.locator('[name="dossierId"]').selectOption({index: 1});
  await form.locator('[name="name"]').fill(name);
  await form.locator('[name="namespace"]').fill("BR:CNPJ");
  await form.locator('[name="value"]').fill(value);
  await form.locator('[name="relationship"]').selectOption({label: basisCopy.roles[role]});
  await form.locator('[name="perimeter"]').selectOption({label: basisCopy.perimeters.consolidated});
  await form.locator('[name="reason"]').fill("Explicit synthetic identity review");
  await form.getByRole("button", {name: basisCopy.saveEntity, exact: true}).click();
  await expect(page.locator('select[name="entityId"] option').filter({hasText: name})).toHaveCount(1);
 }
 async function defineMetric(metric: string) {
  const form = await open(basisCopy.defineMetric);
  await form.locator('[name="dossierId"]').selectOption({index: 1});
  await form.locator('[name="fieldPath"]').fill(metric);
  await form.locator('[name="definition"]').fill(`Synthetic explicit ${metric} definition`);
  await form.getByRole("button", {name: basisCopy.saveDefinition, exact: true}).click();
  await expect(page.locator('select[name="definitionVersionId"] option').filter({hasText: metric})).toHaveCount(1);
 }
 async function contribute(entity: string, metric: string, value: string, period: {start: string; end: string}, expectedRevision: number) {
  const form = page.locator("form").filter({has: page.getByRole("button", {name: basisCopy.saveHypothesis, exact: true})});
  await form.locator('[name="fieldPath"]').fill(metric);
  await form.locator('[name="value"]').fill(value);
  await form.locator('[name="entityId"]').selectOption((await form.locator('[name="entityId"] option').filter({hasText: entity}).getAttribute("value"))!);
  await form.locator('[name="definitionVersionId"]').selectOption((await form.locator('[name="definitionVersionId"] option').filter({hasText: metric}).getAttribute("value"))!);
  for (const [key, text] of Object.entries({perimeter: "consolidated", periodStart: period.start, periodEnd: period.end, currency: "BRL", unit: "currency", scale: "1", scenario: "actual", reason: "Explicit synthetic working assumption"}))
   await form.locator(`[name="${key}"]`).fill(text);
  await form.getByRole("button", {name: basisCopy.saveHypothesis, exact: true}).click();
  await expect(revision(expectedRevision)).toBeVisible();
 }
 async function requestExecution(revisionNumber: number) {
  const form = page.locator("form").filter({has: page.getByRole("button", {name: copy.request.submit, exact: true})});
  await form.locator('select[name="versionId"]').selectOption({label: copy.request.revision.replace("{number}", String(revisionNumber))});
  await form.locator('input[name="asOf"]').fill("2026-06-30");
  await form.locator('input[name="question"]').fill("Does the current capital structure carry the 2026 plan?");
  await form.locator('textarea[name="objectives"]').fill("Measure liquidity over the horizon\nName every input the basis lacks");
  await form.getByRole("checkbox", {name: copy.situations.refinancing, exact: true}).check();
  await form.getByRole("button", {name: copy.request.submit, exact: true}).click();
 }

 // 2. A basis whose contribution belongs to a holding recorded as parent: no entity is the company
 // under analysis, so the request is refused before anything is sent.
 await page.goto(`/pt-BR/app/projects/${projectId}`);
 await page.getByRole("link", {name: basisCopy.title, exact: true}).click();
 await expect(page.getByRole("heading", {name: basisCopy.title, exact: true})).toBeVisible();
 await registerEntity(holding, "11222333000181", "parent");
 await expect(page.getByText(basisCopy.noAnalyzedCompany, {exact: true})).toBeVisible();
 for (const metric of ["financials.net_debt", "liquidity.available_cash", "financials.ebitda"]) await defineMetric(metric);
 await contribute(holding, "financials.net_debt", "300", {start: "", end: "2025-12-31"}, 1);
 await page.getByRole("link", {name: basisCopy.executions, exact: true}).click();
 await expect(page.getByRole("heading", {name: copy.title, exact: true})).toBeVisible();
 await expect(page.getByText(copy.list.empty, {exact: true})).toBeVisible();
 await requestExecution(1);
 await expect(page.locator("main.work-executions").getByRole("alert")).toHaveText(copy.errors.company_unregistered);
 expect(executionCount()).toBe("0");

 // 3. The company under analysis, registered through the entity form, and the contributions of a
 // new revision in its name. The server and the packet composer both read the revision as being
 // about the entity with most contributions, so the company carries more of them than the holding.
 await page.getByRole("link", {name: copy.back, exact: true}).click();
 await expect(page.getByRole("heading", {name: basisCopy.title, exact: true})).toBeVisible();
 await registerEntity(company, "11444777000161", "subject");
 await expect(page.getByText(basisCopy.analyzedCompany.replace("{names}", company), {exact: true})).toBeVisible();
 expect(sql(`select string_agg(e.legal_name||':'||l.relationship||':'||(l.perimeter->>'basis'),',' order by e.legal_name) from public.dossier_entity_links l join public.entities e on e.id=l.entity_id join public.capital_projects p on p.organization_id=l.organization_id where p.id='${projectId}' and l.withdrawn_at is null;`))
  .toBe(`${holding}:parent:consolidated,${company}:subject:consolidated`);
 await contribute(company, "liquidity.available_cash", "1250.5", {start: "", end: "2025-12-31"}, 2);
 await contribute(company, "financials.ebitda", "400", {start: "2025-01-01", end: "2025-12-31"}, 3);

 // 4. The request goes through, the execution is listed, and the local worker computes it with the
 // released v4 executor.
 await page.getByRole("link", {name: basisCopy.executions, exact: true}).click();
 await expect(page.getByRole("heading", {name: copy.title, exact: true})).toBeVisible();
 await requestExecution(3);
 const refusal = page.locator("main.work-executions").getByRole("alert");
 await expect(refusal.or(page.getByRole("heading", {name: copy.detail.heading, exact: true})).first()).toBeVisible({timeout: 60_000});
 expect(await refusal.allTextContents()).toEqual([]);
 await expect(page).toHaveURL(new RegExp(`/pt-BR/app/projects/${projectId}/executions/[0-9a-f-]{36}$`));
 const executionId = new URL(page.url()).pathname.split("/").at(-1)!;
 await page.getByRole("navigation", {name: copy.detail.title, exact: true}).getByRole("link", {name: copy.detail.list, exact: true}).click();
 await expect(page.getByRole("heading", {name: copy.list.title, exact: true})).toBeVisible();
 const listed = page.locator(".execution-records > li");
 await expect(listed).toHaveCount(1);
 // The list names the execution by when it was requested and its state; the internal identifier
 // stays in the link and never appears in the text.
 await expect(listed).not.toContainText(executionId);
 await expect(listed.locator("code")).toHaveCount(0);
 await expect(listed.getByRole("link", {name: copy.list.open, exact: true})).toHaveAttribute("href", new RegExp(`/executions/${executionId}$`));
 await listed.getByRole("link", {name: copy.list.open, exact: true}).click();
 await expect(page).toHaveURL(new RegExp(`/executions/${executionId}$`));

 const fact = (label: string) => page.locator("dl.execution-facts > dt").filter({hasText: whole(label)}).locator("xpath=following-sibling::dd[1]");
 const state = fact(copy.detail.state);
 const terminal = [copy.states.succeeded, copy.states.partial, copy.states.failed, copy.states.withheld];
 await expect.poll(async () => {
  const shown = (await state.textContent({timeout: 10_000}))?.trim() ?? "";
  // The screen's own refresh re-reads the execution through the server.
  if (!terminal.includes(shown)) await page.getByRole("button", {name: copy.detail.refresh, exact: true}).click({timeout: 10_000}).catch(() => undefined);
  return shown;
 }, {message: "the local worker takes the execution to a terminal state", timeout: 180_000, intervals: [2_000]}).toMatch(new RegExp(`^(${terminal.map(escapeRegExp).join("|")})$`));
 await page.reload();
 await expect(state).toHaveText(copy.states.succeeded);
 await expect(fact(copy.detail.outcome)).toHaveText(copy.states.succeeded);
 await expect(fact(copy.detail.reason)).toHaveText(copy.reasons.calculated);
 await expect(fact(copy.detail.method)).toHaveText(`${releasedCapitalMethod.methodId} ${releasedCapitalMethod.methodVersion}`);
 await expect(page.getByRole("heading", {name: copy.gates.title, exact: true})).toBeVisible();
 await expect(fact(copy.gates.registration)).toHaveText(copy.gates.registrationStates.registered);
 await expect(fact(copy.gates.situations).getByRole("listitem")).toHaveText([copy.situations.refinancing]);
 await expect(fact(copy.detail.decisionStatus)).toHaveText(copy.decisionStatus.partial);
 // The method used the one contribution it reads (the company's opening cash) and named the rest as gaps.
 await expect(fact(copy.detail.contributions)).toHaveText("1");
 await expect(page.getByText(copy.gapCodes.projection_input_missing).first()).toBeVisible();
 const mdTest = page.locator("section").filter({has: page.getByRole("heading", {name: copy.mdTest.title, exact: true})});
 await expect(mdTest.locator("ol.execution-questions > li")).toHaveCount(Object.keys(copy.mdTest.questions).length);
 await test.info().attach("capital-execution-detail", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});

 // 5. The database agrees: one execution, one receipt of gates with the company registered, a
 // committed result from the local worker under the profile production registered.
 expect(executionCount()).toBe("1");
 expect(sql(`select id from public.work_executions where work_id='${projectId}';`)).toBe(executionId);
 expect(sql(`select count(*)||'|'||string_agg(g.canonical_gates::jsonb->>'companyRegistration',',')||'|'||bool_and(not g.blocked)::text from private.execution_gate_receipts g join public.work_executions e on e.organization_id=g.organization_id and e.id=g.execution_id where e.work_id='${projectId}';`))
  .toBe("1|registered|true");
 expect(sql(`select r.outcome||'|'||r.reason||'|'||(r.canonical_result::jsonb->>'status')||'|'||(r.result_fingerprint=encode(extensions.digest(convert_to(r.canonical_result,'UTF8'),'sha256'),'hex'))::text from private.execution_result_receipts r where r.execution_id='${executionId}';`))
  .toBe("succeeded|calculated|partial|true");
 expect(sql(`select j.status||'|'||j.attempts||'|'||exists(select 1 from private.worker_tokens t where t.id=j.leased_by and t.execution_account_user_id=j.leased_account_user_id and t.status='active')::text from public.processing_jobs j where j.execution_id='${executionId}' and j.kind='work_execution';`))
  .toBe("succeeded|1|true");
 expect(sql(`select p.payload_fingerprint from private.execution_control_bindings b join private.execution_method_profiles p on p.id=b.profile_id where b.execution_id='${executionId}';`))
  .toBe(released.profileSha256);
});
