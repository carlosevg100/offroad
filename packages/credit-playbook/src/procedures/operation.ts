import {canonicalProcedureSchema, compileProcedureRegistry, type CanonicalProcedure} from "../procedure-contract";
import {referenceDataKeys} from "../reference-data";

const VERSION = "2026.08.25-v1";
const SOURCE = "packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md";
type Spec = {id: `OP-${string}`; slug: string; title: string; product: string; method: string[]; references?: string[]};
const specs: Spec[] = [
  {id: "OP-01", slug: "request-versus-need", title: "Pedido declarado contra necessidade calculada", product: "Ponte entre pedido, necessidade econômica e decisão registrada", method: ["Calcular capex, capital de giro incremental, custos, buffer governado e autofinanciamento.", "Comparar ao pedido e registrar a decisão quando a diferença superar a materialidade."], references: ["policy.transaction-sizing.materiality", "policy.transaction-sizing.execution-buffer", "policy.transaction-costs"]},
  {id: "OP-02", slug: "sources-and-uses", title: "Sources and uses fechado", product: "Tabela por entidade, moeda, data, tranche e evidência", method: ["Abrir apenas fontes comprovadas ou explicitamente condicionais e usos ancorados.", "Exigir igualdade exata dentro da tolerância governada, sem plug não explicado."], references: ["policy.transaction-sizing.residual", "policy.transaction-costs", "policy.capex.maintenance"]},
  {id: "OP-03", slug: "pro-forma", title: "Posição pró-forma completa", product: "Dívida, caixa, alavancagem, vencimentos, cobertura e covenants após a operação", method: ["Partir do saldo reconciliado e aplicar dívida nova, liquidações, custos e caixa da companhia.", "Recalcular métricas e impedir conflito de covenant no dia um."], references: ["policy.transaction-costs", "policy.reconciliation.tolerance"]},
  {id: "OP-04", slug: "scenario-capacity", title: "Capacidade por cenário", product: "Cobertura e liquidez por período em base e downside", method: ["Aplicar apenas cenários versionados aos fluxos e serviço da dívida.", "Redimensionar quando downside violar piso governado."], references: ["scenario.market.multi-factor", "policy.capacity.minimum_headroom"]},
  {id: "OP-05", slug: "transaction-effects", title: "O que a operação resolve, não toca e cria", product: "Três listas explícitas e quantificadas", method: ["Separar efeitos solucionados, riscos não alterados e novas obrigações.", "Levar riscos materiais não tocados ao memo."]},
  {id: "OP-06", slug: "incremental-working-capital", title: "Capital de giro incremental", product: "Necessidade por conta, período e pico de caixa", method: ["Calcular recebíveis, estoque, fornecedores e outros itens pelos drivers operacionais.", "Usar o pico de caixa, nunca a soma de períodos."], references: ["policy.seasonality.materiality"]},
  {id: "OP-07", slug: "excess-funding", title: "Custo de pedir demais", product: "Excesso e carry anual quantificados", method: ["Medir o pedido acima da necessidade e buffer autorizados.", "Comparar custo da dívida, rendimento do caixa e custo de disponibilidade."], references: ["policy.transaction-sizing.materiality", "policy.transaction-sizing.execution-buffer"]},
  {id: "OP-08", slug: "tranches-and-milestones", title: "Tranches por marco objetivo", product: "Cronograma de liberações com evidência, atestador e SLA", method: ["Definir a parcela mínima do fechamento e vincular liberações seguintes a marcos objetivos.", "Bloquear marco subjetivo ou sem responsável por atestá-lo."], references: ["policy.disbursement.lag"]},
  {id: "OP-09", slug: "conditions-precedent", title: "Condições precedentes por uso", product: "Lista com dono, evidência, prazo e estado", method: ["Selecionar condições do catálogo versionado conforme uso e arquétipo.", "Não tratar protocolo como licença nem intenção como condição satisfeita."], references: ["policy.conditions-precedent.catalogue"]},
  {id: "OP-10", slug: "bridge-and-takeout", title: "Ponte e take-out", product: "Ponte com saída nomeada, risco de falha e plano alternativo", method: ["Definir a fonte e o prazo do take-out.", "Bloquear a ponte sem risco de falha e plano alternativo explícitos."]},
  {id: "OP-11", slug: "draw-schedule", title: "Desembolso contra cronograma físico-financeiro", product: "Mapa mensal de liquidez e necessidade descoberta", method: ["Sobrepor fontes disponíveis e usos por período.", "Bloquear qualquer mês descoberto e devolver saque antecipado excessivo ao OP-07."], references: ["policy.disbursement.lag"]},
  {id: "OP-12", slug: "wait-decision", title: "Quando a resposta é esperar", product: "Marco, data, custo, ganho estimado e decisão do cliente", method: ["Nomear o marco que pode melhorar a estrutura e sua data.", "Quantificar custo de espera e ganho estimado sem decidir pelo cliente."], references: ["policy.wait-analysis"]},
  {id: "OP-13", slug: "mixed-uses", title: "Usos mistos", product: "Blocos produtivo, remediação e reforço, sem destinação genérica", method: ["Classificar cada uso econômico e manter refinanciamento explícito.", "Limitar finalidade corporativa geral pela política versionada."], references: ["policy.mixed-use.general-purpose"]},
  {id: "OP-14", slug: "declared-version", title: "Versão declarada da operação", product: "Histórico material de montante, uso, prazo e garantias", method: ["Versionar cada mudança material e registrar confirmação.", "Bloquear materiais produzidos sobre uma versão superada."]},
];

