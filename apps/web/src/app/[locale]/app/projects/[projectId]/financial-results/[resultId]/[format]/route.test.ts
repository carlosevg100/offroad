import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {inflateSync} from "node:zlib";
import {governedWorkbookRendererVersion, institutionalWorkbookArtifactSchema} from "@offroad/financial-model";
import * as XLSX from "xlsx";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({workspace: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/resource-download", () => ({resourceStillReadable: async () => true}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: mocks.workspace}));

import {institutionalResultMaterial} from "@/lib/advisor/institutional-result-material";
import {artifactReadFixture, artifactRpc, type ReadFixtureInput} from "@/lib/artifacts/artifact-read.test-support";
import {legacyGET} from "@/lib/artifacts/legacy-routes/financial-results.test-support";
import {GET} from "./route";

// Committed fixture is emitted by the real reviewed-source/configuration/calculation producer.
const sql = readFileSync(resolve(process.cwd(), "../../supabase/tests/support/institutional_setup_fixture.sql"), "utf8");
const raw = sql.match(/select set_config\('test\.setup_artifact', '((?:[^']|'')*)', true\);/)?.[1];
if (!raw) throw new Error("Missing real institutional artifact fixture");
const artifact = institutionalWorkbookArtifactSchema.parse(JSON.parse(raw.replaceAll("''", "'")));
const projectId = "10000000-0000-4000-8000-000000000001";
const resultId = "20000000-0000-4000-8000-000000000001";
const olderResultId = "20000000-0000-4000-8000-000000000002";
const revisionId = "70000000-0000-4000-8000-000000000001";
const scenario = artifact.institutional.scenarios[0]!;
const latest = {id: resultId, status: "completed", configurationId: scenario.configurationId, configurationFingerprint: scenario.configurationFingerprint,
  sourceManifestFingerprint: artifact.institutional.sourceManifestFingerprint, artifact, blockers: [], createdAt: "2026-09-10T04:00:00Z"};
/** The projection of a completed institutional result: kind model_result, subject institutional-workbook, the result named in the manifest. */
const resultRevision = (overrides: Partial<ReadFixtureInput> = {}) => artifactReadFixture({
  workId: projectId, kind: "model_result", subject: "institutional-workbook", revisionId, format: "xlsx",
  institutionalResult: {id: resultId, configurationFingerprint: scenario.configurationFingerprint},
  legacy: {table: "institutional_model_results", id: resultId, fingerprint: artifact.fingerprint}, createdAt: "2026-09-10T04:05:00+00:00",
  ...overrides,
});
let institutional: {data: unknown; error: unknown};
let reads: ReturnType<typeof artifactReadFixture>[];
const rpc = vi.fn();
const request = (format = "xlsx", locale = "pt-BR", id = resultId, query = "") =>
  GET(new Request(`https://offroad.test/financial-result${query}`), {params: Promise.resolve({locale, projectId, resultId: id, format})});
const legacyRequest = (format = "xlsx", locale = "pt-BR", id = resultId) =>
  legacyGET(new Request("https://offroad.test/financial-result"), {params: Promise.resolve({locale, projectId, resultId: id, format})});
function textFromOutput(bytes: Buffer, format: string) {
  if (format === "pdf") {
    return [...bytes.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap(match => {
      const stream = inflateSync(Buffer.from(match[1]!, "latin1")).toString();
      return [...stream.matchAll(/<([0-9A-Fa-f]+)>/g)].map(part => Buffer.from(part[1]!, "hex").toString("latin1"));
    }).join("\n");
  }
  const archive = XLSX.CFB.read(bytes, {type: "buffer"});
  return (archive.FileIndex as {name: string; content: Uint8Array}[]).filter(file => /\.xml$/.test(file.name)).map(file => Buffer.from(file.content as Uint8Array).toString()).join("\n");
}
beforeEach(() => {
  institutional = {data: {projectId, latest: structuredClone(latest)}, error: null};
  reads = [resultRevision()];
  rpc.mockImplementation((name: string, args: Record<string, unknown>) => artifactRpc(reads, async (other) => (
    other === "read_institutional_model_results_v1" ? structuredClone(institutional) : {data: null, error: {code: "42883", message: "not in this test"}}
  ))(name, args));
  mocks.workspace.mockResolvedValue({supabase: {rpc}, organization: {id: "tenant-authorized-by-workspace"}});
});
afterEach(() => {vi.useRealTimers(); vi.resetAllMocks();});

describe("approved institutional result downloads", () => {
  it.each(["pt-BR", "en-US"].flatMap(locale =>
    ["xlsx", "docx", "pptx", "pdf"].map(format => ({locale, format})),
  ))("replays $format and preserves reviewed evidence in $locale", async ({locale, format}) => {
    vi.useFakeTimers({toFake: ["Date"]});
    vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
    const monday = await request(format, locale);
    expect(monday.status, `${format} must replay the real persisted artifact`).toBe(200);
    const first = Buffer.from(await monday.arrayBuffer());
    vi.setSystemTime(new Date("2026-09-18T12:00:00Z"));
    const friday = await request(format, locale);
    expect(friday.status).toBe(200);
    expect(first.equals(Buffer.from(await friday.arrayBuffer()))).toBe(true);
    expect(friday.headers.get("cache-control")).toBe("private, no-store");
    expect(friday.headers.get("content-disposition")).toContain(`2026-09-10.${format}`);
    expect(friday.headers.get("x-content-type-options")).toBe("nosniff");
    expect(friday.headers.get("x-artifact-revision")).toBe(revisionId);
    expect(friday.headers.get("x-artifact-legacy")).toBe("unpinned");
    expect(friday.headers.get("x-artifact-release")).toBe("internal");
    const content = textFromOutput(first, format).replace(/\s+/g, " ");
    expect(content).toContain("EBITDA");
    expect(content).toContain(scenario.sourceBindings[0]!.metadataEvidence.rationale);
    expect(content).toContain(scenario.sourceBindings[0]!.sourceDocument);
    expect(content).toContain(scenario.input.assumptionBook.assumptions[0]!.rationale);
    if (process.env.OFFROAD_RESULT_QA_DIR) {
      mkdirSync(process.env.OFFROAD_RESULT_QA_DIR, {recursive: true});
      writeFileSync(`${process.env.OFFROAD_RESULT_QA_DIR}/result-${locale === "en-US" ? "en" : "pt"}.${format}`, first);
    }
    expect(rpc).toHaveBeenCalledWith("read_institutional_model_results_v1", {p_project_id: projectId});
    expect(rpc).toHaveBeenCalledWith("read_artifact_head_v1", {p_work_id: projectId, p_kind: "model_result", p_subject: "institutional-workbook"});
  });
  it("serves the bound native revision and rejects the historical revision parameter",async()=>{
    const nativeId="70000000-0000-4000-8000-000000000003";
    institutional={data:{projectId,latest:{...latest,nativeRevisionId:nativeId}},error:null};
    reads.push(resultRevision({revisionId:nativeId,subject:`institutional-native:${resultId}`,legacy:undefined,release:"released"}));
    const response=await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-artifact-revision")).toBe(nativeId);
    expect(response.headers.get("x-artifact-release")).toBe("released");
    expect((await request("xlsx","pt-BR",resultId,`?revision=${revisionId}`)).status).toBe(404);
    expect(rpc).not.toHaveBeenCalledWith("read_artifact_head_v1",expect.anything());
  });
  it("does not fall back to the historical representation after native denial",async()=>{
    const nativeId="70000000-0000-4000-8000-000000000003";
    institutional={data:{projectId,latest:{...latest,nativeRevisionId:nativeId}},error:null};
    reads.push(resultRevision({revisionId:nativeId,subject:`institutional-native:${resultId}`,legacy:undefined,release:"blocked"}));
    expect((await request()).status).toBe(409);
    expect(rpc).not.toHaveBeenCalledWith("read_artifact_revision_v1",{p_revision_id:revisionId});
  });
  it.each(["stale", "queued", "blocked"])("refuses %s even if an old artifact remains in the database response", async status => {
    institutional = {data: {projectId, latest: {...latest, status}}, error: null};
    for (const format of ["xlsx", "docx", "pptx", "pdf"]) expect((await request(format)).status).toBe(409);
  });
  it("refuses another project, wrong result ID, revoked access and unknown formats", async () => {
    expect((await request("xlsx", "pt-BR", "20000000-0000-4000-8000-000000000999")).status).toBe(409);
    institutional = {data: {projectId: "10000000-0000-4000-8000-000000000999", latest}, error: null};
    expect((await request()).status).toBe(409);
    institutional = {data: {projectId, latest}, error: {code: "42501"}};
    expect((await request()).status).toBe(409);
    expect((await request("html")).status).toBe(404);
  });
  it.each(["fingerprint", "output", "activeScenario", "receipt", "manifest"])("refuses a corrupted %s binding for every output format", async corruption => {
    const changed = structuredClone(latest);
    if (corruption === "fingerprint") changed.artifact.fingerprint = "b".repeat(64);
    if (corruption === "output") changed.artifact.institutional.scenarios[0]!.outputFingerprint = "b".repeat(64);
    if (corruption === "activeScenario") changed.artifact.institutional.activeScenarioId = "30000000-0000-4000-8000-000000000999";
    if (corruption === "receipt") changed.artifact.workbooks.pt.sha256 = "b".repeat(64);
    if (corruption === "manifest") changed.sourceManifestFingerprint = "b".repeat(64);
    institutional = {data: {projectId, latest: changed}, error: null};
    for (const format of ["xlsx", "docx", "pptx", "pdf"]) expect((await request(format)).status).toBe(409);
  });
  it("binds appendices to every exact approved assumption and reviewed source without modifying the artifact", () => {
    const before = JSON.stringify(artifact);
    const material = institutionalResultMaterial(artifact, "en");
    expect(material.artifactFingerprint).toBe(artifact.fingerprint);
    const content = JSON.stringify(material.blocks);
    for (const value of scenario.input.assumptionBook.assumptions) {
      expect(content).toContain(value.label.en);expect(content).toContain(value.rationale);
      for (const exact of Object.values(value.values)) expect(content).toContain(exact);
    }
    for (const source of scenario.sourceBindings) {expect(content).toContain(source.hash);expect(content).toContain(source.reviewedBy);expect(content).toContain(source.metadataEvidence.rationale);}
    expect(content).toContain("Unrestricted cash");
    expect(content).not.toContain("openingBalanceSheet.unrestrictedCash");
    for (const line of scenario.lineage) expect(content).toContain(line.value);
    expect(JSON.stringify(artifact)).toBe(before);
  });
});

describe("the exact revision of the result", () => {
  it("serves the revision named by ?revision= and refuses what is not this route's revision", async () => {
    const older = resultRevision({revisionId: "70000000-0000-4000-8000-000000000002", isHead: false, revisionNo: 1,
      institutionalResult: {id: olderResultId, configurationFingerprint: scenario.configurationFingerprint},
      legacy: {table: "institutional_model_results", id: olderResultId, fingerprint: "c".repeat(64)}});
    const otherSubject = artifactReadFixture({workId: projectId, kind: "work_product", subject: "meeting_brief", revisionId: "70000000-0000-4000-8000-000000000003",
      legacy: {table: "capital_project_artifacts", id: "30000000-0000-4000-8000-000000000003", fingerprint: "d".repeat(64)}});
    const otherWork = resultRevision({revisionId: "70000000-0000-4000-8000-000000000004", workId: "10000000-0000-4000-8000-000000000009", isHead: false});
    reads = [resultRevision(), older, otherSubject, otherWork];
    expect((await request("xlsx", "pt-BR", resultId, `?revision=${revisionId}`)).status).toBe(200);
    // An older version stays identified: the route no longer serves the current result in its name.
    const replaced = await request("xlsx", "pt-BR", olderResultId, `?revision=${older.revision.id}`);
    expect(replaced.status).toBe(409);
    expect(await replaced.text()).toBe("Esta versão não é mais a vigente, então o arquivo não foi gerado. Abra a versão vigente e baixe a partir dela.");
    expect((await request("xlsx", "pt-BR", resultId, `?revision=${older.revision.id}`)).status).toBe(409);
    expect((await request("xlsx", "pt-BR", resultId, `?revision=${otherSubject.revision.id}`)).status).toBe(404);
    expect((await request("xlsx", "pt-BR", resultId, `?revision=${otherWork.revision.id}`)).status).toBe(404);
    expect((await request("xlsx", "pt-BR", resultId, "?revision=70000000-0000-4000-8000-000000000999")).status).toBe(404);
    expect((await request("xlsx", "pt-BR", resultId, "?revision=not-a-uuid")).status).toBe(404);
  });
  it("refuses an external revision until the database releases it, with text the person can read", async () => {
    reads = [resultRevision({legacy: undefined, audience: "external", release: "blocked"})];
    const blocked = await request("docx");
    expect(blocked.status).toBe(409);
    expect(await blocked.text()).toContain("ainda não foi aprovada");
    reads = [resultRevision({legacy: undefined, audience: "external", release: "released"})];
    const released = await request("docx");
    expect(released.status).toBe(200);
    expect(released.headers.get("x-artifact-release")).toBe("released");
    expect(released.headers.get("x-artifact-legacy")).toBeNull();
  });
  it("verifies the workbook bytes the revision pins and claims the hash only for that rendering", async () => {
    const pinned = (sha256: string) => resultRevision({legacy: undefined, rendered: {sha256, byteLength: artifact.workbooks.pt.byteSize, renderer: artifact.version,
      rendererVersion: governedWorkbookRendererVersion, deterministicInputs: {locale: "pt", artifactFingerprint: artifact.fingerprint, sourceManifestFingerprint: artifact.institutional.sourceManifestFingerprint}}});
    reads = [pinned(artifact.workbooks.pt.sha256)];
    const verified = await request("xlsx");
    expect(verified.status).toBe(200);
    expect(verified.headers.get("x-artifact-content-sha256")).toBe(artifact.workbooks.pt.sha256);
    const english = await request("xlsx", "en-US");
    expect(english.status).toBe(200);
    expect(english.headers.get("x-artifact-bytes")).toBe("unpinned");
    expect((await request("docx")).headers.get("x-artifact-bytes")).toBe("unpinned");
    reads = [pinned("e".repeat(64))];
    expect((await request("xlsx")).status).toBe(409);
    reads = [resultRevision({legacy: undefined, rendered: {sha256: artifact.workbooks.pt.sha256, byteLength: artifact.workbooks.pt.byteSize, renderer: artifact.version,
      rendererVersion: "2020.01.01-v0", deterministicInputs: {locale: "pt"}}})];
    expect((await request("xlsx")).status).toBe(409);
  });
});

describe("old and new resolution decide equal", () => {
  it.each(["pt-BR", "en-US"])("serve the same bytes for the current result in every format (%s)", async locale => {
    for (const format of ["xlsx", "docx", "pptx", "pdf"]) {
      const before = await legacyRequest(format, locale);
      const after = await request(format, locale);
      expect(after.status).toBe(before.status);
      expect(Buffer.from(await after.arrayBuffer()).equals(Buffer.from(await before.arrayBuffer()))).toBe(true);
    }
  });
  it("refuse the same cases with the same status", async () => {
    const cases: Array<() => void> = [
      () => {institutional = {data: {projectId, latest: {...latest, status: "stale"}}, error: null};},
      () => {institutional = {data: {projectId, latest: {...latest, status: "queued"}}, error: null};},
      () => {institutional = {data: {projectId, latest: null}, error: null}; reads = [];},
      () => {institutional = {data: {projectId, latest}, error: {code: "42501"}};},
      () => {const changed = structuredClone(latest); changed.artifact.workbooks.pt.sha256 = "b".repeat(64); institutional = {data: {projectId, latest: changed}, error: null};},
    ];
    for (const arrange of cases) {
      reads = [resultRevision()];
      arrange();
      for (const format of ["xlsx", "docx", "pdf", "html"]) {
        const before = await legacyRequest(format);
        const after = await request(format);
        expect(after.status, `${format}`).toBe(before.status);
      }
      expect((await request("xlsx", "pt-BR", olderResultId)).status).toBe((await legacyRequest("xlsx", "pt-BR", olderResultId)).status);
    }
  });
});
