import {execFileSync} from "node:child_process";
import {createHash, randomBytes, randomUUID} from "node:crypto";
import {expect, test} from "@playwright/test";
import {productionRunBudget} from "@offroad/model-gateway";
import messages from "../messages/pt-BR.json";
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

test("framework readiness keeps one work from a question without intake to pinned calculation, review and revocation", async ({page, browser}) => {
 test.setTimeout(480_000);
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
 await expect(page).toHaveURL(/\/pt-BR\/app(?:\?|$)/);
 const question = `Alternativas de estrutura de capital para uma decisão — synthetic ${id}`;
 await page.locator(".advisor-composer--start textarea").fill(question);
 await page.locator(".advisor-composer--start textarea").press("Enter");
 await expect(page).toHaveURL(/\/app\/projects\/[0-9a-f-]{36}/);
 const projectId = new URL(page.url()).pathname.split("/").at(-1)!;
 expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
 const original = JSON.parse(sql(`select json_build_object('company',p.company_id,'intakes',(select count(*) from public.document_intake_sessions where capital_project_id=p.id),'plans',(select count(*) from public.capital_project_plans where capital_project_id=p.id),'messages',(select count(*) from public.agent_messages where work_id=p.id and role='user')) from public.capital_projects p where p.id='${projectId}';`));
 expect(original).toEqual({company:null,intakes:0,plans:0,messages:1});
 await expect(page.locator(".advisor-thread")).toContainText(question);
 // Evidence may be added later. The public intake adapter must keep the original work.
 sql(`begin;select set_config('request.jwt.claim.sub',(select created_by::text from public.capital_projects where id='${projectId}'),true);select set_config('request.headers',json_build_object('x-offroad-workspace',(select organization_id from public.capital_projects where id='${projectId}'))::text,true);set local role authenticated;select public.accept_private_workspace_terms('pt-BR','Synthetic readiness owner','',true,true);select public.prepare_work_document_intake_v1('${projectId}','pt-BR');commit;`);
 expect(sql(`select count(*) from public.document_intake_sessions where capital_project_id='${projectId}';`)).toBe("1");
 // Two own synthetic files enter through the real browser Storage/registration path.
 await page.reload();
 const sourceFiles=[{name:`synthetic-accounts-${id}.csv`,mimeType:"text/csv",buffer:Buffer.from("metric,value\nliquidity.available_cash,1250.5\n")},{name:`synthetic-management-${id}.csv`,mimeType:"text/csv",buffer:Buffer.from("metric,value\nliquidity.available_cash,1330.7\n")}];
 const [chooser]=await Promise.all([page.waitForEvent("filechooser"),page.getByRole("button",{name:"Anexar documentos",exact:true}).click()]);
 await chooser.setFiles(sourceFiles);
 await expect.poll(()=>sql(`select count(*) from public.source_documents d join public.document_intake_sessions s on s.id=d.intake_session_id where s.capital_project_id='${projectId}'`)).toBe("2");
 const ownSources=JSON.parse(sql(`select json_agg(json_build_object('id',d.id,'name',d.original_name,'sha256',d.sha256) order by d.original_name) from public.source_documents d join public.document_intake_sessions s on s.id=d.intake_session_id where s.capital_project_id='${projectId}'`)) as {id:string;name:string;sha256:string}[];
 for(const file of sourceFiles)expect(ownSources.find(v=>v.name===file.name)?.sha256).toBe(createHash("sha256").update(file.buffer).digest("hex"));
 // Only a real pipeline writes scan/hash verification; no accepted or verification row is seeded.
 sql(`begin;select set_config('request.jwt.claim.sub',(select created_by::text from public.capital_projects where id='${projectId}'),true);select set_config('request.headers',json_build_object('x-offroad-workspace',(select organization_id from public.capital_projects where id='${projectId}'))::text,true);set local role authenticated;select public.begin_processing_run((select organization_id from public.capital_projects where id='${projectId}'),(select id from public.document_intake_sessions where capital_project_id='${projectId}'),'upload',(select jsonb_agg(jsonb_build_object('source_document_id',d.id)) from public.source_documents d join public.document_intake_sessions x on x.id=d.intake_session_id where x.capital_project_id='${projectId}'),'framework-readiness-source-pipeline','${JSON.stringify(productionRunBudget)}'::jsonb);commit;`);
 await expect.poll(()=>sql(`select count(distinct v.source_version_id) from private.source_version_verifications v where v.source_version_id in ('${ownSources[0]!.id}','${ownSources[1]!.id}')`),{timeout:180_000,intervals:[2000]}).toBe("2");
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
 // The two explicit human observations coexist; ranking does not pick a winner.
 const cashDefinition=(await page.locator('select[name="definitionVersionId"] option').filter({hasText:"liquidity.available_cash"}).getAttribute("value"))!;
 const companyId=(await page.locator('select[name="entityId"] option').filter({hasText:company}).getAttribute("value"))!;
 const dossierId=sql(`select d.dossier_id from public.metric_definitions d join public.definition_versions v on v.metric_definition_id=d.id where v.id='${cashDefinition}'`);
 const dims={entityId:companyId,perimeter:"consolidated",periodStart:null,periodEnd:"2025-12-31",currency:"BRL",unit:"currency",scale:"1",scenario:"actual",definitionVersionId:cashDefinition};
 const actorSql=(command:string)=>`begin;select set_config('request.jwt.claim.sub',(select created_by::text from public.capital_projects where id='${projectId}'),true);select set_config('request.headers',json_build_object('x-offroad-workspace',(select organization_id from public.capital_projects where id='${projectId}'))::text,true);set local role authenticated;${command};commit;`;
 for(const source of ownSources){
  const payload={requestId:randomUUID(),dossierId,fieldPath:"liquidity.available_cash",dimensions:dims,value:{type:"number",value:source.name.startsWith("synthetic-accounts")?"1250.5":"1330.7"},sourceVersionId:source.id,anchor:{row:"2",column:"value"},supersedesId:null};
  sql(actorSql(`select public.record_observation_v1('${JSON.stringify(payload)}'::jsonb)`));
 }
 await page.reload();
 const sourceSection=page.locator("section").filter({has:page.getByRole("heading",{name:basisCopy.sources,exact:true})});
 await expect(sourceSection.locator("li")).toHaveCount(2);
 const selected=sourceSection.locator("li").filter({hasText:sourceFiles[0]!.name});
 await selected.locator('textarea[name="reason"]').fill("Synthetic annual accounts chosen explicitly for this purpose; management estimate remains visible");
 await selected.getByRole("button",{name:basisCopy.adopt,exact:true}).click();
 await expect(revision(2)).toBeVisible();
 expect(sql(`select count(*) from public.observations where dossier_id='${dossierId}' and field_path='liquidity.available_cash'`)).toBe("2");
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
 // Stage 19: the commit registered the result as a revision, and the screen reads it from its blocks,
 // saying which revision it shows and whether it is still current, with no fingerprint in the result.
 const recorded = page.locator("section.execution-result--recorded");
 await expect(recorded).toHaveCount(1);
 await expect(recorded).toContainText(copy.detail.recorded.replace("{revision}", "1").split("{date}")[0]!);
 await expect(recorded.getByRole("status")).toHaveText(copy.detail.freshness.current);
 // Field paths of the missing inputs stay as code; no fingerprint appears in the result.
 await expect(recorded).not.toContainText(/[0-9a-f]{64}/);
 // The screen of a registered result names no identifier: not the execution, not a fingerprint.
 await expect(page.locator("main.work-executions")).not.toContainText(executionId);
 await expect(page.locator("main.work-executions")).not.toContainText(copy.detail.contractFingerprint);
 // A second authenticated person joins only after an explicit work grant. Identity membership
 // alone never grants the work; the synthetic membership is the only operator fixture here.
 const secondContext=await browser.newContext();
 const second=await secondContext.newPage();
 const secondEmail=`e2e-readiness-reviewer-${id}@example.com`;
 await second.goto("/pt-BR/signup");
 await second.locator('input[name="full_name"]').fill("Synthetic readiness reviewer");
 await second.locator('input[name="email"]').fill(secondEmail);
 await second.locator('input[name="password"]').fill(password);
 await second.locator('input[name="confirm_password"]').fill(password);
 await second.locator("form.auth-form--registration button[type=submit]").click();
 await expect(second).toHaveURL(/\/signup\/verify/);
 await second.locator('input[name="token"]').fill(await waitForOneTimeCode(secondEmail));
 await second.locator("form.auth-form--verification button[type=submit]").click();
 await expect(second).toHaveURL(/\/pt-BR\/app(?:\?|$)/);
 const organizationId=sql(`select organization_id from public.capital_projects where id='${projectId}'`);
 const reviewerId=sql(`select id from auth.users where email='${secondEmail}'`);
 sql(`begin;update public.organizations set organization_type='institutional',workspace_kind='institutional' where id='${organizationId}';insert into public.organization_memberships(organization_id,user_id,role,status) values('${organizationId}','${reviewerId}','member','active');commit;`);
 const workUrl=`/pt-BR/app/projects/${projectId}?workspace=${organizationId}#work-contributions`;
 await second.goto(workUrl);
 await expect(second.getByTestId("work-contributions")).toHaveCount(0);
 await page.goto(workUrl);
 const contributions=page.getByTestId("work-contributions");
 await contributions.getByText("Pessoas neste trabalho",{exact:true}).click();
 const person=contributions.locator("li").filter({hasText:"Synthetic readiness reviewer"});
 await person.getByRole("button",{name:"Adicionar ao trabalho"}).click();
 await expect(person.getByRole("button",{name:"Remover acesso"})).toBeVisible();
 await second.goto(workUrl);
 const secondContributions=second.getByTestId("work-contributions");
 await secondContributions.locator('textarea[name="contribution"]').fill(`Synthetic alternative capital structure ${id}`);
 await secondContributions.getByRole("button",{name:"Salvar no meu canal",exact:true}).click();
 const personal=secondContributions.locator("article").filter({hasText:`Synthetic alternative capital structure ${id}`});
 await expect(personal).toBeVisible();
 await page.reload();
 await expect(contributions).not.toContainText(`Synthetic alternative capital structure ${id}`);
 await personal.getByRole("button",{name:"Compartilhar esta versão"}).click();
 await expect(secondContributions.getByRole("button",{name:"Compartilhadas",exact:true})).toHaveAttribute("aria-pressed","true");
 await contributions.getByRole("button",{name:"Compartilhadas",exact:true}).click();
 await expect(contributions).toContainText(`Synthetic alternative capital structure ${id}`);
 // The human review is on the exact worker revision, with another person and the default policy.
 await second.goto(`/pt-BR/app/projects/${projectId}/executions/${executionId}?workspace=${organizationId}`);
 const humanReview=second.getByTestId("artifact-revision-review");
 await expect(humanReview).toContainText(messages.ArtifactRevisionReview.pending);
 await humanReview.getByRole("button",{name:messages.ArtifactRevisionReview.approve,exact:true}).click();
 await expect(humanReview).toContainText(messages.ArtifactRevisionReview.approved);
 await second.reload();
 await expect(humanReview).toContainText(messages.ArtifactRevisionReview.approved);
 await humanReview.getByRole("button",{name:messages.ArtifactRevisionReview.revoke,exact:true}).click();
 await expect(humanReview).toContainText(messages.ArtifactRevisionReview.pending);
 await secondContext.close();
 await page.goto(`/pt-BR/app/projects/${projectId}/executions/${executionId}`);
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
 // One execution_result revision, written by the worker's commit, pins the receipt's result fingerprint.
 expect(sql(`select count(*)||'|'||bool_and(r.origin='worker')::text||'|'||bool_and(r.manifest#>>'{execution,resultFingerprint}'=x.result_fingerprint)::text from public.artifact_revisions r join public.artifacts a on a.organization_id=r.organization_id and a.id=r.artifact_id join private.execution_result_receipts x on x.organization_id=a.organization_id and x.execution_id='${executionId}' where a.kind='execution_result' and a.subject='execution:${executionId}';`))
  .toBe("1|true|true");
 const manifestFingerprint = sql(`select r.manifest_hash from private.execution_control_bindings b join private.execution_method_profiles p on p.id=b.profile_id join private.platform_method_releases r on r.id=p.platform_release_id where b.execution_id='${executionId}';`);
 expect(manifestFingerprint).toMatch(/^[a-f0-9]{64}$/);
 const originalResult=sql(`select canonical_result from private.execution_result_receipts where execution_id='${executionId}'`);
 await page.goto(`/pt-BR/app/projects/${projectId}/basis`);
 await contribute(company,"liquidity.available_cash","1500",{start:"",end:"2025-12-31"},4);
 await page.getByRole("link",{name:basisCopy.executions,exact:true}).click();
 await requestExecution(4);
 await expect(page).toHaveURL(new RegExp(`/executions/[0-9a-f-]{36}$`));
 const resumedId=new URL(page.url()).pathname.split("/").at(-1)!;
 expect(resumedId).not.toBe(executionId);
 await expect.poll(async()=>{
  await page.getByRole("button",{name:copy.detail.refresh,exact:true}).click();
  return sql(`select status from public.work_executions where id='${resumedId}'`);
 },{timeout:180_000,intervals:[2000]}).toBe("succeeded");
 expect(sql(`select canonical_result from private.execution_result_receipts where execution_id='${executionId}'`)).toBe(originalResult);
 expect(sql(`select count(*) from public.work_executions where work_id='${projectId}'`)).toBe("2");
 expect(sql(`select b.work_id from public.work_executions b where b.id='${resumedId}'`)).toBe(projectId);
 const proof = {schemaVersion:"framework-readiness-journey.v1", workId:projectId, executionId, manifestFingerprint, profileFingerprint:released.profileSha256, sameWork:true, startedWithoutIntake:true, workerAuthoredResult:true};
 // Current resource authority closes the already viewed result even for its historical creator.
 sql(`begin;select set_config('request.jwt.claim.sub',(select created_by::text from public.capital_projects where id='${projectId}'),true);select set_config('request.headers',json_build_object('x-offroad-workspace',(select organization_id from public.capital_projects where id='${projectId}'))::text,true);set local role authenticated;select public.revoke_resource_access_v1('${projectId}',(select auth.uid()));commit;`);
 await page.goto(`/pt-BR/app/projects/${projectId}/executions/${executionId}`);
 await expect(page.locator("section.execution-result--recorded")).toHaveCount(0);
 await expect(page.locator("body")).not.toContainText(question);
 await test.info().attach("framework-readiness-journey",{body:JSON.stringify(proof),contentType:"application/json"});

});
