import {createHash} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {resolveFieldPath} from "@offroad/credit-ontology";
import {
  buildRedeHorizonteGoldFields,
  checkThresholds,
  evaluateSnapshot,
  goldDocumentPath,
  loadGoldCase,
  renderMarkdownReport,
  snapshotFromFixture,
  valuesMatch,
  type ExtractionSnapshot,
} from "./index";

const here = dirname(fileURLToPath(import.meta.url));
const goldDir = resolve(here, "..", "..", "testing-fixtures", "gold", "rede-horizonte");
const gold = loadGoldCase(goldDir);

const fixtureDocuments = gold.manifest.documents.map((document, index) => ({
  id: `doc-${index}`,
  original_name: document.name,
  sha256: createHash("sha256").update(readFileSync(goldDocumentPath(gold, document.name))).digest("hex"),
}));

describe("gold case G1 (Rede Horizonte)", () => {
  it("is internally valid: documents exist with the declared hashes, fields resolve in the ontology, ids are unique", () => {
    for (const document of gold.manifest.documents) {
      const path = goldDocumentPath(gold, document.name);
      expect(existsSync(path), path).toBe(true);
      const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
      expect(sha256).toBe(document.sha256);
    }
    for (const field of gold.fields) expect(resolveFieldPath(field.fieldPath), field.fieldPath).not.toBeNull();
    for (const profile of gold.profiles) expect(gold.manifest.documents.some((d) => d.name === profile.document)).toBe(true);
    const ids = gold.exceptions.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(gold.exceptions.map((e) => e.id).filter((id) => id.startsWith("RF-"))).toEqual(["RF-01", "RF-02", "RF-03", "RF-04", "RF-05", "RF-06", "RF-07"]);
    expect(gold.acceptance.map((a) => a.id)).toEqual(["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06", "AC-07", "AC-08", "AC-09"]);
    expect(gold.acceptance.reduce((sum, a) => sum + a.weight, 0)).toBe(100);
    for (const criterion of gold.acceptance) {
      for (const path of criterion.fieldPaths) expect(gold.fields.some((f) => f.fieldPath === path), path).toBe(true);
      for (const id of criterion.calculationIds) expect(gold.calculations.some((c) => c.id === id), id).toBe(true);
      for (const id of criterion.exceptionIds) expect(gold.exceptions.some((e) => e.id === id), id).toBe(true);
    }
  });

  it("keeps expected/fields.json in sync with the builder (regenerate with `pnpm gold:rede-horizonte`)", () => {
    const built = buildRedeHorizonteGoldFields();
    const committed = JSON.parse(readFileSync(join(goldDir, "expected", "fields.json"), "utf8")) as unknown;
    expect(committed).toEqual(built.fields);
    expect(built.fromFixture).toBe(38);
    expect(built.fields.length).toBeGreaterThan(70);
  });
});

describe("baseline — the fixture extractor that runs in production today", () => {
  const snapshot = snapshotFromFixture(fixtureDocuments);
  const report = evaluateSnapshot(gold, snapshot);

  it("is precise on what it produces but incomplete, unclassified and unverified — the honest baseline", () => {
    expect(report.fields.precision.value).toBe(1);
    expect(report.fields.unscoredCandidates).toBe(0);
    expect(report.fields.material.recall).toBeGreaterThan(0.4);
    expect(report.fields.material.recall).toBeLessThan(0.9);
    expect(report.hallucination).toEqual({autoAcceptedMaterial: 0, withoutVerifiedAnchor: 0, rate: 0});
    expect(report.classification.accuracy).toBeNull();
    expect(report.calculations.matched).toBe(0);
    const detected = report.exceptions.outcomes.filter((o) => o.status === "detected").map((o) => o.id);
    expect(detected).toEqual(expect.arrayContaining(["RF-05", "RF-06", "MI-01", "MI-02", "MI-03"]));
    expect(detected).not.toContain("RF-01");
    expect(detected).not.toContain("RF-02");
    const acceptance = Object.fromEntries(report.acceptance.outcomes.map((o) => [o.id, o.status]));
    expect(acceptance).toMatchObject({"AC-03": "pass", "AC-04": "pass", "AC-09": "pass", "AC-01": "fail", "AC-07": "fail"});
    expect(checkThresholds(report).all).toBe(false);
  });

  it("renders a markdown report with the headline metrics", () => {
    const markdown = renderMarkdownReport(report);
    expect(markdown).toContain("# Eval — rede-horizonte · rede-horizonte-fixture@rede-horizonte-v1");
    expect(markdown).toContain("| Precision on comparable candidates | 100.0% (38/38)");
    expect(markdown).toContain("| RF-05 | medium | detected |");
    expect(markdown).toContain("| AC-03 | 15 | yes | pass | — |");
  });
});

