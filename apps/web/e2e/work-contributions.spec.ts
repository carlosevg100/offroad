import {execFileSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {expect, test, type Page} from "@playwright/test";
import {waitForOneTimeCode} from "./support/mail";

test("two people preserve private branches, compare conflicts and lose revoked access", async ({page, browser}) => {
  const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
  for (const value of [databaseUrl, base, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"]) {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)) throw new Error("Contribution E2E requires local synthetic services");
  }
  const id = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const sql = (query: string) => execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1"], {input: query, encoding: "utf8"}).trim();
  async function signup(target: Page, suffix: string) {
    const email = `e2e-contributions-${suffix}-${id}@example.com`;
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
    await page.locator(".advisor-composer--start textarea").fill(`Synthetic shared capital decision ${id}`);
    await page.locator(".advisor-composer--start textarea").press("Enter");
    await expect(page).toHaveURL(/\/app\/projects\/[0-9a-f-]{36}/);
    const workId = new URL(page.url()).pathname.split("/").at(-1)!;
    expect(workId).toMatch(/^[0-9a-f-]{36}$/);
    const org = sql(`select organization_id from public.capital_projects where id='${workId}';`);
    expect(org).toMatch(/^[0-9a-f-]{36}$/);
    // Only identity/membership fixtures. All work sharing, contributions and revocation below use the product.
    sql(`begin;
      update public.organizations set workspace_kind='institutional' where id='${org}';
      insert into public.organization_memberships(organization_id,user_id,role,status)
      select '${org}',id,'member','active' from auth.users where email='${emailB}';
      commit;`);
    const workUrl = `${base}/pt-BR/app/projects/${workId}?workspace=${org}#work-contributions`;
    await page.goto(workUrl);
    const a = page.getByTestId("work-contributions"); const b = second.getByTestId("work-contributions");
    await expect(a).toBeVisible();
    await a.locator('textarea[name="contribution"]').fill(`Private A ${id}`);
    await a.getByRole("button", {name: "Salvar no meu canal", exact: true}).click();
    await expect(a.locator("article").filter({hasText: `Private A ${id}`})).toBeVisible();
    await a.getByText("Pessoas neste trabalho", {exact: true}).click();
    const personB = a.locator("li").filter({hasText: "Synthetic contributor B"});
    await personB.getByRole("button", {name: "Adicionar ao trabalho"}).click();
    await expect(personB.getByRole("button", {name: "Remover acesso"})).toBeVisible();
    await second.goto(workUrl); await expect(b).toBeVisible();
    await expect(b).not.toContainText(`Private A ${id}`);
    await a.locator('textarea[name="contribution"]').fill(`Shared basis ${id}`);
    await a.getByRole("button", {name: "Salvar no meu canal", exact: true}).click();
    await a.locator("article").filter({hasText: `Shared basis ${id}`}).getByRole("button", {name: "Compartilhar esta versão"}).click();
    await b.getByRole("button", {name: "Compartilhadas", exact: true}).click();
    await expect(b.locator("article").filter({hasText: `Shared basis ${id}`})).toBeVisible();
    for (const panel of [a, b]) await panel.locator("article").filter({hasText: `Shared basis ${id}`}).getByRole("button", {name: "Propor alteração"}).click();
    await a.locator('textarea[name="contribution"]').fill(`Alternative A ${id}`);
    await b.locator('textarea[name="contribution"]').fill(`Alternative B ${id}`);
    await Promise.all([a.getByRole("button", {name: "Salvar no meu canal", exact: true}).click(), b.getByRole("button", {name: "Salvar no meu canal", exact: true}).click()]);
    await expect(a.locator("article").filter({hasText: `Alternative A ${id}`})).toBeVisible();
    await expect(b.locator("article").filter({hasText: `Alternative B ${id}`})).toBeVisible();
    await expect(a.locator("article").filter({hasText: `Alternative B ${id}`})).toHaveCount(0);
    await a.locator("article").filter({hasText: `Alternative A ${id}`}).getByRole("button", {name: "Compartilhar esta versão"}).click();
    await b.locator("article").filter({hasText: `Alternative B ${id}`}).getByRole("button", {name: "Compartilhar esta versão"}).click();
    const conflict = b.getByTestId("contribution-conflict");
    await expect(conflict).toContainText(`Shared basis ${id}`);
    await expect(conflict).toContainText(`Alternative A ${id}`);
    await expect(conflict).toContainText(`Alternative B ${id}`);
    await expect(b.locator("article").filter({hasText: `Alternative B ${id}`})).toBeVisible();
    expect(Number(sql(`select count(*) from public.contribution_revisions where work_id='${workId}' and content in ('Alternative A ${id}','Alternative B ${id}') and promoted_from_revision_id is null;`))).toBe(2);
    await test.info().attach("contribution-conflict-desktop", {body: await second.screenshot({fullPage: true}), contentType: "image/png"});
    await second.setViewportSize({width: 390, height: 844});
    await expect(conflict).toBeVisible();
    await expect.poll(() => second.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await test.info().attach("contribution-conflict-mobile", {body: await second.screenshot({fullPage: true}), contentType: "image/png"});
    await second.setViewportSize({width: 1440, height: 1000});
    await conflict.getByRole("button", {name: "Preparar proposta sobre a versão atual"}).click();
    await b.getByRole("button", {name: "Salvar no meu canal", exact: true}).click();
    expect(sql(`select count(*) from public.contribution_revisions newer join public.contribution_revisions prior on prior.id=newer.previous_revision_id where newer.work_id='${workId}' and newer.content='Alternative B ${id}' and prior.content=newer.content and newer.base_revision_id is distinct from prior.base_revision_id;`)).toBe("1");
    await b.locator("article").filter({hasText: `Alternative B ${id}`}).first().getByRole("button", {name: "Compartilhar esta versão"}).click();
    await b.locator("article").filter({hasText: `Alternative B ${id}`}).getByRole("button", {name: "Histórico", exact: true}).click();
    const history = b.getByRole("region", {name: "Histórico", exact: true});
    await expect(history).toContainText(`Shared basis ${id}`);
    await expect(history).toContainText(`Alternative A ${id}`);
    await expect(history).toContainText(`Alternative B ${id}`);
    await personB.getByRole("button", {name: "Remover acesso"}).click();
    await expect(personB.getByRole("button", {name: "Adicionar ao trabalho"})).toBeVisible();
    await second.reload(); await expect(b).toHaveCount(0);
    await expect(second.locator("body")).not.toContainText(`Alternative B ${id}`);
    expect(sql(`select private.resource_access_as_subject_v1('${org}','${workId}',(select id from auth.users where email='${emailB}'),'read');`)).toBe("f");
    expect(sql(`select count(*) from public.capital_projects where id='${workId}' and created_by=(select id from auth.users where email='${emailA}');`)).toBe("1");
  } finally {await secondContext.close();}
});
