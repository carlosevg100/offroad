import type {CanonicalProcedure, ProcedureAuthority, ProcedureOutputField, ProcedureRole, ProcedureStep} from "../procedure-contract";
import {canonicalProcedureSchema, compileProcedureRegistry} from "../procedure-contract";
import {materialTemplates} from "../material-templates";
import {referenceDataKeys} from "../reference-data";

const VERSION = "2026.08.25-v2";
const SOURCE = "packages/credit-playbook/src/procedures/growth-capex.ts";

type CandidateInput = {
  id: string;
  title: {pt: string; en: string};
  role: ProcedureRole;
  stage: number;
  objective: string;
  product: string;
  prerequisites: string[];
  dependencies?: string[];
  steps: ProcedureStep[];
  decisionRules: string[];
  redFlags: string[];
  stopConditions: string[];
  exceptions?: string[];
  templates?: string[];
  outputFields: CandidateOutputField[];
  modelPurpose?: string[];
  allowedTools?: string[];
  gold: string[];
  adversarial: string[];
};

type CandidateOutputField = Omit<ProcedureOutputField, "evidenceRequired"> & {evidenceRequired?: boolean};

type ProcedureKnowledge = {
  houseProcedureIds: string[];
  authorities: ProcedureAuthority[];
  referenceDataKeys: string[];
  legalReviewRequired: boolean;
};

const range = (prefix: string, start: number, end: number): string[] =>
  Array.from({length: end - start + 1}, (_, index) => `${prefix}-${String(start + index).padStart(2, "0")}`);

const knowledge = (
  houseProcedureIds: string[],
  authorities: ProcedureAuthority[],
  referencedData: string[] = [],
  legalReviewRequired = false,
): ProcedureKnowledge => ({houseProcedureIds, authorities, referenceDataKeys: referencedData, legalReviewRequired});

/**
 * The 20 growth-capex runtime procedures are compiled projections of the House Playbook.
 * This map is exhaustive by design: a candidate without canonical lineage cannot compile.
 */
const growthCapexKnowledge: Record<string, ProcedureKnowledge> = {
  "frame-capital-need": knowledge(["IN-01", "IN-02", "IN-03", "IN-18", "IN-22", "IN-23", "IN-24", "IN-25", "IN-26", "EMP-20"], ["CASA", "DEF"]),
  "plan-guided-information-growth-capex": knowledge(["IN-04", ...range("IN", 11, 17), "IN-21"], ["CASA", "DEF"], ["policy.intake.request_batch.max_items", "policy.intake.archetype-requirements"]),
  "inventory-source-documents": knowledge(["IN-12", "IN-17", "IN-26", "MA-24", "MA-26"], ["CASA"]),
  "extract-evidence-ledger": knowledge(["Q-18", "LC-01"], ["CASA", "DEF"]),
  "spread-and-reconcile-financials": knowledge(range("Q", 1, 18), ["CASA", "DEF"], ["policy.reconciliation.tolerance", "policy.financial.materiality", "policy.financial.normalization", "policy.cash-flow.bridge", "policy.capex.maintenance", "policy.revenue-quality.cutoff", "policy.related-party.materiality", "policy.seasonality.materiality", "policy.currency.exposure", "policy.receivables.aging"]),
  "build-debt-bridge-and-maturity": knowledge(range("D", 1, 31), ["CASA", "DEF", "LEI"], ["policy.debt.views", "policy.debt.cost-reconciliation", "policy.debt.maturity-concentration", "policy.debt.renewal-scenarios", "policy.concentration.materiality", "scenario.interest_rate.parallel_shock", "scenario.market.multi-factor", "scenario.short_term_non_renewal"], true),
  "resolve-material-gaps": knowledge([...range("IN", 13, 17), "RF-14", "RF-15", "RF-16"], ["CASA"], ["policy.intake.request_batch.max_items"]),
  "analyze-company-and-sector": knowledge(range("EMP", 1, 30), ["CASA", "DEF", "MERCADO", "HEURÍSTICA", "LEI"], ["policy.concentration.materiality", "policy.privacy.permitted-background-sources"], true),
  "analyze-performance-and-cash-conversion": knowledge(range("Q", 1, 16), ["CASA", "DEF"], ["policy.reconciliation.tolerance", "policy.financial.materiality", "policy.financial.normalization", "policy.cash-flow.bridge", "policy.capex.maintenance"]),
  "challenge-business-plan-and-downside": knowledge(["EMP-07", "EMP-08", "EMP-20", "Q-03", "Q-04", "Q-10", "Q-11", "OP-04"], ["CASA", "DEF", "HEURÍSTICA"], ["policy.business_plan.scenarios"]),
  "size-capacity-and-sources-uses": knowledge(["Q-02", ...range("D", 24, 29), ...range("OP", 1, 4), "OP-06", "OP-07", ...range("ES", 1, 4)], ["CASA", "DEF", "HEURÍSTICA"], ["policy.cash-flow.bridge", "policy.capacity.minimum_headroom", "policy.transaction-sizing.materiality", "scenario.interest_rate.parallel_shock", "scenario.market.multi-factor", "scenario.short_term_non_renewal"]),
  "design-financing-alternatives": knowledge(["ES-40", "ES-41", "ES-44", ...range("PR", 1, 12)], ["CASA", "MERCADO", "HEURÍSTICA", "LEI"], ["market.instrument.eligibility", "market.pricing.curves", "policy.pricing.sample-quality"], true),
  "draft-indicative-structure": knowledge([...range("OP", 8, 11), ...range("ES", 1, 45)], ["CASA", "DEF", "MERCADO", "HEURÍSTICA", "LEI"], ["policy.capacity.minimum_headroom", "policy.structure.collateral_haircuts", "policy.structure.covenant_headroom", "market.instrument.eligibility", "market.pricing.curves"], true),
  "compile-institutional-credit-memo": knowledge([...range("MA", 4, 16), ...range("MA", 28, 32), ...range("LC", 1, 13)], ["CASA", "DEF"], ["policy.material.numeric_rounding"]),
  "compile-institutional-teaser": knowledge([...range("MA", 1, 3), ...range("MA", 28, 32), ...range("LC", 1, 13)], ["CASA", "DEF"], ["policy.material.numeric_rounding"]),
  "compile-indicative-term-sheet": knowledge([...range("MA", 17, 21), ...range("MA", 28, 32), "LC-04", "LC-05", "LC-06"], ["CASA", "DEF", "LEI"], ["policy.material.numeric_rounding", "policy.structure.collateral_haircuts", "policy.structure.covenant_headroom", "market.instrument.eligibility", "market.pricing.curves"], true),
  "organize-institutional-data-room": knowledge(["MA-14", "MA-24", "MA-25", "MA-26", "MA-31"], ["CASA"]),
  "screen-investor-mandates": knowledge(range("MK", 1, 14), ["CASA", "MERCADO"], ["market.mandates", "policy.market.mandate_max_age"]),
  "quality-control-growth-capex": knowledge([...range("RF", 1, 19), ...range("LC", 1, 13), ...range("MA", 28, 32)], ["CASA", "DEF", "HEURÍSTICA"], ["policy.qc.numeric_tolerance", "policy.material.numeric_rounding"]),
  "execute-qualified-introduction": knowledge(["MK-15", "MK-16", "MK-17", "MK-18", "LC-08", "LC-10", "LC-11"], ["CASA", "MERCADO"], ["market.mandates", "policy.market.mandate_max_age", "policy.market.distribution-waves"]),
};

const commonEvidenceHierarchy = [
  "Demonstração auditada e nota explicativa do mesmo período e perímetro",
  "Informação intermediária revisada",
  "Balancete, razão e export do ERP reconciliados",
  "Contrato, escritura, extrato, laudo ou documento operacional específico",
  "Informação gerencial identificada",
  "Resposta confirmada da companhia",
  "Premissa da companhia e julgamento Offroad, sempre separados de fatos",
];

