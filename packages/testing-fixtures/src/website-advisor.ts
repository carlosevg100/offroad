/** Coherent, authored public demonstration inputs. Never evidence of a real company or offer. Amounts in BRL millions. */
export const websiteAdvisorFixture = {
  id: "website-advisor-demonstration-v2",
  synthetic: true,
  receivables: {face: "30", debtors: 400, days: 45, monthlySales: "20", advanceHaircut: "0.2", ineligibleHaircut: "0.2"},
  board: {
    reportedEbitda2025: "148.5", approvedEbitdaAdjustments: ["1.5"],
    openingCash: "85", minimumCash: "60", openingGrossDebt: "505", covenantLimit: "3.25", downsideHaircut: "0.15",
    history: [{year:2023,revenue:"1110",ebitda:"120",netDebt:"310"},{year:2024,revenue:"1300",ebitda:"133",netDebt:"365"},{year:2025,revenue:"1510",ebitda:"150",netDebt:"420"}],
    years: [2026,2027,2028],
    operatingCash: ["127","130","155"], // After base cash interest, taxes and working-capital movements.
    maintenance: ["35","35","35"], expansion:["60","120","0"], dividends:["40","0","0"], maturities:["25","250","30"], ebitda:["165","180","210"],
    scenarios: {
      base: {draws:["0","0","0"],expansion:["60","120","0"],dividends:["40","0","0"],fees:["0","0","0"],incrementalInterest:["0","0","0"],newPrincipal:["0","0","0"],operatingShortfall:["0","0","0"]},
      plant: {draws:["60","120","0"],expansion:["60","120","0"],dividends:["40","0","0"],fees:["1.8","0","0"],incrementalInterest:["4","14","18"],newPrincipal:["0","0","24"],operatingShortfall:["0","0","0"]},
      integrated: {draws:["60","225","0"],expansion:["60","120","0"],dividends:["0","0","0"],fees:["2.1","0","0"],incrementalInterest:["4","18","28"],newPrincipal:["0","0","25"],operatingShortfall:["0","0","0"]},
      defer: {draws:["0","200","0"],expansion:["0","60","120"],dividends:["40","0","0"],fees:["0","2","0"],incrementalInterest:["0","10","20"],newPrincipal:["0","0","20"],operatingShortfall:["0","0","35"]},
    },
  },
} as const;
