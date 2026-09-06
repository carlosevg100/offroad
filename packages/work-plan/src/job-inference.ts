import type {CapitalProjectJob} from "./capital-jobs";
import {compileObjectiveToPlan} from "./objective-plan";

export type CapitalProjectJobHint = Exclude<CapitalProjectJob, "prepare_materials_and_process">;

export type CapitalProjectJobInference = {
  job: CapitalProjectJobHint;
  reason: "documents_only" | "existing_transaction" | "meeting_or_origination" | "company_analysis" | "capital_need" | "explicit_hint" | "default";
};

const patterns = {
  existingTransaction: /\b(term\s*sheet|proposta|proposal|minuta|draft|opera[cç][aã]o\s+(?:existente|pronta)|estrutura\s+(?:existente|pronta)|revisar|review|melhorar\s+(?:a\s+)?(?:proposta|estrutura|opera[cç][aã]o))\b/i,
  meeting: /\b(reuni[aã]o|meeting|pitch|origina[cç][aã]o|origination|apresenta[cç][aã]o\s+(?:para|à|ao)\s+(?:a\s+)?companhia|visita\s+(?:à|a)\s+companhia)\b/i,
  companyAnalysis: /\b(analis(?:ar|e)|entender|estudar|diagn[oó]stico|diagnostic|debt\s+lens|[oó]tica\s+(?:de|da)\s+d[ií]vida)\b.*\b(companhia|empresa|company|balan[cç]o|d[ií]vida|endividamento)\b/i,
  capitalNeed: /\b(refinanc|refi\b|along|liability|capital\s+de\s+giro|working\s+capital|liquidez|expans[aã]o|crescimento|capex|aquisi[cç][aã]o|m\s*&\s*a|equipamento|frota|im[oó]vel|project\s+finance|infraestrutura|receb[ií]ve|estoque|contrato|bridge|take[- ]?out|dividend|com[eé]rcio\s+exterior|acc\b|ace\b|agro|venture\s+debt|mezzanine|h[ií]brid|reestrutura|special\s+situation|financiar|capta[cç][aã]o)\b/i,
} as const;

/**
 * Selects only the initial TaskSpec subgraph. A clicked starter is an explicit initial assignment;
 * without one, the message and attachments supply the route. The same durable project may later
 * change direction without changing its company, evidence or history.
 */
export function inferCapitalProjectJob(input: {
  message: string;
  hasAttachments: boolean;
  explicitHint?: CapitalProjectJobHint | null;
}): CapitalProjectJobInference {
  const message = input.message.normalize("NFKC").replace(/\s+/g, " ").trim();

  // A selected starter is an explicit instruction from the user, not another weak keyword.
  // The free-text classifier remains useful when no starter was selected, but it must not send a
  // request such as "structure these documents and diagnose the company" into the public-only
  // company view merely because the word "diagnose" appears in the prompt.
  if (input.explicitHint) {
    return {job: input.explicitHint, reason: "explicit_hint"};
  }

  // The six entry cards remain compatibility labels. The objective compiler owns the semantic
  // distinction first; this adapter then selects the nearest released project rail. Objectives
  // that require an existing project (materials and matching) deliberately stay on the legacy
  // fallback until the continuation router can bind them to an existing snapshot.
  const objective = compileObjectiveToPlan({message, hasAttachments: input.hasAttachments});
  if (objective.objectiveKind === "operation_review" || objective.objectiveKind === "risk_matrix") {
    return {job: "review_existing_operation", reason: "existing_transaction"};
  }
  if (objective.objectiveKind === "meeting_preparation") {
    return {job: "origination_thesis", reason: "meeting_or_origination"};
  }
  if (objective.objectiveKind === "board_decision" || objective.objectiveKind === "capital_strategy") {
    return {job: "capital_planning", reason: "capital_need"};
  }
  if (objective.objectiveKind === "company_analysis") {
    return {job: "company_debt_view", reason: "company_analysis"};
  }
  if (objective.objectiveKind === "documents_to_case") {
    return {job: "structure_from_documents", reason: "documents_only"};
  }

  if (patterns.existingTransaction.test(message)) {
    return {job: "review_existing_operation", reason: "existing_transaction"};
  }
  if (patterns.meeting.test(message)) {
    return {job: "origination_thesis", reason: "meeting_or_origination"};
  }
  if (patterns.capitalNeed.test(message)) {
    return {job: "capital_planning", reason: "capital_need"};
  }
  if (patterns.companyAnalysis.test(message)) {
    return {job: "company_debt_view", reason: "company_analysis"};
  }
  if (input.hasAttachments && message.length < 40) {
    return {job: "structure_from_documents", reason: "documents_only"};
  }
  if (input.hasAttachments) {
    return {job: "structure_from_documents", reason: "documents_only"};
  }
  return {job: "capital_planning", reason: "default"};
}
