import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {statSync} from "node:fs";
import type {CaseBrief} from "@offroad/case-understanding";
import type {CaseEngineInput} from "@offroad/case-engine";
import type {DataRoomDocument} from "@offroad/data-room";
import type {Resolved, ResolvedMandate, Sourced} from "@offroad/fund-mandate";
import type {FactCandidate} from "@offroad/reconciliation";

import {goldDocumentPath, loadGoldCase, type GoldCase} from "./gold";

const here = dirname(fileURLToPath(import.meta.url));
export const redeHorizonteGoldDirectory = resolve(
  here,
  "..",
  "..",
  "testing-fixtures",
  "gold",
  "rede-horizonte",
);

export function loadRedeHorizonteGold(): GoldCase {
  return loadGoldCase(redeHorizonteGoldDirectory);
}

const profileMap = (gold: GoldCase) => new Map(gold.profiles.map((profile) => [profile.document, profile]));

export function redeHorizonteCandidates(gold = loadRedeHorizonteGold()): FactCandidate[] {
  const profiles = profileMap(gold);
  return gold.fields.map((field) => {
    if (!field.sourceDocument) throw new Error(`anchor field lacks source document: ${field.fieldPath}`);
    const profile = profiles.get(field.sourceDocument);
    if (!profile) throw new Error(`anchor field source lacks profile: ${field.sourceDocument}`);
    return {
      fieldPath: field.fieldPath,
      normalizedValue: field.value,
      valueType: field.valueType,
      sourceDocument: field.sourceDocument,
      evidenceRank: profile.evidenceRank,
      informationClass: profile.informationClass,
      confidence: 0.995,
      anchorVerified: true,
      ...(field.periodStart ? {periodStart: field.periodStart} : {}),
      ...(field.periodEnd ? {periodEnd: field.periodEnd} : {}),
      ...(profile.entityName ? {entityName: profile.entityName} : {}),
      anchor: {document: field.sourceDocument, expectedGoldField: field.fieldPath},
    };
  });
}

export function redeHorizonteDocuments(gold = loadRedeHorizonteGold()) {
  return gold.profiles.map((profile, index) => ({id: `rede-doc-${index + 1}`, kind: profile.kind}));
}

export function redeHorizonteRoomDocuments(gold = loadRedeHorizonteGold()): DataRoomDocument[] {
  const profiles = profileMap(gold);
  return gold.manifest.documents.map((document, index) => {
    const profile = profiles.get(document.name);
    if (!profile) throw new Error(`anchor document lacks profile: ${document.name}`);
    return {
      id: `rede-doc-${index + 1}`,
      kind: profile.kind,
      originalName: document.name,
      sha256: document.sha256 ?? null,
      sha256VerifiedAt: "2026-08-24T12:00:00.000Z",
      byteSize: statSync(goldDocumentPath(gold, document.name)).size,
    };
  });
}

const sourced = <T>(value: T): Sourced<T> => ({
  value,
  provenance: "declared",
  observedAt: "2026-08-20",
  note: "Mandato sintético do caso âncora Rede Horizonte",
});

const resolved = <T>(value: T): Resolved<T> => ({
  value,
  accepted: sourced(value),
  others: [],
  divergent: false,
  ageMonths: 0.13,
});

function mandate(
  fundId: string,
  fundName: string,
  input: {
    ticket?: {min: string; max: string};
    termMonths?: {min: number; max: number};
    sectors?: string[];
    instruments?: ResolvedMandate["instruments"] extends Resolved<infer T> | null ? T : never;
    collateral?: ResolvedMandate["collateral"] extends Resolved<infer T> | null ? T : never;
    leverageCeiling?: string;
    minimumDscr?: string;
    active?: boolean;
  },
): ResolvedMandate {
  return {
    fundId,
    fundName,
    ticket: input.ticket ? resolved(input.ticket) : null,
    termMonths: input.termMonths ? resolved(input.termMonths) : null,
    sectors: input.sectors ? resolved(input.sectors) : null,
    instruments: input.instruments ? resolved(input.instruments) : null,
    collateral: input.collateral ? resolved(input.collateral) : null,
    geographies: resolved(["SP", "Brasil"]),
    leverageCeiling: input.leverageCeiling ? resolved(input.leverageCeiling) : null,
    minimumDscr: input.minimumDscr ? resolved(input.minimumDscr) : null,
    active: input.active === undefined ? null : resolved(input.active),
    divergences: [],
    freshestMonths: 0.13,
  };
}

