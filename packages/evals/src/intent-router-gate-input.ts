import {
  buildIntentClassifierInput,
  buildSemanticObjectExtractorInput,
  type IntentClassifierInput,
  type SemanticObjectExtractorInput,
} from "@offroad/agent-contracts";

import type {IntentGoldTurn} from "./intent-gold";

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
    recentConversation: turn.priorTurns.slice(-8),
    entryJob: null,
    documentCount: turn.documentCount,
  });
}

/** Conversation roles are preserved, while continuity authority comes only from the separately
 * authored, schema-governed active-work fixture. Historical prose is never promoted into it. */
export function intentGoldObjectInput(turn: IntentGoldTurn, message: string): SemanticObjectExtractorInput {
  return buildSemanticObjectExtractorInput({
    locale: turn.locale,
    latestUserMessage: message,
    recentConversation: turn.priorTurns.slice(-8),
    activeWorkContext: turn.activeWorkContext,
  });
}
