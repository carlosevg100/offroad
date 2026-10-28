import {describe, expect, it} from "vitest";
import {premiseStepForTurn} from "./agent-operation-brief";

describe("one premise step per turn", () => {
  it.each([
    ["Recebemos propostas do Itaú, do Santander e de um fundo para os R$ 70 milhões. Qual eu fico?", "comparison"],
    ["Quanto de dívida cabe para o capex?", "capacity"],
    ["Monta a tabela de dívida com tudo que temos.", "debt_table"],
    ["Qual a folga do covenant da debênture em dezembro?", "covenant_headroom"],
    ["Quando é a semana mais apertada?", "weekly_cash"],
    ["Vale a pena comprar a máquina nova de R$ 8 milhões?", "investment"],
    ["O que é covenant?", "investment"],
    // The compiled objective decides before the offers' detector.
    ["Projete o caixa semanal considerando as propostas dos bancos.", "weekly_cash"],
    ["Monta a tabela de dívida com as propostas dos bancos.", "debt_table"],
    ["Chegaram três term sheets. Qual é a melhor?", "comparison"],
    ["Queremos fazer uma segunda linha de produção de R$ 60 milhões em 2027 e 2028. Quanto de dívida a gente aguenta tomar para isso?", "capacity"],
    ["Não temos projeção pronta. Ajuda a construir uma para discutir o financiamento.", "operating_projection"],
    ["Que premissas você questionaria nessa projeção?", "projection_challenge"],
    ["Quero antecipar recebíveis em vez de pegar linha no banco.", "receivables_funding"],
    ["Fechou o trimestre. Atualiza tudo.", "quarter_update"],
    // Lote 4: the ficha phrasings run their own method's step.
    ["O Itaú mandou proposta de CCB de R$ 30 milhões, três anos, CDI mais 2,1, com cessão fiduciária de recebíveis. É boa?", "received_proposal"],
    ["Joguei aqui a pasta do último ano. Organiza e me diz o que tem.", "document_folder"],
    ["Precisamos financiar a linha nova de embalagem e reduzir a pressão dos vencimentos dos próximos dois anos. Que caminhos fazem sentido?", "financing_paths"],
    ["Conselho na quarta. Prepara a discussão de estrutura de capital.", "board_material"],
    ["Monta o material do conselho sobre a estrutura de capital.", "board_material"],
    // Orientation on how to start offers the first version without producing it.
    ["Só me diz como começar uma projeção.", "investment"],
  ] as const)("%s runs the %s step", (message, step) => {
    for (const docs of [false, true]) expect(premiseStepForTurn(message, docs, [])).toBe(step);
  });

  it("continues the latest premise question with the answer's data", () => {
    const thread = ["Quanto de dívida cabe para o capex?", "Qual a folga do covenant da debênture em dezembro?"];
    expect(premiseStepForTurn("O limite é 3x e o EBITDA é R$ 54 milhões", false, thread)).toBe("covenant_headroom");
    expect(premiseStepForTurn("O limite é 3x e o EBITDA é R$ 54 milhões", false, thread.slice(0, 1))).toBe("capacity");
    expect(premiseStepForTurn("O saldo é R$ 41 milhões", false, [...thread, "Como fica o caixa até dezembro e o que vence?"])).toBe("weekly_cash");
    expect(premiseStepForTurn("A CCB tem saldo de R$ 40 milhões", false, ["Monta a tabela de dívida com tudo que temos."])).toBe("debt_table");
    expect(premiseStepForTurn("Volume deve crescer 3% ao ano, a fábrica comporta.", false, ["Me ajuda a montar o business plan."])).toBe("operating_projection");
    expect(premiseStepForTurn("A rede A tem programa com o Santander.", false, ["Me ajuda a montar o business plan.", "Quais FIDCs comprariam nossa carteira?"])).toBe("receivables_funding");
    expect(premiseStepForTurn("A linha premium é 25% mais cara.", false, ["Esse plano está otimista?"])).toBe("projection_challenge");
    // Lote 4 continuations: the latest premise request decides, and another method's cue is never taken.
    const proposal = "Recebi uma proposta do Itaú, é boa?", folder = "Joguei aqui a pasta do último ano. Organiza e me diz o que tem.";
    const paths = "Como financio a expansão sem apertar o caixa?", board = "Conselho na quarta. Prepara a discussão de estrutura de capital.";
    expect(premiseStepForTurn("Segue o term sheet; o uso é capital de giro da safra.", true, [proposal])).toBe("received_proposal");
    expect(premiseStepForTurn("A minuta não foi para nenhum banco.", false, [folder])).toBe("document_folder");
    expect(premiseStepForTurn("Caixa mínimo de R$ 15 milhões e sondagem até 31/10.", false, [paths])).toBe("financing_paths");
    expect(premiseStepForTurn("O presidente pediu as alternativas sem recomendação.", false, [board])).toBe("board_material");
    expect(premiseStepForTurn("O saldo é R$ 41 milhões", false, [proposal, "Monta a tabela de dívida com tudo que temos."])).toBe("debt_table");
    expect(premiseStepForTurn("Monta a tabela de dívida com tudo que temos.", false, [proposal])).toBe("debt_table");
  });
});