export function redeHorizonteMandates(): ResolvedMandate[] {
  return [
    mandate("atlas-corporate-credit", "Atlas Corporate Credit", {
      ticket: {min: "30000000", max: "80000000"},
      termMonths: {min: 36, max: 72},
      sectors: ["Consumo / Varejo"],
      instruments: ["debenture", "ccb", "direct_loan"],
      collateral: ["recebiveis", "estoque", "equipamento", "cessao_fiduciaria"],
      leverageCeiling: "3.25",
      minimumDscr: "1.30",
      active: true,
    }),
    mandate("minerva-large-cap", "Minerva Large Cap Credit", {
      ticket: {min: "100000000", max: "300000000"},
      termMonths: {min: 48, max: 96},
      sectors: ["Consumo / Varejo"],
      instruments: ["debenture"],
      collateral: ["recebiveis", "imovel"],
      leverageCeiling: "3.50",
      minimumDscr: "1.20",
      active: true,
    }),
    mandate("safra-agro-receivables", "Safra Agro Receivables", {
      ticket: {min: "25000000", max: "90000000"},
      termMonths: {min: 24, max: 60},
      sectors: ["Agronegócio"],
      instruments: ["cra", "receivables_purchase"],
      collateral: ["recebiveis", "cessao_fiduciaria"],
      leverageCeiling: "3.00",
      minimumDscr: "1.35",
      active: true,
    }),
    mandate("unknown-opportunistic", "Opportunity Fund Under Review", {
      ticket: {min: "20000000", max: "100000000"},
      active: true,
    }),
  ];
}

export function redeHorizonteBrief(): CaseBrief {
  return {
    executiveSummary:
      "Rede Horizonte Alimentos busca uma estrutura de crédito privado para financiar a expansão de sua rede e refinanciar obrigações existentes. O caso reúne histórico auditado, posição intermediária revisada, mapa de dívida, garantias e plano detalhado do projeto. A estrutura permanece indicativa e os pontos em aberto continuam visíveis para diligência.",
    sections: [
      {
        id: "identity",
        heading: "Companhia",
        claims: [{
          id: "legal-name",
          text: "A tomadora é Rede Horizonte Alimentos S.A.",
          material: true,
          kind: "fact",
          supportIds: ["company.legal_name"],
        }],
      },
      {
        id: "business",
        heading: "Negócio",
        claims: [{
          id: "sector",
          text: "A companhia atua em consumo e varejo, no segmento de varejo alimentar e supermercados.",
          material: true,
          kind: "fact",
          supportIds: ["company.sector", "company.subsector"],
        }],
      },
      {
        id: "request",
        heading: "Necessidade de capital",
        claims: [{
          id: "amount-purpose",
          text: "A companhia solicita R$ 54 milhões para expansão de três novas lojas e refinanciamento de dívida existente.",
          material: true,
          kind: "fact",
          supportIds: ["transaction.requested_amount", "transaction.purpose"],
        }],
      },
      {
        id: "project",
        heading: "Projeto",
        claims: [{
          id: "project-cost",
          text: "O plano detalhado estima investimento total de R$ 49 milhões nas novas unidades e na infraestrutura compartilhada.",
          material: true,
          kind: "fact",
          supportIds: ["project.total_cost"],
        }],
      },
      {
        id: "history",
        heading: "Histórico financeiro",
        claims: [{
          id: "history-2025",
          text: "Em 2025, a receita líquida foi de R$ 184,7 milhões e o EBITDA foi de R$ 30,4 milhões.",
          material: true,
          kind: "fact",
          supportIds: ["historical_financials.2025.revenue", "historical_financials.2025.ebitda"],
        }],
      },
      {
        id: "current_position",
        heading: "Posição atual",
        claims: [{
          id: "current-debt-cash",
          text: "Em julho de 2026, a dívida bruta era de R$ 68 milhões e o caixa era de R$ 9,3 milhões.",
          material: true,
          kind: "fact",
          supportIds: ["interim_financials.2026_07.gross_debt", "interim_financials.2026_07.cash"],
        }],
      },
      {
        id: "projections",
        heading: "Projeções e capacidade",
        claims: [{
          id: "coverage-leverage",
          text: "O plano indica DSCR mínimo de 1,452x e alavancagem líquida pós-transação de 2,8735x.",
          material: true,
          kind: "fact",
          supportIds: ["projections.minimum_dscr", "leverage.post_transaction_net_debt_ebitda"],
        }],
      },
      {
        id: "risks",
        heading: "Riscos e pontos de atenção",
        claims: [{
          id: "collateral-shortfall",
          text: "A capacidade indicativa de garantias de R$ 53,76 milhões fica ligeiramente abaixo do pedido de R$ 54 milhões e depende de validação dos ativos e gravames.",
          material: true,
          kind: "fact",
          supportIds: ["collateral.total_capacity", "transaction.requested_amount"],
        }],
      },
    ],
  };
}

