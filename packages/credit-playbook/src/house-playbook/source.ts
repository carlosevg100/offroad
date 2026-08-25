import {createHash} from "node:crypto";
import {z} from "zod";

import type {ProcedureAuthority, ProcedureRole} from "../procedure-contract";
import {procedureAuthoritySchema} from "../procedure-contract";

export const housePlaybookSourceVersion = "2026.08.25-v2";
export const housePlaybookSourcePath = "packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md";
/** Generated fingerprint of the canonical markdown snapshot. Tests fail if the source changes without a versioned update. */
export const housePlaybookSourceHash = "fa985fe9c8ffc5e3d0853a112dde34904d86b0daad0c8fd540705f17c69f9fb6";

export const houseModuleIdSchema = z.enum(["M0", "M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10"]);
export type HouseModuleId = z.infer<typeof houseModuleIdSchema>;

export const houseAuthoritySchema = procedureAuthoritySchema;
export type HouseAuthority = ProcedureAuthority;

export const houseEntryKindSchema = z.enum([
  "workflow",
  "analysis_method",
  "calculation",
  "decision_rule",
  "sector_lens",
  "structuring_method",
  "market_reference",
  "template_fragment",
  "buyer_lens",
  "mandate_data",
  "distribution_workflow",
  "post_introduction_reference",
  "red_flag",
  "conduct_policy",
]);
export type HouseEntryKind = z.infer<typeof houseEntryKindSchema>;

export const houseEntryScopeSchema = z.enum([
  "current_product",
  "qualified_introduction_boundary",
  "post_introduction_reference",
]);
export type HouseEntryScope = z.infer<typeof houseEntryScopeSchema>;

export const houseProcedureSourceSchema = z.object({
  id: z.string().regex(/^(IN|EMP|Q|D|OP|ES|PR|MA|MK|RF|LC)-\d{2}$/),
  module: houseModuleIdSchema,
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
  sourceLine: z.number().int().positive(),
  kind: houseEntryKindSchema,
  scope: houseEntryScopeSchema,
  authorities: z.array(houseAuthoritySchema),
  references: z.array(z.string().regex(/^(IN|EMP|Q|D|OP|ES|PR|MA|MK|RF|LC)-\d{2}$/)),
  referenceDataCandidates: z.array(z.string().trim().min(1)),
  legalReviewRequired: z.boolean(),
  marketReferenceDataRequired: z.boolean(),
  /** Source entries are knowledge to expand, never executable skills by themselves. */
  readyToCompile: z.literal(false),
}).strict();
export type HouseProcedureSource = z.infer<typeof houseProcedureSourceSchema>;

export type HouseModuleDefinition = {
  id: HouseModuleId;
  prefix: string;
  title: string;
  expectedProcedures: number;
  roles: ProcedureRole[];
  blueprintStages: number[];
  promotionPriority: "critical" | "high" | "medium";
  criticalRepairs: string[];
  requiredGoldCases: string[];
};

