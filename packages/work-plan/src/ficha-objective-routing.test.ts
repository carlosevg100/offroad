import {describe, expect, it} from "vitest";
import {compileAdvisorStartingPlan} from "./advisor-starting-plan";
import {inferCapitalProjectJob} from "./job-inference";
import {compileObjectiveToPlan, lote3FichaExceptions, lote4FichaExceptions, objectiveToPlanDecisionSchema} from "./objective-plan";

// Canonical paraphrases from outputs/fichas-ensaio-2026-10/{C02,C03,C04,C09,C32,C47}/corpo.html and the C01 procedure.
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
  {id: "C32", kind: "financing_paths", messages: [
    "Precisamos financiar a linha nova de embalagem e reduzir a pressão dos vencimentos dos próximos dois anos. Que caminhos fazem sentido?",
    "Vence muita coisa ano que vem e ainda quero fazer o investimento. O que eu faço?",
    "Como financio a expansão sem apertar o caixa?",
    "Quero alongar a dívida e fazer o capex. Por onde começo?",
    "Não quero recomendação ainda, só me mostre os caminhos para a dívida de 2027.",
  ]},
  {id: "C01", kind: "received_proposal", messages: [
    "O Itaú mandou proposta de CCB de R$ 30 milhões, três anos, CDI mais 2,1, com cessão fiduciária de recebíveis. É boa?",
    "Recebi uma proposta do Itaú, é boa?",
    "O banco mandou um term sheet. Vale a pena?",
    "Devo aceitar a proposta do Itaú?",
    "O gerente do Santander ofereceu uma linha de giro a CDI mais 1,8. O que você acha?",
  ]},
  {id: "C09", kind: "document_folder", messages: [
    "Joguei aqui a pasta do último ano. Organiza e me diz o que tem.",
    "Só organiza, não analisa ainda.",
    "O que tem nesses arquivos?",
    "Organiza o material para discutirmos a dívida.",
    "Subi tudo que o financeiro tinha. Dá uma olhada e me fala o que falta.",
  ]},
  {id: "C47", kind: "board_capital_discussion", messages: [
    "Conselho na quarta. Prepara a discussão de estrutura de capital.",
    "Faz uma página para o conselho com o plano de financiamento.",
    "Prepara a discussão de estrutura de capital para o conselho de quarta",
    "Monta o material do conselho sobre a estrutura de capital.",
    "Monta o deck do conselho com o plano de financiamento.",
  ]},
] as const;

import originMainRouting from "./routing-regression.origin-main.json";
import foldedProbes from "./routing-regression.folded-probes.origin-main.json";
import lote3MainRouting from "./routing-regression.lote3-main.json";
import lote4Probes from "./routing-regression.folded-probes.lote4.json";
import lote4VetoesMain from "./routing-regression.lote4-vetoes-main.json";
import {lote4AddressedRequests, lote4OwnIntroducedRequests, lote4VetoFamily} from "./lote4-veto-family";

