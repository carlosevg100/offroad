import type {CanonicalDepthPack, CoverageDomain} from "./types";

const VERSION = "2026.09.03-v1";
const OWNER = "Head de DCM e Especialistas de Crédito";
const jobs = ["company_debt_view", "origination_thesis", "capital_planning", "structure_from_documents", "review_existing_operation", "prepare_materials_and_process"] as const;
const functions = ["chief_financial_officer", "treasurer", "corporate_finance", "head_of_capital_markets", "dcm_banker", "corporate_banker", "relationship_manager", "structured_finance_banker", "debt_advisor", "independent_financial_advisor", "credit_analyst", "underwriter", "credit_risk", "portfolio_manager", "investment_committee", "loan_originator"];

type Requirement = CanonicalDepthPack["requirements"][number];
const req = (key: string, domain: CoverageDomain, label: string, questionAnswered: string, materiality: Requirement["materiality"], decisionImpacts: string[], acceptableEvidence: string[]): Requirement =>
  ({key, domain, label, questionAnswered, materiality, decisionImpacts, acceptableEvidence});

const common = {
  schemaVersion: "dcm-depth-pack.v1" as const,
  version: VERSION,
  owner: OWNER,
  supportedJobs: [...jobs],
  professionalFunctions: functions,
  maturity: "implemented" as const,
  reviewedBy: null,
  reviewedAt: null,
  goldCaseIds: [],
  adversarialCaseIds: [],
  generalistBenchmarkIds: [],
  incompatibleWith: [],
};

const pack = (value: Omit<CanonicalDepthPack, keyof typeof common> & Partial<typeof common>): CanonicalDepthPack =>
  ({...common, ...value});

