import {describe, expect, it} from "vitest";
import {documentFolderResumeWithdrawn, premiseStepForTurn} from "./agent-operation-brief";

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

// Independent review, round 7: a folder wait resumes only while the person still wants it. A later message of theirs
// that cancels or refuses the folder, or asks for another method, withdraws it (the continuation closes the wait as
// cancelled and proposes no card); a plain answer keeps it.
describe("the folder wait after it opened", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const turn = (later: string[]) => ({message_id: id(99), recent_messages: [
    {id: id(1), role: "user", content: "Joguei aqui a pasta do último ano. Organiza e me diz o que tem.", created_at: "2026-10-28T10:00:00Z"},
    {id: id(2), role: "assistant", content: "Estou lendo os arquivos.", created_at: "2026-10-28T10:00:05Z"},
    ...later.map((content, n) => ({id: id(10 + n), role: "user", content, created_at: `2026-10-28T10:0${n + 1}:00Z`})),
    // The system's continuation notice is never the person's words.
    {id: id(99), role: "user", content: "Leitura da pasta concluída.", created_at: "2026-10-28T10:09:00Z"},
  ]});
  it.each([
    ["cancelled after the wait", ["Cancele a organização da pasta. Não quero mais este inventário."], true],
    ["refused after the wait", ["Esqueça a pasta, não precisa organizar."], true],
    ["a change of subject after the wait", ["Agora monta a tabela de dívida com tudo que temos."], true],
    ["another lote 4 request after the wait", ["O Itaú mandou proposta de CCB de R$ 30 milhões, três anos, CDI mais 2,1. É boa?"], true],
    ["a plain answer after the wait", ["A minuta não foi para nenhum banco."], false],
    ["a plain answer with a file after the wait", ["Segue a página 7 legível e o balancete de março."], false],
    ["nothing after the wait", [], false],
  ] as const)("%s", (_, later, withdrawn) => {
    expect(documentFolderResumeWithdrawn(turn([...later]), id(1))).toBe(withdrawn);
  });
  it("reads only what came after the wait's own message", () => {
    const before = turn([]);
    before.recent_messages.unshift({id: id(0), role: "user", content: "Cancele a organização da pasta antiga.", created_at: "2026-10-28T09:00:00Z"});
    expect(documentFolderResumeWithdrawn(before, id(1))).toBe(false);
  });
});

