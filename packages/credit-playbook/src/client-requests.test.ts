import {describe, expect, it} from "vitest";

import {assessSufficiency} from "./sufficiency";
import {planClientRequests} from "./client-requests";

describe("progressive client information requests", () => {
  it("shows no more than four current requests by default", () => {
    const report = assessSufficiency("growth_expansion", []);
    const plan = planClientRequests(report);
    expect(plan.current.length).toBeLessThanOrEqual(4);
    expect(plan.current.every(({status}) => ["now", "structuring"].includes(status.stage) && !status.satisfied)).toBe(true);
  });

  it("never exposes diligence or closing as a current client task", () => {
    const report = assessSufficiency("growth_expansion", []);
    const plan = planClientRequests(report, {batchSize: 5});
    expect(plan.current.every(({status}) => status.stage !== "diligence" && status.stage !== "closing")).toBe(true);
    expect(plan.roadmap.diligence.total).toBeGreaterThan(0);
    expect(plan.roadmap.closing.total).toBeGreaterThan(0);
  });

  it("moves to structuring depth only after the opening batch is satisfied", () => {
    const initial = assessSufficiency("growth_expansion", []);
    const answers = Object.fromEntries(
      initial.byStage.now
        .filter((status) => status.requirement.source === "information")
        .map((status) => [status.requirement.id, "Informação fornecida"]),
    );
    const documents = initial.byStage.now.flatMap((status, index) =>
      status.requirement.satisfiedBy[0] ? [{id: `doc-${index}`, kind: status.requirement.satisfiedBy[0]}] : [],
    );
    const report = assessSufficiency("growth_expansion", documents, answers);
    expect(report.byStage.now.every((status) => status.satisfied)).toBe(true);
    expect(planClientRequests(report).current.every(({status}) => status.stage === "structuring")).toBe(true);
  });

  it("does not ask for information already found in uploaded documents", () => {
    const empty = assessSufficiency("growth_expansion", []);
    const documentRequirement = empty.byStage.now.find((status) => status.requirement.satisfiedBy.length > 0);
    expect(documentRequirement).toBeDefined();

    const documentKind = documentRequirement!.requirement.satisfiedBy[0]!;
    const report = assessSufficiency("growth_expansion", [{id: "uploaded", kind: documentKind}]);
    const plan = planClientRequests(report, {batchSize: 5});

    expect(plan.current.some(({status}) => status.requirement.id === documentRequirement!.requirement.id)).toBe(false);
    expect(plan.resolved.some((status) => status.requirement.id === documentRequirement!.requirement.id)).toBe(true);
  });

  it("enforces the absolute five-item ceiling", () => {
    const report = assessSufficiency("growth_expansion", []);
    expect(planClientRequests(report, {batchSize: 99}).current).toHaveLength(Math.min(5, report.byStage.now.length));
  });

  it("keeps an unavailable item open so the desk can adapt the next action", () => {
    const empty = assessSufficiency("growth_expansion", []);
    const first = empty.byStage.now[0]!;
    const report = assessSufficiency("growth_expansion", [], {}, {
      [first.requirement.id]: {response: "unavailable", note: "A companhia não produz este relatório."},
    });
    const status = report.requirements.find((entry) => entry.requirement.id === first.requirement.id)!;
    expect(status.satisfied).toBe(false);
    expect(status.response).toBe("unavailable");
  });
});
