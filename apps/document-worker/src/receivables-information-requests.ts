import {randomUUID} from "node:crypto";

import {
  receivablesSupplementFieldPathSchema,
  type ReceivablesPoolMethodReadiness,
  type ReceivablesMethodReadinessDimensionId,
  type ReceivablesSupplementFieldPath,
} from "@offroad/receivables-analysis";
import {z} from "zod";

const evidenceByDimension: Record<ReceivablesMethodReadinessDimensionId, {pt: string[]; en: string[]}> = {
  source_universe: {pt: ["Arquivo da carteira na data-base", "Manifesto ou hash do arquivo"], en: ["Reporting-date pool file", "File manifest or hash"]},
  portfolio_lineage: {pt: ["Carteira conciliada título a título", "Mapa entre a origem e a base elegível"], en: ["Title-level reconciled pool", "Mapping from source rows to the eligible base"]},
  cedent_and_servicing: {pt: ["Documentação societária do cedente", "Contrato ou descrição do servicing"], en: ["Cedent corporate documents", "Servicing agreement or operating description"]},
  title_legal_controls: {pt: ["Lastro e contrato dos recebíveis", "Registro, cessão, ônus e disputas por título"], en: ["Receivable evidence and contracts", "Title-level registration, assignment, liens and disputes"]},
  performance_history: {pt: ["Histórico de baixas", "Diluição, prorrogação, recompra, substituição e perdas"], en: ["Settlement history", "Dilution, extensions, repurchases, substitutions and losses"]},
  cash_reconciliation: {pt: ["Extratos bancários", "Arquivo de baixas e identificação da conta de recebimento"], en: ["Bank statements", "Settlement file and collection-account identification"]},
  accounting_reconciliation: {pt: ["Balancete ou razão da data-base", "Contas a receber, provisão e recebimentos"], en: ["Reporting-date trial balance or ledger", "Receivables, allowance and collections accounts"]},
  eligibility_policy: {pt: ["Confirmação expressa do parâmetro de elegibilidade"], en: ["Explicit confirmation of the eligibility parameter"]},
  facility_and_waterfall: {pt: ["Confirmação expressa do parâmetro da estrutura"], en: ["Explicit confirmation of the structure parameter"]},
};

export const receivablesInformationRequestBindingSchema = z.object({
  schemaVersion: z.literal("receivables-information-request-binding.v1"),
  methodId: z.literal("R01"),
  sourceDatasetHash: z.string().regex(/^[a-f0-9]{64}$/),
  fieldPath: receivablesSupplementFieldPathSchema,
  valueKind: z.enum(["integer", "percentage", "boolean", "enum", "string_list", "money", "multiple"]),
  unit: z.enum(["days", "percent_0_100", "boolean", "enum", "text_list", "currency_major", "multiple"]),
  minimum: z.number().nullable(),
  maximum: z.number().nullable(),
  options: z.array(z.object({label: z.string().min(1), value: z.union([z.string(), z.boolean()])}).strict()).max(12),
}).strict();
export type ReceivablesInformationRequestBinding = z.infer<typeof receivablesInformationRequestBindingSchema>;

type FieldDefinition = Omit<ReceivablesInformationRequestBinding, "schemaVersion" | "methodId" | "sourceDatasetHash"> & {
  question: {pt: string; en: string};
  why: {pt: string; en: string};
};

const yesNo = (locale: "pt-BR" | "en-US") => locale === "en-US"
  ? [{label: "Yes", value: true}, {label: "No", value: false}]
  : [{label: "Sim", value: true}, {label: "Não", value: false}];

function field(
  fieldPath: ReceivablesSupplementFieldPath,
  valueKind: FieldDefinition["valueKind"],
  unit: FieldDefinition["unit"],
  pt: string,
  en: string,
  whyPt: string,
  whyEn: string,
  minimum: number | null = null,
  maximum: number | null = null,
): FieldDefinition {
  return {fieldPath, valueKind, unit, minimum, maximum, options: [], question: {pt, en}, why: {pt: whyPt, en: whyEn}};
}

