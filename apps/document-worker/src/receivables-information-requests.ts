import {randomUUID} from "node:crypto";

import type {ReceivablesPoolMethodReadiness, ReceivablesMethodReadinessDimensionId} from "@offroad/receivables-analysis";

const evidenceByDimension: Record<ReceivablesMethodReadinessDimensionId, {pt: string[]; en: string[]}> = {
  source_universe: {
    pt: ["Arquivo da carteira na data-base", "Manifesto ou hash do arquivo"],
    en: ["Reporting-date pool file", "File manifest or hash"],
  },
  portfolio_lineage: {
    pt: ["Carteira conciliada título a título", "Mapa entre a origem e a base elegível"],
    en: ["Title-level reconciled pool", "Mapping from source rows to the eligible base"],
  },
  cedent_and_servicing: {
    pt: ["Documentação societária do cedente", "Contrato ou descrição do servicing"],
    en: ["Cedent corporate documents", "Servicing agreement or operating description"],
  },
  title_legal_controls: {
    pt: ["Lastro e contrato dos recebíveis", "Registro, cessão, ônus e disputas por título"],
    en: ["Receivable evidence and contracts", "Title-level registration, assignment, liens and disputes"],
  },
  performance_history: {
    pt: ["Histórico de baixas", "Diluição, prorrogação, recompra, substituição e perdas"],
    en: ["Settlement history", "Dilution, extensions, repurchases, substitutions and losses"],
  },
  cash_reconciliation: {
    pt: ["Extratos bancários", "Arquivo de baixas e identificação da conta de recebimento"],
    en: ["Bank statements", "Settlement file and collection-account identification"],
  },
  accounting_reconciliation: {
    pt: ["Balancete ou razão da data-base", "Contas a receber, provisão e recebimentos"],
    en: ["Reporting-date trial balance or ledger", "Receivables, allowance and collections accounts"],
  },
  eligibility_policy: {
    pt: ["Critérios de elegibilidade pretendidos", "Limites de concentração, atraso, diluição e cobertura"],
    en: ["Proposed eligibility criteria", "Concentration, delinquency, dilution and coverage limits"],
  },
  facility_and_waterfall: {
    pt: ["Valor e parâmetros da estrutura a testar", "Advance rate, subordinação, reserva e waterfall"],
    en: ["Facility amount and structure parameters to test", "Advance rate, subordination, reserve and waterfall"],
  },
};

function requirementKey(code: string): string {
  return `receivables.r01.${code.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-")}`.slice(0, 120);
}

/** Converts the actual readiness gaps—not a generic checklist—into the same first-class question
 * cards used by the rest of the workspace. Answered and waived keys remain closed in the DB. */
export function buildReceivablesMethodInformationRequestProjection(input: {
  projectId: string;
  processingRunId: string;
  locale: "pt-BR" | "en-US";
  readiness: Omit<ReceivablesPoolMethodReadiness, "validatedInput">;
  idFactory?: () => string;
}) {
  const english = input.locale === "en-US";
  const idFactory = input.idFactory ?? randomUUID;
  return {
    schemaVersion: "project-information-request-projection.v1",
    projectId: input.projectId,
    sourceNamespace: "receivables_method_r01",
    projectionRef: `${input.processingRunId}:R01:${input.readiness.sourceDatasetHash}:${input.readiness.state}`,
    requests: input.readiness.methodExecutionAllowed ? [] : input.readiness.gaps.slice(0, 3).map((gap, index) => ({
      id: idFactory(),
      schemaVersion: "dcm-information-request.v1",
      projectId: input.projectId,
      requirementKey: requirementKey(gap.code),
      question: english ? gap.question.en : gap.question.pt,
      whyItMatters: english ? gap.message.en : gap.message.pt,
      decisionImpact: english
        ? "Without this point, R01 remains blocked and no title-level eligibility, borrowing-base or waterfall conclusion is produced."
        : "Sem este ponto, o R01 permanece bloqueado e nenhuma conclusão de elegibilidade, borrowing base ou waterfall por título é produzida.",
      acceptableEvidence: evidenceByDimension[gap.dimensionId][english ? "en" : "pt"],
      answerKind: gap.class === "policy" || gap.class === "structure" ? "text" : "document",
      choices: [],
      priority: "blocking",
      informationGain: Number((1 - index * 0.08).toFixed(3)),
      materiality: Number((0.98 - index * 0.04).toFixed(3)),
      answerability: gap.class === "policy" || gap.class === "structure" ? 0.9 : 0.75,
      redundancyPenalty: 0,
      status: "open",
    })),
  };
}
