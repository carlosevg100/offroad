import type {ReconciledFact} from "@offroad/reconciliation";
import type {InstitutionalModelConfiguration,InstitutionalFactSelection,InstitutionalModelSource} from "./institutional-input";
import type {AssumptionUnit} from "./assumptions";
export function institutionalInputFixture(){
  const source:InstitutionalModelSource={sourceDocument:"synthetic-accounts",version:"1",hash:"a".repeat(64),asOfDate:"2026-12-31",currency:"BRL",amountScale:"units"};
  const facts:ReconciledFact[]=[];
  const selection=(metric:string,value:string,flow=false):InstitutionalFactSelection=>{
    const fieldPath=`historical_financials.2026.${metric}`;
    const binding={fieldPath,periodEnd:"2026-12-31",...(flow?{periodStart:"2026-01-01"}:{}),entityName:"Synthetic open business",entityScope:"standalone" as const,sourceDocument:source.sourceDocument,sourceVersion:source.version,sourceHash:source.hash};
    facts.push({key:{fieldPath,periodEnd:binding.periodEnd,entityName:binding.entityName},value,valueType:"number",accepted:{fieldPath,normalizedValue:value,valueType:"number",sourceDocument:source.sourceDocument,evidenceRank:1,informationClass:"audited",confidence:1,anchorVerified:true,anchor:{sheet:"Financials",cell:metric},periodEnd:binding.periodEnd,...(flow?{periodStart:binding.periodStart!}:{}),entityName:binding.entityName,entityScope:binding.entityScope},conflicts:[],disputed:false});
    return binding;
  };
  const periods=["2027","2028","2029","2030"];
  const assumption=(id:string,unit:AssumptionUnit,value:string)=>({id,label:{pt:id,en:id},unit,values:Object.fromEntries(periods.map(p=>[p,value])),sourceType:"company_budget" as const,evidence:[{sourceId:source.sourceDocument,title:"Synthetic budget",asOfDate:source.asOfDate,locator:"Assumptions"}],rationale:"Explicit synthetic premise",methodology:"Supplied annual assumption",confidence:"medium" as const,editable:true,impacts:["model"]});
  const config:InstitutionalModelConfiguration={
    modelId:"synthetic-institutional",currency:"BRL",
    assumptionBook:{scenarioId:"synthetic-base",scenarioName:"Synthetic base",asOfDate:source.asOfDate,periods,assumptions:[assumption("no-change","percent","0"),assumption("no-addition","currency","0"),assumption("cost-ratio","percent","0.5"),assumption("days","days","0"),assumption("investment","currency","100")]},
    openingBalanceSheet:{period:"2026",bindings:{unrestrictedCash:selection("cash","100"),restrictedCash:selection("restricted_cash","0"),receivables:selection("receivables","0"),inventory:selection("inventory","0"),otherCurrentAssets:selection("other_current_assets","0"),netPpe:selection("net_ppe","1000"),otherAssets:selection("other_assets","0"),payables:selection("payables","0"),otherCurrentLiabilities:selection("other_current_liabilities","0"),grossDebt:selection("gross_debt","100"),otherLiabilities:selection("other_liabilities","0"),equity:selection("equity","1000")}},
    revenueSegments:[{id:"activity",baseRevenue:selection("revenue","365",true),volumeGrowthAssumptionId:"no-change",priceGrowthAssumptionId:"no-change",mixEffectAssumptionId:"no-change",fxEffectAssumptionId:"no-change",inorganicRevenueAssumptionId:"no-addition"}],
    operatingCosts:[{id:"costs",method:"percent_of_revenue",ratioAssumptionId:"cost-ratio"}],
    capex:[{id:"maintenance",classification:"maintenance",amountAssumptionId:"investment",usefulLifeYears:1,depreciationConvention:"half_year"}],existingAssetDepreciationAssumptionId:"no-addition",
    workingCapital:{dsoAssumptionId:"days",dioAssumptionId:"days",dpoAssumptionId:"days",otherCurrentAssetsPctRevenueAssumptionId:"no-change",otherCurrentLiabilitiesPctRevenueAssumptionId:"no-change"},
    taxes:{cashTaxRateAssumptionId:"no-change",openingTaxLossCarryforward:selection("tax_loss_carryforward","0"),openingDisallowedInterestCarryforward:selection("disallowed_interest_carryforward","0")},
    debtInstruments:[{instrumentId:"loan",openingPrincipal:"100",indexer:"fixed",indexationTreatment:"not_applicable",couponTreatment:"cash_paid",couponBase:"opening_principal",periods:periods.map(period=>({period,indexationRate:"0",couponRate:"0",drawdown:"0",scheduledPrincipal:"0",prepayment:"0"}))}],
    debtRateLineage:periods.map(period=>({instrumentId:"loan",period,indexationSourceId:source.sourceDocument,indexationAsOfDate:source.asOfDate,indexationMethodology:"Explicit fixed basis",couponSourceId:source.sourceDocument,couponAsOfDate:source.asOfDate,couponMethodology:"Explicit synthetic zero coupon"})),
    distributionsAssumptionId:"no-addition",minimumOperatingCashAssumptionId:"no-addition",
  };
  return {facts,sources:[source],configuration:config};
}