function canonical(spec: Spec): CanonicalProcedure {
  return canonicalProcedureSchema.parse({
    id: `${spec.id.toLowerCase()}-${spec.slug}`, version: VERSION, maturity: "candidate",
    title: {pt: spec.title, en: `${spec.id} governed operation procedure`}, role: "credit_structuring", blueprintStage: 7,
    owner: {role: "Head de DCM e Estruturação"}, objective: `Executar ${spec.id} com matemática reproduzível e evidência ligada.`, product: spec.product,
    procedure: [
      {id: "validate", title: "Validar insumos", instructions: ["Confirmar versão, entidade, moeda, escala, data e evidência de cada linha material.", "Manter ausente, conflitante, condicional e não aplicável como estados distintos."], mode: "deterministic", tools: ["operation_truth"], evidenceInputs: ["financial truth", "debt truth", "evidence ledger"]},
      {id: "execute", title: "Executar método", instructions: spec.method, mode: "deterministic", tools: ["financial_core", "operation_truth"], evidenceInputs: ["fatos reconciliados", "reference data aprovada quando aplicável"]},
      {id: "gate", title: "Aplicar gate", instructions: ["Emitir resultado, exceções e próximas solicitações separadamente.", "Bloquear somente o produto afetado e nunca inventar um número ausente."], mode: "deterministic", tools: ["procedure_coverage"], evidenceInputs: ["resultado estruturado"]},
    ],
    output: {schemaId: `offroad.${spec.id.toLowerCase().replace("-", "_")}.v1`, fields: [
      {id: "status", type: "enum", required: true, description: "Estado da execução.", evidenceRequired: false, allowedValues: ["completed", "partial", "blocked", "not_computable", "not_applicable"]},
      {id: "result", type: "object", required: false, description: spec.product, evidenceRequired: true},
      {id: "exceptions", type: "array", required: true, description: "Exceções e impacto.", evidenceRequired: true},
      {id: "missing_inputs", type: "array", required: true, description: "Próximos insumos necessários.", evidenceRequired: false},
      {id: "evidence_links", type: "array", required: true, description: "Fontes e cálculos rastreados.", evidenceRequired: true},
    ]},
    evidence: {hierarchy: ["Contrato, orçamento, cronograma ou documento operacional específico", "Demonstrações e dívida reconciliadas", "Informação gerencial identificada", "Declaração confirmada da companhia"], rules: ["Fonte superior governa apenas em período e perímetro comparáveis.", "Toda linha material aponta para evidência ou cálculo.", "Condição não satisfeita não vira fonte disponível."], materialClaimsRequireSupport: true},
    tests: {unit: [`schema e aritmética de ${spec.id}`], gold: [`caso limpo produz ${spec.product.toLowerCase()}`], adversarial: [`ausência ou conflito em ${spec.id} não vira estimativa silenciosa`], acceptance: ["resultado reproduzível", "evidência completa", "bloqueio localizado"]},
    source: {path: `${SOURCE}#${spec.id}`, effectiveDate: "2026-08-25"}, knowledge: {houseProcedureIds: [spec.id], authorities: ["DEF", "CASA"], referenceDataKeys: spec.references ?? [], legalReviewRequired: false},
    prerequisites: ["Financial Truth Set", "Debt Truth Set", "pedido e data-base identificados"], dependencies: [], decisionRules: ["Nenhuma fonte condicional é tratada como disponível.", "Toda identidade econômica é determinística.", "A Offroad propõe alternativas e não compromete capital."], redFlags: ["Plug não explicado", "Uso genérico", "Número sem fonte", "Versão superada"], stopConditions: ["Identidade material falha", "Referência obrigatória ausente ou expirada"], exceptions: ["Emitir not_computable e a próxima melhor solicitação quando faltar input."], templates: [], examples: {positive: [`${spec.id} fecha com conta e evidência reproduzíveis.`], negative: [`${spec.id} usa um plug ou suposição não governada.`]}, runtime: {orchestration: "deterministic_pipeline", peerHandoffs: false, maxModelCalls: 0, modelPurpose: [], allowedTools: ["financial_core", "operation_truth", "procedure_coverage"]},
  });
}

export const operationProcedures = specs.map(canonical);
export const operationProcedureRegistry = compileProcedureRegistry(operationProcedures, [], referenceDataKeys);
