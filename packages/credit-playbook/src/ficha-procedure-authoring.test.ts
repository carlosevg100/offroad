import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {compileMethodDocument, loadMethodLibrary, methodMayRunInStaging} from "./procedure-markdown";

const knowledge = join(import.meta.dirname, "../knowledge");
const library = loadMethodLibrary(join(knowledge, "procedures"));
const ids = ["compare-financing-proposals", "analyze-relative-debt-cost", "assess-debt-capacity", "analyze-investment-project"];

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
