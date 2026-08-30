import {describe, expect, it} from "vitest";

import type {OperationTruthSet} from "./operation";
import type {StructureTruthSet} from "./structure";
import {
  buildStructureDecision,
  compileStructureAlternatives,
  fingerprintStructureAlternative,
  fingerprintStructureVerificationContext,
  type StructureAlternativeDraft,
} from "./alternatives";

const operationTruth = {
  version: "operation-v1",
  status: "complete",
  sourcesAndUses: {status: "pass", totalSources: "100000000", totalUses: "100000000"},
} as OperationTruthSet;
const structureTruth = {
  version: "structure-v1",
  status: "partial",
  proposal: {instrument: "ccb", amount: "100000000", termMonths: 48, graceMonths: 6, amortizationFormat: "sac"},
  capacityEnvelope: {amount: "100000000"},
  dayOne: {passes: true},
} as StructureTruthSet;
const instruments = [{instrument: {id: "ccb"}, eligible: true}] as unknown as import("@offroad/credit-playbook").InstrumentVerdict[];
const verificationFor = (draft: StructureAlternativeDraft, truth = structureTruth) => ({
  alternativeFingerprint: fingerprintStructureAlternative(draft),
  contextFingerprint: fingerprintStructureVerificationContext(operationTruth, structureTruth),
  verifierVersion: "deterministic-v1",
  verifiedAt: "2026-08-29T12:00:00Z",
  operationTruth,
  structureTruth: truth,
});
const line = (id: string, label: string, amount: string, origin: "calculation" | "proposal") => ({
  id, label, amount, origin, basisIds: [`basis.${id}`], condition: origin === "proposal" ? "proposed" as const : "available" as const,
});
const alternative = (id: string, amount = "100000000"): StructureAlternativeDraft => ({
  id,
  label: id === "ccb" ? "CCB garantida" : "Debênture restrita",
  instrument: id,
  route: id,
  amount,
  currency: "BRL",
  termMonths: 48,
  graceMonths: 6,
  amortization: "sac",
  indexer: "CDI",
  targetBuyer: "private_credit_funds",
  rationale: "The repayment profile follows downside cash generation.",
  pros: ["Shorter execution"],
  cons: ["Higher fixed costs"],
  assumptions: ["Security is available"],
  sources: [line("new-debt", "New debt", amount, "proposal")],
  uses: [line("capex", "Capex", amount, "calculation")],
  security: [{description: "Receivables fiduciary assignment", basisIds: ["ES-11"]}],
  covenants: [{description: "Minimum DSCR", basisIds: ["ES-24"]}],
  conditionsPrecedent: [{description: "Corporate approvals", owner: "company", basisIds: ["ES-42"]}],
  implementationDays: {min: 30, max: 45, basisIds: ["ES-44"]},
  basisIds: ["C10", "ES-45"],
});

