import {describe, expect, it} from "vitest";
import {compileObjectiveToPlan} from "./objective-plan";

describe("originator requests on a received borrower bank kit", () => {
  it.each([
    "Recebi o kit banco desse cedente. Organiza e me diz o que falta.",
    "Organiza o kit banco do cedente.",
    "Pode organizar o kit bancário desse cedente?",
    "Quero organizar os documentos do cedente para a análise.",
    "O que falta no kit banco desse cedente?",
  ])("uses the released folder reader for the directed request: %s", message => {
    for (const hasAttachments of [false, true]) expect(compileObjectiveToPlan({message, hasAttachments}).objectiveKind).toBe("document_folder");
  });
  it.each([
    "Recebi o kit banco desse cedente.",
    "Não organize o kit banco do cedente.",
    "O analista disse: organiza o kit banco do cedente.",
    "O banco gostaria de organizar o kit banco desse cedente.",
    "Como organizo o kit banco de um cedente?",
    "Organiza minha agenda e o almoço com o cedente.",
    "Recebi o kit banco do cedente. Organiza minha agenda.",
    "Recebi o kit banco do cedente. Organiza os e-mails da equipe.",
    "Monta o kit banco da companhia para enviar ao banco.",
    "Organiza o kit banco do cedente para enviar ao investidor.",
    "Monta a análise do cedente para o comitê.",
    "Checa os sócios do cedente e quem assina.",
  ])("does not open an inventory for a refusal, report or another task: %s", message => {
    for (const hasAttachments of [false, true]) expect(compileObjectiveToPlan({message, hasAttachments}).objectiveKind).not.toBe("document_folder");
  });
});
