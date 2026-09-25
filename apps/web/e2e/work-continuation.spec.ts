import {randomBytes, randomUUID} from "node:crypto";
import {expect, test, type Page} from "@playwright/test";
import messages from "../messages/pt-BR.json";
import {useLegacyCompanyFixture} from "./support/legacy-workspace";
import {waitForOneTimeCode} from "./support/mail";
import {enableReleasedCapitalMethod} from "./support/released-capital-method";
import {addSourceVersion, localSql, readoptFromVersion, seedSourceBasis} from "./support/work-continuation";

const continuation = messages.App.advisorProject.continuation;
const updates = messages.App.workUpdates;
const executions = messages.App.workExecutions;
const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const fill = (text: string, values: Record<string, string | number>) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, String(value)), text);
/** Set while the adoption journey holds the capability released; the hook puts it back even after a timeout. */
let restoreRelease: (() => void) | undefined;
test.afterEach(() => {
  const restore = restoreRelease;
  restoreRelease = undefined;
  restore?.();
});

async function signUp(page: Page, email: string, password: string) {
  await page.goto("/pt-BR/signup");
  await page.locator('input[name="full_name"]').fill("QA continuidade do trabalho");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirm_password"]').fill(password);
  await page.locator("form.auth-form--registration button[type=submit]").click();
  await expect(page).toHaveURL(/\/pt-BR\/signup\/verify/);
  await page.locator('input[name="token"]').fill(await waitForOneTimeCode(email));
  await page.locator("form.auth-form--verification button[type=submit]").click();
}

test("a work without an intake session continues from an explicit approved base, and asks when the text names none", async ({page}) => {
  test.setTimeout(240_000);
  const sql = localSql(databaseUrl);
  const id = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const email = `e2e-continuation-${id}@example.com`;
  await signUp(page, email, `Offroad-E2E-${id}!`);
  await expect(page).toHaveURL(/\/pt-BR\/app(?:\?|$)/);
  await page.locator(".advisor-composer--start textarea").fill(`Quais alternativas existem para alongar a dívida? ${id}`);
  await page.locator(".advisor-composer--start textarea").press("Enter");
  await expect(page).toHaveURL(/\/app\/projects\/[0-9a-f-]{36}/);
  const workId = new URL(page.url()).pathname.split("/").at(-1)!;
  // No model takes part in this journey: the first turn's job is withdrawn and the turn closed, as
  // the persistent work journey does. Then an approval the person made in this work, recorded as the
  // approvals of a work are recorded (a synthetic decision milestone, labelled by its own text).
  sql(`begin;
    select set_config('request.jwt.claim.sub',(select created_by::text from public.capital_projects where id='${workId}'),true);
    update public.processing_jobs set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null where work_id='${workId}' and status in ('queued','leased');
    update public.agent_messages set status='completed',error_code=null where work_id='${workId}' and role='user';
    update public.agent_conversations set state='idle' where work_id='${workId}';
    commit;`);
  const base = randomUUID();
  sql(`begin;
    select set_config('request.jwt.claim.sub',(select created_by::text from public.capital_projects where id='${workId}'),true);
    insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,version_fingerprint,created_by,occurred_at)
    select '${base}',p.organization_id,p.id,'decision','capital_project_artifact',gen_random_uuid(),'Alongamento com os bancos atuais',2,
      encode(extensions.digest('synthetic approval of the continuation journey '||p.id::text,'sha256'),'hex'),p.created_by,now()
    from public.capital_projects p where p.id='${workId}';
    commit;`);
  expect(sql(`select count(*) from public.document_intake_sessions where capital_project_id='${workId}';`)).toBe("0");
  await page.reload();
  const turns = () => sql(`select count(*) from public.agent_messages where work_id='${workId}';`);
  const turnsBefore = turns();

  // 1. A continuation that names no approved base becomes a question with the bases; nothing is recorded.
  const composer = page.locator(".advisor-composer textarea");
  const send = page.locator(".advisor-composer .advisor-composer__send");
  await composer.fill("Aprofundar o cenário de refinanciamento");
  await send.click();
  const question = page.locator(".continuation-question");
  await expect(question).toBeVisible();
  await expect(question.getByRole("heading", {name: continuation.question.title, exact: true})).toBeVisible();
  await expect(question).toContainText(continuation.question.no_approved_base);
  const option = fill(continuation.question.option, {label: "Alongamento com os bancos atuais", revision: 2});
  await expect(question.getByRole("radio", {name: option, exact: true})).toBeChecked();
  await expect(composer).toHaveValue("Aprofundar o cenário de refinanciamento");
  expect(sql(`select count(*) from public.work_continuation_requests where work_id='${workId}';`)).toBe("0");
  expect(turns()).toBe(turnsBefore);
  await test.info().attach("continuation-question", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});

  // 2. The person chooses the base: the continuation is recorded from it, and the reply names it.
  await question.getByRole("button", {name: continuation.question.choose, exact: true}).click();
  const recorded = fill(continuation.recorded, {label: "Alongamento com os bancos atuais", revision: 2});
  await expect(page.locator(".continuation-notice")).toContainText(recorded);
  await expect(question).toHaveCount(0);
  const note = fill(continuation.note, {label: "Alongamento com os bancos atuais", revision: 2});
  const firstTurn = page.locator(".advisor-thread__message.is-user").filter({hasText: "Aprofundar o cenário de refinanciamento"});
  await expect(firstTurn.locator(".advisor-thread__continuation")).toHaveText(note);

  // 3. A continuation that names the approved base is recorded from it directly.
  await composer.fill("Aprofundar o alongamento aprovado");
  await send.click();
  await expect(page.locator(".continuation-notice")).toContainText(recorded);
  await expect(page.locator(".advisor-thread__message.is-user").filter({hasText: "Aprofundar o alongamento aprovado"}).locator(".advisor-thread__continuation")).toHaveText(note);
  await test.info().attach("continuation-thread", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});

  // The database agrees: two follow-ups from the base, each with its proposal referencing the base,
  // both turns in the work's own conversation, still no intake session and nothing queued.
  expect(sql(`select string_agg(r.status||':'||(r.payload#>>'{objective,baseMilestoneId}')||':'||(r.payload#>>'{objective,baseRevision}')||':'||
      (select (m.reference_milestone_ids=array[r.payload#>>'{objective,baseMilestoneId}']::uuid[])::text from public.work_milestones m where m.kind='continuation_proposed' and m.subject_id=r.id)||':'||
      (select coalesce(g.intake_session_id::text,'none') from public.agent_messages g where g.id=r.id),',' order by r.created_at)
    from public.work_continuation_requests r where r.work_id='${workId}' and r.kind='user_followup';`))
    .toBe(`open:${base}:2:true:none,open:${base}:2:true:none`);
  expect(sql(`select count(*) from public.document_intake_sessions where capital_project_id='${workId}';`)).toBe("0");
  expect(sql(`select count(*) from public.processing_jobs where work_id='${workId}' and status in ('queued','leased');`)).toBe("0");
});

