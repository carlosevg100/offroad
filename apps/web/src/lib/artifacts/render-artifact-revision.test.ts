import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {houseDocumentTemplate, materialToDocx, materialToPdf, materialToPptx} from "@offroad/case-export";
import {institutionalWorkbookArtifactSchema} from "@offroad/financial-model";
import {documentWorkProductSchema} from "@offroad/domain-contracts";
import {syntheticDocumentWorkProduct} from "@offroad/testing-fixtures/document-work-product";
import {afterEach, describe, expect, it, vi} from "vitest";

import messages from "../../../messages/pt-BR.json";
import {documentWorkProductDocument} from "@/lib/advisor/document-work-product-material";
import {institutionalResultMaterial} from "@/lib/advisor/institutional-result-material";
import {institutionalResultDeliverableTypes} from "@/lib/advisor/institutional-result-formats";
import {documentaryReadingDeliverableContext, documentaryReadingDeliverableTypes} from "@/lib/advisor/documentary-reading-formats";

import {termSheet} from "./material-fixtures.test-support";
import {renderArtifactRevision} from "./render-artifact-revision";

const sql = readFileSync(resolve(process.cwd(), "../../supabase/tests/support/institutional_setup_fixture.sql"), "utf8");
const raw = sql.match(/select set_config\('test\.setup_artifact', '((?:[^']|'')*)', true\);/)?.[1];
if (!raw) throw new Error("Missing real institutional artifact fixture");
const artifact = institutionalWorkbookArtifactSchema.parse(JSON.parse(raw.replaceAll("''", "'")));
const product = documentWorkProductSchema.parse(syntheticDocumentWorkProduct);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const legacyWriters = {
  docx: async (input: Parameters<typeof materialToDocx>[0]) => materialToDocx(input),
  pdf: materialToPdf,
  pptx: materialToPptx,
} as const;
const current = {resultState: "current", accessCurrent: true, reproduction: "approved", tabularContract: true, narrativeStructure: true} as const;
afterEach(() => vi.useRealTimers());

async function rendered(input: Parameters<typeof renderArtifactRevision>[0]) {
  const result = await renderArtifactRevision(input);
  if (!result.ok) throw new Error(result.block);
  return result.bytes;
}

describe("one serializer for the three former call sites, byte for byte", () => {
  it.each(["docx", "pdf", "pptx"] as const)("governed materials in %s", async format => {
    const meta = format === "docx" ? {companyName: "Empresa sintética"} : {};
    const before = await legacyWriters[format]({material: termSheet, lang: "pt", meta: {issuedOn: "2026-09-07", ...meta}});
    const after = await rendered({revision: {issuedOn: "2026-09-07"}, format, lang: "pt", material: () => termSheet, meta});
    expect(sha(after)).toBe(sha(before));
  });
  it.each(["docx", "pdf", "pptx"] as const)("the approved institutional result in %s, with its identity", async format => {
    const material = institutionalResultMaterial(artifact, "en");
    const template = {...houseDocumentTemplate};
    const before = await legacyWriters[format]({material, lang: "en", meta: {issuedOn: "2026-09-10", template}});
    const after = await rendered({revision: {issuedOn: "2026-09-10", template}, format, lang: "en", material: () => material,
      policy: {types: institutionalResultDeliverableTypes, context: current}});
    expect(sha(after)).toBe(sha(before));
  });
  it.each(["docx", "pdf"] as const)("the documentary reading in %s, with its reference targets", async format => {
    const document = documentWorkProductDocument(product, messages.App.documentWorkProduct);
    const before = await legacyWriters[format]({material: document.material, lang: document.lang, meta: {issuedOn: "2026-09-08", referenceTargets: document.referenceTargets}});
    const after = await rendered({revision: {issuedOn: "2026-09-08"}, format, lang: document.lang, material: () => document.material,
      meta: {referenceTargets: document.referenceTargets}, policy: {types: documentaryReadingDeliverableTypes, context: documentaryReadingDeliverableContext()}});
    expect(sha(after)).toBe(sha(before));
  });
});

describe("deterministic rendering from the revision", () => {
  it.each(["docx", "pdf", "pptx"] as const)("the same revision renders the same %s on different clocks", async format => {
    const material = institutionalResultMaterial(artifact, "pt");
    vi.useFakeTimers({toFake: ["Date"]});
    vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
    const monday = await rendered({revision: {issuedOn: "2026-09-10"}, format, lang: "pt", material: () => material});
    vi.setSystemTime(new Date("2028-02-29T23:59:59Z"));
    const later = await rendered({revision: {issuedOn: "2026-09-10"}, format, lang: "pt", material: () => material});
    expect(sha(later)).toBe(sha(monday));
  });
  it("refuses a date that is not the date of a version", async () => {
    await expect(renderArtifactRevision({revision: {issuedOn: "today"}, format: "docx", lang: "pt", material: () => termSheet})).rejects.toThrow("artifact_render_issue_date_invalid");
  });
});

describe("the format policy is applied once, before any replay or rendering", () => {
  it("blocks a format the delivery never declares and a superseded result, without replaying or compiling", async () => {
    const reproduce = vi.fn(async () => new Uint8Array([1]));
    const material = vi.fn(() => termSheet);
    expect(await renderArtifactRevision({revision: {issuedOn: "2026-09-08"}, format: "pptx", lang: "pt", material, reproduce,
      policy: {types: documentaryReadingDeliverableTypes, context: documentaryReadingDeliverableContext()}})).toEqual({ok: false, block: "format_not_in_policy"});
    expect(await renderArtifactRevision({revision: {issuedOn: "2026-09-08"}, format: "docx", lang: "pt", material, reproduce,
      policy: {types: institutionalResultDeliverableTypes, context: {...current, resultState: "superseded"}}})).toEqual({ok: false, block: "result_superseded"});
    expect(reproduce).not.toHaveBeenCalled();
    expect(material).not.toHaveBeenCalled();
  });
  it("replays before every format, serves the replayed workbook as the xlsx, and blocks a divergence", async () => {
    const workbook = new Uint8Array([80, 75, 3, 4]);
    const reproduce = vi.fn(async () => workbook);
    const xlsx = await renderArtifactRevision({revision: {issuedOn: "2026-09-10"}, format: "xlsx", lang: "pt", reproduce, material: () => termSheet});
    expect(xlsx).toEqual({ok: true, bytes: workbook, format: "xlsx"});
    expect((await renderArtifactRevision({revision: {issuedOn: "2026-09-10"}, format: "docx", lang: "pt", reproduce, material: () => termSheet})).ok).toBe(true);
    expect(reproduce).toHaveBeenCalledTimes(2);
    expect(await renderArtifactRevision({revision: {issuedOn: "2026-09-10"}, format: "pdf", lang: "pt", reproduce: async () => null, material: () => termSheet}))
      .toEqual({ok: false, block: "reproduction_divergence"});
    expect(await renderArtifactRevision({revision: {issuedOn: "2026-09-10"}, format: "xlsx", lang: "pt", material: () => termSheet})).toEqual({ok: false, block: "format_not_in_policy"});
    expect(await renderArtifactRevision({revision: {issuedOn: "2026-09-10"}, format: "html", lang: "pt", material: () => termSheet})).toEqual({ok: false, block: "format_not_in_policy"});
  });
});