export const dcmDepthPacks: readonly CanonicalDepthPack[] = [
  pack({
    id: "core.institutional-dcm", dimension: "core", activationKeys: ["core:institutional_dcm"], dependsOn: [],
    requirements: [
      req("core.company-perimeter", "company_and_business_model", "Perímetro econômico da companhia", "Qual entidade, grupo, moeda, período e atividade produzem o caixa que suporta a decisão?", "blocking", ["define o devedor e evita misturar caixa, dívida e EBITDA de perímetros distintos"], ["organograma societário", "demonstrações financeiras", "descrição do negócio"]),
      req("core.financial-truth", "historical_financials", "Base financeira reconciliada", "Os números materiais fecham entre demonstrações, notas, balancete, dívida e fluxo de caixa?", "blocking", ["torna alavancagem, liquidez e capacidade reproduzíveis"], ["DFP, ITR, 10-K ou 10-Q", "balancete e razão", "notas explicativas"]),
      req("core.debt-truth", "liquidity_and_debt_schedule", "Ledger de dívida e liquidez", "Quais obrigações existem, onde estão, quanto custam e quando vencem?", "blocking", ["governa todas as alternativas de capital"], ["mapa de dívida", "contratos", "notas de empréstimos e financiamentos"]),
      req("core.integrated-forward-case", "business_plan_and_sources_uses", "Modelo integrado e prospectivo", "Como operação, capital de giro, capex, impostos, dívida e caixa evoluem juntos durante o horizonte relevante?", "blocking", ["dimensiona capacidade, liquidez, serviço da dívida e consequência das alternativas"], ["orçamento ou guidance", "histórico normalizado", "premissas datadas", "modelo integrado"]),
      req("core.assumption-governance", "downside_and_sensitivities", "Premissas editáveis e governadas", "Qual fonte, data, racional, metodologia, confiança e impacto sustentam cada driver material?", "blocking", ["permite revisar o cenário sem confundir estimativa, guidance e fato"], ["livro de premissas", "fontes macro e setoriais", "versões de cenário"]),
      req("core.decision-objective", "capital_alternatives", "Objetivo econômico e critério de decisão", "Qual problema precisa ser resolvido e como sucesso será medido?", "high", ["impede seleção prematura de instrumento"], ["mandato do usuário", "plano de capital", "contexto da decisão"]),
    ],
    procedureIds: ["Q-17", "Q-18", "D-01", "D-24", "OP-01", "LC-01", "LC-04", "RF-01"],
    calculationPolicy: "required", calculationIds: ["financial.accounting_identity", "financial.debt_views", "financial.indexed_debt_schedule", "financial.net_leverage", "financial.dscr"],
    calculationRationale: "A identidade financeira, o modelo prospectivo, as visões de dívida, a alavancagem e a cobertura são o núcleo determinístico de qualquer trabalho DCM.",
    structureTermKeys: [], marketCriterionKeys: ["market.company.identity", "market.data.as_of_date"],
    disconfirmers: ["Perímetro societário ou período não resolvido.", "Demonstrações materiais não conciliam.", "Dívida ou caixa relevante permanece sem origem identificada."],
    qualityGateIds: ["gate.evidence-lineage", "gate.numeric-reconciliation", "gate.integrated-forecast", "gate.assumption-governance", "gate.no-silent-completeness", "gate.professional-boundary"],
  }),
  pack({
    id: "objective.refinance-liability-management", dimension: "capital_objective", activationKeys: ["objective:refinancing", "objective:liability_management", "situation:concentrated_maturities", "situation:tenor_extension", "situation:repricing", "situation:funding_source_diversification", "situation:expensive_debt_replacement", "situation:debt_exchange_or_buyback"], dependsOn: ["core.institutional-dcm"],
    requirements: [
      req("refi.maturity-wall", "liquidity_and_debt_schedule", "Vencimentos e fontes de pagamento", "Qual obrigação vence, em que data, e qual fonte contratada ou operacional a paga sem nova captação?", "blocking", ["dimensiona urgência, volume, tenor e contingência"], ["cronograma contrato a contrato", "fluxo de caixa mensal", "linhas comprometidas"]),
      req("refi.exit-cost", "structure_and_terms", "Custo e restrições de saída", "Quais fees, make-whole, breakage, consentimentos e garantias tornam a troca econômica ou juridicamente difícil?", "blocking", ["determina economia líquida e executabilidade"], ["contratos vigentes", "cartas de fee", "cálculo de pré-pagamento"]),
      req("refi.pro-forma-profile", "downside_and_sensitivities", "Perfil pró-forma e próxima parede", "A estrutura proposta melhora liquidez, custo e concentração também no downside?", "high", ["evita trocar uma parede por outra"], ["cronograma pró-forma", "cenários de taxa e não renovação"]),
      req("refi.contingency", "execution_timeline_and_contingency", "Plano de contingência", "Qual alternativa preserva liquidez se o take-out atrasar, encarecer ou não fechar?", "high", ["reduz risco de execução"], ["headroom de linhas", "plano B aprovado", "cronograma crítico"]),
    ],
    procedureIds: ["D-03", "D-05", "D-17", "D-18", "D-20", "D-26", "D-28", "D-30", "ES-02", "ES-03", "ES-10", "ES-40", "ES-45", "PR-01", "OP-05"],
    calculationPolicy: "required", calculationIds: ["financial.maturity_buckets", "financial.weighted_average_life", "financial.liquidity_coverage", "financial.all_in_cost", "structure.maturity_concentration", "operation.pro_forma_position"],
    calculationRationale: "Refinanciamento exige comparação reproduzível do antes e depois, incluindo custo de saída, concentração e cenário sem rolagem.",
    structureTermKeys: ["amount", "use.refinance", "tenor", "amortization", "prepayment", "conditions_precedent", "backup_liquidity"],
    marketCriterionKeys: ["market.refinancing.precedents", "market.tenor", "market.all_in_cost", "provider.refinancing_appetite"],
    disconfirmers: ["Não há parede ou déficit de liquidez após conciliação mensal.", "Custo de saída elimina a economia pretendida.", "Nova estrutura nasce em conflito contratual ou cria concentração maior.", "Fonte de take-out ou contingência não está suportada."],
    qualityGateIds: ["gate.refi.before-after", "gate.refi.no-new-wall", "gate.refi.exit-cost", "gate.refi.non-renewal"],
  }),
  pack({
    id: "objective.liquidity-working-capital", dimension: "capital_objective", activationKeys: ["objective:liquidity", "objective:working_capital", "situation:preventive_liquidity", "situation:seasonal_working_capital", "situation:structural_working_capital", "situation:supplier_or_inventory_cycle"], dependsOn: ["core.institutional-dcm"],
    requirements: [
      req("wc.monthly-cycle", "cash_conversion_and_working_capital", "Ciclo mensal e pico de necessidade", "Quando e por que caixa, recebíveis, estoque e fornecedores produzem o pico de funding?", "blocking", ["separa necessidade sazonal de déficit estrutural"], ["balancetes mensais", "fluxo de caixa semanal ou mensal", "aging e estoque"]),
      req("wc.borrowing-base", "receivables_inventory_or_contracts", "Base financiável", "Qual parcela dos ativos circulantes é elegível, livre, performada e realizável no prazo da dívida?", "high", ["limita capacidade asset-backed"], ["aging por sacado", "estoque por SKU", "contratos e ônus"]),
      req("wc.self-liquidation", "leverage_and_debt_service", "Fonte de liquidação", "A linha se paga com a conversão do ciclo ou depende de renovação permanente?", "blocking", ["define revolver, tranche permanente, amortização e risco de rolagem"], ["cash conversion cycle", "histórico de utilização e liquidação", "CFADS"]),
    ],
    procedureIds: ["Q-02", "Q-04", "Q-06", "Q-11", "Q-13", "Q-14", "D-05", "D-07", "D-26", "D-28", "ES-08", "ES-11", "ES-12", "OP-02"],
    calculationPolicy: "required", calculationIds: ["financial.working_capital", "financial.working_capital_investment", "financial.cash_conversion", "financial.seasonality", "financial.concentration", "financial.liquidity_coverage", "operation.incremental_working_capital"],
    calculationRationale: "A necessidade é medida ao longo do ciclo e reconciliada à fonte de liquidação, não inferida por um saldo pontual.",
    structureTermKeys: ["amount", "availability_period", "borrowing_base", "eligibility", "advance_rate", "reinvestment", "cash_dominion", "amortization"],
    marketCriterionKeys: ["market.working_capital.facilities", "provider.asset_appetite", "provider.seasonal_capacity"],
    disconfirmers: ["O pico resulta apenas de erro de período ou escala.", "Ativos propostos já estão onerados ou não convertem em caixa.", "A linha chamada sazonal nunca liquida ao longo do ciclo.", "Concentração ou diluição torna a base insuficiente."],
    qualityGateIds: ["gate.wc.monthly-series", "gate.wc.peak-trough", "gate.wc.self-liquidating", "gate.wc.eligibility"],
  }),
  pack({
    id: "objective.capex-expansion", dimension: "capital_objective", activationKeys: ["objective:capex", "objective:expansion", "situation:maintenance_capex", "situation:expansion_capex", "situation:greenfield_or_ramp_up", "situation:digital_or_product_investment"], dependsOn: ["core.institutional-dcm"],
    requirements: [
      req("capex.scope-budget", "business_plan_and_sources_uses", "Escopo, orçamento e fontes e usos", "O que será construído, quanto custa, quem aporta, quais contingências existem e quando cada desembolso ocorre?", "blocking", ["dimensiona tranche, equity first e overrun support"], ["orçamento por pacote", "cronograma físico-financeiro", "contratos e contingência"]),
      req("capex.ramp-up", "downside_and_sensitivities", "Ramp-up e geração incremental", "Quais drivers produzem receita, margem e caixa e como atraso, custo maior ou demanda menor afetam o serviço?", "blocking", ["governa carência, amortização e covenant"], ["business plan por driver", "capacidade contratada", "cenários de atraso e overrun"]),
      req("capex.incrementality", "historical_financials", "Separação entre base e projeto", "A companhia suporta a dívida antes e depois do projeto sem contar benefício duas vezes?", "high", ["evita financiar manutenção como crescimento ou EBITDA não disponível"], ["histórico standalone", "ponte de EBITDA e CFADS incremental"]),
    ],
    procedureIds: ["Q-03", "Q-10", "D-26", "ES-04", "ES-05", "ES-09", "ES-17", "ES-40", "OP-01", "OP-03", "OP-04", "OP-06", "IN-01", "IN-02", "IN-03"],
    calculationPolicy: "required", calculationIds: ["operation.sources_and_uses", "operation.disbursement_coverage", "operation.pro_forma_position", "financial.cfads", "structure.debt_service_schedule", "structure.coverage_series"],
    calculationRationale: "Capex requer sources and uses, desembolso, ramp-up e serviço da dívida no mesmo calendário.",
    structureTermKeys: ["amount", "use.capex", "equity_first", "drawdown", "completion_support", "cost_overrun", "grace", "amortization", "milestones"],
    marketCriterionKeys: ["market.capex.precedents", "provider.construction_risk", "provider.tenor"],
    disconfirmers: ["Orçamento não possui contingência ou base verificável.", "Ramp-up não está ligado a drivers operacionais.", "Carência termina antes da geração de caixa com margem de atraso.", "Estrutura depende de benefício duplicado no caso base."],
    qualityGateIds: ["gate.capex.sources-uses", "gate.capex.drawdown", "gate.capex.ramp-up", "gate.capex.overrun"],
  }),
  pack({
    id: "objective.acquisition-finance", dimension: "capital_objective", activationKeys: ["objective:acquisition", "situation:acquisition_finance", "situation:bridge_to_takeout"], dependsOn: ["core.institutional-dcm"],
    requirements: [
      req("ma.sources-uses", "business_plan_and_sources_uses", "Sources and uses da aquisição", "Preço, dívida assumida, fees, caixa mínimo, equity, earn-out e refinanciamentos fecham sem plug?", "blocking", ["define dívida nova e funding gap"], ["SPA ou LOI", "funding plan", "fee letters"]),
      req("ma.pro-forma", "historical_financials", "Combinado pró-forma reconciliado", "Buyer e target foram combinados com perímetro, dívida, caixa, leases e eliminações consistentes?", "blocking", ["determina alavancagem de entrada"], ["financials do buyer e target", "quality of earnings", "debt-like items"]),
      req("ma.synergy-case", "earnings_quality", "Sinergias separadas e faseadas", "Quais sinergias são contratuais, executáveis e disponíveis para serviço, e quais permanecem upside?", "high", ["impede sizing por EBITDA não capturado"], ["plano de integração", "ponte de sinergias", "custos one-off"]),
      req("ma.takeout", "execution_timeline_and_contingency", "Bridge, take-out e flex", "Se o mercado fechar, qual prazo, custo e contingência protegem o bridge?", "high", ["governa flex, backstop e risco de execução"], ["commitment papers", "take-out plan", "cenário de permanência"]),
    ],
    procedureIds: ["D-14", "D-22", "D-26", "ES-03", "ES-36", "ES-38", "ES-39", "ES-42", "OP-01", "OP-03", "OP-04", "OP-05", "PR-06", "RF-14"],
    calculationPolicy: "required", calculationIds: ["operation.sources_and_uses", "operation.pro_forma_position", "financial.net_leverage", "financial.cfads", "structure.debt_service_schedule", "structure.coverage_series", "operation.excess_funding_carry"],
    calculationRationale: "Aquisição exige identidade de sources and uses, pró-forma standalone, sinergias separadas e cenário de take-out atrasado.",
    structureTermKeys: ["purchase_price", "sources_and_uses", "equity_contribution", "bridge", "takeout", "flex", "acquired_debt", "synergy_credit", "conditions_precedent"],
    marketCriterionKeys: ["market.acquisition_finance.precedents", "provider.bridge_capacity", "provider.takeout_appetite"],
    disconfirmers: ["Sources and uses contém plug não explicado.", "Sinergias são necessárias para fechar alavancagem mas não estão suportadas.", "Dívida ou caixa da target foi omitido do pró-forma.", "Bridge não possui take-out ou backstop crível."],
    qualityGateIds: ["gate.ma.sources-uses", "gate.ma.pro-forma", "gate.ma.synergy-credit", "gate.ma.takeout"],
  }),
  pack({
    id: "analysis.collateral-security", dimension: "analysis_domain", activationKeys: ["analysis:collateral", "analysis:security", "situation:collateral_reorganization", "situation:inventory_or_asset_monetization", "situation:contract_backed_financing"], dependsOn: ["core.institutional-dcm"],
    requirements: [
      req("security.ledger", "collateral_and_security", "Ledger de garantias e ônus", "Qual ativo, de qual titular, garante qual obrigação, em que prioridade e com qual evidência vigente?", "blocking", ["evita dupla contagem e promessa de ativo indisponível"], ["contratos", "registros de ônus", "matrículas ou extratos"]),
      req("security.eligible-value", "collateral_and_security", "Valor elegível sob downside", "Qual valor líquido permanece após senioridade, haircut, custo e tempo de execução?", "high", ["limita capacidade por garantia"], ["laudo independente", "aging ou estoque", "política de haircut"]),
      req("security.control", "legal_tax_and_regulatory", "Constituição, controle e execução", "A garantia pode ser constituída, monitorada e executada na jurisdição e prazo da operação?", "blocking", ["determina condições precedentes e risco de execução"], ["parecer jurídico", "mecanismo de controle", "documentos de titularidade"]),
    ],
    procedureIds: ["D-07", "D-10", "D-19", "D-30", "ES-11", "ES-13", "ES-14", "ES-15", "ES-20", "ES-22", "ES-39"],
    calculationPolicy: "required", calculationIds: ["financial.collateral_haircuts", "financial.capacity_envelope", "financial.concentration"],
    calculationRationale: "Capacidade por garantia usa valor elegível, livre e pós-haircut; valor contábil ou nominal não basta.",
    structureTermKeys: ["security_asset", "priority", "eligibility", "haircut", "coverage_ratio", "perfection", "monitoring", "release"],
    marketCriterionKeys: ["market.collateral.haircuts", "provider.security_preferences", "jurisdiction.perfection"],
    disconfirmers: ["Titularidade, ônus ou prioridade não foram confirmados.", "O mesmo ativo suporta mais de uma capacidade calculada.", "Laudo está vencido ou usa premissa incompatível com execução.", "Mecanismo de controle não captura o ativo ou fluxo."],
    qualityGateIds: ["gate.security.title", "gate.security.no-double-count", "gate.security.haircut", "gate.security.perfection"],
  }),
  pack({
    id: "analysis.covenants", dimension: "analysis_domain", activationKeys: ["analysis:covenants", "situation:covenant_repair"], dependsOn: ["core.institutional-dcm"],
    requirements: [
      req("covenant.literal-definition", "covenants", "Definição contratual literal", "Qual fórmula, perímetro, data, ajustes, cura, waiver e consequência o contrato realmente determina?", "blocking", ["impede testar covenant com métrica analítica diferente"], ["contrato e aditivos", "certificado de compliance"]),
      req("covenant.headroom", "covenants", "Headroom base e downside", "Quanto a métrica pode deteriorar antes do gatilho em cada período relevante?", "blocking", ["governa sizing, amortização e flexibilidade"], ["cálculo contratual", "business plan", "cenários downside"]),
      req("covenant.interaction", "legal_tax_and_regulatory", "Interação entre contratos", "Nova dívida, garantia, distribuição ou reorganização dispara negative pledge, cross-default ou consentimento?", "high", ["testa compatibilidade no dia um"], ["todos os contratos materiais", "mapa de cross-default", "aprovações"]),
    ],
    procedureIds: ["D-20", "D-29", "D-30", "ES-23", "ES-24", "ES-25", "ES-26", "ES-27", "ES-28", "ES-31", "ES-32", "ES-42"],
    calculationPolicy: "required", calculationIds: ["structure.covenant_headroom", "financial.cross_default_propagation", "financial.net_leverage", "financial.dscr"],
    calculationRationale: "Covenant é recomputado na definição contratual e comparado separadamente à visão econômica Offroad.",
    structureTermKeys: ["covenant.definition", "covenant.level", "covenant.testing_date", "covenant.cure", "covenant.waiver", "negative_pledge", "cross_default"],
    marketCriterionKeys: ["market.covenant.precedents", "market.covenant.headroom"],
    disconfirmers: ["Definição contratual foi inferida sem contrato.", "Cálculo usa dívida, caixa ou EBITDA de perímetro diferente.", "Headroom não foi testado ao longo do prazo.", "Nova estrutura nasce em violação ou depende de waiver não obtido."],
    qualityGateIds: ["gate.covenant.literal-vs-analytical", "gate.covenant.headroom", "gate.covenant.downside", "gate.covenant.day-one"],
  }),
  pack({
    id: "analysis.downside-sensitivities", dimension: "analysis_domain", activationKeys: ["analysis:downside", "analysis:sensitivities", "analysis:credit"], dependsOn: ["core.institutional-dcm"],
    requirements: [
      req("downside.drivers", "downside_and_sensitivities", "Drivers e relações econômicas", "Quais variáveis movem receita, margem, NCG, capex, juros, câmbio e liquidez, e quais se movem juntas?", "blocking", ["evita choque universal ou cenário incoerente"], ["histórico por driver", "guidance", "premissas setoriais"]),
      req("downside.breakpoint", "downside_and_sensitivities", "Breakpoint e restrição vinculante", "Em que combinação de eventos caixa, covenant, garantia ou serviço deixa de fechar?", "high", ["identifica capacidade e mitigação material"], ["modelo integrado", "covenants", "borrowing base"]),
      req("downside.management-actions", "execution_timeline_and_contingency", "Ações de gestão e contingência", "Quais ações são controláveis, em quanto tempo e com qual custo ou dependência externa?", "high", ["separa mitigação executável de desejo"], ["plano aprovado", "linhas contratadas", "histórico de ação"]),
    ],
    procedureIds: ["Q-10", "Q-11", "Q-12", "D-26", "D-27", "D-28", "D-29", "ES-05", "ES-24", "ES-40", "RF-01", "RF-02", "RF-03"],
    calculationPolicy: "required", calculationIds: ["financial.cfads", "financial.cash_conversion", "financial.rate_shock", "financial.currency_exposure", "financial.liquidity_coverage", "financial.indexed_debt_schedule", "structure.coverage_series", "structure.covenant_headroom"],
    calculationRationale: "Downside precisa recalcular relações correlacionadas, mostrar breakpoints e separar ação controlável de fonte externa incerta.",
    structureTermKeys: ["downside_case", "minimum_liquidity", "covenant_buffer", "cash_sweep", "reserve_account", "contingency"],
    marketCriterionKeys: ["market.scenario.curves", "sector.downside.drivers", "provider.minimum_headroom"],
    disconfirmers: ["Cenário reduz apenas receita e ignora efeitos correlacionados.", "Mitigação depende de captação ainda não contratada.", "Prazo de reação excede o runway.", "Breakpoint não foi calculado para todos os períodos materiais."],
    qualityGateIds: ["gate.downside.driver-based", "gate.downside.breakpoint", "gate.downside.no-double-count", "gate.downside.contingency"],
  }),
  pack({
    id: "jurisdiction.brazil", dimension: "jurisdiction", activationKeys: ["jurisdiction:BR"], dependsOn: ["core.institutional-dcm"],
    requirements: [req("br.eligibility-regulation", "legal_tax_and_regulatory", "Elegibilidade e regras vigentes no Brasil", "Emissor, ativo, distribuição, tributação e garantias admitem a rota na data de referência?", "blocking", ["fecha ou abre cada rota jurídica sem eliminar a necessidade econômica"], ["CVM, B3, Banco Central, legislação e documentos societários vigentes"])],
    procedureIds: ["ES-30", "ES-33", "ES-36", "ES-37", "ES-44", "MK-01", "PR-01"], calculationPolicy: "conditional", calculationIds: ["financial.all_in_cost"],
    calculationRationale: "Tributos, fees e convenções locais entram no all-in quando a rota é comparada.", structureTermKeys: ["governing_law", "issuer_eligibility", "distribution_regime", "tax", "security_perfection"], marketCriterionKeys: ["br.cvm", "br.b3", "br.bcb", "br.anbima", "br.market_precedents"],
    disconfirmers: ["Regra, dado de mercado ou elegibilidade está sem data de vigência.", "Conclusão jurídica material não passou por especialista habilitado."], qualityGateIds: ["gate.br.as-of-date", "gate.br.legal-review", "gate.br.eligibility"],
  }),
  pack({
    id: "jurisdiction.united-states", dimension: "jurisdiction", activationKeys: ["jurisdiction:US"], dependsOn: ["core.institutional-dcm"],
    requirements: [req("us.eligibility-regulation", "legal_tax_and_regulatory", "Eligibility and current US rules", "Do borrower, security, offering exemption, tax and distribution path support the proposed route as of the decision date?", "blocking", ["prevents Brazilian assumptions from leaking into US structures"], ["SEC filings and rules", "UCC searches", "credit agreement", "qualified US legal advice"])],
    procedureIds: ["ES-30", "ES-33", "ES-36", "ES-37", "ES-44", "MK-01", "PR-01"], calculationPolicy: "conditional", calculationIds: ["financial.all_in_cost"],
    calculationRationale: "Fees, base-rate conventions and tax effects belong in the comparable all-in cost.", structureTermKeys: ["governing_law", "borrower_eligibility", "offering_exemption", "tax", "ucc_perfection"], marketCriterionKeys: ["us.sec", "us.federal_reserve", "us.treasury", "us.finra", "us.market_precedents"],
    disconfirmers: ["A US conclusion relies on Brazilian terminology or regulation.", "A material legal or tax conclusion lacks current qualified review."], qualityGateIds: ["gate.us.as-of-date", "gate.us.legal-review", "gate.us.eligibility"],
  }),
  pack({
    id: "instrument.br-bank-loan", dimension: "instrument", activationKeys: ["instrument:BR:ccb", "instrument:BR:bilateral", "instrument:BR:club_or_syndicated"], dependsOn: ["jurisdiction.brazil"],
    requirements: [req("instrument.br-bank.capacity", "structure_and_terms", "Capacidade bancária e desenho bilateral ou sindicado", "Qual lender, compromisso, hold, syndication, amortização, garantia e flexibilidade cabem no caso?", "high", ["compara velocidade, certeza, custo e concentração"], ["term sheets comparáveis", "perfil de bancos", "contratos existentes"])], procedureIds: ["D-04", "D-05", "D-17", "ES-02", "ES-03", "ES-39", "ES-41", "ES-44", "PR-01", "MK-07"], calculationPolicy: "required", calculationIds: ["financial.all_in_cost", "structure.debt_service_schedule", "financial.concentration"], calculationRationale: "A rota é comparada por caixa, all-in, amortização e concentração de credor.", structureTermKeys: ["commitment", "hold", "syndication", "fees", "amortization", "security", "prepayment"], marketCriterionKeys: ["provider.balance_sheet", "provider.hold", "provider.ticket", "provider.sector", "provider.structure"], disconfirmers: ["Linha é tratada como comprometida sem documento.", "All-in omite IOF, fee ou hedge material.", "Syndication é necessária mas não existe backstop claro."], qualityGateIds: ["gate.instrument.bank.commitment", "gate.instrument.bank.all-in", "gate.instrument.bank.hold"],
  }),
  pack({
    id: "instrument.br-capital-markets", dimension: "instrument", activationKeys: ["instrument:BR:debenture", "instrument:BR:commercial_note", "instrument:BR:capital_markets"], dependsOn: ["jurisdiction.brazil"],
    requirements: [req("instrument.br-dcm.execution", "market_pricing_and_precedents", "Rota de mercado de capitais Brasil", "Qual emissor, regime, público, coordenadores, documentos, rating, bookbuilding e janela tornam a emissão executável?", "high", ["liga estrutura à execução e demanda real"], ["precedentes ANBIMA/B3/CVM", "atos societários", "feedback de distribuição"])], procedureIds: ["ES-30", "ES-31", "ES-33", "ES-36", "ES-41", "ES-43", "ES-44", "MK-01", "MK-04", "MK-08", "PR-01", "PR-11"], calculationPolicy: "required", calculationIds: ["financial.all_in_cost", "financial.indexed_debt_schedule", "financial.indexed_debt_aggregation", "structure.debt_service_schedule", "structure.maturity_concentration"], calculationRationale: "Preço, fees, curva, amortização, correção monetária paga ou capitalizada e concentração são comparados numa base datada.", structureTermKeys: ["security_type", "offering_regime", "investor_audience", "rating", "bookbuilding", "distribution", "trustee", "indexation_treatment"], marketCriterionKeys: ["br.anbima.deals", "br.b3.issuances", "br.cvm.filings", "provider.distribution"], disconfirmers: ["Forma societária ou ato não permite a emissão.", "Comparável não tem data, senioridade, prazo ou risco compatível.", "Demanda presumida substitui evidência de distribuição.", "Correção monetária é tratada como caixa ou principal sem suporte no instrumento."], qualityGateIds: ["gate.instrument.br-dcm.eligibility", "gate.instrument.br-dcm.comparables", "gate.instrument.br-dcm.indexation-treatment", "gate.instrument.br-dcm.execution"],
  }),
  pack({
    id: "instrument.br-receivables", dimension: "instrument", activationKeys: ["instrument:BR:fidc", "instrument:BR:receivables_assignment", "situation:receivables_monetization"], dependsOn: ["jurisdiction.brazil", "analysis.collateral-security"],
    requirements: [req("instrument.br-receivables.pool", "receivables_inventory_or_contracts", "Carteira, elegibilidade e risco retido", "A carteira é auditável, transferível, granular e suficiente após concentração, atraso, diluição, recompra e first loss?", "blocking", ["define capacidade, advance rate, subordinação e veículo"], ["arquivo de recebíveis", "histórico de coortes", "contratos e política de crédito"])], procedureIds: ["Q-06", "Q-14", "D-07", "ES-11", "ES-12", "ES-20", "ES-21", "ES-44", "PR-01", "MK-07"], calculationPolicy: "required", calculationIds: ["financial.concentration", "financial.collateral_haircuts", "financial.capacity_envelope"], calculationRationale: "Capacidade decorre da carteira elegível líquida e do risco retido, não do saldo nominal de contas a receber.", structureTermKeys: ["eligibility", "advance_rate", "subordination", "first_loss", "dilution", "repurchase", "collection_account", "replenishment"], marketCriterionKeys: ["provider.receivables_appetite", "provider.advance_rate", "provider.concentration_limits"], disconfirmers: ["Arquivo não reconcilia ao razão.", "Cessão, recompra ou recurso econômico foram lidos incorretamente.", "Concentração ou diluição consome a cobertura.", "Carteira já está cedida ou onerada."], qualityGateIds: ["gate.receivables.reconciliation", "gate.receivables.eligibility", "gate.receivables.risk-retention", "gate.receivables.capacity"],
  }),
  pack({
    id: "instrument.us-bank-loan", dimension: "instrument", activationKeys: ["instrument:US:revolver", "instrument:US:term_loan", "instrument:US:syndicated_loan"], dependsOn: ["jurisdiction.united-states"],
    requirements: [req("instrument.us-bank.credit-agreement", "structure_and_terms", "US revolver or term-loan structure", "Do commitment, base rate, spread grid, amortization, baskets, security and syndication mechanics fit the borrower and purpose?", "high", ["compares committed liquidity, flexibility and total economics"], ["credit agreements", "commitment papers", "comparable facilities"])], procedureIds: ["D-05", "D-17", "D-20", "ES-23", "ES-26", "ES-27", "ES-28", "ES-39", "ES-44", "PR-01"], calculationPolicy: "required", calculationIds: ["financial.all_in_cost", "structure.debt_service_schedule", "structure.covenant_headroom"], calculationRationale: "Cash interest, OID and fees are compared on the actual schedule and covenant grid.", structureTermKeys: ["commitment", "base_rate", "spread_grid", "oid", "amortization", "baskets", "security", "syndication"], marketCriterionKeys: ["us.loan_comparables", "provider.revolver_capacity", "provider.hold", "provider.syndication"], disconfirmers: ["Availability is assumed from an uncommitted indication.", "SOFR floor, OID or unused fee is omitted.", "Incremental debt or liens are blocked by existing baskets."], qualityGateIds: ["gate.instrument.us-bank.commitment", "gate.instrument.us-bank.all-in", "gate.instrument.us-bank.baskets"],
  }),
  pack({
    id: "instrument.us-asset-based-loan", dimension: "instrument", activationKeys: ["instrument:US:abl", "instrument:US:asset_based"], dependsOn: ["jurisdiction.united-states", "analysis.collateral-security"],
    requirements: [req("instrument.us-abl.borrowing-base", "receivables_inventory_or_contracts", "ABL borrowing base and controls", "What eligible receivables and inventory remain after reserves, concentration limits and ineligibles, and how will cash dominion operate?", "blocking", ["determines availability, liquidity covenant and reporting burden"], ["borrowing-base certificate", "A/R aging", "inventory appraisal", "field exam"])], procedureIds: ["Q-13", "Q-14", "D-07", "D-19", "ES-11", "ES-14", "ES-20", "ES-21", "ES-44"], calculationPolicy: "required", calculationIds: ["financial.collateral_haircuts", "financial.concentration", "financial.capacity_envelope", "financial.liquidity_coverage"], calculationRationale: "ABL availability is the eligible borrowing base net of reserves, not gross working-capital assets.", structureTermKeys: ["borrowing_base", "advance_rate", "reserves", "availability_block", "cash_dominion", "field_exam", "appraisal"], marketCriterionKeys: ["us.abl.advance_rates", "provider.abl_appetite", "provider.field_exam"], disconfirmers: ["Borrowing base does not reconcile to the ledger.", "Inventory appraisal or field exam is unavailable.", "Concentration and dilution reserves exhaust availability.", "Existing liens block first-priority collateral."], qualityGateIds: ["gate.instrument.us-abl.reconciliation", "gate.instrument.us-abl.reserves", "gate.instrument.us-abl.liens"],
  }),
  pack({
    id: "instrument.us-private-credit", dimension: "instrument", activationKeys: ["instrument:US:private_credit", "instrument:US:unitranche", "instrument:US:direct_lending"], dependsOn: ["jurisdiction.united-states"],
    requirements: [req("instrument.us-private-credit.fit", "capital_provider_fit", "Direct-lender fit and structure", "Which lenders can underwrite the ticket, sector, leverage, documentation, hold and speed, and at what complete economics?", "high", ["discriminates real lender fit instead of producing a generic logo list"], ["current mandates", "closed transactions", "direct lender feedback"])], procedureIds: ["D-17", "D-20", "ES-23", "ES-27", "ES-32", "ES-33", "ES-39", "ES-41", "ES-44", "MK-04", "MK-07", "MK-10", "PR-01"], calculationPolicy: "required", calculationIds: ["financial.all_in_cost", "financial.net_leverage", "financial.dscr", "structure.covenant_headroom"], calculationRationale: "Private-credit comparison must include cash/PIK, OID, fees, call protection, leverage and covenant headroom.", structureTermKeys: ["cash_coupon", "pik", "oid", "fees", "call_protection", "covenants", "equity_cure", "hold", "delayed_draw"], marketCriterionKeys: ["provider.current_mandate", "provider.ticket", "provider.sector", "provider.leverage", "provider.hold", "provider.speed"], disconfirmers: ["Provider fit rests only on historical branding.", "Current mandate, hold or ticket is stale or unknown.", "PIK, OID, call protection or fees are omitted from all-in.", "Structure requires leverage or baskets outside evidenced appetite."], qualityGateIds: ["gate.instrument.us-pc.current-mandate", "gate.instrument.us-pc.complete-economics", "gate.instrument.us-pc.discriminated-fit"],
  }),
  pack({
    id: "instrument.us-capital-markets", dimension: "instrument", activationKeys: ["instrument:US:high_yield", "instrument:US:private_placement", "instrument:US:bond"], dependsOn: ["jurisdiction.united-states"],
    requirements: [req("instrument.us-bond.execution", "market_pricing_and_precedents", "US bond or private-placement execution", "Do issuer, exemption or registration path, investor base, rating, covenants, call schedule, size and window support issuance?", "high", ["links a financeable structure to an executable market path"], ["SEC filings", "indentures", "offering memoranda", "current market comparables"])], procedureIds: ["D-17", "D-20", "ES-26", "ES-27", "ES-28", "ES-33", "ES-36", "ES-43", "ES-44", "MK-01", "MK-04", "PR-01"], calculationPolicy: "required", calculationIds: ["financial.all_in_cost", "structure.debt_service_schedule", "structure.maturity_concentration"], calculationRationale: "Coupon, OID, fees, call schedule and maturity profile must be compared on dated market evidence.", structureTermKeys: ["offering_path", "rating", "coupon", "oid", "call_schedule", "covenants", "registration_rights", "distribution"], marketCriterionKeys: ["us.bond_comparables", "us.treasury_curve", "provider.distribution", "investor.current_appetite"], disconfirmers: ["Issue size is below executable market minimum without a private-placement path.", "Comparable lacks matching rating, sector, tenor or seniority.", "Market window or distribution evidence is stale.", "Call schedule or OID is omitted from economics."], qualityGateIds: ["gate.instrument.us-bond.eligibility", "gate.instrument.us-bond.comparables", "gate.instrument.us-bond.execution"],
  }),
];

export const depthPackById: ReadonlyMap<string, CanonicalDepthPack> = new Map(dcmDepthPacks.map((candidate) => [candidate.id, candidate]));
