/** Founder-requested, explicitly fictional marketing demonstration. Never a live mandate. */
export const websiteOfferFixture = {
  id: "website-offer-demonstration-v1",
  synthetic: true,
  documentCount: 14,
  receivablesBrlMillions: 30,
  ccbSpreadPercentagePoints: 3.2,
  lender: {
    name: "Fundo Horizonte I",
    ticketMinBrlMillions: 20,
    ticketMaxBrlMillions: 80,
    minYears: 2,
    maxYears: 5,
    maxDebtorConcentrationPercent: 15,
  },
  transaction: {amountBrlMillions: 30, termYears: 3, debtorConcentrationPercent: 18},
  // Authored illustrative weights, not a trained model, approval probability or live ranking.
  score: 80,
  scoreMaximum: 100,
  criteria: [
    {key: "instrument", weight: 40, earned: 40, outcome: "fits"},
    {key: "term", weight: 40, earned: 40, outcome: "fits"},
    {key: "concentration", weight: 20, earned: 0, outcome: "adjust"},
  ],
} as const;