const policyWhy = {pt: "Este limite altera diretamente a carteira elegível e o borrowing base.", en: "This limit directly changes the eligible pool and borrowing base."};
const structureWhy = {pt: "Este parâmetro altera o dimensionamento, a proteção de crédito ou a alocação do caixa.", en: "This parameter changes sizing, credit protection or cash allocation."};

const fieldDefinitions: FieldDefinition[] = [
  field("/structure/requestedFacility", "money", "currency_major", "Qual é o valor da linha a testar, na moeda do caso?", "What facility amount should be tested, in the case currency?", structureWhy.pt, structureWhy.en, 0.01),
  field("/structure/advanceRate", "percentage", "percent_0_100", "Qual advance rate devemos testar? Informe de 0% a 100%.", "What advance rate should we test? Enter 0% to 100%.", structureWhy.pt, structureWhy.en, 0, 100),
  field("/structure/requiredOvercollateralization", "multiple", "multiple", "Qual overcollateralization mínima devemos testar? Informe em vezes, por exemplo 1,25x.", "What minimum overcollateralization should we test? Enter a multiple, for example 1.25x.", structureWhy.pt, structureWhy.en, 1),
  field("/structure/requiredSubordinationRate", "percentage", "percent_0_100", "Qual subordinação mínima devemos exigir? Informe de 0% a 100%.", "What minimum subordination should be required? Enter 0% to 100%.", structureWhy.pt, structureWhy.en, 0, 100),
  field("/structure/reserveRate", "percentage", "percent_0_100", "Qual percentual de reserva devemos testar? Informe de 0% a 100%.", "What reserve percentage should we test? Enter 0% to 100%.", structureWhy.pt, structureWhy.en, 0, 100),
  field("/structure/actualSeniorAmount", "money", "currency_major", "Qual é o saldo sênior atual ou proposto, na moeda do caso?", "What is the current or proposed senior amount, in the case currency?", structureWhy.pt, structureWhy.en, 0),
  field("/structure/actualMezzanineAmount", "money", "currency_major", "Qual é o saldo mezanino atual ou proposto, na moeda do caso?", "What is the current or proposed mezzanine amount, in the case currency?", structureWhy.pt, structureWhy.en, 0),
  field("/structure/actualSubordinatedAmount", "money", "currency_major", "Qual é o saldo subordinado atual ou proposto, na moeda do caso?", "What is the current or proposed subordinated amount, in the case currency?", structureWhy.pt, structureWhy.en, 0),
  field("/structure/waterfall/availableCash", "money", "currency_major", "Qual caixa está disponível para a waterfall no período testado?", "How much cash is available for the waterfall in the tested period?", structureWhy.pt, structureWhy.en, 0),
  field("/structure/waterfall/servicingFeeDue", "money", "currency_major", "Qual servicing fee vence no período testado?", "What servicing fee is due in the tested period?", structureWhy.pt, structureWhy.en, 0),
  field("/structure/waterfall/seniorInterestDue", "money", "currency_major", "Quanto de juros sênior vence no período testado?", "How much senior interest is due in the tested period?", structureWhy.pt, structureWhy.en, 0),
  field("/structure/waterfall/seniorPrincipalDue", "money", "currency_major", "Quanto de principal sênior vence no período testado?", "How much senior principal is due in the tested period?", structureWhy.pt, structureWhy.en, 0),
  field("/structure/waterfall/reserveOpening", "money", "currency_major", "Qual é o saldo inicial da reserva no período testado?", "What is the opening reserve balance in the tested period?", structureWhy.pt, structureWhy.en, 0),
  field("/structure/waterfall/mezzanineDue", "money", "currency_major", "Quanto vence para a tranche mezanino no período testado?", "How much is due to the mezzanine tranche in the tested period?", structureWhy.pt, structureWhy.en, 0),
  field("/policy/maxDaysPastDue", "integer", "days", "Qual é o atraso máximo permitido para um recebível elegível?", "What is the maximum days past due for an eligible receivable?", policyWhy.pt, policyWhy.en, 0),
  field("/policy/maxRemainingTermDays", "integer", "days", "Qual é o prazo remanescente máximo permitido, em dias?", "What is the maximum remaining term allowed, in days?", policyWhy.pt, policyWhy.en, 1),
  field("/policy/minSeasoningDays", "integer", "days", "Qual seasoning mínimo deve ser exigido, em dias?", "What minimum seasoning should be required, in days?", policyWhy.pt, policyWhy.en, 0),
  field("/policy/maxSingleDebtorShare", "percentage", "percent_0_100", "Qual é a concentração máxima por devedor? Informe de 0% a 100%.", "What is the maximum single-debtor concentration? Enter 0% to 100%.", policyWhy.pt, policyWhy.en, 0, 100),
  field("/policy/maxDebtorGroupShare", "percentage", "percent_0_100", "Qual é a concentração máxima por grupo econômico? Informe de 0% a 100%.", "What is the maximum economic-group concentration? Enter 0% to 100%.", policyWhy.pt, policyWhy.en, 0, 100),
  field("/policy/minimumEligibleShare", "percentage", "percent_0_100", "Qual percentual mínimo da carteira deve permanecer elegível?", "What minimum share of the pool must remain eligible?", policyWhy.pt, policyWhy.en, 0, 100),
  field("/policy/minimumEvidenceCoverage", "percentage", "percent_0_100", "Qual cobertura documental mínima devemos exigir?", "What minimum evidence coverage should be required?", policyWhy.pt, policyWhy.en, 0, 100),
  field("/policy/minimumRegistrationCoverage", "percentage", "percent_0_100", "Qual cobertura mínima de registro devemos exigir?", "What minimum registration coverage should be required?", policyWhy.pt, policyWhy.en, 0, 100),
  field("/policy/maximumDelinquency30Share", "percentage", "percent_0_100", "Qual limite máximo para atraso acima de 30 dias?", "What is the maximum share over 30 days past due?", policyWhy.pt, policyWhy.en, 0, 100),
  field("/policy/maximumDilutionShare", "percentage", "percent_0_100", "Qual limite máximo de diluição devemos adotar?", "What maximum dilution share should be used?", policyWhy.pt, policyWhy.en, 0, 100),
  field("/policy/maximumRepurchaseShare", "percentage", "percent_0_100", "Qual limite máximo de recompra devemos adotar?", "What maximum repurchase share should be used?", policyWhy.pt, policyWhy.en, 0, 100),
  field("/policy/minimumRecoveryRate", "percentage", "percent_0_100", "Qual recuperação mínima devemos exigir?", "What minimum recovery rate should be required?", policyWhy.pt, policyWhy.en, 0, 100),
  field("/policy/maximumAccountingMismatchShare", "percentage", "percent_0_100", "Qual divergência contábil máxima será tolerada?", "What maximum accounting mismatch should be tolerated?", policyWhy.pt, policyWhy.en, 0, 100),
  field("/policy/maximumCashMismatchShare", "percentage", "percent_0_100", "Qual divergência máxima de caixa será tolerada?", "What maximum cash mismatch should be tolerated?", policyWhy.pt, policyWhy.en, 0, 100),
  field("/policy/minimumMappedCashShare", "percentage", "percent_0_100", "Qual percentual mínimo de caixa deve estar conciliado aos títulos?", "What minimum share of cash must be mapped to receivables?", policyWhy.pt, policyWhy.en, 0, 100),
  field("/policy/minimumLinkedAccountCashShare", "percentage", "percent_0_100", "Qual percentual mínimo de recebimentos deve transitar pela conta vinculada?", "What minimum share of collections must flow through the linked account?", policyWhy.pt, policyWhy.en, 0, 100),
];