test("a new version of a source is recomputed by the local worker, and the person adopts the update", async ({page}) => {
  test.setTimeout(600_000);
  const sql = localSql(databaseUrl);
  const id = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const email = `e2e-continuation-${id}@example.com`;

  // 1. A fresh workspace and a private work with its intake session, as the execution journey creates them.
  await signUp(page, email, `Offroad-E2E-${id}!`);
  await useLegacyCompanyFixture(page, email);
  await expect(page).toHaveURL(/\/pt-BR\/onboarding/);
  await page.goto("/pt-BR/onboarding?setup=terms&job=capital_planning");
  await page.locator('input[name="signatory_title"]').fill("Analista");
  await page.locator('input[name="terms_agreed"]').check();
  await page.locator('input[name="information_rights_declared"]').check();
  await page.locator('.private-project-gate__form button[type="submit"]').click();
  await expect(page.locator(".private-project-gate--project")).toBeVisible();
  await page.locator('input[name="project_name"]').fill(`Continuidade sintética ${id}`);
  await page.locator('.private-project-gate__form button[type="submit"]').click();
  await expect(page.locator(".intake-collect")).toBeVisible();
  const projectId = sql(`select p.id from public.capital_projects p join auth.users u on u.id=p.created_by where u.email='${email}' order by p.created_at desc limit 1;`);
  expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
  const released = enableReleasedCapitalMethod({databaseUrl, email, projectId});
  restoreRelease = released.restore;

  // 2. Version 1 of a balancete, the value of available cash read from it and adopted in the working
  // basis; then the root execution, requested by the person over that basis and computed by the worker.
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
  expect(sql(`select count(*) from private.execution_dependencies where execution_id='${rootId}' and dependency_kind='source_version' and source_version_id='${seeded.documentId}';`)).toBe("1");

  // 3. Version 2 of the same balancete: the update opens and waits for a working basis that uses it.
  const version2 = addSourceVersion(sql, {email, projectId, seeded});
  const latest = `from public.work_continuation_requests r where r.work_id='${projectId}' and r.kind='dependency_update' order by r.created_at desc limit 1`;
  await expect.poll(() => sql(`select r.status||':'||coalesce((select string_agg(h.hold_kind,',') from private.dependency_recompute_holds h where h.request_id=r.id and h.released_at is null),'') ${latest};`),
    {message: "the worker's outbox opens the update and holds it", timeout: 120_000, intervals: [2_000]}).toBe("open:basis_behind_source");
  await page.goto(`/pt-BR/app/projects/${projectId}#work-updates`);
  const waiting = page.locator("article.work-update").first();
  await expect(waiting).toContainText(updates.status.open);
  await expect(waiting).toContainText("aguardando uma revisão da base de trabalho que use a versão nova");
  await expect(waiting.getByRole("button", {name: updates.adopt.action, exact: true})).toHaveCount(0);

  // 4. The person reads available cash from version 2 and adopts it: the worker recomputes the root
  // execution over the new inputs, and the update becomes ready.
  readoptFromVersion(sql, {email, projectId, seeded, documentId: version2});
  // The new revision of the basis arrives as several events. The first one planned schedules the
  // recomputation in the open update; a later one opens an update with nothing of its own to plan,
  // which 3B supersedes pointing at the update that already covers it. The update to adopt is the
  // one whose candidate recomputes the root execution.
  const recomputing = `from public.work_continuation_requests r join public.work_recompute_candidates c on c.organization_id=r.organization_id and c.request_id=r.id
    where r.work_id='${projectId}' and c.base_execution_id='${rootId}' order by c.created_at desc limit 1`;
  await expect.poll(() => sql(`select r.status ${recomputing};`),
    {message: "the local worker recomputes the affected execution and the update becomes ready", timeout: 300_000, intervals: [3_000]}).toBe("ready");
  const updateId = sql(`select r.id ${recomputing};`);
  expect(sql(`select count(*) from public.work_continuation_requests where work_id='${projectId}' and kind='dependency_update' and id<>'${updateId}'
    and (status<>'superseded' or superseded_by_request_id is distinct from '${updateId}');`)).toBe("0");
  const recomputed = sql(`select c.execution_id from public.work_recompute_candidates c where c.request_id='${updateId}' and c.state='settled';`);
  expect(sql(`select root_execution_id from private.execution_lineage where execution_id='${recomputed}';`)).toBe(rootId);
  await page.reload();
  const ready = page.locator('article.work-update[data-status="ready"]');
  await expect(ready).toContainText(fill(updates.change.source_version, {name: "balancete-sintetico.csv", from: 1, to: 2}));
  await expect(ready).toContainText("refeita a partir da execução original, com os insumos atuais");
  await expect(ready).toContainText(updates.adopt.explanation);
  await test.info().attach("work-update-ready", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});

  // 5. Adoption behind a confirmation. The earlier result and every decision stay as they were.
  const history = () => sql(`select coalesce(string_agg(id::text||':'||xmin::text,',' order by id),'') from public.work_milestones where work_id='${projectId}' and kind in ('execution_result','decision');`);
  const before = history();
  await ready.getByRole("button", {name: updates.adopt.action, exact: true}).click();
  await ready.getByRole("button", {name: updates.adopt.confirm, exact: true}).click();
  await expect.poll(() => sql(`select status from public.work_continuation_requests where id='${updateId}';`), {timeout: 30_000}).toBe("adopted");
  const results = (execution: string) => sql(`select id from public.work_milestones where kind='execution_result' and subject_id='${execution}';`);
  expect(sql(`select m.outcome||'|'||m.label||'|'||array_to_string(m.reference_milestone_ids,',') from public.work_milestones m where m.kind='update_adopted' and m.subject_id='${updateId}';`))
    .toBe(`approved|dependency_update_adopted|${results(recomputed)},${results(rootId)}`);
  expect(history()).toBe(before);
  await page.reload();
  const closed = page.locator("details.work-updates__group");
  await closed.locator("summary").click();
  await expect(closed.locator('article.work-update[data-status="adopted"]')).toContainText(updates.status.adopted);
  await test.info().attach("work-update-adopted", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});
});
