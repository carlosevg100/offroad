import {readFileSync} from "node:fs";
import {join} from "node:path";
import {randomBytes, randomUUID, createHash} from "node:crypto";
import {expect, test} from "@playwright/test";
import JSZip from "jszip";
import {readRoundtripSnapshot} from "@offroad/case-export/artifact-roundtrip";
import messages from "../messages/pt-BR.json";
import {asRegimeOwner, createRegimeWork, localReviewRegimeSql, signUpRegimeAccount} from "./support/project-review-regime";
const literal = (value: string) => `convert_from(decode('${Buffer.from(value).toString("hex")}','hex'),'UTF8')`;
/** Actual browser -> queue -> offline worker -> export receipt -> Office edit -> quarantine ->
 * comparison -> explicit human adoption. No model or fabricated verification is used. */
test("Office roundtrip preserves the base and adopts a reviewed human text contribution", async ({page}, testInfo) => {
  const sql = localReviewRegimeSql(), suffix = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  await signUpRegimeAccount(page, `e2e-regime-roundtrip-${suffix}@example.com`, `Offroad-roundtrip-${suffix}!`);
  const f = createRegimeWork(sql, `e2e-regime-roundtrip-${suffix}@example.com`, suffix);
  await page.goto(`/pt-BR/app/projects/${f.workId}?workspace=${f.organizationId}`);
  await page.locator('.advisor-work-surface__navigation a[href="#work-project-review"]').click();
  const regimePanel = page.getByTestId("project-review-roles");
  const approver = regimePanel.locator(`tr[data-user-id="${f.actorId}"] input[value="approver"]`);
  await approver.click();
  await expect(approver).toBeChecked();
  await expect(regimePanel.locator('select[name="project_self_approval"]')).toBeEnabled();
  await regimePanel.locator('select[name="project_self_approval"]').selectOption("allowed");
  await expect(page.getByTestId("project-review-self-approval")).toHaveAttribute("data-effective", "true");
  const text = "Synthetic original roundtrip text", changed = "Synthetic edited human contribution";
  const manifest = {schemaVersion: "artifact-manifest.2026.09.26-v1", kind: "answer", audience: "internal", format: "json", bytes: null, method: null, execution: null, inputSnapshot: null, institutionalResult: null, sources: [], claims: [], traces: [], template: null, provenance: {producer: "synthetic-e2e-roundtrip", jobId: null, taskRunId: null, messageId: null, capability: null}, legacy: null};
  const created = JSON.parse(sql(asRegimeOwner(f, `select public.create_artifact_revision_v1('${f.workId}','answer','Synthetic Office contribution','internal',${literal(JSON.stringify(manifest))}::jsonb,${literal(JSON.stringify([{blockKey: "synthetic.text", kind: "paragraph", content: {text}, claims: []}]))}::jsonb,'[]',null,null);`)).split("\n").at(-1)!);
  sql(asRegimeOwner(f, `select public.review_artifact_revision_v1('${created.revision_id}','${created.manifest_fingerprint}','approve',null,'Synthetic base approval',true,'${randomUUID()}');`));
  await page.goto(`/pt-BR/app/projects/${f.workId}?workspace=${f.organizationId}`);
  await page.locator('.advisor-work-surface__navigation a[href="#work-artifact-roundtrip"]').click();
  await expect(page.getByText("Synthetic Office contribution", {exact: true})).toBeVisible();
  await page.getByText("Synthetic Office contribution", {exact: true}).click();
  const panel = page.locator("details").filter({has: page.getByText("Synthetic Office contribution", {exact: true})}).getByTestId("artifact-import-panel");
  await expect(panel.getByRole("button", {name: messages.ArtifactImportPanel.export, exact: true})).toBeEnabled();
  const format = panel.getByRole("combobox", {name: messages.ArtifactImportPanel.exportFormat, exact: true});
  await expect(format).toBeEnabled();await format.selectOption("docx");
  await panel.getByRole("button", {name: messages.ArtifactImportPanel.export, exact: true}).click();
  const link = panel.getByRole("link", {name: messages.ArtifactImportPanel.download, exact: true});await expect(link).toBeVisible({timeout: 90000});
  const downloaded = await page.request.get((await link.getAttribute("href"))!);expect(downloaded.status()).toBe(200);
  const bytes = await downloaded.body();expect(downloaded.headers()["x-artifact-sha256"]).toBe(createHash("sha256").update(bytes).digest("hex"));
  const snapshot = await readRoundtripSnapshot(bytes, "docx");expect(snapshot.manifest?.revisionId).toBe(created.revision_id);
  const zip = await JSZip.loadAsync(bytes);const originalXml = await zip.file("word/document.xml")!.async("string");expect(originalXml).toContain(text);
  zip.file("word/document.xml", originalXml.replace(text, changed));const edited = await zip.generateAsync({type: "nodebuffer"});
  const editedSnapshot = await readRoundtripSnapshot(edited, "docx");expect(editedSnapshot.entries.find(entry => entry.blockKey === "synthetic.text")?.value).toBe(changed);
  await panel.getByLabel(messages.ArtifactImportPanel.name, {exact: true}).fill("Synthetic analyst");
  await panel.getByLabel(messages.ArtifactImportPanel.role, {exact: true}).fill("Analyst");
  const checks = panel.locator('input[type="checkbox"]');await checks.nth(0).check();await checks.nth(1).check();
  const receipt = new URL((await link.getAttribute("href"))!, page.url()).searchParams.get("receiptId")!;
  const receipts = panel.getByRole("combobox", {name: messages.ArtifactImportPanel.receipt, exact: true});
  await expect(receipts.locator(`option[value="${receipt}"]`)).toBeAttached();await receipts.selectOption(receipt);
  await panel.getByLabel(messages.ArtifactImportPanel.file, {exact: true}).setInputFiles({name: "synthetic-edit.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: edited});
  await panel.getByRole("button", {name: messages.ArtifactImportPanel.upload, exact: true}).click();
  const review = panel.getByTestId("artifact-import-review");
  try {await expect(review.getByText(changed, {exact: true})).toBeVisible({timeout: 90000});}
  catch(error) {
    // Only bounded lifecycle metadata is captured. No document, comparison value or worker token
    // is printed; failures remain failures and the production authorization path stays unchanged.
    const response = await page.request.get(`/pt-BR/app/artifacts/${created.artifact_id}/imports?workId=${f.workId}`);
    const lifecycle = JSON.parse(sql(`select json_build_object('candidates',coalesce((select json_agg(json_build_object('status',c.status,'reason',c.reason,'comparisonStatus',c.comparison->>'status','classifications',(select json_agg(json_build_object('classification',x.kind,'count',x.n)) from(select value->>'classification'kind,count(*)n from jsonb_array_elements(coalesce(c.comparison->'differences','[]'))group by value->>'classification')x),'proposalCount',jsonb_array_length(coalesce(c.contributions->'blockProposals','[]')))) from public.artifact_import_candidates c where c.work_id='${f.workId}' and c.artifact_id='${created.artifact_id}'),'[]'::json),'tasks',coalesce((select json_agg(json_build_object('operation',t.operation,'state',t.state,'failureCode',t.failure_code))from private.artifact_roundtrip_tasks t where t.work_id='${f.workId}' and t.import_candidate_id is not null),'[]'::json));`));
    await testInfo.attach("roundtrip-readiness-lifecycle",{body:JSON.stringify({httpStatus:response.status(),...lifecycle}),contentType:"application/json"});
    throw error;
  }
  await expect(review.getByText(text, {exact: true}).first()).toBeVisible();
  // Stage18's real producer projects the approved execution brief into a decision milestone.
  // Stage20 record_work_decision is a separate object and must never masquerade as that basis.
  // This bounded synthetic dispatch is parked in the future: no model can be invoked by the test.
  const approvalFixture = readFileSync(join(__dirname, "../../../supabase/tests/support/execution_approval.sql"), "utf8");
  const continuationJob = randomUUID(), continuationRun = randomUUID();
  sql(`begin;select set_config('request.jwt.claim.sub','${f.actorId}',true);select set_config('request.jwt.claims','{"sub":"${f.actorId}","role":"authenticated","aal":"aal1"}',true);select set_config('request.headers','{"x-offroad-workspace":"${f.organizationId}"}',true);
    ${approvalFixture}
    insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
    select '${continuationRun}','${f.organizationId}',s.id,121,'manual','queued','synthetic-roundtrip-continuation','${f.actorId}' from public.document_intake_sessions s where s.capital_project_id='${f.workId}' order by created_at limit 1;
    insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload,available_at)
    select '${continuationJob}','${f.organizationId}',r.intake_session_id,r.id,'case_analysis','queued','{"analysis_scope":"full_case"}','2099-01-01' from public.processing_runs r where r.id='${continuationRun}';
    select pg_temp.fixture_approve_execution('${continuationJob}');commit;`);
  expect(sql(`select count(*) from public.work_milestones where work_id='${f.workId}' and kind='decision' and subject_kind='execution_brief';`)).toBe("1");
  // Refresh the actual server context to expose the producer-created basis to the person.
  await page.reload();await page.locator('.advisor-work-surface__navigation a[href="#work-artifact-roundtrip"]').click();await page.getByText("Synthetic Office contribution", {exact: true}).click();
  const basis = panel.getByRole("combobox", {name: messages.ArtifactImportPanel.basis, exact: true});const basisValue = await basis.locator("option").nth(1).getAttribute("value");expect(basisValue).not.toBeNull();await basis.selectOption(basisValue!);
  const declaration = review.getByLabel(messages.ArtifactImportReview.declaration, {exact: true});if (await declaration.count()) await declaration.check();
  await review.getByRole("button", {name: messages.ArtifactImportReview.apply, exact: true}).click();
  await expect(review.getByText(messages.ArtifactImportReview.status.applied, {exact: true})).toBeVisible();
  const result = JSON.parse(sql(asRegimeOwner(f, `select public.read_artifact_head_v1('${f.workId}','answer','Synthetic Office contribution');`)).split("\n").at(-1)!);
  expect(result.revision.id).not.toBe(created.revision_id);expect(result.revision.origin).toBe("person");expect(result.blocks.find((block: {blockKey: string}) => block.blockKey === "synthetic.text").content.text).toBe(changed);
  const base = JSON.parse(sql(asRegimeOwner(f, `select public.read_artifact_revision_v1('${created.revision_id}');`)).split("\n").at(-1)!);expect(base.blocks[0].content.text).toBe(text);
  const audit = sql(`select count(*) from private.artifact_import_events e join public.artifact_import_candidates c on c.id=e.candidate_id where c.work_id='${f.workId}' and e.kind='adopted';`);expect(audit).toBe("1");
});
