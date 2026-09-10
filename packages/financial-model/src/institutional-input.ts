import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import type {ReconciledFact} from "@offroad/reconciliation";
import {validateAssumptionBook, type AssumptionUnit} from "./assumptions";
import type {InstitutionalModelInput, OpeningBalanceSheet, RevenueSegmentDriver, OperatingCostDriver, TaxDrivers} from "./institutional-model";

export type InstitutionalModelSource = {
  sourceDocument: string;
  version: string;
  hash: string;
  asOfDate: string;
  /** Denomination of selected historical amounts, explicitly reviewed upstream. */
  currency: string | null;
  amountScale: "units" | "thousands" | "millions" | null;
};
export type InstitutionalFactSelection = {
  fieldPath: string;
  periodEnd: string;
  /** Required for flow amounts; omit for opening balance-sheet stocks. */
  periodStart?: string;
  entityName: string;
  entityScope: "consolidated" | "standalone" | "segment";
  sourceDocument: string;
  sourceVersion: string;
  sourceHash: string;
};
type OpeningAmount = Exclude<keyof OpeningBalanceSheet,"period">;
type CostSelection = Extract<OperatingCostDriver,{method:"percent_of_revenue"}>
  | (Omit<Extract<OperatingCostDriver,{method:"base_and_growth"}>,"baseCost"> & {baseCost:InstitutionalFactSelection});
