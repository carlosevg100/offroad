import {
  buildIntentClassifierInput,
  buildSemanticObjectExtractorInput,
  type IntentClassifierInput,
  type SemanticObjectExtractorInput,
} from "@offroad/agent-contracts";

import type {IntentGoldTurn} from "./intent-gold";

const professionalContextByCase: Partial<Record<IntentGoldTurn["caseId"], {
  useForms: string[];
  professionalRoles: string[];
  practiceAreas: string[];
  primaryObjectives: string[];
}>> = {
  gc01: {useForms: ["institutional_work"], professionalRoles: ["banker"], practiceAreas: ["investment_banking", "dcm"], primaryObjectives: ["prepare_materials"]},
  gc02: {useForms: ["institutional_work"], professionalRoles: ["company_finance"], practiceAreas: ["treasury", "corporate_finance"], primaryObjectives: ["evaluate_capital_structure"]},
  gc03: {useForms: ["institutional_work"], professionalRoles: ["advisor"], practiceAreas: ["structured_credit"], primaryObjectives: ["structure_transactions"]},
  gc04: {useForms: ["institutional_work"], professionalRoles: ["investor"], practiceAreas: ["private_credit"], primaryObjectives: ["evaluate_opportunities"]},
  gc05: {useForms: ["institutional_work"], professionalRoles: ["banker"], practiceAreas: ["corporate_banking", "dcm"], primaryObjectives: ["originate_ideas"]},
};

export function intentGoldMessage(turn: IntentGoldTurn, repeat: number): string {
  if (repeat === 1) return turn.message;
  const paraphrase = turn.stabilityParaphrases?.[repeat - 2];
  if (!paraphrase) throw new Error(`missing_authored_paraphrase:${turn.id}:${repeat}`);
  return paraphrase;
}

/** One canonical builder is shared by the paid runner and the independent verifier. */
export function intentGoldClassifierInput(turn: IntentGoldTurn, message: string): IntentClassifierInput {
  return buildIntentClassifierInput({
    locale: turn.locale,
    latestUserMessage: message,
    recentConversation: turn.priorTurns.slice(-8).map((content) => ({role: "user", content})),
    entryJob: null,
    documentCount: turn.documentCount,
    professionalContext: professionalContextByCase[turn.caseId] ?? null,
  });
}

/** Authored conversation is evidence input, never an authority-bearing active-work object. */
export function intentGoldObjectInput(turn: IntentGoldTurn, message: string): SemanticObjectExtractorInput {
  return buildSemanticObjectExtractorInput({
    locale: turn.locale,
    latestUserMessage: message,
    recentConversation: turn.priorTurns.slice(-8).map((content) => ({role: "user", content})),
    activeWorkContext: null,
  });
}