const baseOutput: CandidateOutputField[] = [
  {id: "status", type: "enum", required: true, description: "Estado explícito do procedimento.", evidenceRequired: false, allowedValues: ["completed", "conditional", "blocked", "not_applicable"]},
  {id: "findings", type: "array", required: true, description: "Resultados materiais, cada um classificado e suportado."},
  {id: "open_items", type: "array", required: true, description: "Lacunas que permanecem, com impacto e próxima melhor solicitação."},
  {id: "evidence_links", type: "array", required: true, description: "Fontes, âncoras, cálculos e versões que suportam o produto."},
];

function candidate(input: CandidateInput): CanonicalProcedure {
  const procedureKnowledge = growthCapexKnowledge[input.id];
  if (!procedureKnowledge) throw new Error(`missing House Playbook lineage for ${input.id}`);
  return canonicalProcedureSchema.parse({
    id: input.id,
    version: VERSION,
    maturity: "candidate",
    title: input.title,
    role: input.role,
    blueprintStage: input.stage,
    owner: {role: roleOwner(input.role)},
    objective: input.objective,
    product: input.product,
    procedure: input.steps,
    output: {
      schemaId: `offroad.${input.id}.v1`,
      fields: [...baseOutput, ...input.outputFields].map((field) => ({...field, evidenceRequired: field.evidenceRequired ?? true})),
    },
    evidence: {
      hierarchy: commonEvidenceHierarchy,
      rules: [
        "Preservar documento, versão, entidade, período, moeda, escala e âncora de origem.",
        "Classificar cada afirmação material como fato, cálculo, premissa, julgamento ou referência de mercado.",
        "Não usar orientação do playbook como evidência do case.",
        "Não converter ausência, conflito ou baixa confiança em estimativa silenciosa.",
      ],
      materialClaimsRequireSupport: true,
    },
    tests: {
      unit: ["schema de saída recusa campos adicionais e estados inválidos", "alteração de input material muda o fingerprint"],
      gold: input.gold,
      adversarial: input.adversarial,
      acceptance: ["nenhum achado material sem suporte", "estado bloqueado impede promoção da etapa", "PT e EN preservam identidade econômica"],
    },
    source: {path: `${SOURCE}#${input.id}`, effectiveDate: "2026-08-25"},
    knowledge: procedureKnowledge,
    prerequisites: input.prerequisites,
    dependencies: input.dependencies ?? [],
    decisionRules: input.decisionRules,
    redFlags: input.redFlags,
    stopConditions: input.stopConditions,
    exceptions: input.exceptions ?? [],
    templates: input.templates ?? [],
    examples: {
      positive: [`O caso gold corporate-growth-clean produz ${input.product.toLowerCase()} com rastreabilidade completa.`],
      negative: ["Uma conclusão é emitida apesar de faltar evidência que muda capacidade ou estrutura."],
    },
    runtime: {
      orchestration: "deterministic_pipeline",
      peerHandoffs: false,
      maxModelCalls: input.modelPurpose?.length ?? 0,
      modelPurpose: input.modelPurpose ?? [],
      allowedTools: input.allowedTools ?? [],
    },
  });
}

function roleOwner(role: ProcedureRole): string {
  return ({
    intake_evidence: "Head de Operações e Evidências",
    financial_analysis: "Head de Análise Financeira",
    credit_structuring: "Head de DCM e Estruturação",
    institutional_materials: "Head de Materiais Institucionais",
    market_distribution: "Head de Mercado e Distribuição",
    independent_quality_control: "Responsável independente de Quality Control",
  })[role];
}

const step = (
  id: string,
  title: string,
  mode: ProcedureStep["mode"],
  instructions: string[],
  tools: string[] = [],
  evidenceInputs: string[] = [],
): ProcedureStep => ({id, title, mode, instructions, tools, evidenceInputs});

