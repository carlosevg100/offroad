import {z} from "zod";

export const offroadGraphSchema = z.enum(["knowledge", "case", "market"]);
export const offroadExecutionClassSchema = z.enum([
  "deterministic",
  "extraction",
  "research",
  "judgment",
  "compilation",
  "action",
]);
export const offroadTaskEffectSchema = z.enum(["none", "propose_state", "commit", "external"]);
export const offroadTaskMaturitySchema = z.enum(["specified", "implemented", "ai_reviewed", "tested", "ready_for_founder", "production"]);
export const offroadTaskMaturityOrder: readonly OffroadTaskMaturity[] = ["specified", "implemented", "ai_reviewed", "tested", "ready_for_founder", "production"];

/**
 * How a task reads. Retrieval answers "which passages look relevant"; credit work often has to
 * answer "was everything material examined". A task that reads a covenant or reconciles a debt
 * schedule cannot rest on the ten most similar chunks, so every TaskSpec declares its reading
 * strategies and the runtime produces a manifest of what was and was not covered.
 */
export const readingStrategySchema = z.enum([
  "exact_search",
  "semantic_retrieval",
  "structured_query",
  "exhaustive_corpus",
  "version_reconciliation",
  "original_vs_amendment",
  "threshold_scan",
]);
export type ReadingStrategy = z.infer<typeof readingStrategySchema>;

export type OffroadGraph = z.infer<typeof offroadGraphSchema>;
export type OffroadExecutionClass = z.infer<typeof offroadExecutionClassSchema>;
export type OffroadTaskEffect = z.infer<typeof offroadTaskEffectSchema>;
export type OffroadTaskMaturity = z.infer<typeof offroadTaskMaturitySchema>;

export type OffroadTaskSpec = {
  id: string;
  label: string;
  graph: OffroadGraph;
  dependencies: readonly string[];
  executionClass: OffroadExecutionClass;
  effect: OffroadTaskEffect;
  maturity: OffroadTaskMaturity;
  /** Never empty. Selective reading is a declared choice, not a default nobody wrote down. */
  readingStrategies: readonly ReadingStrategy[];
  /**
   * The method this task executes, by id and version, once one is bound. A task without a bound
   * method can be specified and even implemented, but it cannot be promoted: an executor may not
   * improvise a procedure the library does not hold.
   */
  procedure?: {id: string; version: string};
};

export type MethodMaturity = "draft" | "candidate" | "implemented" | "ai_reviewed" | "tested" | "ready_for_founder" | "production";
export type MethodMaturityLookup = (procedureId: string, version: string) => {maturity: MethodMaturity; hasImplementation: boolean} | null;

const methodRank: Record<MethodMaturity, number> = {draft: -1, candidate: -1, implemented: 1, ai_reviewed: 2, tested: 3, ready_for_founder: 4, production: 5};
const taskRank = (maturity: OffroadTaskMaturity): number => offroadTaskMaturityOrder.indexOf(maturity);

/**
 * The promotion gate for a TaskSpec. A task never climbs above the method bound to it: from
 * `implemented` up it needs a bound method with implementation evidence at least on the same
 * rung, and `production` needs a production method. Anything less stays where it is, with the
 * reason spelled out.
 */
export function assertTaskPromotable(task: OffroadTaskSpec, target: OffroadTaskMaturity, lookup: MethodMaturityLookup): void {
  if (target === "specified") return;
  if (!task.procedure) throw new Error(`task ${task.id} cannot reach ${target} without a bound method`);
  const method = lookup(task.procedure.id, task.procedure.version);
  if (!method) throw new Error(`task ${task.id} is bound to ${task.procedure.id}@${task.procedure.version}, which the method library does not hold`);
  if (!method.hasImplementation) throw new Error(`task ${task.id} is bound to ${task.procedure.id}@${task.procedure.version} (${method.maturity}, no implementation evidence); nothing promotes a task without executable evidence`);
  if (methodRank[method.maturity] < taskRank(target)) {
    throw new Error(`task ${task.id} cannot reach ${target}: its method ${task.procedure.id}@${task.procedure.version} is ${method.maturity}; a task never climbs above its method`);
  }
}

