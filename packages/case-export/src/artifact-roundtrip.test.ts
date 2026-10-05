import {execFileSync} from "node:child_process";
import {mkdtempSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import JSZip from "jszip";
import {PDFDocument} from "pdf-lib";
import type {Material} from "@offroad/case-materials";
import {materialToDocx, materialDocxRoundtripRegions} from "./docx";
import {materialToPptx, materialToPptxRoundtrip} from "./presentation";
import {roundtripManifestVersion, roundtripManifestSchema, canonicalRoundtripJson, type RoundtripManifest, type ArtifactManifest} from "@offroad/domain-contracts";
import {compareRoundtrip, embedRoundtripManifest, extractRoundtripManifest, extractContributions, readRoundtripSnapshot,
  roundtripSha256, logicalManifestFingerprint, verifyRoundtripBase, type RoundtripEntry, type RoundtripSnapshot} from "./artifact-roundtrip";
const ids = {artifact: "00000000-0000-4000-8000-000000000001", base: "00000000-0000-4000-8000-000000000002", current: "00000000-0000-4000-8000-000000000003"};
function manifest(format: RoundtripManifest["format"] = "docx"): RoundtripManifest {
  return {schemaVersion: roundtripManifestVersion, artifactId: ids.artifact, revisionId: ids.base, revisionNo: 1,
    logicalManifestFingerprint: "a".repeat(64), format, exportedAt: "2026-10-05T00:00:00Z",
    blocks: [{blockKey: "summary", kind: format === "xlsx" ? "cell_region" : "paragraph", recorded: false, claimIds: ["claim-revenue"],
      region: format === "xlsx" ? {kind: "cell", sheet: "Inputs", ref: "A1:B2", definedName: "block.summary"}
        : format === "pptx" ? {kind: "slide", slideName: "block:summary", shapeName: "block:summary|claim:claim-revenue"}
          : {kind: "word", tag: "block:summary", bookmark: "offroad_block_summary"}}],
    inputs: format === "xlsx" ? [{name: "in.growth.2027", blockKey: "summary", assumptionId: "growth", period: "2027", cellRef: "B1"}] : [],
    outputs: [], formulas: format === "xlsx" ? [{name: "f.revenue.2027", cellRef: "B2", formulaSha256: roundtripSha256("B1*2")}] : []};
}
function entry(value: string, role: RoundtripEntry["role"] = "text"): RoundtripEntry {
  return {key: "block:summary", blockKey: "summary", role, value, formula: null, locator: "p1", claimIds: ["claim-revenue"]};
}
function snapshot(entries: RoundtripEntry[], m = manifest()): RoundtripSnapshot {
  return {manifest: m, manifestIssue: null, sha256: "b".repeat(64), entries, unmatched: []};
}
function trusted(base: RoundtripSnapshot) {
  return verifyRoundtripBase(base, {revisionId: ids.base, logicalManifestFingerprint: "a".repeat(64), sha256: base.sha256},
    {artifactId: ids.artifact, revisionId: ids.base, revisionNo: 1, logicalManifestFingerprint: "a".repeat(64)});
}
async function container(format: "xlsx" | "docx" | "pptx"): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
  zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  if (format === "docx") zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:sdt><w:sdtPr><w:tag w:val="block:summary"/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>Original &amp; exact</w:t></w:r></w:p></w:sdtContent></w:sdt></w:body></w:document>');
  if (format === "pptx") {
    zip.file("ppt/presentation.xml", '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>');
    zip.file("ppt/slides/slide1.xml", '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld name="block:summary"><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="1" name="block:summary|claim:claim-revenue"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Original</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
  }
  if (format === "xlsx") {
    zip.file("xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inputs" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="f.revenue.2027">\'Inputs\'!B2</definedName></definedNames></workbook>');
    zip.file("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>');
    zip.file("xl/worksheets/sheet1.xml", '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Growth</t></is></c><c r="B1"><v>0.050000000000000001</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Calculated</t></is></c><c r="B2"><f>B1*2</f><v>0</v></c></row></sheetData></worksheet>');
  }
  return zip.generateAsync({type: "uint8array"});
}
async function edit(bytes: Uint8Array, path: string, transform: (xml: string) => string): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes); zip.file(path, transform(await zip.file(path)!.async("string")));
  return zip.generateAsync({type: "uint8array"});
}
describe("roundtrip three-way contribution contract", () => {
  it("distinguishes head-only, received-only, identical edits and true conflicts", () => {
    const base = trusted(snapshot([entry("original")]));
    const head = snapshot([entry("head")], {...manifest(), revisionId: ids.current, revisionNo: 2});
    expect(compareRoundtrip(base, snapshot([entry("original")]), head).differences[0]?.classification).toBe("unchanged");
    expect(compareRoundtrip(base, snapshot([entry("edited")]), snapshot([entry("original")])).differences[0]?.classification).toBe("edited");
    const already = compareRoundtrip(base, snapshot([entry("head")]), head);
    expect(already.differences[0]?.alreadyPresent).toBe(true);
    expect(extractContributions(already, manifest()).blockProposals).toEqual([]);
    expect(compareRoundtrip(base, snapshot([entry("other")]), head).differences[0]?.classification).toBe("conflict");
  });
  it("detaches claims, keeps base intact, and never imports recorded edits", () => {
    const raw = snapshot([entry("original")]); const base = trusted(raw);
    const result = extractContributions(compareRoundtrip(base, snapshot([entry("human")]), raw), manifest());
    expect(result.blockProposals).toEqual([{blockKey: "summary", content: {text: "human"}, claims: [], supportIds: [], detachedClaimIds: ["claim-revenue"]}]);
    expect(raw.entries[0]?.value).toBe("original");
    const recorded = trusted(snapshot([entry("12", "recorded")]));
    const obs = extractContributions(compareRoundtrip(recorded, snapshot([entry("13", "recorded")]), snapshot([entry("12", "recorded")])), manifest());
    expect(obs.blockProposals).toEqual([]); expect(obs.observations[0]?.kind).toBe("recorded_edited");
  });
  it("rejects mismatched historical receipts and strips forged or missing lineage", () => {
    expect(() => verifyRoundtripBase(snapshot([]), {revisionId: ids.base, logicalManifestFingerprint: "a".repeat(64), sha256: "c".repeat(64)},
      {artifactId: ids.artifact, revisionId: ids.base, revisionNo: 1, logicalManifestFingerprint: "a".repeat(64)})).toThrow("roundtrip_base_unverified");
    const base = trusted(snapshot([entry("original")]));
    for (const changed of [snapshot([entry("forged")], {...manifest(), logicalManifestFingerprint: "c".repeat(64)}), {...snapshot([entry("loose")]), manifest: null}]) {
      const comparison = compareRoundtrip(base, changed, snapshot([entry("original")]));
      expect(comparison.status).toBe("unmatched"); expect(extractContributions(comparison, manifest()).blockProposals).toEqual([]);
    }
  });
  it("does not collapse duplicate blocks or invent matches from their text", () => {
    const comparison = compareRoundtrip(trusted(snapshot([entry("original")])), snapshot([entry("original"), {...entry("copied"), locator: "p2"}]), snapshot([entry("original")]));
    expect(comparison.differences.filter(diff => diff.classification === "unmatched")).toHaveLength(1);
    expect(new Set(comparison.differences.map(diff => diff.key)).size).toBe(comparison.differences.length);
    expect(extractContributions(comparison, manifest()).blockProposals).toEqual([]);
  });
});
describe("physical roundtrip packages", () => {
  it.each(["xlsx", "docx", "pptx"] as const)("embeds a deterministic non-circular %s manifest with preserved metadata", async format => {
    const input = await container(format); const m = manifest(format);
    const a = await embedRoundtripManifest(input, m); const b = await embedRoundtripManifest(input, m);
    expect(a).toEqual(b); expect((await extractRoundtripManifest(a, format)).manifest).toEqual(m);
    const zip = await JSZip.loadAsync(a, {checkCRC32: true});
    const directory = mkdtempSync(join(tmpdir(), "offroad-roundtrip-"));
    try {const file = join(directory, `synthetic.${format}`); writeFileSync(file, a);
      expect(execFileSync("unzip", ["-t", file]).toString()).toContain("No errors detected");
    } finally {rmSync(directory, {recursive: true, force: true});}
    expect(await zip.file("docProps/custom.xml")!.async("string")).toContain("OffroadManifestFingerprint");
    expect(canonicalRoundtripJson(m)).not.toContain(roundtripSha256(a));
    const read = await readRoundtripSnapshot(a, format); expect(read.manifestIssue).toBeNull(); expect(read.entries.length).toBeGreaterThan(0);
  });

  it("preserves local defined names and inserts new names before calcPr", async () => {
    let bytes = await container("xlsx");
    bytes = await edit(bytes, "xl/workbook.xml", xml => xml.replace("</definedNames>", '<definedName name="_xlnm.Print_Area" localSheetId="0">Inputs!A1:B2</definedName></definedNames><calcPr calcId="1"/>'));
    const embedded = await embedRoundtripManifest(bytes, manifest("xlsx"));
    const zip = await JSZip.loadAsync(embedded);
    const workbook = await zip.file("xl/workbook.xml")!.async("string");
    expect(workbook).toContain('<definedName name="_xlnm.Print_Area" localSheetId="0">Inputs!A1:B2</definedName>');
    expect(workbook.indexOf("</definedNames>")).toBeLessThan(workbook.indexOf("<calcPr"));
  });
  it("imports exact assumption decimals, ignores caches, and records changed formulas", async () => {
    const m = manifest("xlsx"); const baseBytes = await embedRoundtripManifest(await container("xlsx"), m);
    const base = trusted(await readRoundtripSnapshot(baseBytes, "xlsx"));
    const edited = await edit(baseBytes, "xl/worksheets/sheet1.xml", xml => xml.replace("0.050000000000000001", "0.075000000000000002").replace("<v>0</v>", "<v>999999</v>"));
    const result = extractContributions(compareRoundtrip(base, await readRoundtripSnapshot(edited, "xlsx"), base), m);
    expect(result.assumptionChanges).toEqual([{assumptionId: "growth", period: "2027", approved: "0.050000000000000001", proposed: "0.075000000000000002"}]);
    expect(result.observations).toEqual([]); expect(JSON.stringify(result)).not.toContain("999999");
    const formulaEdit = await edit(baseBytes, "xl/worksheets/sheet1.xml", xml => xml.replace("B1*2", "B1*3"));
    const formulas = extractContributions(compareRoundtrip(base, await readRoundtripSnapshot(formulaEdit, "xlsx"), base), m);
    expect(formulas.observations[0]?.kind).toBe("formula_changed"); expect(formulas.assumptionChanges).toEqual([]);
    expect(JSON.stringify(formulas)).not.toContain("B1*3");
  });
  it("preserves exact authoritative approved values and configuration scope", async () => {
    const m = manifest("xlsx");
    m.inputs[0] = {...m.inputs[0]!, configurationId: "00000000-0000-4000-8000-000000000004", approved: "0.050000000000000000000001"};
    const bytes = await embedRoundtripManifest(await container("xlsx"), m);
    const base = trusted(await readRoundtripSnapshot(bytes, "xlsx"));
    expect(extractContributions(compareRoundtrip(base, await readRoundtripSnapshot(bytes, "xlsx"), base), m).assumptionChanges).toEqual([]);
    const edited = await edit(bytes, "xl/worksheets/sheet1.xml", xml => xml.replace("0.050000000000000001", "0.08"));
    const changes = extractContributions(compareRoundtrip(base, await readRoundtripSnapshot(edited, "xlsx"), base), m);
    expect(changes.assumptionChanges).toEqual([{assumptionId: "growth", period: "2027", configurationId: "00000000-0000-4000-8000-000000000004", approved: "0.050000000000000000000001", proposed: "0.08"}]);
    const comparison = compareRoundtrip(base, await readRoundtripSnapshot(edited, "xlsx"), base);
    expect(() => extractContributions(comparison, {...m, inputs: [{...m.inputs[0]!, approved: "99"}]})).toThrow("roundtrip_contribution_base_mismatch");
  });
  it("keeps named inputs matched after worksheet rename and row insertion", async () => {
    const m = manifest("xlsx"); const baseBytes = await embedRoundtripManifest(await container("xlsx"), m);
    const base = trusted(await readRoundtripSnapshot(baseBytes, "xlsx"));
    let edited = await edit(baseBytes, "xl/workbook.xml", xml => xml.replace('name="Inputs"', 'name="Renamed"').replace(/(?:'Inputs'|&apos;Inputs&apos;)!/g, "'Renamed'!").replace(/!B1/g, "!B3"));
    edited = await edit(edited, "xl/worksheets/sheet1.xml", xml => xml.replace('r="B1"', 'r="B3"').replace("0.050000000000000001", "0.08"));
    const changes = extractContributions(compareRoundtrip(base, await readRoundtripSnapshot(edited, "xlsx"), base), m);
    expect(changes.assumptionChanges[0]?.proposed).toBe("0.08");
  });
  it("detects deleted Word controls as missing and surviving text as unmatched", async () => {
    const m = manifest(); const bytes = await embedRoundtripManifest(await container("docx"), m);
    const base = trusted(await readRoundtripSnapshot(bytes, "docx"));
    const edited = await edit(bytes, "word/document.xml", xml => xml.replace(/<w:sdtPr>[\s\S]*?<\/w:sdtPr>/, "").replace(/<\/?w:sdt(?:Content)?>/g, ""));
    const comparison = compareRoundtrip(base, await readRoundtripSnapshot(edited, "docx"), base);
    expect(comparison.differences.map(diff => diff.classification)).toEqual(["missing", "unmatched"]);
  });
  it("preserves original slide and detects copied slide as unmatched", async () => {
    const m = manifest("pptx"); const bytes = await embedRoundtripManifest(await container("pptx"), m);
    const base = trusted(await readRoundtripSnapshot(bytes, "pptx"));
    const zip = await JSZip.loadAsync(bytes); zip.file("ppt/slides/slide2.xml", await zip.file("ppt/slides/slide1.xml")!.async("string"));
    const comparison = compareRoundtrip(base, await readRoundtripSnapshot(await zip.generateAsync({type: "uint8array"}), "pptx"), base);
    expect(comparison.differences.filter(diff => diff.classification === "unmatched")).toHaveLength(1);
    expect(new Set(comparison.differences.map(diff => diff.key)).size).toBe(comparison.differences.length);
  });
  it("rejects inconsistent custom properties and manifest sheet without conferring lineage", async () => {
    const bytes = await embedRoundtripManifest(await container("xlsx"), manifest("xlsx"));
    const edited = await edit(bytes, "docProps/custom.xml", xml => xml.replace(ids.base, ids.current));
    expect((await extractRoundtripManifest(edited, "xlsx")).issue).toBe("roundtrip_properties_mismatch");
    const badSheet = await edit(bytes, "xl/worksheets/offroad_manifest.xml", xml => xml.replace("a".repeat(64), "c".repeat(64)));
    expect((await extractRoundtripManifest(badSheet, "xlsx")).issue).toBe("roundtrip_manifest_sheet_mismatch");
  });
  it("embeds PDF identity and XMP while explicitly refusing PDF reimport", async () => {
    const pdf = await PDFDocument.create(); pdf.addPage(); pdf.setCreationDate(new Date("2026-10-05T00:00:00Z")); pdf.setModificationDate(new Date("2026-10-05T00:00:00Z"));
    const bytes = await pdf.save({useObjectStreams: false}); const m = manifest("pdf");
    const a = await embedRoundtripManifest(bytes, m); const b = await embedRoundtripManifest(bytes, m);
    expect(a).toEqual(b); expect((await extractRoundtripManifest(a, "pdf")).manifest).toEqual(m);
    expect(new TextDecoder().decode(a)).toContain("offroad:fingerprint");
    await expect(readRoundtripSnapshot(a, "pdf")).rejects.toThrow("roundtrip_pdf_import_unsupported");
  });
  it("refuses a decompression bomb before reading the embedded manifest", async () => {
    const zip = new JSZip(); zip.file("word/document.xml", "0".repeat(500000));
    const bytes = await zip.generateAsync({type: "uint8array", compression: "DEFLATE"});
    await expect(readRoundtripSnapshot(bytes, "docx")).rejects.toThrow("decompression bomb");
  });
  it("keeps logical identity across formats without calculating the SQL fingerprint locally", () => {
    const logical: ArtifactManifest = {schemaVersion: "artifact-manifest.2026.09.26-v1", kind: "material", audience: "internal", format: "docx", bytes: null,
      method: null, execution: null, inputSnapshot: null, institutionalResult: null, sources: [], claims: [{blockKey: "summary", claimIds: ["claim-revenue"]}],
      traces: [], template: null, provenance: {producer: "synthetic-test", jobId: null, taskRunId: null, messageId: null, capability: null}, legacy: null};
    const original = logicalManifestFingerprint(logical);
    for (const format of ["xlsx", "docx", "pptx", "pdf"] as const) expect(logicalManifestFingerprint({...logical, format, bytes: {
      sha256: "d".repeat(64), byteLength: 123, storage: {bucket: "synthetic", path: `export.${format}`}}})).toBe(original);
    expect(logicalManifestFingerprint({...logical, claims: []})).not.toBe(original);
  });
  it("compares two concurrent edits without overwriting the first contribution", () => {
    const base = trusted(snapshot([entry("original"), {...entry("second"), key: "block:second", blockKey: "second"}]));
    const firstHead = snapshot([entry("first accepted"), {...entry("second"), key: "block:second", blockKey: "second"}], {...manifest(), revisionId: ids.current, revisionNo: 2});
    const secondReceived = snapshot([entry("second concurrent"), {...entry("second edited"), key: "block:second", blockKey: "second"}]);
    const result = compareRoundtrip(base, secondReceived, firstHead);
    expect(result.differences.map(diff => diff.classification)).toEqual(["conflict", "edited"]);
    expect(firstHead.entries[0]?.value).toBe("first accepted");
    expect(extractContributions(result, manifest()).conflicts).toEqual(["block:summary"]);
  });
  it("validates duplicate declared identities before rendering", () => {
    const m = manifest(); expect(roundtripManifestSchema.safeParse({...m, blocks: [...m.blocks, ...m.blocks]}).success).toBe(false);
  });
});