describe("structure alternatives and company decision", () => {
  it("compares alternatives, preserves pricing abstention and releases only material preparation", () => {
    const ccb = alternative("ccb");
    const debenture = alternative("debenture");
    const alternatives = compileStructureAlternatives({
      proposal: {
        alternatives: [ccb, debenture],
        recommendation: {
          alternativeId: "ccb",
          rationale: "The CCB is the simplest viable route for the current ticket and timetable.",
          basisIds: ["ES-41", "ES-45"],
          proposedBy: "structure-desk-v1",
          proposedAt: "2026-08-29T12:00:00Z",
        },
      },
      operationTruth,
      structureTruth,
      instruments: [...instruments, {instrument: {id: "debenture"}, eligible: true} as never],
      verificationByAlternative: {
        ccb: verificationFor(ccb),
        debenture: verificationFor(debenture, {...structureTruth, proposal: {...structureTruth.proposal, instrument: "debenture"}}),
      },
      pricingByAlternative: {
        ccb: {decision: "reference_available", policyVersion: "pricing-v1", spreadBps: {min: 300, max: 400}, totalRate: {min: "0.14", max: "0.15"}, annualizedCostBps: 40, componentIds: ["legal"], missingInputs: []},
        debenture: {decision: "abstain", policyVersion: "pricing-v1", spreadBps: null, totalRate: null, annualizedCostBps: null, componentIds: [], missingInputs: ["three_independent_comps"]},
      },
    });
    expect(alternatives.status).toBe("pending_confirmation");
    expect(alternatives.alternatives.find((item) => item.id === "ccb")?.status).toBe("comparable");
    expect(alternatives.alternatives.find((item) => item.id === "debenture")?.status).toBe("incomplete");
    expect(alternatives.procedureCoverage).toHaveLength(12);

    const pending = buildStructureDecision(alternatives, null);
    expect(pending).toMatchObject({status: "pending_confirmation", materialsPreparationAllowed: false, externalContactAuthorized: false});
    const confirmed = buildStructureDecision(alternatives, {
      decision: "confirm",
      selectedAlternativeId: "ccb",
      proposalFingerprint: alternatives.proposalFingerprint!,
      actorId: "company-user-1",
      decidedAt: "2026-08-29T12:10:00Z",
    });
    expect(confirmed).toMatchObject({status: "confirmed", materialsPreparationAllowed: true, externalContactAuthorized: false, qualifiedIntroductionAuthorized: false});
  });

  it("fails closed on an unbalanced or oversized alternative", () => {
    const draft = alternative("ccb", "120000000");
    draft.uses[0] = {...draft.uses[0]!, amount: "100000000"};
    const alternatives = compileStructureAlternatives({
      proposal: {
        alternatives: [draft],
        recommendation: {alternativeId: "ccb", rationale: "Candidate", basisIds: ["ES-45"], proposedBy: "desk", proposedAt: "2026-08-29T12:00:00Z"},
      },
      operationTruth,
      structureTruth,
      instruments,
      verificationByAlternative: {
        ccb: verificationFor(draft),
      },
    });
    expect(alternatives.status).toBe("blocked");
    expect(alternatives.alternatives[0]).toMatchObject({confirmationEligible: false, status: "blocked"});
    expect(alternatives.alternatives[0]?.blockers).toEqual(expect.arrayContaining(["alternative_sources_and_uses_not_closed", "alternative_exceeds_capacity_envelope"]));
    expect(buildStructureDecision(alternatives, null).materialsPreparationAllowed).toBe(false);
  });

  it("rejects stale confirmation after the proposal changes", () => {
    const ccb = alternative("ccb");
    const alternatives = compileStructureAlternatives({
      proposal: {
        alternatives: [ccb],
        recommendation: {alternativeId: "ccb", rationale: "Candidate", basisIds: ["ES-45"], proposedBy: "desk", proposedAt: "2026-08-29T12:00:00Z"},
      },
      operationTruth,
      structureTruth,
      instruments,
      verificationByAlternative: {
        ccb: verificationFor(ccb),
      },
    });
    const decision = buildStructureDecision(alternatives, {
      decision: "confirm",
      selectedAlternativeId: "ccb",
      proposalFingerprint: "0".repeat(64),
      actorId: "company-user-1",
      decidedAt: "2026-08-29T12:10:00Z",
    });
    expect(decision).toMatchObject({status: "stale", materialsPreparationAllowed: false, externalContactAuthorized: false});
  });

  it("never trusts route or day-one assertions from the proposal itself", () => {
    const ccb = alternative("ccb");
    const alternatives = compileStructureAlternatives({
      proposal: {alternatives: [ccb], recommendation: {alternativeId: "ccb", rationale: "Candidate", basisIds: ["ES-45"], proposedBy: "desk", proposedAt: "2026-08-29T12:00:00Z"}},
      operationTruth,
      structureTruth,
      instruments: [{instrument: {id: "ccb"}, eligible: false} as never],
    });
    expect(alternatives.alternatives[0]).toMatchObject({confirmationEligible: false});
    expect(alternatives.alternatives[0]?.blockers).toContain("ineligible_financing_route");
    expect(alternatives.alternatives[0]?.missingInputs).toContain("alternative.deterministic_verification");
  });
});
