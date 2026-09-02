import {describe, expect, it} from "vitest";

import {inferCapitalProjectJob} from "./job-inference";

describe("capital project job inference", () => {
  it("recognizes the Camil meeting request without requiring a selected starter", () => {
    expect(inferCapitalProjectJob({
      message: "Tenho uma reunião com a Camil amanhã e gostaria de apresentar um pitch sobre alternativas estratégicas possíveis no âmbito do endividamento.",
      hasAttachments: false,
    })).toEqual({job: "origination_thesis", reason: "meeting_or_origination"});
  });

  it("routes a private expansion financing need to universal capital planning, not receivables as a product", () => {
    expect(inferCapitalProjectJob({
      message: "Estou assessorando uma varejista e queria usar recebíveis para financiar uma expansão de lojas.",
      hasAttachments: true,
    })).toEqual({job: "capital_planning", reason: "capital_need"});
  });

  it("lets an existing term sheet override a generic capital need", () => {
    expect(inferCapitalProjectJob({
      message: "Recebi um term sheet para capital de giro e quero revisar e melhorar a estrutura.",
      hasAttachments: true,
    })).toEqual({job: "review_existing_operation", reason: "existing_transaction"});
  });

  it("starts from documents when the upload itself is the assignment", () => {
    expect(inferCapitalProjectJob({
      message: "Estruture a partir destes arquivos.",
      hasAttachments: true,
    })).toEqual({job: "structure_from_documents", reason: "documents_only"});
  });

  it("uses a clicked starter only as a tie breaker", () => {
    expect(inferCapitalProjectJob({
      message: "Quero começar um novo trabalho.",
      hasAttachments: false,
      explicitHint: "company_debt_view",
    })).toEqual({job: "company_debt_view", reason: "explicit_hint"});
  });
});
