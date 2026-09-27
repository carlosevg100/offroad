import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {institutionalFinancialModelMaterial, type Material} from "@offroad/case-materials";
import {capitalProcedurePacketBlocks, type CapitalProcedurePacketLike} from "@offroad/domain-contracts";
import {calculateCustomerConcentration, calculateEbitdaAdjustments, calculateNewInstrumentAmount, presentationFigure, presentationNumber, testScheduleTieOut} from "@offroad/financial-core";
import {buildInstitutionalFinancialModel, institutionalWorkbookArtifactSchema, renderApprovedInstitutionalFinancialWorkbook} from "@offroad/financial-model";
import {syntheticCreditMaterialsCase} from "@offroad/testing-fixtures/credit-materials-case";
import {describe, expect, it, vi} from "vitest";

vi.mock("server-only", () => ({}));

import {institutionalResultMaterial} from "@/lib/advisor/institutional-result-material";

import {artifactReadFixture} from "./artifact-read.test-support";
import {artifactRenderers} from "./artifact-renderers";
import {parseArtifactRead} from "./authorized-artifact-reader";
import {
  docxText,
  htmlText,
  materialFigureTexts,
  missingTokens,
  numberTokens,
  pdfText,
  pptxContent,
  syntheticCompanyName,
  syntheticIssuedOn,
  syntheticPackage,
  syntheticStatements,
  xlsxCells,
} from "./economic-readout.test-support";
import {renderArtifactRevision} from "./render-artifact-revision";

/**
 * Economic identity of one revision across every format it is served in (stage 19, increment 6).
 *
 * Each revision is rendered through `renderArtifactRevision` (docx, pdf, pptx and, for results, the
 * replayed xlsx) and through the registered HTML renderer the materials route uses; the figures are
 * read back out of each file (paragraph text of the docx, slides and native chart caches of the
 * pptx, the text layer of the pdf, the visible text of the html, the cells of the xlsx) and compared
 * with what the revision states: every figure of the revision is in every file as many times as the
 * revision states it, and every amount, percentage and multiple a file prints is a figure of the
 * revision. The figures the financial-core kernels compute are checked by value.
 */

type Lang = "pt" | "en";
const langs: readonly Lang[] = ["pt", "en"];
const documentFormats = ["docx", "pdf", "pptx"] as const;
/** Rendering every format in both languages is slow under a loaded runner; the default five seconds is not a budget for it. */
const renderTimeout = 120_000;

type Rendered = {files: Record<"docx" | "pdf" | "pptx" | "html", string>; charts: number[][]};
const renders = new Map<Material, Map<Lang, Promise<Rendered>>>();

/** Each material is rendered once per language and read by every test that needs it. */
function renderAll(material: Material, lang: Lang): Promise<Rendered> {
  const byLang = renders.get(material) ?? new Map<Lang, Promise<Rendered>>();
  renders.set(material, byLang);
  const cached = byLang.get(lang);
  if (cached) return cached;
  const rendered = renderFormats(material, lang);
  byLang.set(lang, rendered);
  return rendered;
}

async function renderFormats(material: Material, lang: Lang): Promise<Rendered> {
  const text: Partial<Record<"docx" | "pdf" | "pptx" | "html", string>> = {};
  let charts: number[][] = [];
  for (const format of documentFormats) {
    const rendered = await renderArtifactRevision({revision: {issuedOn: syntheticIssuedOn}, format, lang, material: () => material, meta: {companyName: syntheticCompanyName}});
    if (!rendered.ok) throw new Error(`${material.kind} ${format} refused: ${rendered.block}`);
    if (format === "docx") text.docx = docxText(rendered.bytes);
    if (format === "pdf") text.pdf = pdfText(rendered.bytes);
    if (format === "pptx") ({text: text.pptx, chartValues: charts} = pptxContent(rendered.bytes));
  }
  text.html = htmlText(artifactRenderers["case-render.material-html"].produce({material, lang, meta: {issuedOn: syntheticIssuedOn, companyName: syntheticCompanyName}}));
  return {files: text as Record<"docx" | "pdf" | "pptx" | "html", string>, charts};
}

/** Amounts, percentages and multiples as a file prints them. */
function economicFigures(text: string): string[] {
  return [
    ...[...text.matchAll(/R\$\s?-?(\d(?:[\d.,]*\d)?)/g)].map((match) => match[1]!),
    ...[...text.matchAll(/(\d(?:[\d.,]*\d)?)\s?%/g)].map((match) => match[1]!),
    ...[...text.matchAll(/(\d(?:[\d.,]*\d)?)x\b/g)].map((match) => match[1]!),
  ];
}