const booleanFields: Array<[ReceivablesSupplementFieldPath, string, string]> = [
  ["/policy/requireAssignable", "Devemos exigir que todo recebível elegível seja cedível?", "Must every eligible receivable be assignable?"],
  ["/policy/requireEvidenceVerified", "Devemos exigir lastro verificado para todo recebível elegível?", "Must every eligible receivable have verified evidence?"],
  ["/policy/excludeDisputed", "Recebíveis em disputa devem ser excluídos?", "Should disputed receivables be excluded?"],
  ["/policy/excludeRelatedParties", "Recebíveis de partes relacionadas devem ser excluídos?", "Should related-party receivables be excluded?"],
  ["/policy/excludeEncumbered", "Recebíveis onerados devem ser excluídos?", "Should encumbered receivables be excluded?"],
];

fieldDefinitions.push(
  ...booleanFields.map(([fieldPath, pt, en]) => ({fieldPath, valueKind: "boolean" as const, unit: "boolean" as const, minimum: null, maximum: null, options: [], question: {pt, en}, why: policyWhy})),
  {fieldPath: "/policy/registrationRule", valueKind: "enum", unit: "enum", minimum: null, maximum: null, options: [], question: {pt: "Qual regra de registro deve ser aplicada?", en: "Which registration rule should apply?"}, why: policyWhy},
  {fieldPath: "/policy/allowedDebtorSectors", valueKind: "string_list", unit: "text_list", minimum: null, maximum: null, options: [], question: {pt: "Há setores de devedores permitidos? Separe por vírgulas; deixe ‘todos’ se não houver restrição.", en: "Are there permitted debtor sectors? Separate with commas; enter ‘all’ if unrestricted."}, why: policyWhy},
);

