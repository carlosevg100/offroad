import {
  assessUnderstandingGate,
  buildClarificationBatch,
  buildUnderstandingSnapshot,
  fingerprintJson,
  type ClarificationBatch,
  type UnderstandingClaim,
  type UnderstandingGateAssessment,
  type UnderstandingRequirement,
  type UnderstandingSnapshot,
} from "@offroad/case-understanding";
import {receivablesFactResolutionDefinitions} from "@offroad/credit-playbook";
import type {MeasuredMetric} from "@offroad/financial-core";

import type {ReceivablesCasePipelineReport} from "./receivables-case";

export const receivablesUnderstandingProjectionVersion = "2026.08.29-v1";

type Text = {pt: string; en: string};

type FactPresentation = {
  label: Text;
  safe: Text;
  adverse: Text;
  impact: Text;
  materiality: UnderstandingClaim["materiality"];
};

const factPresentation: Readonly<Record<string, FactPresentation>> = {
  claim_existence_evidenced: fact("Existência dos créditos", "Existence of receivables", "Os créditos estão identificados e ligados aos documentos de origem.", "The receivables are identified and linked to source documents.", "A existência dos créditos não está comprovada para o universo analisado.", "The existence of the receivables is not evidenced for the analyzed universe.", "Sem comprovação de existência, a carteira não pode sustentar uma alternativa de financiamento.", "Without evidence of existence, the portfolio cannot support a financing alternative.", "critical"),
  cedent_ownership_confirmed: fact("Titularidade dos créditos", "Ownership of receivables", "A titularidade do cedente está comprovada.", "The seller's ownership is evidenced.", "A titularidade do cedente não está comprovada ou apresenta restrição.", "The seller's ownership is not evidenced or is restricted.", "A titularidade determina se os créditos podem ser cedidos ou oferecidos em garantia.", "Ownership determines whether the receivables can be sold or pledged.", "critical"),
  contractual_assignability_confirmed: fact("Possibilidade de cessão", "Contractual assignability", "Os contratos analisados permitem a cessão dos créditos.", "The reviewed contracts allow the receivables to be assigned.", "Há restrição ou falta de comprovação sobre a possibilidade de cessão.", "Assignability is restricted or not evidenced.", "Restrições contratuais podem bloquear ou alterar a mecânica da operação.", "Contractual restrictions can block or change the transaction mechanics.", "critical"),
  unresolved_prior_assignment_or_lien: fact("Cessões e gravames anteriores", "Prior assignments and liens", "Não foi identificado direito anterior não resolvido no universo comprovado.", "No unresolved prior right was identified in the evidenced universe.", "Foi identificado direito anterior que ainda precisa ser resolvido.", "An unresolved prior right was identified.", "Direitos anteriores podem impedir a cessão ou reduzir a carteira elegível.", "Prior rights can prevent assignment or reduce the eligible pool.", "critical"),
  performance_or_delivery_evidenced: fact("Comprovação de entrega ou prestação", "Performance or delivery evidence", "A entrega ou prestação está comprovada.", "Delivery or performance is evidenced.", "A entrega ou prestação ainda não está comprovada para o universo relevante.", "Delivery or performance is not yet evidenced for the relevant universe.", "Sem lastro comercial, o crédito pode ser contestado, glosado ou considerado inelegível.", "Without commercial support, a receivable may be disputed, diluted or deemed ineligible.", "high"),
  title_control_and_duplicate_check_available: fact("Controle de títulos e duplicidade", "Title and duplicate controls", "Há controle verificável de titularidade, pagamentos, ônus e duplicidade.", "Verifiable controls cover ownership, payments, liens and duplicates.", "O controle de títulos e duplicidade é insuficiente ou não foi comprovado.", "Title and duplicate controls are insufficient or not evidenced.", "Controles frágeis aumentam o risco operacional e de dupla cessão.", "Weak controls increase operational and double-assignment risk.", "high"),
  debtor_notice_or_acknowledgement_feasible: fact("Ciência do sacado e instrução de pagamento", "Debtor notice and payment instruction", "A ciência do sacado e a instrução de pagamento são viáveis.", "Debtor notice and payment instruction are feasible.", "A ciência do sacado ou a instrução de pagamento apresenta restrição.", "Debtor notice or payment instruction is restricted.", "A mecânica de pagamento afeta o controle de caixa e a segurança da cessão.", "Payment mechanics affect cash control and assignment enforceability.", "high"),
  analytical_tape_available: fact("Base analítica da carteira", "Analytical portfolio tape", "A carteira está disponível título a título em base reconciliável.", "The portfolio is available title by title in a reconcilable dataset.", "A base analítica completa e reconciliável ainda não está disponível.", "A complete, reconcilable analytical tape is not yet available.", "Sem a base título a título não é possível medir corretamente a carteira nem desenhar critérios de elegibilidade.", "Without title-level data, the portfolio cannot be measured or eligibility criteria designed correctly.", "critical"),
  historical_performance_available: fact("Histórico de performance", "Historical performance", "Há histórico suficiente para medir atrasos, perdas, diluições, recompras e prorrogações.", "There is sufficient history to measure arrears, losses, dilution, repurchases and extensions.", "O histórico entregue ainda não permite medir toda a performance da carteira.", "The delivered history does not yet support full portfolio performance measurement.", "O histórico sustenta advance rate, reservas, concentração e estresses da estrutura.", "History supports advance rate, reserves, concentration and structural stresses.", "critical"),
  controlled_collections_feasible: fact("Controle dos recebimentos", "Controlled collections", "O fluxo de cobrança e recebimento admite controle e reconciliação.", "Collections and cash receipts can be controlled and reconciled.", "O fluxo de recebimentos ainda não admite controle suficiente.", "The collections flow does not yet allow sufficient control.", "O controle dos recebimentos define a proteção de caixa e a mecânica operacional da estrutura.", "Cash control determines structural protection and operating mechanics.", "high"),
  servicing_capability_available: fact("Capacidade de servicing", "Servicing capability", "Há responsáveis e processos verificáveis para originação, cobrança, baixa e conciliação.", "There are verifiable owners and processes for origination, collection, settlement and reconciliation.", "A capacidade operacional de servicing ainda não está comprovada.", "Servicing capability is not yet evidenced.", "A execução recorrente da operação depende de processos e responsabilidades claros.", "Recurring execution depends on clear processes and ownership.", "high"),
  buyer_confirmed_program_available: fact("Programa patrocinado pelo sacado", "Buyer-sponsored program", "Existe programa aplicável confirmado pelo sacado.", "An applicable buyer-sponsored program is confirmed.", "Não há programa aplicável confirmado pelo sacado.", "No applicable buyer-sponsored program is confirmed.", "Essa alternativa só existe quando o sacado mantém ou aprova o programa.", "This alternative exists only when the buyer maintains or approves the program.", "high"),
  recurring_origination_available: fact("Recorrência de originação", "Recurring origination", "A originação recorrente é compatível com a utilização pretendida.", "Recurring origination is consistent with the intended use.", "A recorrência de originação não foi comprovada ou é insuficiente.", "Recurring origination is not evidenced or is insufficient.", "A recorrência sustenta revolvência, escala e utilização da estrutura.", "Recurring origination supports revolving capacity, scale and utilization.", "high"),
  economically_viable_scale_confirmed: fact("Escala econômica", "Economic scale", "A escala econômica foi comprovada para a alternativa analisada.", "Economic scale is evidenced for the analyzed alternative.", "A escala econômica ainda não foi comprovada.", "Economic scale has not yet been evidenced.", "Custos fixos e operacionais podem inviabilizar uma estrutura que parece adequada apenas pelo volume nominal.", "Fixed and operating costs can make a structure uneconomic despite nominal volume.", "high"),
  institutional_vehicle_governance_ready: fact("Governança de veículo dedicado", "Dedicated vehicle governance", "A governança e os prestadores necessários ao veículo estão disponíveis.", "The governance and service providers required for the vehicle are available.", "A governança do veículo dedicado ainda não está pronta.", "Dedicated vehicle governance is not yet ready.", "Veículos dedicados exigem governança, prestadores, controles e responsabilidades definidos.", "Dedicated vehicles require defined governance, providers, controls and responsibilities.", "high"),
  company_credit_package_available: fact("Pacote de crédito da companhia", "Company credit package", "O pacote financeiro, societário e operacional da companhia está disponível.", "The company's financial, corporate and operating package is available.", "O pacote de crédito da companhia está incompleto.", "The company credit package is incomplete.", "Alternativas com coobrigação ou exposição corporativa dependem da análise da companhia além da carteira.", "Alternatives with recourse or corporate exposure require company analysis beyond the portfolio.", "critical"),
  eligible_collateral_pool_identified: fact("Carteira elegível em garantia", "Eligible collateral pool", "A carteira elegível e suas regras de substituição estão identificadas.", "The eligible collateral pool and substitution rules are identified.", "A carteira elegível em garantia ainda não foi identificada.", "The eligible collateral pool has not yet been identified.", "A estrutura garantida depende do volume elegível e de regras de manutenção verificáveis.", "A secured structure depends on eligible volume and verifiable maintenance rules.", "high"),
  security_perfection_feasible: fact("Formalização e controle da garantia", "Security perfection and control", "A formalização, o registro e o controle da garantia são viáveis.", "Perfection, registration and control of the security are feasible.", "A viabilidade de formalização e controle da garantia não está comprovada.", "Feasibility of perfecting and controlling the security is not evidenced.", "A garantia só agrega proteção quando pode ser formalizada, registrada e monitorada.", "Security adds protection only when it can be perfected, registered and monitored.", "critical"),
};

