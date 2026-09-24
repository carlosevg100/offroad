import type {ReferenceDataProposal, ReferenceDataProposalFamily} from "./types";

/**
 * Structure: maturity wall, covenants, leverage and coverage, repayment design, reserves, collateral,
 * appraisal, cross-default, reporting, cure and waiver, sellable structure, ticket and conditions
 * precedent.
 *
 * Every value is a draft prepared for the founder's review. Decimal quantities (fractions, multiples,
 * amounts in reais) are strings so that a method reads them with Decimal; counts of months, days and
 * uses are integers. Field names carry the unit. The card of each key, in
 * `knowledge/reference-data/structure.md`, carries the reasoning, the sources and the review triggers.
 */

const version = "2026.09.24-v1";
const asOf = "2026-09-24";
const observedBy = "Offroad (Claude, executor), 24/09/2026, aguardando revisão do fundador";

function proposal(key: string, unit: string, source: {title: string; url: string}, value: ReferenceDataProposal["value"]): ReferenceDataProposal {
  return {version, value, unit, source: {...source, observedBy}, asOf, documentation: `knowledge/reference-data/structure.md#${key}`};
}

const collateralHaircuts = proposal(
  "policy.structure.collateral_haircuts",
  "fração do valor livre do ativo (0 a 1)",
  {
    title: "Lei nº 9.514/1997, arts. 22 a 27, na redação da Lei nº 14.711/2023 (alienação fiduciária de imóvel e lance mínimo de metade do valor de avaliação no segundo leilão); Lei nº 4.728/1965, art. 66-B; Lei nº 11.101/2005, art. 49, § 3º",
    url: "https://www.planalto.gov.br/ccivil_03/leis/l9514.htm",
  },
  {
    measure: "valor elegível = valor livre × (1 − haircut); valor livre = valor-base menos o saldo das obrigações que já oneram o ativo com prioridade anterior (D-19)",
    valueBasis: {
      property: "valor de mercado do laudo vigente (policy.structure.appraisal-validity); quando o laudo informa valor de liquidação forçada, usar o menor dos dois; nunca valor contábil nem custo de reposição",
      vehicles: "preço médio da Tabela Fipe do mês de referência para modelo e ano; veículo de uso profissional ou especial, fora da Tabela Fipe, por laudo",
      equipment: "valor de revenda no mercado secundário por laudo vigente ou cotação datada; máquina agrícola pela Tabela Fipe de máquinas agrícolas; nunca custo de aquisição",
      receivables: "saldo a vencer performado, líquido da diluição medida em 12 meses (devoluções, abatimentos, cancelamentos), de títulos vencidos, de sacados do mesmo grupo econômico, de títulos já cedidos ou onerados e do excesso sobre os limites de concentração",
      inventory: "menor entre custo e valor líquido realizável, pelo último relatório de monitoria independente",
      shares: "patrimônio líquido contábil da investida na última demonstração auditada ou revisada; se listada, o menor entre esse valor e o valor de mercado",
      financialInvestments: "valor de mercado na data (marcação a mercado)",
    },
    classes: [
      {id: "financial_investments", dealStructureClass: "financial", haircut: "0.05", allowedRange: ["0.00", "0.10"], eligibility: "títulos públicos federais, operações compromissadas lastreadas neles, CDB ou LCA de instituição dos segmentos S1 ou S2 e fundos DI com resgate em D+0 ou D+1, cedidos fiduciariamente e bloqueados em favor do credor"},
      {id: "receivables_card", dealStructureClass: "receivables", haircut: "0.15", allowedRange: ["0.10", "0.25"], eligibility: "recebíveis de arranjo de pagamento registrados em registradora autorizada, com trava do domicílio de liquidação em favor do credor"},
      {id: "receivables_performed_diversified", dealStructureClass: "receivables", haircut: "0.25", allowedRange: ["0.20", "0.30"], eligibility: "performados, com maior sacado até 10% e cinco maiores até 35% da carteira elegível, atraso acima de 30 dias até 5% da carteira e diluição medida em 12 meses"},
      {id: "receivables_performed_concentrated", dealStructureClass: "receivables", haircut: "0.40", allowedRange: ["0.30", "0.60"], eligibility: "performados fora dos limites de pulverização, ou com atraso acima de 30 dias entre 5% e 10% da carteira"},
      {id: "receivables_unperformed", dealStructureClass: "receivables", haircut: "1.00", exceptionFloor: "0.50", eligibility: "a performar não conta; exceção registrada só com medição ou entrega periódica auditável, histórico de performance do contrato e reserva"},
      {id: "property_urban_liquid", dealStructureClass: "property", haircut: "0.35", allowedRange: ["0.30", "0.45"], eligibility: "imóvel urbano residencial, comercial ou logístico de padrão de mercado, em capital ou região metropolitana, matrícula sem ônus anterior não quitado, laudo vigente, seguro com o credor beneficiário"},
      {id: "property_operational", dealStructureClass: "property", haircut: "0.45", allowedRange: ["0.40", "0.55"], eligibility: "imóvel operacional da própria companhia (planta, centro de distribuição) ou imóvel urbano fora de região metropolitana"},
      {id: "property_special_use_or_rural", dealStructureClass: "property", haircut: "0.55", allowedRange: ["0.50", "0.70"], eligibility: "imóvel de uso único, em praça de baixa liquidez, ou rural; a venda tende ao lance do segundo leilão, de no mínimo metade do valor de avaliação"},
      {id: "vehicles", dealStructureClass: "vehicles", haircut: "0.40", allowedRange: ["0.30", "0.50"], eligibility: "gravame anotado no certificado de registro do veículo, seguro com o credor beneficiário, idade compatível com o prazo da dívida"},
      {id: "equipment_standard", dealStructureClass: "equipment", haircut: "0.50", allowedRange: ["0.40", "0.60"], eligibility: "bem padronizado com mercado secundário (linha amarela, máquina agrícola, caminhão, empilhadeira), alienação fiduciária registrada, seguro endossado"},
      {id: "equipment_specific", dealStructureClass: "equipment", haircut: "0.80", allowedRange: ["0.70", "1.00"], eligibility: "bem customizado ou incorporado à planta, sem mercado secundário observável"},
      {id: "inventory_commodity_warehoused", dealStructureClass: "inventory", haircut: "0.40", allowedRange: ["0.30", "0.50"], eligibility: "commodity ou insumo padronizado em armazém de terceiro com CDA/WA ou monitoria independente e fiel depositário"},
      {id: "inventory_finished_goods", dealStructureClass: "inventory", haircut: "0.60", allowedRange: ["0.50", "0.70"], eligibility: "produto acabado de marca própria com monitoria independente e giro mínimo contratado"},
      {id: "inventory_perishable_or_fashion", dealStructureClass: "inventory", haircut: "1.00", eligibility: "perecível, moda ou estoque com sinal RF-01 ativo não conta"},
      {id: "shares_quotas", dealStructureClass: "shares", haircut: "0.60", allowedRange: ["0.50", "0.80"], maxShareOfPackage: "0.30", eligibility: "quotas ou ações da operadora com execução factível sob o acordo de acionistas e o estatuto; reforço, nunca lastro principal"},
      {id: "bank_guarantee", dealStructureClass: null, haircut: "0.05", allowedRange: ["0.00", "0.10"], eligibility: "fiança bancária de instituição dos segmentos S1 ou S2 com prazo igual ou maior que o da dívida, ou renovação obrigatória com antecedência mínima de 90 dias sob pena de vencimento"},
      {id: "surety_insurance", dealStructureClass: null, haircut: "0.15", allowedRange: ["0.10", "0.25"], eligibility: "seguro garantia sob a Circular SUSEP nº 662/2022, com vigência igual à da obrigação garantida e exclusões da apólice lidas e compatíveis"},
      {id: "personal_guarantee", dealStructureClass: "guarantee", haircut: "1.00", eligibility: "aval ou fiança de sócios alinha incentivo e não conta como cobertura"},
      {id: "unclassified", dealStructureClass: "other", haircut: "0.70", eligibility: "classe não reconhecida entra com o desconto de desconhecido até ser classificada"},
    ],
    downsideAdditionalHaircut: {
      receivables: "0.10",
      inventory: "0.15",
      shares: "0.20",
      equipment: "0.10",
      vehicles: "0.05",
      property: "0.05",
      financialInvestments: "0.00",
      bankGuarantee: "0.00",
      suretyInsurance: "0.05",
      rule: "no teste de downside do pacote (ES-20), somar o acréscimo ao haircut da classe; ativo pró-cíclico perde valor no mesmo cenário em que a garantia é executada",
    },
    rules: {
      perfection: "garantia sem constituição e registro no órgão competente (registro de imóveis, títulos e documentos, órgão de trânsito, registradora ou escriturador) conta zero até o registro, que vira condição precedente",
      doubleCounting: "o mesmo ativo ou fluxo conta uma vez; estoque e recebíveis do mesmo ciclo comercial contam pelo maior dos dois, salvo base de empréstimo que acompanhe a conversão de um no outro",
      concentration: "excesso sobre os limites de sacado sai do valor-base antes do haircut",
      essentialCapitalGoods: "bem de capital essencial à atividade recebe o haircut do limite superior da faixa da classe, porque a retirada fica suspensa durante o prazo de 180 dias, prorrogável uma vez, da recuperação judicial",
      secondLien: "alienação fiduciária da propriedade superveniente entra só como reforço, pelo valor residual depois da dívida garantida pela primeira",
      caseEvidence: "o haircut do caso só se afasta do padrão dentro da faixa, com evidência datada (diluição medida, laudo com valor de liquidação forçada, histórico de leilão); fora da faixa exige aprovação do dono do parâmetro",
      sharesRole: "quotas e ações somam no máximo 30% do valor pós-haircut do pacote",
    },
  },
);

