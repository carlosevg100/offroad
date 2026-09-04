import {primaryWorkSchema, workResponsibilitySchema, type NamedComposition, type PrimaryWork, type WorkResponsibility} from "@offroad/agent-contracts";
import {z} from "zod";

/**
 * Gold turns for the shadow router. Each is a real opening or follow-up from the five Phase 0
 * cases, with what a careful desk would read into it. The classifier runs in shadow against
 * these before it is allowed to route anything; the bar is composite intent, correction and
 * abstention, not a single label.
 */
export const intentGoldTurnSchema = z.object({
  id: z.string().regex(/^gc0[1-5]-t[0-9]{2}$/),
  caseId: z.enum(["gc01", "gc02", "gc03", "gc04", "gc05"]),
  locale: z.enum(["pt-BR", "en-US"]),
  message: z.string().min(10),
  priorTurns: z.array(z.string()).max(6).default([]),
  expected: z.object({
    primaryWorks: z.array(primaryWorkSchema).min(1).max(3),
    workResponsibility: z.array(workResponsibilitySchema).min(1),
    depth: z.enum(["point", "preliminary", "institutional"]),
    continuity: z.enum(["new", "refresh", "monitor", "comparison", "resume"]),
    composition: z.string().nullable(),
    abstain: z.boolean(),
    /** The one thing a careful desk would still need to know. Null when the turn stands alone. */
    firstQuestionTheme: z.string().nullable(),
  }),
});
export type IntentGoldTurn = z.infer<typeof intentGoldTurnSchema>;

const turn = (input: Omit<IntentGoldTurn, "priorTurns" | "locale"> & {priorTurns?: string[]; locale?: "pt-BR" | "en-US"}): IntentGoldTurn =>
  intentGoldTurnSchema.parse({locale: "pt-BR", priorTurns: [], ...input});

