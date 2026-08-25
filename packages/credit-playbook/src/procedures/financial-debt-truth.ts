import type {CanonicalProcedure, ProcedureAuthority} from "../procedure-contract";
import {canonicalProcedureSchema, compileProcedureRegistry} from "../procedure-contract";
import {referenceDataKeys} from "../reference-data";

const VERSION = "2026.08.25-v1";
const SOURCE = "packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md";

type Spec = {
  id: `Q-${string}` | `D-${string}`;
  slug: string;
  title: string;
  product: string;
  method: string[];
  references?: string[];
  authorities?: ProcedureAuthority[];
  legal?: boolean;
};

const q = (id: Spec["id"], slug: string, title: string, product: string, method: string[], references: string[] = []): Spec =>
  ({id, slug, title, product, method, references});

const d = (id: Spec["id"], slug: string, title: string, product: string, method: string[], references: string[] = [], legal = false): Spec =>
  ({id, slug, title, product, method, references, legal, authorities: legal ? ["DEF", "CASA", "LEI"] : ["DEF", "CASA"]});

const m2Specs: Spec[] = [
  q("Q-01", "ebitda-adjustments", "Régua dos ajustes de EBITDA", "Ponte entre EBITDA reportado e EBITDA da mesa", ["Inventariar cada ajuste por período, classe, recorrência e evidência.", "Somar apenas ajustes aceitos e preservar rejeitados e caso a caso sem sobrescrever o reportado."], ["policy.financial.normalization", "policy.financial.materiality"]),
  q("Q-02", "cash-conversion", "Conversão de EBITDA em caixa", "Ponte rastreável do EBITDA ajustado ao CFADS e caixa disponível", ["Partir do EBITDA da mesa e abrir impostos caixa, NCG, manutenção, encargos, leases, caixa restrito e demais fluxos.", "Fechar a ponte contra a variação de caixa e impedir dupla contagem."], ["policy.cash-flow.bridge", "policy.reconciliation.tolerance"]),
  q("Q-03", "maintenance-capex", "Capex de manutenção e expansão", "Ledger de capex por projeto e finalidade", ["Reconciliar adições com registro de ativos e fluxo de investimento.", "Classificar projeto a projeto e manter faixa explícita quando a separação não estiver suportada."], ["policy.capex.maintenance"]),
  q("Q-04", "normalized-working-capital", "Capital de giro normalizado", "Série de NCG, dias, pico, vale e efeito foto", ["Calcular NCG mensal conta a conta em janela comparável.", "Remover fornecedores financiados quando identificados e declarar a estatística usada na capacidade."], ["policy.seasonality.materiality", "policy.financial.materiality"]),
  q("Q-05", "revenue-recognition", "Reconhecimento de receita", "Testes de política, cut-off, entrega, devolução e ajuste proposto", ["Aplicar a lente de reconhecimento do setor à política contábil declarada.", "Testar concentração no fechamento, eventos posteriores e receita intercompany antes de aceitar qualquer ajuste."], ["policy.revenue-quality.cutoff"]),
  q("Q-06", "customer-concentration", "Concentração de clientes", "Ranking por grupo econômico com top 1, 5 e 10", ["Agrupar CNPJs do mesmo grupo antes de rankear.", "Cruzar participação, contrato, margem, prazo, substituibilidade e aging dos clientes materiais."], ["policy.concentration.materiality", "policy.receivables.aging"]),
  q("Q-07", "related-parties", "Partes relacionadas na DRE", "Visões com e sem partes relacionadas", ["Cruzar CNPJs relacionados com receita e compras.", "Manter preço, margem e tratamento econômico documentados sem exclusão automática."], ["policy.related-party.materiality"]),
  q("Q-08", "audit-quality", "Qualidade da auditoria", "Histórico de firma, opinião, ênfases, ressalvas e efeitos", ["Classificar a asseguração e transcrever pontos materiais ligados às contas afetadas.", "Não apresentar revisão limitada como auditoria nem transformar ausência de auditoria em recusa automática."]),
  q("Q-09", "trial-balance-reconciliation", "Balancete contra auditado", "Ponte conta a conta e índice de viés", ["Mapear plano de contas e comparar o mesmo período e perímetro.", "Preservar cada diferença material e testar direção recorrente em vez de escolher o número conveniente."], ["policy.reconciliation.tolerance", "policy.financial.materiality"]),
  q("Q-10", "projection-challenge", "Projeções contra o histórico", "Tabela de premissas da companhia e cenário da mesa", ["Comparar crescimento, margem e drivers projetados com o histórico entregue.", "Manter a projeção da companhia separada e cortar do cenário da mesa apenas o que não possuir driver verificável."], ["policy.business_plan.scenarios"]),
  q("Q-11", "seasonality", "Sazonalidade e mês da foto", "Índices mensais de receita e NCG", ["Calcular índices sobre janela comparável e carimbar métricas pontuais com o mês.", "Comparar mês com mês equivalente e levar amplitude material ao desenho da dívida."], ["policy.seasonality.materiality"]),
  q("Q-12", "currency-mismatch", "Moeda e descasamento", "Mapa de exposição líquida por moeda", ["Abrir receita, custo, serviço da dívida e hedge por moeda.", "Calcular exposição líquida e impedir que hedge natural ou derivativo incompatível seja contado como proteção."], ["policy.currency.exposure"]),
  q("Q-13", "inventory-quality", "Qualidade do estoque", "Giro, aging, provisão, perdas e leitura de garantia", ["Calcular giro e idade por linha e comparar provisão com perda observada.", "Nomear descasamento com receita e obsolescência sem aplicar haircut não governado."], ["policy.financial.materiality"]),
  q("Q-14", "receivables-quality", "Qualidade do contas a receber", "Aging, provisão, perda e carteira elegível", ["Separar a vencer, faixas vencidas e renegociados em múltiplas datas.", "Cruzar PDD, incorrido e concentração antes de calcular elegibilidade."], ["policy.receivables.aging"]),
  q("Q-15", "labor-liability", "Passivo trabalhista recorrente", "Histórico de desembolso, provisão, estoque e ajuste proposto", ["Separar desembolso recorrente de estoque contingente.", "Incluir no CFADS somente quando a recorrência estiver suportada e sem dupla contagem."], ["policy.financial.materiality"]),
  q("Q-16", "unit-economics", "EBITDA por unidade", "Desempenho e caixa por unidade ou segmento", ["Abrir receita, margem e EBITDA por unidade comparável.", "Testar persistência de déficit, subsídio cruzado e cenário de descontinuação."], ["policy.financial.materiality"]),
  q("Q-17", "financial-identities", "Identidades financeiras obrigatórias", "Checks de balanço, patrimônio, imobilizado, caixa e impostos", ["Recalcular cada identidade sobre a peça e versão corretas.", "Falha material bloqueia a peça afetada e vira divergência acionável, nunca conserto silencioso."], ["policy.reconciliation.tolerance"]),
  q("Q-18", "house-spread", "Spread financeiro da casa", "Base financeira padronizada e reproduzível", ["Compilar histórico, LTM suportado, posição atual, cenários, obrigações e métricas numa base única.", "Exigir fonte ou cálculo para toda célula material e checks Q-17 verdes antes de liberação."], ["policy.reconciliation.tolerance", "policy.material.numeric_rounding"]),
];