const definitionByPath = new Map(fieldDefinitions.map((definition) => [definition.fieldPath, definition]));

function requirementKey(code: string): string {
  return `receivables.r01.${code.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-")}`.slice(0, 120);
}

function fieldRequirementKey(path: ReceivablesSupplementFieldPath): string {
  return `receivables.r01.field.${path.slice(1).replaceAll("/", ".").replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()}`;
}

function optionsFor(definition: FieldDefinition, locale: "pt-BR" | "en-US") {
  if (definition.valueKind === "boolean") return yesNo(locale);
  if (definition.fieldPath === "/policy/registrationRule") return locale === "en-US"
    ? [{label: "Required", value: "required"}, {label: "Required when applicable", value: "required_when_applicable"}, {label: "Not required", value: "not_required"}]
    : [{label: "Obrigatório", value: "required"}, {label: "Obrigatório quando aplicável", value: "required_when_applicable"}, {label: "Não obrigatório", value: "not_required"}];
  return definition.options;
}

export function buildReceivablesMethodEvidenceRequestProjection(input: {
  projectId: string;
  processingRunId: string;
  locale: "pt-BR" | "en-US";
  readiness: Omit<ReceivablesPoolMethodReadiness, "validatedInput" | "progress"> & {
    progress?: ReceivablesPoolMethodReadiness["progress"];
  };
  missingDraftSections?: readonly string[];
  idFactory?: () => string;
}) {
  const english = input.locale === "en-US";
  const idFactory = input.idFactory ?? randomUUID;
  const missing = new Set(input.missingDraftSections ?? []);
  const draftDimensionRequirements: Partial<Record<ReceivablesMethodReadinessDimensionId, readonly string[]>> = {
    portfolio_lineage: ["titles"],
    cedent_and_servicing: ["cedent", "evidence.cedentAndServicing"],
    title_legal_controls: ["titles", "evidence.titleLegalControls"],
    performance_history: ["titles", "evidence.performanceHistory"],
    cash_reconciliation: ["cashReceipts", "evidence.cashReconciliation"],
    accounting_reconciliation: ["accounting", "evidence.accountingReconciliation"],
  };
  const evidenceGaps = input.readiness.gaps.filter((gap) => {
    if (gap.class === "policy" || gap.class === "structure") return false;
    if (input.missingDraftSections === undefined || gap.class === "conflict") return true;
    const requirements = draftDimensionRequirements[gap.dimensionId];
    return requirements === undefined || requirements.some((section) => missing.has(section));
  });
  return {
    schemaVersion: "project-information-request-projection.v1",
    projectId: input.projectId,
    sourceNamespace: "receivables_method_r01_evidence",
    projectionRef: `${input.processingRunId}:R01:evidence:${input.readiness.sourceDatasetHash}:${input.readiness.state}`,
    requests: input.readiness.methodExecutionAllowed ? [] : evidenceGaps.slice(0, 3).map((gap, index) => ({
      id: idFactory(), schemaVersion: "dcm-information-request.v1", projectId: input.projectId,
      requirementKey: requirementKey(gap.code), question: english ? gap.question.en : gap.question.pt,
      whyItMatters: english ? gap.message.en : gap.message.pt,
      decisionImpact: english ? "Without this evidence, R01 remains blocked and produces no title-level conclusion." : "Sem esta evidência, o R01 permanece bloqueado e não produz conclusão por título.",
      acceptableEvidence: evidenceByDimension[gap.dimensionId][english ? "en" : "pt"], answerKind: "document" as const,
      choices: [], priority: "blocking" as const, informationGain: Number((1 - index * 0.08).toFixed(3)),
      materiality: Number((0.98 - index * 0.04).toFixed(3)), answerability: 0.75, redundancyPenalty: 0, status: "open" as const,
    })),
  };
}