/** The reading a class of work needs when the task does not say otherwise. */
export function defaultReadingStrategies(executionClass: OffroadExecutionClass): readonly ReadingStrategy[] {
  switch (executionClass) {
    case "extraction": return ["exhaustive_corpus"];
    case "deterministic": return ["structured_query"];
    case "research": return ["exact_search", "semantic_retrieval"];
    case "judgment": return ["structured_query", "semantic_retrieval"];
    case "compilation": return ["structured_query"];
    case "action": return ["structured_query"];
  }
}

/**
 * Tasks whose subject makes selective reading wrong. A covenant, a guarantee package or a debt
 * reconciliation is examined whole, against the previous version and against thresholds.
 */
const readingOverrides: Record<string, readonly ReadingStrategy[]> = {
  D03: ["exhaustive_corpus"],
  D04: ["exhaustive_corpus"],
  D06: ["structured_query", "version_reconciliation"],
  D11: ["structured_query", "version_reconciliation"],
  S04: ["exhaustive_corpus", "original_vs_amendment", "structured_query"],
  S08: ["exhaustive_corpus", "original_vs_amendment", "threshold_scan"],
  K04: ["exact_search", "semantic_retrieval", "structured_query"],
  L01: ["threshold_scan", "version_reconciliation"],
  L02: ["threshold_scan", "version_reconciliation"],
  L03: ["threshold_scan", "version_reconciliation"],
  L04: ["threshold_scan", "version_reconciliation"],
  L05: ["threshold_scan", "version_reconciliation"],
  L06: ["threshold_scan", "version_reconciliation"],
};

const task = (
  id: string,
  label: string,
  graph: OffroadGraph,
  dependencies: readonly string[],
  executionClass: OffroadExecutionClass,
  effect: OffroadTaskEffect = "propose_state",
): OffroadTaskSpec => ({
  id, label, graph, dependencies, executionClass, effect, maturity: "specified",
  readingStrategies: readingOverrides[id] ?? defaultReadingStrategies(executionClass),
});

/**
 * Canonical target registry from the approved OffroadOS architecture. `specified` is deliberate:
 * a node is promoted separately only after executor, persistence, interface, gold case, adversarial
 * case, E2E and measured cost exist. Registry presence never implies production readiness.
 */
