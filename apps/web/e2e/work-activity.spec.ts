import {randomBytes, randomUUID} from "node:crypto";
import {expect, test, type Page} from "@playwright/test";
import messages from "../messages/pt-BR.json";
import {waitForOneTimeCode} from "./support/mail";
import {localSql, type WorkContinuationSql} from "./support/work-continuation";

/**
 * Stage 18, increment 5B: the work surface shows activity only from persisted facts. The page
 * refreshes while a job of the work runs and never after it ends; a wait for a person is shown as
 * such and is not polled. No model takes part: the first turn's job is held out of the local
 * worker's reach (queued, available only in an hour) and then settled by the journey, and the wait
 * is a synthetic milestone recorded as the work's waits are recorded.
 */
const advisor = messages.App.advisorProject;
const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
/** More than three refresh intervals of 2.5 s. */
const quietWindow = 9_000;

async function signUp(page: Page, email: string, password: string) {
  await page.goto("/pt-BR/signup");
  await page.locator('input[name="full_name"]').fill("QA atividade do trabalho");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirm_password"]').fill(password);
  await page.locator("form.auth-form--registration button[type=submit]").click();
  await expect(page).toHaveURL(/\/pt-BR\/signup\/verify/);
  await page.locator('input[name="token"]').fill(await waitForOneTimeCode(email));
  await page.locator("form.auth-form--verification button[type=submit]").click();
  await expect(page).toHaveURL(/\/pt-BR\/app(?:\?|$)/);
}

/** A work without an intake session, started from the composer as a person starts one. */
async function startWork(page: Page, id: string): Promise<string> {
  await page.locator(".advisor-composer--start textarea").fill(`Quais alternativas existem para alongar a dívida? ${id}`);
  await page.locator(".advisor-composer--start textarea").press("Enter");
  await expect(page).toHaveURL(/\/app\/projects\/[0-9a-f-]{36}/);
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

/** Router refreshes of one page: RSC requests for the page's own path, not prefetches. */
function refreshCounter(page: Page, path: string): () => number {
  let count = 0;
  page.on("request", (request) => {
    const headers = request.headers();
    if (request.method() === "GET" && headers.rsc === "1" && !headers["next-router-prefetch"] && new URL(request.url()).pathname === path) count += 1;
  });
  return () => count;
}

/** Acts inside one transaction as the work's creator, as the journeys of stage 18 do. */
function asCreator(sql: WorkContinuationSql, workId: string, body: string) {
  return sql(`begin;
    select set_config('request.jwt.claim.sub',(select created_by::text from public.capital_projects where id='${workId}'),true);
    ${body}
    commit;`);
}

const syntheticReply = (workId: string, text: string) => `
  insert into public.agent_messages(id,organization_id,work_id,conversation_id,role,status,content,locale,reply_to_message_id,metadata,created_by)
  select gen_random_uuid(),organization_id,work_id,conversation_id,'assistant','completed','${text}','pt-BR',id,'{"synthetic":true}',created_by
  from public.agent_messages where work_id='${workId}' and role='user';`;

test("a finished work stops refreshing: the page refreshes while its job runs and never after the job ends", async ({page}) => {
  test.setTimeout(240_000);
  const sql = localSql(databaseUrl);
  const id = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const email = `e2e-activity-${id}@example.com`;
  await signUp(page, email, `Offroad-E2E-${id}!`);
  const workId = await startWork(page, id);
  const path = `/pt-BR/app/projects/${workId}`;

  // The first turn's job is live work that no worker takes before the journey settles it.
  asCreator(sql, workId, `
    update public.processing_jobs set status='queued',available_at=now()+interval '1 hour',attempts=0,lease_expires_at=null,leased_by=null,
      leased_account_user_id=null,lease_id=null,capability_sha256=null,last_error=null
    where work_id='${workId}' and kind='work_conversation';
    update public.agent_messages set status='queued',error_code=null where work_id='${workId}' and role='user';
    update public.agent_conversations set state='idle' where work_id='${workId}';`);
  expect(sql(`select count(*) from public.processing_jobs where work_id='${workId}' and status in ('queued','leased');`)).toBe("1");

  const refreshes = refreshCounter(page, path);
  await page.reload();
  const status = page.locator(".advisor-project__header > span");
  await expect(status).toHaveText(advisor.working);
  await expect(status).toHaveClass(/is-working/);
  await expect.poll(refreshes, {message: "the page refreshes while the job is live", timeout: 20_000, intervals: [1_000]}).toBeGreaterThanOrEqual(2);
  await test.info().attach("work-activity-running", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});

  // The turn is answered: the job ends and the reply is recorded. One refresh brings both.
  const reply = `Resposta sintética da jornada de atividade ${id}`;
  asCreator(sql, workId, `
    update public.processing_jobs set status='succeeded' where work_id='${workId}' and kind='work_conversation';
    update public.agent_messages set status='completed',error_code=null where work_id='${workId}' and role='user';
    ${syntheticReply(workId, reply)}
    update public.agent_conversations set state='idle' where work_id='${workId}';`);
  await expect(page.locator(".advisor-thread")).toContainText(reply, {timeout: 20_000});
  await expect(status).toHaveText(advisor.ready);
  await expect(status).not.toHaveClass(/is-working/);

  // Nothing refreshes after the work finished.
  await page.waitForTimeout(1_500);
  const settled = refreshes();
  await page.waitForTimeout(quietWindow);
  expect(refreshes(), "no refresh after the job ended").toBe(settled);
  await expect(page.locator(".advisor-composer textarea")).toBeEnabled();
  await test.info().attach("work-activity-finished", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});
});