const keyMetrics: readonly {path: string; label: Text; get: (report: ReceivablesCasePipelineReport) => MeasuredMetric}[] = [
  metric("portfolio.title_count", "Quantidade de títulos", "Number of receivables", (report) => report.phaseOne.staticMetrics.portfolio.titleCount),
  metric("portfolio.total_open_value", "Saldo aberto da carteira", "Portfolio open balance", (report) => report.phaseOne.staticMetrics.portfolio.totalOpenValue),
  metric("portfolio.average_ticket", "Ticket médio", "Average ticket", (report) => report.phaseOne.staticMetrics.portfolio.averageTicket),
  metric("portfolio.weighted_remaining_term", "Prazo remanescente ponderado", "Weighted remaining term", (report) => report.phaseOne.staticMetrics.portfolio.weightedRemainingTermDays),
  metric("portfolio.simple_dso", "Prazo médio de recebimento", "Simple DSO", (report) => report.phaseOne.staticMetrics.portfolio.simpleDsoDays),
  metric("portfolio.top_1_concentration", "Concentração no maior sacado", "Largest obligor concentration", (report) => report.phaseOne.staticMetrics.concentration.openByObligor.top_1),
  metric("performance.dilution", "Diluição histórica", "Historical dilution", (report) => report.phaseOne.dynamicMetrics.dilution.shareOfOrigination),
  metric("performance.adjusted_loss", "Perda histórica ajustada", "Adjusted historical loss", (report) => report.phaseOne.dynamicMetrics.repurchaseAndLoss.adjustedLossShare),
  metric("performance.punctual_settlement", "Liquidação pontual", "Punctual settlement", (report) => report.phaseOne.dynamicMetrics.punctualSettlement.punctualByValue),
  metric("performance.extensions", "Prorrogações", "Extensions", (report) => report.phaseOne.dynamicMetrics.extensions.extendedFaceShare),
];

