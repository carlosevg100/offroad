import {execFileSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {expect, test, type Page} from "@playwright/test";
import {waitForOneTimeCode} from "./support/mail";

test("house method publication separates author review and publisher and preserves exact history", async ({page, browser}) => {
 const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
 const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
 for (const value of [databaseUrl,base,process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"]) if (!["127.0.0.1","localhost","[::1]"].includes(new URL(value).hostname)) throw new Error("Method E2E requires local synthetic services");
 const id = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
 const sql = (query: string) => execFileSync("psql",[databaseUrl,"-qAt","-v","ON_ERROR_STOP=1"],{input:query,encoding:"utf8"}).trim();
 async function signup(target: Page,suffix: string) {
  const email = `e2e-method-${suffix}-${id}@example.com`;
  await target.goto(`${base}/pt-BR/signup`);await target.locator('input[name="full_name"]').fill(`Synthetic method ${suffix}`);
  await target.locator('input[name="email"]').fill(email);await target.locator('input[name="password"]').fill(`Offroad-E2E-${id}!`);await target.locator('input[name="confirm_password"]').fill(`Offroad-E2E-${id}!`);
  await target.locator("form.auth-form--registration button[type=submit]").click();await expect(target).toHaveURL(/\/signup\/verify/);
  await target.locator('input[name="token"]').fill(await waitForOneTimeCode(email));await target.locator("form.auth-form--verification button[type=submit]").click();await expect(target).toHaveURL(/\/pt-BR\/app(?:\?|$)/);return email;
 }
 const context = await browser.newContext();const reviewer = await context.newPage();
 try {
  const emailA = await signup(page,"author");const emailB = await signup(reviewer,"reviewer");
  const authorId = sql(`select id from auth.users where email='${emailA}';`);const reviewerId = sql(`select id from auth.users where email='${emailB}';`);
  const org = sql(`select organization_id from public.organization_memberships where user_id='${authorId}' and status='active' order by created_at limit 1;`);
  expect(org).toMatch(/^[a-f0-9-]{36}$/);
  sql(`begin;update public.organizations set organization_type='institutional',workspace_kind='institutional' where id='${org}';insert into public.organization_memberships(organization_id,user_id,role,status) values('${org}','${reviewerId}','member','active');
   set local role authenticated;select set_config('request.jwt.claim.sub','${authorId}',true);select set_config('request.headers','{"x-offroad-workspace":"${org}"}',true);
   select public.set_resource_policy_grant_v1((select id from public.vault_scopes where organization_id='${org}'),'${authorId}',null,'work','allow');
   select public.set_resource_policy_grant_v1((select id from public.vault_scopes where organization_id='${org}'),'${authorId}',null,'publish','allow');
   select public.set_resource_policy_grant_v1((select id from public.vault_scopes where organization_id='${org}'),'${reviewerId}',null,'read','allow');
   select public.set_resource_policy_grant_v1((select id from public.vault_scopes where organization_id='${org}'),'${reviewerId}',null,'publish','allow');commit;`);
  const url = `${base}/pt-BR/app/settings/method?workspace=${org}`;
  await page.goto(url);await page.getByLabel("Nome da versão da casa",{exact:true}).fill(`Synthetic method ${id}`);await page.getByRole("button",{name:"Preparar candidata",exact:true}).click();
  const card = page.locator("article").filter({has:page.getByRole("heading",{name:`Synthetic method ${id}`,exact:true})});
  await expect(card).toBeVisible();await expect(card.getByRole("button",{name:"Registrar revisão",exact:true})).toHaveCount(0);
  await reviewer.goto(url);const reviewCard = reviewer.locator("article").filter({has:reviewer.getByRole("heading",{name:`Synthetic method ${id}`,exact:true})});
  await reviewCard.getByLabel("Revisão técnica do conteúdo e dos testes",{exact:true}).fill("Synthetic review of exact R01 content and linked test evidence.");
  await reviewCard.getByRole("button",{name:"Registrar revisão",exact:true}).click();await expect(reviewCard.locator("blockquote")).toHaveCount(1);
  await expect(reviewCard.getByRole("button",{name:"Publicar esta versão",exact:true})).toHaveCount(0);
  await page.reload();await expect(card.getByRole("button",{name:"Publicar esta versão",exact:true})).toBeVisible();
  await test.info().attach("method-review-desktop",{body:await page.screenshot({fullPage:true}),contentType:"image/png"});
  await page.setViewportSize({width:390,height:844});await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await test.info().attach("method-review-mobile",{body:await page.screenshot({fullPage:true}),contentType:"image/png"});await page.setViewportSize({width:1440,height:1000});
  await card.getByRole("button",{name:"Publicar esta versão",exact:true}).click();await expect(card.locator(".vault-badge")).toHaveText("Publicada");
  // The generic success message may still belong to publication while adoption is pending.
  // Wait for the adopted binding returned by the server before checking committed SQL state.
  const adopted = card.getByText("Esta versão está vinculada a novos trabalhos. Sua retirada bloqueia o uso até uma nova adoção explícita.",{exact:true});
  await expect(adopted).toHaveCount(0);
  await card.getByRole("button",{name:"Adotar para novos trabalhos deste tipo",exact:true}).click();
  await expect(adopted).toBeVisible();
  expect(sql(`select count(*) from public.method_scope_bindings where organization_id='${org}' and retired_at is null;`)).toBe("1");
  await card.getByLabel("Motivo da retirada",{exact:true}).fill("Synthetic withdrawal after review.");await card.getByRole("button",{name:"Retirar publicação",exact:true}).click();await expect(card.locator(".vault-badge")).toHaveText("Retirada");
  expect(sql(`select count(*) from public.method_review_records where organization_id='${org}';`)).toBe("1");
  expect(sql(`select count(*) from public.method_scope_bindings where organization_id='${org}' and retired_at is null;`)).toBe("1");
  await page.goto(`${base}/en-US/app/settings/method?workspace=${org}`);await expect(page.getByRole("heading",{name:"Methods",exact:true})).toBeVisible();
 } finally {await context.close();}
});
