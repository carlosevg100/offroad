/** Synthetic, authored evidence for the actual executor gate. Never customer or production data. */
export const documentWorkProductLiveCases = [
  {id: "comparison", job: "comparison", objective: "Compare these financing proposals for our internal discussion. Identify terms and differences and what we need to clarify.", expected: ["36 months", "parent guarantee", "60 months", "unsecured"], passages: [
    {id: "alpha", documentName: "Synthetic Alpha proposal.txt", text: "Proposal Alpha has a maturity of 36 months and requires a parent guarantee. It requires quarterly financial reporting. Pricing and prepayment conditions are not provided."},
    {id: "beta", documentName: "Synthetic Beta proposal.txt", text: "Proposal Beta has a maturity of 60 months and is unsecured. It requires monthly financial reporting. Pricing and prepayment conditions are not provided."},
  ]},
  {id: "meeting", job: "meeting", objective: "Prepare a meeting briefing with our finance team about growth funding. Explain company context, discussion topics and information to request.", expected: ["retail stores", "inventory", "new stores", "cash flow"], passages: [
    {id: "company", documentName: "Synthetic company overview.txt", text: "The company operates retail stores selling pet supplies. Its inventory is purchased before sales are collected. The company plans to open new stores."},
    {id: "finance", documentName: "Synthetic finance note.txt", text: "Management wants to discuss funding inventory and new stores. Historical cash flow statements and a debt schedule have not been provided. No financing structure has been selected."},
  ]},
  {id: "review", job: "review", objective: "Review this credit opportunity for our internal investment team. Identify transaction terms, protections, risks and diligence questions without an approval recommendation.", expected: ["24 months", "unsecured", "quarterly compliance certificate", "leverage"], semanticAssertions: [{
    id: "review-unprovided-is-not-absent",
    rationale: "The source says covenant/schedule were not provided. It does not establish their inexistence. Explicit unsecured status remains a supported fact. This bounded English gold assertion is not a universal semantic guard.",
    sourceId: "protection",
    sourceQuote: "No leverage covenant or amortization schedule has been provided.",
    forbiddenClaims: [
      {id: "asserted-absence", pattern: "\\b(?:absence|lack) of (?:security and )?(?:a |an )?(?:leverage covenant|amortization schedule)\\b"},
      {id: "asserted-inexistence", pattern: "\\b(?:given |because |since )?no (?:leverage covenant|amortization schedule) (?:exists|is in place)\\b"},
      {id: "asserted-lacks", pattern: "\\blacks? (?:a |an )?(?:leverage covenant|amortization schedule)\\b"},
      {id: "presupposed-addition", pattern: "\\bwill (?:a |an )?(?:leverage covenant|amortization schedule) be (?:added|introduced|defined)\\b"},
    ],
  }], passages: [
    {id: "transaction", documentName: "Synthetic transaction terms.txt", text: "The proposed loan has a maturity of 24 months and is unsecured. Its purpose is working capital. The borrower has not supplied a cash flow forecast."},
    {id: "protection", documentName: "Synthetic covenant note.txt", text: "The terms require a quarterly compliance certificate. No leverage covenant or amortization schedule has been provided. Financial statements are still required for diligence."},
  ]},
] as const;