const understandingRequirements: readonly UnderstandingRequirement[] = [
  requirement("receivables_classification", "receivables.classification"),
  requirement("portfolio_balance", "receivables.metric.portfolio.total_open_value"),
  requirement("portfolio_concentration", "receivables.metric.portfolio.top_1_concentration"),
  requirement("portfolio_term", "receivables.metric.portfolio.weighted_remaining_term"),
  requirement("historical_dilution", "receivables.metric.performance.dilution"),
  requirement("historical_loss", "receivables.metric.performance.adjusted_loss"),
];

export type ReceivablesUnderstandingProjection = {
  version: typeof receivablesUnderstandingProjectionVersion;
  snapshot: UnderstandingSnapshot;
  gate: UnderstandingGateAssessment;
  clarification: ClarificationBatch;
  boundaries: {
    structureRecommendationAllowed: false;
    materialProductionAllowed: false;
    matchingAllowed: false;
    qualifiedIntroductionAllowed: false;
  };
};

export function projectReceivablesUnderstanding(input: {
  report: ReceivablesCasePipelineReport;
  createdAt: string;
  sequence?: number;
  supersedesFingerprint?: string | null;
}): ReceivablesUnderstandingProjection {
  const claims: UnderstandingClaim[] = [classificationClaim(input.report)];
  claims.push(...keyMetrics.map((definition) => metricClaim(definition, input.report)));
  claims.push(...factClaims(input.report));
  claims.push(...defectClaims(input.report));
  claims.push(...questionClaims(input.report));

  const snapshot = buildUnderstandingSnapshot({
    version: "2026.08.29-v1",
    caseFingerprint: fingerprintJson({caseId: input.report.caseId}),
    sequence: input.sequence ?? 1,
    createdAt: input.createdAt,
    sourceFingerprint: input.report.phaseOne.universe.datasetHash,
    supersedesFingerprint: input.supersedesFingerprint ?? null,
    summary: {
      pt: "Base analítica da carteira de recebíveis, com fatos comprovados, cálculos e pontos ainda abertos.",
      en: "Analytical receivables basis with evidenced facts, calculations and open matters.",
    },
    claims,
  });
  return {
    version: receivablesUnderstandingProjectionVersion,
    snapshot,
    gate: assessUnderstandingGate(snapshot, understandingRequirements),
    clarification: buildClarificationBatch(snapshot),
    boundaries: {
      structureRecommendationAllowed: false,
      materialProductionAllowed: false,
      matchingAllowed: false,
      qualifiedIntroductionAllowed: false,
    },
  };
}

