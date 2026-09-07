import {describe, expect, it} from "vitest";

import {advisorReceivablesProgress} from "./receivables-progress";

const stages = [
  {id: "portfolio_diagnostics", state: "complete"},
  {id: "evidence_reconciliation", state: "complete"},
  {id: "eligibility_analysis", state: "in_progress"},
  {id: "structure_sizing", state: "waiting"},
  {id: "cash_waterfall", state: "waiting"},
  {id: "full_underwriting", state: "waiting"},
];

function summary(progress: unknown) {
  return {case_state: {receivablesVertical: {methodReadiness: {progress}}}};
}

describe("advisor receivables progress", () => {
  it("reads a consistent progressive-underwriting state", () => {
    expect(advisorReceivablesProgress(summary({completed: 2, total: 6, currentStageId: "eligibility_analysis", stages}))).toEqual({
      completed: 2,
      total: 6,
      currentStageId: "eligibility_analysis",
      stages,
    });
  });

  it("rejects duplicate stages and mismatched completion counts", () => {
    expect(advisorReceivablesProgress(summary({completed: 2, total: 6, currentStageId: null, stages: [stages[0], stages[0], ...stages.slice(2)]}))).toBeNull();
    expect(advisorReceivablesProgress(summary({completed: 4, total: 6, currentStageId: "eligibility_analysis", stages}))).toBeNull();
  });

  it("rejects an active stage that is not marked in progress", () => {
    expect(advisorReceivablesProgress(summary({completed: 2, total: 6, currentStageId: "structure_sizing", stages}))).toBeNull();
  });

  it("does not render the surface for unrelated or malformed summaries", () => {
    expect(advisorReceivablesProgress({})).toBeNull();
    expect(advisorReceivablesProgress(summary({completed: 0, total: 6, currentStageId: null, stages: []}))).toBeNull();
  });
});
