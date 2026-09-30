import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {expect, type Page} from "@playwright/test";
import {waitForOneTimeCode} from "./mail";

export type ReviewRegimeFixture = {workId: string; actorId: string; organizationId: string};
export type RegimeSql = (query: string) => string;
const literal = (value: string) => `convert_from(decode('${Buffer.from(value, "utf8").toString("hex")}','hex'),'UTF8')`;

/** All setup and failure injection are confined to the disposable local E2E stack. */
export function localReviewRegimeSql(): RegimeSql {
  const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  for (const url of [databaseUrl, process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000", process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.E2E_MAIL_URL ?? "http://127.0.0.1:54324"]) {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) throw new Error("Content review E2E requires local synthetic services.");
  }
  return query => execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1"], {input: query, encoding: "utf8", env: {...process.env, PGAPPNAME: "offroad synthetic content review E2E"}}).trim();
}

export async function signUpRegimeAccount(page: Page, email: string, password: string) {
  await page.goto("/pt-BR/signup");
  await page.locator('input[name="full_name"]').fill("QA revisão de conteúdo");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirm_password"]').fill(password);
  await page.locator("form.auth-form--registration button[type=submit]").click();
  await expect(page).toHaveURL(/\/signup\/verify/);
  await page.locator('input[name="token"]').fill(await waitForOneTimeCode(email));
  await page.locator("form.auth-form--verification button[type=submit]").click();
  await expect(page).toHaveURL(/\/pt-BR\/app(?:\?|$)/);
}

/** Product creation command with enqueue=false: this journey invokes no model or worker. */
export function createRegimeWork(sql: RegimeSql, email: string, suffix: string): ReviewRegimeFixture {
  const raw = sql(`begin;
    do $$ declare actor uuid; org uuid; result jsonb; begin
      select id into strict actor from auth.users where email=${literal(email)} and email like 'e2e-regime-%@example.com';
      select organization_id into strict org from public.organization_memberships where user_id=actor and status='active' order by created_at limit 1;
      update public.organizations set organization_type='institutional',workspace_kind='institutional' where id=org;
      perform set_config('request.jwt.claim.sub',actor::text,true);
      perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
      perform set_config('request.headers',jsonb_build_object('x-offroad-workspace',org)::text,true);
      result:=public.start_work_v1('${randomUUID()}','pt-BR',${literal(`Synthetic content review ${suffix}`)},'Synthetic content review policy; no financial data','company_debt_view','public_information',null,null,false);
      perform set_config('e2e.regime.result',jsonb_build_object('workId',result->>'workId','actorId',actor,'organizationId',org)::text,true);
    end $$;
    select current_setting('e2e.regime.result');commit;`);
  const fixture = JSON.parse(raw) as ReviewRegimeFixture;
  for (const value of Object.values(fixture)) if (!/^[0-9a-f-]{36}$/.test(value)) throw new Error("Synthetic regime identity missing.");
  return fixture;
}

export function asRegimeOwner(f: ReviewRegimeFixture, body: string): string {
  return `begin;set local role authenticated;
    select set_config('request.jwt.claim.sub','${f.actorId}',true);
    select set_config('request.jwt.claims','{"sub":"${f.actorId}","role":"authenticated"}',true);
    select set_config('request.headers','{"x-offroad-workspace":"${f.organizationId}"}',true);
    ${body} commit;`;
}

export function addReadOnlyMember(sql: RegimeSql, f: ReviewRegimeFixture, email: string): string {
  const member = sql(`select id from auth.users where email=${literal(email)} and email like 'e2e-regime-%@example.com';`);
  if (!/^[0-9a-f-]{36}$/.test(member)) throw new Error("Synthetic read-only member missing.");
  sql(`insert into public.organization_memberships(organization_id,user_id,role,status) values('${f.organizationId}','${member}','member','active');`);
  sql(asRegimeOwner(f, `select public.set_resource_policy_grant_v1('${f.workId}','${member}',null,'read','allow');`));
  return member;
}

/** A synthetic informational answer proves the selected UI regime reaches an exact human act. */
export function approveSyntheticAnswer(sql: RegimeSql, f: ReviewRegimeFixture): string {
  const raw = sql(`begin;
    do $$ declare r jsonb; a jsonb; begin
      perform set_config('request.jwt.claim.sub','${f.actorId}',true);
      perform set_config('request.jwt.claims','{"sub":"${f.actorId}","role":"authenticated"}',true);
      perform set_config('request.headers','{"x-offroad-workspace":"${f.organizationId}"}',true);
      set local role authenticated;
      r:=public.create_artifact_revision_v1('${f.workId}','answer','synthetic-regime-answer','internal',
        jsonb_build_object('schemaVersion','artifact-manifest.2026.09.26-v1','kind','answer','audience','internal','format','json','bytes',null,
          'method',null,'execution',null,'inputSnapshot',null,'institutionalResult',null,'sources','[]'::jsonb,'claims','[]'::jsonb,'traces','[]'::jsonb,'template',null,
          'provenance',jsonb_build_object('producer','synthetic-e2e-regime','jobId',null,'taskRunId',null,'messageId',null,'capability',null),'legacy',null),
        '[{"blockKey":"synthetic","kind":"paragraph","content":{"text":"Synthetic explanation for content review."},"claims":[]}]','[]',null,null);
      a:=public.review_artifact_revision_v1((r->>'revision_id')::uuid,r->>'manifest_fingerprint','approve',null,null,true,'${randomUUID()}');
      reset role;perform set_config('e2e.regime.review',a->>'reviewId',true);
    end $$;
    select current_setting('e2e.regime.review');commit;`);
  if (!/^[0-9a-f-]{36}$/.test(raw)) throw new Error("Exact synthetic content review did not record an act.");
  return raw;
}
