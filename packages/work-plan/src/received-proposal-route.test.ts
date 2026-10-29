import {describe, expect, it} from "vitest";
import {compileObjectiveToPlan} from "./objective-plan";
import {asksAboutReceivedProposal, receivedProposalRoute} from "./received-proposal-route";

const fold = (text: string) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const route = (message: string, hasAttachments = false) => receivedProposalRoute(fold(message), compileObjectiveToPlan({message, hasAttachments}).objectiveKind);

// Ficha C01 and the phrasings of the procedure's "Quando ativar".
export const receivedProposalPhrases = [
  "O Itaú mandou proposta de CCB de R$ 30 milhões, três anos, CDI mais 2,1, com cessão fiduciária de recebíveis. É boa?",
  "Recebi uma proposta do Itaú, é boa?",
  "Recebi uma proposta do Itaú. É boa?",
  "O banco mandou um term sheet. Vale a pena?",
  "Essa proposta do Bradesco é boa?",
  "Devo aceitar a proposta do Itaú?",
  "O gerente do Santander ofereceu uma linha de giro a CDI mais 1,8. O que você acha?",
  "Chegou a proposta do banco para a CCB, o que eu peço na contraproposta?",
  "Analisa a proposta do Itaú que mandei",
];
// Neighbours that must keep their own route.
export const receivedProposalNeighbours = [
  "Recebemos duas propostas, qual a melhor?",
  "Compare a proposta do Itaú com a do Bradesco",
  "O que é uma CCB?",
  "O que é uma proposta indicativa de banco?",
  "Organiza o term sheet do Itaú",
  "Só resume o term sheet do Itaú, não quero análise",
  "Recebi uma proposta de compra da empresa, é boa?",
  "Recebi uma proposta comercial de um cliente, vale a pena?",
  "Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?",
  "Quanto de dívida a gente aguenta?",
  "Monta a tabela de dívida",
  "Preciso financiar a fábrica nova. Qual o melhor caminho?",
  "A proposta é boa?",
];

describe("ficha C01 route (lote 4)", () => {
  it("takes the ficha phrasing and the procedure's activations, with or without documents", () => {
    for (const m of receivedProposalPhrases) for (const docs of [false, true]) expect(route(m, docs), m).toBe("received_proposal");
  });
  it("keeps every neighbour on its own route", () => {
    for (const m of receivedProposalNeighbours) for (const docs of [false, true]) expect(route(m, docs), m).not.toBe("received_proposal");
  });
  it("never takes a message from a specific kind other than the promotable ones", () => {
    const text = fold("Recebi uma proposta do Itaú, é boa?");
    expect(asksAboutReceivedProposal(text)).toBe(true);
    for (const kind of ["proposal_comparison", "operation_review", "capital_strategy", "debt_capacity", "receivables_funding"]) expect(receivedProposalRoute(text, kind)).toBe(kind);
    for (const kind of ["ambiguous", "documents_to_case", "factual_question"]) expect(receivedProposalRoute(text, kind)).toBe("received_proposal");
  });
});
