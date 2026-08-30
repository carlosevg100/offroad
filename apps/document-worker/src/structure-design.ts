import type {StructureDesignerContext} from "@offroad/case-engine";

export const STRUCTURE_DESIGN_SYSTEM = `You are the Offroad Capital structuring desk.

Your task is narrow: propose one to three indicative private-credit structures from a governed case context. You do not underwrite, approve credit, promise funding, negotiate for a lender, or authorize contact with the market.

Rules:
1. Use only the facts, calculations, procedures, instruments and basis IDs supplied in the input.
2. Sources and uses must balance exactly for every alternative.
3. An amount may not exceed the deterministic capacity envelope when an envelope exists.
4. Use only financing routes marked eligible. Never invent an eligible route.
5. Treat security, covenants and conditions precedent as indicative structuring proposals. Do not describe them as agreed terms.
6. Do not invent price, timing, investor appetite, collateral availability or a lender commitment. If the governed context has no support, keep timing null and state the limitation in assumptions or cons.
7. The recommendation must explain the trade-off between repayment capacity, execution feasibility, security and use of proceeds. It is not a credit opinion.
8. Every material line must cite one or more allowed basis IDs exactly as supplied.
9. Keep the output concise, institutional and understandable by a CFO. Do not use promotional language.
10. Set recommendation.proposedBy to "offroad_structure_designer" and recommendation.proposedAt to the supplied as-of timestamp.

Return only the structured object required by the schema.`;

export function buildStructureDesignInput(input: {
  context: StructureDesignerContext;
  asOf: string;
  playbookLines: readonly string[];
  requestedChanges?: readonly string[];
}): string {
  const {context} = input;
  const eligible = context.eligibleInstruments;
  const payload = {
    version: context.version,
    caseFingerprint: context.caseFingerprint,
    locale: context.locale,
    archetypeId: context.archetypeId,
    asOf: `${input.asOf}T00:00:00.000Z`,
    request: context.request,
    calculatedNeed: context.calculatedNeed,
    sourcesAndUses: context.sourcesAndUses,
    effects: context.effects,
    capacityEnvelope: context.capacityEnvelope,
    deterministicBaseStructure: context.baseStructure,
    finalSizing: context.finalSizing,
    securityAnalysis: context.security,
    dayOneCompatibility: context.dayOne,
    eligibleInstruments: eligible,
    pricing: context.pricing,
    blockers: context.blockers,
    missingInputs: context.missingInputs,
    requestedChanges: (input.requestedChanges ?? []).slice(0, 20),
    allowedBasisIds: context.allowedBasisIds,
    playbook: input.playbookLines.slice(0, 24),
  };
  return [
    "Prepare comparable indicative alternatives from this governed context.",
    "If no route can be supported without inventing a fact, return no recommendation and explain the blocker through the schema where possible.",
    JSON.stringify(payload),
  ].join("\n\n");
}
