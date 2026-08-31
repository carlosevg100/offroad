import Decimal from "decimal.js";
import {executeCaseEngine, type CaseEngineState} from "@offroad/case-engine";
import {describe, expect, it} from "vitest";

import {loadRedeHorizonteGold, redeHorizonteCaseInput} from "./rede-horizonte-anchor";
import type {GoldCalculation, GoldMaterial} from "./gold";

const slug = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/^\d+\.\s*/, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

function insideTolerance(actual: string, expected: GoldCalculation): boolean {
  const a = new Decimal(actual);
  const e = new Decimal(expected.value);
  if (expected.tolerance.kind === "exact") return a.eq(e);
  if (expected.tolerance.kind === "absolute") return a.minus(e).abs().lte(expected.tolerance.value);
  if (e.isZero()) return a.isZero();
  return a.minus(e).abs().div(e.abs()).lte(expected.tolerance.value);
}

function calculationValue(state: CaseEngineState, expected: GoldCalculation): string | undefined {
  if (expected.id === "ebitda_ltm_2026_07") {
    return state.reconciliation.facts.find((fact) => fact.key.fieldPath === "interim_financials.2026_07.ebitda_ltm")?.value;
  }
  if (expected.id === "net_debt_2026_07") {
    return state.reconciliation.calculations.find((calculation) => calculation.id === "net_debt")?.value;
  }
  return state.reconciliation.calculations.find((calculation) => calculation.id === expected.id)?.value;
}

function materialSections(material: CaseEngineState["materials"][number]): Set<string> {
  return new Set(material.blocks
    .filter((block): block is Extract<typeof block, {type: "heading"}> => block.type === "heading")
    .map((block) => slug(block.text.pt)));
}

function materialClaimIds(material: CaseEngineState["materials"][number]): Set<string> {
  return new Set(material.blocks
    .filter((block): block is Extract<typeof block, {type: "paragraph"}> => block.type === "paragraph")
    .map((block) => block.claimId)
    .filter((claimId): claimId is string => Boolean(claimId)));
}

function assertMaterialContract(state: CaseEngineState, expected: GoldMaterial) {
  const material = state.materials.find((candidate) => candidate.kind === expected.kind);
  expect(material, `missing material ${expected.kind}`).toBeDefined();
  const sections = materialSections(material!);
  for (const section of expected.requiredSectionIds) expect(sections, `${expected.kind} missing section ${section}`).toContain(section);
  const claims = materialClaimIds(material!);
  for (const claim of expected.requiredClaimIds) expect(claims, `${expected.kind} missing claim ${claim}`).toContain(claim);
  for (const claim of expected.forbiddenClaimIds) expect(claims, `${expected.kind} contains forbidden claim ${claim}`).not.toContain(claim);
}