export function redeHorizonteCaseInput(gold = loadRedeHorizonteGold()): CaseEngineInput {
  return {
    runId: "rede-horizonte-anchor-run-v1",
    caseId: gold.manifest.caseId,
    archetypeId: "growth_expansion",
    locale: "pt",
    referenceDate: "2026-07-31",
    candidates: redeHorizonteCandidates(gold),
    documents: redeHorizonteDocuments(gold),
    roomDocuments: redeHorizonteRoomDocuments(gold),
    dealBrief: {
      requestedAmount: "54000000",
      requestedTermMonths: 60,
      requestedGraceMonths: 12,
      sector: "Consumo / Varejo",
      geography: "SP",
      instruments: ["debenture", "ccb", "direct_loan"],
      collateralKinds: ["recebiveis", "estoque", "equipamento", "cessao_fiduciaria"],
      expectedRate: "CDI + faixa indicativa sujeita a mercado",
    },
    informationAnswers: {
      info_why_now: "Os três pontos comerciais foram selecionados e o cronograma de implantação começa em 2027. A dívida atual também precisa ser alongada antes da concentração de vencimentos.",
      info_business_model: "Rede regional de supermercados no interior de São Paulo, com receita de vendas em lojas físicas e margem gerada por escala de compras e mix de produtos.",
      info_customer_concentration: "Varejo pulverizado, sem cliente corporativo material. As vendas são distribuídas entre consumidores finais nas lojas.",
      info_management: "A administração é liderada pelos controladores e por uma equipe executiva com experiência no varejo alimentar.",
      info_seasonality: "O quarto trimestre é mais forte. O plano de liquidez considera a sazonalidade de vendas e capital de giro.",
      info_related_parties: "A companhia deverá confirmar contratos e saldos com partes relacionadas na diligência.",
      info_ramp_history: "As unidades comparáveis atingiram maturação operacional entre 15 e 18 meses. A companhia deverá disponibilizar a curva mensal das duas últimas aberturas durante a diligência.",
      info_capex_actual: "A última unidade comparável teve custo realizado próximo ao orçamento aprovado. A abertura por rubrica deverá ser confirmada com notas e contratos.",
    },
    resolvedMandates: redeHorizonteMandates(),
    externalReleaseApproved: false,
    writeBrief: async () => ({
      brief: redeHorizonteBrief(),
      blockedBy: [],
      usage: {costUsd: 0, modelCalls: 0},
      modelInvocations: [{provider: "deterministic_anchor_writer", model: "rede-horizonte-v1"}],
    }),
  };
}