function classificationClaim(report: ReceivablesCasePipelineReport): UnderstandingClaim {
  const supported = report.classification.evidence.length > 0
    && report.classification.categoryIds.length > 0
    && report.classification.cellIds.length > 0;
  return {
    id: "receivables.classification",
    domain: "operation",
    label: {pt: "Classificação da carteira", en: "Portfolio classification"},
    statement: supported
      ? {pt: `Carteira classificada como ${report.classification.categoryIds.join(", ")} no contexto ${report.classification.cellIds.join(", ")}.`, en: `Portfolio classified as ${report.classification.categoryIds.join(", ")} in context ${report.classification.cellIds.join(", ")}.`}
      : {pt: "A classificação da carteira ainda não foi comprovada.", en: "The portfolio classification has not yet been evidenced."},
    classification: supported ? "confirmed" : "absent",
    materiality: "critical",
    decisionImpact: supported ? "none" : "understanding",
    supports: report.classification.evidence.map((_, index) => ({id: `classification.evidence.${index + 1}`, kind: "evidence" as const})),
    ...(supported ? {} : {
      impact: {pt: "A classificação define quais análises e alternativas são aplicáveis.", en: "Classification determines the applicable analyses and alternatives."},
      nextAction: {pt: "Confirmar a natureza dos recebíveis e a relação comercial que lhes dá origem.", en: "Confirm the nature of the receivables and their underlying commercial relationship."},
    }),
    dependsOnClaimIds: [],
  };
}

function metricClaim(definition: typeof keyMetrics[number], report: ReceivablesCasePipelineReport): UnderstandingClaim {
  const value = definition.get(report);
  const available = value.status === "measured" && value.value !== null;
  return {
    id: `receivables.metric.${definition.path}`,
    domain: "financials",
    label: definition.label,
    statement: available
      ? {pt: `${definition.label.pt}: ${value.value} ${value.unit}.`, en: `${definition.label.en}: ${value.value} ${value.unit}.`}
      : {pt: `${definition.label.pt} ainda não pode ser calculado com a base entregue.`, en: `${definition.label.en} cannot yet be calculated from the delivered data.`},
    classification: available ? "calculated" : "absent",
    materiality: "high",
    decisionImpact: available ? "none" : "structure_or_sizing",
    supports: available ? [{id: `calculation.${value.id}`, kind: "calculation"}] : [],
    ...(available ? {calculationId: value.id} : {
      impact: {pt: "A métrica é necessária para dimensionar elegibilidade, reservas e proteção da estrutura.", en: "The metric is required to size eligibility, reserves and structural protection."},
      nextAction: {pt: "Complementar o histórico e a cobertura de eventos necessários ao cálculo.", en: "Complete the history and event coverage required for the calculation."},
    }),
    dependsOnClaimIds: ["receivables.classification"],
  };
}

