import {describe, expect, it} from "vitest";
import {economicSituations} from "@offroad/credit-playbook";

import {
  assessDepthPackPromotion,
  auditDepthPackRegistry,
  depthPackById,
  inferDepthPackActivationKeys,
  mapDepthRequirementsToTasks,
  selectDepthPacks,
  validatedDcmDepthPacks,
} from "./index";

const fingerprint = "a".repeat(64);

describe("DCM depth-pack registry", () => {
  it("resolves every procedure, calculation and dependency", () => {
    expect(auditDepthPackRegistry()).toEqual({valid: true, errors: []});
    expect(validatedDcmDepthPacks.length).toBeGreaterThanOrEqual(14);
    expect(validatedDcmDepthPacks.every((pack) => pack.maturity !== "production")).toBe(true);
  });

  it("covers the Pareto objectives and transversal analysis domains", () => {
    expect([...depthPackById.keys()]).toEqual(expect.arrayContaining([
      "objective.refinance-liability-management",
      "objective.liquidity-working-capital",
      "objective.capex-expansion",
      "objective.acquisition-finance",
      "analysis.collateral-security",
      "analysis.covenants",
      "analysis.downside-sensitivities",
      "jurisdiction.brazil",
      "jurisdiction.united-states",
    ]));
  });

  it("composes refinance + Brazil + debenture + covenants without a bespoke solution", () => {
    const result = selectDepthPacks({activationKeys: [
      "objective:refinancing",
      "analysis:covenants",
      "analysis:downside",
      "jurisdiction:BR",
      "instrument:BR:debenture",
    ]});
    expect(result.unmatchedActivationKeys).toEqual([]);
    expect(result.selectedPackIds).toEqual(expect.arrayContaining([
      "core.institutional-dcm",
      "objective.refinance-liability-management",
      "analysis.covenants",
      "analysis.downside-sensitivities",
      "jurisdiction.brazil",
      "instrument.br-capital-markets",
    ]));
    expect(result.profile.requirements.map((item) => item.key)).toEqual(expect.arrayContaining([
      "refi.maturity-wall", "refi.exit-cost", "covenant.literal-definition", "downside.breakpoint", "br.eligibility-regulation",
    ]));
    expect(result.profile.calculationIds).toContain("structure.maturity_concentration");
    expect(result.profile.minimumMaturity).toBe("implemented");
  });

  it("composes a US acquisition financing path with bank and private-credit alternatives", () => {
    const result = selectDepthPacks({activationKeys: [
      "objective:acquisition", "analysis:downside", "jurisdiction:US", "instrument:US:term_loan", "instrument:US:private_credit",
    ]});
    expect(result.selectedPackIds).toEqual(expect.arrayContaining([
      "objective.acquisition-finance", "jurisdiction.united-states", "instrument.us-bank-loan", "instrument.us-private-credit",
    ]));
    expect(result.profile.structureTermKeys).toEqual(expect.arrayContaining(["purchase_price", "takeout", "spread_grid", "call_protection"]));
  });

  it("does not hide an economic situation for which no pack exists", () => {
    const result = selectDepthPacks({activationKeys: ["situation:rescue_or_dip"]});
    expect(result.unmatchedActivationKeys).toEqual(["situation:rescue_or_dip"]);
    expect(economicSituations.find((item) => item.key === "rescue_or_dip")).toMatchObject({status: "catalogued", packId: null});
  });

  it("rejects unknown explicit packs", () => {
    expect(() => selectDepthPacks({explicitPackIds: ["instrument.imaginary"]})).toThrow("unknown depth pack instrument.imaginary");
  });

  it("activates only economic lenses stated in Portuguese or English", () => {
    expect(inferDepthPackActivationKeys("Quero refinanciar a dívida em BRL, alongar vencimentos e testar covenants no downside."))
      .toEqual(expect.arrayContaining(["objective:refinancing", "analysis:covenants", "analysis:downside", "jurisdiction:BR"]));
    expect(inferDepthPackActivationKeys("Please assess a US unitranche acquisition financing."))
      .toEqual(expect.arrayContaining(["objective:acquisition", "instrument:US:private_credit", "jurisdiction:US"]));
    expect(inferDepthPackActivationKeys("Ajude a entender a companhia.")).toEqual([]);
  });

  it("binds coverage only to TaskSpecs available in the compiled job", () => {
    const {profile} = selectDepthPacks({activationKeys: ["objective:refinancing", "analysis:covenants"]});
    const mapping = mapDepthRequirementsToTasks(profile, ["M01", "C03", "C05", "C08", "S08"]);
    expect(mapping.C05).toContain("refi.maturity-wall");
    expect(mapping.S08).toEqual(expect.arrayContaining(["covenant.literal-definition", "covenant.headroom"]));
    expect(mapping).not.toHaveProperty("S04");
  });
});

describe("production accreditation", () => {
  it("refuses the expert claim when independent and benchmark gates fail", () => {
    const candidate = depthPackById.get("objective.refinance-liability-management")!;
    const result = assessDepthPackPromotion(candidate, {
      packId: candidate.id,
      packVersion: candidate.version,
      unit: {passed: true, runId: "unit-1"},
      integration: {passed: true, runId: "integration-1"},
      goldCases: [{caseId: "refi-clean", passed: true, reportFingerprint: fingerprint}, {caseId: "refi-dirty", passed: true, reportFingerprint: fingerprint}],
      adversarialCases: [{caseId: "refi-hostile", passed: true, reportFingerprint: fingerprint}],
      generalistBenchmark: {benchmarkId: "best-generalist", passed: false, runId: "benchmark-1", materialAdvantage: "No material advantage was demonstrated."},
      bilingualIdentityPassed: true,
      expertReview: {passed: false, reviewer: "Independent DCM reviewer", reviewedAt: "2026-09-03T12:00:00.000Z"},
    });
    expect(result.eligibleForProduction).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "generalist benchmark did not show material advantage",
      "independent expert review failed",
    ]));
  });

  it("also requires legal review for instrument and jurisdiction packs", () => {
    const candidate = depthPackById.get("instrument.us-bank-loan")!;
    const result = assessDepthPackPromotion(candidate, {
      packId: candidate.id,
      packVersion: candidate.version,
      unit: {passed: true, runId: "unit-1"},
      integration: {passed: true, runId: "integration-1"},
      goldCases: [{caseId: "us-loan-clean", passed: true, reportFingerprint: fingerprint}, {caseId: "us-loan-dirty", passed: true, reportFingerprint: fingerprint}],
      adversarialCases: [{caseId: "us-loan-hostile", passed: true, reportFingerprint: fingerprint}],
      generalistBenchmark: {benchmarkId: "best-generalist", passed: true, runId: "benchmark-1", materialAdvantage: "Caught covenant basket interaction missed by baseline."},
      bilingualIdentityPassed: true,
      expertReview: {passed: true, reviewer: "Independent DCM reviewer", reviewedAt: "2026-09-03T12:00:00.000Z"},
    });
    expect(result.blockers).toContain("legal/regulatory review is missing or failed");
  });
});
