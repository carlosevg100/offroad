import {execFileSync} from "node:child_process";
import {createHash, randomBytes, randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";

import {requestArtifactExport} from "./support/roundtrip-download";
import {extractRoundtripManifest, readRoundtripSnapshot} from "@offroad/case-export/artifact-roundtrip";
import {startNativeMaterialRoundtripFixture} from "./support/native-material-roundtrip";
import {expect, test, type Page} from "@playwright/test";

import {institutionalWorkbookFor, syntheticGovernedMaterials} from "./support/governed-materials";

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

// Real prospective material production and human publication, with no historical approval replay.
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
  const [, sessionId, documentId] = [id("2"), id("3"), id("4")];
  const workbook = await institutionalWorkbookFor(documentId, userId);
  const payload = {materials: syntheticGovernedMaterials, financialModel: workbook, materialTruth: {}, dataRoom: {}};
  const seed = readFileSync(join(__dirname, "support/governed-materials-local.sql"), "utf8")
    .replaceAll("ab1e0000", prefix).replaceAll("ab1e-materials@example.invalid", email).replace("__PAYLOAD__", JSON.stringify(payload));
  execFileSync("psql", [databaseUrl, "-q", "-v", "ON_ERROR_STOP=1"], {input: seed, stdio: ["pipe", "pipe", "pipe"]});
  async function login(target: Page) {
    await target.goto("/pt-BR/login");
    await target.locator('input[name="email"]').fill(email);
    await target.locator('input[name="password"]').fill(password);
    await target.locator('form button[type="submit"]').click();
    await expect(target).not.toHaveURL(/\/login/);
  }
  await login(page);

  // Raw historical rows are diagnosis, not producer authority. They may select an identity,
  // but cannot turn into an export receipt or serve unreceipted bytes.
  const legacyRoute = `/pt-BR/app/materials/${sessionId}/term_sheet/docx`;
  const selected = await page.request.get(`${legacyRoute}?exportContext=1`);expect(selected.status()).toBe(200);
  const context = await selected.json();
  const denied = await page.request.post(`/pt-BR/app/artifacts/${context.artifactId}/exports`, {headers: {origin: new URL(page.url()).origin}, data: {revisionId: context.revisionId,format: "docx",variant: "term_sheet",commandId: randomUUID()}});
  expect(denied.status()).toBe(409);expect((await denied.json()).error).toBe("denied");
  expect((await page.request.get(legacyRoute)).status()).toBe(409);

  const native = await startNativeMaterialRoundtripFixture();
  try {
    await page.context().clearCookies();await page.goto("/pt-BR/login");await page.locator('input[name="email"]').fill(native.email);await page.locator('input[name="password"]').fill(native.password);await page.locator('form button[type="submit"]').click();await expect(page).not.toHaveURL(/\/login/);
    // The package exists only after the prospective SDK producer rendered, physically uploaded,
    // verified and committed it. Its real revision and source pins govern every new receipt.
    const files: Record<string, Buffer> = {};
    for (const [format,magic] of [["docx","PK"],["pdf","%PDF-"],["pptx","PK"]] as const) {
      const selection = {artifactId:native.artifactId,revisionId:native.materialRevisionId,locale:"pt-BR",format,variant:"term_sheet",workspace:native.organizationId};
      const first = await requestArtifactExport(page,selection), second = await requestArtifactExport(page,selection);
      const bytes = await first.body();expect(bytes.subarray(0,magic.length).toString()).toBe(magic);expect(sha256(await second.body())).toBe(sha256(bytes));files[format]=bytes;
      // PDF is a final delivery, not a supported reimport format. Its receipt/hash/revision
      // were verified above; only editable Office files enter the roundtrip parser.
      if(format!=="pdf"){const snapshot=await readRoundtripSnapshot(bytes,format);expect(snapshot.manifest?.revisionId).toBe(native.materialRevisionId);}else{const extracted=await extractRoundtripManifest(bytes,"pdf");expect(extracted.issue).toBeNull();expect(extracted.manifest?.revisionId).toBe(native.materialRevisionId);expect(extracted.manifest?.artifactId).toBe(native.artifactId);}
    }
    const model = await requestArtifactExport(page,{artifactId:native.artifactId,revisionId:native.materialRevisionId,locale:"pt-BR",format:"xlsx",variant:"financial_model",workspace:native.organizationId});
    expect((await model.body()).subarray(0,2).toString()).toBe("PK");expect((await readRoundtripSnapshot(await model.body(),"xlsx")).manifest?.revisionId).toBe(native.materialRevisionId);

    // An informational external revision uses the actual human publication command. No financial
    // approval is invented by inserting a historical package_review row.
    const auth = await page.request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {headers:{apikey:key},data:{email:native.email,password:native.password}});expect(auth.ok()).toBeTruthy();const token=(await auth.json()).access_token as string;
    const rpc = async (name: string,data: unknown) => page.request.post(`${supabaseUrl}/rest/v1/rpc/${name}`,{headers:{apikey:key,authorization:`Bearer ${token}`,"content-type":"application/json","x-offroad-workspace":native.organizationId},data});
    const manifest = {schemaVersion:"artifact-manifest.2026.09.26-v1",kind:"answer",audience:"external",format:"json",bytes:null,method:null,execution:null,inputSnapshot:null,institutionalResult:null,sources:[],claims:[],traces:[],template:null,provenance:{producer:"synthetic-human-publication",jobId:null,taskRunId:null,messageId:null,capability:null},legacy:null};
    const created = await rpc("create_artifact_revision_v1",{p_work:native.projectId,p_kind:"answer",p_subject:"Synthetic external informational explanation",p_audience:"external",p_manifest:manifest,p_blocks:[{blockKey:"explanation",kind:"paragraph",content:{text:"Synthetic informational explanation for an external reader."},claims:[]}],p_links:[],p_content_sha256:null,p_byte_length:null});expect(created.ok(),await created.text()).toBeTruthy();const external=await created.json();
    const externalArtifact = await rpc("read_artifact_revision_v1",{p_revision_id:external.revision_id});expect(externalArtifact.ok()).toBeTruthy();const withheld=await externalArtifact.json();expect(withheld.release).toBe("blocked");expect(withheld.revision.manifest).toBeNull();
    const exportUrl=`/pt-BR/app/artifacts/${withheld.artifact.id}/exports?workspace=${native.organizationId}`;
    const blocked = await page.request.post(exportUrl,{headers:{origin:new URL(page.url()).origin},data:{revisionId:external.revision_id,format:"docx",variant:"default",commandId:randomUUID()}});expect(blocked.status()).toBe(403);
    const approved = await rpc("review_artifact_revision_v1",{p_revision_id:external.revision_id,p_expected_fingerprint:external.manifest_fingerprint,p_act:"approve",p_block_id:null,p_note:"Synthetic exact informational publication",p_self_approval_declared:true,p_command_id:randomUUID(),p_basis_review_id:null});expect(approved.ok(),await approved.text()).toBeTruthy();
    const released=await requestArtifactExport(page,{artifactId:withheld.artifact.id,revisionId:external.revision_id,locale:"pt-BR",format:"docx",variant:"default",workspace:native.organizationId});expect((await readRoundtripSnapshot(await released.body(),"docx")).manifest?.revisionId).toBe(external.revision_id);
    expect(sha256(files.docx!)).toBe(sha256(await (await requestArtifactExport(page,{artifactId:native.artifactId,revisionId:native.materialRevisionId,locale:"pt-BR",format:"docx",variant:"term_sheet",workspace:native.organizationId})).body()));
    await testInfo.attach("governed-native-material-revisions",{body:JSON.stringify({nativeRevision:native.materialRevisionId,externalRevision:external.revision_id}),contentType:"application/json"});
  } finally {await native.stop();}
});
