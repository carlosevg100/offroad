import {execFileSync} from "node:child_process";
import {join} from "node:path";
import {createHash, randomBytes, randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {capitalProjectPlanSnapshot} from "@offroad/work-plan";
import {buildDecisionArtifactContract} from "@offroad/case-understanding";
import {expect, test} from "@playwright/test";
import {readRoundtripSnapshot} from "@offroad/case-export/artifact-roundtrip";
import messages from "../messages/pt-BR.json";
import {asRegimeOwner, createRegimeWork, localReviewRegimeSql, signUpRegimeAccount} from "./support/project-review-regime";
import {institutionalWorkbookFor} from "./support/governed-materials";
import {renderApprovedInstitutionalFinancialWorkbook} from "@offroad/financial-model";

const literal = (value: string) => `convert_from(decode('${Buffer.from(value).toString("hex")}','hex'),'UTF8')`;
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Real local Auth, Storage, RLS and route. Operator setup creates only this synthetic namespace;
 * the real offline export worker runs; no model runs, and setup is not publication evidence. */
test("stored preview downloads exact bytes and refuses missing, altered and source-revoked objects", async ({page}) => {
  const sql = localReviewRegimeSql();
  const suffix = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const email = `e2e-regime-stored-${suffix}@example.com`;
  await signUpRegimeAccount(page, email, `Offroad-stored-${suffix}!`);
  const f = createRegimeWork(sql, email, suffix);
  const source = randomUUID(), run = randomUUID(), job = randomUUID();
  // The synthetic owner explicitly accepts the official terms and requests private document
  // intake through the same public commands used by the upload route; no access-basis patch.
  const session = sql(asRegimeOwner(f, `select public.accept_private_workspace_terms('pt-BR','Synthetic stored download analyst','Analyst',true,true);
    select public.prepare_work_document_intake_v1('${f.workId}','pt-BR',${literal(JSON.stringify(capitalProjectPlanSnapshot("company_debt_view")))}::jsonb);`)).split("\n").at(-1)!;
  if (!/^[0-9a-f-]{36}$/.test(session)) throw new Error("synthetic_private_intake_missing");
  const artifactRow = randomUUID(), taskRun = randomUUID();
  const workbook = await institutionalWorkbookFor(source, f.actorId);
  const bytes = await renderApprovedInstitutionalFinancialWorkbook(workbook, "pt");
  if (!bytes) throw new Error("synthetic_workbook_not_reproducible");
  const sha = digest(bytes), path = `${f.organizationId}/${f.workId}/materials/${sha}.xlsx`;
  // The operator key exists only in the disposable CLI status, never the app or its environment.
  const local = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], {cwd: join(__dirname, "../../.."), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]})) as Record<string, string>;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!local.SERVICE_ROLE_KEY || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) throw new Error("local_storage_fixture_required");
  const operator = createClient(url, local.SERVICE_ROLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
  const write = async (content: Uint8Array, upsert: boolean) => {
    const result = await operator.storage.from("case-artifacts").upload(path, content, {upsert, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    expect(result.error?.name ?? null).toBeNull();
  };
  await write(bytes, false);
  try {
    sql(`begin;select set_config('request.jwt.claim.sub','${f.actorId}',true);select set_config('request.headers','{"x-offroad-workspace":"${f.organizationId}"}',true);
      insert into private.integration_preview_grants(organization_id,note,granted_by,mode) values('${f.organizationId}','Synthetic stored download only','local-e2e','deterministic');
      insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,byte_size,sha256,sha256_verified_at,created_by,processing_status)
      values('${source}','${f.organizationId}','${session}','${f.organizationId}/${session}/synthetic.txt','Synthetic download evidence.txt','text/plain',1,repeat('a',64),now(),'${f.actorId}','ready');
      insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by) values('${run}','${f.organizationId}','${session}',1,'manual','succeeded','synthetic-download-only','${f.actorId}');
      insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload) values('${job}','${f.organizationId}','${session}','${run}','agent_operation_brief','succeeded','{}');
      insert into private.capital_project_material_upload_grants(worker_account_id,organization_id,capital_project_id,processing_job_id,object_path,content_sha256,byte_length,format,mime_type,state,storage_etag,expires_at,stored_at)
      values('${f.actorId}','${f.organizationId}','${f.workId}','${job}',${literal(path)},'${sha}',${bytes.byteLength},'xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','stored','synthetic-download',now()+interval '1 hour',now());commit;`);
    const rights = sql(`select id from private.source_rights_versions where source_version_id='${source}' order by revision desc limit 1;`);
    expect(rights).toMatch(/^[0-9a-f-]{36}$/);
    const manifest = {schemaVersion: "artifact-manifest.2026.09.26-v1", kind: "workbook", audience: "internal", format: "xlsx", bytes: {sha256: sha, byteLength: bytes.byteLength, storage: {bucket: "case-artifacts", path}}, method: null, execution: null, inputSnapshot: null, institutionalResult: null, sources: [{sourceVersionId: source, rightsVersionId: rights}], claims: [], traces: [], template: null, provenance: {producer: "synthetic-stored-download", jobId: null, taskRunId: null, messageId: null, capability: null}, legacy: null};
    const created = JSON.parse(sql(asRegimeOwner(f, `select public.create_artifact_revision_v1('${f.workId}','workbook','integration-preview:workbook','internal',${literal(JSON.stringify(manifest))}::jsonb,'[{"blockKey":"explanation","kind":"paragraph","content":{"text":"Synthetic stored workbook for the download boundary."},"claims":[]}]','[]','${sha}',${bytes.byteLength});`)).split("\n").at(-1)!) as {revision_id: string; manifest_fingerprint: string};
    const contract = buildDecisionArtifactContract({schemaVersion: "2026.09.07-v1", caseId: f.workId, snapshotFingerprint: "c".repeat(64), asOf: "2026-06-30", status: "draft", release: {state: "internal_only", recipientIds: []}, sources: [{id: source, title: "Synthetic download evidence", classification: "synthetic", asOf: "2026-06-30", locator: "synthetic fixture"}], assumptions: [], gaps: [], claims: [{id: "synthetic-size", label: "Synthetic file size", value: bytes.byteLength, unit: "bytes", evidenceState: "observed_private", object: {id: source, type: "document", fingerprint: sha, path: "byteLength"}, sourceIds: [source], assumptionIds: [], gapIds: []}], views: [{surface: "workbook", artifactId: "synthetic-workbook", artifactKind: "xlsx", artifactFingerprint: sha, blocks: [{id: "synthetic-file", kind: "metric", title: "Synthetic stored file", claimIds: ["synthetic-size"], sourceIds: [], assumptionIds: [], gapIds: []}]}], identityRequirements: []});
    sql(`insert into public.capital_project_task_runs(id,organization_id,capital_project_id,plan_id,plan_task_id,attempt_no,status,trigger_event)
      select '${taskRun}',t.organization_id,t.capital_project_id,t.plan_id,t.id,1,'queued','{"kind":"synthetic-download-fixture"}' from public.capital_project_plan_tasks t where t.capital_project_id='${f.workId}' order by t.id limit 1;
      insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,input_fingerprint,artifact_fingerprint,content,processing_job_id,created_by_kind,created_by)
      select '${artifactRow}',r.organization_id,r.capital_project_id,r.plan_id,r.id,'preview_decision_contract','2026.09.07-v1',1,'draft',repeat('c',64),'${contract.contractFingerprint}',${literal(JSON.stringify({contract}))}::jsonb,'${job}','user','${f.actorId}' from public.capital_project_task_runs r where r.id='${taskRun}';`);
    const route = `/pt-BR/app/projects/${f.workId}/preview/material?workspace=${f.organizationId}&format=xlsx&revision=${created.revision_id}`;
    const contextResponse = await page.request.get(`${route}&exportContext=1`);expect(contextResponse.status()).toBe(200);
    const context = await contextResponse.json();expect(context.revisionId).toBe(created.revision_id);
    const queued = await page.request.post(`/pt-BR/app/artifacts/${context.artifactId}/exports?workspace=${f.organizationId}`, {headers: {origin: new URL(page.url()).origin}, data: {revisionId: created.revision_id, format: "xlsx", variant: "default", commandId: randomUUID()}});expect(queued.status(), await queued.text()).toBe(202);
    const taskId = (await queued.json()).result.taskId;
    let receiptId: string | null = null;
    await expect.poll(async () => {const task = await page.request.get(`/pt-BR/app/artifacts/${context.artifactId}/exports?workspace=${f.organizationId}&taskId=${taskId}`);expect(task.status()).toBe(200);const state = (await task.json()).task;expect(state.status).not.toBe("failed");receiptId = state.receiptId;return receiptId;}, {timeout: 90000}).not.toBeNull();
    const receipt = JSON.parse(sql(asRegimeOwner(f, `select public.read_artifact_export_receipt_v1('${receiptId}');`)).split("\n").at(-1)!);
    const first = await page.request.get(route);expect(first.status(), await first.text()).toBe(200);
    const emitted = await first.body();expect(digest(emitted)).toBe(receipt.sha256);expect(emitted.length).toBe(receipt.byteLength);expect(digest(emitted)).not.toBe(sha);
    const snapshot = await readRoundtripSnapshot(emitted, "xlsx");expect(snapshot.manifest?.revisionId).toBe(created.revision_id);
    expect(first.headers()["x-artifact-sha256"]).toBe(receipt.sha256);expect(first.headers()["cache-control"]).toContain("no-store");
    const outputRoute = `/pt-BR/app/artifacts/${context.artifactId}/exports?workspace=${f.organizationId}&receiptId=${receiptId}`;
    const replaceOutput = async (content: Uint8Array, upsert: boolean) => {const result = await operator.storage.from(receipt.storage.bucket).upload(receipt.storage.path, content, {upsert, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});expect(result.error).toBeNull();};
    await replaceOutput(new Uint8Array(emitted.length).fill(1), true);
    const corruptOutput = await page.request.get(outputRoute);expect(corruptOutput.status()).toBe(409);expect((await corruptOutput.json()).error).toBe("storageMismatch");
    await replaceOutput(emitted, true);expect((await page.request.get(outputRoute)).status()).toBe(200);
    // Stage22 pins the receipt to the durable identity ledger, allowing physical erasure.
    // Storage metadata is disposable; it must no longer be the receipt's retention barrier.
    expect(sql(`select count(*) from private.artifact_export_object_identities i join public.artifact_export_receipts r on (r.organization_id,r.storage_object_id)=(i.organization_id,i.id) where r.id='${receipt.id}';`)).toBe("1");
    expect((await page.request.get(outputRoute)).status()).toBe(200);
    // Move the local operator's physical object while preserving its identity: the receipt's
    // original path now has no bytes. This exercises a missing output with durable audit identity.
    const displacedPath = `${receipt.storage.path}.synthetic-missing`;
    const movedOutput = await operator.storage.from(receipt.storage.bucket).move(receipt.storage.path, displacedPath);expect(movedOutput.error).toBeNull();
    try {
      const absentOutput = await page.request.get(outputRoute);expect(absentOutput.status()).toBe(409);expect((await absentOutput.json()).error).toBe("storageMissing");
      expect(absentOutput.headers()["x-artifact-sha256"]).toBeUndefined();
    } finally {
      const restored = await operator.storage.from(receipt.storage.bucket).move(displacedPath, receipt.storage.path);expect(restored.error).toBeNull();
    }
    expect((await page.request.get(outputRoute)).status()).toBe(200);
    const removed = await operator.storage.from("case-artifacts").remove([path]);expect(removed.error).toBeNull();
    const missing = await page.request.get(route);expect(missing.status()).toBe(409);expect(await missing.text()).toBe(messages.ArtifactDownload.preview.storageMissing);
    await write(new TextEncoder().encode("Synthetic altered object"), false);
    const altered = await page.request.get(route);expect(altered.status()).toBe(409);expect(await altered.text()).toBe(messages.ArtifactDownload.preview.storageMismatch);
    await write(bytes, true);
    expect((await page.request.get(route)).status()).toBe(200);
    sql(asRegimeOwner(f, `select public.set_source_rights_v1('${source}',1,array['process','store','derive'],array['analysis'],null,null,'${randomUUID()}',repeat('d',64));`));
    // Revoke only this source. The project grant is still present, so this cannot pass from a
    // project-level denial masking a broken derived-source check.
    const projectAccess = sql(asRegimeOwner(f, `select private.can_access_capital_project('${f.organizationId}','${f.workId}');`)).split("\n").at(-1);
    expect(projectAccess).toBe("t");
    const revoked = await page.request.get(route);expect(revoked.status()).toBe(409);expect(await revoked.text()).toBe(messages.ArtifactDownload.sourceRestricted);
    expect(revoked.headers()["x-artifact-content-sha256"]).toBeUndefined();
    const revokedExport = await page.request.get(outputRoute);expect(revokedExport.status()).toBe(403);expect(revokedExport.headers()["x-artifact-sha256"]).toBeUndefined();
    expect(sql(`select count(*) from public.processing_jobs where work_id='${f.workId}' and status in ('queued','leased');`)).toBe("0");
  } finally {
    // Receipt objects are immutable audit fixtures; the disposable local stack removes them.
    const cleanup = await operator.storage.from("case-artifacts").remove([path]);expect(cleanup.error).toBeNull();
  }
});
