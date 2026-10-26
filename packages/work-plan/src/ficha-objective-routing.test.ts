import {describe, expect, it} from "vitest";
import {compileAdvisorStartingPlan} from "./advisor-starting-plan";
import {inferCapitalProjectJob} from "./job-inference";
import {compileObjectiveToPlan, objectiveToPlanDecisionSchema} from "./objective-plan";

// Canonical paraphrases from outputs/fichas-ensaio-2026-10/{C02,C03,C04,C32}/corpo.html.
// These IDs belong to the fichas, not to the historical coverage catalogue or TaskSpecs.
const fichas = [
  {id: "C02", kind: "proposal_comparison", messages: [
    "Recebemos propostas do Itaú, do Santander e de um fundo para os R$ 70 milhões. Qual eu fico?",
    "Chegaram três term sheets. Qual é a melhor?",
    "O Itaú está mais barato, né? Posso fechar com ele?",
    "Qual dessas ofertas sai mais barata de verdade?",
    "Compare essas três propostas, mas não me diga qual escolher ainda.",
  ]},
  {id: "C03", kind: "relative_debt_cost", messages: [
    "Tenho conselho na quarta e vão me perguntar por que pagamos mais que a Serra Verde. Me ajuda a pensar a resposta.",
    "Por que pagamos mais caro que nossos concorrentes?",
    "A Serra Verde emitiu a CDI mais 1,35. A gente paga 2,6. Por quê?",
    "Explique por que nosso custo de dívida é maior que o dos pares.",
    "Prepara a resposta para o conselho sobre por que pagamos mais que a Serra Verde.",
  ]},
  {id: "C04", kind: "debt_capacity", messages: [
    "Queremos fazer uma segunda linha de produção de R$ 60 milhões em 2027 e 2028. Quanto de dívida a gente aguenta tomar para isso?",
    "Quanto de dívida cabe para o capex?",
    "Até quanto a gente pode se alavancar?",
    "O banco disse que cabem mais 80 milhões. Faz sentido?",
  ]},
  {id: "C10", kind: "debt_table", messages: [
    "Monta a tabela de dívida com tudo que temos.",
    "Extrai a dívida desses contratos e notas.",
    "Quanto a gente deve hoje, e pra quem?",
    "Preciso do endividamento atualizado para o conselho.",
  ]},
  {id: "C12", kind: "covenant_headroom", messages: [
    "Como estamos contra os covenants?",
    "Qual a folga do covenant da debênture em dezembro?",
    "A gente corre risco de estourar o covenant?",
    "Calcula o covenant na definição da escritura.",
  ]},
  {id: "C18", kind: "weekly_cash", messages: [
    "Como fica o caixa até dezembro e o que vence?",
    "A gente aguenta até o fim do ano?",
    "Quando é a semana mais apertada?",
    "Preciso sacar a conta garantida em dezembro?",
  ]},
  {id: "C24", kind: "operating_projection", messages: [
    "Não temos projeção pronta. Ajuda a construir uma para discutir o financiamento.",
    "Me ajuda a montar o business plan.",
    "Só me diz como começar uma projeção.",
    "Faz uma primeira versão com hipóteses explícitas.",
  ]},
  {id: "C26", kind: "projection_challenge", messages: [
    "Que premissas você questionaria nessa projeção?",
    "Esse plano está otimista?",
    "Revisa a projeção que vamos mandar para o banco, sem rodar nada novo.",
    "O que o banco vai contestar nesse business plan?",
  ]},
  {id: "C35", kind: "receivables_funding", messages: [
    "Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?",
    "Quero antecipar recebíveis em vez de pegar linha no banco.",
    "Quais FIDCs comprariam nossa carteira?",
    "Vale fazer um FIDC próprio?",
  ]},
  {id: "C54", kind: "quarter_update", messages: [
    "Fechou o trimestre. Atualiza tudo.",
    "Saiu o balancete de setembro, atualiza a projeção e o covenant.",
    "O que mudou com o resultado do terceiro trimestre?",
  ]},
  {id: "C32", kind: "capital_strategy", messages: [
    "Precisamos financiar a linha nova de embalagem e reduzir a pressão dos vencimentos dos próximos dois anos. Que caminhos fazem sentido?",
    "Vence muita coisa ano que vem e ainda quero fazer o investimento. O que eu faço?",
    "Como financio a expansão sem apertar o caixa?",
    "Quero alongar a dívida e fazer o capex. Por onde começo?",
    "Não quero recomendação ainda, só me mostre os caminhos para a dívida de 2027.",
  ]},
] as const;

