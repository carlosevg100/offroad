import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {compileMethodDocument, loadMethodLibrary, methodMayRunInStaging} from "./procedure-markdown";
import {procedureBuildProvenance} from "./method-runtime-manifest.generated";

const knowledge = join(import.meta.dirname, "../knowledge");
const library = loadMethodLibrary(join(knowledge, "procedures"));
// All four ficha procedures of lote 1 are implemented: analyze-investment-project (2026.10.09-v2),
// compare-financing-proposals, analyze-relative-debt-cost and assess-debt-capacity (2026.10.19-v2).
const ids: string[] = [];

describe("ficha procedure authorship, without invented execution approval", () => {
  it.each(ids)("compiles %s while denying staging and production execution", id => {
    const method = library.methods.find(m => m.procedure.id === id)!;
    expect(method).toBeDefined();
    expect(method.procedure.maturity).toBe("draft");
    expect(methodMayRunInStaging(method)).toBe(false);
    expect(method.procedure.owner.approvedBy).toBeUndefined();
    expect(method.procedure.implementation).toBeUndefined();
    expect(method.frontmatter.task_specs).toEqual([]);
    expect(method.composition?.authoringStatus).toBe("incomplete");
    expect(method.composition?.maximumEffect).toBe("none");
    expect(method.procedure.procedure.length).toBeGreaterThanOrEqual(7);
  });

  it("resolves investment analysis as an explicit debt-capacity dependency", () => {
    const method = library.methods.find(m => m.procedure.id === "assess-debt-capacity")!;
    expect(method.frontmatter.dependencies).toEqual(["analyze-investment-project"]);
    for (const id of method.frontmatter.dependencies) expect(library.methods.some(m => m.procedure.id === id)).toBe(true);
  });

  it.each(ids)("binds %s calculation contracts and source bytes without promoting its professional procedure", id => {
    const built = procedureBuildProvenance.find(p => p.procedure.id === id)!;
    expect(built.schemaVersion).toBe("compiled-procedure-manifest.v1");
    if (built.schemaVersion !== "compiled-procedure-manifest.v1") throw new Error("compiled manifest expected");
    const calculations = built.components.filter(c => c.executor !== null);
    expect(calculations).toHaveLength(1);
    const entry = calculations[0]!;
    expect(entry.component.kind).toBe("quality_gate");
    expect(entry.executor?.module).toBe("@offroad/financial-model");
    expect(entry.component.inputs.value.type).toBe("object");
    expect(entry.component.outputs.value.type).toBe("object");
    expect(entry.executor?.sources.some(s => s.path === "packages/financial-model/src/ficha-calculation-results.ts")).toBe(true);
    expect(built.authoringStatus).toBe("incomplete");
    expect(built.pendingContent.length).toBeGreaterThan(0);
    expect(built.grantsExecution).toBe(false);
  });

  it("implements analyze-investment-project on recorded runs without granting execution or approval", () => {
    const method = library.methods.find(m => m.procedure.id === "analyze-investment-project")!;
    expect(method.procedure.version).toBe("2026.10.09-v2");
    expect(["implemented", "ai_reviewed", "tested"]).toContain(method.procedure.maturity);
    expect(method.procedure.owner.approvedBy).toBeUndefined();
    expect(method.procedure.implementation?.executor).toEqual({module: "@offroad/financial-model", exportName: "prepareInvestmentDecisionPacket"});
    expect(method.composition?.authoringStatus).toBe("ready_for_review");
    expect(method.composition?.pendingContent).toEqual([]);
    expect(method.composition?.budget).toEqual({maxModelCalls: 0, maxDurationMs: 31000, maxCostMinorUnits: 0, currency: "BRL"});
    const built = procedureBuildProvenance.find(p => p.procedure.id === "analyze-investment-project")!;
    if (built.schemaVersion !== "compiled-procedure-manifest.v1") throw new Error("compiled manifest expected");
    const calculations = built.components.filter(c => c.executor !== null);
    expect(calculations).toHaveLength(1);
    expect(calculations[0]!.executor).toMatchObject({module: "@offroad/financial-model", exportName: "prepareInvestmentDecisionPacket", version: "2026.10.09-v1"});
    expect(calculations[0]!.evidence.map(e => e.path)).toEqual(expect.arrayContaining(["gold", "adversarial", "consistency"].map(k =>
      `packages/credit-playbook/knowledge/reviews/runs/investment-project-2026-10-09-v2-${k}/run.json`)));
    expect(built.grantsExecution).toBe(false);
  });

  it("implements compare-financing-proposals on recorded runs without granting execution or approval", () => {
    const method = library.methods.find(m => m.procedure.id === "compare-financing-proposals")!;
    expect(method.procedure.version).toBe("2026.10.19-v2");
    expect(["implemented", "ai_reviewed", "tested"]).toContain(method.procedure.maturity);
    expect(method.procedure.owner.approvedBy).toBeUndefined();
    expect(method.procedure.implementation?.executor).toEqual({module: "@offroad/financial-model", exportName: "prepareFinancingComparisonPacket"});
    expect(method.composition?.authoringStatus).toBe("ready_for_review");
    expect(method.composition?.pendingContent).toEqual([]);
    expect(method.composition?.budget).toEqual({maxModelCalls: 0, maxDurationMs: 61000, maxCostMinorUnits: 0, currency: "BRL"});
    const built = procedureBuildProvenance.find(p => p.procedure.id === "compare-financing-proposals")!;
    if (built.schemaVersion !== "compiled-procedure-manifest.v1") throw new Error("compiled manifest expected");
    const calculations = built.components.filter(c => c.executor !== null);
    expect(calculations).toHaveLength(1);
    expect(calculations[0]!.executor).toMatchObject({module: "@offroad/financial-model", exportName: "prepareFinancingComparisonPacket", version: "2026.10.19-v1"});
    expect(calculations[0]!.evidence.map(e => e.path)).toEqual(expect.arrayContaining(["gold", "adversarial", "consistency"].map(k =>
      `packages/credit-playbook/knowledge/reviews/runs/compare-financing-proposals-2026-10-19-v2-${k}/run.json`)));
    expect(built.grantsExecution).toBe(false);
  });

  it.each([
    ["analyze-relative-debt-cost", "prepareRelativeDebtCostPacket", "analyze-relative-debt-cost-2026-10-19-v2"],
    ["assess-debt-capacity", "prepareDebtCapacityPacket", "assess-debt-capacity-2026-10-19-v2"],
  ] as const)("implements %s on recorded runs without granting execution or approval", (id, exportName, runs) => {
    const method = library.methods.find(m => m.procedure.id === id)!;
    expect(method.procedure.version).toBe("2026.10.19-v2");
    expect(["implemented", "ai_reviewed", "tested"]).toContain(method.procedure.maturity);
    expect(method.procedure.owner.approvedBy).toBeUndefined();
    expect(method.procedure.implementation?.executor).toEqual({module: "@offroad/financial-model", exportName});
    expect(method.composition?.authoringStatus).toBe("ready_for_review");
    const built = procedureBuildProvenance.find(p => p.procedure.id === id)!;
    if (built.schemaVersion !== "compiled-procedure-manifest.v1") throw new Error("compiled manifest expected");
    const calculations = built.components.filter(c => c.executor !== null);
    expect(calculations).toHaveLength(1);
    expect(calculations[0]!.executor).toMatchObject({module: "@offroad/financial-model", exportName});
    expect(calculations[0]!.evidence.map(e => e.path)).toEqual(expect.arrayContaining(["gold", "adversarial", "consistency"].map(k =>
      `packages/credit-playbook/knowledge/reviews/runs/${runs}-${k}/run.json`)));
    expect(built.grantsExecution).toBe(false);
  });

  it("implements build-company-debt-table (C10) on recorded runs without granting execution or approval", () => {
    const method = library.methods.find(m => m.procedure.id === "build-company-debt-table")!;
    expect(method.procedure.version).toBe("2026.10.23-v1");
    expect(["implemented", "ai_reviewed", "tested"]).toContain(method.procedure.maturity);
    expect(method.procedure.owner.approvedBy).toBeUndefined();
    expect(method.procedure.implementation?.executor).toEqual({module: "@offroad/financial-model", exportName: "prepareDebtTablePacket"});
    expect(method.composition?.authoringStatus).toBe("ready_for_review");
    expect(method.composition?.budget).toEqual({maxModelCalls: 0, maxDurationMs: 31000, maxCostMinorUnits: 0, currency: "BRL"});
    const built = procedureBuildProvenance.find(p => p.procedure.id === "build-company-debt-table")!;
    if (built.schemaVersion !== "compiled-procedure-manifest.v1") throw new Error("compiled manifest expected");
    const calculations = built.components.filter(c => c.executor !== null);
    expect(calculations).toHaveLength(1);
    expect(calculations[0]!.executor).toMatchObject({module: "@offroad/financial-model", exportName: "prepareDebtTablePacket", version: "2026.10.23-v1"});
    expect(calculations[0]!.evidence.map(e => e.path)).toEqual(expect.arrayContaining(["gold", "adversarial", "consistency"].map(k =>
      `packages/credit-playbook/knowledge/reviews/runs/build-company-debt-table-2026-10-23-v1-${k}/run.json`)));
    expect(built.grantsExecution).toBe(false);
  });

  it("compiles the investment-first v5 candidate without replacing or approving the published v4", () => {
    const filename = join(knowledge, "candidates/capital/prepare-capital-structure-decision-2026.10.07-v5.md");
    const candidate = compileMethodDocument(readFileSync(filename, "utf8"), filename);
    expect(candidate.procedure.id).toBe("prepare-capital-structure-decision");
    expect(candidate.procedure.version).toBe("2026.10.07-v5");
    expect(candidate.frontmatter.dependencies).toEqual(["analyze-investment-project", "assess-debt-capacity"]);
    expect(methodMayRunInStaging(candidate)).toBe(false);
    expect(candidate.procedure.owner.approvedBy).toBeUndefined();
    expect(candidate.procedure.implementation).toBeUndefined();
    expect(candidate.composition?.authoringStatus).toBe("incomplete");
    const release = JSON.parse(readFileSync(join(knowledge, "reviews/runs/capital-structure-decision-2026-09-21-v4-publication/manifest.json"), "utf8"));
    const published = library.methods.find(m => m.procedure.id === candidate.procedure.id)!;
    expect(published.sourceHash).toBe(release.source.hash);
    expect(published.procedure.version).toBe("2026.09.21-v4");
  });
});