function factClaims(report: ReceivablesCasePipelineReport): UnderstandingClaim[] {
  if (!report.factResolution) return [];
  const conflictByFact = new Map(report.factResolution.conflicts.map((conflict) => [conflict.factId, conflict]));
  const requestByFact = new Map<string, string>(receivablesFactResolutionDefinitions.map((definition) => [definition.id, definition.unresolvedRequest]));
  const safeByFact = new Map<string, "true" | "false">(receivablesFactResolutionDefinitions.map((definition) => [definition.id, definition.safeState]));
  return report.factResolution.facts.map((item): UnderstandingClaim => {
    const presentation = factPresentation[item.id];
    if (!presentation) throw new Error(`missing receivables fact presentation: ${item.id}`);
    const conflict = conflictByFact.get(item.id);
    const unresolved = item.state === "unknown";
    const adverse = !unresolved && item.state !== safeByFact.get(item.id);
    const classification = conflict ? "divergent" as const : unresolved ? "absent" as const : "confirmed" as const;
    const supports = conflict
      ? conflict.observationIds.map((id) => ({id, kind: "evidence" as const}))
      : item.provenance ? [{id: `fact.${item.id}.provenance`, kind: "evidence" as const}] : [];
    return {
      id: `receivables.fact.${item.id}`,
      domain: item.id === "company_credit_package_available" ? "company" : "operation",
      label: presentation.label,
      statement: adverse || unresolved ? presentation.adverse : presentation.safe,
      classification,
      materiality: presentation.materiality,
      decisionImpact: adverse ? "transaction_blocker" : unresolved ? "structure_or_sizing" : "none",
      supports,
      ...(conflict ? {discrepancyGroupId: `receivables.${item.id}`} : {}),
      ...((adverse || unresolved) ? {
        impact: presentation.impact,
        nextAction: {
          pt: requestByFact.get(item.id) ?? "Esclarecer e comprovar o ponto antes da estruturação.",
          en: "Clarify and evidence this point before structuring.",
        },
      } : {}),
      dependsOnClaimIds: ["receivables.classification"],
    };
  });
}

function defectClaims(report: ReceivablesCasePipelineReport): UnderstandingClaim[] {
  return report.defects.map((defect, index): UnderstandingClaim => ({
    id: `receivables.defect.${safeId(defect.id, index)}`,
    domain: "financials",
    label: {pt: "Achado na carteira", en: "Portfolio finding"},
    statement: {pt: defect.description, en: defect.description},
    classification: "confirmed",
    materiality: "high",
    decisionImpact: "structure_or_sizing",
    supports: defect.evidence.map((_, supportIndex) => ({id: `defect.${defect.id}.evidence.${supportIndex + 1}`, kind: "evidence" as const})),
    impact: {pt: "O achado pode alterar elegibilidade, dimensionamento, reservas ou critérios da operação.", en: "The finding may change eligibility, sizing, reserves or transaction criteria."},
    nextAction: {pt: "Validar a causa, a abrangência e o tratamento aplicável ao achado.", en: "Validate the cause, scope and applicable treatment of the finding."},
    dependsOnClaimIds: ["receivables.classification"],
  }));
}

function questionClaims(report: ReceivablesCasePipelineReport): UnderstandingClaim[] {
  return report.questions.map((question, index): UnderstandingClaim => ({
    id: `receivables.question.${safeId(question.id, index)}`,
    domain: "operation",
    label: {pt: "Esclarecimento necessário", en: "Clarification required"},
    statement: {pt: `A evidência entregue não respondeu: ${question.text}`, en: `The delivered evidence did not answer: ${question.text}`},
    classification: "absent",
    materiality: "high",
    decisionImpact: "understanding",
    supports: [{id: `question.${question.id}.trigger`, kind: "evidence"}],
    impact: {pt: "O esclarecimento fecha um ponto que não pôde ser comprovado nos documentos já analisados.", en: "The clarification closes a point that could not be evidenced in the documents already reviewed."},
    nextAction: {pt: question.text, en: question.text},
    dependsOnClaimIds: ["receivables.classification"],
  }));
}

function fact(labelPt: string, labelEn: string, safePt: string, safeEn: string, adversePt: string, adverseEn: string, impactPt: string, impactEn: string, materiality: UnderstandingClaim["materiality"]): FactPresentation {
  return {label: {pt: labelPt, en: labelEn}, safe: {pt: safePt, en: safeEn}, adverse: {pt: adversePt, en: adverseEn}, impact: {pt: impactPt, en: impactEn}, materiality};
}

function metric(path: string, pt: string, en: string, get: (report: ReceivablesCasePipelineReport) => MeasuredMetric): typeof keyMetrics[number] {
  return {path, label: {pt, en}, get};
}

function requirement(id: string, claimId: string): UnderstandingRequirement {
  return {id, claimId, description: {pt: id, en: id}, acceptedClassifications: ["confirmed", "calculated"]};
}

function safeId(value: string, index: number): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^[^a-z]+/, "");
  return normalized || `item-${index + 1}`;
}