const m3Specs: Spec[] = [
  d("D-01", "contract-ledger", "Relação analítica de contratos", "Ledger contrato a contrato reconciliado", ["Conciliar mapa, notas, balanço, razão e contratos.", "Manter instrumentos ausentes e diferenças como exceções nomeadas."], ["policy.debt.views", "policy.reconciliation.tolerance"]),
  d("D-02", "indexer-view", "Abertura por indexador", "Saldo e custo por indexador", ["Classificar CDI+, percentual CDI, pré, inflação, TLP e moeda sem equiparar convenções.", "Usar saldo médio e curva datada quando calcular custo."], ["policy.debt.cost-reconciliation"]),
  d("D-03", "maturity-schedule", "Cronograma de vencimentos", "Maturity wall com drill-down contratual", ["Agregar principal por data sem perder o contrato.", "Conciliar o cronograma ao ledger e testar a parcela de 12 meses."], ["policy.debt.maturity-concentration"]),
  d("D-04", "lender-concentration", "Concentração de credor", "Exposição e dependência por credor", ["Agrupar saldos, limites e garantias por grupo credor.", "Separar concentração observada de interpretação de risco."], ["policy.concentration.materiality"]),
  d("D-05", "short-term-lines", "Linhas curtas e rolagem", "Mapa de linhas curtas, compromisso e dependência", ["Classificar compromisso, vencimento, histórico e discricionariedade.", "Não presumir renovação nem disponibilidade de limite não contratado."], ["policy.debt.renewal-scenarios"]),
  d("D-06", "supplier-finance", "Risco sacado e confirming", "Obrigações de fornecedor financiado tratadas por substância", ["Identificar financiador, prazo, recurso, cancelamento e extensão.", "Reclassificar somente quando a mecânica sustentar uma obrigação financeira."], ["policy.debt.views"]),
  d("D-07", "receivables-transfers", "Recebíveis cedidos e descontados", "Mapa de recurso, recompra, first loss e risco retido", ["Ler o contrato de cessão e separar cada forma de suporte econômico.", "Não somar automaticamente carteira, cota ou veículo à dívida."], ["policy.debt.views", "policy.receivables.aging"]),
  d("D-08", "leases", "Arrendamentos", "Visão de dívida e EBITDA sob convenção coerente", ["Declarar a convenção IFRS 16 usada no numerador e denominador.", "Reconciliar passivo, prazo, taxa e pagamentos sem misturar convenções."], ["policy.cash-flow.bridge", "policy.debt.views"]),
  d("D-09", "tax-installments", "Parcelamentos tributários", "Cronograma fiscal e regra de inclusão por visão", ["Identificar programa, saldo, senioridade, pagamentos e consequências de inadimplemento.", "Separar obrigação de caixa de dívida de covenant."], ["policy.debt.views"]),
  d("D-10", "third-party-guarantees", "Fianças, avais e garantias a terceiros", "Ledger de exposição contingente e garantidores", ["Inventariar garantido, beneficiário, valor, recurso e grupo.", "Tratar como exposição contingente e impedir dupla contagem de suporte."], ["policy.related-party.materiality"]),
  d("D-11", "related-party-loans", "Mútuos com partes relacionadas", "Mapa de mútuos, fluxos, subordinação e tratamento", ["Abrir saldo, movimentação, taxa, prazo, finalidade e aprovação.", "Quase-equity exige subordinação formal e trava de pagamento."], ["policy.related-party.materiality"]),
  d("D-12", "foreign-currency-debt", "Dívida em moeda estrangeira", "Exposição de dívida, receita e hedge por moeda", ["Comparar dívida e serviço com receita na mesma moeda e proteção contratada.", "Nomear descasamento quando mix ou hedge não cobrir prazo e notional."], ["policy.currency.exposure"]),
  d("D-13", "derivatives", "Derivativos", "Posição, MTM, finalidade, contraparte e risco potencial", ["Inventariar contratos e margem por instrumento.", "Estrutura alavancada ou perda não limitada vira flag de governança e liquidez."], ["policy.currency.exposure"]),
  d("D-14", "acquisition-obligations", "Obrigações de aquisição e earn-outs", "Ledger de obrigações de M&A", ["Abrir condição, data, contraparte e valor por contrato.", "Aplicar regras de inclusão por visão sem automatismo."], ["policy.debt.views"]),
  d("D-15", "declared-distributions", "Dividendos e JCP declarados", "Ponte de obrigações com acionistas", ["Abrir exigibilidade, restrições e possibilidade de reversão.", "Incluir em caixa e covenant apenas conforme definição aplicável."], ["policy.debt.views"]),
  d("D-16", "contingencies", "Contingências prováveis", "Ponte de provisões, exposições e cenários", ["Separar natureza, probabilidade, faixa e expectativa de desembolso.", "Impedir dupla contagem entre provisão, CFADS e visão de dívida."], ["policy.debt.views"]),
  d("D-17", "debt-cost", "Custo efetivo e contábil da dívida", "Custo caixa, contábil e all-in por contrato", ["Usar saldo médio, indexador, spread, fees, hedge e calendário do mesmo período.", "Agregar somente depois da reconciliação por contrato."], ["policy.debt.cost-reconciliation"]),
  d("D-18", "weighted-life", "Vida média e concentração temporal", "Vida média, duration quando aplicável e perfil de principal", ["Calcular vida média ponderada a partir do cronograma.", "Não usar vencimento final ou duration como sinônimos."], ["policy.debt.maturity-concentration"]),
  d("D-19", "collateral-ledger", "Mapa de garantias e ônus", "Ledger de ativo, titular, prioridade, valor e disponibilidade", ["Vincular garantia a contrato e evidência vigente.", "Não marcar ativo livre sem confirmação nem contar o mesmo suporte duas vezes."], ["policy.structure.collateral_haircuts"], true),
  d("D-20", "existing-covenants", "Covenants existentes", "Teste contratual e analítico com headroom", ["Extrair a definição literal, perímetro, data, cura, waiver e consequência.", "Recomputar separadamente a visão contratual e a visão Offroad."], ["policy.structure.covenant_headroom"], true),
  d("D-21", "payment-behavior", "Histórico de renegociação e pagamento", "Linha do tempo de aditivos, waivers, atrasos e pré-pagamentos", ["Registrar causa, iniciativa, contrapartida e desfecho por evento.", "Distinguir gestão preventiva de estresse recorrente sem omitir eventos curados."], ["policy.debt.renewal-scenarios"]),
  d("D-22", "entity-debt", "Dívida e fluxo por entidade", "Matriz de dívida, caixa, CFADS, garantia e restrições por entidade", ["Produzir visões individual, consolidada e de subordinação estrutural.", "Não comparar dívida com caixa ou EBITDA inacessível sem ponte explícita."], ["policy.debt.views"]),
  d("D-23", "authorized-external-confirmation", "SCR e confirmação autorizada", "Reconciliação externa com consentimento, data-base e escopo", ["Usar apenas relatório legitimamente fornecido pela própria companhia ou canal autorizado.", "Explicar diferenças de data e critério antes de tratar como flag."], ["policy.privacy.permitted-background-sources"], true),
  d("D-24", "obligation-views", "Ledger e visões de obrigações", "Visões reconciliadas sem dupla contagem", ["Manter uma linha por obrigação com regras de inclusão declaradas.", "Produzir dívida bruta, líquida, covenant, capacidade, quase dívida, contingências e fora de balanço."], ["policy.debt.views"]),
  d("D-25", "interest-expense-bridge", "Ponte da despesa financeira", "Ponte de juros caixa, competência e demais componentes", ["Abrir atualização, câmbio, derivativos, fees, multas, leasing, capitalização e receitas financeiras.", "Conciliar DRE, DFC, balanço e razão na mesma janela."], ["policy.debt.cost-reconciliation"]),
  d("D-26", "liquidity-coverage", "Cobertura de liquidez e serviço", "Série de fontes, serviço, cobertura e déficit por cenário", ["Combinar caixa livre, CFADS e fontes contratadas com todas as obrigações aplicáveis.", "Rodar base, downside e sem operação, sem contar caixa restrito ou linha discricionária como certa."], ["policy.cash-flow.bridge", "policy.capacity.minimum_headroom"]),
  d("D-27", "market-stress", "Cenários de juros, inflação e moeda", "Matriz de juros, cobertura, covenant e caixa", ["Aplicar somente cenários versionados e compatíveis com indexador, moeda e hedge.", "Recalcular efeitos correlacionados no negócio sem choque universal inventado."], ["scenario.interest_rate.parallel_shock", "scenario.market.multi-factor"]),
  d("D-28", "non-renewal", "Cenário de não renovação", "Runway e déficit por linha e hipótese", ["Aplicar hipótese por compromisso, tipo, histórico e discricionariedade.", "Contar alternativa de funding somente quando suportada."], ["policy.debt.renewal-scenarios", "scenario.short_term_non_renewal"]),
  d("D-29", "cross-default-graph", "Grafo de cross-default e aceleração", "Grafo contratual e cenários de propagação", ["Extrair evento, threshold, cura, alcance e tipo de cláusula.", "Propagar apenas quando condições contratuais estiverem satisfeitas e separar default de aceleração."], [], true),
  d("D-30", "day-one-compatibility", "Compatibilidade da estrutura no dia um", "Checklist de conflitos e caminhos de resolução", ["Aplicar a estrutura indicativa contra covenants, negative pledges, garantias, autorizações, prioridade e entidade.", "Bloquear o termo incompatível e exigir revisão jurídica quando a interpretação for material."], ["market.instrument.eligibility"], true),
  d("D-31", "memo-debt-section", "Produto da análise de dívida", "Seção de dívida do memo ligada ao ledger", ["Compilar visões, perfil, custo, covenants, garantias e passivos sem reintrodução manual de número.", "Mostrar risco, incerteza e tratamento sem prometer ausência de surpresa futura."], ["policy.material.numeric_rounding"]),
];