export const houseModuleDefinitions: readonly HouseModuleDefinition[] = [
  {
    id: "M0", prefix: "IN", title: "Intake e pedido de informação", expectedProcedures: 26,
    roles: ["intake_evidence"], blueprintStages: [1, 2, 3, 5, 6], promotionPriority: "critical",
    criticalRepairs: [
      "Transformar listas e políticas em estado, evento, prioridade, substitutos e saída estruturada.",
      "Separar dado obtido automaticamente, dado derivado e pergunta ao cliente.",
      "Definir contrato da lista mínimo, alvo, ideal, diligência e closing por arquétipo.",
      "Substituir qualquer bloqueio genérico por impacto e próxima melhor solicitação.",
    ],
    requiredGoldCases: ["sala limpa", "sala desorganizada", "grupo multi-entidade", "assessor multi-cliente", "pedido de liquidez disfarçado"],
  },
  {
    id: "M1", prefix: "EMP", title: "Empresa e setor", expectedProcedures: 30,
    roles: ["financial_analysis"], blueprintStages: [6, 7], promotionPriority: "high",
    criticalRepairs: [
      "Dar a cada lente fontes, métricas, comparáveis, perguntas internas, sinais de quebra e produto downstream.",
      "Separar fato setorial, observação de mercado e julgamento Offroad.",
      "Versionar métricas setoriais e remover equivalências absolutas baseadas apenas em concentração.",
    ],
    requiredGoldCases: ["agro", "varejo", "indústria", "software recorrente", "saúde", "energia", "incorporação", "logística"],
  },
  {
    id: "M2", prefix: "Q", title: "Qualidade dos números e spreading", expectedProcedures: 18,
    roles: ["financial_analysis", "independent_quality_control"], blueprintStages: [4, 5, 7], promotionPriority: "critical",
    criticalRepairs: [
      "Especificar fórmulas, sinais, unidade, moeda, escala, período, perímetro e tratamento de ausência para cada cálculo.",
      "Definir pontes completas para EBITDA, CFADS, capital de giro, capex, caixa e demonstrações projetadas.",
      "Separar contabilidade reportada, reclassificação, ajuste da mesa e cenário.",
      "Criar identidades determinísticas e tolerâncias como referência versionada, nunca como texto solto.",
    ],
    requiredGoldCases: ["auditado limpo", "gerencial conflitante", "sazonal", "multi-moeda", "multi-entidade", "receita por POC", "ajustes de EBITDA rejeitados"],
  },
  {
    id: "M3", prefix: "D", title: "Foto real da dívida", expectedProcedures: 31,
    roles: ["financial_analysis", "independent_quality_control"], blueprintStages: [4, 5, 7, 8], promotionPriority: "critical",
    criticalRepairs: [
      "Trocar uma única dívida ajustada por visões reconciliadas: financeira, covenant, caixa, contingente e por comprador.",
      "Não somar automaticamente provisões, risco retido ou arrendamentos sem convenção e racional explícitos.",
      "Expandir a identidade da despesa financeira para juros, fees, variação cambial, derivativos e capitalização.",
      "Mover tolerâncias, paredes de vencimento e choques de CDI para políticas versionadas.",
    ],
    requiredGoldCases: ["risco sacado oculto", "cessão com recompra", "FIDC com retenção subordinada", "IFRS 16", "cross-default", "holding e opco", "dívida incompleta"],
  },
  {
    id: "M4", prefix: "OP", title: "Operação e sources and uses", expectedProcedures: 14,
    roles: ["credit_structuring", "financial_analysis"], blueprintStages: [7, 8], promotionPriority: "critical",
    criticalRepairs: [
      "Fechar sources and uses por entidade, moeda, data, tranche e fonte documental.",
      "Modelar capital de giro incremental, custos, colchão e contingência sem inflar o pedido.",
      "Definir gates objetivos para esperar, redimensionar, dividir em tranches ou recusar o desenho.",
    ],
    requiredGoldCases: ["capex com giro omitido", "pedido acima da capacidade", "uso misto", "ponte e take-out", "desembolso por marco"],
  },
  {
    id: "M5", prefix: "ES", title: "Estruturação", expectedProcedures: 45,
    roles: ["credit_structuring", "independent_quality_control"], blueprintStages: [8, 9], promotionPriority: "critical",
    criticalRepairs: [
      "Transformar cada alternativa em mecânica, pré-condições, cálculos, riscos de execução e termos indicativos rastreáveis.",
      "Separar análise econômica de confirmação jurídica, registral e tributária.",
      "Versionar bandas, haircuts, headroom, prazos e thresholds com fonte, data, dono e validade.",
      "Formalizar definições de dívida, EBITDA, caixa, DSCR, LTV e elegibilidade antes de qualquer covenant.",
    ],
    requiredGoldCases: ["cessão com trava", "imóvel operacional", "estoque", "equipamentos", "conta reserva", "subordinação estrutural", "intercreditor", "estrutura que não fecha"],
  },
  {
    id: "M6", prefix: "PR", title: "Pricing e referências", expectedProcedures: 13,
    roles: ["credit_structuring", "market_distribution"], blueprintStages: [8, 10], promotionPriority: "high",
    criticalRepairs: [
      "Definir comparabilidade, normalização de indexador, recência, liquidez, tamanho e pacote de garantia.",
      "Recusar banda quando amostra, qualidade ou validade forem insuficientes.",
      "Separar dado público, sondagem proprietária, indicação e termo efetivamente fechado.",
    ],
    requiredGoldCases: ["comp comparável", "comp enganoso", "mercado sem observação recente", "choque de regime", "all-in com custos"],
  },
  {
    id: "M7", prefix: "MA", title: "Materiais institucionais", expectedProcedures: 32,
    roles: ["institutional_materials", "independent_quality_control"], blueprintStages: [9, 11], promotionPriority: "critical",
    criticalRepairs: [
      "Fazer cada seção consumir schemas governados, sem prosa livre ou número reintroduzido manualmente.",
      "Fechar templates com campo, origem, regra editorial, estado de ausência e bloqueio por claim.",
      "Tratar revisão de liberação como QC de material, nunca como parecer ou aprovação de crédito.",
      "Definir anonimização, PT e EN, fingerprints e portões de divulgação com testes automatizados.",
    ],
    requiredGoldCases: ["teaser anonimizado", "memo completo", "term sheet indicativo", "data room", "modelo financeiro", "pacote PT e EN", "material com divergência bloqueada"],
  },
  {
    id: "M8", prefix: "MK", title: "Mercado e distribuição", expectedProcedures: 28,
    roles: ["market_distribution"], blueprintStages: [10, 11, 12], promotionPriority: "high",
    criticalRepairs: [
      "Separar instituição, veículo, mandato, contato e observação de apetite.",
      "Distinguir filtros duros, ranking explicável, dado expirado e dado ainda não confirmado.",
      "Parar a execução da plataforma em introdução qualificada; book, alocação, negociação e fechamento ficam como referência pós-introdução.",
      "Não tratar FIDC, securitizadora, banco, instrumento e direito creditório como a mesma dimensão taxonômica.",
    ],
    requiredGoldCases: ["mandato aderente", "mandato expirado", "filtro duro", "contato incorreto", "recusa estruturada", "introdução autorizada"],
  },
  {
    id: "M9", prefix: "RF", title: "Red flags e declínio", expectedProcedures: 20,
    roles: ["financial_analysis", "independent_quality_control"], blueprintStages: [5, 6, 7, 8, 11], promotionPriority: "high",
    criticalRepairs: [
      "Converter cada flag em detector, evidência mínima, severidade, falso positivo, tratamento e impacto downstream.",
      "Separar achado, julgamento de apresentabilidade e decisão humana de aceitar ou declinar mandato.",
      "Criar caminho de volta explícito sem produzir parecer positivo ou negativo de crédito.",
    ],
    requiredGoldCases: ["flag isolada explicada", "flags compostas", "falso positivo", "integridade", "declínio com caminho de volta"],
  },
  {
    id: "M10", prefix: "LC", title: "Linguagem e conduta", expectedProcedures: 13,
    roles: ["independent_quality_control", "institutional_materials", "market_distribution"], blueprintStages: [1, 5, 9, 10, 11, 12], promotionPriority: "critical",
    criticalRepairs: [
      "Compilar as regras como validadores determinísticos para materiais e comunicações registradas.",
      "Definir taxonomia de claim, vocabulário permitido, conflito, confidencialidade e equivalência PT e EN.",
      "Registrar surpresa de diligência como finding ligado ao procedimento responsável.",
    ],
    requiredGoldCases: ["claim sem fonte", "adjetivo sem número", "promessa de funding", "vazamento entre casos", "conflito", "divergência PT e EN"],
  },
] as const;