export const intentGoldTurns: readonly IntentGoldTurn[] = [
  turn({
    id: "gc01-t01", caseId: "gc01",
    message: "Sou analista no time de Investment Banking. Meu VP me pediu para preparar material para uma reunião com a Camil na segunda. Ele falou em refinanciamento, mas não disse que tese quer levar nem que formato espera.",
    expected: {primaryWorks: ["understand", "capital_strategy"], workResponsibility: ["producer"], depth: "preliminary", continuity: "new", composition: "prepare_meeting", abstain: false, firstQuestionTheme: "ângulo e formato que o VP espera"},
  }),
  turn({
    id: "gc01-t02", caseId: "gc01",
    priorTurns: ["Meu VP me pediu material para uma reunião com a Camil sobre refinanciamento."],
    message: "Meu VP quer três páginas de pitch: situação atual, alternativas e impacto nos indicadores.",
    expected: {primaryWorks: ["capital_strategy"], workResponsibility: ["producer"], depth: "institutional", continuity: "resume", composition: "prepare_material", abstain: false, firstQuestionTheme: "se o material vai direto à companhia ou passa por revisão interna"},
  }),
  turn({
    id: "gc01-t03", caseId: "gc01",
    priorTurns: ["Preparando material de refinanciamento da Camil para o VP."],
    message: "De onde saiu essa alavancagem de 4,7x?",
    expected: {primaryWorks: ["extract_and_reconcile"], workResponsibility: ["producer"], depth: "point", continuity: "resume", composition: "answer_a_question", abstain: false, firstQuestionTheme: null},
  }),
  turn({
    id: "gc02-t01", caseId: "gc02",
    message: "Sou CFO da Camil. O conselho quer discutir se nossa estrutura de capital está adequada para os próximos anos. Quero chegar com uma leitura independente e alternativas.",
    expected: {primaryWorks: ["capital_strategy", "analyze", "model"], workResponsibility: ["decision_maker", "sponsor"], depth: "institutional", continuity: "new", composition: "prepare_decision", abstain: false, firstQuestionTheme: "data do conselho e se há orçamento e plano de capex para enviar"},
  }),
  turn({
    id: "gc02-t02", caseId: "gc02",
    priorTurns: ["CFO da Camil preparando discussão de conselho sobre estrutura de capital."],
    message: "Revise isso como um conselheiro cético.",
    expected: {primaryWorks: ["analyze"], workResponsibility: ["reviewer"], depth: "institutional", continuity: "resume", composition: "review_work", abstain: false, firstQuestionTheme: null},
  }),
  turn({
    id: "gc03-t01", caseId: "gc03",
    message: "Sou assessor de uma distribuidora, a Aurora. Eles querem captar para um centro de distribuição e têm uma carteira boa de recebíveis. Segue o que consegui juntar. Preciso saber se dá para estruturar em cima dos recebíveis e como.",
    expected: {primaryWorks: ["extract_and_reconcile", "capital_strategy", "analyze"], workResponsibility: ["producer", "coordinator"], depth: "institutional", continuity: "new", composition: "design_indicative_structure", abstain: false, firstQuestionTheme: "tape e aging dos recebíveis"},
  }),
  turn({
    id: "gc03-t02", caseId: "gc03",
    priorTurns: ["Assessor estruturando captação da Aurora com recebíveis."],
    message: "Já manda para os fundos que você achar aderentes.",
    expected: {primaryWorks: ["capital_match"], workResponsibility: ["producer"], depth: "institutional", continuity: "resume", composition: "introduce", abstain: false, firstQuestionTheme: "autorização por destinatário e estrutura escolhida"},
  }),
  turn({
    id: "gc04-t01", caseId: "gc04",
    message: "Sou analista de investimentos na Prisma. Recebemos esta proposta de debêntures da Cogna com o release do trimestre. Meu PM quer saber se vale gastar tempo nisso.",
    expected: {primaryWorks: ["analyze", "read_documents"], workResponsibility: ["producer", "reviewer"], depth: "preliminary", continuity: "new", composition: "evaluate_received_opportunity", abstain: false, firstQuestionTheme: "mandato aplicável do fundo"},
  }),
  turn({
    id: "gc04-t02", caseId: "gc04",
    priorTurns: ["Analista da Prisma avaliando proposta de debêntures da Cogna."],
    message: "Por que a alavancagem da proposta é menor que a sua?",
    expected: {primaryWorks: ["extract_and_reconcile"], workResponsibility: ["producer"], depth: "point", continuity: "resume", composition: "answer_a_question", abstain: false, firstQuestionTheme: null},
  }),
  turn({
    id: "gc05-t01", caseId: "gc05",
    message: "Sou banker de corporate banking. A Camil anunciou uma expansão e quero levar ideias de como financiar isso dentro da capacidade deles. Tenho reunião com o CFO e a tesouraria.",
    expected: {primaryWorks: ["capital_strategy", "understand", "model"], workResponsibility: ["producer", "decision_maker"], depth: "preliminary", continuity: "new", composition: "prepare_meeting", abstain: false, firstQuestionTheme: "tamanho e cronograma da expansão, se não forem públicos"},
  }),
  turn({
    id: "gc05-t02", caseId: "gc05",
    priorTurns: ["Banker analisando alternativas para financiar a expansão da Camil."],
    message: "Gostei das ideias, principalmente da extensão com troca de indexador. Vamos preparar o material para a reunião.",
    expected: {primaryWorks: ["capital_strategy"], workResponsibility: ["producer", "decision_maker"], depth: "institutional", continuity: "resume", composition: "prepare_material", abstain: false, firstQuestionTheme: "se o material vai direto à companhia ou passa por revisão interna"},
  }),
  turn({
    id: "gc05-t03", caseId: "gc05",
    priorTurns: ["Material de expansão da Camil produzido com cenário-base e dois cenários de estrutura."],
    message: "Ajusta o cenário para CDI de 12% e prazo de sete anos.",
    expected: {primaryWorks: ["model"], workResponsibility: ["producer"], depth: "institutional", continuity: "refresh", composition: "build_or_review_model", abstain: false, firstQuestionTheme: null},
  }),
  turn({
    id: "gc05-t04", caseId: "gc05",
    message: "oi, dá uma olhada nisso aí pra mim",
    expected: {primaryWorks: ["understand"], workResponsibility: ["producer"], depth: "point", continuity: "new", composition: null, abstain: true, firstQuestionTheme: "o que é 'isso' e qual resultado a pessoa espera"},
  }),
  turn({
    id: "gc01-t04", caseId: "gc01",
    message: "Levanta tudo que saiu sobre a Camil desde o último resultado: fatos relevantes, apresentações, notícias. Só organiza, ainda não quero análise.",
    expected: {primaryWorks: ["find_and_organize"], workResponsibility: ["producer"], depth: "preliminary", continuity: "new", composition: "find_and_organize_information", abstain: false, firstQuestionTheme: null},
  }),
  turn({
    id: "gc05-t05", caseId: "gc05",
    priorTurns: ["Banker analisando alternativas para financiar a expansão da Camil."],
    message: "Como estão saindo as debêntures de alimentos nos últimos meses? Prazo, indexador e spread.",
    expected: {primaryWorks: ["market"], workResponsibility: ["producer"], depth: "preliminary", continuity: "resume", composition: "map_market_and_precedents", abstain: false, firstQuestionTheme: null},
  }),
  turn({
    id: "gc02-t03", caseId: "gc02",
    priorTurns: ["CFO da Camil preparando discussão de conselho sobre estrutura de capital."],
    message: "Esquece o conselho por enquanto. Preciso entender se o headroom do covenant aguenta a safra.",
    expected: {primaryWorks: ["analyze", "model"], workResponsibility: ["decision_maker"], depth: "preliminary", continuity: "new", composition: "analyze_performance_and_credit", abstain: false, firstQuestionTheme: null},
  }),
];

/** Every primary work and every responsibility appears at least once, so the gold cannot be passed by a constant. */
export function intentGoldCoverage(): {works: PrimaryWork[]; responsibilities: WorkResponsibility[]; compositions: Array<NamedComposition | string>} {
  return {
    works: [...new Set(intentGoldTurns.flatMap((entry) => entry.expected.primaryWorks))],
    responsibilities: [...new Set(intentGoldTurns.flatMap((entry) => entry.expected.workResponsibility))],
    compositions: [...new Set(intentGoldTurns.map((entry) => entry.expected.composition).filter((value): value is string => value !== null))],
  };
}