export const growthCapexProcedures = [
  candidate({
    id: "frame-capital-need",
    title: {pt: "Enquadrar a necessidade de capital", en: "Frame the capital need"},
    role: "intake_evidence", stage: 1,
    objective: "Entender o problema econômico, a urgência e o resultado pretendido antes de presumir instrumento ou financiador.",
    product: "Mandato inicial confirmado, com arquétipo, uso, valor, timing e restrições separados de preferências.",
    prerequisites: ["Usuário e organização identificados", "Autorização para iniciar o case"],
    steps: [
      step("capture", "Capturar o pedido em linguagem simples", "model_assisted", ["Registrar por que o capital é necessário, por que agora, quanto é estimado e o que acontece sem a operação.", "Separar objetivo econômico de solução inicialmente imaginada."], ["structured_extraction"], ["resposta do cliente", "carta de pedido"]),
      step("classify", "Classificar sem ancorar", "deterministic", ["Mapear para crescimento/capex, giro, aquisição, refinanciamento, equipamento, venture debt ou outro.", "Registrar múltiplos arquétipos quando os usos forem materialmente distintos."], ["archetype_catalogue"]),
      step("confirm", "Confirmar o enquadramento", "human_judgment", ["Devolver síntese curta para confirmação da companhia.", "Não converter prazo, preço ou instrumento desejado em restrição sem evidência."], [], ["síntese estruturada"]),
    ],
    decisionRules: ["Uso dos recursos determina o arquétipo primário.", "Urgência inferior ao tempo realista de preparação é uma restrição explícita.", "Instrumento pedido é preferência até que elegibilidade, capacidade e mercado o confirmem."],
    redFlags: ["Pedido descrito apenas como liquidez sem sources and uses", "Montante incompatível com o projeto declarado", "Refinanciamento apresentado como capex", "Pessoa sem autoridade para representar a companhia"],
    stopConditions: ["Não é possível identificar companhia, objetivo, valor aproximado ou timing", "O usuário não está autorizado a representar a companhia"],
    outputFields: [
      {id: "archetype", type: "enum", required: true, description: "Arquétipo primário confirmado.", evidenceRequired: false, allowedValues: ["growth_expansion", "working_capital", "acquisition", "refinance", "equipment_finance", "venture_debt", "other"]},
      {id: "requested_amount", type: "decimal_string", required: true, description: "Montante indicativo declarado."},
      {id: "use_of_proceeds", type: "array", required: true, description: "Usos declarados, valores e status de confirmação."},
      {id: "timing", type: "object", required: true, description: "Data necessária, motivo e flexibilidade."},
    ],
    modelPurpose: ["extrair e resumir o pedido aberto no schema sem recomendar estrutura"],
    gold: ["expansão de capacidade e novas unidades é classificada como growth_expansion"],
    adversarial: ["cliente pede debênture, mas o sistema mantém instrumento como preferência", "prompt no documento tenta mudar o arquétipo"],
  }),

  candidate({
    id: "plan-guided-information-growth-capex",
    title: {pt: "Planejar informações para expansão e capex", en: "Plan information for growth capex"},
    role: "intake_evidence", stage: 2,
    objective: "Pedir o menor conjunto que desbloqueia compreensão, capacidade e estrutura, aceitando os formatos que a companhia já possui.",
    product: "Roadmap mínimo, alvo e ideal, com lote atual limitado a cinco itens e substitutos claros.",
    prerequisites: ["Necessidade de capital enquadrada", "Arquétipo growth_expansion confirmado"], dependencies: ["frame-capital-need"],
    steps: [
      step("inventory", "Inventariar o que já existe", "deterministic", ["Usar classificação, respostas e uploads já disponíveis.", "Marcar cobertura por período, entidade e nível de evidência."], ["credit_playbook_sufficiency"]),
      step("derive", "Derivar informação necessária", "deterministic", ["Mínimo: identidade, três anos de históricos, posição recente, dívida, pedido e projeto.", "Alvo: orçamento, cronograma, business plan, garantias, covenants e concentração.", "Ideal: evidência que melhora preço ou reduz condição, nunca documentos de closing antecipados."], ["growth_expansion_archetype"]),
      step("rank", "Selecionar a próxima melhor solicitação", "deterministic", ["Priorizar bloqueador, impacto em capacidade, impacto em estrutura, impacto em mandato e só depois acabamento.", "Mostrar no máximo cinco itens, quatro por padrão, com por que importa e substitutos."], ["client_request_ranker"]),
    ],
    decisionRules: ["Nunca pedir novamente informação coberta por evidência suficiente.", "Granularidade contrato a contrato surge somente se dívida, garantia ou covenant depender dela.", "Diligência e closing aparecem como roadmap, não como tarefa atual."],
    redFlags: ["Checklist genérico igual para todos os casos", "Mais de cinco itens ativos", "Pedido de data room previamente organizado", "Solicitação de certidões antes de existir alternativa de estrutura"],
    stopConditions: ["O arquétipo ou o pedido ainda está ambíguo", "Nenhum responsável da companhia pode responder ou enviar documentos"],
    outputFields: [
      {id: "current_batch", type: "array", required: true, description: "Até cinco solicitações priorizadas, com motivo e substitutos."},
      {id: "roadmap", type: "object", required: true, description: "Camadas mínimo, alvo, ideal, diligência e closing sem transformar tudo em tarefa."},
      {id: "coverage", type: "object", required: true, description: "Cobertura atual por requisito, período e entidade."},
    ],
    gold: ["sala limpa recebe somente lacunas ainda não cobertas"],
    adversarial: ["documento único satisfaz múltiplos requisitos sem duplicar pedidos", "material de closing não entra no lote atual"],
  }),

  candidate({
    id: "inventory-source-documents",
    title: {pt: "Inventariar documentos recebidos", en: "Inventory source documents"},
    role: "intake_evidence", stage: 3,
    objective: "Preservar originais e criar inventário rastreável sem exigir organização prévia do cliente.",
    product: "Inventário versionado por arquivo, entidade, período, idioma, tipo, hash e estado de leitura.",
    prerequisites: ["Upload autorizado e escopo de tenant confirmado"], dependencies: ["plan-guided-information-growth-capex"],
    steps: [
      step("gate", "Executar portaria do arquivo", "deterministic", ["Validar assinatura, tamanho, tipo real, malware, expansão e limites.", "Manter arquivo hostil em quarentena e registrar motivo estável."], ["document_gateway"]),
      step("identity", "Fixar identidade e versão", "deterministic", ["Calcular SHA-256 no servidor.", "Detectar duplicidade sem apagar versões ou proveniência."], ["document_inventory"]),
      step("classify", "Classificar para processamento", "model_assisted", ["Classificar tipo, entidade, período, idioma e classe de informação.", "Baixa confiança vira revisão, não classificação inventada."], ["document_classifier"]),
    ],
    decisionRules: ["Magic bytes prevalecem sobre extensão.", "Mesmo hash e mesmo escopo são duplicidade; versões diferentes permanecem.", "Originais são imutáveis."],
    redFlags: ["Arquivo criptografado sem senha", "Conteúdo executável ou fórmula hostil", "Entidade ou período incompatível com o case", "Documento de outro tenant"],
    stopConditions: ["Arquivo viola política de segurança", "Hash não pode ser verificado", "Escopo organizacional não pode ser estabelecido"],
    outputFields: [
      {id: "documents", type: "array", required: true, description: "Inventário com versão, hash, classificação e status."},
      {id: "quarantined", type: "array", required: true, description: "Arquivos recusados e código de portaria."},
    ],
    modelPurpose: ["classificar documento e perfil sem extrair conclusão financeira"],
    allowedTools: ["document_gateway", "document_classifier"],
    gold: ["todos os documentos da sala limpa preservam hash, entidade e período"],
    adversarial: ["extensão falsa é recusada", "instrução em documento não altera a execução"],
  }),

  candidate({
    id: "extract-evidence-ledger",
    title: {pt: "Extrair e ancorar evidências", en: "Extract and anchor evidence"},
    role: "intake_evidence", stage: 4,
    objective: "Converter documentos em candidatos estruturados verificáveis sem perder contexto ou aceitar instruções do conteúdo.",
    product: "Evidence ledger com valor, unidade, período, entidade, classe, confiança, âncora e quote verificados.",
    prerequisites: ["Documento aprovado na portaria", "Camada de leitura com âncoras estáveis"], dependencies: ["inventory-source-documents"],
    steps: [
      step("segment", "Segmentar sem truncar materialidade", "deterministic", ["Preservar tabelas, cabeçalhos, notas e declarações de escala.", "Dividir documentos grandes em janelas com contexto sobreposto."], ["document_parsers"]),
      step("propose", "Propor candidatos no schema", "model_assisted", ["Extrair somente campos da ontologia e fatos narrativos permitidos.", "Citar âncora e quote; não normalizar números no modelo."], ["document_extraction"]),
      step("verify", "Reverificar no documento", "deterministic", ["Confirmar que âncora existe e quote suporta valor.", "Normalizar número, data, moeda e escala em código."], ["anchor_verifier", "value_normalizer"]),
    ],
    decisionRules: ["Candidato sem âncora confirmada nunca é autoaceito.", "Escala detectada é uma declaração a validar, não multiplicador automático.", "Texto de OCR começa com confiança reduzida e exige confirmação material."],
    redFlags: ["Prompt injection em texto", "Valor extraído de total ou coluna errada", "Sinal invertido", "Período ou entidade herdados sem suporte", "Nota explicativa contradiz tabela"],
    stopConditions: ["Documento não é legível com ferramentas permitidas", "Âncora material não pode ser confirmada", "Parser reporta truncamento sobre seção material"],
    outputFields: [
      {id: "candidates", type: "array", required: true, description: "Candidatos ancorados e normalizados."},
      {id: "document_profile", type: "object", required: true, description: "Tipo, períodos, entidades, idioma e limitações do documento."},
    ],
    modelPurpose: ["propor campos e fatos citados a partir de trechos governados"],
    allowedTools: ["document_parsers", "document_extraction", "anchor_verifier"],
    gold: ["campos materiais do case gold apontam à célula ou página correta"],
    adversarial: ["OCR troca separador e verificador recusa", "célula contém fórmula maliciosa e vira texto inerte"],
  }),

  candidate({
    id: "spread-and-reconcile-financials",
    title: {pt: "Fazer spreading e conciliação financeira", en: "Spread and reconcile financials"},
    role: "financial_analysis", stage: 5,
    objective: "Construir históricos e posição atual comparáveis por entidade, período, moeda, escala e classe de informação.",
    product: "Spreading governado com DRE, balanço, fluxo de caixa, ajustes, conflitos e checks de fechamento.",
    prerequisites: ["Evidence ledger material", "Perímetro econômico identificado"], dependencies: ["extract-evidence-ledger"],
    steps: [
      step("map", "Mapear contas à ontologia", "deterministic", ["Preservar conta de origem e mapear para linha canônica.", "Separar operações continuadas, não recorrentes, partes relacionadas e efeitos contábeis relevantes."], ["credit_ontology"]),
      step("reconcile", "Aplicar hierarquia e reconciliar", "deterministic", ["Comparar auditado, revisado, balancete, ERP e gerencial para o mesmo período e perímetro.", "Manter valores perdedores como conflitos, não descartá-los."], ["reconciliation"]),
      step("close", "Executar checks financeiros", "deterministic", ["Ativo fecha com passivo e patrimônio.", "Lucro e caixa reconciliam quando demonstrações permitem.", "Variações relevantes possuem ponte ou ponto aberto."], ["financial_core"]),
    ],
    decisionRules: ["Fonte superior governa apenas quando período e perímetro são comparáveis.", "Ajuste Offroad nunca sobrescreve reportado; ambos permanecem.", "Intermediário não é anualizado silenciosamente."],
    redFlags: ["Receita líquida e bruta misturadas", "EBITDA gerencial sem ponte", "Consolidação inclui entidade fora do perímetro", "Escala inconsistente", "Contas a receber cedidas sem tratamento financeiro"],
    stopConditions: ["Balanço materialmente não fecha", "Perímetro ou escala não podem ser estabelecidos", "Conflito altera capacidade e não pode ser explicado"],
    outputFields: [
      {id: "spreads", type: "array", required: true, description: "Demonstrações canônicas por período e entidade."},
      {id: "normalizations", type: "array", required: true, description: "Pontes entre reportado e ajustado com suporte."},
      {id: "reconciliation_exceptions", type: "array", required: true, description: "Conflitos e checks que permanecem abertos."},
    ],
    allowedTools: ["credit_ontology", "reconciliation", "financial_core"],
    gold: ["três exercícios e posição atual do case gold fecham e preservam fontes"],
    adversarial: ["projeção conflita com auditado e não prevalece", "entidade relacionada é excluída do consolidado sem ponte"],
  }),

  candidate({
    id: "build-debt-bridge-and-maturity",
    title: {pt: "Construir ponte da dívida e vencimentos", en: "Build debt bridge and maturity profile"},
    role: "financial_analysis", stage: 5,
    objective: "Determinar endividamento econômico atual, evolução, custo, vencimentos, garantias e covenants sem depender somente do mapa recebido.",
    product: "Tabela por instrumento, ponte da dívida, maturity wall, custo, garantias, covenants e diferenças reconciliadas.",
    prerequisites: ["Balanço e posição intermediária conciliados", "Mapa de dívida ou contratos disponíveis"], dependencies: ["spread-and-reconcile-financials"],
    steps: [
      step("inventory", "Inventariar passivos financeiros", "deterministic", ["Conciliar mapa, balanço, notas, razão e contratos.", "Classificar principal, juros acumulados, leasing, mútuos, impostos parcelados, derivativos e dívidas relacionadas."], ["reconciliation"]),
      step("hidden", "Testar passivos fora do mapa", "model_assisted", ["Procurar risco sacado/reverse factoring em fornecedores, cessão de recebíveis com coobrigação, garantias prestadas e obrigações com recompra.", "Propor classificação; código calcula impacto após confirmação."], ["governed_retrieval"]),
      step("bridge", "Fechar a ponte", "deterministic", ["Dívida inicial + captações + PIK + indexação + FX + aquisições e ajustes - amortizações - pré-pagamentos = dívida final.", "Reconciliar despesa financeira com dívida média, indexadores e taxas; diferença vira exceção."], ["financial_core"]),
      step("profile", "Construir perfil e restrições", "deterministic", ["Agregar vencimentos por mês e ano sem perder instrumento.", "Extrair garantia, senioridade, covenant, teste, cura, cross-default e restrições a nova dívida."], ["financial_core", "covenant_catalogue"]),
    ],
    decisionRules: ["Cessão com coobrigação ou recurso econômico permanece dívida até evidência contrária.", "Risco sacado é reclassificado de fornecedor para dívida quando há financiamento, extensão e obrigação financeira da companhia.", "Definição de dívida de covenant pode diferir da dívida contábil e deve ser calculada separadamente."],
    redFlags: ["Fornecedores crescem enquanto prazo operacional não explica", "Despesa financeira incompatível com mapa", "Garantia mencionada em contrato e ausente no mapa", "Dívida relacionada sem vencimento", "Vencimento classificado como longo prazo apesar de covenant breach"],
    stopConditions: ["Diferença não explicada altera alavancagem ou capacidade", "Não é possível determinar vencimentos materiais", "Contrato crítico e mapa divergem sem resolução"],
    exceptions: ["Se o mapa não existir, construir posição provisória do balanço e contratos e pedir confirmação focada.", "Se reverse factoring não puder ser quantificado, reportar faixa e bloquear conclusão de alavancagem pós-operação."],
    outputFields: [
      {id: "facilities", type: "array", required: true, description: "Instrumentos com saldo, custo, vencimento, amortização, garantia e covenant."},
      {id: "debt_bridge", type: "object", required: true, description: "Ponte entre dívida inicial e final com componentes rastreados."},
      {id: "maturity_profile", type: "array", required: true, description: "Vencimentos agregados com drill-down por instrumento."},
      {id: "covenant_debt", type: "decimal_string", required: false, description: "Dívida conforme definição contratual relevante."},
    ],
    modelPurpose: ["identificar em texto contratual e notas indícios de passivos financeiros e obrigações"],
    allowedTools: ["reconciliation", "financial_core", "governed_retrieval"],
    gold: ["dívida final do case gold reconcilia com balanço e dois instrumentos"],
    adversarial: ["risco sacado escondido em fornecedores é reclassificado", "cessão sem recurso documentada não é tratada como dívida"],
  }),

  candidate({
    id: "resolve-material-gaps",
    title: {pt: "Resolver lacunas materiais", en: "Resolve material gaps"},
    role: "intake_evidence", stage: 6,
    objective: "Perguntar somente o que muda compreensão, capacidade, estrutura ou aderência e não pode ser inferido com segurança.",
    product: "Lote curto de perguntas e documentos, com motivo, substitutos, consequência e estado de resposta.",
    prerequisites: ["Extração, spreading e dívida executados até o limite da evidência"], dependencies: ["spread-and-reconcile-financials", "build-debt-bridge-and-maturity"],
    steps: [
      step("materiality", "Calcular impacto da lacuna", "deterministic", ["Vincular a uma decisão ou output.", "Separar bloqueador, condicionante e melhoria."], ["gap_registry"]),
      step("compose", "Formular pedido simples", "model_assisted", ["Explicar por que importa em linguagem do cliente.", "Aceitar resposta curta, arquivo existente, substituto, parcial, indisponível ou após NDA."], ["client_request_composer"]),
      step("rank", "Liberar lote curto", "deterministic", ["Ordenar por materialidade e dependência.", "Nunca exibir mais de cinco itens ativos."], ["client_request_ranker"]),
    ],
    decisionRules: ["Não perguntar o que pode ser calculado ou extraído.", "Pedido granular exige estrutura já selecionada que dependa dele.", "Resposta recalcula o ranking antes do próximo lote."],
    redFlags: ["Pergunta genérica de diligência", "Solicitação repetida", "Pedido sem explicar impacto", "Lista infinita entregue de uma vez"],
    stopConditions: ["Bloqueador material permanece sem resposta ou substituto", "Companhia declara indisponível informação indispensável à capacidade"],
    outputFields: [
      {id: "request_batch", type: "array", required: true, description: "Até cinco solicitações atuais."},
      {id: "gap_register", type: "array", required: true, description: "Todas as lacunas com impacto, status e resolução."},
    ],
    modelPurpose: ["redigir perguntas curtas e claras a partir de lacunas determinadas pelo pipeline"],
    gold: ["sala limpa não recebe pergunta redundante"],
    adversarial: ["informação indisponível permanece aberta sem invenção", "lote nunca excede cinco"],
  }),

  candidate({
    id: "analyze-company-and-sector",
    title: {pt: "Analisar companhia e setor", en: "Analyse company and sector"},
    role: "financial_analysis", stage: 7,
    objective: "Entender modelo de negócio, posição competitiva, governança, concentração e riscos setoriais que afetam geração e estrutura.",
    product: "Company profile analítico e lente setorial com drivers, dependências, riscos e evidências.",
    prerequisites: ["Identidade, perímetro e histórico mínimo conciliados"], dependencies: ["resolve-material-gaps"],
    steps: [
      step("business", "Mapear o modelo de negócio", "model_assisted", ["Explicar produtos, clientes, canais, fornecedores, geografia, receita e custos.", "Separar afirmação institucional de evidência operacional."], ["governed_retrieval"]),
      step("sector", "Aplicar lente setorial", "human_judgment", ["Para varejo: vendas mesmas lojas, maturação, margem, estoques, aluguel, concentração geográfica e canibalização.", "Registrar quais métricas setoriais não estão disponíveis e por que importam."], [], ["dados operacionais", "referências setoriais governadas"]),
      step("governance", "Definir perímetro e governança", "deterministic", ["Mapear controle, partes relacionadas, transações intragrupo e dependências de pessoas-chave."], ["credit_ontology"]),
    ],
    decisionRules: ["Lente setorial é selecionada pelo modelo econômico, não apenas CNAE.", "Referência externa contextualiza; não substitui evidência da companhia.", "Concentração só é mitigada quando contratos, retenção ou diversificação são demonstrados."],
    redFlags: ["Crescimento por aquisição sem integração demonstrada", "Concentração de cliente ou fornecedor", "Partes relacionadas materiais", "Margem superior ao setor sem ponte", "Dependência regulatória ou licença"],
    stopConditions: ["Não é possível explicar como a companhia gera caixa", "Perímetro econômico permanece ambíguo", "Dependência material não pode ser quantificada ou condicionada"],
    outputFields: [
      {id: "business_model", type: "object", required: true, description: "Modelo econômico e drivers de geração."},
      {id: "sector_lens", type: "object", required: true, description: "Métricas, riscos e referências específicas do setor."},
      {id: "concentrations", type: "array", required: true, description: "Concentrações e mitigantes suportados."},
    ],
    modelPurpose: ["sintetizar fatos corporativos e operacionais citados no framework setorial selecionado"],
    gold: ["case gold de varejo recebe lente de expansão de lojas e maturação"],
    adversarial: ["deck afirma liderança sem evidência e claim é qualificado", "CNAE genérico não substitui análise do modelo econômico"],
  }),

  candidate({
    id: "analyze-performance-and-cash-conversion",
    title: {pt: "Analisar desempenho e conversão de caixa", en: "Analyse performance and cash conversion"},
    role: "financial_analysis", stage: 7,
    objective: "Explicar crescimento, margem, capital de giro, caixa, liquidez e qualidade do EBITDA histórico.",
    product: "Análise histórica com pontes, métricas, normalizações e fontes de volatilidade.",
    prerequisites: ["Spreading fechado", "Ajustes normalizadores identificados"], dependencies: ["spread-and-reconcile-financials", "analyze-company-and-sector"],
    steps: [
      step("trend", "Construir tendências e pontes", "deterministic", ["Calcular crescimento, margens, ROIC quando suportado, capital de giro, caixa operacional e conversão.", "Explicar variações por preço, volume, mix, unidade, aquisição e não recorrentes quando evidenciado."], ["financial_core"]),
      step("quality", "Testar qualidade da geração", "human_judgment", ["Reconciliar EBITDA com caixa e necessidade de capital de giro.", "Separar geração estrutural de liberação pontual, impostos, factoring e postergação de fornecedores."], [], ["spreading", "fluxo de caixa", "dívida"]),
      step("liquidity", "Avaliar liquidez e sazonalidade", "deterministic", ["Calcular caixa mínimo, cobertura de curto prazo e picos de necessidade.", "Não usar caixa restrito como disponível."], ["financial_core"]),
    ],
    decisionRules: ["EBITDA ajustado exige ponte item a item e recorrência defendida.", "Capital de giro é analisado por driver operacional, não apenas saldo.", "Caixa restrito, mínimo operacional e caixa de terceiros não reduzem dívida líquida livremente."],
    redFlags: ["EBITDA cresce e caixa cai sem explicação", "Recebíveis ou estoque crescem acima de receita", "Fornecedores financiam artificialmente o período", "Ajustes recorrentes classificados como não recorrentes", "Caixa concentrado em data de fechamento"],
    stopConditions: ["EBITDA ajustado não pode ser reconciliado", "Caixa ou capital de giro material não possui período comparável", "Liquidez depende de linha não comprovada"],
    outputFields: [
      {id: "historical_metrics", type: "array", required: true, description: "Métricas por período com traces."},
      {id: "ebitda_bridge", type: "object", required: true, description: "Ponte do EBITDA reportado ao ajustado."},
      {id: "cash_conversion", type: "object", required: true, description: "Conversão, capital de giro, liquidez e sazonalidade."},
    ],
    allowedTools: ["financial_core"],
    gold: ["margem e alavancagem histórica do case gold reproduzem o gabarito"],
    adversarial: ["factoring melhora caixa e aumenta dívida econômica", "ajuste repetido em três anos não é aceito como não recorrente sem justificativa"],
  }),

  candidate({
    id: "challenge-business-plan-and-downside",
    title: {pt: "Desafiar business plan e downside", en: "Challenge business plan and downside"},
    role: "financial_analysis", stage: 7,
    objective: "Avaliar premissas, execução, geração e capacidade sob cenários coerentes com o projeto de expansão.",
    product: "Modelo base, caso ajustado Offroad e downsides com premissas, sensitivities e impacto em dívida.",
    prerequisites: ["Histórico e projeto compreendidos", "Orçamento e cronograma disponíveis ou lacuna explícita"], dependencies: ["analyze-performance-and-cash-conversion"],
    steps: [
      step("bridge", "Ligar histórico ao plano", "deterministic", ["Construir ponte de receita, margem, capex, capital de giro e caixa.", "Comparar premissas projetadas com histórico e métricas setoriais."], ["financial_model"]),
      step("project", "Modelar expansão", "deterministic", ["Separar lojas/unidades existentes e novas, ramp-up, canibalização, capex, contingência e atraso.", "Incluir cronograma de desembolso e início de geração."], ["financial_model"]),
      step("stress", "Executar downside", "deterministic", ["Testar atraso, capex acima do orçamento, receita/ramp-up abaixo, margem menor, capital de giro maior, CDI e refinanciamento.", "Recalcular dívida, juros, DSCR, alavancagem, liquidez e covenant headroom."], ["financial_core", "financial_model"]),
    ],
    decisionRules: ["Downside preserva relações econômicas e não aplica haircut cego.", "Premissa da companhia, ajuste Offroad e referência externa permanecem separados.", "Projeto só suporta dívida se geração e liquidez cobrem desembolso e serviço no timing correto."],
    redFlags: ["Ramp-up imediato", "Margem de unidade nova igual à madura", "Capex sem contingência", "Capital de giro ignorado", "Valor terminal ou venda de ativo usado para pagar dívida sem base"],
    stopConditions: ["Sources do projeto não cobrem uses", "Premissas críticas não podem ser identificadas", "Modelo não fecha ou gera circularidade não resolvida"],
    outputFields: [
      {id: "base_case", type: "object", required: true, description: "Plano da companhia preservado."},
      {id: "offroad_case", type: "object", required: true, description: "Caso ajustado com premissas explícitas."},
      {id: "downside_cases", type: "array", required: true, description: "Cenários e impacto em métricas de crédito."},
    ],
    allowedTools: ["financial_model", "financial_core"],
    gold: ["capex de R$40 milhões e trajetória do case gold fecham"],
    adversarial: ["atraso de doze meses testa liquidez antes da geração", "crescimento impossível não é suavizado silenciosamente"],
  }),

  candidate({
    id: "size-capacity-and-sources-uses",
    title: {pt: "Dimensionar capacidade e sources and uses", en: "Size capacity and sources and uses"},
    role: "credit_structuring", stage: 8,
    objective: "Determinar quanto e em que perfil a companhia pode suportar sob restrições de caixa, alavancagem, cobertura, liquidez e garantia.",
    product: "Sources and uses fechado, capacidade por parede, restrição vinculante e faixa suportável.",
    prerequisites: ["Histórico, dívida, plano e downsides calculados"], dependencies: ["build-debt-bridge-and-maturity", "challenge-business-plan-and-downside"],
    steps: [
      step("sources_uses", "Fechar sources and uses", "deterministic", ["Separar dívida nova, caixa da companhia, refinanciamento, capex, custos, reservas e contingência.", "Total de sources deve igualar total de uses sem plug não explicado."], ["financial_core"]),
      step("walls", "Calcular paredes de capacidade", "deterministic", ["Calcular limite por alavancagem, DSCR, liquidez, amortização, garantia e instrumento.", "Aplicar base e downside no timing de cada pagamento."], ["deal_structure", "financial_core"]),
      step("bind", "Identificar restrição vinculante", "deterministic", ["A menor capacidade válida governa a faixa.", "Explicar o que mudaria a capacidade sem prometer aprovação."], ["deal_structure"]),
    ],
    decisionRules: ["Capacidade é o mínimo das paredes aplicáveis, não média ou score.", "Caixa mínimo operacional permanece indisponível.", "Garantia limita somente quando estrutura realmente depende dela."],
    redFlags: ["Plug para fechar uses", "DSCR calculado com EBITDA em vez de CFADS", "Amortização ignorada no downside", "Capacidade baseada em valuation", "Garantia contabilizada sem titularidade"],
    stopConditions: ["Sources and uses não fecha", "Uma parede material não pode ser calculada", "A configuração pedida quebra liquidez ou covenant no caso base"],
    outputFields: [
      {id: "sources_and_uses", type: "object", required: true, description: "Tabela fechada e rastreada."},
      {id: "capacity_walls", type: "array", required: true, description: "Capacidade por fluxo, alavancagem, cobertura, liquidez, garantia e instrumento."},
      {id: "binding_constraint", type: "object", required: true, description: "Restrição que governa e sensibilidade."},
      {id: "supportable_range", type: "object", required: true, description: "Faixa indicativa e condições."},
    ],
    allowedTools: ["financial_core", "deal_structure"],
    gold: ["case gold suporta faixa compatível com capex e teto do arquétipo"],
    adversarial: ["pedido acima da capacidade produz alternativa menor", "garantia abundante não compensa falta de fluxo de caixa"],
  }),

  candidate({
    id: "design-financing-alternatives",
    title: {pt: "Desenhar alternativas de financiamento", en: "Design financing alternatives"},
    role: "credit_structuring", stage: 8,
    objective: "Preservar o objetivo econômico por meio de alternativas elegíveis, suportáveis e comercializáveis.",
    product: "Menu comparável de alternativas com instrumento, volume, perfil, contrapartidas e condições.",
    prerequisites: ["Faixa de capacidade calculada", "Elegibilidade jurídica e econômica disponível"], dependencies: ["size-capacity-and-sources-uses"],
    steps: [
      step("screen", "Filtrar instrumentos", "deterministic", ["Testar forma societária, lastro, uso, ticket, prazo, registro, garantia e compradores naturais.", "Resultado é hipótese de elegibilidade e condições, não parecer jurídico."], ["instrument_catalogue"]),
      step("construct", "Construir alternativas", "human_judgment", ["Combinar instrumento, tranche, amortização, carência e segurança para resolver a restrição vinculante.", "Manter no máximo três alternativas realmente distintas."], [], ["capacity walls", "instrument screen", "market references"]),
      step("compare", "Comparar contrapartidas", "deterministic", ["Mostrar objetivo atendido, capacidade, liquidez, risco de execução, garantia, flexibilidade e aderência de mercado.", "Eliminar configuração não suportada."], ["deal_structure"]),
    ],
    decisionRules: ["Instrumento elegível pode ser comercialmente inadequado e vice-versa.", "Alternativa não é variação cosmética de prazo.", "Estrutura deve funcionar antes do matching com fundos."],
    redFlags: ["Instrumento escolhido por benefício fiscal sem lastro", "Debênture para sociedade não elegível", "Bullet incompatível com refinanciamento esperado", "Garantia já onerada", "Estrutura excessivamente complexa para o ticket"],
    stopConditions: ["Nenhuma alternativa passa pelas paredes de capacidade", "Elegibilidade crítica permanece não resolvida", "Objetivo depende de funding garantido ou refinanciamento não suportado"],
    outputFields: [
      {id: "alternatives", type: "array", required: true, description: "Até três alternativas comparáveis."},
      {id: "instrument_screen", type: "array", required: true, description: "Elegibilidade, condições e razões por instrumento."},
      {id: "recommended_working_case", type: "object", required: false, description: "Alternativa de trabalho, sem recomendação de investimento."},
    ],
    allowedTools: ["instrument_catalogue", "deal_structure", "market_reference"],
    gold: ["debênture e CCB aparecem como alternativas elegíveis do case gold"],
    adversarial: ["CRI sem vínculo imobiliário permanece fechado", "instrumento elegível mas sem mandato comprador é qualificado como difícil de colocar"],
  }),

  candidate({
    id: "draft-indicative-structure",
    title: {pt: "Elaborar estrutura indicativa", en: "Draft indicative structure"},
    role: "credit_structuring", stage: 9,
    objective: "Converter a alternativa de trabalho em termos coerentes, explicáveis e negociáveis.",
    product: "Estrutura indicativa termo a termo, com basis, suporte, condição e alternativas.",
    prerequisites: ["Alternativa de trabalho selecionada", "Capacidade e downsides disponíveis"], dependencies: ["design-financing-alternatives"], templates: ["indicative-term-sheet"],
    steps: [
      step("economics", "Calibrar termos econômicos", "deterministic", ["Volume respeita faixa de capacidade.", "Prazo, carência e amortização acompanham geração e downside.", "Pricing usa referência datada, faixa e limitações."], ["deal_structure", "market_reference"]),
      step("security", "Desenhar garantias", "deterministic", ["Inventariar titularidade, ônus, valor, haircut e cobertura.", "Selecionar pacote proporcional ao risco sem tratar diligência futura como concluída."], ["collateral_engine"]),
      step("covenants", "Calibrar covenants", "deterministic", ["Cada covenant endereça risco ou trajetória observável.", "Definir métrica, limite, frequência, teste, cura e headroom no base/downside."], ["covenant_engine"]),
      step("conditions", "Organizar condições e eventos", "human_judgment", ["Separar informação pendente, diligência, condição precedente e documento de fechamento.", "Manter caráter indicativo e não vinculante."], [], ["open items", "instrument requirements"]),
    ],
    decisionRules: ["Todo termo possui basis: capacidade, pedido, playbook, fato reconciliado ou referência de mercado.", "Covenant sem cálculo e objetivo não entra.", "Pricing sem amostra observada é declarado prática da mesa."],
    redFlags: ["Carência maior que ramp-up sem cobertura", "Amortização cria cliff", "Covenant apertado no caso base", "Garantia sem valor elegível", "Termos copiados sem relação com risco"],
    stopConditions: ["Termo econômico contradiz capacidade", "Sources and uses muda sem reprocessamento", "Pacote de garantias ou covenant depende de informação crítica ausente"],
    outputFields: [
      {id: "terms", type: "array", required: true, description: "Termos com valor, basis, suporte e racional."},
      {id: "security_package", type: "object", required: true, description: "Garantias, haircuts, cobertura e condições."},
      {id: "covenant_package", type: "array", required: true, description: "Covenants calibrados e headroom."},
    ],
    allowedTools: ["deal_structure", "market_reference", "collateral_engine", "covenant_engine"],
    gold: ["term sheet do case gold reconcilia volume, prazo e garantias"],
    adversarial: ["prazo pedido fora da banda é trazido para dentro e explicado", "pricing sem data ou amostra não se apresenta como mercado observado"],
  }),

  candidate({
    id: "compile-institutional-credit-memo",
    title: {pt: "Compilar memorando institucional", en: "Compile institutional credit memorandum"},
    role: "institutional_materials", stage: 10,
    objective: "Apresentar tese, análise, estrutura, riscos e pontos abertos em formato consistente e rastreável.",
    product: "Memorando completo segundo template canônico, auditado contra a base governada.",
    prerequisites: ["Análises e estrutura indicativa concluídas", "Claims materiais auditáveis"], dependencies: ["draft-indicative-structure", "analyze-company-and-sector", "analyze-performance-and-cash-conversion"], templates: ["institutional-credit-memo"],
    steps: [
      step("assemble", "Montar seções canônicas", "deterministic", ["Aplicar ordem e obrigatoriedade do template.", "Popular números da base governada e claims do brief auditado."], ["case_materials"]),
      step("narrative", "Redigir narrativa técnica", "model_assisted", ["Explicar relações causais sem introduzir fatos novos.", "Tratar risco, mitigante e condição de forma equilibrada e comercialmente clara."], ["model_gateway"]),
      step("audit", "Auditar significado e números", "deterministic", ["Comparar todo número com fatos e cálculos citados.", "Bloquear claim material sem suporte ou aprovação exigida."], ["claim_auditor", "case_materials"]),
    ],
    decisionRules: ["Template define a régua e não é alterado pela redação.", "Risco não é escondido e ausência não é transformada em mitigante.", "Documento apresenta análise Offroad sem simular decisão do financiador."],
    redFlags: ["Número divergente do term sheet", "Linguagem de aprovação", "Mitigante não implementado descrito como existente", "Narrativa promocional sem suporte", "Ponto aberto omitido"],
    stopConditions: ["Template obrigatório não pode ser preenchido honestamente", "Auditoria numérica ou semântica falha", "Julgamento material carece de aprovação requerida"],
    outputFields: [
      {id: "material", type: "object", required: true, description: "Memorando compilado e versionado."},
      {id: "template_manifest", type: "object", required: true, description: "Template id, versão e cobertura de seções."},
      {id: "claim_audit", type: "object", required: true, description: "Resultado da auditoria de claims."},
    ],
    modelPurpose: ["redigir narrativa institucional exclusivamente a partir de claims e suportes governados"],
    allowedTools: ["case_materials", "model_gateway", "claim_auditor"],
    gold: ["memo do case gold cobre todas as seções obrigatórias e fecha com o modelo"],
    adversarial: ["claim com número não suportado bloqueia emissão", "novo fato introduzido pela redação é recusado"],
  }),

  candidate({
    id: "compile-institutional-teaser",
    title: {pt: "Compilar teaser institucional", en: "Compile institutional teaser"},
    role: "institutional_materials", stage: 10,
    objective: "Permitir triagem rápida de aderência com os mesmos números do memo e sem divulgação não autorizada.",
    product: "Teaser conciso, anônimo até autorização, alinhado ao template e ao memo.",
    prerequisites: ["Memorando e estrutura disponíveis", "Política de divulgação resolvida"], dependencies: ["compile-institutional-credit-memo"], templates: ["institutional-teaser"],
    steps: [
      step("select", "Selecionar conteúdo material", "deterministic", ["Usar snapshot, indicadores, estrutura, fit e pontos abertos definidos pelo template.", "Limitar conteúdo ao necessário para triagem."], ["case_materials"]),
      step("anonymize", "Aplicar autorização e anonimização", "deterministic", ["Remover identidade e identificadores indiretos antes de autorização.", "Registrar política aplicada no manifesto."], ["disclosure_policy"]),
      step("compare", "Comparar com memo e term sheet", "deterministic", ["Reconciliar todos os números e termos.", "Bloquear divergência ou versão diferente."], ["material_consistency"]),
    ],
    decisionRules: ["Teaser não substitui memo.", "Identidade só aparece com autorização explícita.", "Não usar percentual de match ou promessa de funding."],
    redFlags: ["Companhia identificável por detalhes não autorizados", "Métrica escolhida apenas por parecer favorável", "Estrutura divergente", "Ponto aberto material omitido"],
    stopConditions: ["Anonimização suficiente não é possível", "Memo ou term sheet está stale", "Consistência cruzada falha"],
    outputFields: [
      {id: "material", type: "object", required: true, description: "Teaser compilado e versionado."},
      {id: "disclosure_state", type: "enum", required: true, description: "Estado de identificação.", evidenceRequired: false, allowedValues: ["anonymous", "authorized_named"]},
      {id: "consistency_audit", type: "object", required: true, description: "Comparação com memo e term sheet."},
    ],
    allowedTools: ["case_materials", "disclosure_policy", "material_consistency"],
    gold: ["teaser anônimo preserva economia do case gold"],
    adversarial: ["nome em metadata é removido", "métrica divergente bloqueia emissão"],
  }),

  candidate({
    id: "compile-indicative-term-sheet",
    title: {pt: "Compilar term sheet indicativo", en: "Compile indicative term sheet"},
    role: "institutional_materials", stage: 10,
    objective: "Transformar a estrutura indicativa em documento cláusula a cláusula, coerente com análise e natureza não vinculante.",
    product: "Term sheet segundo template canônico, com basis e consistência cruzada.",
    prerequisites: ["Estrutura indicativa concluída", "Template vigente disponível"], dependencies: ["draft-indicative-structure"], templates: ["indicative-term-sheet"],
    steps: [
      step("map", "Mapear termos para cláusulas", "deterministic", ["Preencher cada seção obrigatória do template.", "Manter termos ausentes como abertos, não inventados."], ["case_materials"]),
      step("qualify", "Qualificar natureza e condições", "human_judgment", ["Distinguir indicativo, condição, diligência e definição futura.", "Evitar redação juridicamente conclusiva."], [], ["structure", "instrument requirements"]),
      step("audit", "Auditar economia e linguagem", "deterministic", ["Comparar com modelo, memo e sources and uses.", "Bloquear termos finais, aprovação ou compromisso de capital."], ["material_consistency"]),
    ],
    decisionRules: ["Cada cláusula econômica tem basis e suporte.", "Termo desconhecido permanece em aberto com impacto.", "O documento não substitui documentação definitiva do financiador."],
    redFlags: ["Cláusula genérica sem racional", "Covenant sem definição", "Garantia tratada como constituída", "Pricing apresentado como firme", "Condição de closing pedida no intake inicial"],
    stopConditions: ["Economia não reconcilia com modelo", "Cláusula obrigatória depende de decisão ainda não tomada", "Linguagem proibida permanece"],
    outputFields: [
      {id: "material", type: "object", required: true, description: "Term sheet compilado e versionado."},
      {id: "clause_coverage", type: "object", required: true, description: "Cobertura e estados por cláusula."},
      {id: "consistency_audit", type: "object", required: true, description: "Reconciliação econômica e de linguagem."},
    ],
    allowedTools: ["case_materials", "material_consistency"],
    gold: ["todas as cláusulas obrigatórias do case gold têm basis"],
    adversarial: ["termo final ou aprovação é recusado", "cláusula econômica sem suporte bloqueia"],
  }),

  candidate({
    id: "organize-institutional-data-room",
    title: {pt: "Organizar sala de dados institucional", en: "Organise institutional data room"},
    role: "institutional_materials", stage: 10,
    objective: "Organizar originais, análises e materiais autorizados sem alterar evidência nem simular diligência concluída.",
    product: "Índice versionado com pastas, documentos, materiais, pontos abertos e trilha de autorização.",
    prerequisites: ["Inventário documental", "Materiais candidatos disponíveis"], dependencies: ["inventory-source-documents", "compile-institutional-credit-memo", "compile-institutional-teaser", "compile-indicative-term-sheet"], templates: ["institutional-data-room-index"],
    steps: [
      step("classify", "Classificar no índice canônico", "deterministic", ["Separar societário, financeiro, dívida, projeto, materiais Offroad e pontos abertos.", "Preservar originais e versões."], ["data_room"]),
      step("authorize", "Aplicar autorização", "deterministic", ["Incluir somente versão e destinatários aprovados.", "Nunca tornar workspace privado uma superfície de descoberta."], ["disclosure_policy"]),
      step("manifest", "Emitir manifesto", "deterministic", ["Registrar hash, origem, versão, template e dependências.", "Marcar artefato stale quando input material mudar."], ["case_manifest"]),
    ],
    decisionRules: ["Original e derivado ficam separados.", "Ponto em aberto permanece visível.", "Arquivo não autorizado não entra no pacote externo."],
    redFlags: ["Versões conflitantes sem indicação", "Arquivo de outro case", "Gabarito sintético incluído", "Material stale", "Original renomeado de modo a esconder origem"],
    stopConditions: ["Autorização não cobre destinatário ou material", "Manifesto não fecha", "Exceção bloqueia output externo"],
    outputFields: [
      {id: "index", type: "object", required: true, description: "Índice canônico e estados."},
      {id: "manifest", type: "object", required: true, description: "Hashes, versões e autorizações."},
    ],
    allowedTools: ["data_room", "disclosure_policy", "case_manifest"],
    gold: ["sala do case gold contém originais, materiais e pontos abertos separados"],
    adversarial: ["arquivo não autorizado é excluído", "mudança em fato torna material dependente stale"],
  }),

  candidate({
    id: "screen-investor-mandates",
    title: {pt: "Triar mandatos de investidores", en: "Screen investor mandates"},
    role: "market_distribution", stage: 11,
    objective: "Identificar provedores para os quais a operação cabe antes de qualquer introdução.",
    product: "Shortlist explicável com hard constraints, sinais de aderência, restrições, contato e confiança da informação.",
    prerequisites: ["Estrutura e materiais coerentes", "Mandatos autorizados e versionados"], dependencies: ["draft-indicative-structure", "compile-institutional-teaser"],
    steps: [
      step("hard", "Aplicar filtros duros", "deterministic", ["Testar ticket, setor, instrumento, veículo, prazo, garantia, retorno, jurisdição e restrições.", "Excluir incompatível com razão exata."], ["matching_core"]),
      step("signals", "Aplicar inteligência qualitativa", "deterministic", ["Separar mandato declarado, transação observada e nota de relacionamento.", "Ponderar data e confiança sem criar percentual fictício."], ["investor_base", "market_reference"]),
      step("contact", "Selecionar instituição e contato", "human_judgment", ["Validar estratégia, timing e pessoa correta.", "Não divulgar antes da autorização."], [], ["relationship notes", "mandate screen"]),
    ],
    decisionRules: ["Hard constraint incompatível sempre exclui.", "Informação antiga reduz confiança; não vira aderência.", "Racional de match é qualitativo e verificável."],
    redFlags: ["Mesmo PDF para todos", "Contato genérico sem cobertura da estratégia", "Mandato desatualizado", "Match baseado apenas em setor", "Nome incluído por relacionamento apesar de hard constraint"],
    stopConditions: ["Nenhum mandato autorizado satisfaz hard constraints", "Mandatos críticos estão stale", "Material ainda não autorizado"],
    outputFields: [
      {id: "shortlist", type: "array", required: true, description: "Instituições elegíveis com racional e contato."},
      {id: "excluded", type: "array", required: true, description: "Instituições excluídas e hard constraint."},
      {id: "distribution_strategy", type: "object", required: true, description: "Ondas, timing e condições de abordagem."},
    ],
    allowedTools: ["matching_core", "investor_base", "market_reference"],
    gold: ["fund-aligned entra e fund-misaligned é excluído no case gold"],
    adversarial: ["relacionamento não supera ticket incompatível", "mandato sem data é marcado stale"],
  }),

  candidate({
    id: "quality-control-growth-capex",
    title: {pt: "Controlar qualidade da vertical", en: "Quality control the vertical"},
    role: "independent_quality_control", stage: 10,
    objective: "Validar evidência, matemática, coerência, templates, linguagem e fronteira de assessoria antes de liberação externa.",
    product: "Relatório independente de QC com aprovação da versão exata ou bloqueios acionáveis.",
    prerequisites: ["Outputs candidatos das etapas anteriores", "Manifestos e fingerprints disponíveis"], dependencies: ["compile-institutional-credit-memo", "compile-institutional-teaser", "compile-indicative-term-sheet", "organize-institutional-data-room", "screen-investor-mandates"],
    steps: [
      step("numeric", "Auditar números", "deterministic", ["Recalcular e comparar métricas, sources and uses, dívida, alavancagem, DSCR, pricing e covenants.", "Recusar divergência além da tolerância definida."], ["financial_core", "material_consistency"]),
      step("semantic", "Auditar significado", "model_assisted", ["Receber claim e suporte reconciliado, sem raciocínio do redator.", "Verificar extrapolação, qualificador, período, entidade e linguagem proibida."], ["model_gateway"]),
      step("governance", "Auditar governança", "deterministic", ["Verificar versões de procedimento, compiler, template, modelo e evidência.", "Aprovação vale somente para fingerprint exato."], ["case_manifest"]),
    ],
    decisionRules: ["QC não corrige silenciosamente; devolve finding ao procedimento responsável.", "Mudança material invalida aprovação.", "Falha em um artefato bloqueia pacote externo coerente."],
    redFlags: ["Aprovação migrada entre versões", "Auditor recebe racional privado do redator", "Número arredondado altera covenant", "Termos e memo divergem", "Linguagem de decisão de crédito"],
    stopConditions: ["Qualquer teste numérico material falha", "Claim material carece de suporte", "Manifesto ou autorização não correspondem à versão"],
    outputFields: [
      {id: "decision", type: "enum", required: true, description: "Decisão para a versão exata.", evidenceRequired: false, allowedValues: ["approved_for_authorization", "blocked", "rework"]},
      {id: "findings_by_procedure", type: "array", required: true, description: "Findings roteados à fonte canônica responsável."},
      {id: "manifest_fingerprint", type: "string", required: true, description: "Fingerprint da versão auditada.", evidenceRequired: false},
    ],
    modelPurpose: ["auditar semanticamente claims contra suportes, sem reescrever o material"],
    allowedTools: ["financial_core", "material_consistency", "model_gateway", "case_manifest"],
    gold: ["pacote coerente do case gold é aprovado para autorização"],
    adversarial: ["número certo com significado errado é bloqueado", "aprovação antiga não cobre novo fingerprint"],
  }),

  candidate({
    id: "execute-qualified-introduction",
    title: {pt: "Executar introdução qualificada", en: "Execute qualified introduction"},
    role: "market_distribution", stage: 12,
    objective: "Levar a versão autorizada da operação ao contato aderente e registrar a introdução sem invadir underwriting ou fechamento.",
    product: "Introdução qualificada, pacote autorizado, destinatários e market log versionados.",
    prerequisites: ["QC aprovado", "Autorização explícita da companhia", "Shortlist e contatos validados"], dependencies: ["quality-control-growth-capex", "screen-investor-mandates"],
    steps: [
      step("authorize", "Confirmar autorização", "deterministic", ["Vincular materiais, versão, destinatários e escopo à aprovação da companhia.", "Recusar autorização genérica ou stale."], ["disclosure_policy"]),
      step("introduce", "Preparar introdução", "human_judgment", ["Explicar em poucas linhas por que o case cabe no mandato e o que está sendo enviado.", "Não prometer interesse, diligência ou termos."], [], ["mandate rationale", "authorized teaser"]),
      step("log", "Registrar trilha", "deterministic", ["Registrar instituição, contato, horário, material, versão, autorização e retorno.", "Encerrar escopo Offroad em qualified introduction; passos do financiador ficam separados."], ["sounding"]),
    ],
    decisionRules: ["Somente destinatário autorizado recebe material.", "Material enviado deve ter o mesmo fingerprint aprovado pelo QC.", "Underwriting, diligência, comitê, termos finais e desembolso pertencem ao financiador."],
    redFlags: ["Envio em massa", "Material diferente do autorizado", "Contato fora do mandato", "Linguagem de aprovação ou compromisso", "Informação confidencial no assunto"],
    stopConditions: ["Autorização ausente ou stale", "QC não aprovado", "Contato ou mandato não confirmado", "Pacote diverge da versão autorizada"],
    outputFields: [
      {id: "introduction_log", type: "array", required: true, description: "Introduções realizadas com versão e autorização."},
      {id: "market_status", type: "enum", required: true, description: "Estado da distribuição.", evidenceRequired: false, allowedValues: ["ready", "introduced", "held", "no_aligned_mandate"]},
    ],
    allowedTools: ["disclosure_policy", "sounding"],
    gold: ["fund-aligned recebe somente o pacote autorizado do case gold"],
    adversarial: ["novo destinatário exige nova autorização", "material stale bloqueia envio"],
  }),
] as const satisfies readonly CanonicalProcedure[];

export const growthCapexProcedureRegistry = compileProcedureRegistry(
  growthCapexProcedures,
  materialTemplates.map((template) => template.id),
  referenceDataKeys,
);

export const growthCapexProcedureRegistryVersion = "2026.08.25-v2";
