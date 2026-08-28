import type {ReceivablesEligibilityFactId} from "./receivables-routes";

export const receivablesEvidenceCatalogueVersion = "2026.08.28-v1";

export type ReceivablesEvidenceCollectionStage =
  | "portfolio_base"
  | "legal_availability"
  | "commercial_performance"
  | "cash_operations"
  | "company_credit"
  | "sponsored_program"
  | "institutional_structure"
  | "secured_facility";

export type ReceivablesEvidenceCollectionDefinition = {
  factId: ReceivablesEligibilityFactId;
  stage: ReceivablesEvidenceCollectionStage;
  batchId: string;
  priority: 1 | 2 | 3 | 4;
  title: string;
  clientInstruction: string;
  whyItMatters: string;
  acceptedEvidence: readonly string[];
  decisionStandard: string;
  /** A declaration can guide the search, but cannot close a route fact by itself. */
  attestationAloneCanDecide: false;
};

/**
 * Canonical evidence collection contract for receivables route facts.
 *
 * This catalogue says what the desk needs and why. The case engine decides what remains
 * necessary after reading the evidence already delivered. Keeping the catalogue here avoids
 * a second, drifting checklist in the UI or in an agent prompt.
 */
export const receivablesEvidenceCollectionDefinitions: readonly ReceivablesEvidenceCollectionDefinition[] = [
  {
    factId: "claim_existence_evidenced",
    stage: "portfolio_base",
    batchId: "portfolio_universe",
    priority: 1,
    title: "Carteira e documentos de origem",
    clientInstruction: "Compartilhe a relação título a título e os documentos que deram origem aos créditos, no formato em que já existirem.",
    whyItMatters: "Permite confirmar que cada crédito existe e delimitar exatamente o universo que pode ser analisado.",
    acceptedEvidence: ["base analítica com identificador por título", "NF-e, fatura ou documento equivalente", "contrato ou pedido comercial vinculado ao título"],
    decisionStandard: "Cada título do universo considerado possui identificador e documento de origem verificável.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "analytical_tape_available",
    stage: "portfolio_base",
    batchId: "portfolio_universe",
    priority: 1,
    title: "Base analítica da carteira",
    clientInstruction: "Envie a carteira completa, título a título, com sacado, documento de origem, datas, valor e situação atual.",
    whyItMatters: "A análise de concentração, prazo, desempenho e capacidade depende de uma base completa e reconciliável.",
    acceptedEvidence: ["exportação do ERP", "arquivo de contas a receber", "CNAB ou arquivo do administrador com dicionário de campos"],
    decisionStandard: "O arquivo cobre o universo completo e contém chaves suficientes para reconciliar título, sacado, documento fiscal e contabilidade.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "recurring_origination_available",
    stage: "portfolio_base",
    batchId: "portfolio_universe",
    priority: 3,
    title: "Originação recorrente",
    clientInstruction: "Inclua o histórico mensal de títulos originados para mostrar volume, sazonalidade e recorrência.",
    whyItMatters: "Linhas recorrentes e estruturas dedicadas precisam de reposição compatível com a utilização pretendida.",
    acceptedEvidence: ["histórico de faturamento título a título", "relatório mensal de originação", "razão de clientes reconciliado"],
    decisionStandard: "O histórico medido permite observar volume e recorrência por período, sem depender de projeção não comprovada.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "cedent_ownership_confirmed",
    stage: "legal_availability",
    batchId: "ownership_and_encumbrances",
    priority: 1,
    title: "Titularidade e disponibilidade dos créditos",
    clientInstruction: "Compartilhe os controles e extratos que permitam verificar quem é o titular atual de cada crédito.",
    whyItMatters: "Um crédito somente pode sustentar a operação se pertencer ao cedente e estiver disponível para a estrutura proposta.",
    acceptedEvidence: ["extrato de registradora", "posição de cessões por credor", "contratos e termos de cessão", "extratos de borderôs reconciliados"],
    decisionStandard: "A titularidade está confirmada para todo o universo relevante por fonte verificável.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "unresolved_prior_assignment_or_lien",
    stage: "legal_availability",
    batchId: "ownership_and_encumbrances",
    priority: 1,
    title: "Cessões, travas e gravames existentes",
    clientInstruction: "Envie a posição atual das cessões e garantias sobre recebíveis. Se houver uma trava, inclua saldo e condição de liberação.",
    whyItMatters: "Uma cessão anterior ou trava pode reduzir a carteira livre e mudar a ordem de execução da operação.",
    acceptedEvidence: ["consulta de registradora", "contratos bancários e anexos de garantia", "posição por credor e saldo", "carta de liberação ou waiver"],
    decisionStandard: "Todo o universo foi verificado e qualquer direito anterior foi segregado, liberado ou teve sua prioridade definida.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "title_control_and_duplicate_check_available",
    stage: "legal_availability",
    batchId: "ownership_and_encumbrances",
    priority: 1,
    title: "Controle de títulos e duplicidades",
    clientInstruction: "Compartilhe o controle usado para marcar títulos cedidos, recebidos, baixados ou onerados.",
    whyItMatters: "Evita apresentar o mesmo título mais de uma vez e preserva uma carteira livre verificável.",
    acceptedEvidence: ["controle do ERP por título", "extrato de registradora", "posição de borderôs", "conciliação de recebimentos e baixas"],
    decisionStandard: "O processo identifica, no universo completo, titularidade, duplicidade, pagamento e ônus por título.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "contractual_assignability_confirmed",
    stage: "legal_availability",
    batchId: "commercial_contracts",
    priority: 1,
    title: "Contratos com os principais sacados",
    clientInstruction: "Envie os contratos ou condições comerciais aplicáveis aos maiores sacados para verificarmos eventuais restrições à cessão.",
    whyItMatters: "Uma cláusula comercial pode proibir ou condicionar a cessão, ainda que o título exista e esteja performado.",
    acceptedEvidence: ["contratos comerciais vigentes", "pedidos e termos gerais incorporados", "anuência ou waiver do sacado"],
    decisionStandard: "As regras contratuais aplicáveis ao universo relevante foram lidas e não deixam restrição material sem tratamento.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "performance_or_delivery_evidenced",
    stage: "commercial_performance",
    batchId: "delivery_evidence",
    priority: 2,
    title: "Entrega, aceite ou prestação",
    clientInstruction: "Compartilhe os comprovantes que já existirem para vincular cada crédito à entrega, ao aceite ou ao serviço realizado.",
    whyItMatters: "O documento fiscal demonstra faturamento; a comprovação de performance reduz a defesa do sacado contra a cobrança.",
    acceptedEvidence: ["canhoto físico ou digital", "CT-e ou EDI da transportadora", "manifestação do destinatário", "aceite ou medição de serviço"],
    decisionStandard: "A cobertura é medida e o bloco sem comprovação permanece identificado, sem extrapolar uma amostra para o todo.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "historical_performance_available",
    stage: "commercial_performance",
    batchId: "performance_history",
    priority: 1,
    title: "Histórico de comportamento da carteira",
    clientInstruction: "Envie o histórico disponível de pagamentos, atrasos, perdas, devoluções, descontos, recompras e prorrogações.",
    whyItMatters: "A média atual não mostra deterioração, safra, diluição nem perda mascarada por recompra.",
    acceptedEvidence: ["base histórica título a título", "CNAB de retorno", "notas de crédito e devolução", "histórico de recompras e substituições"],
    decisionStandard: "O período e os eventos cobertos estão declarados e permitem medir cada comportamento separadamente.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "debtor_notice_or_acknowledgement_feasible",
    stage: "cash_operations",
    batchId: "collections_and_servicing",
    priority: 2,
    title: "Ciência do sacado e instrução de pagamento",
    clientInstruction: "Explique como o sacado recebe a cobrança hoje e envie exemplos das instruções ou anuências que possam ser usadas.",
    whyItMatters: "A cessão precisa ser eficaz perante o sacado e o pagamento deve seguir para o domicílio correto.",
    acceptedEvidence: ["modelo de boleto com cláusula de cessão", "carta ou e-mail de notificação", "anuência do sacado", "fluxo de alteração de domicílio"],
    decisionStandard: "Existe um procedimento executável para ciência do sacado e direcionamento do pagamento.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "controlled_collections_feasible",
    stage: "cash_operations",
    batchId: "collections_and_servicing",
    priority: 2,
    title: "Cobrança, recebimento e conciliação",
    clientInstruction: "Compartilhe o fluxo atual de cobrança e os arquivos usados para conciliar pagamentos, baixas e exceções.",
    whyItMatters: "Recebimentos fora do fluxo controlado criam risco de fungibilidade e dificultam identificar inadimplência e diluição.",
    acceptedEvidence: ["CNAB de remessa e retorno", "relatório de conta vinculada", "política de baixa", "rotina de conciliação e exceções"],
    decisionStandard: "O fluxo identifica o destino do caixa e reconcilia cada liquidação ou exceção a um título.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "servicing_capability_available",
    stage: "cash_operations",
    batchId: "collections_and_servicing",
    priority: 2,
    title: "Rotina operacional da carteira",
    clientInstruction: "Indique quem cuida da originação, cobrança, baixa, prorrogação e conciliação e compartilhe os controles usados.",
    whyItMatters: "Uma estrutura recorrente depende de responsabilidades claras e de uma rotina transferível e auditável.",
    acceptedEvidence: ["fluxo operacional", "matriz de responsáveis", "relatórios de exceção", "políticas e trilhas de aprovação"],
    decisionStandard: "Responsáveis, sistemas, controles e tratamento de exceções estão documentados e operacionais.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "company_credit_package_available",
    stage: "company_credit",
    batchId: "company_package",
    priority: 2,
    title: "Informações da companhia",
    clientInstruction: "Compartilhe demonstrações financeiras, balancete, dívida por contrato e os materiais que explicam o negócio.",
    whyItMatters: "Mesmo quando o ativo é o recebível, o limite e a capacidade de coobrigação dependem da companhia e de sua dívida ajustada.",
    acceptedEvidence: ["demonstrações de três exercícios", "balancete atual", "dívida contrato a contrato", "apresentação institucional e societário essencial"],
    decisionStandard: "O pacote permite reconciliar resultados, caixa, dívida, garantias e contexto operacional no período relevante.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "buyer_confirmed_program_available",
    stage: "sponsored_program",
    batchId: "buyer_program",
    priority: 3,
    title: "Programa patrocinado pelo sacado",
    clientInstruction: "Se o sacado já oferecer antecipação a fornecedores, compartilhe o convite, regulamento ou contato responsável pelo programa.",
    whyItMatters: "A rota de risco sacado só existe quando o comprador confirma o programa e a empresa pode aderir.",
    acceptedEvidence: ["convite ou regulamento do programa", "confirmação direta do sacado", "termo de adesão", "registro na plataforma indicada pelo sacado"],
    decisionStandard: "A existência, elegibilidade e disponibilidade atual do programa foram confirmadas pelo sacado ou operador autorizado.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "economically_viable_scale_confirmed",
    stage: "institutional_structure",
    batchId: "dedicated_structure",
    priority: 4,
    title: "Escala econômica da estrutura",
    clientInstruction: "Disponibilize volume médio, recorrência e custos conhecidos para compararmos uma linha compartilhada com uma estrutura dedicada.",
    whyItMatters: "Custos fixos de implantação, governança e operação podem tornar um veículo próprio ineficiente em determinada escala.",
    acceptedEvidence: ["histórico de originação e estoque", "projeção reconciliada", "propostas de prestadores", "orçamento completo da estrutura"],
    decisionStandard: "A escala é calculada com custos fixos, variáveis e rampa de utilização explícitos.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "institutional_vehicle_governance_ready",
    stage: "institutional_structure",
    batchId: "dedicated_structure",
    priority: 4,
    title: "Governança de uma estrutura dedicada",
    clientInstruction: "Se uma estrutura dedicada fizer sentido, reuniremos responsáveis, prestadores, políticas e controles necessários para operá-la.",
    whyItMatters: "Um veículo dedicado exige governança e prestadores compatíveis; não nasce apenas da existência de uma carteira.",
    acceptedEvidence: ["propostas de administrador, gestor e custodiante", "políticas de elegibilidade e cobrança", "matriz de responsabilidades", "desenho operacional e regulatório"],
    decisionStandard: "Prestadores, responsabilidades, controles e documentos de governança estão definidos e verificáveis.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "eligible_collateral_pool_identified",
    stage: "secured_facility",
    batchId: "secured_collateral",
    priority: 3,
    title: "Carteira elegível para garantia",
    clientInstruction: "Identifique quais recebíveis poderão compor a garantia e como títulos pagos ou inelegíveis serão substituídos.",
    whyItMatters: "Uma linha garantida precisa de uma base elegível identificada, com margem e reposição mensuráveis.",
    acceptedEvidence: ["base título a título classificada", "critérios de elegibilidade", "cálculo de cobertura", "mecânica de substituição"],
    decisionStandard: "A carteira elegível e condicional está separada, e a cobertura é calculada sem contar títulos comprometidos.",
    attestationAloneCanDecide: false,
  },
  {
    factId: "security_perfection_feasible",
    stage: "secured_facility",
    batchId: "secured_collateral",
    priority: 3,
    title: "Formalização e controle da garantia",
    clientInstruction: "Compartilhe os contratos e fluxos necessários para confirmar como a garantia poderá ser constituída, registrada e controlada.",
    whyItMatters: "Uma garantia econômica só protege a estrutura se puder ser formalizada e tiver prioridade e controle operacional definidos.",
    acceptedEvidence: ["minuta ou contrato de cessão fiduciária", "consulta e requisitos de registro", "fluxo de conta vinculada", "waivers e liberações necessários"],
    decisionStandard: "A constituição, publicidade, prioridade, controle do caixa e condições de liberação são executáveis.",
    attestationAloneCanDecide: false,
  },
] as const;
