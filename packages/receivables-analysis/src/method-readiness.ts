import Decimal from "decimal.js";
import {z} from "zod";

import type {ReceivablesPhaseOneInput} from "./phase-one";
import type {ReceivablesRawDetectionReport} from "./raw-detection";
import {
  receivablesPoolUnderwritingInputSchema,
  type ReceivablesPoolUnderwritingInput,
} from "./underwrite";

export const receivablesPoolInputAssemblyVersion = "2026.09.07-v1" as const;
export const receivablesPoolMethodReadinessVersion = "2026.09.07-v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const evidenceReferenceSchema = z.object({
  sourceClass: z.enum(["provided_document", "project_context", "house_method", "user_confirmation"]),
  sourceId: z.string().min(1),
  anchor: z.string().min(1),
}).strict();

const evidenceSectionSchema = z.array(evidenceReferenceSchema).min(1);

/**
 * The full method input is never accepted as an unattached JSON object. This envelope proves
 * which immutable title universe it came from, maps every source title one-to-one and requires
 * evidence for each judgement that the title tape alone cannot establish.
 */
export const receivablesPoolInputAssemblySchema = z.object({
  schemaVersion: z.literal(receivablesPoolInputAssemblyVersion),
  source: z.object({
    universeId: z.string().min(1),
    datasetHash: sha256Schema,
    titleMapping: z.array(z.object({
      sourceReceivableId: z.string().min(1),
      methodReceivableId: z.string().min(1),
    }).strict()).min(1),
  }).strict(),
  evidence: z.object({
    cedentAndServicing: evidenceSectionSchema,
    titleLegalControls: evidenceSectionSchema,
    performanceHistory: evidenceSectionSchema,
    cashReconciliation: evidenceSectionSchema,
    accountingReconciliation: evidenceSectionSchema,
    eligibilityPolicy: evidenceSectionSchema,
    facilityAndWaterfall: evidenceSectionSchema,
  }).strict(),
  findingResolutions: z.array(z.object({
    findingId: z.string().min(1),
    disposition: z.enum(["remediated", "false_positive", "incorporated_in_method_input"]),
    rationale: z.string().min(10),
    evidence: evidenceSectionSchema,
  }).strict()),
  input: receivablesPoolUnderwritingInputSchema,
}).strict().superRefine((assembly, context) => {
  const sourceIds = assembly.source.titleMapping.map((entry) => entry.sourceReceivableId);
  const methodIds = assembly.source.titleMapping.map((entry) => entry.methodReceivableId);
  if (new Set(sourceIds).size !== sourceIds.length) {
    context.addIssue({code: "custom", path: ["source", "titleMapping"], message: "source receivable mapping must be one-to-one"});
  }
  if (new Set(methodIds).size !== methodIds.length) {
    context.addIssue({code: "custom", path: ["source", "titleMapping"], message: "method receivable mapping must be one-to-one"});
  }
});
export type ReceivablesPoolInputAssembly = z.infer<typeof receivablesPoolInputAssemblySchema>;

export type ReceivablesMethodReadinessDimensionId =
  | "source_universe"
  | "portfolio_lineage"
  | "cedent_and_servicing"
  | "title_legal_controls"
  | "performance_history"
  | "cash_reconciliation"
  | "accounting_reconciliation"
  | "eligibility_policy"
  | "facility_and_waterfall";

export type ReceivablesMethodReadinessGapClass = "evidence" | "policy" | "structure" | "conflict";

export type ReceivablesMethodReadinessGap = {
  code: string;
  dimensionId: ReceivablesMethodReadinessDimensionId;
  class: ReceivablesMethodReadinessGapClass;
  blocking: true;
  message: {pt: string; en: string};
  question: {pt: string; en: string};
  evidenceIds: readonly string[];
};

export type ReceivablesPoolMethodReadiness = {
  version: typeof receivablesPoolMethodReadinessVersion;
  state: "ready" | "blocked";
  primaryReason: "ready" | "conflicting" | "needs_evidence" | "needs_policy" | "needs_structure";
  methodExecutionAllowed: boolean;
  sourceDatasetHash: string;
  dimensions: readonly {
    id: ReceivablesMethodReadinessDimensionId;
    state: "satisfied" | "missing" | "conflicting";
    gapCodes: readonly string[];
  }[];
  gaps: readonly ReceivablesMethodReadinessGap[];
  nextQuestions: readonly {
    id: string;
    dimensionId: ReceivablesMethodReadinessDimensionId;
    text: {pt: string; en: string};
    evidenceIds: readonly string[];
  }[];
  validatedInput: ReceivablesPoolUnderwritingInput | null;
};

