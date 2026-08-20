import {buildFinancialModel} from "./src/model.ts";
import {toXlsxBuffer} from "./src/workbook.ts";
import {writeFileSync} from "node:fs";
const fact = (fieldPath, value) => ({
  key: {fieldPath, periodEnd: "2025-12-31"}, value, valueType: "number",
  accepted: {fieldPath, normalizedValue: value, valueType: "number", sourceDocument: "d1", evidenceRank: 1, informationClass: "financial", confidence: 0.98, anchorVerified: true, periodEnd: "2025-12-31"},
  conflicts: [], disputed: false,
});
const model = buildFinancialModel({
  archetypeId: "growth_expansion", lang: "pt",
  facts: [fact("historical_financials.2025.revenue","412000000"), fact("historical_financials.2025.ebitda","31200000"), fact("debt.total_gross","69300000"), fact("historical_financials.2025.cash","10000000")],
  calculations: [{id:"adjusted_ebitda",labels:{pt:"",en:""},value:"31200000",trace:[],inputs:[],warnings:[]},{id:"net_debt",labels:{pt:"",en:""},value:"59300000",trace:[],inputs:[],warnings:[]}],
  requestedAmount: "45000000", requestedTermMonths: 60, requestedGraceMonths: 12,
  filenames: new Map([["d1","DRE_auditada_2025.pdf"]]),
});
writeFileSync("/tmp/modelo.xlsx", toXlsxBuffer(model, "pt"));
console.log("bytes ok");