function canonical(spec: Spec): CanonicalProcedure {
  const id = `${spec.id.toLowerCase()}-${spec.slug}`;
  return canonicalProcedureSchema.parse({
    id,
    version: VERSION,
    maturity: "candidate",
    title: {pt: spec.title, en: `${spec.id} governed procedure`},
    role: "financial_analysis",
    blueprintStage: 5,
    owner: {role: "Head de Análise Financeira"},
    objective: `Executar ${spec.id} de forma determinística, rastreável e fail-closed.`,
    product: spec.product,
    procedure: [
      {id: "validate", title: "Validar insumos", instructions: ["Confirmar entidade, período, moeda, escala, versão e âncora de toda entrada material.", "Ausência, conflito e não aplicável permanecem estados distintos."], mode: "deterministic", tools: [spec.id.startsWith("Q") ? "financial_truth" : "debt_truth"], evidenceInputs: ["evidence ledger reconciliado"]},
      {id: "execute", title: "Executar método canônico", instructions: spec.method, mode: "deterministic", tools: [spec.id.startsWith("Q") ? "financial_core" : "debt_truth"], evidenceInputs: ["facts reconciliados", "reference data aprovada quando aplicável"]},
      {id: "gate", title: "Aplicar gate", instructions: ["Emitir produto, exceções e lacunas separadamente.", "Bloquear apenas o output afetado quando a evidência material não sustentar a conta."], mode: "deterministic", tools: ["procedure_coverage"], evidenceInputs: ["resultado estruturado"]},
    ],
    output: {schemaId: `offroad.${spec.id.toLowerCase().replace("-", "_")}.v1`, fields: [
      {id: "status", type: "enum", required: true, description: "Estado da execução.", evidenceRequired: false, allowedValues: ["completed", "partial", "blocked", "not_computable", "not_applicable"]},
      {id: "result", type: "object", required: false, description: spec.product, evidenceRequired: true},
      {id: "exceptions", type: "array", required: true, description: "Exceções nomeadas com impacto.", evidenceRequired: true},
      {id: "missing_inputs", type: "array", required: true, description: "Insumos ainda necessários.", evidenceRequired: false},
      {id: "evidence_links", type: "array", required: true, description: "Fontes e cálculos rastreados.", evidenceRequired: true},
    ]},
    evidence: {
      hierarchy: ["Contrato, escritura ou documento operacional específico", "Demonstração auditada e notas", "Informação revisada", "Balancete, razão e ERP reconciliados", "Informação gerencial identificada", "Declaração confirmada da companhia"],
      rules: ["Fonte superior só governa em período e perímetro comparáveis.", "Toda conta material aponta para evidência ou cálculo.", "Conflito não é média e ausência não é zero."],
      materialClaimsRequireSupport: true,
    },
    tests: {
      unit: [`schema e aritmética de ${spec.id}`],
      gold: [`caso limpo produz ${spec.product.toLowerCase()}`],
      adversarial: [`ausência ou conflito material em ${spec.id} não vira estimativa silenciosa`],
      acceptance: ["resultado reproduzível", "evidência completa", "bloqueio localizado"],
    },
    source: {path: `${SOURCE}#${spec.id}`, effectiveDate: "2026-08-25"},
    knowledge: {houseProcedureIds: [spec.id], authorities: spec.authorities ?? ["DEF", "CASA"], referenceDataKeys: spec.references ?? [], legalReviewRequired: spec.legal ?? false},
    prerequisites: ["Evidence ledger reconciliado", "Perímetro e data-base identificados"],
    dependencies: [],
    decisionRules: ["Não escolher a visão mais conveniente.", "Método e referência de mercado permanecem versionados.", "Julgamento não substitui cálculo determinístico."],
    redFlags: ["Número sem fonte", "Período ou entidade incompatível", "Ajuste silencioso", "Dupla contagem"],
    stopConditions: ["Evidência material ausente ou conflitante muda o resultado", "Referência obrigatória está ausente ou expirada"],
    exceptions: ["Quando o input não existir, emitir not_computable com a próxima melhor solicitação."],
    templates: [],
    examples: {positive: [`${spec.id} fecha com evidência e cálculo reproduzível.`], negative: [`${spec.id} publica um resultado apesar de input material ausente.`]},
    runtime: {orchestration: "deterministic_pipeline", peerHandoffs: false, maxModelCalls: 0, modelPurpose: [], allowedTools: [spec.id.startsWith("Q") ? "financial_truth" : "debt_truth", "procedure_coverage"]},
  });
}

export const financialDebtTruthProcedures = [...m2Specs, ...m3Specs].map(canonical);
export const financialDebtTruthProcedureRegistry = compileProcedureRegistry(financialDebtTruthProcedures, [], referenceDataKeys);
