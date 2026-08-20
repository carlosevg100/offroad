import {describe, expect, it} from "vitest";
import {documentKindSchema, resolveFieldPath} from "@offroad/credit-ontology";

import {archetype, archetypes} from "./archetypes";
import {assessSufficiency, nextStep} from "./sufficiency";
import {archetypeIdSchema} from "./types";

describe("playbook integrity", () => {
  it("names only document kinds the ontology defines", () => {
    // A typo here would silently produce a requirement nothing can ever discharge — a company
    // asked forever for a document the system cannot recognise.
    for (const definition of archetypes) {
      for (const requirement of definition.requirements) {
        expect(requirement.satisfiedBy.length).toBeGreaterThan(0);
        for (const kind of requirement.satisfiedBy) {
          expect(documentKindSchema.safeParse(kind).success).toBe(true);
        }
      }
    }
  });

  it("cites field paths the ontology can resolve", () => {
    for (const definition of archetypes) {
      for (const focus of definition.focus) {
        for (const path of focus.evidence) {
          // Patterns carry placeholders; resolve a concrete instance of each.
          const concrete = path.replace("{period}", "2025").replace("{i}", "1").replace("{ytd}", "");
          expect(resolveFieldPath(concrete), `${definition.id}/${focus.id}: ${path}`).not.toBeNull();
        }
      }
    }
  });

  it("covers every archetype the schema allows, with unique requirement ids", () => {
    const ids = archetypes.map((a) => a.id).sort();
    expect(ids).toEqual([...archetypeIdSchema.options].sort());
    for (const definition of archetypes) {
      const requirementIds = definition.requirements.map((r) => r.id);
      expect(new Set(requirementIds).size, definition.id).toBe(requirementIds.length);
    }
  });

  it("has a minimum that can actually refuse, and an ideal that adds to it", () => {
    for (const definition of archetypes) {
      const minimum = definition.requirements.filter((r) => r.level === "minimum");
      const ideal = definition.requirements.filter((r) => r.level === "ideal");
      expect(minimum.length, definition.id).toBeGreaterThanOrEqual(5);
      expect(ideal.length, definition.id).toBeGreaterThan(0);
    }
  });

  it("says why every requirement matters, in both languages", () => {
    // A checklist that says what without why is a form. This is the line that keeps it a desk.
    for (const definition of archetypes) {
      for (const requirement of definition.requirements) {
        expect(requirement.rationale.pt.length, requirement.id).toBeGreaterThan(40);
        expect(requirement.rationale.en.length, requirement.id).toBeGreaterThan(40);
      }
    }
  });

  it("keeps every question attached to a focus that exists", () => {
    for (const definition of archetypes) {
      const focusIds = new Set(definition.focus.map((f) => f.id));
      for (const question of definition.questions) {
        expect(focusIds.has(question.focusId), `${definition.id}/${question.id}`).toBe(true);
      }
    }
  });

  it("frames tenor as bands, with the typical inside the outer", () => {
    for (const definition of archetypes) {
      const {typical, outer} = definition.structure.tenorMonths;
      expect(typical[0], definition.id).toBeGreaterThanOrEqual(outer[0]);
      expect(typical[1], definition.id).toBeLessThanOrEqual(outer[1]);
      expect(typical[0]).toBeLessThan(typical[1]);
    }
  });
});

describe("sufficiency", () => {
  const growth = archetype("growth_expansion");

  it("answers the checklist from what was read, not from what was asked", () => {
    const report = assessSufficiency("growth_expansion", [
      {id: "d1", kind: "audited_financial_statements"},
      {id: "d2", kind: "trial_balance"},
      {id: "d3", kind: "debt_schedule"},
      {id: "d4", kind: "company_registration"},
      {id: "d5", kind: "capital_request_letter"},
      {id: "d6", kind: "business_plan"},
    ]);
    expect(report.minimum.complete).toBe(true);
    expect(report.ideal.complete).toBe(false);
    expect(report.missing.every((status) => status.requirement.level === "ideal")).toBe(true);
  });

  it("lets one document discharge more than one requirement", () => {
    // Audited statements carry both the history and the auditor's opinion; asking twice for a
    // file already sent is exactly what makes an intake feel bureaucratic.
    const report = assessSufficiency("growth_expansion", [{id: "d1", kind: "audited_financial_statements"}]);
    const discharged = report.requirements.filter((status) => status.satisfiedBy.includes("d1"));
    expect(discharged.length).toBeGreaterThan(1);
    expect(discharged.map((status) => status.requirement.id)).toContain("financials_historical");
    expect(discharged.map((status) => status.requirement.id)).toContain("auditor_opinion");
  });

  it("puts the minimum first, so the next step is the one that unblocks", () => {
    const report = assessSufficiency("growth_expansion", []);
    expect(report.missing[0]?.requirement.level).toBe("minimum");
    expect(report.minimum.satisfied).toBe(0);
  });

  it("reports documents that matched nothing without treating them as a problem", () => {
    const report = assessSufficiency("working_capital", [
      {id: "d1", kind: "insurance_policy"},
      {id: "d2", kind: "debt_schedule"},
    ]);
    expect(report.unmatchedDocuments).toEqual(["d1"]);
    expect(report.requirements.find((s) => s.requirement.id === "debt_schedule")?.satisfied).toBe(true);
  });

  it("names one next step rather than eleven, and in the user's language", () => {
    const blocked = nextStep(assessSufficiency("growth_expansion", []), "pt");
    expect(blocked.state).toBe("blocked");
    expect(blocked.message).toContain("para abrir o caso");

    const complete = assessSufficiency(
      "growth_expansion",
      growth.requirements.flatMap((requirement, index) => {
        const kind = requirement.satisfiedBy[0];
        return kind ? [{id: `d${index}`, kind}] : [];
      }),
    );
    expect(nextStep(complete, "en").state).toBe("priceable");
    expect(nextStep(complete, "pt").message).toContain("Pacote completo");
  });
});