test("a wait for a person is shown as waiting, not as processing, and the page does not refresh for it", async ({page}) => {
  test.setTimeout(240_000);
  const sql = localSql(databaseUrl);
  const id = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const email = `e2e-activity-wait-${id}@example.com`;
  await signUp(page, email, `Offroad-E2E-${id}!`);
  const workId = await startWork(page, id);
  const path = `/pt-BR/app/projects/${workId}`;

  // The first turn is withdrawn and answered, as the persistent work journey does: nothing runs.
  asCreator(sql, workId, `
    update public.processing_jobs set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null where work_id='${workId}' and status in ('queued','leased');
    update public.agent_messages set status='completed',error_code=null where work_id='${workId}' and role='user';
    ${syntheticReply(workId, "Synthetic persisted transport response")}
    update public.agent_conversations set state='idle' where work_id='${workId}';`);
  // An open wait of the work: an awaiting_human milestone, without job and without lease.
  const wait = randomUUID();
  asCreator(sql, workId, `
    insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,occurred_at)
    select '${wait}',p.organization_id,p.id,'awaiting_human','synthetic_review',gen_random_uuid(),'synthetic_person_review',now()
    from public.capital_projects p where p.id='${workId}';`);
  expect(sql(`select count(*) from public.processing_jobs where work_id='${workId}' and status in ('queued','leased','awaiting_approval');`)).toBe("0");

  const refreshes = refreshCounter(page, path);
  await page.reload();
  const status = page.locator(".advisor-project__header > span");
  await expect(status).toHaveText(advisor.waitingForPerson);
  await expect(status).toHaveClass(/is-waiting/);
  await expect(status).not.toHaveClass(/is-working/);
  await expect(page.locator(".advisor-composer textarea")).toBeEnabled();
  const before = refreshes();
  await page.waitForTimeout(quietWindow);
  expect(refreshes(), "a wait for a person is not polled").toBe(before);
  await test.info().attach("work-activity-waiting", {body: await page.screenshot({fullPage: true}), contentType: "image/png"});

  // The person resolves the wait: the resolution closes it, and the work is ready again.
  asCreator(sql, workId, `
    insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,resolves_milestone_id,created_by,occurred_at)
    select p.organization_id,p.id,'human_resolved','synthetic_review',gen_random_uuid(),'synthetic_person_review','${wait}',p.created_by,now()
    from public.capital_projects p where p.id='${workId}';`);
  await page.reload();
  await expect(status).toHaveText(advisor.ready);
  await expect(status).not.toHaveClass(/is-waiting/);
});
