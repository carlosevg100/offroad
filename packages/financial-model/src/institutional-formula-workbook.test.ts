import {mkdirSync, writeFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {institutionalInputFixture} from "./institutional-input.fixture";
import {prepareInstitutionalModelInput} from "./institutional-input";
import {buildInstitutionalFinancialModel} from "./institutional-model";
import {institutionalFormulaSheets} from "./institutional-formula-workbook";
import {toGovernedXlsxBuffer} from "./governed-workbook";

describe("institutional local formula model",()=>{
 it.each(["opening_principal","indexed_principal","average_principal"] as const)("emits linked financial statements for %s with cash and capitalized treatment",async couponBase=>{
  for(const treatment of ["cash_paid","capitalized_principal"] as const){
   const input=prepareInstitutionalModelInput(institutionalInputFixture()).input!;
   const template=input.assumptionBook.assumptions[0]!;
   input.assumptionBook={...input.assumptionBook, assumptions:[...input.assumptionBook.assumptions,
    ...[["tax","0.34"],["interest-limit","0.3"],["fixed-growth","-0.2"],["receivable-days","30"]].map(([id,value])=>({...template,id:id!,values:Object.fromEntries(input.assumptionBook.periods.map(p=>[p,value!]))}))]};
   input.taxes={...input.taxes,cashTaxRateAssumptionId:"tax",interestDeductibilityEbitdaPctAssumptionId:"interest-limit",openingTaxLossCarryforward:"25",openingDisallowedInterestCarryforward:"10"};
   input.workingCapital={...input.workingCapital,dsoAssumptionId:"receivable-days"};
   input.operatingCosts=[...input.operatingCosts,{id:"fixed-cost",method:"base_and_growth",baseCost:"160",growthAssumptionId:"fixed-growth"}];
   const debt=input.debtInstruments[0]!;debt.indexer="IPCA";debt.indexationTreatment=treatment;debt.couponTreatment=treatment;debt.couponBase=couponBase;
   debt.periods=debt.periods.map((p,i)=>({...p,indexationRate:"0.04",couponRate:"0.08",...(i===3?{repayAll:true}:{scheduledPrincipal:"10"})}));
   const model=buildInstitutionalFinancialModel(input);const sheets=institutionalFormulaSheets(input,0,"en");
   const rendered=await toGovernedXlsxBuffer({sheets,periods:[...input.assumptionBook.periods],deskAssumptions:[]},"en",{title:"Synthetic formula QA",asOfDate:"2026-12-31",currency:"BRL",scale:"units",classification:"internal",artifactClass:"institutional_editable"});
   expect(rendered.audit.formulaCoveragePassed).toBe(true);expect(rendered.audit.hardcodeViolations).toEqual([]);
   expect(sheets[0]!.rows.find(r=>r.key==="dscr")!.cells[1]!.formula).toContain("IF(");
   const outputDir=process.env.OFFROAD_FORMULA_QA_DIR;
   if(outputDir){mkdirSync(outputDir,{recursive:true});const name=`${couponBase}-${treatment}`;writeFileSync(`${outputDir}/${name}.xlsx`,rendered.bytes);const changed=structuredClone(input);const ratio=changed.assumptionBook.assumptions.find(a=>a.id==="cost-ratio")!;ratio.values={...ratio.values,[input.assumptionBook.periods[0]!] : "0.65"};const changedResult=buildInstitutionalFinancialModel(changed);const inputRow=sheets[1]!.rows.findIndex(r=>r.key==="assumption.cost-ratio")+1;
    writeFileSync(`${outputDir}/${name}.json`,JSON.stringify({expected:model.periods,sheets,edit:{sheet:"Inputs 1",cell:`B${inputRow}`,value:0.65,expected:changedResult.periods}},null,2));}
  }
 });
 it("keeps editable values in dedicated inputs and exact approval outside the simulation",()=>{
  const input=prepareInstitutionalModelInput(institutionalInputFixture()).input!;
  const sheets=institutionalFormulaSheets(input,0,"pt");
  expect(sheets.flatMap(s=>s.rows.flatMap(r=>r.cells.filter(c=>c.role==="input").map(()=>s.key)))).not.toContain("institutional_live_0");
  expect(sheets[0]!.rows[1]!.cells[0]!.value).toContain("não modificam a aprovação");
 });
});
