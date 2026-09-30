import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {governedWorkbookRendererVersion, institutionalWorkbookArtifactSchema} from "@offroad/financial-model";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({workspace: vi.fn(), load: vi.fn(), readable: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/resource-download", () => ({resourceStillReadable: mocks.readable}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: mocks.workspace}));
vi.mock("@/lib/deal-state/materials", async (original) => ({
  ...await original<typeof import("@/lib/deal-state/materials")>(), loadGovernedMaterialPackage: mocks.load,
}));

import {legacyGET} from "@/lib/artifacts/legacy-routes/model.test-support";
import {
  governedPackage,
  legacyMaterialRead,
  materialFingerprint,
  materialRevisionId,
  materialSessionId,
  materialSupabase,
} from "@/lib/artifacts/material-fixtures.test-support";
import {GET} from "./route";
import {artifactReadFixture} from "@/lib/artifacts/artifact-read.test-support";

// The committed fixture is emitted by the real reviewed-source/configuration/calculation producer.
const sql = readFileSync(resolve(process.cwd(), "../../supabase/tests/support/institutional_setup_fixture.sql"), "utf8");
const raw = sql.match(/select set_config\('test\.setup_artifact', '((?:[^']|'')*)', true\);/)?.[1];
if (!raw) throw new Error("Missing real institutional artifact fixture");
const artifact = institutionalWorkbookArtifactSchema.parse(JSON.parse(raw.replaceAll("''", "'")));
const bindings = artifact.institutional.scenarios.flatMap(scenario => scenario.sourceBindings);
const verifiedDocuments = bindings.map(source => ({id: source.sourceDocument, document_version: Number(source.version), sha256: source.hash, sha256_verified_at: "2026-09-10T04:00:00Z"}));
const modelPackage = {...governedPackage, plannedArtifacts: ["financial_model" as const], financialModel: artifact};
let documents: {data: unknown; error: unknown};
let supabase: ReturnType<typeof materialSupabase>;
const withReads = (reads = [legacyMaterialRead()]) => materialSupabase(reads, {tables: {source_documents: () => documents}, rpc: () => ({data: {state: "legacy"}, error: null})});
const request = (locale = "pt-BR", query = "") => GET(new Request(`https://offroad.test/model${query}`), {params: Promise.resolve({locale, sessionId: materialSessionId})});
const legacyRequest = (locale = "pt-BR") => legacyGET(new Request("https://offroad.test/model"), {params: Promise.resolve({locale, sessionId: materialSessionId})});
const sha = (bytes: ArrayBuffer) => createHash("sha256").update(Buffer.from(bytes)).digest("hex");

beforeEach(() => {
  documents = {data: verifiedDocuments, error: null};
  supabase = withReads();
  mocks.workspace.mockImplementation(async () => ({supabase: supabase.client, organization: {id: "org", name: "Empresa sintética"}}));
  mocks.readable.mockResolvedValue(true);
  mocks.load.mockResolvedValue(structuredClone(modelPackage));
});
afterEach(() => {vi.useRealTimers(); vi.resetAllMocks();});

describe("approved model download", () => {
  it.each([["pt-BR", "pt"], ["en-US", "en"]] as const)("replays the workbook with the approved hash of the locale and the artifact headers (%s)", async (locale, lang) => {
    vi.useFakeTimers({toFake: ["Date"]});
    vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
    const monday = await request(locale);
    vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
    const friday = await request(locale);
    expect(monday.status).toBe(200);
    expect(friday.status).toBe(200);
    const bytes = await friday.arrayBuffer();
    expect(sha(bytes)).toBe(artifact.workbooks[lang].sha256);
    expect(sha(await monday.arrayBuffer())).toBe(sha(bytes));
    expect(friday.headers.get("content-disposition")).toContain(`_${governedPackage.issuedOn}.xlsx`);
    expect(friday.headers.get("x-artifact-revision")).toBe(materialRevisionId);
    expect(friday.headers.get("x-artifact-legacy")).toBe("unpinned");
    expect(friday.headers.get("x-artifact-content-sha256")).toBeNull();
    expect(supabase.reads.find(read => read.table === "source_documents")?.filters).toContainEqual(["eq", ["intake_session_id", materialSessionId]]);
  });
  it("refuses sources that changed, a receipt that no longer replays and a plan without the model", async () => {
    documents = {data: verifiedDocuments.map(document => ({...document, sha256: "0".repeat(64)})), error: null};
    expect(await (await request()).text()).toBe("As fontes mudaram; revise o modelo antes de gerar uma nova entrega.");
    documents = {data: verifiedDocuments, error: null};
    const corrupted = structuredClone(modelPackage);
    corrupted.financialModel.workbooks.pt.sha256 = "b".repeat(64);
    mocks.load.mockResolvedValue(corrupted);
    expect(await (await request()).text()).toBe("O modelo precisa ser preparado novamente.");
    mocks.load.mockResolvedValue({...modelPackage, plannedArtifacts: ["teaser"]});
    expect(await (await request()).text()).toBe("O modelo aprovado ainda não está disponível.");
  });
  it("verifies the workbook a revision pins and refuses another one", async () => {
    const pinned = (sha256: string) => legacyMaterialRead({legacy: undefined, format: "xlsx", rendered: {sha256, byteLength: artifact.workbooks.pt.byteSize,
      renderer: artifact.version, rendererVersion: governedWorkbookRendererVersion, deterministicInputs: {materialFingerprint, materialKind: "financial_model", locale: "pt"}}});
    supabase = withReads([pinned(artifact.workbooks.pt.sha256)]);
    const verified = await request();
    expect(verified.status).toBe(200);
    expect(verified.headers.get("x-artifact-content-sha256")).toBe(artifact.workbooks.pt.sha256);
    expect((await request("en-US")).headers.get("x-artifact-bytes")).toBe("unpinned");
    supabase = withReads([pinned("c".repeat(64))]);
    expect((await request()).status).toBe(409);
  });
  it("never attributes legacy pinned bytes to a native unpinned manifest", async () => {
    const legacy = legacyMaterialRead({legacy: undefined, format: "xlsx", rendered: {sha256: artifact.workbooks.pt.sha256, byteLength: artifact.workbooks.pt.byteSize,
      renderer: artifact.version, rendererVersion: governedWorkbookRendererVersion, deterministicInputs: {materialFingerprint, materialKind: "financial_model", locale: "pt"}}});
    const resultId="20000000-0000-4000-8000-000000000123";
    const native=artifactReadFixture({workId:legacy.artifact.workId,kind:"model_result",subject:`institutional-native:${resultId}`,
      revisionId:"30000000-0000-4000-8000-000000000123",institutionalResult:{id:resultId,configurationFingerprint:"a".repeat(64)}});
    supabase=materialSupabase([legacy,native],{tables:{source_documents:()=>documents},rpc:()=>({data:{state:"native",resultId,revisionId:native.revision.id},error:null})});
    const response=await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-artifact-revision")).toBe(native.revision.id);
    expect(response.headers.get("x-artifact-bytes")).toBe("unpinned");
    expect(response.headers.get("x-artifact-content-sha256")).toBeNull();
  });
  it("denies copied workbooks when native authority disappears during rendering", async () => {
    let lookups=0;
    supabase=materialSupabase([legacyMaterialRead()],{tables:{source_documents:()=>documents},rpc:()=> ++lookups===1
      ? {data:{state:"legacy"},error:null} : {data:null,error:{code:"42501"}}});
    expect((await request()).status).toBe(409);
    expect(lookups).toBe(2);
  });
  it("serves ?revision= exactly and refuses a replaced version or a revision of another subject", async () => {
    const older = legacyMaterialRead({revisionId: "60000000-0000-4000-8000-000000000002", isHead: false,
      legacy: {table: "deal_state_objects", id: "50000000-0000-4000-8000-000000000002", fingerprint: "c".repeat(64)}});
    const otherSubject = legacyMaterialRead({revisionId: "60000000-0000-4000-8000-000000000003", isHead: false, subject: "materials:10000000-0000-4000-8000-000000000099"});
    supabase = withReads([legacyMaterialRead(), older, otherSubject]);
    expect((await request("pt-BR", `?revision=${materialRevisionId}`)).status).toBe(200);
    expect((await request("pt-BR", `?revision=${older.revision.id}`)).status).toBe(409);
    expect((await request("pt-BR", `?revision=${otherSubject.revision.id}`)).status).toBe(404);
    supabase = withReads([legacyMaterialRead({audience: "external", release: "blocked"})]);
    expect((await request()).status).toBe(409);
  });
});

describe("old and new resolution decide equal for the model", () => {
  it.each(["pt-BR", "en-US"])("serve the same workbook bytes (%s)", async locale => {
    const before = await legacyRequest(locale);
    const after = await request(locale);
    expect(before.status).toBe(200);
    expect(after.status).toBe(200);
    expect(sha(await after.arrayBuffer())).toBe(sha(await before.arrayBuffer()));
    expect(after.headers.get("content-disposition")).toBe(`attachment; filename="${locale === "pt-BR" ? "Cenarios" : "Scenarios"}_${governedPackage.issuedOn}.xlsx"`);
  });
  it("refuse the same cases with the same status and text", async () => {
    const cases: Array<() => void> = [
      () => {documents = {data: [], error: null};},
      () => {documents = {data: null, error: {message: "denied"}};},
      () => {const corrupted = structuredClone(modelPackage); corrupted.financialModel.fingerprint = "b".repeat(64); mocks.load.mockResolvedValue(corrupted);},
      () => {mocks.load.mockResolvedValue({...modelPackage, plannedArtifacts: ["teaser"]});},
      () => {mocks.load.mockResolvedValue(null);},
      () => {mocks.readable.mockResolvedValue(false);},
    ];
    for (const arrange of cases) {
      documents = {data: verifiedDocuments, error: null};
      mocks.load.mockResolvedValue(structuredClone(modelPackage));
      mocks.readable.mockResolvedValue(true);
      arrange();
      const before = await legacyRequest();
      const after = await request();
      expect(after.status).toBe(before.status);
      expect(await after.text()).toBe(await before.text());
    }
  });
});


it("denies model bytes when material revision loses source authority during rendering", async () => {
  const rpc = supabase.client.rpc;
  mocks.readable.mockResolvedValueOnce(true).mockImplementationOnce(async () => {
    supabase.client.rpc = async (name, args) => name === "read_artifact_revision_v1"
      ? {data: legacyMaterialRead({restriction: {kind: "source_rights", linkIds: [], unresolvedRevisionIds: [materialRevisionId]}}), error: null}
      : rpc(name, args);
    return true;
  });
  const response = await request();
  expect(response.status).toBe(409);
  expect(response.headers.get("content-disposition")).toBeNull();
  expect(response.headers.get("x-artifact-revision")).toBeNull();
  expect(mocks.readable).toHaveBeenCalledTimes(2);
});


it("denies model bytes when material approval is revoked during rendering", async () => {
  supabase = withReads([legacyMaterialRead({audience: "external", release: "released"})]);
  const rpc = supabase.client.rpc;
  mocks.readable.mockResolvedValueOnce(true).mockImplementationOnce(async () => {
    supabase.client.rpc = async (name, args) => name === "read_artifact_revision_v1"
      ? {data: legacyMaterialRead({audience: "external", release: "blocked"}), error: null} : rpc(name, args);
    return true;
  });
  const response = await request();
  expect(response.status).toBe(409);
  expect(response.headers.get("content-disposition")).toBeNull();
  expect(response.headers.get("x-artifact-revision")).toBeNull();
});