const localized = (value: string, lang: Lang) => {
  const [whole = "", fraction] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, lang === "pt" ? "." : ",");
  return grouped + (fraction ? `${lang === "pt" ? "," : "."}${fraction}` : "");
};
/** A printed figure read back as an exact decimal, in the separators of its language. */
const parsedFigure = (token: string, lang: Lang) => presentationFigure({value: lang === "pt" ? token.replace(/\./g, "").replace(",", ".") : token.replace(/,/g, "")}).value;

function expectEconomicIdentity(expectedTexts: readonly string[], files: Record<string, string>) {
  const expected = expectedTexts.flatMap(numberTokens);
  const known = new Set(expected);
  expect(expected.length).toBeGreaterThan(0);
  for (const [format, text] of Object.entries(files)) {
    expect(missingTokens(expected, numberTokens(text)), `${format} misses figures of the revision`).toEqual([]);
    expect(economicFigures(text).filter((figure) => !known.has(figure)), `${format} prints figures the revision does not state`).toEqual([]);
  }
}

describe("the material kinds of one package", () => {
  const {materials, desk, trajectory} = syntheticPackage();

  it("covers every material kind the package publishes", () => {
    expect([...new Set(materials.map((material) => material.kind))].sort())
      .toEqual(["credit_memo", "credit_profile", "data_room_index", "diligence_qa", "financial_model", "package", "teaser", "term_sheet"]);
  });

  for (const material of materials) {
    it.each(langs)(`${material.kind}${material.artifactFingerprint ? ` (${material.title.en})` : ""} states the same figures in docx, pdf, pptx and html (%s)`, async (lang) => {
      const {files, charts} = await renderAll(material, lang);
      expectEconomicIdentity(materialFigureTexts(material, lang), files);
      // Native charts carry the exact statement values, as the kernel hands them to a binary number.
      const expectedCharts = (material.presentationCharts ?? []).map((chart) => chart.series.points.map((point) => point.value));
      expect(charts).toEqual(expectedCharts);
    }, renderTimeout);
  }

  it("prints the figures the financial-core kernels compute, by value, in every format", async () => {
    const byKind = (kind: Material["kind"]) => materials.find((material) => material.kind === kind)!;
    const lm = trajectory.liabilityManagement!;
    const source = calculateNewInstrumentAmount({covenantedBalance: lm.covenantedBalance, netNewMoney: lm.netNewMoney}).value;
    const tieOut = testScheduleTieOut({scheduleGap: desk.stack.scheduleGap, totalOnBalance: desk.stack.totalOnBalance, tolerance: "0.02"});
    const shares = ["0.181", "0.12", "0.095", "0.181", "0.05", "0.04"].map((share, index) => ({id: `c${index + 1}`, share}));
    const concentration = calculateCustomerConcentration({shares, leading: 5});
    const fact = (path: string) => syntheticCreditMaterialsCase.facts.find((entry) => entry.fieldPath === path)!.value;
    const adjustments = calculateEbitdaAdjustments({adjustedEbitda: fact("historical_financials.2025.adjusted_ebitda"), reportedEbitda: fact("historical_financials.2025.ebitda")});
    const adjustmentsInMillions = presentationFigure({value: adjustments.magnitude, scale: "millions", decimals: 1}).value;
    const expectations: Array<{kind: Material["kind"]; pt: string; en: string}> = [
      {kind: "package", pt: `R$ ${localized(source, "pt")}`, en: `R$ ${localized(source, "pt")}`},
      {kind: "diligence_qa", pt: `${localized(presentationFigure({value: concentration.leadingTotal, scale: "percent", decimals: 1}).value, "pt")}% da receita`, en: `${presentationFigure({value: concentration.leadingTotal, scale: "percent", decimals: 1}).value}% of revenue`},
      {kind: "diligence_qa", pt: `R$ ${localized(presentationFigure({value: tieOut.magnitude, scale: "millions", decimals: 1}).value, "pt")}M no balanço`, en: `R$ ${presentationFigure({value: tieOut.magnitude, scale: "millions", decimals: 1}).value}M on the balance sheet`},
      // Question 10 answers from the adjustments kernel since case-materials 2026.09.26-v5.
      {kind: "diligence_qa", pt: `R$ ${localized(adjustmentsInMillions, "pt")}M de ajustes`, en: `R$ ${adjustmentsInMillions}M of adjustments`},
      {kind: "credit_memo", pt: "CDI + 3,70% a CDI + 5,20% a.a.", en: "CDI + 3.70% to CDI + 5.20% p.a."},
      {kind: "credit_memo", pt: "Alternativa: R$ 71M em 48 meses", en: "Alternative: R$ 71M over 48 months"},
    ];
    expect(source).toBe("42300000");
    for (const expectation of expectations) {
      for (const lang of langs) {
        const {files} = await renderAll(byKind(expectation.kind), lang);
        for (const [format, text] of Object.entries(files)) expect(text.replace(/\s+/g, " "), `${expectation.kind} ${format} ${lang}`).toContain(expectation[lang]);
      }
    }
  }, renderTimeout);

  it("rounds ratios with the kernel and plots the exact statement values, the same in every format", async () => {
    for (const lang of langs) {
      const statements = institutionalFinancialModelMaterial({artifactFingerprint: "6".repeat(64), supportIds: ["synthetic-approved-review"], lang, scenarios: [syntheticStatements]});
      const {files, charts} = await renderAll(statements, lang);
      expectEconomicIdentity(materialFigureTexts(statements, lang), files);
      for (const period of syntheticStatements.periods) {
        for (const ratio of [period.netDebtToEbitda, period.dscr, period.interestCoverage]) {
          if (ratio === null) continue;
          const printed = localized(presentationFigure({value: ratio, decimals: 2}).value, lang);
          for (const [format, text] of Object.entries(files)) expect(numberTokens(text), `${format} ${lang} ${ratio}`).toContain(printed.replace(/^-/, ""));
        }
      }
      expect(charts).toEqual(["ebitda", "cfads", "closingGrossDebt", "unrestrictedCash"].map((key) =>
        syntheticStatements.periods.map((period) => presentationNumber(period[key as "ebitda"]).value)));
    }
  }, renderTimeout);

  it("reads a changed figure as a missing one, so the comparison is not vacuous", async () => {
    const original = materials.find((material) => material.kind === "package")!;
    const altered: Material = {...original, blocks: original.blocks.map((block) => block.type === "table" && block.caption.pt === "Fontes e usos"
      ? {...block, rows: block.rows.map((row, index) => index === 0 ? [row[0]!, "R$ 42.300.001"] : row)} : block)};
    const {files} = await renderAll(altered, "pt");
    for (const text of Object.values(files)) {
      expect(missingTokens(materialFigureTexts(original, "pt").flatMap(numberTokens), numberTokens(text))).toContain("42.300.000");
      expect(economicFigures(text)).toContain("42.300.001");
    }
  }, renderTimeout);
});

