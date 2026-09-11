import {execFileSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import * as XLSX from "xlsx";
import {expect,test} from "@playwright/test";
import messages from "../messages/pt-BR.json";
import {waitForOneTimeCode} from "./support/mail";
import {institutionalInputFixture} from "../../../packages/financial-model/src/institutional-input.fixture";

// Seeds only accepted synthetic history. Proposal, review, approval, calculation and exports
// are produced by the actual server actions and local worker, without provider calls.
test("guided institutional setup calculates only after review and survives resume",async({page})=>{
 const databaseUrl=process.env.OFFROAD_E2E_DATABASE_URL??"postgresql://postgres:postgres@127.0.0.1:54322/postgres";
 for(const value of [databaseUrl,process.env.E2E_BASE_URL??"http://127.0.0.1:3000"])
  if(!["127.0.0.1","localhost","[::1]"].includes(new URL(value).hostname))throw new Error("Institutional E2E requires local synthetic services.");
 const id=`${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
 const email=`e2e-institutional-${id}@example.com`,password=`Offroad-E2E-${id}!`;
  await page.goto("/pt-BR/signup");
  await page.locator('input[name="full_name"]').fill("QA pesquisa de financiadores");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirm_password"]').fill(password);
  await page.locator("form.auth-form--registration button[type=submit]").click();
  await expect(page).toHaveURL(/\/pt-BR\/signup\/verify/);
  await page.locator('input[name="token"]').fill(await waitForOneTimeCode(email));
  await page.locator("form.auth-form--verification button[type=submit]").click();
  await expect(page).toHaveURL(/\/pt-BR\/onboarding/);
  await page.locator('input[name="use_forms"][value="institutional_work"]').check();
  await page.locator('input[name="institution_name"]').fill("Instituição sintética de teste");
  await page.locator('input[name="professional_roles"][value="banker"]').check();
  await page.locator('input[name="practice_areas"][value="dcm"]').check();
  await page.locator('input[name="primary_objectives"][value="prepare_meetings"]').check();
  await page.locator(".professional-context__actions .button:not(.button--ghost)").click();
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

 const fixture=institutionalInputFixture();
 const projectId=execFileSync("psql",[databaseUrl,"-qAt","-v","ON_ERROR_STOP=1","-v",`email=${email}`,"-v",`facts=${JSON.stringify(fixture.facts)}`,"-f",join(__dirname,"support","institutional-setup-local.sql")],{encoding:"utf8"}).trim().split("\n").findLast(line=>/^[0-9a-f-]{36}$/.test(line));
 expect(projectId).toBeTruthy();
 const projectPath=`/pt-BR/app/projects/${projectId}`;
 await page.goto(projectPath);
 // Common entry. A documentary request is explained, not started: the documentary reading is not
 // activated in this stack and no model is called. A financial objective goes to the model
 // configuration, is recorded, and survives a reload.
 const entry=page.getByTestId("new-work-request");
 await entry.locator("summary").click();
 const objectiveField=entry.locator('textarea[name="objective"]');
 await objectiveField.fill("Compare estas propostas de financiamento.");
 const preview=page.getByTestId("new-work-preview");
 await expect(preview).toHaveAttribute("data-kind","blocked");
 await expect(preview).toHaveAttribute("data-reason","documentary_not_activated");
 await expect(preview).toContainText(messages.NewWorkRequest.blocked.documentary_not_activated);
 const financialObjective="Faça a comparação financeira dos cenários e calcule o serviço da dívida.";
 await objectiveField.fill(financialObjective);
 await expect(preview).toHaveAttribute("data-kind","dispatch");
 await expect(preview).toHaveAttribute("data-capability","financial_result");
 await expect(preview).toContainText(messages.NewWorkRequest.approval.institutional_configuration);
 await entry.getByRole("button",{name:messages.NewWorkRequest.submit,exact:true}).click();
 await expect(page).toHaveURL(/#work-institutional-setup$/);
 await expect(page.getByTestId("new-work-history")).toContainText(financialObjective);
 await page.reload();
 await entry.locator("summary").click();
 await expect(page.getByTestId("new-work-history")).toContainText(financialObjective);
 await page.locator('.advisor-work-surface__navigation a[href="#work-institutional-setup"]').click();
 const form=page.getByTestId("institutional-setup-form");
 async function submitScenario(costRatio: string) {
 await expect(form).toBeVisible();
 await form.locator('[name="asOfDate"]').fill("2026-12-31");
 await form.locator('[name="currency"]').fill("BRL");
 await form.locator('[name="baseYear"]').fill("2026");
 await form.locator('[name="horizon"]').fill("1");
 const bindings={...fixture.configuration.openingBalanceSheet.bindings,baseRevenue:fixture.configuration.revenueSegments[0].baseRevenue,taxLossCarryforward:fixture.configuration.taxes.openingTaxLossCarryforward,disallowedInterestCarryforward:fixture.configuration.taxes.openingDisallowedInterestCarryforward};
 for(const [key,binding]of Object.entries(bindings)){
  const select=form.locator(`[name="history.${key}"]`);
  const option=select.locator("option").filter({hasText:binding.fieldPath});
  await expect(option).toHaveCount(1);
  await select.selectOption((await option.getAttribute("value"))!);
 }
 await form.locator('input[name^="source."][name$=".date"]').fill("2026-12-31");
 await form.locator('input[name^="source."][name$=".currency"]').fill("BRL");
 await form.locator('input[name^="source."][name$=".locator"]').fill("Financials, synthetic reconciled input");
 await form.locator('textarea[name^="source."][name$=".rationale"]').fill("All selected synthetic facts are stated in BRL base units.");
 const premises={volumeGrowth:"0",priceGrowth:"0",mixEffect:"0",fxEffect:"0",inorganicRevenue:"0",costRatio,existingDepreciation:"0",dso:"0",dio:"0",dpo:"0",otherCurrentAssetsRatio:"0",otherCurrentLiabilitiesRatio:"0",cashTaxRate:"0",distributions:"0",minimumCash:"0"};
 for(const [key,value]of Object.entries(premises)){
  await form.locator(`[name="premise.${key}.2027"]`).fill(value);
  await form.locator(`[name="premise.${key}.rationale"]`).fill("Explicit synthetic annual scenario.");
 }
 await form.getByRole("combobox",{name:messages.InstitutionalSetup.capex,exact:true}).selectOption("none");
 await form.locator('[name="noCapexRationale"]').fill("Explicit synthetic scenario assumes no capex.");
 await form.getByRole("combobox",{name:messages.InstitutionalSetup.debt,exact:true}).selectOption("present");
 await form.locator('[name="debt.0.openingPrincipal"]').fill("100");
 for(const [key,value]of Object.entries({indexer:"fixed",indexationTreatment:"not_applicable",couponTreatment:"cash_paid",couponBase:"opening_principal"}))await form.locator(`[name="debt.0.${key}"]`).selectOption(value);
 for(const key of ["indexationRate","couponRate","drawdown","scheduledPrincipal","prepayment"])await form.locator(`[name="debt.0.2027.${key}"]`).fill("0");
 for(const rate of ["indexation","coupon"]){
  const source=form.locator(`select[name="debt.0.2027.${rate}Source"]`);
  await source.selectOption({label:"Synthetic reconciled accounts.xlsx"});
  await expect(source).toHaveValue(/^[0-9a-f-]{36}$/);
  const sourceDate=form.locator(`[name="debt.0.2027.${rate}Date"]`);
  await expect(sourceDate).toHaveValue("2026-12-31");
  await expect(sourceDate).toHaveAttribute("readonly","");
  await form.locator(`[name="debt.0.2027.${rate}Rationale"]`).fill("Explicit synthetic zero rate.");
 }
 await form.locator('button[type="submit"]').click();
 }
 await submitScenario("50");
 const reviewLink=page.locator('.advisor-work-surface__navigation a[href="#work-institutional-setup-review"]');
 await expect(reviewLink).toBeVisible({timeout:120_000});
 await reviewLink.click();
 const review=page.getByTestId("institutional-setup-review");
 await expect(review).toContainText("Synthetic reconciled accounts.xlsx");
 const debtReview=review.locator("details").filter({has:page.locator("summary").filter({hasText:new RegExp(`^${messages.InstitutionalSetup.debt}$`)})});
 await debtReview.locator("summary").click();
 await expect(debtReview).toContainText("Synthetic reconciled accounts.xlsx");
 await expect(debtReview).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
 await expect(review.getByRole("button",{name:"Aprovar e calcular",exact:true})).toBeEnabled();
 await expect(page.locator('.advisor-work-surface__navigation a[href="#work-institutional-model-result"]')).toHaveCount(0);
 await page.reload();
 await reviewLink.click();
 await expect(review.getByRole("button",{name:"Aprovar e calcular",exact:true})).toBeEnabled();
 // Review roles. The account owns the organization, so it may configure them; it also prepared
 // this configuration, so approving its own work needs the explicit self-approval setting.
 await page.locator('.advisor-work-surface__navigation a[href="#work-project-review"]').click();
 const roles=page.getByTestId("project-review-roles");
 await expect(roles).toHaveAttribute("data-mode","open");
 const ownRow=roles.locator(`tr[data-member-email="${email}"]`);
 await ownRow.locator('input[value="preparer"]').click();
 await expect(ownRow.locator('input[value="preparer"]')).toBeChecked();
 await expect(roles).toHaveAttribute("data-mode","assigned");
 await ownRow.locator('input[value="approver"]').click();
 await expect(ownRow.locator('input[value="approver"]')).toBeChecked();
 await expect(page.getByTestId("project-review-self-approval")).toHaveAttribute("data-effective","false");
 await reviewLink.click();
 await review.getByRole("button",{name:"Aprovar e calcular",exact:true}).click();
 await expect(review.getByRole("alert")).toHaveText(messages.InstitutionalSetupReview.roleRequired);
 await expect(page.locator('.advisor-work-surface__navigation a[href="#work-institutional-model-result"]')).toHaveCount(0);
 await page.locator('.advisor-work-surface__navigation a[href="#work-project-review"]').click();
 await roles.locator('select[name="project_self_approval"]').selectOption("allowed");
 await expect(page.getByTestId("project-review-self-approval")).toHaveAttribute("data-effective","true");
 await reviewLink.click();
 await expect(review.getByRole("button",{name:"Aprovar e calcular",exact:true})).toBeEnabled();
 await review.getByRole("button",{name:"Aprovar e calcular",exact:true}).click();
 const resultLink=page.locator('.advisor-work-surface__navigation a[href="#work-institutional-model-result"]');
 await expect(resultLink).toBeVisible({timeout:120_000});
 await resultLink.click();
 const result=page.getByTestId("institutional-model-result");
 await expect(result.getByRole("status")).toHaveText(messages.InstitutionalModelResult.status.completed,{timeout:120_000});
 const xlsx=page.locator(`a[href^="${projectPath}/financial-results/"][href$="/xlsx"]`);
 await expect(xlsx).toHaveCount(1);
 const resultUrl=await xlsx.getAttribute("href");
 for(const format of ["xlsx","docx","pptx","pdf"]){
  const response=await page.request.get(resultUrl!.replace(/xlsx$/,format));
  expect(response.status()).toBe(200);const bytes=await response.body();expect(bytes.byteLength).toBeGreaterThan(500);expect(bytes.subarray(0,format==="pdf"?5:2).toString()).toBe(format==="pdf"?"%PDF-":"PK");
 }
 await page.reload();await resultLink.click();
 await expect(result.getByRole("status")).toHaveText(messages.InstitutionalModelResult.status.completed);
 await expect(xlsx).toHaveAttribute("href",resultUrl!);
 // A second explicitly reviewed calculation is a comparison reference, not an implicit
 // recommendation. The browser must keep downloads bound to the current result.
 await page.locator('.advisor-work-surface__navigation a[href="#work-institutional-setup"]').click();
 await submitScenario("40");
 await reviewLink.click();
 await expect(review.getByRole("button",{name:"Aprovar e calcular",exact:true})).toBeEnabled({timeout:120_000});
 await review.getByRole("button",{name:"Aprovar e calcular",exact:true}).click();
 await resultLink.click();
 await expect(result.getByRole("status")).toHaveText(messages.InstitutionalModelResult.status.completed,{timeout:120_000});
 await expect(xlsx).not.toHaveAttribute("href",resultUrl!);
 const currentUrl = await xlsx.getAttribute("href");
 const comparison = result.getByRole("region",{name:messages.InstitutionalScenarioComparison.title,exact:true});
 const selector = comparison.getByRole("combobox");
 await expect(selector.locator("option")).toHaveCount(2);
 await selector.selectOption({index:1});
 const table = comparison.getByRole("table");
 await expect(table).toBeVisible();
 const ebitda = table.getByRole("row").filter({has:page.getByRole("rowheader",{name:"EBITDA",exact:true})});
 const values = await ebitda.getByRole("cell").allTextContents();
 expect(values[1]).not.toBe(values[2]);
 await expect(xlsx).toHaveAttribute("href",currentUrl!);
 await expect(comparison).toContainText(messages.InstitutionalScenarioComparison.boundary);
 expect(new URL(page.url()).pathname).toBe(projectPath);

 // Two approved revisions exist now. The older output stays identifiable as previous and the
 // difference names the assumption that moved.
 await page.locator('.advisor-work-surface__navigation a[href="#work-institutional-revisions"]').click();
 const revisions=page.getByTestId("institutional-revision-work");
 await expect(revisions.getByTestId("current-revision")).toContainText("2");
 await expect(revisions.getByTestId("revision-2")).toContainText(messages.InstitutionalRevision.standing.current);
 await expect(revisions.getByTestId("revision-1")).toContainText(messages.InstitutionalRevision.standing.previous);
 await expect(revisions).toContainText(messages.InstitutionalRevision.differenceTitle);
 await expect(revisions).toContainText(messages.InstitutionalRevision.assumptionsChanged);

 // The exported workbook comes back. Unchanged, it is refused rather than proposed as an empty
 // change; with one assumption cell edited, it opens a proposal that only an approver closes.
 const exported=Buffer.from(await (await page.request.get(currentUrl!)).body());
 const importField=revisions.locator('input[type="file"]');
 const submitImport=revisions.getByRole("button",{name:messages.InstitutionalRevision.importSubmit,exact:true});
 const unchangedPath=join(tmpdir(),`offroad-e2e-unchanged-${id}.xlsx`);
 writeFileSync(unchangedPath,exported);
 await importField.setInputFiles(unchangedPath);
 await submitImport.click();
 await expect(revisions.getByRole("alert")).toHaveText(messages.InstitutionalRevision.refusals.no_change);

 // 0.4 is the cost ratio this scenario approved and the only editable cell holding it.
 const book=XLSX.read(exported,{type:"buffer"});
 const inputs=book.Sheets["Premissas 1"];
 const edited=Object.keys(inputs).find(address=>/^B\d+$/.test(address)&&(inputs[address] as {v?:unknown}).v===0.4);
 expect(edited).toBeTruthy();
 inputs[edited!]={t:"n",v:0.35};
 const editedPath=join(tmpdir(),`offroad-e2e-edited-${id}.xlsx`);
 writeFileSync(editedPath,Buffer.from(XLSX.write(book,{bookType:"xlsx",type:"array"}) as ArrayBuffer));
 await importField.setInputFiles(editedPath);
 await submitImport.click();
 const proposal=revisions.locator('[data-testid^="proposal-"]');
 await expect(proposal).toHaveCount(1,{timeout:60_000});
 await expect(proposal).toContainText(messages.InstitutionalRevision.proposalStatus.proposed);
 await expect(proposal).toContainText("40%");
 await expect(proposal).toContainText("35%");

 // Approving it produces a third revision and a new current result; the previous one is kept.
 await proposal.getByRole("button",{name:messages.InstitutionalRevision.approve,exact:true}).click();
 await expect(revisions.getByTestId("current-revision")).toContainText("3",{timeout:120_000});
 await resultLink.click();
 await expect(result.getByRole("status")).toHaveText(messages.InstitutionalModelResult.status.completed,{timeout:120_000});
 await expect(xlsx).not.toHaveAttribute("href",currentUrl!);
 await page.locator('.advisor-work-surface__navigation a[href="#work-institutional-revisions"]').click();
 await expect(revisions.getByTestId("revision-2")).toContainText(messages.InstitutionalRevision.standing.previous);
 await expect(revisions.getByTestId("revision-3")).toContainText(messages.InstitutionalRevision.standing.current);
 await expect(revisions).toContainText(messages.InstitutionalRevision.boundary);
});
