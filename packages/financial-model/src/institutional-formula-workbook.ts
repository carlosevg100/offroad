import {columnLetter, type Cell, type ModelSheet} from "./model";
import type {InstitutionalModelInput, InstitutionalModelPeriod} from "./institutional-model";

/** Excel's what-if projection of the canonical annual model. The approved exact decimal
 * snapshot remains a separate sheet. References, not cached outputs, drive every calculation. */
export function institutionalFormulaSheets(input: InstitutionalModelInput, index: number, lang: "pt" | "en"): ModelSheet[] {
  const prefix = `${index + 1}`;
  const inputName = {pt: `Premissas ${prefix}`, en: `Inputs ${prefix}`};
  const calcName = {pt: `Cálculos ${prefix}`, en: `Calculations ${prefix}`};
  const outputName = {pt: `Modelo ${prefix}`, en: `Model ${prefix}`};
  const periods = input.assumptionBook.periods;
  const terms:Record<string,string> = {"Revenue":"Receita","Operating costs":"Custos operacionais","maintenance capex":"Capex de manutenção","growth capex":"Capex de expansão","Total capex":"Capex total","Depreciation":"Depreciação","Earnings before tax":"Resultado antes dos tributos","Opening disallowed interest":"Juros não deduzidos iniciais","Interest capacity":"Capacidade de dedução dos juros","Deductible interest":"Juros dedutíveis","Prior interest utilized":"Juros anteriores utilizados","Closing disallowed interest":"Juros não deduzidos finais","Pre-loss taxable income":"Base tributável antes dos prejuízos","Current tax loss":"Prejuízo fiscal do período","Opening tax loss":"Prejuízo fiscal inicial","Tax loss utilized":"Prejuízo fiscal utilizado","Closing tax loss":"Prejuízo fiscal final","Taxable income":"Base tributável","Cash tax":"Tributos pagos","Net income":"Resultado líquido","Net working capital":"Capital de giro líquido","Change in working capital":"Variação do capital de giro","Debt service":"Serviço da dívida","Distributions":"Distribuições","Unrestricted cash":"Caixa disponível","Net PP&E":"Imobilizado líquido","Equity":"Patrimônio líquido","Total assets":"Ativo total","Liabilities and equity":"Passivo e patrimônio líquido","Balance check":"Conciliação do balanço","Net debt":"Dívida líquida","Liquidity headroom":"Folga de liquidez","Drawdown":"Captações", "opening":"saldo inicial","pre-index":"saldo antes da correção","indexation":"correção monetária","indexed principal":"principal corrigido","principal paid":"principal pago","coupon":"juros apropriados","closing":"saldo final","cash coupon":"juros pagos","cash indexation":"correção monetária paga","capitalized coupon":"juros capitalizados","capitalized indexation":"correção capitalizada","finance expense":"despesa financeira", "unrestrictedCash":"Caixa disponível","restrictedCash":"Caixa restrito","receivables":"Contas a receber","inventory":"Estoques","otherCurrentAssets":"Outros ativos circulantes","netPpe":"Imobilizado líquido","otherAssets":"Outros ativos","payables":"Fornecedores","otherCurrentLiabilities":"Outros passivos circulantes","grossDebt":"Dívida bruta","otherLiabilities":"Outros passivos","equity":"Patrimônio líquido","openingGrossDebt":"Dívida bruta inicial","closingGrossDebt":"Dívida bruta final","principalPaid":"Principal pago","cashCoupon":"Juros pagos","cashIndexation":"Correção monetária paga","capitalizedCoupon":"Juros capitalizados","capitalizedIndexation":"Correção capitalizada","financeExpense":"Despesa financeira","netDebtToEbitda":"Dívida líquida / EBITDA", "indexationRate":"Taxa de correção monetária","couponRate":"Taxa de juros","drawdown":"Captações","scheduledPrincipal":"Amortização contratual","prepayment":"Pagamento antecipado","opening.taxLoss":"Prejuízo fiscal inicial","opening.disallowedInterest":"Juros não deduzidos iniciais"};
  const label = (value: string): Cell => ({role: "label", value:lang==="pt"?value.split(": ").map(part=>terms[part]??part).join(": "):value.replace(/([a-z])([A-Z])/g,"$1 $2"), format: "text"});
  const rows: ModelSheet["rows"] = [{key:"head",cells:[{role:"header",value:input.assumptionBook.scenarioName},...periods.map(value=>({role:"header" as const,value}))]}];
  const calculations: ModelSheet["rows"] = [{key:"head",cells:[{role:"header",value:lang==="pt"?"Memória de cálculo":"Calculation build"},...periods.map(value=>({role:"header" as const,value}))]}];
  const positions = new Map<string, number>();
  const inputs = new Map<string, number>();
  const q = (name:string) => `'${name.replaceAll("'","''")}'`;
  const addInput = (key:string, title:string, values:readonly (string | number)[], format:Cell["format"]="money",historical=false) => {
    inputs.set(key, rows.length+1);
    rows.push({key,cells:[label(title),...values.map(value=>({role:historical?"historical" as const:"input" as const,value:Number(value),format}))]});
  };
  const I = (key:string,p:number) => {const row=inputs.get(key);if(!row)throw new Error(`Missing input ${key}`);const ref=`${q(inputName[lang])}!${columnLetter(p+1)}${row}`;const assumption=key.startsWith("assumption.")?input.assumptionBook.assumptions.find(a=>`assumption.${a.id}`===key):undefined;const configuredBounds=assumption?`${assumption.lowerBound!==undefined?`,${ref}>=${Number(assumption.lowerBound)}`:""}${assumption.upperBound!==undefined?`,${ref}<=${Number(assumption.upperBound)}`:""}${input.capex.some(c=>c.amountAssumptionId===assumption.id)?`,${ref}>=0`:""}`:"";const bounds=key.startsWith("debt.")?key.endsWith("Rate")?`,${ref}>-1`:` ,${ref}>=0`:"";return `IF(AND(ISNUMBER(${ref})${bounds}${configuredBounds}),${ref},NA())`;};
  const R = (key:string,p:number) => {const row=positions.get(key);if(!row)throw new Error(`Missing calculation ${key}`);return `${q(calcName[lang])}!${columnLetter(p+1)}${row}`;};
  const add = (key:string, title:string, expressions:(p:number)=>string, format:Cell["format"]="money") => {
    positions.set(key,calculations.length+1);
    calculations.push({key,cells:[label(title),...periods.map((_,p)=>({role:"formula" as const,formula:expressions(p),format}))]});
  };
  const sum = (terms:readonly string[]) => terms.length?`SUM(${terms.join(",")})`:"0";
  const fixed = (key:string,value:string|number,title=key) => addInput(key,title,periods.map(()=>value),"money",true);
  const A = (id:string,p:number)=>I(`assumption.${id}`,p);
  for(const a of input.assumptionBook.assumptions) addInput(`assumption.${a.id}`,a.label[lang],periods.map(p=>a.values[p]!),a.unit==="percent"?"percent":a.unit==="days"?"integer":a.unit==="multiple"?"multiple":"money",!a.editable);
  for(const [key,value] of Object.entries(input.openingBalanceSheet)) if(key!=="period") fixed(`opening.${key}`,value,`${lang==="pt"?"Saldo inicial":"Opening"}: ${key}`);
  fixed("opening.taxLoss",input.taxes.openingTaxLossCarryforward??"0","Opening tax loss");fixed("opening.disallowedInterest",input.taxes.openingDisallowedInterestCarryforward??"0","Opening disallowed interest");
  input.revenueSegments.forEach(s=>fixed(`revenue.${s.id}.base`,s.baseRevenue,`${s.id}: ${lang==="pt"?"receita histórica":"historical revenue"}`));
  input.operatingCosts.forEach(c=>{if(c.method==="base_and_growth")fixed(`cost.${c.id}.base`,c.baseCost,`${c.id}: ${lang==="pt"?"custo histórico":"historical cost"}`);});
  for(const d of input.debtInstruments){
    fixed(`debt.${d.instrumentId}.base`,String(d.openingPrincipal),`${d.instrumentId}: ${lang==="pt"?"principal inicial":"opening principal"}`);
    for(const key of ["indexationRate","couponRate","drawdown","scheduledPrincipal","prepayment"] as const) addInput(`debt.${d.instrumentId}.${key}`,`${d.instrumentId}: ${key}`,d.periods.map(p=>String(p[key]??0)),key.endsWith("Rate")?"percent":"money",key==="indexationRate" && d.indexationTreatment==="not_applicable");
  }
  // Recurrence rows refer to their previous period, including before row construction completes.
  for(const s of input.revenueSegments) add(`revenue.${s.id}`,s.id,p=>`${p?R(`revenue.${s.id}`,p-1):I(`revenue.${s.id}.base`,p)}*(1+${A(s.volumeGrowthAssumptionId,p)})*(1+${A(s.priceGrowthAssumptionId,p)})*(1+${A(s.mixEffectAssumptionId,p)})*(1+${A(s.fxEffectAssumptionId,p)})+${A(s.inorganicRevenueAssumptionId,p)}`);
  add("revenue","Revenue",p=>sum(input.revenueSegments.map(s=>`ROUND(${R(`revenue.${s.id}`,p)},8)`)));
  for(const c of input.operatingCosts) add(`cost.${c.id}`,c.id,p=>c.method==="percent_of_revenue"?`${R("revenue",p)}*${A(c.ratioAssumptionId,p)}`:`${p?R(`cost.${c.id}`,p-1):I(`cost.${c.id}.base`,p)}*(1+${A(c.growthAssumptionId,p)})`);
  add("operatingCosts","Operating costs",p=>sum(input.operatingCosts.map(c=>`ROUND(${R(`cost.${c.id}`,p)},8)`)));
  add("ebitda","EBITDA",p=>`${R("revenue",p)}-${R("operatingCosts",p)}`);
  for(const classification of ["maintenance","growth"] as const)add(`${classification}Capex`,`${classification} capex`,p=>sum(input.capex.filter(c=>c.classification===classification).map(c=>A(c.amountAssumptionId,p))));
  add("totalCapex","Total capex",p=>`${R("maintenanceCapex",p)}+${R("growthCapex",p)}`);
  add("depreciation","Depreciation",p=>`${A(input.existingAssetDepreciationAssumptionId,p)}+${sum(input.capex.flatMap(c=>periods.flatMap((_,v)=>{const age=p-v;const factor=c.depreciationConvention==="next_period"?(age>=1&&age<=c.usefulLifeYears?1:0):(age<0||age>c.usefulLifeYears?0:age===0||age===c.usefulLifeYears?0.5:1);return factor?[`${A(c.amountAssumptionId,v)}/${c.usefulLifeYears}*${factor}`]:[];})))}`);
  add("ebit","EBIT",p=>`${R("ebitda",p)}-${R("depreciation",p)}`);
  for(const d of input.debtInstruments){
    const k=(key:string)=>`debt.${d.instrumentId}.${key}`;
    // Declare all debt positions first because opening references the preceding closing row.
    const keys=["opening","preIndex","index","indexed","principal","coupon","closing","cashCoupon","cashIndexation","capitalizedCoupon","capitalizedIndexation","financeExpense"];
    keys.forEach((key,j)=>positions.set(k(key),calculations.length+j+1));
    add(k("opening"),`${d.instrumentId}: opening`,p=>p?R(k("closing"),p-1):I(k("base"),p));
    add(k("preIndex"),`${d.instrumentId}: pre-index`,p=>`${R(k("opening"),p)}+${I(k("drawdown"),p)}`);
    add(k("index"),`${d.instrumentId}: indexation`,p=>d.indexationTreatment==="not_applicable"?"0":`${R(k("preIndex"),p)}*${I(k("indexationRate"),p)}`);
    add(k("indexed"),`${d.instrumentId}: indexed principal`,p=>`${R(k("preIndex"),p)}${d.indexationTreatment==="capitalized_principal"?`+${R(k("index"),p)}`:""}`);
    add(k("principal"),`${d.instrumentId}: principal paid`,p=>d.periods[p]!.repayAll?`IF(${I(k("scheduledPrincipal"),p)}+${I(k("prepayment"),p)}<>0,NA(),${R(k("indexed"),p)})`:`IF(${I(k("scheduledPrincipal"),p)}+${I(k("prepayment"),p)}>${R(k("indexed"),p)},NA(),${I(k("scheduledPrincipal"),p)}+${I(k("prepayment"),p)})`);
    add(k("coupon"),`${d.instrumentId}: coupon`,p=>`MAX(0,${d.couponBase==="opening_principal"?R(k("preIndex"),p):d.couponBase==="average_principal"?`${R(k("indexed"),p)}-${R(k("principal"),p)}/2`:R(k("indexed"),p)})*${I(k("couponRate"),p)}`);
    add(k("closing"),`${d.instrumentId}: closing`,p=>`${R(k("indexed"),p)}${d.couponTreatment==="capitalized_principal"?`+${R(k("coupon"),p)}`:""}-${R(k("principal"),p)}`);
    add(k("cashCoupon"),`${d.instrumentId}: cash coupon`,p=>d.couponTreatment==="cash_paid"?R(k("coupon"),p):"0");
    add(k("cashIndexation"),`${d.instrumentId}: cash indexation`,p=>d.indexationTreatment==="cash_paid"?R(k("index"),p):"0");
    add(k("capitalizedCoupon"),`${d.instrumentId}: capitalized coupon`,p=>d.couponTreatment==="capitalized_principal"?R(k("coupon"),p):"0");
    add(k("capitalizedIndexation"),`${d.instrumentId}: capitalized indexation`,p=>d.indexationTreatment==="capitalized_principal"?R(k("index"),p):"0");
    add(k("financeExpense"),`${d.instrumentId}: finance expense`,p=>`${R(k("index"),p)}+${R(k("coupon"),p)}`);
  }
  for(const [key,debtKey] of [["openingGrossDebt","opening"],["closingGrossDebt","closing"],["principalPaid","principal"],["cashCoupon","cashCoupon"],["cashIndexation","cashIndexation"],["capitalizedCoupon","capitalizedCoupon"],["capitalizedIndexation","capitalizedIndexation"],["financeExpense","financeExpense"]]) add(key!,key!,p=>sum(input.debtInstruments.map(d=>`ROUND(${R(`debt.${d.instrumentId}.${debtKey}`,p)},8)`)));
  add("debtDrawdown","Drawdown",p=>sum(input.debtInstruments.map(d=>I(`debt.${d.instrumentId}.drawdown`,p))));
  add("accountingEbt","Earnings before tax",p=>`${R("ebit",p)}-${R("financeExpense",p)}`);
  // Tax carry-forwards form two forward-only recurrences.
  const taxKeys=["priorDisallowed","interestCapacity","deductible","priorUsed","disallowedInterestCarryforward","preNol","currentLoss","priorNol","nolUsed","taxLossCarryforward","taxableIncome","cashTax","netIncome"];
  taxKeys.forEach((key,j)=>positions.set(key,calculations.length+j+1));
  add("priorDisallowed","Opening disallowed interest",p=>p?R("disallowedInterestCarryforward",p-1):I("opening.disallowedInterest",p));
  add("interestCapacity","Interest capacity",p=>input.taxes.interestDeductibilityEbitdaPctAssumptionId?`MAX(${R("ebitda",p)},0)*${A(input.taxes.interestDeductibilityEbitdaPctAssumptionId,p)}`:`${R("financeExpense",p)}+${R("priorDisallowed",p)}`);
  add("deductible","Deductible interest",p=>`MIN(${R("financeExpense",p)},${R("interestCapacity",p)})`);
  add("priorUsed","Prior interest utilized",p=>`MIN(${R("priorDisallowed",p)},MAX(${R("interestCapacity",p)}-${R("deductible",p)},0))`);
  add("disallowedInterestCarryforward","Closing disallowed interest",p=>`${R("priorDisallowed",p)}+${R("financeExpense",p)}-${R("deductible",p)}-${R("priorUsed",p)}`);
  add("preNol","Pre-loss taxable income",p=>`MAX(${R("ebit",p)}-${R("deductible",p)}-${R("priorUsed",p)},0)`);
  add("currentLoss","Current tax loss",p=>`MAX(-(${R("ebit",p)}-${R("deductible",p)}-${R("priorUsed",p)}),0)`);
  add("priorNol","Opening tax loss",p=>p?R("taxLossCarryforward",p-1):I("opening.taxLoss",p));
  add("nolUsed","Tax loss utilized",p=>`MIN(${R("priorNol",p)},${R("preNol",p)})`);
  add("taxLossCarryforward","Closing tax loss",p=>`${R("priorNol",p)}-${R("nolUsed",p)}+${R("currentLoss",p)}`);
  add("taxableIncome","Taxable income",p=>`${R("preNol",p)}-${R("nolUsed",p)}`);
  add("cashTax","Cash tax",p=>`${R("taxableIncome",p)}*${A(input.taxes.cashTaxRateAssumptionId,p)}`);
  add("netIncome","Net income",p=>`${R("accountingEbt",p)}-${R("cashTax",p)}`);
  for(const [key,base,assumption,divisor] of [["receivables","revenue",input.workingCapital.dsoAssumptionId,365],["inventory","operatingCosts",input.workingCapital.dioAssumptionId,365],["payables","operatingCosts",input.workingCapital.dpoAssumptionId,365],["otherCurrentAssets","revenue",input.workingCapital.otherCurrentAssetsPctRevenueAssumptionId,1],["otherCurrentLiabilities","revenue",input.workingCapital.otherCurrentLiabilitiesPctRevenueAssumptionId,1]] as const) add(key,key,p=>`${R(base,p)}*${A(assumption,p)}/${divisor}`);
  add("netWorkingCapital","Net working capital",p=>`${R("receivables",p)}+${R("inventory",p)}+${R("otherCurrentAssets",p)}-${R("payables",p)}-${R("otherCurrentLiabilities",p)}`);
  add("changeInNetWorkingCapital","Change in working capital",p=>`${R("netWorkingCapital",p)}-(${p?R("netWorkingCapital",p-1):`${I("opening.receivables",p)}+${I("opening.inventory",p)}+${I("opening.otherCurrentAssets",p)}-${I("opening.payables",p)}-${I("opening.otherCurrentLiabilities",p)}`})`);
  add("cfads","CFADS",p=>`${R("ebitda",p)}-${R("cashTax",p)}-${R("changeInNetWorkingCapital",p)}-${R("totalCapex",p)}`);
  add("debtService","Debt service",p=>`${R("cashCoupon",p)}+${R("cashIndexation",p)}+${R("principalPaid",p)}`);
  add("distributions","Distributions",p=>A(input.distributionsAssumptionId,p));
  add("unrestrictedCash","Unrestricted cash",p=>`${p?R("unrestrictedCash",p-1):I("opening.unrestrictedCash",p)}+${R("cfads",p)}-${R("debtService",p)}+${R("debtDrawdown",p)}-${R("distributions",p)}`);
  add("netPpe","Net PP&E",p=>`${p?R("netPpe",p-1):I("opening.netPpe",p)}+${R("totalCapex",p)}-${R("depreciation",p)}`);
  add("equity","Equity",p=>`${p?R("equity",p-1):I("opening.equity",p)}+${R("netIncome",p)}-${R("distributions",p)}`);
  for(const key of ["restrictedCash","otherAssets","otherLiabilities"])add(key,key,p=>I(`opening.${key}`,p));
  add("totalAssets","Total assets",p=>sum(["unrestrictedCash","restrictedCash","receivables","inventory","otherCurrentAssets","netPpe","otherAssets"].map(k=>R(k,p))));
  add("totalLiabilitiesAndEquity","Liabilities and equity",p=>sum(["payables","otherCurrentLiabilities","closingGrossDebt","otherLiabilities","equity"].map(k=>R(k,p))));
  add("balanceCheck","Balance check",p=>`${R("totalAssets",p)}-${R("totalLiabilitiesAndEquity",p)}`);
  add("netDebt","Net debt",p=>`${R("closingGrossDebt",p)}-${R("unrestrictedCash",p)}`);
  for(const [key,num,den] of [["dscr","cfads","debtService"],["netDebtToEbitda","netDebt","ebitda"]]) add(key!,key!,p=>`IF(${R(den!,p)}<=0,"",${R(num!,p)}/${R(den!,p)})`,"multiple");
  add("liquidityHeadroom","Liquidity headroom",p=>`${R("unrestrictedCash",p)}-${A(input.minimumOperatingCashAssumptionId,p)}`);
  const outputKeys:readonly [keyof InstitutionalModelPeriod,string,string][]=[ ["revenue","Receita","Revenue"],["ebitda","EBITDA","EBITDA"],["cashTax","Tributos pagos","Cash tax"],["netIncome","Resultado líquido","Net income"],["cfads","Caixa disponível para serviço da dívida","Cash available for debt service"],["debtService","Serviço da dívida","Debt service"],["closingGrossDebt","Dívida bruta","Gross debt"],["unrestrictedCash","Caixa disponível","Unrestricted cash"],["netDebtToEbitda","Dívida líquida / EBITDA","Net debt / EBITDA"],["dscr","DSCR","DSCR"],["liquidityHeadroom","Folga de liquidez","Liquidity headroom"],["totalAssets","Ativo total","Total assets"],["totalLiabilitiesAndEquity","Passivo e patrimônio líquido","Liabilities and equity"],["balanceCheck","Conciliação do balanço","Balance check"]];
  const output:ModelSheet={key:`institutional_live_${index}`,name:outputName,widths:[48,...periods.map(()=>20)],rows:[{key:"head",cells:[{role:"header",value:input.assumptionBook.scenarioName},...periods.map(value=>({role:"header" as const,value}))]}, {key:"scope",cells:[{role:"note",value:lang==="pt"?"Simulação local. Edite as células azuis em Premissas. Alterações não modificam a aprovação na plataforma. Indicador vazio: denominador não positivo.":"Local what-if. Edit blue cells on Inputs. Changes do not modify platform approval. Blank ratio: nonpositive denominator."}]},...outputKeys.map(([key,pt,en])=>({key,cells:[label(lang==="pt"?pt:en),...periods.map((_,p)=>({role:"formula" as const,formula:["dscr","netDebtToEbitda"].includes(key)?`IF(${R(key,p)}="","",ROUND(${R(key,p)},8))`:`ROUND(${R(key,p)},8)`,format:["dscr","netDebtToEbitda"].includes(key)?"multiple" as const:"money" as const}))]}))]};
  return [output,{key:"assumptions",name:inputName,widths:[48,...periods.map(()=>20)],rows},{key:`institutional_build_${index}`,name:calcName,widths:[48,...periods.map(()=>20)],rows:calculations}];
}
