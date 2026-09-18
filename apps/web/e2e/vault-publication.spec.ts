import {execFileSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {expect, test, type Page} from "@playwright/test";
import {waitForOneTimeCode} from "./support/mail";

test("human vault publication requires designation, exact review and preserves withdrawn history", async ({page, browser}) => {
  const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
  for (const value of [databaseUrl, base, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"]) {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)) throw new Error("Vault E2E requires local synthetic services");
  }
  const id = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const sql = (query: string) => execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1"], {input: query, encoding: "utf8"}).trim();
  async function signup(target: Page, suffix: string) {
    const email = `e2e-vault-${suffix.toLowerCase()}-${id}@example.com`;
    await target.goto(`${base}/pt-BR/signup`);
    await target.locator('input[name="full_name"]').fill(`Synthetic contributor ${suffix}`);
    await target.locator('input[name="email"]').fill(email);
    await target.locator('input[name="password"]').fill(`Offroad-E2E-${id}!`);
    await target.locator('input[name="confirm_password"]').fill(`Offroad-E2E-${id}!`);
    await target.locator("form.auth-form--registration button[type=submit]").click();
    await expect(target).toHaveURL(/\/signup\/verify/);
    await target.locator('input[name="token"]').fill(await waitForOneTimeCode(email));
    await target.locator("form.auth-form--verification button[type=submit]").click();
    await expect(target).toHaveURL(/\/pt-BR\/app(?:\?|$)/);
    return email;
  }
  const secondContext = await browser.newContext(); const second = await secondContext.newPage();
  try {
    const emailA = await signup(page, "A"); const emailB = await signup(second, "B");
    const userA = sql(`select id from auth.users where email='${emailA}';`);
    const org = sql(`select organization_id from public.organization_memberships where user_id='${userA}' and status='active' order by created_at limit 1;`);
    expect(org).toMatch(/^[0-9a-f-]{36}$/);
    sql(`begin; update public.organizations set organization_type='institutional',workspace_kind='institutional' where id='${org}';
      insert into public.organization_memberships(organization_id,user_id,role,status) select '${org}',id,'member','active' from auth.users where email='${emailB}';commit;`);
    const url = `${base}/pt-BR/app/vault?workspace=${org}`;
    await page.goto(url); await second.goto(url);
    const a = page.getByRole("region", {name:"Cofre",exact:true});
    const b = second.getByRole("region", {name:"Cofre",exact:true});
    await a.getByRole("button", {name:"Adicionar candidato",exact:true}).click();
    await page.getByLabel("Título",{exact:true}).fill(`Synthetic vault ${id}`);
    await page.getByLabel("Conteúdo",{exact:true}).fill(`Synthetic reviewed direction ${id}`);
    await page.getByRole("button", {name:"Salvar candidato",exact:true}).click();
    const card = a.locator("article").filter({hasText:`Synthetic vault ${id}`});
    await expect(card).toBeVisible();
    await card.getByRole("button",{name:"Revisar publicação",exact:true}).click();
    await page.getByLabel("Fundamento da publicação",{exact:true}).fill("Synthetic review approved for analysis");
    await page.getByRole("button",{name:"Salvar revisão",exact:true}).click();
    await expect(page.locator(".vault-review")).toHaveCount(0);
    await card.getByRole("button",{name:"Revisar publicação",exact:true}).click();
    await expect(page.getByRole("button",{name:"Confirmar publicação",exact:true})).toHaveCount(0);
    await page.locator(".vault-review").getByRole("button",{name:"Fechar",exact:true}).click();
    await a.getByRole("button",{name:"Leitores e publicadores",exact:true}).click();
    const personA = page.locator(".vault-person").filter({hasText:"Synthetic contributor A"});
    const personB = page.locator(".vault-person").filter({hasText:"Synthetic contributor B"});
    await personA.getByRole("button",{name:"Permitir leitura",exact:true}).click();
    await personA.getByRole("button",{name:"Designar publicador",exact:true}).click();
    await personB.getByRole("button",{name:"Permitir leitura",exact:true}).click();
    await second.reload(); await b.getByRole("button",{name:"Candidatos",exact:true}).click();
    await expect(b.locator("article")).toHaveCount(0);
    await card.getByRole("button",{name:"Revisar publicação",exact:true}).click();
    const confirm = page.getByRole("button",{name:"Confirmar publicação",exact:true});
    await expect(confirm).toBeDisabled();
    await page.getByRole("checkbox",{name:"Revisei esta versão, a finalidade e o alcance e autorizo sua publicação."}).check();
    await test.info().attach("vault-review-desktop",{body:await page.screenshot({fullPage:true}),contentType:"image/png"});
    await page.setViewportSize({width:390,height:844});
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await test.info().attach("vault-review-mobile",{body:await page.screenshot({fullPage:true}),contentType:"image/png"});
    await page.setViewportSize({width:1440,height:1000});
    await confirm.click();
    await expect(page.locator(".vault-review")).toHaveCount(0);
    await b.getByRole("button",{name:"Publicados",exact:true}).click();
    await expect(b.locator("article").filter({hasText:`Synthetic vault ${id}`})).toBeVisible();
    await expect(b.getByRole("button",{name:"Retirar publicação",exact:true})).toHaveCount(0);
    await card.getByRole("button",{name:"Criar nova versão",exact:true}).click();
    await page.getByLabel("Conteúdo",{exact:true}).fill(`Synthetic new candidate ${id}`);
    await page.getByRole("button",{name:"Salvar candidato",exact:true}).click();
    await expect(card).toContainText(`Synthetic new candidate ${id}`);
    await second.reload(); await expect(b).not.toContainText(`Synthetic new candidate ${id}`);
    await expect(b).toContainText(`Synthetic reviewed direction ${id}`);
    await card.getByLabel("Motivo da retirada",{exact:true}).fill("Synthetic withdrawal after review");
    await card.getByRole("button",{name:"Retirar publicação",exact:true}).click();
    await expect(card.getByRole("button",{name:"Retirar publicação",exact:true})).toHaveCount(0);
    await second.reload(); await expect(b.locator("article")).toHaveCount(0);
    expect(sql(`select count(*) from public.vault_entry_versions where organization_id='${org}';`)).toBe("2");
    expect(sql(`select count(*) from public.vault_publications where organization_id='${org}' and published_by='${userA}' and withdrawn_at is not null;`)).toBe("1");
  } finally {await secondContext.close();}
});