export const offroadTaskRegistry = [
  task("M01", "Resolver companhia, grupo, jurisdição e regime de evidência", "case", [], "extraction"),
  task("M02", "Normalizar objetivo", "case", [], "extraction"),
  task("M03", "Registrar restrições", "case", ["M02"], "extraction"),
  task("M04", "Inferir arquétipos candidatos", "case", ["M01", "M02"], "judgment"),
  task("M05", "Definir entregáveis, idioma e audiência", "case", ["M02", "M03"], "deterministic"),
  task("M06", "Compilar plano de tarefas", "case", ["M04", "M05"], "deterministic", "commit"),
  // The corrigible meeting brief is a compilation of the scoped execution plan plus the
  // public sector/regulatory and comparable-transaction research. Keeping those research
  // nodes as sibling targets allowed M07 to complete without consuming either output.
  task("M07", "Emitir entendimento corrigível", "case", ["M06", "C02", "K04"], "compilation"),

  task("D01", "Ingerir e versionar arquivos", "case", ["M06"], "deterministic", "commit"),
  task("D02", "Classificar documento", "case", ["D01"], "extraction"),
  task("D03", "Extrair layout e conteúdo", "case", ["D02"], "extraction"),
  task("D04", "Extrair candidatos a fatos", "case", ["D03"], "extraction"),
  task("D05", "Resolver entidade, período e unidade", "case", ["D04"], "deterministic"),
  task("D06", "Conciliar fontes", "case", ["D05"], "deterministic", "commit"),
  task("D07", "Rodar identidades", "case", ["D06"], "deterministic"),
  task("D08", "Medir suficiência", "case", ["D06", "M04"], "deterministic"),
  task("D09", "Priorizar lacunas", "case", ["D07", "D08"], "deterministic"),
  task("D10", "Compilar perguntas em lote", "case", ["D09"], "compilation"),
  task("D11", "Processar nova resposta e invalidar descendentes", "case", ["D10"], "deterministic", "commit"),

  task("C01", "Reconstruir modelo de negócio", "case", ["D06"], "judgment"),
  task("C02", "Carregar conhecimento aplicável e pesquisar setor e regulação", "knowledge", ["M01", "M04"], "research", "none"),
  task("C03", "Construir spreading", "case", ["D06", "D07"], "deterministic"),
  task("C04", "Analisar qualidade do resultado", "case", ["C03"], "judgment"),
  task("C05", "Mapear dívida econômica", "case", ["D06"], "deterministic"),
  task("C06", "Analisar capital de giro", "case", ["D06"], "deterministic"),
  task("C07", "Normalizar projeções", "case", ["C03", "D06"], "deterministic"),
  task("C08", "Rodar cenários e estresses", "case", ["C03", "C05", "C07"], "deterministic"),
  task("C09", "Identificar riscos e mitigantes", "case", ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08"], "judgment"),
  task("C10", "Calcular capacidade", "case", ["C05", "C08", "C09"], "deterministic"),
  task("C11", "Compilar tese de estruturação", "case", ["C09", "C10"], "judgment"),

  task("S01", "Comparar pedido e necessidade", "case", ["M02", "C06", "C10"], "deterministic"),
  task("S02", "Gerar universo de instrumentos", "case", ["M04", "C10"], "deterministic"),
  task("S03", "Aplicar filtros jurídicos, jurisdicionais e econômicos", "case", ["S02"], "deterministic"),
  task("S04", "Mapear garantias e haircuts", "case", ["D06", "C09"], "deterministic"),
  task("S05", "Desenhar alternativas", "case", ["S01", "S03", "S04"], "judgment"),
  task("S06", "Pesquisar preço e termos comparáveis", "knowledge", ["S05"], "research", "none"),
  task("S07", "Calcular custo total", "case", ["S05", "S06"], "deterministic"),
  task("S08", "Definir covenants e proteções", "case", ["C08", "S05"], "judgment"),
  task("S09", "Fechar sources and uses", "case", ["S05"], "deterministic"),
  task("S10", "Comparar alternativas", "case", ["S07", "S08", "S09"], "deterministic"),
  task("S11", "Recomendar estrutura-alvo", "case", ["S10", "C11"], "judgment"),
  task("S12", "Compilar term sheet indicativo", "case", ["S11"], "compilation"),

  task("K01", "Atualizar universo de financiadores", "market", ["M01"], "research", "commit"),
  task("K02", "Normalizar mandatos", "market", ["K01"], "deterministic", "commit"),
  task("K03", "Atualizar relações e recência", "market", ["K01"], "deterministic", "commit"),
  task("K04", "Pesquisar transações comparáveis", "market", ["M01", "M04"], "research", "commit"),
  task("K05", "Aplicar filtros duros", "market", ["S11", "K02"], "deterministic"),
  task("K06", "Calcular fit explicável", "market", ["K03", "K04", "K05"], "deterministic"),
  task("K07", "Gerar racional por financiador", "market", ["K06"], "judgment"),
  task("K08", "Detectar lacunas de cobertura", "market", ["K06"], "deterministic"),
  task("K09", "Construir ondas de introdução", "market", ["K06", "K07"], "deterministic"),
  task("K10", "Definir pacote e divulgação", "market", ["K09"], "deterministic"),

  task("A01", "Definir narrativa", "case", ["C11", "S11"], "judgment"),
  task("A02", "Montar evidence pack", "case", ["A01"], "deterministic"),
  task("A03", "Compilar teaser", "case", ["A01", "A02"], "compilation", "commit"),
  task("A04", "Compilar lender memo", "case", ["A01", "A02"], "compilation", "commit"),
  task("A05", "Compilar modelo financeiro", "case", ["C03", "C07", "C08", "S09"], "compilation", "commit"),
  task("A06", "Compilar term sheet indicativo", "case", ["S12"], "compilation", "commit"),
  task("A07", "Compilar Q&A inicial", "case", ["D09", "C09"], "compilation", "commit"),
  task("A08", "Compilar índice da sala", "case", ["D01", "K10"], "compilation", "commit"),
  task("A09", "Gerar variantes por audiência e idioma", "case", ["K10", "A03", "A04"], "compilation", "commit"),
  task("A10", "Rodar consistency gate", "case", ["A03", "A04", "A05", "A06", "A07", "A08", "A09"], "deterministic"),
  task("A11", "Renderizar e inspecionar", "case", ["A10"], "compilation", "commit"),

  task("X01", "Verificar autorização de introdução", "market", ["K09", "A11"], "deterministic", "commit"),
  task("X02", "Montar pacote por destinatário", "market", ["X01", "K10"], "compilation", "commit"),
  task("X03", "Aplicar marca d'água e permissões", "market", ["X02"], "deterministic", "commit"),
  task("X04", "Executar introdução autorizada", "market", ["X03"], "action", "external"),
  task("X05", "Capturar sinais de resposta", "market", ["X04"], "deterministic", "commit"),
  task("X06", "Classificar perguntas recebidas", "market", ["X05"], "extraction", "commit"),
  task("X07", "Redigir resposta com evidências", "market", ["X06"], "judgment"),
  task("X08", "Atualizar disclosure autorizado", "market", ["X06", "X07"], "compilation", "commit"),
  task("X09", "Calcular próxima ação recomendada", "market", ["X05", "X06", "X07", "X08"], "deterministic"),
  task("X10", "Registrar sinal de proposta", "market", ["X05"], "extraction", "commit"),
  task("X11", "Registrar avanço em underwriting", "market", ["X05"], "extraction", "commit"),
  task("X12", "Registrar sinal de desembolso", "market", ["X05"], "extraction", "commit"),

  task("L01", "Classificar recusa ou avanço", "market", ["X05"], "deterministic", "commit"),
  task("L02", "Atualizar perfil do financiador", "market", ["L01"], "deterministic", "commit"),
  task("L03", "Medir qualidade do match", "market", ["K06", "L01"], "deterministic", "commit"),
  task("L04", "Medir qualidade dos materiais", "market", ["A11", "X05"], "deterministic", "commit"),
  task("L05", "Criar caso de regressão", "market", ["L01", "L04"], "compilation", "commit"),
  task("L06", "Rodar suite antes de release", "knowledge", ["L05"], "deterministic", "none"),
] as const satisfies readonly OffroadTaskSpec[];

export function validateOffroadTaskRegistry(registry: readonly OffroadTaskSpec[] = offroadTaskRegistry): void {
  const byId = new Map(registry.map((spec) => [spec.id, spec]));
  if (byId.size !== registry.length) throw new Error("duplicate TaskSpec id");
  for (const spec of registry) {
    for (const dependency of spec.dependencies) {
      if (!byId.has(dependency)) throw new Error(`${spec.id} depends on unknown TaskSpec ${dependency}`);
    }
    if (spec.effect === "external" && spec.graph !== "market") {
      throw new Error(`${spec.id} performs an external effect outside the Market Graph`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`TaskSpec cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependencies ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const spec of registry) visit(spec.id);
}

validateOffroadTaskRegistry();