type ReadinessInput = {
  phaseOne: ReceivablesPhaseOneInput;
  detection: ReceivablesRawDetectionReport;
  assembly?: unknown;
};

const dimensionOrder: readonly ReceivablesMethodReadinessDimensionId[] = [
  "source_universe",
  "portfolio_lineage",
  "cedent_and_servicing",
  "title_legal_controls",
  "performance_history",
  "cash_reconciliation",
  "accounting_reconciliation",
  "eligibility_policy",
  "facility_and_waterfall",
];

function gap(
  code: string,
  dimensionId: ReceivablesMethodReadinessDimensionId,
  gapClass: ReceivablesMethodReadinessGapClass,
  pt: string,
  en: string,
  questionPt: string,
  questionEn: string,
  evidenceIds: readonly string[] = [],
): ReceivablesMethodReadinessGap {
  return {code, dimensionId, class: gapClass, blocking: true, message: {pt, en}, question: {pt: questionPt, en: questionEn}, evidenceIds: [...new Set(evidenceIds)].sort()};
}

const missingAssemblyGaps = (input: ReadinessInput): ReceivablesMethodReadinessGap[] => {
  const evidenceIds = input.detection.evidenceCoverage.searchedEvidenceIds;
  const coverage = input.phaseOne.universe.eventCoverage;
  const gaps: ReceivablesMethodReadinessGap[] = [
    gap("portfolio_lineage_not_assembled", "portfolio_lineage", "evidence", "A carteira calculada ainda não foi ligada, título a título, ao contrato de entrada do método especialista.", "The calculated pool has not yet been linked title by title to the specialist method input contract.", "Confirme o mapeamento entre cada linha da carteira conciliada e cada título que deverá integrar a base elegível.", "Confirm the mapping between every reconciled pool row and every receivable that should enter the eligible base.", evidenceIds),
    gap("cedent_and_servicing_not_evidenced", "cedent_and_servicing", "evidence", "Identidade do cedente e responsabilidade de servicing ainda não estão comprovadas no contrato do método.", "Cedent identity and servicing responsibility are not yet evidenced in the method contract.", "Quem é o titular dos créditos e quem fará cobrança, conciliação e substituição da carteira durante a operação?", "Who owns the receivables and who will service, reconcile and replace the pool during the facility?", evidenceIds),
    gap("title_legal_controls_not_evidenced", "title_legal_controls", "evidence", "Cessão, existência, registro, ônus, disputas e partes relacionadas não estão comprovados título a título.", "Assignment, existence, registration, liens, disputes and related parties are not evidenced title by title.", "Envie a evidência de lastro e o controle por título de cessão, registro, ônus, disputa e parte relacionada.", "Provide title-level evidence of existence, assignment, registration, liens, disputes and related parties.", evidenceIds),
    gap("cash_reconciliation_not_evidenced", "cash_reconciliation", "evidence", "Os recebimentos não estão reconciliados com extrato, conta vinculada e controle de duplicidades.", "Cash receipts are not reconciled to bank evidence, linked accounts and duplicate controls.", "Envie o extrato e o arquivo de baixas que permitam ligar cada recebimento ao título, identificar duplicidades e comprovar a conta de recebimento.", "Provide bank and settlement files that link each receipt to a title, identify duplicates and evidence the collection account.", evidenceIds),
    gap("accounting_reconciliation_not_evidenced", "accounting_reconciliation", "evidence", "Saldo bruto, provisão e recebimentos contábeis ainda não foram ligados à mesma data-base da carteira.", "Gross balance, allowance and accounting collections are not yet tied to the pool reporting date.", "Envie o razão ou balancete da data-base com contas a receber, provisão e baixas para conciliarmos com a carteira.", "Provide the reporting-date ledger or trial balance for receivables, allowance and collections so it can be tied to the pool.", evidenceIds),
    gap("eligibility_policy_not_governed", "eligibility_policy", "policy", "Os critérios e limites da base elegível ainda não foram definidos ou aprovados como premissas do caso.", "Eligibility criteria and limits have not been defined or approved as case assumptions.", "Quais critérios devemos testar para atraso, prazo, concentração, lastro, registro, ônus, diluição, recompra, perdas e cobertura mínima?", "Which criteria should be tested for delinquency, tenor, concentration, evidence, registration, liens, dilution, repurchases, losses and minimum coverage?"),
    gap("facility_and_waterfall_not_governed", "facility_and_waterfall", "structure", "Valor, advance rate, sobrecolateralização, subordinação, reserva e waterfall não estão definidos no contrato do método.", "Facility amount, advance rate, overcollateralization, subordination, reserve and waterfall are not defined in the method contract.", "Qual estrutura devemos simular: valor, advance rate, sobrecolateralização, subordinação, reserva e prioridades do fluxo de caixa?", "Which structure should be simulated: amount, advance rate, overcollateralization, subordination, reserve and cash-flow priorities?"),
  ];
  const incompleteEvents = Object.entries(coverage).filter(([, value]) => value.status !== "complete");
  if (incompleteEvents.length > 0) {
    gaps.push(gap(
      "performance_history_incomplete",
      "performance_history",
      "evidence",
      `O histórico está incompleto para: ${incompleteEvents.map(([name]) => name).join(", ")}. Ausência de evento não será tratada como zero.`,
      `History is incomplete for: ${incompleteEvents.map(([name]) => name).join(", ")}. Missing events will not be treated as zero.`,
      "Envie os históricos completos de liquidação, diluição, prorrogação, recompra, substituição e cessões/ônus para o período analisado.",
      "Provide complete settlement, dilution, extension, repurchase, substitution and assignment/lien histories for the analysis period.",
      evidenceIds,
    ));
  }
  return gaps;
};