describe("a perfect snapshot", () => {
  it("scores 100% on every metric and passes all thresholds", () => {
    const perfect: ExtractionSnapshot = {
      extractor: {name: "perfect", version: "test"},
      documents: gold.manifest.documents.map((d) => d.name),
      profiles: gold.profiles.map((p) => ({document: p.document, kind: p.kind})),
      candidates: gold.fields.map((field) => ({
        fieldPath: field.fieldPath,
        normalizedValue: field.value,
        valueType: field.valueType,
        ...(field.sourceDocument ? {sourceDocument: field.sourceDocument} : {}),
        ...(field.periodStart ? {periodStart: field.periodStart} : {}),
        ...(field.periodEnd ? {periodEnd: field.periodEnd} : {}),
        informationClass: field.fieldPath.startsWith("historical") ? "audited" : field.fieldPath.startsWith("interim") ? "reviewed" : field.fieldPath.startsWith("projections") ? "projection" : field.fieldPath.startsWith("company") ? "company_document" : "management",
        evidenceRank: 3,
        confidence: 0.99,
        anchorVerified: true,
        anchorPrecision: "cell",
        autoAccepted: true,
      })),
      exceptions: gold.exceptions.map((e) => ({type: e.type, severity: e.severity, title: e.id, description: e.keywords[0] ?? e.description, ...(e.ruleId ? {ruleId: e.ruleId} : {})})),
      calculations: gold.calculations.map((c) => ({id: c.id, value: c.value})),
    };
    const report = evaluateSnapshot(gold, perfect);
    expect(report.fields.material.recall).toBe(1);
    expect(report.fields.precision.value).toBe(1);
    expect(report.hallucination.rate).toBe(0);
    expect(report.classification.accuracy).toBe(1);
    expect(report.exceptions.recall).toBe(1);
    expect(report.exceptions.falsePositives).toBe(0);
    expect(report.calculations.recall).toBe(1);
    expect(report.acceptance.criticalFailures).toEqual([]);
    expect(report.acceptance.passedWeight).toBe(100);
    expect(checkThresholds(report).all).toBe(true);
  });

  it("flags hallucinations: auto-accepted material values without a verified anchor", () => {
    const risky: ExtractionSnapshot = {
      extractor: {name: "risky", version: "test"},
      documents: [],
      profiles: [],
      candidates: [{fieldPath: "transaction.requested_amount", normalizedValue: "54000000", valueType: "number", informationClass: "company_document", evidenceRank: 7, confidence: 0.99, anchorVerified: false, anchorPrecision: "page", autoAccepted: true}],
      exceptions: [],
      calculations: [],
    };
    const report = evaluateSnapshot(gold, risky);
    expect(report.hallucination).toEqual({autoAcceptedMaterial: 1, withoutVerifiedAnchor: 1, rate: 1});
    expect(checkThresholds(report).hallucination).toBe(false);
  });
});

describe("value matching", () => {
  it("compares numbers with exact/absolute/relative tolerance, texts by normalized equality, lists as sets", () => {
    expect(valuesMatch("54000000", "54000000.00", "number", {kind: "exact"})).toBe(true);
    expect(valuesMatch("54000000", "54000001", "number", {kind: "exact"})).toBe(false);
    expect(valuesMatch("1.7788", "1.7787878788", "number", {kind: "relative", value: "0.005"})).toBe(true);
    expect(valuesMatch("1.7788", "1.9", "number", {kind: "relative", value: "0.005"})).toBe(false);
    expect(valuesMatch("100", "100.4", "number", {kind: "absolute", value: "0.5"})).toBe(true);
    expect(valuesMatch("abc", "100", "number", {kind: "exact"})).toBe(false);
    expect(valuesMatch("Rede Horizonte Alimentos S.A.", "rede horizonte alimentos s.a.", "text", {kind: "exact"})).toBe(true);
    expect(valuesMatch(JSON.stringify(["Franca", "Araraquara"]), JSON.stringify(["araraquara", "Franca"]), "list", {kind: "exact"})).toBe(true);
    expect(valuesMatch("2027-04-01", "2027-04-01", "date", {kind: "exact"})).toBe(true);
  });
});