export type InstitutionalModelConfiguration = Omit<InstitutionalModelInput,"openingBalanceSheet"|"revenueSegments"|"operatingCosts"|"taxes"> & {
  absenceConfirmations?: {debtInstruments?: {confirmedBy:string;confirmedAt:string;rationale:string};capex?: {confirmedBy:string;confirmedAt:string;rationale:string}};
  openingBalanceSheet: {period:string; bindings:Record<OpeningAmount,InstitutionalFactSelection>};
  revenueSegments: readonly (Omit<RevenueSegmentDriver,"baseRevenue"> & {baseRevenue:InstitutionalFactSelection})[];
  operatingCosts: readonly CostSelection[];
  taxes: Omit<TaxDrivers,"openingTaxLossCarryforward"|"openingDisallowedInterestCarryforward"> & {
    openingTaxLossCarryforward:InstitutionalFactSelection;
    openingDisallowedInterestCarryforward:InstitutionalFactSelection;
  };
};
export type InstitutionalModelInputGap = {
  targetPath:string;
  code:"configuration_required"|"fact_missing"|"fact_ambiguous"|"fact_disputed"|"fact_invalid"|"source_unbound"|"period_mismatch"|"unit_mismatch"|"configuration_invalid"|"assumption_invalid";
  detail:string;
};
export type InstitutionalFactLineage = {
  targetPath:string;fieldPath:string;periodStart?:string;periodEnd:string;entityName:string;entityScope:string;
  value:string;sourceDocument:string;sourceVersion:string;sourceHash:string;sourceAsOfDate:string;anchor:unknown;
};
export type PreparedInstitutionalModelInput = {
  status:"ready"|"missing_inputs";
  input:InstitutionalModelInput|null;
  missingInputs:readonly InstitutionalModelInputGap[];
  lineage:readonly InstitutionalFactLineage[];
  inputFingerprint:string|null;
  sourceBindings:readonly InstitutionalModelSource[];
  configurationFingerprint:string;
  limitations:readonly string[];
};
const openingFields:readonly OpeningAmount[]=["unrestrictedCash","restrictedCash","receivables","inventory","otherCurrentAssets","netPpe","otherAssets","payables","otherCurrentLiabilities","grossDebt","otherLiabilities","equity"];
const validDate=(value:string)=> /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
const hash=(value:unknown)=>createHash("sha256").update(stableJson(value)).digest("hex");
function stableJson(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(stableJson).join(",")}]`;
  if(value!==null&&typeof value==="object")return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Assemble existing reconciled facts and a reviewed scenario configuration without defaults.
 * This pure adapter does not verify tenant authority, documents or scenario approval: callers
 * must supply those through their governed readers. Missing inputs never become zero balances.
 */
export function prepareInstitutionalModelInput(request:{
  facts:readonly ReconciledFact[];
  sources:readonly InstitutionalModelSource[];
  configuration?:InstitutionalModelConfiguration;
}):PreparedInstitutionalModelInput {
  const missingInputs:InstitutionalModelInputGap[]=[];
  const lineage:InstitutionalFactLineage[]=[];
  const limitations=[
    "Annual model only; all historical amounts must be explicitly denominated in model-currency units.",
    "Historical balances and drivers use one evidenced entity/perimeter; cross-entity consolidation requires a separately reviewed mapping and is not inferred here.",
    "Source versions, denomination and scenario configuration are supplied by governed callers; this adapter is not an authorization or document-verification boundary.",
    "Readiness assembles inputs only; arithmetic review, sector applicability and release approval remain separate.",
  ];
  const gap=(targetPath:string,code:InstitutionalModelInputGap["code"],detail:string)=>{missingInputs.push({targetPath,code,detail});};
  const blocked=():PreparedInstitutionalModelInput=>({status:"missing_inputs",input:null,missingInputs,lineage,inputFingerprint:null,sourceBindings:[],configurationFingerprint:hash(request.configuration??null),limitations});
  const config=request.configuration;
  if(!config){gap("configuration","configuration_required","A reviewed assumption book, instrument ledger and explicit historical selections are required.");return blocked();}
  const openingYear=config.openingBalanceSheet.period;
  const periods=config.assumptionBook.periods;
  if(!/^\d{4}$/.test(openingYear)||periods.length===0||periods.some((p,i)=>!/^\d{4}$/.test(p)||Number(p)!==Number(openingYear)+i+1))gap("periods","period_mismatch","Opening and forecast periods must be consecutive annual years.");
  if(!validDate(config.assumptionBook.asOfDate))gap("assumptionBook.asOfDate","configuration_invalid","A real as-of date is required.");
  if(!/^[A-Z]{3}$/.test(config.currency))gap("currency","unit_mismatch","An explicit model currency is required.");
  const asOf=config.assumptionBook.asOfDate;
  const select=(selection:InstitutionalFactSelection|undefined,targetPath:string,flow=false):string|null=>{
    if(!selection){gap(targetPath,"fact_missing","An explicit historical fact selection is required, including an evidenced zero when applicable.");return null;}
    if(!selection.entityName?.trim()||!["consolidated","standalone","segment"].includes(selection.entityScope)){
      gap(targetPath,"fact_invalid","Entity and perimeter must be explicit.");return null;
    }
    if(!validDate(selection.periodEnd)||selection.periodEnd!==`${openingYear}-12-31`||selection.periodEnd>asOf
      ||(flow&&selection.periodStart!==`${openingYear}-01-01`)){
      gap(targetPath,"period_mismatch","Historical opening stocks and annual flows must match the selected base period before the model as-of date.");return null;
    }
    const candidates=request.facts.filter(f=>f.key.fieldPath===selection.fieldPath&&f.key.periodEnd===selection.periodEnd
      &&f.key.entityName===selection.entityName&&f.accepted.entityScope===selection.entityScope
      &&f.accepted.sourceDocument===selection.sourceDocument);
    if(candidates.length!==1){gap(targetPath,candidates.length?"fact_ambiguous":"fact_missing","Exactly one reconciled fact must match the selected field, period, entity, perimeter and source.");return null;}
    const fact=candidates[0]!;
    if(fact.disputed){gap(targetPath,"fact_disputed","Resolve the disputed fact before using it in the model.");return null;}
    if(fact.valueType!=="number"||fact.accepted.valueType!=="number"||!fact.accepted.anchorVerified
      ||fact.accepted.anchor===undefined||fact.accepted.anchor===null||stableJson(fact.accepted.anchor)==="{}"
      ||fact.accepted.fieldPath!==selection.fieldPath||fact.accepted.periodEnd!==selection.periodEnd||fact.accepted.entityName!==selection.entityName
      ||(flow&&fact.accepted.periodStart!==selection.periodStart)
      ||/project|forecast|budget/i.test(fact.accepted.informationClass)||! /^(historical_financials|interim_financials)\./.test(selection.fieldPath)){
      gap(targetPath,"fact_invalid","Use an anchored historical numeric fact with matching period and entity, never a projection substituted for history.");return null;
    }
    try{
      if(!new Decimal(fact.value).isFinite()||!new Decimal(fact.value).eq(fact.accepted.normalizedValue))throw new Error();
    }catch{gap(targetPath,"fact_invalid","The reconciled and accepted numeric values must agree and be finite.");return null;}
    const sources=request.sources.filter(s=>s.sourceDocument===selection.sourceDocument);
    const source=sources.length===1?sources[0]:undefined;
    if(!source||!source.version.trim()||! /^[a-f0-9]{64}$/i.test(source.hash)||source.version!==selection.sourceVersion
      ||source.hash!==selection.sourceHash||!validDate(source.asOfDate)||source.asOfDate>asOf){
      gap(targetPath,"source_unbound","The selected source version/hash must match one dated current source declaration.");return null;
    }
    if(source.currency!==config.currency||source.amountScale!=="units"){
      gap(targetPath,"unit_mismatch","Historical values must already be normalized to model-currency units; source presentation scale must not be applied twice.");return null;
    }
    lineage.push({targetPath,fieldPath:selection.fieldPath,...(selection.periodStart?{periodStart:selection.periodStart}:{}),periodEnd:selection.periodEnd,
      entityName:selection.entityName,entityScope:selection.entityScope,value:fact.value,sourceDocument:source.sourceDocument,
      sourceVersion:source.version,sourceHash:source.hash,sourceAsOfDate:source.asOfDate,anchor:fact.accepted.anchor});
    return fact.value;
  };
  const values:Partial<Record<OpeningAmount,string>>={};
  const openingSelections=openingFields.map(field=>config.openingBalanceSheet.bindings[field]).filter(Boolean);
  if(new Set(openingSelections.map(s=>`${s.entityName}|${s.entityScope}`)).size>1)gap("openingBalanceSheet","configuration_invalid","Opening balances must belong to one explicit entity and perimeter; do not consolidate by addition.");
  for(const field of openingFields){const value=select(config.openingBalanceSheet.bindings[field],`openingBalanceSheet.${field}`);if(value!==null)values[field]=value;}
  const perimeter=openingSelections[0];
  const driverSelections=[...config.revenueSegments.map(s=>s.baseRevenue),...config.operatingCosts.flatMap(c=>c.method==="base_and_growth"?[c.baseCost]:[]),config.taxes.openingTaxLossCarryforward,config.taxes.openingDisallowedInterestCarryforward];
  if(perimeter&&driverSelections.some(s=>s&&(s.entityName!==perimeter.entityName||s.entityScope!==perimeter.entityScope)))gap("historicalPerimeter","configuration_invalid","Historical drivers and tax balances must match the opening entity/perimeter; consolidation relationships are not inferred.");
  const revenueSegments=config.revenueSegments.map(segment=>({...segment,baseRevenue:select(segment.baseRevenue,`revenueSegments.${segment.id}.baseRevenue`,true)}));
  const operatingCosts=config.operatingCosts.map(cost=>cost.method==="percent_of_revenue"?cost:{...cost,baseCost:select(cost.baseCost,`operatingCosts.${cost.id}.baseCost`,true)});
  const openingTaxLossCarryforward=select(config.taxes.openingTaxLossCarryforward,"taxes.openingTaxLossCarryforward");
  const openingDisallowedInterestCarryforward=select(config.taxes.openingDisallowedInterestCarryforward,"taxes.openingDisallowedInterestCarryforward");
  for(const [path,rows] of [["revenueSegments",config.revenueSegments],["operatingCosts",config.operatingCosts],["capex",config.capex],["debtInstruments",config.debtInstruments]] as const){
    const ids=rows.map(row=>"id" in row?row.id:row.instrumentId);
    const absence = path === "capex" || path === "debtInstruments" ? config.absenceConfirmations?.[path] : undefined;
    const confirmedAbsent = absence && absence.confirmedBy.trim() && absence.rationale.trim() && Number.isFinite(Date.parse(absence.confirmedAt));
    if((!ids.length&&!confirmedAbsent)||ids.some(id=>!id.trim())||new Set(ids).size!==ids.length)gap(path,"configuration_invalid","Explicit unique driver/instrument identities or reviewed confirmation of no debt/capex are required.");
    if(ids.length&&absence)gap(path,"configuration_invalid","Absence confirmation conflicts with supplied instruments or capex.");
  }
  const requireAssumption=(id:string|undefined,unit:AssumptionUnit,path:string)=>{
    const assumption=config.assumptionBook.assumptions.find(a=>a.id===id);
    if(!assumption){gap(path,"assumption_invalid","An explicit governed assumption is required, including zero or no-change premises.");return;}
    if(assumption.unit!==unit)gap(path,"unit_mismatch",`Assumption ${id} must use ${unit}.`);
  };
  for(const segment of config.revenueSegments){for(const id of [segment.volumeGrowthAssumptionId,segment.priceGrowthAssumptionId,segment.mixEffectAssumptionId,segment.fxEffectAssumptionId])requireAssumption(id,"percent",`revenueSegments.${segment.id}`);requireAssumption(segment.inorganicRevenueAssumptionId,"currency",`revenueSegments.${segment.id}.inorganic`);}
  for(const cost of config.operatingCosts)requireAssumption(cost.method==="percent_of_revenue"?cost.ratioAssumptionId:cost.growthAssumptionId,"percent",`operatingCosts.${cost.id}`);
  for(const item of config.capex)requireAssumption(item.amountAssumptionId,"currency",`capex.${item.id}`);
  for(const id of [config.existingAssetDepreciationAssumptionId,config.distributionsAssumptionId,config.minimumOperatingCashAssumptionId])requireAssumption(id,"currency","cashAndDepreciation");
  for(const id of [config.workingCapital.dsoAssumptionId,config.workingCapital.dioAssumptionId,config.workingCapital.dpoAssumptionId])requireAssumption(id,"days","workingCapital");
  for(const id of [config.workingCapital.otherCurrentAssetsPctRevenueAssumptionId,config.workingCapital.otherCurrentLiabilitiesPctRevenueAssumptionId,config.taxes.cashTaxRateAssumptionId])requireAssumption(id,"percent","workingCapitalAndTax");
  if(config.taxes.interestDeductibilityEbitdaPctAssumptionId)requireAssumption(config.taxes.interestDeductibilityEbitdaPctAssumptionId,"percent","taxes.interestLimit");
  for(const id of [config.minimumDscrAssumptionId,config.maximumNetLeverageAssumptionId])if(id)requireAssumption(id,"multiple","covenants");
  for(const issue of validateAssumptionBook(config.assumptionBook).filter(i=>i.severity==="blocker"))gap(`assumptionBook.${issue.assumptionId??"book"}`,"assumption_invalid",issue.message);
  for(const instrument of config.debtInstruments){
    if(instrument.periods.map(p=>p.period).join("|")!==periods.join("|"))gap(`debtInstruments.${instrument.instrumentId}`,"period_mismatch","Debt periods must match the annual model horizon.");
    for(const row of instrument.periods){
      if(row.drawdown===undefined||(!row.repayAll&&(row.scheduledPrincipal===undefined||row.prepayment===undefined)))gap(`debtInstruments.${instrument.instrumentId}.${row.period}`,"configuration_invalid","Explicit drawdown and repayment premises are required; absence is not a zero cash flow.");
    }
  }
  for(const assumption of config.assumptionBook.assumptions)for(const evidence of assumption.evidence){
    const sources=request.sources.filter(s=>s.sourceDocument===evidence.sourceId);
    if(sources.length!==1||!validDate(sources[0]!.asOfDate)||sources[0]!.asOfDate>asOf||!sources[0]!.version.trim()||! /^[a-f0-9]{64}$/i.test(sources[0]!.hash)||sources[0]!.asOfDate!==evidence.asOfDate)gap(`assumptionBook.${assumption.id}`,"source_unbound","Assumption evidence must resolve to one dated versioned source declaration.");
  }
  for(const instrument of config.debtInstruments)for(const row of instrument.periods){
    const links=config.debtRateLineage.filter(link=>link.instrumentId===instrument.instrumentId&&link.period===row.period);
    if(links.length!==1){gap(`debtRateLineage.${instrument.instrumentId}.${row.period}`,"source_unbound","Exactly one rate lineage entry is required per instrument and period.");continue;}
    const link=links[0]!;
    for(const [id,date] of [[link.indexationSourceId,link.indexationAsOfDate],[link.couponSourceId,link.couponAsOfDate]]){
      const sources=request.sources.filter(s=>s.sourceDocument===id);
      if(sources.length!==1||sources[0]!.asOfDate!==date||!validDate(date!)||date!>asOf||!sources[0]!.version.trim()||! /^[a-f0-9]{64}$/i.test(sources[0]!.hash))gap(`debtRateLineage.${instrument.instrumentId}.${row.period}`,"source_unbound","Rate lineage must resolve to a dated versioned source declaration.");
    }
  }
  if(missingInputs.length)return blocked();
  const input:InstitutionalModelInput={...config,
    openingBalanceSheet:{period:openingYear,...values} as OpeningBalanceSheet,
    revenueSegments:revenueSegments as RevenueSegmentDriver[],operatingCosts:operatingCosts as OperatingCostDriver[],
    taxes:{...config.taxes,openingTaxLossCarryforward:openingTaxLossCarryforward!,openingDisallowedInterestCarryforward:openingDisallowedInterestCarryforward!},
  };
  // Detach the snapshot from mutable workflow JSON and anchors before fingerprinting.
  const snapshot=JSON.parse(JSON.stringify(input)) as InstitutionalModelInput;
  const lineageSnapshot=JSON.parse(JSON.stringify(lineage)) as InstitutionalFactLineage[];
  const usedSourceIds=new Set([...lineage.map(link=>link.sourceDocument),...config.assumptionBook.assumptions.flatMap(a=>a.evidence.map(e=>e.sourceId)),...config.debtRateLineage.flatMap(link=>[link.indexationSourceId,link.couponSourceId])]);
  const sourceBindings=request.sources.filter(source=>usedSourceIds.has(source.sourceDocument)).map(source=>({...source})).sort((a,b)=>a.sourceDocument<b.sourceDocument?-1:a.sourceDocument>b.sourceDocument?1:0);
  return {status:"ready",input:snapshot,missingInputs:[],lineage:lineageSnapshot,sourceBindings,configurationFingerprint:hash(config),inputFingerprint:hash({input:snapshot,lineage:lineageSnapshot,sourceBindings}),limitations};
}

/** Exact scenario/configuration identity used for optimistic answer application. */
export const fingerprintInstitutionalModelConfiguration=(configuration:InstitutionalModelConfiguration)=>hash(configuration);
