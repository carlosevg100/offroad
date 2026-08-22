import {describe, expect, it} from "vitest";

import type {FactCandidate} from "./facts";
import {reconcileCase} from "./index";

const candidate = (fieldPath: string, value: string, sourceDocument: string, extra: Partial<FactCandidate> = {}): FactCandidate => ({
  fieldPath,
  normalizedValue: value,
  valueType: "text",
  sourceDocument,
  evidenceRank: 5,
  informationClass: "management",
  confidence: 0.9,
  anchorVerified: true,
  ...extra,
});

/** Nimbus's deck: the management table and the cap table both list the founders. */
describe("people named twice in one room", () => {
  it("merges controllers with the same name into one row, keeping the share", () => {
    const report = reconcileCase({
      archetypeId: "venture_debt",
      candidates: [
        candidate("company.controllers.1.name", "Ana Ribeiro", "deck"),
        candidate("company.controllers.1.ownership_pct", "0.28", "deck", {valueType: "number"}),
        candidate("company.controllers.2.name", "Horizonte Capital Growth FIP", "deck"),
        candidate("company.controllers.2.ownership_pct", "0.25", "deck", {valueType: "number"}),
        candidate("company.controllers.3.name", "Ana Ribeiro", "deck"),
        candidate("company.controllers.3.ownership_pct", "0.28", "deck", {valueType: "number"}),
        candidate("company.management.1.name", "Ana Ribeiro", "deck"),
        candidate("company.management.1.title", "Diretora-presidente", "deck"),
        candidate("company.management.2.name", "Ana Ribeiro", "carta"),
        candidate("company.management.2.title", "Fundadora, CEO", "carta"),
      ],
      documents: [{id: "deck", kind: "investor_deck"}, {id: "carta", kind: "capital_request_letter"}],
    });
    const controllers = report.facts.filter((fact) => fact.key.fieldPath.startsWith("company.controllers."));
    expect(controllers.map((fact) => fact.key.fieldPath).sort()).toEqual(["company.controllers.1.name", "company.controllers.1.ownership_pct", "company.controllers.2.name", "company.controllers.2.ownership_pct"]);
    const management = report.facts.filter((fact) => fact.key.fieldPath.startsWith("company.management."));
    expect(management.map((fact) => fact.key.fieldPath).sort()).toEqual(["company.management.1.name", "company.management.1.title"]);
    // The two titles disagree: the conflict stays on the fact instead of a second person appearing.
    expect(management.find((fact) => fact.key.fieldPath.endsWith(".title"))?.conflicts.length).toBe(1);
  });
});