const collateralCoverage = proposal(
  "policy.structure.collateral-coverage",
  "múltiplo (x) de valor pós-haircut sobre o saldo devedor",
  {
    title: "BNDES Project Finance: índice de 130% de garantias reais e as condições de sua dispensa",
    url: "https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/bndes-project-finance",
  },
  {
    metric: "soma dos valores pós-haircut (policy.structure.collateral_haircuts) das garantias constituídas e registradas, sem dupla contagem ÷ saldo devedor da operação, incluídos juros capitalizados",
    profiles: [
      {profile: "unsecured_corporate", minimumCoverage: null, rule: "crédito quirografário com negative pledge; cobertura não exigida"},
      {profile: "secured_corporate_reinforcement", minimumCoverage: "0.50", rule: "garantia como reforço de crédito com capacidade demonstrada: alavancagem até a zona aceitável e DSCR de downside acima do piso"},
      {profile: "secured_corporate_primary", minimumCoverage: "0.80", rule: "garantia como suporte principal: alavancagem na zona tensionada ou DSCR de downside até 0,10 acima do piso"},
      {profile: "asset_based", minimumCoverage: "1.00", rule: "operação dimensionada pelo ativo (recebíveis, estoque, equipamento financiado)"},
      {profile: "project_finance", minimumCoverage: null, rule: "cobertura substituída pelo pacote completo do projeto: ações, recebíveis, contas, direitos emergentes e assunção de controle"},
      {profile: "venture_debt", minimumCoverage: null, rule: "fora desta chave"},
    ],
    downsideMinimumCoverage: {profiles: ["secured_corporate_primary", "asset_based"], minimumCoverage: "0.80", rule: "com os acréscimos de haircut de downside da chave de haircuts"},
    excessCoverage: {threshold: "1.30", rule: "acima de 1,30x pós-haircut, a garantia excedente é capacidade futura consumida; propor liberação ou redução"},
    nominalEquivalent: "cobertura contratual nominal equivalente = cobertura pós-haircut ÷ (1 − haircut da classe); recebíveis pulverizados a 1,00x pós-haircut equivalem a 1,33x nominal (133% do saldo)",
    dealStructureMapping: {collateralPolicyVersion: version, minimumCollateralCoverage: "minimumCoverage do perfil do caso"},
  },
);