const decimalEqual = (left: string, right: string) => new Decimal(left).eq(right);

function assemblyConflicts(
  phaseOne: ReceivablesPhaseOneInput,
  detection: ReceivablesRawDetectionReport,
  assembly: ReceivablesPoolInputAssembly,
): ReceivablesMethodReadinessGap[] {
  const gaps: ReceivablesMethodReadinessGap[] = [];
  const source = phaseOne.universe;
  const method = assembly.input.case;
  const conflict = (code: string, pt: string, en: string) => gaps.push(gap(code, "portfolio_lineage", "conflict", pt, en, "Revise a montagem do input e confirme qual valor e fonte devem prevalecer antes da execução.", "Review the input assembly and confirm which value and source should prevail before execution."));
  if (assembly.source.datasetHash !== phaseOne.datasetHash) conflict("source_dataset_hash_mismatch", "O input montado aponta para outra versão da carteira.", "The assembled input points to a different pool version.");
  if (assembly.source.universeId !== source.id) conflict("source_universe_mismatch", "O input montado aponta para outro universo de recebíveis.", "The assembled input points to a different receivables universe.");
  if (method.referenceDate !== source.dates.reportingDate) conflict("reference_date_mismatch", "A data-base do método diverge da carteira conciliada.", "The method reporting date differs from the reconciled pool.");
  if (assembly.input.currency !== source.currency || method.portfolio.some((item) => assembly.input.currency !== source.currency)) conflict("currency_mismatch", "A moeda do método diverge da carteira conciliada.", "The method currency differs from the reconciled pool.");

  const methodById = new Map(method.portfolio.map((item) => [item.id, item]));
  const sourceById = new Map(source.receivables.map((item) => [item.id, item]));
  const mappedSourceIds = new Set(assembly.source.titleMapping.map((item) => item.sourceReceivableId));
  const mappedMethodIds = new Set(assembly.source.titleMapping.map((item) => item.methodReceivableId));
  if (mappedSourceIds.size !== source.receivables.length || source.receivables.some((item) => !mappedSourceIds.has(item.id))) conflict("source_title_mapping_incomplete", "Nem todos os títulos da carteira de origem foram mapeados.", "Not every source pool title was mapped.");
  if (mappedMethodIds.size !== method.portfolio.length || method.portfolio.some((item) => !mappedMethodIds.has(item.id))) conflict("method_title_mapping_incomplete", "O input do método contém título sem ligação com a carteira de origem.", "The method input contains a title not linked to the source pool.");
  for (const mapping of assembly.source.titleMapping) {
    const sourceTitle = sourceById.get(mapping.sourceReceivableId);
    const methodTitle = methodById.get(mapping.methodReceivableId);
    if (!sourceTitle || !methodTitle) continue;
    if (
      sourceTitle.issueDate !== methodTitle.originDate
      || sourceTitle.currentDueDate !== methodTitle.dueDate
      || sourceTitle.obligorId !== methodTitle.debtorId
      || !decimalEqual(sourceTitle.faceValue, methodTitle.originalAmount)
      || !decimalEqual(sourceTitle.openValue, methodTitle.outstandingBalance)
    ) {
      conflict("mapped_title_economics_mismatch", `O título ${sourceTitle.id} mudou em valor, data ou sacado durante a montagem do input.`, `Title ${sourceTitle.id} changed in amount, date or obligor during input assembly.`);
      break;
    }
  }
  const resolvedFindingIds = new Set(assembly.findingResolutions.map((item) => item.findingId));
  const detectedFindingIds = new Set(detection.defects.map((item) => item.id));
  for (const resolution of assembly.findingResolutions) {
    if (!detectedFindingIds.has(resolution.findingId)) {
      gaps.push(gap(
        `finding_resolution_without_detection:${resolution.findingId}`,
        "title_legal_controls",
        "conflict",
        `Há um tratamento para o achado “${resolution.findingId}”, mas esse achado não pertence à detecção desta carteira.`,
        `A disposition exists for finding “${resolution.findingId}”, but that finding does not belong to this pool detection.`,
        "Confirme se a resolução pertence a outra versão da carteira e remova ou vincule o achado correto.",
        "Confirm whether the resolution belongs to another pool version and remove it or link the correct finding.",
      ));
    }
  }
  for (const finding of detection.defects) {
    if (!resolvedFindingIds.has(finding.id)) {
      gaps.push(gap(
        `finding_unresolved:${finding.id}`,
        "title_legal_controls",
        "conflict",
        `O achado “${finding.description}” ainda não tem tratamento evidenciado no input do método.`,
        `The finding “${finding.description}” has no evidenced treatment in the method input.`,
        "Confirme se o achado foi corrigido, se é falso positivo ou como foi incorporado aos critérios da análise, anexando a evidência.",
        "Confirm whether the finding was remediated, is a false positive or was incorporated into the analysis criteria, with supporting evidence.",
        finding.evidence.flatMap((entry) => entry.kind === "measured" ? entry.anchors.map((anchor) => anchor.kind === "file" ? anchor.fileId : anchor.kind === "document" ? anchor.documentId : anchor.eventId) : []),
      ));
    }
  }
  return gaps;
}

