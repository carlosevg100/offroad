import {describe, expect, it} from "vitest";
import {compileObjectiveToPlan} from "./objective-plan";
import {asksToOrganizeDocumentFolder, documentFolderRoute} from "./document-folder-route";

const fold = (m: string) => m.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const route = (m: string, hasAttachments: boolean) => documentFolderRoute(fold(m), compileObjectiveToPlan({message: m, hasAttachments}).objectiveKind);

/** Ficha C09: the request as it arrives and its paraphrases. */
export const documentFolderFichaPhrases = [
  "Joguei aqui a pasta do último ano. Organiza e me diz o que tem.",
  "Joguei a pasta aqui. Organiza e me diz o que tem.",
  "Só organiza, não analisa ainda.",
  "O que tem nesses arquivos?",
  "Organiza o material para discutirmos a dívida.",
  "Subi tudo que o financeiro tinha. Dá uma olhada e me fala o que falta.",
];
/** Neighbours that keep their own route. */
export const documentFolderNeighbours = [
  "Organize os documentos do data room para o banco", "Monta o data room", "Quais documentos faltam para a diligência?", "Organiza minha agenda",
  "Classifica esse documento", "Lê esse contrato e me diz as cláusulas", "Organiza a tabela de dívida", "Monta a tabela de dívida", "O que é um covenant?",
  "Organiza a apresentação para o banco", "Não precisa organizar a pasta", "O que é um inventário de documentos?", "Organiza os e-mails da semana",
  "Segue a página 7 legível e o balancete de março. A minuta não foi para nenhum banco.",
  "Recebi essa proposta do Itaú de CCB, é boa?", "Como fica o caixa semana a semana até dezembro?",
  // A source index keeps information organization (lote 4 never takes a specific route outside its ficha exceptions).
  "Organiza a pasta de documentos", "Organiza esses arquivos da Aurora por tipo e período",
];

describe("ficha C09 route", () => {
  it("takes the ficha phrasings, with or without files", () => {
    for (const m of documentFolderFichaPhrases) for (const a of [false, true]) expect(route(m, a), `${m} ${a}`).toBe("document_folder");
  });
  it("leaves the neighbours on their own route", () => {
    for (const m of documentFolderNeighbours) for (const a of [false, true]) {
      expect(route(m, a), `${m} ${a}`).not.toBe("document_folder");
      expect(route(m, a)).toBe(compileObjectiveToPlan({message: m, hasAttachments: a}).objectiveKind);
    }
  });
  it("never takes a specific kind outside the two whole ficha constructions", () => {
    expect(documentFolderRoute(fold("Organiza a pasta da dívida"), "debt_table")).toBe("debt_table");
    expect(documentFolderRoute(fold("O que tem nesses arquivos de dívida?"), "factual_question")).toBe("factual_question");
    expect(documentFolderRoute(fold("Organiza o material para discutirmos a dívida com o banco."), "capital_strategy")).toBe("capital_strategy");
    expect(asksToOrganizeDocumentFolder(fold("Não organiza nada ainda"))).toBe(false);
  });
});