describe("Rede Horizonte full-case anchor", () => {
  it("crosses all eight domain layers without losing the answer key or overstating readiness", async () => {
    const gold = loadRedeHorizonteGold();
    const baseInput = redeHorizonteCaseInput(gold);
    const initial = await executeCaseEngine(baseInput);
    const proposal = structureProposalFrom(initial.state);
    const proposed = await executeCaseEngine({...baseInput, structureProposal: proposal});
    const proposalFingerprint = proposed.state.structureAlternatives.proposalFingerprint;
    expect(proposalFingerprint).toBeTruthy();
    const result = await executeCaseEngine({
      ...baseInput,
      // This anchor intentionally verifies the production compiler. In the product,
      // the worker only supplies this flag after the exact case, structure and
      // production plan snapshots have all been approved.
      materialsPreparationApproved: true,
      structureProposal: proposal,
      structureConfirmation: {
        decision: "confirm",
        selectedAlternativeId: proposal.alternatives[0]!.id,
        proposalFingerprint: proposalFingerprint!,
        actorId: "rede-horizonte-authorized-user",
        decidedAt: "2026-07-31T12:00:00.000Z",
      },
    });
    const {state} = result;

    expect(result.report.status).toBe("succeeded");
    expect(result.report.stages).toHaveLength(11);
    expect(result.report.stages.every((stage) => stage.status === "succeeded")).toBe(true);

    for (const expected of gold.calculations) {
      const actual = calculationValue(state, expected);
      expect(actual, `missing calculation ${expected.id}`).toBeDefined();
      expect(insideTolerance(actual!, expected), `${expected.id}: expected ${expected.value}, got ${actual}`).toBe(true);
    }

    expect(state.brief, JSON.stringify({
      briefBlockedBy: state.briefBlockedBy,
      alternatives: state.structureAlternatives,
      decision: state.structureDecision,
    }, null, 2)).not.toBeNull();
    const claims = new Map(state.brief!.sections.flatMap((section) => section.claims).map((claim) => [claim.id, claim]));
    for (const expected of gold.claims) {
      const claim = claims.get(expected.id);
      expect(claim, `missing claim ${expected.id}`).toBeDefined();
      expect(claim).toMatchObject({material: expected.material, kind: expected.kind});
      expect(claim!.supportIds).toEqual(expect.arrayContaining(expected.requiredSupportIds));
      for (const forbidden of expected.forbiddenMeanings) expect(claim!.text.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }

    for (const expected of gold.structures) {
      const instrument = state.instruments.find((candidate) => candidate.instrument.id === expected.id);
      expect(instrument, `missing structure ${expected.id}`).toBeDefined();
      expect(instrument!.route).toEqual(expected.route);
      expect(instrument!.eligible).toBe(expected.classification !== "ineligible");
      if (expected.amount) expect(state.termSheet?.terms.find((term) => term.id === "amount")?.value.pt).toContain("53.760.000");
    }

    expect(state.materialsBlockedBy).toEqual([]);
    for (const expected of gold.materials) assertMaterialContract(state, expected);

    const fits = new Map(state.matching.fits.map((fit) => [fit.fundId, fit]));
    for (const expected of gold.matches) {
      const fit = fits.get(expected.capitalProviderId);
      expect(fit, `missing mandate result ${expected.capitalProviderId}`).toBeDefined();
      const verdict = expected.expected === "eligible" ? "fits" : expected.expected === "ineligible" ? "excluded" : "possible";
      expect(fit!.verdict).toBe(verdict);
      expect(fit!.exclusions.map((entry) => entry.id)).toEqual(expect.arrayContaining(expected.hardConstraints));
      if (expected.expected === "unknown") expect(fit!.ourGaps.length).toBeGreaterThan(0);
    }

    expect(state.verdict?.standing).toBe("stands_with_conditions");
    expect(state.verdict?.conditions.map((condition) => condition.id)).toContain("collateral-capacity-shortfall");
    expect(state.outcome).toMatchObject({
      state: gold.outcome!.state,
      qualifiedIntroductionAllowed: gold.outcome!.qualifiedIntroductionAllowed,
    });
    expect(state.outcome.reasons).toEqual(expect.arrayContaining(gold.outcome!.reasonsInclude));
  });
});

function structureProposalFrom(state: CaseEngineState) {
  const suggested = state.structureTruth.proposal;
  if (!suggested.instrument || !suggested.amount || !suggested.termMonths || suggested.graceMonths === null || !suggested.amortizationFormat) {
    throw new Error("Rede Horizonte anchor did not produce a deterministic structure base");
  }
  const sources = state.operationTruth.sourcesAndUses.lines
    .filter((line) => line.side === "source")
    .map((line) => ({
      id: `source-${line.id}`,
      label: line.item,
      amount: line.amount,
      origin: "reconciled_fact" as const,
      basisIds: ["OP-04"],
      condition: line.condition === "available" ? "available" as const : "conditional" as const,
    }));
  const uses = state.operationTruth.sourcesAndUses.lines
    .filter((line) => line.side === "use")
    .map((line) => ({
      id: `use-${line.id}`,
      label: line.item,
      amount: line.amount,
      origin: "reconciled_fact" as const,
      basisIds: ["OP-04"],
      condition: line.condition === "available" ? "available" as const : "conditional" as const,
    }));
  return {
    alternatives: [{
      id: "rede-horizonte-target",
      label: "Estrutura-alvo indicativa",
      instrument: suggested.instrument,
      route: suggested.instrument,
      amount: suggested.amount,
      currency: "BRL",
      termMonths: suggested.termMonths,
      graceMonths: suggested.graceMonths,
      amortization: suggested.amortizationFormat,
      indexer: "CDI",
      targetBuyer: "private_credit_market",
      rationale: "Estrutura indicativa baseada na necessidade conciliada, na capacidade calculada e nas rotas elegíveis.",
      pros: ["Compatível com a capacidade indicativa documentada"],
      cons: ["Preço e termos finais dependem das propostas dos financiadores"],
      assumptions: ["As fontes e os usos conciliados permanecem válidos"],
      sources,
      uses,
      security: [],
      covenants: [],
      conditionsPrecedent: [],
      implementationDays: null,
      basisIds: ["ES-45"],
    }],
    recommendation: {
      alternativeId: "rede-horizonte-target",
      rationale: "A alternativa respeita o menor limite determinístico atualmente comprovado.",
      basisIds: ["ES-41", "ES-45"],
      proposedBy: "rede-horizonte-gold-desk",
      proposedAt: "2026-07-31T10:00:00.000Z",
    },
  };
}
