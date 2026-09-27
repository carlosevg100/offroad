import {describe, expect, it} from "vitest";

import {evidenceLabels, fieldPathLabel} from "./evidence-labels";

describe("what a claim or a calculation stands on, in words", () => {
  it("names a field by its ontology label and period, and a calculation by its label, never by an identifier", () => {
    expect(fieldPathLabel("historical_financials.2025.ebitda", "pt")).toMatch(/^EBITDA.*\(2025\)$/);
    expect(fieldPathLabel("desk.alavancagem_pre", "pt")).toBeNull();
    const calculations = [{id: "net_debt", labels: {pt: "Dívida líquida", en: "Net debt"}}];
    const labels = evidenceLabels(["net_debt", "historical_financials.2025.ebitda", "historical_financials.2025.ebitda", "desk.alavancagem_pre"], "en", calculations);
    expect(labels[0]).toBe("Net debt");
    expect(labels).toHaveLength(2);
    for (const label of labels) expect(label).not.toMatch(/[a-z]+_[a-z]+|\.[a-z]/);
  });
});