export function buildReceivablesMethodFieldRequestProjection(input: {
  projectId: string;
  processingRunId: string;
  locale: "pt-BR" | "en-US";
  sourceDatasetHash: string;
  activeGroups: Array<"policy" | "structure">;
  missingSections?: readonly string[];
  idFactory?: () => string;
}) {
  const english = input.locale === "en-US";
  const idFactory = input.idFactory ?? randomUUID;
  const explicitMissing = new Set((input.missingSections ?? []).map((item) => `/${item.replaceAll(".", "/")}`));
  // Eligibility defines the pool on which sizing operates. Even when both groups are missing,
  // do not interrogate the person about facility terms before the eligibility policy is closed.
  const activeGroup = input.activeGroups.includes("policy")
    ? "policy"
    : input.activeGroups.includes("structure") ? "structure" : null;
  const candidates = fieldDefinitions.filter((definition) => {
    const group = definition.fieldPath.startsWith("/policy/") ? "policy" : "structure";
    return group === activeGroup && (explicitMissing.size === 0 || explicitMissing.has(definition.fieldPath));
  }).slice(0, 3);
  return {
    schemaVersion: "project-information-request-projection.v1",
    projectId: input.projectId,
    sourceNamespace: "receivables_method_r01_fields",
    projectionRef: `${input.processingRunId}:R01:fields:${input.sourceDatasetHash}:${candidates.map((item) => item.fieldPath).join(",")}`,
    requests: candidates.map((definition, index) => {
      const options = optionsFor(definition, input.locale);
      const binding = receivablesInformationRequestBindingSchema.parse({
        schemaVersion: "receivables-information-request-binding.v1", methodId: "R01",
        sourceDatasetHash: input.sourceDatasetHash, fieldPath: definition.fieldPath,
        valueKind: definition.valueKind, unit: definition.unit, minimum: definition.minimum,
        maximum: definition.maximum, options,
      });
      return {
        id: idFactory(), schemaVersion: "dcm-information-request.v1", projectId: input.projectId,
        requirementKey: fieldRequirementKey(definition.fieldPath), question: english ? definition.question.en : definition.question.pt,
        whyItMatters: english ? definition.why.en : definition.why.pt,
        decisionImpact: english ? "The confirmed value becomes a traceable model input; changing it creates a new revision." : "O valor confirmado vira input rastreável do modelo; qualquer alteração cria uma nova revisão.",
        acceptableEvidence: evidenceByDimension[definition.fieldPath.startsWith("/policy/") ? "eligibility_policy" : "facility_and_waterfall"][english ? "en" : "pt"],
        answerKind: options.length ? "choice" as const : definition.valueKind === "string_list" ? "text" as const : "number" as const,
        choices: options.map((option) => option.label), priority: "blocking" as const,
        informationGain: Number((1 - index * 0.05).toFixed(3)), materiality: Number((0.98 - index * 0.03).toFixed(3)),
        answerability: 0.95, redundancyPenalty: 0, status: "open" as const, producerBinding: binding,
      };
    }),
  };
}

export function buildReceivablesMethodInformationRequestProjection(input: Parameters<typeof buildReceivablesMethodEvidenceRequestProjection>[0]) {
  return buildReceivablesMethodEvidenceRequestProjection(input);
}

export function receivablesFieldDefinition(path: string): FieldDefinition | null {
  const parsed = receivablesSupplementFieldPathSchema.safeParse(path);
  return parsed.success ? definitionByPath.get(parsed.data) ?? null : null;
}