function primaryReason(gaps: readonly ReceivablesMethodReadinessGap[]): ReceivablesPoolMethodReadiness["primaryReason"] {
  if (gaps.some((item) => item.class === "conflict")) return "conflicting";
  if (gaps.some((item) => item.class === "evidence")) return "needs_evidence";
  if (gaps.some((item) => item.class === "policy")) return "needs_policy";
  if (gaps.some((item) => item.class === "structure")) return "needs_structure";
  return "ready";
}

/**
 * Fail-closed bridge between the immutable document rail and specialist execution. It never
 * fills a blank, interprets missing event history as zero or lets a valid-looking method payload
 * execute without a one-to-one source reconciliation and section-level evidence.
 */
export function assessReceivablesPoolMethodReadiness(input: ReadinessInput): ReceivablesPoolMethodReadiness {
  let gaps: ReceivablesMethodReadinessGap[];
  let validatedInput: ReceivablesPoolUnderwritingInput | null = null;
  const parsed = input.assembly === undefined ? null : receivablesPoolInputAssemblySchema.safeParse(input.assembly);
  if (!parsed?.success) {
    gaps = missingAssemblyGaps(input);
    if (parsed && !parsed.success) {
      gaps.unshift(gap("input_assembly_invalid", "portfolio_lineage", "conflict", "A montagem recebida não atende ao contrato governado do método.", "The received assembly does not satisfy the governed method contract.", "Revise os campos inválidos antes de tentar executar a análise especialista.", "Correct the invalid fields before attempting specialist execution."));
    }
  } else {
    gaps = assemblyConflicts(input.phaseOne, input.detection, parsed.data);
    if (gaps.length === 0) validatedInput = parsed.data.input;
  }
  const reason = primaryReason(gaps);
  const dimensions = dimensionOrder.map((id) => {
    const dimensionGaps = gaps.filter((item) => item.dimensionId === id);
    return {
      id,
      state: (dimensionGaps.some((item) => item.class === "conflict") ? "conflicting" : dimensionGaps.length > 0 ? "missing" : "satisfied") as "satisfied" | "missing" | "conflicting",
      gapCodes: dimensionGaps.map((item) => item.code).sort(),
    };
  });
  return {
    version: receivablesPoolMethodReadinessVersion,
    state: gaps.length === 0 ? "ready" : "blocked",
    primaryReason: reason,
    methodExecutionAllowed: gaps.length === 0,
    sourceDatasetHash: input.phaseOne.datasetHash,
    dimensions,
    gaps,
    nextQuestions: gaps.map((item) => ({id: item.code, dimensionId: item.dimensionId, text: item.question, evidenceIds: item.evidenceIds})),
    validatedInput,
  };
}
