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
  });
});
