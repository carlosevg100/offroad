import {describe, expect, it} from "vitest";
import {documentFolderResumeWithdrawn, premiseInvalidation, premiseStepForTurn} from "./agent-operation-brief";
import {withdrawsDocumentFolderRequest} from "./document-folder-premises-proposal";

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

// Independent review, round 8: withdrawal is an act on the request (a cancellation or desistance verb as the clause's
// main verb, or a first person "não quero/preciso mais"), with no object, a pronoun or the folder as its object; a
// negation of a fact about the documents never withdraws, and cancelling something else leaves the folder.
describe("what withdraws the folder request after the wait", () => {
  const reviewed: [string, boolean][] = [["Os documentos não foram auditados.", false], ["A pasta não contém as notas explicativas.", false],
    ["Os documentos são da empresa, não da holding.", false], ["Pode cancelar.", true], ["Cancele. Não quero mais.", true]];
  const facts = ["O balancete não está assinado.", "Nenhum arquivo tem a escritura completa.", "A minuta não foi para nenhum banco.", "Os contratos não estão na pasta.",
    "Não temos o balanço de 2024 ainda.", "Não há notas explicativas nos arquivos.", "O extrato não é desta conta.", "Esses documentos não são da controlada.",
    "A planilha não fecha com o balancete.", "Não recebemos o laudo de avaliação.", "Os arquivos não têm data, mas são de março.", "A pasta não tem o contrato social."];
  const short = ["Pode cancelar.", "Cancele.", "Cancela isso.", "Desisti.", "Esqueça.", "Deixa pra lá.", "Pare.", "Para por aqui.", "Não precisa mais.",
    "Não quero mais isso.", "Pode cancelar o pedido.", "Esqueça tudo.", "Abandone isso, por favor.", "Não preciso disso.", "Cancele a organização da pasta.",
    "Não quero mais este inventário.", "Ok, pode cancelar."];
  const elsewhere = ["Cancele a reunião de amanhã.", "Pode cancelar o envio para o banco.", "Esqueça a proposta do Itaú.", "Desista da reunião com o Bradesco.",
    "Não quero a reunião na quinta."];
  const answers = ["Segue a página 7 legível e o balancete de março.", "O contrato da debênture está na subpasta jurídico.", "Pode considerar a versão assinada.",
    "O balancete é de março."];
  it.each([...reviewed, ...facts.map((m) => [m, false] as [string, boolean]), ...short.map((m) => [m, true] as [string, boolean]),
    ...elsewhere.map((m) => [m, false] as [string, boolean]), ...answers.map((m) => [m, false] as [string, boolean])])("%s withdraws: %s", (message, withdraws) => {
    expect(withdrawsDocumentFolderRequest(message)).toBe(withdraws);
  });
  it("reads the reply after the wait in the turn: facts and plain answers resume, short cancellations withdraw", () => {
    const at = (content: string) => ({message_id: "00000000-0000-4000-8000-000000000099", recent_messages: [
      {id: "00000000-0000-4000-8000-000000000001", role: "user", content: "Joguei aqui a pasta do último ano. Organiza e me diz o que tem.", created_at: "2026-10-28T10:00:00Z"},
      {id: "00000000-0000-4000-8000-000000000010", role: "user", content, created_at: "2026-10-28T10:01:00Z"},
      {id: "00000000-0000-4000-8000-000000000099", role: "user", content: "Leitura da pasta concluída.", created_at: "2026-10-28T10:09:00Z"}]});
    for (const m of [...facts, ...answers]) expect(documentFolderResumeWithdrawn(at(m), "00000000-0000-4000-8000-000000000001"), m).toBe(false);
    for (const m of short) expect(documentFolderResumeWithdrawn(at(m), "00000000-0000-4000-8000-000000000001"), m).toBe(true);
  });
});

