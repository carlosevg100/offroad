import {describe, expect, it} from "vitest";
import {premiseStepForTurn} from "./agent-operation-brief";
import {documentFolderEntry} from "./document-folder-premises-proposal";

describe("received cedent kits enter the released folder workflow", () => {
  it.each([
    "Recebi o kit banco desse cedente. Organiza os documentos e me diz o que falta.",
    "Confira o kit de documentos que recebemos do cedente.",
    "Organize a pasta do cedente para começarmos a análise.",
  ])("selects C09 in the worker for a directed request: %s", message => {
    expect(documentFolderEntry(message, true, [])).toBe("cue");
    expect(premiseStepForTurn(message, true, [])).toBe("document_folder");
  });
  it.each([
    "Não organize o kit banco do cedente.",
    'O analista disse: "organize o kit banco do cedente".',
    "O kit banco do cedente chegou. Organize os meus e-mails.",
  ])("does not open the folder workflow for refusal, reported speech or another object: %s", message => {
    expect(documentFolderEntry(message, true, [])).not.toBe("cue");
    expect(premiseStepForTurn(message, true, [])).not.toBe("document_folder");
  });
});