describe("the approved financial result", () => {
  // The committed artifact of the real reviewed-source, configuration and calculation producer.
  const sql = readFileSync(resolve(process.cwd(), "../../supabase/tests/support/institutional_setup_fixture.sql"), "utf8");
  const raw = sql.match(/select set_config\('test\.setup_artifact', '((?:[^']|'')*)', true\);/)?.[1];
  if (!raw) throw new Error("Missing real institutional artifact fixture");
  const artifact = institutionalWorkbookArtifactSchema.parse(JSON.parse(raw.replaceAll("''", "'")));
  const scenario = artifact.institutional.scenarios[0]!;
  const periods = buildInstitutionalFinancialModel(scenario.input).periods;
  const money = ["revenue", "ebitda", "netIncome", "cfads", "closingGrossDebt", "unrestrictedCash", "netDebt", "totalAssets", "totalLiabilitiesAndEquity"] as const;
  const ratios = ["netDebtToEbitda", "dscr", "interestCoverage"] as const;

  it.each(langs)("replays the approved statements in the xlsx and prints the same figures in docx, pdf and pptx (%s)", async (lang) => {
    const workbook = await renderArtifactRevision({revision: {issuedOn: "2026-09-10"}, format: "xlsx", lang, reproduce: () => renderApprovedInstitutionalFinancialWorkbook(artifact, lang)});
    if (!workbook.ok) throw new Error("the approved workbook did not replay");
    const cells = xlsxCells(workbook.bytes);
    // The approved scenario sheet states each figure exactly (net debt is a document line only).
    const approvedSheet = [...new Set(cells.map((cell) => cell.sheet))].find((sheet) => periods.every((period) => money.filter((key) => key !== "netDebt").every((key) =>
      cells.some((cell) => cell.sheet === sheet && String(cell.value) === period[key]))));
    expect(approvedSheet, "an xlsx sheet states every approved figure exactly").toBeDefined();
    const material = institutionalResultMaterial(artifact, lang);
    const files: Record<string, string> = {};
    let charts: number[][] = [];
    for (const format of documentFormats) {
      const rendered = await renderArtifactRevision({revision: {issuedOn: "2026-09-10"}, format, lang, material: () => material});
      if (!rendered.ok) throw new Error(`${format} refused`);
      if (format === "docx") files.docx = docxText(rendered.bytes);
      if (format === "pdf") files.pdf = pdfText(rendered.bytes);
      if (format === "pptx") ({text: files.pptx, chartValues: charts} = pptxContent(rendered.bytes));
    }
    expectEconomicIdentity(materialFigureTexts(material, lang), files);
    for (const period of periods) {
      for (const key of money) {
        const printed = localized(period[key], lang);
        for (const [format, text] of Object.entries(files)) {
          const token = numberTokens(text).find((candidate) => candidate === printed.replace(/^-/, ""));
          expect(token, `${format} ${key} ${period.period}`).toBeDefined();
          expect(parsedFigure(token!, lang)).toBe(presentationFigure({value: period[key].replace(/^-/, "")}).value);
        }
      }
      for (const key of ratios) {
        const exact = period[key];
        if (exact === null) continue;
        const rounded = presentationFigure({value: exact, decimals: 2}).value;
        for (const [format, text] of Object.entries(files)) expect(numberTokens(text), `${format} ${key} ${period.period}`).toContain(localized(rounded, lang).replace(/^-/, ""));
        // The xlsx keeps the exact ratio; the documents print it rounded half-up by the kernel.
        expect(cells.some((cell) => cell.sheet === approvedSheet && String(cell.value) === exact), `xlsx ${key} ${period.period}`).toBe(true);
      }
    }
    expect(charts).toEqual(["ebitda", "cfads", "closingGrossDebt", "unrestrictedCash"].map((key) => periods.map((period) => presentationNumber(period[key as "ebitda"]).value)));
  }, renderTimeout);
});