// Independent review, round 9: speech reported from a third party (with "que", a colon, quotes or a dash) never
// withdraws; a first person introducer still does; an act with modifiers or an infinitive complement withdraws, and one
// on something else, with modifiers, does not.
describe("withdrawal reported, modified or complemented", () => {
  const acts = ["pode cancelar", "cancele", "não preciso mais dos documentos", "esqueça isso", "desista", "não quero mais este inventário"];
  const speakers = ["O auditor", "O diretor", "A diretoria", "O banco", "Ela", "O gerente"];
  const wrap = [(s: string, a: string) => `${s} disse: ${a}.`, (s: string, a: string) => `${s} escreveu: "${a}"`, (s: string, a: string) => `${s} pediu \u201c${a}\u201d`,
    (s: string, a: string) => `${s} respondeu \u2014 ${a}.`, (s: string, a: string) => `${s} falou - ${a}.`, (s: string, a: string) => `${s} disse que ${a}.`,
    (s: string, a: string) => `Segundo ${s.toLowerCase()}, ${a}.`];
  const reported = [...speakers.flatMap((who) => acts.flatMap((a) => wrap.map((w) => w(who, a))))];
  const own = ["Eu disse: pode cancelar.", "Falei: pode cancelar.", "Eu escrevi \u2014 cancele isso.", "Nós dissemos: não precisamos mais da pasta."];
  const modified = ["Pode cancelar só isso.", "Cancele apenas o pedido.", "Pode parar com a organização.", "Não precisa continuar.", "Cancele também a leitura.",
    "Pode cancelar por enquanto.", "Esqueça de vez.", "Não precisa mais seguir com isso.", "Pare de organizar.", "Pode cancelar a organização mesmo.", "Desista de terminar."];
  const elsewhere = ["Cancele só a reunião.", "Pode cancelar apenas o envio para o banco.", "Esqueça também a proposta do Itaú.", "Não precisa continuar a apresentação."];
  it.each([["O auditor escreveu: não preciso mais dos documentos.", false], ["O diretor disse: pode cancelar.", false], ...reported.map((m) => [m, false] as [string, boolean]),
    ...own.map((m) => [m, true] as [string, boolean]), ...modified.map((m) => [m, true] as [string, boolean]), ...elsewhere.map((m) => [m, false] as [string, boolean])] as [string, boolean][])(
    "%s withdraws: %s", (message, withdraws) => {
      expect(withdrawsDocumentFolderRequest(message)).toBe(withdraws);
    });
});

// Independent review, round 10: a quote after a colon or a dash ends the reported segment at its closing quote; the
// person's own cancellation after it withdraws, the same act inside the quote does not, for every quote style.
describe("withdrawal after a quoted report", () => {
  const quoteStyles: [string, string][] = [['"', '"'], ["'", "'"], ["“", "”"], ["‘", "’"], ["«", "»"]];
  const at = (content: string) => ({message_id: "00000000-0000-4000-8000-000000000099", recent_messages: [
    {id: "00000000-0000-4000-8000-000000000001", role: "user", content: "Joguei aqui a pasta do último ano. Organiza e me diz o que tem.", created_at: "2026-10-28T10:00:00Z"},
    {id: "00000000-0000-4000-8000-000000000010", role: "user", content, created_at: "2026-10-28T10:01:00Z"},
    {id: "00000000-0000-4000-8000-000000000099", role: "user", content: "Leitura da pasta concluída.", created_at: "2026-10-28T10:09:00Z"}]});
  it.each(quoteStyles.flatMap(([o, c]) => [":", " \u2014", ""].map((lead) => [o, c, lead] as const)))("quote %s%s after '%s'", (o, c, lead) => {
    const after = `O diretor escreveu${lead} ${o}Os documentos estão prontos${c}. Pode cancelar a organização.`;
    const inside = `O diretor escreveu${lead} ${o}Pode cancelar a organização${c}.`;
    expect(withdrawsDocumentFolderRequest(after)).toBe(true);
    expect(documentFolderResumeWithdrawn(at(after), "00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(withdrawsDocumentFolderRequest(inside)).toBe(false);
    expect(documentFolderResumeWithdrawn(at(inside), "00000000-0000-4000-8000-000000000001")).toBe(false);
  });
  it("the reviewer's case", () => {
    expect(documentFolderResumeWithdrawn(at("O diretor escreveu: 'Os documentos estão prontos'. Pode cancelar a organização."), "00000000-0000-4000-8000-000000000001")).toBe(true);
  });
});

// Independent review, round 12: a lote 4 card the person corrects or rejects, when the turn proposes nothing in its place,
// is superseded (worker_supersede_premise_proposals_v1; supabase/tests/lote4_premise_invalidation.sql proves the old card
// can no longer be confirmed). A turn that proposes a card, or does not enter the method, supersedes nothing here.
describe("which lote 4 cards a turn supersedes", () => {
  const missing = {forAdvisor: {status: "missing"}, proposal: null}, proposed = {forAdvisor: {status: "proposed"}, proposal: {}};
  it.each([
    ["the board, rejected with nothing to propose", {board_material: missing}, "prepare-board-capital-discussion"],
    ["the received proposal, corrected without a card", {received_proposal: missing}, "evaluate-received-proposal"],
    ["the folder, with a reading still pending", {document_folder: missing}, "organize-document-folder"],
    ["the 2027 plan, missing a term", {financing_paths: missing}, "evaluate-financing-paths"],
    ["a new card in its place (the recording supersedes)", {board_material: proposed}, null],
    ["no lote 4 step this turn", {}, null],
  ] as const)("%s", (_, steps, method) => {
    expect(premiseInvalidation(steps as never)).toBe(method);
  });
});