const appraisalValidity = proposal(
  "policy.structure.appraisal-validity",
  "meses de idade do laudo ou do relatório na data indicada; dias para dados de carteira e estoque",
  {
    title: "Lei nº 9.514/1997, art. 24, VI e parágrafo único, e art. 27, § 2º: valor do imóvel para leilão, critérios de revisão e lance mínimo de metade do valor de avaliação",
    url: "https://www.planalto.gov.br/ccivil_03/leis/l9514.htm",
  },
  {
    byAssetClass: [
      {assetClass: "property_urban", standard: "ABNT NBR 14653-2", maxAgeMonthsAtIndicativeStructure: 12, maxAgeMonthsAtDisbursement: 6, revaluationEveryMonths: 24},
      {assetClass: "property_rural_or_special_use", standard: "ABNT NBR 14653-3 para rurais; NBR 14653-2 para urbanos de uso único", maxAgeMonthsAtIndicativeStructure: 12, maxAgeMonthsAtDisbursement: 6, revaluationEveryMonths: 12},
      {assetClass: "equipment", standard: "ABNT NBR 14653-5", maxAgeMonthsAtIndicativeStructure: 12, maxAgeMonthsAtDisbursement: 6, revaluationEveryMonths: 12},
      {assetClass: "vehicles_and_agricultural_machinery", standard: "Tabela Fipe do mês de referência", maxAgeMonthsAtIndicativeStructure: 1, maxAgeMonthsAtDisbursement: 1, revaluationEveryMonths: 1},
      {assetClass: "inventory", standard: "relatório de monitoria independente", maxAgeDays: 30},
      {assetClass: "receivables", standard: "carteira analítica com aging e base elegível", maxAgeDays: 30},
      {assetClass: "shares_quotas", standard: "última demonstração auditada ou revisada da investida", maxAgeMonthsAtIndicativeStructure: 6, maxAgeMonthsAtDisbursement: 6, revaluationEveryMonths: 12},
      {assetClass: "financial_investments", standard: "marcação a mercado", maxAgeDays: 1},
    ],
    independence: [
      "avaliador sem vínculo societário, de parentesco ou de remuneração variável com a companhia, seus controladores ou partes relacionadas",
      "remuneração fixa, sem honorário de êxito ligado à operação",
      "laudo de imóvel e de equipamento assinado por engenheiro ou arquiteto registrado, com ART ou RRT",
      "método declarado (comparativo para imóvel líquido, renda para imóvel gerador de renda, custo apenas para uso único com depreciação e obsolescência), com valor de mercado e, quando possível, valor de liquidação forçada",
      "laudo contratado pela companhia é aceito com essas condições; laudo de parte relacionada não conta (ES-13)",
    ],
    earlyRevaluationTriggers: ["cobertura pós-haircut a menos de 0,10x do mínimo de policy.structure.collateral-coverage", "queda acima de 10% no índice de preços de referência do ativo desde o laudo", "sinistro, embargo, penhora ou alteração de zoneamento", "pedido de substituição de garantia"],
    staleRule: "laudo além do prazo não conta no pacote; o ativo aparece como a laudar, com a atualização como condição precedente",
  },
);

export const structureProposals: ReferenceDataProposalFamily = {
  "policy.structure.collateral_haircuts": collateralHaircuts,
  "policy.structure.collateral-coverage": collateralCoverage,
  "policy.structure.appraisal-validity": appraisalValidity,
};