describe("the execution result", () => {
  const packet = JSON.parse(readFileSync(resolve(process.cwd(), "../../packages/domain-contracts/src/fixtures/execution-result-packet.json"), "utf8")) as CapitalProcedurePacketLike;
  const valueAt = (path: string): unknown => path.split(/\.|\[(\d+)\]/).filter(Boolean)
    .reduce<unknown>((node, segment) => (node as Record<string, unknown>)[segment], packet);

  it("serves its decisive numbers in its one format, the revision's blocks, equal to the committed packet and to their claims", () => {
    const blocks = capitalProcedurePacketBlocks(packet);
    const answer = artifactReadFixture({
      workId: packet.decision.workId, kind: "execution_result", subject: `execution:${packet.decision.fingerprint.slice(0, 12)}`,
      revisionId: "70000000-0000-4000-8000-000000000006", format: "json",
      blocks: blocks.map((block) => ({blockKey: block.blockKey, kind: block.kind, content: {...block.content}, claims: block.claims.map((claim) => ({...claim, supportIds: [...claim.supportIds]}))})),
    });
    // The producer of increment 4 names the execution and its receipt in the manifest.
    const execution = {executionId: "80000000-0000-4000-8000-000000000006", resultFingerprint: "e".repeat(64), inputFingerprint: packet.inputFingerprint};
    const read = parseArtifactRead({...answer, revision: {...answer.revision, manifest: {...answer.revision.manifest, execution}}});
    if (!read.ok || read.read.withheld) throw new Error(`the execution result revision did not parse: ${read.ok ? "withheld" : read.error}`);
    const numbers = read.read.blocks.filter((block) => block.kind === "number");
    expect(numbers.length).toBeGreaterThan(0);
    for (const block of numbers) {
      const content = block.content as {value: string; unit: string; periodLabel: string; path: string};
      expect(block.claims).toHaveLength(1);
      expect(block.claims[0]).toMatchObject({kind: "calculation", value: content.value, unit: content.unit, period: content.periodLabel});
      // The value is the packet's decimal text, verbatim: never re-rounded, never a binary number.
      expect(typeof content.value).toBe("string");
      expect(content.value).toBe(valueAt(content.path));
    }
    const ratios = read.read.blocks.find((block) => block.blockKey === "ratios");
    for (const claim of ratios?.claims ?? []) {
      expect(claim.value).toBe(packet.decision.ratios.find((ratio) => ratio.id === claim.claimId)!.displayedRatio);
    }
    expect(read.read.revision.manifest.claims.flatMap((entry) => entry.claimIds)).toEqual(read.read.blocks.flatMap((block) => block.claims.map((claim) => claim.claimId)));
  });
});