describe("explicit material renderer bindings", () => {
  const material: Material = {kind: "term_sheet", title: {pt: "Sintético", en: "Synthetic"}, dependsOn: [], blocks: [
    {type: "heading", text: {pt: "Condições", en: "Terms"}},
    {type: "paragraph", text: {pt: "Contribuição ".repeat(150), en: "Contribution ".repeat(150)}, supportIds: ["synthetic-claim"]},
    {type: "table", caption: {pt: "Tabela", en: "Table"}, head: [{pt: "Período", en: "Period"}, {pt: "Valor", en: "Value"}],
      rows: Array.from({length: 30}, (_, index) => [`${index + 1}`, `${index + 100}`])},
  ]};
  const blocks = material.blocks.map((_, blockIndex) => ({blockIndex, blockKey: `canonical-${blockIndex}`, claimIds: blockIndex === 1 ? ["synthetic-claim"] : []}));
  it("writes explicit Word controls without exposing block identities in readable text", async () => {
    const regions = materialDocxRoundtripRegions({blocks});
    const bytes = materialToDocx({material, lang: "en", meta: {issuedOn: "2026-10-05", roundtrip: {blocks}}});
    const m = {...manifest(), blocks: regions.map((region, index) => ({...region, claimIds: [...region.claimIds], kind: index === 2 ? "table" as const : "paragraph" as const, recorded: index === 2}))};
    const packaged = await embedRoundtripManifest(bytes, m);
    const snapshot = await readRoundtripSnapshot(packaged, "docx");
    expect(snapshot.entries).toHaveLength(3); expect(snapshot.entries.map(item => item.blockKey)).toEqual(blocks.map(block => block.blockKey));
    expect(snapshot.entries.map(item => item.value).join(" ")).not.toContain("canonical-");
    const invalid = {blocks: [{...blocks[0]!, blockIndex: 99}]};
    expect(() => materialToDocx({material, lang: "en", meta: {issuedOn: "2026-10-05", roundtrip: invalid}})).toThrow("roundtrip_material_binding_invalid");
  });
  it("groups paginated slides into one canonical block and treats an extra copy as unmatched", async () => {
    const result = await materialToPptxRoundtrip({material, lang: "en", meta: {issuedOn: "2026-10-05", roundtrip: {blocks}}});
    expect(result.blocks.some(block => block.region.parts.length > 1)).toBe(true);
    const m = {...manifest("pptx"), blocks: result.blocks.map((block, index) => ({...block, claimIds: [...block.claimIds], kind: index === 2 ? "table" as const : "paragraph" as const, recorded: index === 2}))};
    const bytes = await embedRoundtripManifest(result.bytes, m); const base = trusted(await readRoundtripSnapshot(bytes, "pptx"));
    expect(base.entries).toHaveLength(3); expect(base.entries.map(item => item.value).join(" ")).not.toContain("canonical-");
    const unchanged = compareRoundtrip(base, await readRoundtripSnapshot(bytes, "pptx"), base);
    expect(unchanged.differences.every(diff => diff.classification === "unchanged")).toBe(true);
    const zip = await JSZip.loadAsync(bytes);
    zip.file("ppt/slides/slide999.xml", await zip.file("ppt/slides/slide2.xml")!.async("string"));
    const copied = compareRoundtrip(base, await readRoundtripSnapshot(await zip.generateAsync({type: "uint8array"}), "pptx"), base);
    expect(copied.differences.some(diff => diff.classification === "unmatched")).toBe(true);
    expect(await materialToPptx({material, lang: "en", meta: {issuedOn: "2026-10-05"}})).toEqual(await materialToPptx({material, lang: "en", meta: {issuedOn: "2026-10-05"}}));
  });
});
