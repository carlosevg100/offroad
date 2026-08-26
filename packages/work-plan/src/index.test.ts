import {describe, expect, it} from "vitest";
import {projectWorkPlan} from "./index";

const event = (stage: string, status: "started" | "succeeded" | "failed" | "skipped", extra: Record<string, unknown> = {}) => ({
  stage,
  status,
  job_id: "job-1",
  source_document_id: stage.startsWith("case:") || stage.includes("retrieval") ? null : "document-1",
  at: "2026-08-26T12:00:00.000Z",
  detail: extra,
});

describe("work plan projection", () => {
  it("keeps tasks pending until the real completion event is persisted", () => {
    const plan = projectWorkPlan({events: [event("download", "succeeded"), event("gate", "started")], expectedDocumentCount: 1});
    expect(plan.tasks[0]).toMatchObject({id: "secure_documents", status: "running", completedUnits: 0, totalUnits: 1});
    expect(plan.completionPercent).toBe(0);
  });

  it("requires every document unit before completing a document task", () => {
    const plan = projectWorkPlan({events: [
      event("gate", "succeeded"),
      {...event("gate", "started"), job_id: "job-2", source_document_id: "document-2"},
    ], expectedDocumentCount: 2});
    expect(plan.tasks[0]).toMatchObject({status: "running", completedUnits: 1, totalUnits: 2});
  });

  it("maps an economic hold to blocked without exposing any output", () => {
    const plan = projectWorkPlan({events: [
      event("case:structure", "started"),
      event("case:structure", "failed", {outcome: "blocked", code: "material_evidence_missing", private: "never rendered"}),
    ]});
    expect(plan.tasks.find((task) => task.id === "evaluate_structures")).toMatchObject({
      status: "blocked",
      code: "material_evidence_missing",
    });
    expect(JSON.stringify(plan)).not.toContain("never rendered");
  });

  it("completes the case sequence from actual terminal stage events", () => {
    const stages = [
      "case:extraction", "case:reconciliation", "case:metrics", "case:gaps", "case:structure",
      "case:red_flags", "case:claims", "case:materials", "case:language_conduct", "case:matching",
      "mandate_retrieval", "case:outcome",
    ];
    const plan = projectWorkPlan({events: stages.map((stage) => event(stage, "succeeded"))});
    expect(plan.tasks.filter((task) => task.id !== "research_public_context").slice(4).every((task) => task.status === "completed")).toBe(true);
    expect(plan.activeTaskId).toBe("secure_documents");
  });
});
