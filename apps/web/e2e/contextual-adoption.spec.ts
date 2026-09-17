import {useLegacyCompanyFixture} from "./support/legacy-workspace";
import {execFileSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {expect,test} from "@playwright/test";
import {waitForOneTimeCode} from "./support/mail";
import messages from "../messages/pt-BR.json";

test("contextual adoption preserves revisions and reproduces a calculation after reload",async({page})=>{
 const databaseUrl=process.env.OFFROAD_E2E_DATABASE_URL??"postgresql://postgres:postgres@127.0.0.1:54322/postgres";
 for(const value of [databaseUrl,process.env.E2E_BASE_URL??"http://127.0.0.1:3000"])
  if(!["127.0.0.1","localhost","[::1]"].includes(new URL(value).hostname))throw new Error("Institutional E2E requires local synthetic services.");
 const id=`${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
 const email=`e2e-adoption-${id}@example.com`,password=`Offroad-E2E-${id}!`;
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


 const projectId=execFileSync("psql",[databaseUrl,"-qAt","-v","ON_ERROR_STOP=1"],{input:`select p.id from public.capital_projects p join auth.users u on u.id=p.created_by where u.email='${email}' order by p.created_at desc limit 1;`,encoding:"utf8"}).trim();
 const copy=messages.App.adoptionBasis;
 await page.goto(`/pt-BR/app/projects/${projectId}`);
 await page.getByRole("link",{name:copy.title,exact:true}).click();
 await expect(page.getByRole("heading",{name:copy.title,exact:true})).toBeVisible();
 await page.getByText(copy.defineEntity,{exact:true}).click();
 const entity=page.getByRole("button",{name:copy.saveEntity,exact:true}).locator("..");
 await entity.locator('[name="dossierId"]').selectOption({index:1});
 await entity.locator('[name="name"]').fill("Synthetic adoption entity");
 await entity.locator('[name="namespace"]').fill("BR:CNPJ");
 await entity.locator('[name="value"]').fill("00000000000191");
 await entity.locator('[name="reason"]').fill("Explicit synthetic identity review");
 await entity.getByRole("button").click();
 await expect(page.locator('select[name="entityId"] option')).toHaveCount(2);
 await page.getByText(copy.defineMetric,{exact:true}).click();
 const definition=page.getByRole("button",{name:copy.saveDefinition,exact:true}).locator("..");
 for(const metric of ["financials.net_debt","financials.ebitda"]){
  await definition.locator('[name="dossierId"]').selectOption({index:1});
  await definition.locator('[name="fieldPath"]').fill(metric);
  await definition.locator('[name="definition"]').fill(`Synthetic explicit ${metric} definition`);
  await definition.getByRole("button").click();
  await expect(page.locator('select[name="definitionVersionId"]')).toContainText(metric);
 }
 async function hypothesis(metric:string,value:string){
  const form=page.getByRole("button",{name:copy.saveHypothesis,exact:true}).locator("..");
  await form.locator('[name="fieldPath"]').fill(metric);
  await form.locator('[name="value"]').fill(value);
  await form.locator('[name="entityId"]').selectOption({index:1});
  const option=form.locator('[name="definitionVersionId"] option').filter({hasText:metric});
  await form.locator('[name="definitionVersionId"]').selectOption((await option.getAttribute("value"))!);
  for(const [key,value] of Object.entries({perimeter:"standalone",periodStart:"2025-01-01",periodEnd:"2025-12-31",currency:"BRL",unit:"currency",scale:"1",scenario:"actual",reason:"Explicit synthetic working assumption"}))await form.locator(`[name="${key}"]`).fill(value);
  await form.getByRole("button").click();
 }
 await hypothesis("financials.net_debt","300");
 await expect(page).toHaveURL(/version=/);
 await hypothesis("financials.ebitda","100");
 await expect(page.getByRole("link",{name:"Revisão 2",exact:true})).toBeVisible();
 const oldUrl=page.url();
 async function calculate(expected:string){
  const form=page.getByRole("button",{name:copy.runCalculation,exact:true}).locator("..");
  for(const [key,metric] of [["netDebt","financials.net_debt"],["ebitda","financials.ebitda"]]){
   const option=form.locator(`[name="${key}"] option`).filter({hasText:metric});
   await form.locator(`[name="${key}"]`).selectOption((await option.getAttribute("value"))!);
  }
  await form.getByRole("button").click();await expect(page.locator("output strong")).toHaveText(expected);
 }
 await calculate("3×");
 const fingerprint=await page.locator("output code").textContent();
 await hypothesis("financials.net_debt","450");
 await expect(page.getByRole("link",{name:"Revisão 3",exact:true})).toBeVisible();
 await calculate("4.5×");
 await page.goto(oldUrl);await calculate("3×");
 await expect(page.locator("output code")).toHaveText(fingerprint!);
 await page.reload();await expect(page.getByRole("link",{name:"Revisão 2",exact:true})).toHaveAttribute("aria-current","page");
});
