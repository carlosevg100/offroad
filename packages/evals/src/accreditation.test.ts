import {growthCapexProcedures} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";

import {assessProcedurePromotion, goldCasePortfolio, goldCaseRequirementSchema, promotionEvidenceSchema} from "./accreditation";

const fingerprint = "a".repeat(64);
const evidence = (procedureId: string, procedureVersion: string) => promotionEvidenceSchema.parse({
  procedureId,
  procedureVersion,
  unit: {passed: true, runId: "unit-1"},
  integration: {passed: true, runId: "integration-1"},
  goldCases: [{caseId: "corporate-growth-clean", passed: true, reportFingerprint: fingerprint}],
  adversarialCases: [{caseId: "corporate-growth-adversarial", passed: true, reportFingerprint: fingerprint}],
  independentReview: {passed: true, reviewer: "independent-qc", reviewedAt: "2026-08-25T12:00:00.000Z"},
});

describe("institutional procedure accreditation", () => {
  it("keeps an explicit portfolio of live, partial and planned cases", () => {
    expect(goldCasePortfolio.map((item) => goldCaseRequirementSchema.parse(item))).toHaveLength(18);
    expect(new Set(goldCasePortfolio.map((item) => item.status))).toEqual(new Set(["live", "partial", "planned"]));
    expect(goldCasePortfolio.find((item) => item.id === "receivables-portfolio-exhaustion")?.caveat).toMatch(/FIDC/);
  });

  it("blocks a procedure when versioned policy data is still unresolved", () => {
    const procedure = growthCapexProcedures.find((item) => item.id === "size-capacity-and-sources-uses")!;
    const assessment = assessProcedurePromotion({procedure, evidence: evidence(procedure.id, procedure.version), productionProcedureIds: procedure.dependencies});
    expect(assessment.eligible).toBe(false);
    expect(assessment.blockers.join(" ")).toMatch(/reference data unresolved/);
  });

  it("requires exact version evidence and production dependencies", () => {
    const procedure = growthCapexProcedures.find((item) => item.id === "extract-evidence-ledger")!;
    const report = {...evidence(procedure.id, "stale-version"), procedureVersion: "stale-version"};
    const assessment = assessProcedurePromotion({procedure, evidence: report, productionProcedureIds: []});
    expect(assessment.eligible).toBe(false);
    expect(assessment.blockers).toContain("evidence does not match the exact procedure version");
    expect(assessment.blockers.join(" ")).toMatch(/dependencies not in production/);
  });

  it("requires template review for material procedures", () => {
    const procedure = growthCapexProcedures.find((item) => item.id === "compile-institutional-credit-memo")!;
    const assessment = assessProcedurePromotion({procedure, evidence: evidence(procedure.id, procedure.version), productionProcedureIds: procedure.dependencies});
    expect(assessment.blockers).toContain("template review is missing or failed");
  });
});
