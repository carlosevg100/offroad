import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {inflateSync} from "node:zlib";
import {institutionalWorkbookArtifactSchema} from "@offroad/financial-model";
import * as XLSX from "xlsx";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {institutionalResultMaterial} from "@/lib/advisor/institutional-result-material";
import {GET} from "./route";

const mocks = vi.hoisted(() => ({workspace: vi.fn(), rpc: vi.fn()}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: mocks.workspace}));
// Committed fixture is emitted by the real reviewed-source/configuration/calculation producer.
const sql = readFileSync(resolve(process.cwd(), "../../supabase/tests/support/institutional_setup_fixture.sql"), "utf8");
const raw = sql.match(/select set_config\('test\.setup_artifact', '((?:[^']|'')*)', true\);/)?.[1];
if (!raw) throw new Error("Missing real institutional artifact fixture");
const artifact = institutionalWorkbookArtifactSchema.parse(JSON.parse(raw.replaceAll("''", "'")));
const projectId = "10000000-0000-4000-8000-000000000001";
const resultId = "20000000-0000-4000-8000-000000000001";
const scenario = artifact.institutional.scenarios[0]!;
const latest = {id: resultId, status: "completed", configurationId: scenario.configurationId, configurationFingerprint: scenario.configurationFingerprint,
  sourceManifestFingerprint: artifact.institutional.sourceManifestFingerprint, artifact, blockers: [], createdAt: "2026-09-10T04:00:00Z"};
const request = (format = "xlsx", locale = "pt-BR", id = resultId) => GET(new Request("https://offroad.test/financial-result"), {params: Promise.resolve({locale, projectId, resultId: id, format})});
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
  mocks.workspace.mockResolvedValue({supabase: {rpc: mocks.rpc}, organization: {id: "tenant-authorized-by-workspace"}});
  mocks.rpc.mockResolvedValue({data: {projectId, latest: structuredClone(latest)}, error: null});
});
afterEach(() => {vi.useRealTimers(); vi.resetAllMocks();});

describe("approved institutional result downloads", () => {
  it.each(["pt-BR", "en-US"])("replays all four actual formats and preserves reviewed evidence in %s", async locale => {
    vi.useFakeTimers({toFake: ["Date"]});
    for (const format of ["xlsx", "docx", "pptx", "pdf"]) {
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
      const content = textFromOutput(first, format).replace(/\s+/g, " ");
      expect(content).toContain("EBITDA");
      expect(content).toContain(scenario.sourceBindings[0]!.metadataEvidence.rationale);
      expect(content).toContain(scenario.sourceBindings[0]!.sourceDocument);
      expect(content).toContain(scenario.input.assumptionBook.assumptions[0]!.rationale);
      if (process.env.OFFROAD_RESULT_QA_DIR) {
        mkdirSync(process.env.OFFROAD_RESULT_QA_DIR, {recursive: true});
        writeFileSync(`${process.env.OFFROAD_RESULT_QA_DIR}/result-${locale === "en-US" ? "en" : "pt"}.${format}`, first);
      }
    }
    expect(mocks.rpc).toHaveBeenCalledWith("read_institutional_model_results_v1", {p_project_id: projectId});
  });
  it.each(["stale", "queued", "blocked"])("refuses %s even if an old artifact remains in the database response", async status => {
    mocks.rpc.mockResolvedValue({data: {projectId, latest: {...latest, status}}, error: null});
    for (const format of ["xlsx", "docx", "pptx", "pdf"]) expect((await request(format)).status).toBe(409);
  });
  it("refuses another project, wrong result ID, revoked access and unknown formats", async () => {
    expect((await request("xlsx", "pt-BR", "20000000-0000-4000-8000-000000000999")).status).toBe(409);
    mocks.rpc.mockResolvedValue({data: {projectId: "10000000-0000-4000-8000-000000000999", latest}, error: null});
    expect((await request()).status).toBe(409);
    mocks.rpc.mockResolvedValue({data: {projectId, latest}, error: {code: "42501"}});
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
    mocks.rpc.mockResolvedValue({data: {projectId, latest: changed}, error: null});
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