const moduleByPrefix = new Map(houseModuleDefinitions.map((module) => [module.prefix, module]));

export function parseHousePlaybook(markdown: string) {
  const heading = /^### ((?:IN|EMP|Q|D|OP|ES|PR|MA|MK|RF|LC)-\d{2}) · ([^\n]+)/gm;
  const matches = [...markdown.matchAll(heading)];
  const procedures = matches.map((match, index) => {
    const id = match[1];
    const title = match[2];
    if (!id || !title) throw new Error(`invalid House Playbook heading at match ${index + 1}`);
    const prefix = id.slice(0, id.indexOf("-"));
    const module = moduleByPrefix.get(prefix);
    if (!module) throw new Error(`unknown module prefix for ${id}`);
    const bodyStart = (match.index ?? 0) + match[0].length;
    const nextStart = matches[index + 1]?.index ?? markdown.length;
    let body = markdown.slice(bodyStart, nextStart);
    const nextSection = body.search(/^#{1,2} /m);
    if (nextSection >= 0) body = body.slice(0, nextSection);
    body = body.trim().replace(/\n---+\s*$/u, "").trim();
    const sourceText = `${title}\n${body}`;
    const authorities = extractAuthorities(sourceText);
    const referenceDataCandidates = extractReferenceDataCandidates(sourceText);
    const references = [...new Set([...sourceText.matchAll(/\b(?:IN|EMP|Q|D|OP|ES|PR|MA|MK|RF|LC)-\d{2}\b/g)]
      .map((reference) => reference[0])
      .filter((reference) => reference !== id))];
    return houseProcedureSourceSchema.parse({
      id,
      module: module.id,
      title: title.trim(),
      body,
      sourceLine: lineNumber(markdown, match.index ?? 0),
      kind: classifyKind(id),
      scope: classifyScope(id),
      authorities,
      references,
      referenceDataCandidates,
      legalReviewRequired: authorities.includes("LEI"),
      marketReferenceDataRequired: authorities.includes("MERCADO") || referenceDataCandidates.length > 0 || /versionad[oa]|valid_until|com data|vigência/iu.test(body),
      readyToCompile: false,
    });
  });
  validateSequence(procedures);
  const ids = new Set(procedures.map((procedure) => procedure.id));
  const danglingReferences = procedures.flatMap((procedure) => procedure.references
    .filter((reference) => !ids.has(reference))
    .map((reference) => ({procedureId: procedure.id, reference})));
  if (danglingReferences.length > 0) throw new Error(`dangling house procedure references: ${JSON.stringify(danglingReferences)}`);
  return {
    version: housePlaybookSourceVersion,
    sourceHash: createHash("sha256").update(markdown).digest("hex"),
    procedures,
    modules: houseModuleDefinitions.map((module) => ({
      ...module,
      actualProcedures: procedures.filter((procedure) => procedure.module === module.id).length,
    })),
  };
}

function extractReferenceDataCandidates(body: string): string[] {
  const expressions = [
    /\b(?:acima|abaixo|mais|menos) de \d+(?:[.,]\d+)?%/giu,
    /\b\d+(?:[.,]\d+)?x\b/giu,
    /\+\s*\d+\s*bps\b/giu,
    /\btolerância[^.;\n]*/giu,
    /\breferência da casa[^.;\n]*/giu,
    /\bvalidade da casa[^.;\n]*/giu,
  ];
  return [...new Set(expressions.flatMap((expression) => [...body.matchAll(expression)].map((match) => match[0].trim())))];
}

function extractAuthorities(body: string): HouseAuthority[] {
  const found = new Set<HouseAuthority>();
  for (const authority of houseAuthoritySchema.options) {
    if (new RegExp(`\\b${authority}\\b`, "u").test(body)) found.add(authority);
  }
  return [...found];
}

function classifyKind(id: string): HouseEntryKind {
  const [prefix, numberText] = id.split("-");
  const number = Number(numberText);
  if (prefix === "IN") return "workflow";
  if (prefix === "EMP") return number >= 21 ? "sector_lens" : "analysis_method";
  if (prefix === "Q") return "calculation";
  if (prefix === "D") return number === 31 ? "template_fragment" : number >= 24 ? "calculation" : "analysis_method";
  if (prefix === "OP") return number === 5 || number === 12 || number === 14 ? "decision_rule" : "calculation";
  if (prefix === "ES") return "structuring_method";
  if (prefix === "PR") return "market_reference";
  if (prefix === "MA") return number >= 28 ? "decision_rule" : "template_fragment";
  if (prefix === "MK") {
    if (number <= 10) return "buyer_lens";
    if (number <= 14) return "mandate_data";
    if (number <= 18) return "distribution_workflow";
    return "post_introduction_reference";
  }
  if (prefix === "RF") return number >= 18 ? "decision_rule" : "red_flag";
  return "conduct_policy";
}

function classifyScope(id: string): HouseEntryScope {
  const [prefix, numberText] = id.split("-");
  const number = Number(numberText);
  if (prefix !== "MK") return "current_product";
  if (number <= 18) return number >= 15 ? "qualified_introduction_boundary" : "current_product";
  return "post_introduction_reference";
}

function validateSequence(procedures: readonly HouseProcedureSource[]) {
  const duplicate = procedures.find((procedure, index) => procedures.findIndex((candidate) => candidate.id === procedure.id) !== index);
  if (duplicate) throw new Error(`duplicate house procedure ${duplicate.id}`);
  for (const module of houseModuleDefinitions) {
    const actual = procedures.filter((procedure) => procedure.module === module.id);
    if (actual.length !== module.expectedProcedures) {
      throw new Error(`${module.id} expected ${module.expectedProcedures} procedures, received ${actual.length}`);
    }
    actual.forEach((procedure, index) => {
      const expected = `${module.prefix}-${String(index + 1).padStart(2, "0")}`;
      if (procedure.id !== expected) throw new Error(`${module.id} expected ${expected}, received ${procedure.id}`);
    });
  }
}

function lineNumber(markdown: string, index: number): number {
  return markdown.slice(0, index).split("\n").length;
}
