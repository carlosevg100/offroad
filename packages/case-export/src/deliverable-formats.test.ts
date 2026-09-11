import {describe, expect, it} from "vitest";
import {projectCapabilityRegistry, projectDeliverableTypeSchema} from "@offroad/work-plan";
import {
  availableDeliverableFormats,
  deliverableFormatAllowed,
  deliverableFormatBlockCopy,
  deliverableFormatDecisions,
  deliverableFormatOrder,
  deliverableFormatPolicy,
  deliverableFormatPolicyVersion,
  type DeliverableContext,
  type DeliverableType,
} from "./deliverable-formats";

const current: DeliverableContext = {resultState: "current", accessCurrent: true, reproduction: "approved", tabularContract: true, narrativeStructure: true};
const financial: readonly DeliverableType[] = ["financial_model", "financial_memo", "executive_presentation"];

describe("delivery format policy", () => {
  it("is versioned and covers exactly the deliverable types the capability registry declares", () => {
    expect(deliverableFormatPolicyVersion).toMatch(/^\d{4}\.\d{2}\.\d{2}-/);
    expect(Object.keys(deliverableFormatPolicy).sort()).toEqual([...projectDeliverableTypeSchema.options].sort());
    const declared = new Set(projectCapabilityRegistry.flatMap(entry => entry.deliverableTypes));
    for (const type of declared) expect(deliverableFormatPolicy[type].length).toBeGreaterThan(0);
  });

  it("gives documentary work an editable document and a final PDF, and nothing else", () => {
    expect(availableDeliverableFormats(["documentary_reading"], current)).toEqual(["docx", "pdf"]);
    const decisions = deliverableFormatDecisions(["documentary_reading"], current);
    expect(decisions.map(decision => decision.role)).toEqual(["editable", "final"]);
    for (const decision of decisions) {
      expect(decision.conditions).toContain("approved_content_and_sources");
      expect(decision.conditions).toContain("dates_sources_and_unknown_criteria_preserved");
    }
  });

  it("gives a financial result the workbook, the deck, the memo and its PDF in one stable order", () => {
    expect(availableDeliverableFormats(financial, current)).toEqual(["xlsx", "pptx", "docx", "pdf"]);
    const decisions = deliverableFormatDecisions(financial, current);
    expect(decisions.map(decision => decision.format)).toEqual(deliverableFormatOrder.filter(format => format !== "interactive"));
    expect(decisions.find(decision => decision.format === "xlsx")!.role).toBe("formulas");
    expect(decisions.find(decision => decision.format === "pptx")!.conditions).toContain("narrative_structure_required");
    for (const decision of decisions) expect(decision.conditions).toContain("reproduction_approved");
  });

  it("reads research in the product first and never offers a spreadsheet without a tabular contract", () => {
    expect(availableDeliverableFormats(["market_research"], current)).toEqual(["interactive", "xlsx", "docx", "pdf"]);
    const withoutTable = deliverableFormatDecisions(["market_research"], {...current, tabularContract: false});
    const spreadsheet = withoutTable.find(decision => decision.format === "xlsx")!;
    expect(spreadsheet.available).toBe(false);
    expect(spreadsheet.block).toBe("no_tabular_contract");
    expect(withoutTable.filter(decision => decision.available).map(decision => decision.format)).toEqual(["interactive", "docx", "pdf"]);
  });

  it("keeps the memo PDF when the delivery has no presentation structure and drops the deck", () => {
    const decisions = deliverableFormatDecisions(financial, {...current, narrativeStructure: false});
    const deck = decisions.find(decision => decision.format === "pptx")!;
    const pdf = decisions.find(decision => decision.format === "pdf")!;
    expect(deck.available).toBe(false);
    expect(deck.block).toBe("no_narrative_structure");
    expect(pdf.available).toBe(true);
    expect(pdf.role).toBe("final");
    // The PDF is available as a memo, so it never advertises the deck's own requirement.
    expect(pdf.conditions).not.toContain("narrative_structure_required");
  });

  it("blocks every format when reproduction of the approved numbers diverges", () => {
    const decisions = deliverableFormatDecisions(financial, {...current, reproduction: "diverged"});
    expect(decisions.every(decision => !decision.available)).toBe(true);
    expect(new Set(decisions.map(decision => decision.block))).toEqual(new Set(["reproduction_divergence"]));
    expect(deliverableFormatAllowed(financial, "xlsx", {...current, reproduction: "diverged"})).toEqual({allowed: false, block: "reproduction_divergence"});
  });

  it("never offers a superseded, preparing or unreleased result as the current one", () => {
    for (const [state, block] of [["superseded", "result_superseded"], ["preparing", "result_preparing"], ["unavailable", "result_unavailable"]] as const) {
      const decisions = deliverableFormatDecisions(financial, {...current, resultState: state});
      expect(decisions.every(decision => decision.available)).toBe(false);
      expect(new Set(decisions.map(decision => decision.block))).toEqual(new Set([block]));
    }
  });

  it("stops a download whose access is no longer current before any other condition", () => {
    expect(deliverableFormatAllowed(["documentary_reading"], "docx", {...current, accessCurrent: false})).toEqual({allowed: false, block: "access_expired"});
    expect(availableDeliverableFormats(financial, {...current, accessCurrent: false})).toEqual([]);
  });

  it("refuses a format the policy never declared for the deliverable, including a copied link", () => {
    expect(deliverableFormatAllowed(["documentary_reading"], "xlsx", current)).toEqual({allowed: false, block: "format_not_in_policy"});
    expect(deliverableFormatAllowed(["documentary_reading"], "pptx", current)).toEqual({allowed: false, block: "format_not_in_policy"});
    expect(deliverableFormatAllowed(["market_research"], "docx", current)).toEqual({allowed: true});
  });

  it("explains every block in both languages without an em dash or a promise of approval", () => {
    const blocks = new Set(deliverableFormatDecisions(["market_research", ...financial], {resultState: "superseded", accessCurrent: false, reproduction: "diverged", tabularContract: false, narrativeStructure: false}).map(decision => decision.block));
    expect(blocks.size).toBeGreaterThan(0);
    for (const [code, copy] of Object.entries(deliverableFormatBlockCopy)) {
      expect(copy.pt.length, code).toBeGreaterThan(20);
      expect(copy.en.length, code).toBeGreaterThan(20);
      expect(`${copy.pt} ${copy.en}`).not.toContain("—");
      expect(`${copy.pt} ${copy.en}`.toLowerCase()).not.toMatch(/aprova(ção|do) garantid|guaranteed approval|will be funded/);
    }
  });
});