import originMainRouting from "./routing-regression.origin-main.json";
import foldedProbes from "./routing-regression.folded-probes.origin-main.json";

describe("canonical ficha objective routing", () => {
  // Every routing test phrase of lotes 1 and 2 (all strings of the work-plan tests at origin/main), with and
  // without attachments, keeps the kind origin/main gave it: lote 3 never takes an existing route.
  it("keeps every lote 1 and lote 2 routing phrase on its origin/main kind", () => {
    const changed = (originMainRouting as {message: string; hasAttachments: boolean; kind: string}[])
      .filter((row) => compileObjectiveToPlan({message: row.message, hasAttachments: row.hasAttachments}).objectiveKind !== row.kind);
    expect(changed).toEqual([]);
  });
  // Each signal of the existing folded patterns (risk matrix, material, operation review, board, meeting, market,
  // company analysis, capital strategy) and explanation requests, joined to each lote 3 object, keeps the kind
  // origin/main gave it whenever origin/main gave it a route: lote 3 never takes a request another route owns.
  it("keeps every folded-pattern probe on its origin/main route", () => {
    const changed = (foldedProbes as {message: string; hasAttachments: boolean; kind: string}[])
      .filter((row) => row.kind !== "ambiguous" && row.kind !== "documents_to_case")
      .filter((row) => compileObjectiveToPlan({message: row.message, hasAttachments: row.hasAttachments}).objectiveKind !== row.kind);
    expect(changed).toEqual([]);
  });

  it.each([
    ["O que é caixa semanal?", "factual_question"],
    ["O que é uma tabela de dívida?", "factual_question"],
    ["Explique o conceito de folga de covenant.", "factual_question"],
    ["Compare as propostas considerando o caixa semanal.", "proposal_comparison"],
    ["Revise o contrato e o cronograma da dívida.", "operation_review"],
    ["Monte uma matriz de riscos com os covenants da escritura.", "risk_matrix"],
    ["Quero alongar a dívida; como fica o caixa até dezembro?", "capital_strategy"],
    ["Quanto de dívida cabe sem estourar o covenant?", "debt_capacity"],
    ["Como funciona uma tabela de dívida?", "factual_question"],
    ["Explique como funciona o caixa semanal.", "factual_question"],
    ["Monta a tabela de dívida para refinanciamento.", "debt_table"],
    ["Projete o caixa semanal considerando a proposta do banco.", "weekly_cash"],
    ["Calcula a folga do covenant antes de negociar o waiver.", "covenant_headroom"],
  ] as const)("lote 2 patterns leave other intents in place: %s", (message, kind) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(kind);
  });

  it.each([
    ["O que é um FIDC?", "factual_question"],
    ["O que é uma projeção por drivers?", "factual_question"],
    ["Explique como funciona a antecipação de recebíveis.", "factual_question"],
    ["Como funciona um fechamento trimestral?", "factual_question"],
    ["Monta um deck com a projeção para o banco.", "material_preparation"],
    ["Prepara o memorando do trimestre para o conselho.", "material_preparation"],
    ["Compare as propostas de antecipação de recebíveis.", "proposal_comparison"],
    ["Revise as minutas do contrato de cessão de recebíveis.", "operation_review"],
    ["Monte a matriz de risco da antecipação de recebíveis.", "risk_matrix"],
    ["Projete o caixa semanal considerando a antecipação da safra.", "weekly_cash"],
    ["Quanto de dívida cabe com a projeção nova?", "debt_capacity"],
    ["Monitore o fechamento do trimestre.", "monitoring"],
    ["Quero comparar alternativas de dívida com recebíveis para financiar a expansão.", "capital_strategy"],
    // Independent review, round 1: the requested object and action keep their routes.
    ["Monte a projeção de caixa semanal até dezembro", "weekly_cash"],
    ["Faça uma projeção do caixa semana a semana", "weekly_cash"],
    ["Elabore uma planilha de projeção operacional", "material_preparation"],
    ["Fechamos o trimestre; monte a tabela de dívida com os saldos atuais", "debt_table"],
    ["Chegou o balancete. Calcule a folga dos covenants na data de teste", "covenant_headroom"],
    ["Revise o plano de amortização da operação existente", "operation_review"],
    ["Revise o plano de pagamento do contrato", "operation_review"],
    ["Compare as propostas do Itaú e do Santander", "proposal_comparison"],
    ["Fechou o trimestre.", "ambiguous"],
    // Comparing inside a method's own work keeps that method.
    ["Construa a projeção por drivers, comparando-a ao orçamento da companhia", "operating_projection"],
    ["Compare o realizado contra o projetado e atualize as análises após o fechamento do trimestre", "quarter_update"],
    ["Compare as premissas do plano com a referência histórica e aponte quais são otimistas", "projection_challenge"],
    ["Fechamos o trimestre, atualiza o caixa e o covenant", "quarter_update"],
    ["Revise o plano de negócios que vai ao banco", "projection_challenge"],
    ["Esse plano financeiro está otimista?", "projection_challenge"],
    ["Monte a projeção do business plan com hipóteses explícitas", "operating_projection"],
    // Independent review, round 2.
    ["Atualize a tabela de dívida com o balancete do trimestre", "debt_table"],
    ["Refaça o cálculo da folga do covenant com o balancete do trimestre", "covenant_headroom"],
    ["Monte uma projeção do caixa até dezembro", "weekly_cash"],
    ["Revise o plano para amortizar a operação existente", "operation_review"],
    ["Prepare uma planilha para revisar a projeção operacional", "material_preparation"],
    ["Me explique o que é cessão de recebíveis", "factual_question"],
    ["Construa uma projeção por drivers e compare as alternativas de volume e preço", "operating_projection"],
    ["Compare os cenários de alta e de base da projeção do plano e diga quais premissas são otimistas", "projection_challenge"],
    // Independent review, round 3.
    ["Revise o plano de reestruturação da dívida existente", "capital_strategy"],
    ["Revise o plano para quitar a dívida existente", "capital_strategy"],
    ["Monte um mapa de riscos para a projeção operacional", "risk_matrix"],
    ["Revise a projeção financeira da planilha anexa", "projection_challenge"],
    ["Construa a projeção por drivers a partir do Excel enviado", "operating_projection"],
    ["Elabore uma planilha com a projeção por drivers", "material_preparation"],
  ] as const)("lote 3 patterns leave other intents in place: %s", (message, kind) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(kind);
  });

  // Independent review, round 4, and adversarial paraphrases (debt verbs, interrogatives, file roles): lote 3 is
  // chosen only on a positive request about the company's own projection, plan, receivables or close; anything
  // else keeps an existing route or stays ambiguous for the conversation to ask.
  it.each([
    ["Revise o plano para reduzir o endividamento", "capital_strategy", "capital_strategy"],
    ["Revise o plano para saldar a dívida existente", "capital_strategy", "capital_strategy"],
    ["Quais são as diferenças entre um FIDC próprio e uma linha do banco?", "factual_question", "factual_question"],
    ["Quais as diferenças de um FIDC próprio para a linha de banco?", "factual_question", "factual_question"],
    ["Revise a projeção operacional usando o Excel anexo", "projection_challenge", "projection_challenge"],
    ["Construa uma projeção operacional para entrega em Excel", "material_preparation", "material_preparation"],
    ["Revise o plano de quitação da dívida com os bancos", "capital_strategy", "capital_strategy"],
    ["Monte um plano para refinanciar a dívida de 2027", "capital_strategy", "capital_strategy"],
    ["Construa a projeção do alongamento da dívida", "capital_strategy", "capital_strategy"],
    ["Revise o plano de amortização antecipada", "ambiguous", "documents_to_case"],
    ["Faça um plano para renegociar com os credores", "ambiguous", "documents_to_case"],
    ["Revise o plano para liquidar o empréstimo do Bradesco", "ambiguous", "documents_to_case"],
    ["Monte a projeção para reduzir a alavancagem", "ambiguous", "documents_to_case"],
    ["Qual a diferença entre antecipar recebíveis e um FIDC?", "factual_question", "factual_question"],
    ["Como funciona a revisão de uma projeção pelo banco?", "factual_question", "factual_question"],
    ["Por que o banco contesta projeções otimistas?", "factual_question", "documents_to_case"],
    ["Vale a pena antecipar recebíveis em vez de pegar linha do banco?", "factual_question", "documents_to_case"],
    ["Quais FIDCs costumam comprar duplicatas do varejo?", "factual_question", "documents_to_case"],
    ["O que é um fechamento trimestral bem feito?", "factual_question", "factual_question"],
    ["Quanto um banco desconta numa projeção agressiva?", "factual_question", "documents_to_case"],
    ["Revise a projeção com base no modelo enviado", "projection_challenge", "projection_challenge"],
    ["Construa a projeção a partir do arquivo anexo", "operating_projection", "operating_projection"],
    ["Monte a projeção por drivers e exporte em Excel", "material_preparation", "material_preparation"],
    ["Revise o plano de negócios e gere um PDF", "material_preparation", "material_preparation"],
    ["Faça a primeira versão da projeção no formato da planilha do banco", "material_preparation", "material_preparation"],
    ["Questione as premissas do plano que está na planilha anexa", "projection_challenge", "projection_challenge"],
    ["Nossa projeção está otimista?", "projection_challenge", "projection_challenge"],
    ["Temos recebíveis de 40 milhões; dá para usar em vez da linha do banco?", "receivables_funding", "receivables_funding"],
  ] as const)("conservative lote 3 routing: %s", (message, plain, attached) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(plain);
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe(attached);
  });

  it("targets the task specs of each lote 3 objective", () => {
    const targets = (message: string) => compileObjectiveToPlan({message, hasAttachments: false}).targetTaskIds;
    expect(targets("Me ajuda a montar o business plan.")).toEqual(["C07"]);
    expect(targets("Esse plano está otimista?")).toEqual(["C07"]);
    expect(targets("Quero antecipar recebíveis em vez de pegar linha no banco.")).toEqual(["R01", "C06"]);
    expect(targets("Fechou o trimestre. Atualiza tudo.")).toEqual(["C07", "C08"]);
  });

  for (const ficha of fichas) for (const message of ficha.messages) {
    it.each([false, true])(`${ficha.id}: ${message} (attachments: %s)`, (hasAttachments) => {
      const plan = compileObjectiveToPlan({message, hasAttachments});
      expect(plan.objectiveKind).toBe(ficha.kind);
      const entry = compileAdvisorStartingPlan({message, hasAttachments, documentaryEnabled: true});
      expect(entry.plan.taskSpecs.map((task) => task.id)).not.toEqual(["Q01", "Q02", "Q03"]);
      expect(inferCapitalProjectJob({message, hasAttachments}).job).toBe(plan.entryJob);
      expect(plan.outputTerminal).not.toBe("preliminary_case");
      expect(plan.outputTerminal).not.toBe("board_decision_pack");
      expect(plan.taskGraph.tasks.every((task) => task.effect !== "external")).toBe(true);
      expect(objectiveToPlanDecisionSchema.safeParse(plan).success).toBe(true);
    });
  }

  it.each([
    "O que significa capacidade de dívida?",
    "Explique o conceito de custo relativo da dívida.",
    "Qual é a diferença entre CDI e IPCA?",
  ])("keeps conceptual questions bounded, with or without annexes: %s", (message) => {
    for (const hasAttachments of [false, true]) {
      expect(compileObjectiveToPlan({message, hasAttachments})).toMatchObject({
        objectiveKind: "factual_question", mode: "conversation", targetTaskIds: [],
      });
    }
  });

  it.each([
    "Só organize as propostas e os contratos na pasta, sem análise.",
    "Organize os documentos dos pares, sem analisar o custo da dívida.",
  ])("does not turn collection into analysis: %s", (message) => {
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe("information_organization");
  });

  it.each(fichas.slice(0, 3))("keeps the specific $id intent when a generic starter was selected", (ficha) => {
    const input = {message: ficha.messages[0], hasAttachments: true, explicitHint: "structure_from_documents" as const};
    expect(compileObjectiveToPlan(input).objectiveKind).toBe(ficha.kind);
    expect(inferCapitalProjectJob(input).job).toBe(compileObjectiveToPlan(input).entryJob);
  });

  it("does not bind user-facing ficha IDs to historical TaskSpecs with the same IDs", () => {
    const comparison = compileObjectiveToPlan({message: fichas[0].messages[0], hasAttachments: true});
    const relative = compileObjectiveToPlan({message: fichas[1].messages[0], hasAttachments: true});
    const capacity = compileObjectiveToPlan({message: fichas[2].messages[0], hasAttachments: true});
    expect(comparison.targetTaskIds).toEqual(["S10"]);
    expect(relative.targetTaskIds).toEqual(["C05", "K04"]);
    expect(capacity.targetTaskIds).toEqual(["C10"]);
    expect(new Set([comparison, relative, capacity].map((plan) => plan.structuralIdentity)).size).toBe(3);
  });
});
