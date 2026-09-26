import {execFileSync} from "node:child_process";
import {createHash, randomBytes} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";

import {caseExportVersion} from "@offroad/case-export";
import {expect, test, type APIResponse, type Page} from "@playwright/test";

import messages from "../messages/pt-BR.json";
import {institutionalWorkbookFor, syntheticGovernedMaterials} from "./support/governed-materials";

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
/** The status, with the body the person reads when nothing was served, so a failure says why. */
const outcome = async (response: APIResponse) => response.status() >= 400 ? `${response.status()} ${await response.text()}` : String(response.status());

// Stage 19, increment 3: the governed materials and the model are served from one exact artifact
// revision through the authorized reader. The package is seeded as the rows a confirmed case holds
// (structure, approved production plan, material depending on it); the material row projects its
// legacy revision, the routes serve it with the artifact headers and stable bytes, the model workbook
// replays with the approved hash, and a revision for an external audience waits for its approval.
test("governed materials and model come from one exact revision, and an external revision waits for approval", async ({page}, testInfo) => {
  const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  for (const value of [databaseUrl, supabaseUrl, process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"])
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)) throw new Error("Governed materials E2E requires local synthetic services.");
  const prefix = randomBytes(4).toString("hex");
  const id = (suffix: string) => `${prefix}-0000-4000-9000-${suffix.padStart(12, "0")}`;
  const userId = `${prefix}-0000-4000-8000-000000000001`;
  const email = `${prefix}-materials@example.invalid`, password = "Synthetic-Materials!2026";
  const [projectId, sessionId, documentId] = [id("2"), id("3"), id("4")];
  const workbook = await institutionalWorkbookFor(documentId, userId);
  const payload = {materials: syntheticGovernedMaterials, financialModel: workbook, materialTruth: {}, dataRoom: {}};
  const seed = readFileSync(join(__dirname, "support/governed-materials-local.sql"), "utf8")
    .replaceAll("ab1e0000", prefix).replaceAll("ab1e-materials@example.invalid", email).replace("__PAYLOAD__", JSON.stringify(payload));
  execFileSync("psql", [databaseUrl, "-q", "-v", "ON_ERROR_STOP=1"], {input: seed, stdio: ["pipe", "pipe", "pipe"]});
  const materialFingerprint = sha256(`material:${sessionId}`);
  const psql = (sql: string) => execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], {encoding: "utf8"}).trim();
  // The projection of increment 2b wrote the head revision in the same transaction as the material row.
  const legacyRevision = psql(`select a.head_revision_id from public.artifacts a where a.work_id='${projectId}' and a.kind='material' and a.subject='materials:${sessionId}'`);
  expect(legacyRevision).toMatch(/^[0-9a-f-]{36}$/);

  async function login(target: Page) {
    await target.goto("/pt-BR/login");
    await target.locator('input[name="email"]').fill(email);
    await target.locator('input[name="password"]').fill(password);
    await target.locator('form button[type="submit"]').click();
    await expect(target).not.toHaveURL(/\/login/);
  }
  await login(page);

  const base = `/pt-BR/app/materials/${sessionId}`;
  const expectRevisionHeaders = (response: APIResponse, revision: string) => {
    const headers = response.headers();
    expect(headers["x-artifact-revision"]).toBe(revision);
    expect(headers["x-artifact-manifest-fingerprint"]).toMatch(/^[a-f0-9]{64}$/);
    expect(headers["x-artifact-release"]).toBe("internal");
    expect(headers["x-artifact-freshness"]).toBe("current");
    // A legacy row pins no bytes: the route says so and makes no hash claim.
    expect(headers["x-artifact-legacy"]).toBe("unpinned");
    expect(headers["x-artifact-bytes"]).toBe("unpinned");
    expect(headers["x-artifact-content-sha256"]).toBeUndefined();
    expect(headers["cache-control"]).toContain("no-store");
  };

  // Three formats of one material, twice each: the same revision is the same file.
  const files: Record<string, Buffer> = {};
  for (const [format, magic] of [["docx", "PK"], ["pdf", "%PDF-"], ["pptx", "PK"]] as const) {
    const first = await page.request.get(`${base}/term_sheet/${format}`);
    const second = await page.request.get(`${base}/term_sheet/${format}`);
    expect(await outcome(first), format).toBe("200");
    expect(await outcome(second), format).toBe("200");
    expectRevisionHeaders(first, legacyRevision);
    const bytes = await first.body();
    expect(bytes.subarray(0, magic.length).toString()).toBe(magic);
    expect(sha256(await second.body())).toBe(sha256(bytes));
    files[format] = bytes;
  }
  // The exact revision by its id is the same file; a revision that is not this route's is not found.
  const exact = await page.request.get(`${base}/term_sheet/docx?revision=${legacyRevision}`);
  expect(await outcome(exact)).toBe("200");
  expect(sha256(await exact.body())).toBe(sha256(files.docx!));
  expect((await page.request.get(`${base}/term_sheet/docx?revision=${id("999")}`)).status()).toBe(404);
  expect((await page.request.get(`${base}/data_room_index/docx`)).status()).toBe(409);

  // The printable page of the same revision, with its appendix taken from the revision.
  const printable = await page.goto(`${base}/term_sheet`, {waitUntil: "domcontentloaded"});
  expect(printable?.status()).toBe(200);
  expect(printable?.headers()["x-artifact-revision"]).toBe(legacyRevision);
  await expect(page.locator("h1")).toHaveText("Termos indicativos sintéticos");
  await expect(page.locator(".sources")).toContainText("historical_financials.2026.revenue · 2026-12-31");
  await expect(page.getByText(messages.ArtifactDownload.materials.sourcesNotRecorded)).toBeVisible();
  const printablePath = testInfo.outputPath("governed-material-term-sheet.png");
  await page.screenshot({path: printablePath, fullPage: true});
  await testInfo.attach("governed-material-term-sheet", {path: printablePath, contentType: "image/png"});

  // The model workbook replays with the approved hash of each locale.
  for (const [locale, lang] of [["pt-BR", "pt"], ["en-US", "en"]] as const) {
    const model = await page.request.get(`/${locale}/app/model/${sessionId}`);
    expect(await outcome(model), locale).toBe("200");
    expectRevisionHeaders(model, legacyRevision);
    expect(sha256(await model.body())).toBe(workbook.workbooks[lang].sha256);
  }

  // A revision for an external audience, pinning the bytes of the Word file, written by the person
  // through the command. The database evaluates its release: blocked until an approval names it.
  const auth = await page.request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {headers: {apikey: key}, data: {email, password}});
  expect(auth.ok()).toBeTruthy();
  const token = (await auth.json()).access_token as string;
  const docx = files.docx!;
  const manifest = {
    schemaVersion: "artifact-manifest.2026.09.26-v1", kind: "material", audience: "external", format: "docx",
    bytes: {sha256: sha256(docx), byteLength: docx.byteLength, rendered: {renderer: "case-export.material-docx", rendererVersion: caseExportVersion,
      deterministicInputs: {materialFingerprint, materialKind: "term_sheet", locale: "pt", issuedOn: "2026-09-20"}}},
    method: null, execution: null, inputSnapshot: null, institutionalResult: null, sources: [],
    claims: [{blockKey: "term_sheet", claimIds: ["term-sheet-indicative-amount"]}], traces: [], template: null,
    provenance: {producer: "e2e:governed-materials", jobId: null, taskRunId: null, messageId: null, capability: null}, legacy: null,
  };
  const created = await page.request.post(`${supabaseUrl}/rest/v1/rpc/create_artifact_revision_v1`, {
    headers: {apikey: key, authorization: `Bearer ${token}`, "content-type": "application/json"},
    data: {
      p_work: projectId, p_kind: "material", p_subject: `materials:${sessionId}`, p_audience: "external", p_manifest: manifest,
      p_blocks: [{blockKey: "term_sheet", kind: "section", content: {title: "Termos indicativos sintéticos"},
        claims: [{claimId: "term-sheet-indicative-amount", kind: "fact", value: "100", unit: "BRL", period: "2026", supportIds: ["historical_financials.2026.revenue (2026-12-31)"]}]}],
      p_links: [], p_content_sha256: sha256(docx), p_byte_length: docx.byteLength,
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const external = (await created.json()).revision_id as string;
  expect(external).toMatch(/^[0-9a-f-]{36}$/);

  const blocked = await page.request.get(`${base}/term_sheet/docx?revision=${external}`);
  expect(blocked.status()).toBe(409);
  expect(await blocked.text()).toBe(messages.ArtifactDownload.releaseBlocked);
  // It is also the head now, so no format of the package is served before the approval.
  expect((await page.request.get(`${base}/term_sheet/pdf`)).status()).toBe(409);
  await page.goto(`${base}/term_sheet/docx?revision=${external}`, {waitUntil: "domcontentloaded"}).catch(() => null);
  const blockedPath = testInfo.outputPath("external-revision-before-approval.png");
  await page.screenshot({path: blockedPath});
  await testInfo.attach("external-revision-before-approval", {path: blockedPath, contentType: "image/png"});

  // The approval that exists today, shaped as the product records it: the company approves the
  // internal package, and the approval also names the exact bytes of this revision.
  psql(`insert into public.deal_state_objects(organization_id,intake_session_id,object_type,object_version,status,input_fingerprint,object_fingerprint,payload,dependencies,created_by,created_by_kind)
    values('${id("1")}','${sessionId}','package_review',1,'approved',repeat('4',64),encode(extensions.digest('package-review:${sessionId}','sha256'),'hex'),
    jsonb_build_object('schemaVersion','2026.08.29-v1','approval',jsonb_build_object('actorId','${userId}','approvedAt',now(),'scope','internal_material_package','artifactFingerprint','${materialFingerprint}')),
    jsonb_build_array(jsonb_build_object('objectType','production_plan','objectFingerprint',encode(extensions.digest('production-plan:${sessionId}','sha256'),'hex')),
      jsonb_build_object('objectType','material_artifact','objectFingerprint','${materialFingerprint}'),
      jsonb_build_object('objectType','material_artifact','objectFingerprint','${sha256(docx)}')),'${userId}','user')`);
  const released = await page.request.get(`${base}/term_sheet/docx?revision=${external}`);
  expect(await outcome(released)).toBe("200");
  expect(released.headers()["x-artifact-release"]).toBe("released");
  expect(released.headers()["x-artifact-content-sha256"]).toBe(sha256(docx));
  expect(released.headers()["x-artifact-legacy"]).toBeUndefined();
  expect(sha256(await released.body())).toBe(sha256(docx));
  // The legacy revision named by its id is no longer the head, and it is still the same file.
  const previous = await page.request.get(`${base}/term_sheet/docx?revision=${legacyRevision}`);
  expect(await outcome(previous)).toBe("200");
  expect(sha256(await previous.body())).toBe(sha256(docx));
});