describe("canonical ficha objective routing", () => {
  // The replays compile thousands of plans; on shared CI runners they exceed the default 5 s, so each has 60 s.
  // Every routing test phrase of lotes 1 and 2 (all strings of the work-plan tests at origin/main), with and
  // without attachments, keeps the kind origin/main gave it: lote 3 never takes an existing route.
  it("keeps every lote 1 and lote 2 routing phrase on its origin/main kind", () => {
    // Lote 4 takes only its enumerated ficha phrasings, the five C32 openings among them.
    const fold = (m: string) => m.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
    const changed = (originMainRouting as {message: string; hasAttachments: boolean; kind: string}[])
      .filter((row) => compileObjectiveToPlan({message: row.message, hasAttachments: row.hasAttachments}).objectiveKind !== row.kind)
      .filter((row) => !lote4FichaExceptions.some((e) => e.from === row.kind && e.pattern.test(fold(row.message))));
    expect(changed).toEqual([]);
  }, 60_000);
  // Each signal of the existing folded patterns (risk matrix, material, operation review, board, meeting, market,
  // company analysis, capital strategy) and explanation requests, joined to each lote 3 object, keeps the kind
  // origin/main gave it whenever origin/main gave it a route: lote 3 never takes a request another route owns.
  it("keeps every folded-pattern probe on its origin/main route", () => {
    const changed = (foldedProbes as {message: string; hasAttachments: boolean; kind: string}[])
      .filter((row) => row.kind !== "ambiguous" && row.kind !== "documents_to_case")
      .filter((row) => compileObjectiveToPlan({message: row.message, hasAttachments: row.hasAttachments}).objectiveKind !== row.kind);
    expect(changed).toEqual([]);
  }, 60_000);

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
    ["Compare as premissas do plano com a referência histórica e aponte quais são otimistas", "factual_question"],
    ["Fechamos o trimestre, atualiza o caixa e o covenant", "risk_matrix"],
    ["Revise o plano de negócios que vai ao banco", "projection_challenge"],
    ["Esse plano financeiro está otimista?", "factual_question"],
    ["Monte a projeção do business plan com hipóteses explícitas", "operating_projection"],
    // Independent review, round 2.
    ["Atualize a tabela de dívida com o balancete do trimestre", "debt_table"],
    ["Refaça o cálculo da folga do covenant com o balancete do trimestre", "covenant_headroom"],
    ["Monte uma projeção do caixa até dezembro", "weekly_cash"],
    ["Revise o plano para amortizar a operação existente", "operation_review"],
    ["Prepare uma planilha para revisar a projeção operacional", "material_preparation"],
    ["Me explique o que é cessão de recebíveis", "factual_question"],
    ["Construa uma projeção por drivers e compare as alternativas de volume e preço", "operating_projection"],
    ["Compare os cenários de alta e de base da projeção do plano e diga quais premissas são otimistas", "factual_question"],
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
    ["Quais são as diferenças entre um FIDC próprio e uma linha do banco?", "factual_question", "documents_to_case"],
    ["Quais as diferenças de um FIDC próprio para a linha de banco?", "factual_question", "documents_to_case"],
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
    // Round 7: an unqualified plan counts as the financial plan only when the message names the projection, revenue, EBITDA or margin.
    ["Questione as premissas do plano que está na planilha anexa", "ambiguous", "documents_to_case"],
    ["Questione as premissas do plano, principalmente receita e EBITDA", "projection_challenge", "projection_challenge"],
    ["Nossa projeção está otimista?", "factual_question", "projection_challenge"],
    ["Temos recebíveis de 40 milhões; dá para usar em vez da linha do banco?", "factual_question", "receivables_funding"],
  ] as const)("conservative lote 3 routing: %s", (message, plain, attached) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(plain);
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe(attached);
  });

  // By construction: lote 3 only upgrades a message the existing routes leave ambiguous or as documents to a
  // case. For both replays, every row origin/main routed to a specific kind keeps exactly that kind; the only
  // allowed departures are the enumerated ficha exceptions, listed here.
  it("never takes a specific existing route except the enumerated ficha phrasings", () => {
    const fold = (m: string) => m.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const rows = [...originMainRouting, ...foldedProbes] as {message: string; hasAttachments: boolean; kind: string}[];
    const departures = rows.filter((r) => r.kind !== "ambiguous" && r.kind !== "documents_to_case")
      .filter((r) => compileObjectiveToPlan({message: r.message, hasAttachments: r.hasAttachments}).objectiveKind !== r.kind);
    const allowed = departures.filter((r) => [...lote3FichaExceptions, ...lote4FichaExceptions].some((e) => e.from === r.kind && e.pattern.test(fold(r.message).replace(/\s+/g, " "))));
    expect(departures).toEqual(allowed);
    // Lote 4: only the five C32 openings, each with and without attachments, leave the route origin/main gives them.
    expect(departures.map((r) => [r.message, r.kind, compileObjectiveToPlan(r).objectiveKind]).sort()).toEqual(
      fichas.find((f) => f.id === "C32")!.messages.flatMap((m) => [[m, "capital_strategy", "financing_paths"], [m, "capital_strategy", "financing_paths"]]).sort());
  });
  // Lote 4 replays: every string of the work-plan tests at origin/main after lote 3 (those not already in the replay
  // above) and each folded-pattern signal of the probes joined to a lote 4 object, with and without attachments, keep
  // the kind origin/main gave them whenever it gave a specific one; only the enumerated lote 4 ficha phrasings may leave it.
  it("keeps every lote 3 routing phrase and every lote 4 probe on its origin/main route", () => {
    const fold = (m: string) => m.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
    const rows = [...lote3MainRouting, ...lote4Probes] as {message: string; hasAttachments: boolean; kind: string}[];
    const departures = rows.filter((r) => r.kind !== "ambiguous" && r.kind !== "documents_to_case")
      .filter((r) => compileObjectiveToPlan({message: r.message, hasAttachments: r.hasAttachments}).objectiveKind !== r.kind)
      .filter((r) => !lote4FichaExceptions.some((e) => e.from === r.kind && e.pattern.test(fold(r.message))));
    expect(departures).toEqual([]);
  }, 60_000);
  it.each([
    ["Precisamos financiar a linha nova de embalagem e reduzir a pressão dos vencimentos dos próximos dois anos. Que caminhos fazem sentido?", "capital_strategy", "financing_paths"],
    ["Vence muita coisa ano que vem e ainda quero fazer o investimento. O que eu faço?", "capital_strategy", "financing_paths"],
    ["Como financio a expansão sem apertar o caixa?", "capital_strategy", "financing_paths"],
    ["Quero alongar a dívida e fazer o capex. Por onde começo?", "capital_strategy", "financing_paths"],
    ["Não quero recomendação ainda, só me mostre os caminhos para a dívida de 2027.", "capital_strategy", "financing_paths"],
    ["O que tem nesses arquivos?", "factual_question", "document_folder"],
    ["Organiza o material para discutirmos a dívida.", "capital_strategy", "document_folder"],
    ["Monta o material do conselho sobre a estrutura de capital.", "material_preparation", "board_capital_discussion"],
    ["Monta o deck do conselho com o plano de financiamento.", "material_preparation", "board_capital_discussion"],
    ["Prepare o material para o conselho sobre a estrutura de capital.", "material_preparation", "board_capital_discussion"],
  ] as const)("enumerated lote 4 ficha exception: %s (origin/main %s)", (message, from, to) => {
    const folded = message.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    expect(lote4FichaExceptions.filter((e) => e.from === from && e.to === to && e.pattern.test(folded))).toHaveLength(1);
    for (const hasAttachments of [false, true]) expect(compileObjectiveToPlan({message, hasAttachments}).objectiveKind).toBe(to);
  });
  // Independent reviews, rounds 4 to 9: the lote 4 vetoes are conservative (lote4-request.ts): only a request addressed to
  // the advisor promotes, and a negation, a refusal or a request for guidance anywhere in the message keeps origin/main's route. The reviewer's three phrasings and
  // the whole family generated by combination (each refusal and each request for guidance, over every request verb and
  // object of C47, C01 and C09), with and without files, keep the route origin/main gave them
  // (routing-regression.lote4-vetoes-main.json, recorded from origin/main's router); none takes a lote 4 kind.
  it("keeps every refusal and every request for guidance of a lote 4 action on its origin/main route", () => {
    const reviewed = ["Não estou pedindo que prepare a discussão da dívida para o conselho", "Como avaliar essa proposta de crédito do banco?",
      "Me diga como avaliar essa proposta de crédito do banco",
      // Round 5: a refusal after the action, and one between its parts.
      "Preparar a discussão da dívida para o conselho não é o que eu quero", "Avaliar essa proposta de crédito do banco não é o que eu pedi",
      "Não é necessário, por enquanto, preparar a discussão da dívida para o conselho",
      // Round 6: the action of someone else (a factual question, a report), and a direct refusal.
      "Quando o banco vai avaliar essa proposta de crédito que recebemos?", "A diretoria vai preparar a discussão da dívida para o conselho.",
      "Recuso avaliar essa proposta de crédito do banco.", "Desista de preparar a discussão da dívida para o conselho.",
      // Round 7: a modal whose subject is someone else, and an evaluation reported from someone else.
      "Quando o banco pode avaliar essa proposta de crédito que recebemos?", "A diretoria pode preparar a discussão da dívida para o conselho.",
      "O banco disse que a proposta de crédito que recebemos é boa.",
      // Round 8: a wanting verb after a third-party subject, and a modal addressed to "você" inside reported speech.
      "O banco gostaria de avaliar essa proposta de crédito que recebemos.", "A diretoria gostaria de preparar a discussão da dívida para o conselho.",
      "O banco disse que você pode avaliar essa proposta de crédito que recebemos.",
      // Round 9: speech reported with a colon.
      "O banco disse: pode avaliar essa proposta de crédito que recebemos.", "A diretoria pediu: prepare a discussão da dívida para o conselho."];
    const rows = lote4VetoesMain as {message: string; hasAttachments: boolean; kind: string}[];
    const family = [...new Set([...reviewed, ...lote4VetoFamily()])];
    expect(rows.map((r) => r.message).filter((m, i, all) => all.indexOf(m) === i)).toEqual(family);
    expect(rows.map((r) => `${r.message}|${r.hasAttachments}`).sort()).toEqual(family.flatMap((m) => [`${m}|false`, `${m}|true`]).sort());
    const lote4Kinds = ["board_capital_discussion", "received_proposal", "document_folder", "financing_paths"];
    const departures = rows.filter((r) => compileObjectiveToPlan({message: r.message, hasAttachments: r.hasAttachments}).objectiveKind !== r.kind);
    expect(departures).toEqual([]);
    expect(rows.filter((r) => lote4Kinds.includes(r.kind))).toEqual([]);
  });

  // Round 7: a request addressed to the advisor still promotes: an imperative, a modal that opens the clause or has
  // "você" as its subject, a first person request, and the ficha's direct question.
  it.each([
    ["Prepare a discussão da dívida para o conselho", false, "board_capital_discussion"],
    ["Prepare a discussão da dívida para o conselho", true, "board_capital_discussion"],
    ["Avalie essa proposta de crédito do banco que o Itaú mandou", false, "received_proposal"],
    ["Avalie essa proposta de crédito do banco que o Itaú mandou", true, "received_proposal"],
    ["O Itaú mandou essa proposta de CCB, é boa?", false, "received_proposal"],
    ["O Itaú mandou essa proposta de CCB, é boa?", true, "received_proposal"],
    ["Quero que você prepare a discussão da dívida para o conselho", false, "board_capital_discussion"],
    ["Quero que você prepare a discussão da dívida para o conselho", true, "board_capital_discussion"],
    ["Pode avaliar a proposta de crédito que o Bradesco mandou?", false, "received_proposal"],
    ["Pode avaliar a proposta de crédito que o Bradesco mandou?", true, "received_proposal"],
    ["Você consegue preparar a discussão da dívida para o conselho?", false, "board_capital_discussion"],
    ["Você consegue preparar a discussão da dívida para o conselho?", true, "board_capital_discussion"],
    ["Por favor, pode me ajudar a avaliar a proposta de crédito do Itaú?", false, "received_proposal"],
    ["Por favor, pode me ajudar a avaliar a proposta de crédito do Itaú?", true, "received_proposal"],
    ["Conselho na quinta, prepare a discussão da dívida.", false, "board_capital_discussion"],
    ["Conselho na quinta, prepare a discussão da dívida.", true, "board_capital_discussion"],
    ["Preciso preparar a discussão da dívida para o conselho", false, "board_capital_discussion"],
    ["Preciso preparar a discussão da dívida para o conselho", true, "board_capital_discussion"],
    ["O Itaú mandou proposta de CCB de R$ 30 milhões, três anos, CDI mais 2,1, com cessão fiduciária de recebíveis. É boa?", false, "received_proposal"],
    ["O Itaú mandou proposta de CCB de R$ 30 milhões, três anos, CDI mais 2,1, com cessão fiduciária de recebíveis. É boa?", true, "received_proposal"],
    ["Recebi uma proposta de CCB do Bradesco. Vale a pena?", false, "received_proposal"],
    ["Recebi uma proposta de CCB do Bradesco. Vale a pena?", true, "received_proposal"]
  ] as const)("lote 4 request addressed to the advisor promotes: %s (attachments %s)", (message, hasAttachments, kind) => {
    expect(compileObjectiveToPlan({message, hasAttachments}).objectiveKind).toBe(kind);
  });

  // Round 8: every request addressed to the advisor that the family reports from a third party promotes when asked
  // directly, with and without files.
  // Round 9: a first person introducer ("Eu disse:", "Falei:") keeps the request the person's own.
  it.each([...lote4AddressedRequests, ...lote4OwnIntroducedRequests].flatMap((m) => [[m, false], [m, true]] as const))("addressed request promotes: %s (attachments %s)", (message, hasAttachments) => {
    expect(["board_capital_discussion", "received_proposal"]).toContain(compileObjectiveToPlan({message, hasAttachments}).objectiveKind);
  });

  // Round 10: a quote after a colon or a dash ends the reported segment at its closing quote. A request after the quote
  // is the person's and promotes; the same request inside the quote does not, for every quote style.
  const quoteStyles: [string, string][] = [['"', '"'], ["'", "'"], ["“", "”"], ["‘", "’"], ["«", "»"]];
  const lote4Kinds = ["board_capital_discussion", "received_proposal", "document_folder", "financing_paths"];
  it.each(quoteStyles.flatMap(([o, c]) => [":", " \u2014"].flatMap((lead) => [false, true].map((a) => [o, c, lead, a] as const))))(
    "quoted report %s%s after%s: only what follows the quote counts (attachments %s)", (o, c, lead, hasAttachments) => {
      const after = `O diretor escreveu${lead} ${o}Os documentos estão prontos${c}. Prepare a discussão da dívida para o conselho.`;
      const inside = `O diretor escreveu${lead} ${o}Prepare a discussão da dívida para o conselho${c}.`;
      const proposal = `O gerente disse${lead} ${o}A proposta chegou ontem${c}. Pode avaliar a proposta de crédito que o Bradesco mandou?`;
      const proposalInside = `O gerente disse${lead} ${o}Pode avaliar a proposta de crédito que o Bradesco mandou?${c}`;
      expect(compileObjectiveToPlan({message: after, hasAttachments}).objectiveKind).toBe("board_capital_discussion");
      expect(compileObjectiveToPlan({message: proposal, hasAttachments}).objectiveKind).toBe("received_proposal");
      expect(lote4Kinds).not.toContain(compileObjectiveToPlan({message: inside, hasAttachments}).objectiveKind);
      expect(lote4Kinds).not.toContain(compileObjectiveToPlan({message: proposalInside, hasAttachments}).objectiveKind);
    });

  // The neighbours of the lote 4 methods keep the route origin/main gives them (plain, with attachments).
  it.each([
    // C01: several proposals, a comparison, a concept, a non-financing proposal, a bare proposal, only reading the term sheet.
    ["Recebemos duas propostas, qual a melhor?", "proposal_comparison", "proposal_comparison"],
    ["Compare a proposta do Itaú com a do Bradesco", "operation_review", "operation_review"],
    ["O que é uma CCB?", "factual_question", "factual_question"],
    ["Recebi uma proposta de compra da empresa, é boa?", "factual_question", "documents_to_case"],
    ["A proposta é boa?", "factual_question", "documents_to_case"],
    ["Organiza o term sheet do Itaú", "ambiguous", "documents_to_case"],
    // C09: a source index, a data room for the bank, a diligence list, the debt table, one contract, an agenda.
    ["Organiza a pasta de documentos", "information_organization", "information_organization"],
    ["Organiza esses arquivos da Aurora por tipo e período", "information_organization", "information_organization"],
    ["Organize os documentos do data room para o banco", "information_organization", "information_organization"],
    ["Quais documentos faltam para a diligência?", "factual_question", "documents_to_case"],
    ["Organiza a tabela de dívida", "debt_table", "debt_table"],
    ["Lê esse contrato e me diz as cláusulas", "ambiguous", "documents_to_case"],
    ["Organiza minha agenda", "ambiguous", "documents_to_case"],
    // C32: any other capital strategy request, capacity, a project's return, formal drafts, a what-if alone.
    ["Preciso financiar a fábrica nova. Qual o melhor caminho?", "capital_strategy", "capital_strategy"],
    ["Quanto de dívida cabe para a linha nova?", "debt_capacity", "debt_capacity"],
    ["A linha de embalagem se paga?", "factual_question", "documents_to_case"],
    ["Prepare a decisão de estrutura de capital com as minutas para o banco.", "capital_strategy", "capital_strategy"],
    ["Uma debênture de R$ 80 milhões me parece grande para a gente. E se eu só alongar o Bradesco com ele mesmo, por mais dois anos?", "capital_strategy", "capital_strategy"],
    // C47: a decision brought to the board, a memo, an answer to a board question, the debt table, material without the capital topic.
    ["Preciso levar ao conselho uma decisão sobre estrutura de capital e alternativas.", "board_decision", "board_decision"],
    ["Prepara o memorando do trimestre para o conselho.", "material_preparation", "material_preparation"],
    ["Prepara a resposta para o conselho sobre por que pagamos mais que a Serra Verde.", "relative_debt_cost", "relative_debt_cost"],
    ["Preciso do endividamento atualizado para o conselho.", "debt_table", "debt_table"],
    ["Monta o material do conselho com a tabela de dívida.", "debt_table", "debt_table"],
    ["Monta o material do conselho.", "material_preparation", "material_preparation"],
    ["Monta o material do conselho sobre a safra.", "material_preparation", "material_preparation"],
    ["Prepare a reunião com o banco sobre a discussão de estrutura de capital para o conselho", "board_decision", "board_decision"],
    ["Prepara a pauta do conselho sobre a política de remuneração", "board_decision", "board_decision"],
    // Independent review, round 2: one set of vetoes for the four lote 4 promotions (refusing the action or the need,
    // avoiding or dispensing with it, asking to understand it) keeps the route origin/main gives, with and without files.
    ["Não preciso preparar a discussão de estrutura de capital para o conselho", "board_decision", "board_decision"],
    ["Dispense preparar a discussão de dívida para o conselho", "board_decision", "board_decision"],
    ["Me explique como avaliar essa proposta de crédito do banco", "factual_question", "documents_to_case"],
    ["Evite organizar o material", "ambiguous", "documents_to_case"],
    ["Não quero que você organize a pasta", "information_organization", "information_organization"],
    ["Dispense a organização da pasta", "ambiguous", "documents_to_case"],
    ["Não precisa avaliar a proposta do Itaú, é boa?", "factual_question", "documents_to_case"],
    ["Evite avaliar a proposta do banco. Vale a pena?", "factual_question", "documents_to_case"],
    ["O que significa avaliar uma proposta do banco? É boa?", "factual_question", "factual_question"],
    ["Não vamos financiar a linha nova e reduzir os vencimentos", "capital_strategy", "capital_strategy"],
    ["Explique como financio a expansão sem apertar o caixa?", "capital_strategy", "capital_strategy"],
    // Independent review, round 3: the whole family (wishing, wanting, intending it, negated; asking how one should do it,
    // to be taught, oriented or shown the steps) keeps origin/main's route, with and without files.
    ["Não desejo preparar a discussão de dívida para o conselho", "board_decision", "board_decision"],
    ["Não gostaria de preparar a discussão de dívida para o conselho", "board_decision", "board_decision"],
    ["Não pretendo organizar a pasta agora", "information_organization", "information_organization"],
    ["Quero saber como avaliar essa proposta de crédito do banco", "factual_question", "documents_to_case"],
    ["Gostaria de saber como avaliar a proposta do Itaú", "factual_question", "documents_to_case"],
    ["Como devo avaliar essa proposta de crédito do banco?", "factual_question", "documents_to_case"],
    ["Como posso preparar a discussão da dívida para o conselho?", "board_decision", "board_decision"],
    ["Ensine como preparar a discussão da dívida para o conselho", "board_decision", "board_decision"],
    ["Me ensine a organizar a pasta de documentos", "information_organization", "information_organization"],
    ["Me oriente sobre como avaliar a proposta do banco", "factual_question", "documents_to_case"],
    ["Me explique como preparar a discussão de dívida para o conselho", "board_decision", "board_decision"],
    ["Qual a melhor forma de organizar a pasta?", "information_organization", "information_organization"],
    ["Como se avalia uma proposta de crédito do banco?", "factual_question", "documents_to_case"],
    ["Passo a passo para buscar financiamento para a expansão", "capital_strategy", "capital_strategy"],
    ["Como devo financiar a expansão sem apertar o caixa?", "capital_strategy", "capital_strategy"],
    ["Não desejo buscar financiamento para a expansão", "capital_strategy", "capital_strategy"],
    ["Quero aprender como organizar os documentos da pasta", "information_organization", "information_organization"],
    ["Nunca monte o material do conselho sobre a estrutura de capital.", "material_preparation", "material_preparation"],
    ["Evite fazer a página do conselho com o plano de financiamento", "board_decision", "board_decision"],
    ["Não organiza a pasta, só me diz o que tem nos arquivos", "information_organization", "information_organization"],
    // Independent review, round 1: a refusal or a request to understand keeps the board decision.
    ["Não prepare a discussão de estrutura de capital para o conselho", "board_decision", "board_decision"],
    ["Explique como preparar a discussão de estrutura de capital para o conselho", "board_decision", "board_decision"],
    ["Não quero que você prepare a discussão de estrutura de capital para o conselho", "board_decision", "board_decision"],
    ["Evite preparar o material do conselho sobre o financiamento", "material_preparation", "material_preparation"],
    ["Me explica como montar a pauta do conselho sobre a dívida", "board_decision", "board_decision"],
    ["Quero entender como fazer a página do conselho com o plano de financiamento", "board_decision", "board_decision"],
  ] as const)("lote 4 neighbour keeps its origin/main route: %s", (message, plain, attached) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(plain);
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe(attached);
  });
  it.each([
    ["Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?", "capital_strategy", "receivables_funding"],
    ["Saiu o balancete de setembro, atualiza a projeção e o covenant.", "risk_matrix", "quarter_update"],
    ["O que mudou com o resultado do terceiro trimestre?", "factual_question", "quarter_update"],
    ["Que premissas você questionaria nessa projeção?", "factual_question", "projection_challenge"],
    ["Esse plano está otimista?", "factual_question", "projection_challenge"],
    ["O que o banco vai contestar nesse business plan?", "factual_question", "projection_challenge"],
    ["Quais FIDCs comprariam nossa carteira?", "factual_question", "receivables_funding"],
    ["Vale fazer um FIDC próprio?", "factual_question", "receivables_funding"],
  ] as const)("enumerated ficha exception: %s (origin/main %s)", (message, from, to) => {
    expect(lote3FichaExceptions.filter((e) => e.from === from && e.to === to && e.pattern.test(message.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()))).toHaveLength(1);
    for (const hasAttachments of [false, true]) expect(compileObjectiveToPlan({message, hasAttachments}).objectiveKind).toBe(to);
  });
  it.each([
    // Independent review, round 5: each keeps the specific route origin/main gives it.
    ["Atualize o plano para pagar a dívida depois do fechamento do trimestre", "capital_strategy", "capital_strategy"],
    ["Monte uma projeção dos covenants da escritura", "risk_matrix", "risk_matrix"],
    ["Construa a projeção do waterfall da operação", "risk_matrix", "risk_matrix"],
    ["Qual a vantagem de um FIDC próprio?", "factual_question", "documents_to_case"],
    ["Quais as semelhanças entre um FIDC próprio e um banco?", "factual_question", "documents_to_case"],
    ["Revise o contrato de cessão de recebíveis e explique os riscos", "operation_review", "operation_review"],
    // Ficha C24 variation "Só me diz como começar": an orientation answer, the first version offered, not produced.
    ["Só me diz como começar uma projeção.", "factual_question", "documents_to_case"],
  ] as const)("keeps the existing route: %s", (message, plain, attached) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(plain);
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe(attached);
  });

  // Independent review, round 6: each reproduction keeps the route origin/main gives it (exceptions anchored to the
  // whole ficha construction and vetoed by a conceptual marker or a contractual object; promotions only on a
  // named object of the method's closed list).
  it.each([
    ["O que o banco vai contestar nesse plano de amortização contratual?", "factual_question", "documents_to_case"],
    ["Vale fazer um FIDC próprio? Só quero entender o conceito por enquanto.", "factual_question", "documents_to_case"],
    ["Refaça o balancete do trimestre incluindo os lançamentos de ajuste", "ambiguous", "documents_to_case"],
    ["Atualize o calendário do fechamento do trimestre", "ambiguous", "documents_to_case"],
    ["Revise o plano de cobrança dos nossos recebíveis", "ambiguous", "documents_to_case"],
    ["Revise a projeção do caixa semana a semana", "ambiguous", "documents_to_case"],
    ["Construa a projeção de vencimentos das duplicatas da nossa carteira", "ambiguous", "documents_to_case"],
  ] as const)("round 6 reproduction keeps its origin/main route: %s", (message, plain, attached) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(plain);
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe(attached);
  });
  // Negative paraphrases from neighbouring objects (collection, maturities, accounting close, calendar,
  // amortization, concept): none takes the method's kind, and each keeps the route the existing rules give it.
  const neighbours = {
    operating_projection: [
    ["Construa a projeção de vencimentos das duplicatas", "ambiguous", "documents_to_case"],
    ["Monte a projeção da carteira de recebíveis", "ambiguous", "documents_to_case"],
    ["Faça a projeção do caixa semanal", "weekly_cash", "weekly_cash"],
    ["Monte a projeção de cobrança do trimestre", "ambiguous", "documents_to_case"],
    ["Construa a projeção de amortização do empréstimo", "ambiguous", "documents_to_case"],
    ["Me ajuda a montar a projeção das parcelas do contrato", "ambiguous", "documents_to_case"],
    ["Monte o calendário do fechamento", "ambiguous", "documents_to_case"],
    ["Construa a projeção do balancete de dezembro", "ambiguous", "documents_to_case"],
    ["Quero entender o conceito de projeção por drivers", "ambiguous", "documents_to_case"],
    ["Monte a projeção de inadimplência da carteira", "ambiguous", "documents_to_case"],
    ["Faça uma primeira versão do contrato de cessão", "ambiguous", "documents_to_case"],
    ["Monte a projeção para reduzir a alavancagem", "ambiguous", "documents_to_case"],
    ["Construa um plano de cobrança para os recebíveis", "ambiguous", "documents_to_case"],
    ],
    projection_challenge: [
    ["Revise o plano de cobrança", "ambiguous", "documents_to_case"],
    ["Revise o plano de recebíveis da safra", "ambiguous", "documents_to_case"],
    ["Revise o plano de amortização", "ambiguous", "documents_to_case"],
    ["Revise o plano de pagamento dos fornecedores", "ambiguous", "documents_to_case"],
    ["Questione a projeção do caixa semana a semana", "weekly_cash", "weekly_cash"],
    ["Revise a projeção de vencimentos da carteira", "ambiguous", "documents_to_case"],
    ["Conteste o calendário do fechamento", "ambiguous", "documents_to_case"],
    ["Revise o balancete do trimestre", "ambiguous", "documents_to_case"],
    ["Nosso plano de cobrança está otimista?", "factual_question", "documents_to_case"],
    ["Só quero entender o conceito de premissa otimista no business plan", "ambiguous", "documents_to_case"],
    ["Revise a projeção de duplicatas a receber", "ambiguous", "documents_to_case"],
    ["Revise o plano", "ambiguous", "documents_to_case"],
    ],
    quarter_update: [
    ["Refaça o balancete do trimestre", "ambiguous", "documents_to_case"],
    ["Atualize o calendário do fechamento do trimestre", "ambiguous", "documents_to_case"],
    ["Faça os lançamentos de ajuste do fechamento do trimestre", "ambiguous", "documents_to_case"],
    ["Fechou o trimestre, atualize a contabilidade", "ambiguous", "documents_to_case"],
    ["Fechamos o trimestre; refaça a conciliação bancária", "ambiguous", "documents_to_case"],
    ["Atualize o cronograma do fechamento contábil", "ambiguous", "documents_to_case"],
    ["Saiu o balancete, revise os lançamentos", "ambiguous", "documents_to_case"],
    ["Fechou o trimestre. O que é um fechamento bem feito?", "factual_question", "documents_to_case"],
    ["Fechou o trimestre, atualize o plano de amortização", "ambiguous", "documents_to_case"],
    ["Atualize as provisões do fechamento do trimestre", "ambiguous", "documents_to_case"],
    ["Corrija o balancete do trimestre", "ambiguous", "documents_to_case"],
    ["Fechou o trimestre, refaça o cronograma de pagamentos", "ambiguous", "documents_to_case"],
    ],
    receivables_funding: [
    ["Revise a cobrança dos recebíveis", "ambiguous", "documents_to_case"],
    ["Monte o calendário de vencimentos das duplicatas", "ambiguous", "documents_to_case"],
    ["Antecipar recebíveis em vez da linha do banco: o que significa?", "factual_question", "documents_to_case"],
    ["Explique um FIDC próprio em vez da linha do banco", "factual_question", "documents_to_case"],
    ["Vale fazer um FIDC próprio para amortizar a dívida?", "capital_strategy", "capital_strategy"],
    ["Quais FIDCs comprariam nossa carteira de dívida?", "capital_strategy", "capital_strategy"],
    ["Recebíveis em vez da linha do banco para quitar o empréstimo", "ambiguous", "documents_to_case"],
    ["Organize a carteira de recebíveis", "ambiguous", "documents_to_case"],
    ["Qual a inadimplência da carteira em vez da linha do banco?", "factual_question", "documents_to_case"],
    ["Quero entender recebíveis em vez de linha do banco", "ambiguous", "documents_to_case"],
    ["Preciso antecipar os recebíveis da safra", "ambiguous", "documents_to_case"],
    ["Cobrança dos recebíveis em vez de linha do banco", "ambiguous", "documents_to_case"],
    ],
  } as const;
  for (const [kind, cases] of Object.entries(neighbours)) it.each(cases.map((c) => [...c] as [string, string, string]))(`neighbouring object is not ${kind}: %s`, (message, plain, attached) => {
    for (const hasAttachments of [false, true]) expect(compileObjectiveToPlan({message, hasAttachments}).objectiveKind).not.toBe(kind);
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(plain);
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe(attached);
  });
  it.each([
    ["Revise a projeção financeira que vamos mandar ao banco", "projection_challenge", "projection_challenge"],
    ["Questione as premissas do business plan", "projection_challenge", "projection_challenge"],
    ["Construa a projeção operacional por drivers", "operating_projection", "operating_projection"],
    ["Monte a projeção de receita e EBITDA", "operating_projection", "operating_projection"],
    ["Quero ceder recebíveis em vez de usar a linha do banco", "receivables_funding", "receivables_funding"],
    ["Quais FIDCs comprariam nossa carteira de duplicatas?", "receivables_funding", "receivables_funding"],
    ["Faz uma primeira versão com hipóteses explícitas.", "operating_projection", "operating_projection"],
    ["Revise o plano de negócios", "projection_challenge", "projection_challenge"],
  ] as const)("named object of the closed list routes: %s", (message, plain, attached) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(plain);
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe(attached);
  });

  // Independent review, round 7, and own paraphrases per item: (a) the balancete, its numbers, balances or values
  // are the accounting object and win over C54; (b) "premissas do plano" only for the financial plan; (c) "primeira
  // versão" only as the generic ficha or with a projection object in its clause; (d) C35 never on a refusal or a
  // request only to record.
  it.each([
    ["Atualize os números do balancete para corrigir os saldos", "ambiguous", "documents_to_case"],
    ["Atualize os números do balancete com os valores corrigidos pelo contador", "ambiguous", "documents_to_case"],
    ["Corrija o balancete do trimestre e atualize a projeção", "ambiguous", "documents_to_case"],
    ["Fechou o trimestre, ajuste os saldos do balancete", "ambiguous", "documents_to_case"],
    ["Refaça os valores do balancete do trimestre", "ambiguous", "documents_to_case"],
    ["Revise as contas do balancete do trimestre", "ambiguous", "documents_to_case"],
    ["Fechou o trimestre e o balancete, atualiza tudo", "quarter_update", "quarter_update"],
    ["Saiu o balancete do trimestre, atualiza o caixa e o covenant", "risk_matrix", "risk_matrix"],
    ["Revise as premissas do plano de saúde dos nossos funcionários", "ambiguous", "documents_to_case"],
    ["Questione as premissas do plano de segurança do trabalho", "ambiguous", "documents_to_case"],
    ["Revise as premissas do plano de marketing", "ambiguous", "documents_to_case"],
    ["Questione as premissas do plano de expansão de lojas", "capital_strategy", "capital_strategy"],
    ["Revise as premissas do plano financeiro", "projection_challenge", "projection_challenge"],
    ["Questione as premissas do plano de negócios", "projection_challenge", "projection_challenge"],
    ["Revise as premissas do plano que vamos mandar ao banco", "projection_challenge", "projection_challenge"],
    ["Crie a primeira versão com premissas para a política de descontos comerciais", "ambiguous", "documents_to_case"],
    ["Faça uma primeira versão com hipóteses do orçamento de marketing", "ambiguous", "documents_to_case"],
    ["Monte a primeira versão do manual de crédito", "ambiguous", "documents_to_case"],
    ["Faça a primeira versão da projeção por drivers", "operating_projection", "operating_projection"],
    ["Monte uma primeira versão da projeção operacional com hipóteses explícitas", "operating_projection", "operating_projection"],
    ["Faz uma primeira versão com hipóteses explícitas.", "operating_projection", "operating_projection"],
    ["Só registre que não vamos usar recebíveis em vez da linha do banco", "ambiguous", "documents_to_case"],
    ["Não quero ceder nossos recebíveis em vez da linha do banco", "ambiguous", "documents_to_case"],
    ["Anote que a gente prefere recebíveis em vez da linha do banco", "ambiguous", "documents_to_case"],
    ["Nunca vamos antecipar recebíveis em vez de usar a linha do banco", "ambiguous", "documents_to_case"],
    ["Recuse a ideia de usar recebíveis em vez da linha do banco", "ambiguous", "documents_to_case"],
    ["Quero antecipar recebíveis em vez de pegar linha no banco.", "receivables_funding", "receivables_funding"],
  ] as const)("round 7: %s", (message, plain, attached) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(plain);
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe(attached);
  });

  // Independent review, round 8: an explicit negation of the action never selects a lote 3 kind; a negated
  // possession ("não temos projeção pronta") keeps the C24 ficha.
  it.each([
    ["Não revise a projeção operacional.", "ambiguous", "documents_to_case"],
    ["Não atualize as análises depois do fechamento do trimestre.", "ambiguous", "documents_to_case"],
    ["Não construa uma projeção operacional.", "ambiguous", "documents_to_case"],
    ["Não temos projeção pronta. Ajuda a construir uma para discutir o financiamento.", "operating_projection", "operating_projection"],
    ["Não questione as premissas do business plan.", "ambiguous", "documents_to_case"],
    ["Nunca refaça a projeção por drivers.", "ambiguous", "documents_to_case"],
    ["Não precisa montar o business plan.", "ambiguous", "documents_to_case"],
    ["Não quero antecipar recebíveis em vez de pegar linha no banco.", "ambiguous", "documents_to_case"],
    ["Fechou o trimestre, mas não atualize nada ainda.", "ambiguous", "documents_to_case"],
    ["Não faça a primeira versão da projeção operacional.", "ambiguous", "documents_to_case"],
    ["Não critique o plano de negócios.", "ambiguous", "documents_to_case"],
    ["Nós não temos business plan, ajuda a montar.", "operating_projection", "operating_projection"],
    ["Revisa a projeção que vamos mandar para o banco, sem rodar nada novo.", "projection_challenge", "projection_challenge"],
  ] as const)("round 8: %s", (message, plain, attached) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(plain);
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe(attached);
  });

  // Independent review, round 9: "não quero que", "prefiro que não" and "sem que" negate the action; "primeira
  // versão" only for a projection of the closed list (operating, by drivers, annual, results, financial).
  it.each([
    ["Não quero que revise a projeção operacional.", "ambiguous", "documents_to_case"],
    ["Não quero que atualize as análises depois do fechamento do trimestre.", "ambiguous", "documents_to_case"],
    ["Não quero que construa a projeção operacional.", "ambiguous", "documents_to_case"],
    ["Prefiro que não revise o business plan.", "ambiguous", "documents_to_case"],
    ["Prefiro que você não atualize a projeção depois do fechamento do trimestre.", "ambiguous", "documents_to_case"],
    ["Monte a projeção operacional sem que a gente mande nada ao banco.", "operating_projection", "operating_projection"],
    ["Revise a projeção financeira sem que mude o modelo.", "projection_challenge", "projection_challenge"],
    ["Não gostaria que você construísse a projeção por drivers.", "ambiguous", "documents_to_case"],
    ["Crie uma primeira versão da projeção de férias dos funcionários.", "ambiguous", "documents_to_case"],
    ["Faça a primeira versão da projeção de vendas do evento.", "ambiguous", "documents_to_case"],
    ["Monte a primeira versão da projeção de estoque.", "ambiguous", "documents_to_case"],
    ["Faça a primeira versão da projeção por drivers.", "operating_projection", "operating_projection"],
    ["Crie a primeira versão da projeção financeira.", "operating_projection", "operating_projection"],
    ["Faz uma primeira versão com hipóteses explícitas.", "operating_projection", "operating_projection"],
    ["Não temos projeção pronta. Ajuda a construir uma para discutir o financiamento.", "operating_projection", "operating_projection"],
  ] as const)("round 9: %s", (message, plain, attached) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(plain);
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe(attached);
  });

  // Independent review, round 10: the C35 ficha exception only for the working-capital purposes of the ficha family
  // (an investment keeps capital_strategy); "sem" with an infinitive and modifiers between "quero" and "que" negate
  // the action; a projection's full noun phrase decides, so an administrative qualifier after it never selects C24 or C26.
  it.each([
    ["Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a nova fábrica em vez da linha do banco?", "capital_strategy", "capital_strategy"],
    ["Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar o capex em vez da linha do banco?", "capital_strategy", "capital_strategy"],
    ["Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a expansão em vez da linha do banco?", "capital_strategy", "capital_strategy"],
    ["Temos 40 milhões de recebíveis. Dá para usar isso para financiar a aquisição em vez da linha do banco?", "capital_strategy", "capital_strategy"],
    ["Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?", "receivables_funding", "receivables_funding"],
    ["Temos 30 milhões em recebíveis. Dá pra usar isso pra financiar o estoque em vez da linha do banco?", "receivables_funding", "receivables_funding"],
    ["Temos 25 milhões de recebíveis. Dá para usar isso para financiar o capital de giro em vez da linha do banco?", "receivables_funding", "receivables_funding"],
    ["Quero ceder recebíveis em vez da linha do banco para financiar a nova planta", "capital_strategy", "capital_strategy"],
    ["Sem revisar a projeção operacional, apenas aguarde.", "ambiguous", "documents_to_case"],
    ["Não quero mais que atualize as análises depois do fechamento do trimestre.", "ambiguous", "documents_to_case"],
    ["Não quero de jeito nenhum que construa a projeção operacional.", "ambiguous", "documents_to_case"],
    ["Sem montar o business plan por enquanto.", "ambiguous", "documents_to_case"],
    ["Revisa a projeção que vamos mandar para o banco, sem rodar nada novo.", "projection_challenge", "projection_challenge"],
    ["Crie uma primeira versão da projeção anual de férias dos funcionários.", "ambiguous", "documents_to_case"],
    ["Monte a projeção anual de férias.", "ambiguous", "documents_to_case"],
    ["Revise a projeção operacional de manutenção da frota.", "ambiguous", "documents_to_case"],
    ["Monte a projeção anual da empresa.", "operating_projection", "operating_projection"],
    ["Monte a projeção de receita e EBITDA.", "operating_projection", "operating_projection"],
    ["Crie uma primeira versão da projeção anual.", "operating_projection", "operating_projection"],
    ["Revise a projeção financeira da companhia.", "projection_challenge", "projection_challenge"],
  ] as const)("round 10: %s", (message, plain, attached) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(plain);
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe(attached);
  });

  // Independent review, round 11: "não quero mais", "não desejo que", "não pretendo" and "não vou" negate the action;
  // "premissas da projeção" and "não temos projeção" follow the full noun phrase rule of C24.
  it.each([
    ["Não quero mais revisar a projeção operacional.", "ambiguous", "documents_to_case"],
    ["Não desejo que você revise a projeção operacional.", "ambiguous", "documents_to_case"],
    ["Não pretendo atualizar as análises depois do fechamento do trimestre.", "ambiguous", "documents_to_case"],
    ["Não vou construir a projeção operacional agora.", "ambiguous", "documents_to_case"],
    ["Não pretendemos montar o business plan.", "ambiguous", "documents_to_case"],
    ["Revise as premissas da projeção de férias dos nossos funcionários.", "ambiguous", "documents_to_case"],
    ["Revise as premissas da projeção financeira.", "projection_challenge", "projection_challenge"],
    ["Questione as premissas da projeção.", "projection_challenge", "projection_challenge"],
    ["Não temos projeção de férias pronta.", "ambiguous", "documents_to_case"],
    ["Não temos projeção pronta. Ajuda a construir uma para discutir o financiamento.", "operating_projection", "operating_projection"],
    ["Não temos projeção operacional pronta, ajuda a montar.", "operating_projection", "operating_projection"],
    ["Nós não temos business plan, ajuda a montar.", "operating_projection", "operating_projection"],
    ["Revisa a projeção que vamos mandar para o banco, sem rodar nada novo.", "projection_challenge", "projection_challenge"],
  ] as const)("round 11: %s", (message, plain, attached) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(plain);
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe(attached);
  });

  // Independent review, round 12: "não gostaria de" negates the action; any complement after a projection or its
  // premises (de, para, sobre, com foco em, referente a) follows the closed list.
  it.each([
    ["Não gostaria de revisar a projeção operacional.", "ambiguous", "documents_to_case"],
    ["Não gostaríamos de montar o business plan agora.", "ambiguous", "documents_to_case"],
    ["Revise as premissas da projeção para a escala de férias dos nossos funcionários.", "ambiguous", "documents_to_case"],
    ["Revise a projeção operacional para a escala de férias.", "ambiguous", "documents_to_case"],
    ["Monte a projeção anual sobre a frota de veículos.", "ambiguous", "documents_to_case"],
    ["Questione as premissas da projeção com foco em eventos corporativos.", "ambiguous", "documents_to_case"],
    ["Revise a projeção financeira para o banco.", "projection_challenge", "projection_challenge"],
    ["Revise as premissas da projeção financeira.", "projection_challenge", "projection_challenge"],
    ["Questione as premissas da projeção.", "projection_challenge", "projection_challenge"],
    ["Faça a primeira versão da projeção financeira para os investidores.", "operating_projection", "operating_projection"],
    ["Faça a primeira versão da projeção financeira sobre a reforma do escritório.", "ambiguous", "documents_to_case"],
    ["Construa uma projeção operacional para discutir o financiamento.", "operating_projection", "operating_projection"],
  ] as const)("round 12: %s", (message, plain, attached) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(plain);
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe(attached);
  });

  // Independent review, round 13: "evite", "dispense" and "não precisa" negate the action; a participle or relative
  // complement after a projection or its premises (destinada a, voltada para, que trata de, relacionada a) follows the closed list.
  it.each([
    ["Evite revisar a projeção operacional.", "ambiguous", "documents_to_case"],
    ["Evitem atualizar as análises depois do fechamento do trimestre.", "ambiguous", "documents_to_case"],
    ["Dispense a revisão da projeção operacional.", "ambiguous", "documents_to_case"],
    ["Não precisa construir a projeção operacional.", "ambiguous", "documents_to_case"],
    ["Revise as premissas da projeção destinada à escala de férias dos funcionários.", "ambiguous", "documents_to_case"],
    ["Revise a projeção operacional voltada para a frota.", "ambiguous", "documents_to_case"],
    ["Questione as premissas da projeção que trata do plano de férias.", "ambiguous", "documents_to_case"],
    ["Revise a projeção financeira relacionada ao evento de fim de ano.", "ambiguous", "documents_to_case"],
    ["Revise a projeção financeira destinada ao banco.", "projection_challenge", "projection_challenge"],
    ["Monte a projeção operacional voltada para o financiamento.", "operating_projection", "operating_projection"],
    ["Revise as premissas da projeção financeira.", "projection_challenge", "projection_challenge"],
    ["Construa a projeção por drivers.", "operating_projection", "operating_projection"],
    ["Revisa a projeção que vamos mandar para o banco, sem rodar nada novo.", "projection_challenge", "projection_challenge"],
  ] as const)("round 13: %s", (message, plain, attached) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(plain);
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe(attached);
  });

  // Independent review, round 15: adjectives between the projection's qualifier and its complement ("anual consolidada
  // de turnos") do not hide the complement; the whole noun phrase follows the closed list.
  it.each([
    ["Revise as premissas da projeção anual consolidada de turnos dos funcionários.", "ambiguous", "documents_to_case"],
    ["Monte a projeção operacional detalhada da frota.", "ambiguous", "documents_to_case"],
    ["Revise a projeção financeira consolidada da companhia.", "projection_challenge", "projection_challenge"],
    ["Revise a projeção financeira consolidada do grupo.", "projection_challenge", "projection_challenge"],
    ["Monte a projeção anual consolidada de receita e EBITDA.", "operating_projection", "operating_projection"],
    ["Crie a primeira versão da projeção financeira consolidada para os investidores.", "operating_projection", "operating_projection"],
  ] as const)("round 15: %s", (message, plain, attached) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(plain);
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe(attached);
  });

  // Independent review, round 24: "cancele a revisão", "não estou pedindo que" and "não é para" negate the action.
  it.each([
    ["Cancele a revisão da projeção operacional.", "ambiguous", "documents_to_case"],
    ["Cancelar a atualização das análises depois do fechamento do trimestre.", "ambiguous", "documents_to_case"],
    ["Não estou pedindo que revise a projeção operacional.", "ambiguous", "documents_to_case"],
    ["Não estou pedindo para construir a projeção operacional.", "ambiguous", "documents_to_case"],
    ["Não é para revisar a projeção financeira.", "ambiguous", "documents_to_case"],
    ["Não é para que você atualize as análises depois do fechamento do trimestre.", "ambiguous", "documents_to_case"],
    ["Revise a projeção financeira, não é para cancelar nada.", "projection_challenge", "projection_challenge"],
    ["Revise a projeção operacional.", "projection_challenge", "projection_challenge"],
  ] as const)("round 24: %s", (message, plain, attached) => {
    expect(compileObjectiveToPlan({message, hasAttachments: false}).objectiveKind).toBe(plain);
    expect(compileObjectiveToPlan({message, hasAttachments: true}).objectiveKind).toBe(attached);
  });

  // Independent review, round 25: a refusal of the object or the need ("não quero uma revisão", "não preciso de uma
  // projeção", "dispensamos") never selects lote 3; possession ("não temos projeção pronta") keeps the C24 ficha.
  it.each([
    ["Não quero uma revisão da projeção operacional por enquanto.", "ambiguous", "documents_to_case"],
    ["Não preciso de uma projeção operacional.", "ambiguous", "documents_to_case"],
    ["Não precisamos de business plan agora.", "ambiguous", "documents_to_case"],
    ["Dispensamos a revisão da projeção financeira.", "ambiguous", "documents_to_case"],
    ["Não queremos uma projeção por drivers.", "ambiguous", "documents_to_case"],
    ["Não queremos uma nova revisão do business plan.", "ambiguous", "documents_to_case"],
    ["Não temos projeção pronta. Ajuda a construir uma para discutir o financiamento.", "operating_projection", "operating_projection"],
    ["Não temos business plan, ajuda a montar.", "operating_projection", "operating_projection"],
    ["Nós não temos business plan, ajuda a montar.", "operating_projection", "operating_projection"],
  ] as const)("round 25: %s", (message, plain, attached) => {
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
      if (ficha.id !== "C47") expect(plan.outputTerminal).not.toBe("board_decision_pack");
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
