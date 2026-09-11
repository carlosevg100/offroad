import {describe, expect, it} from "vitest";
import {availableDeliverableFormats, deliverableFormatDecisions} from "@offroad/case-export/deliverable-formats";

import {institutionalResultDeliverableContext, institutionalResultDeliverableTypes} from "./institutional-result-formats";
import type {InstitutionalModelResult} from "./institutional-model-results";

const artifact = {institutional: {scenarios: [{configurationId: "c1"}]}} as unknown as InstitutionalModelResult["artifact"];
const result = (overrides: Partial<InstitutionalModelResult> = {}): InstitutionalModelResult => ({
  id: "00000000-0000-4000-8000-000000000001", status: "completed", configurationId: "00000000-0000-4000-8000-000000000002",
  configurationFingerprint: "a".repeat(64), sourceManifestFingerprint: "b".repeat(64), artifact, blockers: [],
  createdAt: "2026-09-10T00:00:00.000Z", ...overrides,
});

describe("financial result delivery context", () => {
  it("offers the workbook, the deck, the memo and its PDF for a verified approved result", () => {
    expect(availableDeliverableFormats(institutionalResultDeliverableTypes, institutionalResultDeliverableContext(result())))
      .toEqual(["xlsx", "pptx", "docx", "pdf"]);
  });

  it("never presents a superseded result as the current one", () => {
    const decisions = deliverableFormatDecisions(institutionalResultDeliverableTypes, institutionalResultDeliverableContext(result({status: "stale", artifact: null})));
    expect(decisions.some(decision => decision.available)).toBe(false);
    expect(new Set(decisions.map(decision => decision.block))).toEqual(new Set(["result_superseded"]));
  });

  it("offers nothing while the calculation is queued or blocked", () => {
    for (const status of ["queued", "blocked"] as const) {
      expect(availableDeliverableFormats(institutionalResultDeliverableTypes, institutionalResultDeliverableContext(result({status, artifact: null})))).toEqual([]);
    }
  });

  it("blocks every file when the reproduction of the approved numbers diverges", () => {
    const context = institutionalResultDeliverableContext(result(), {reproduction: "diverged"});
    expect(availableDeliverableFormats(institutionalResultDeliverableTypes, context)).toEqual([]);
    expect(deliverableFormatDecisions(institutionalResultDeliverableTypes, context).every(decision => decision.block === "reproduction_divergence")).toBe(true);
  });

  it("blocks every file when access is no longer current", () => {
    expect(availableDeliverableFormats(institutionalResultDeliverableTypes, institutionalResultDeliverableContext(result(), {accessCurrent: false}))).toEqual([]);
  });

  it("withholds the spreadsheet when the verified workbook contract is absent", () => {
    const decisions = deliverableFormatDecisions(institutionalResultDeliverableTypes, {...institutionalResultDeliverableContext(result()), tabularContract: false});
    expect(decisions.find(decision => decision.format === "xlsx")!.block).toBe("no_tabular_contract");
    expect(decisions.filter(decision => decision.available).map(decision => decision.format)).toEqual(["pptx", "docx", "pdf"]);
  });
});
