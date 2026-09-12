import {applyCollateralHaircuts, calculateLeverage, calculateCovenantHeadroom, calculateProFormaPosition, reconcileSourcesAndUses, testDisbursementCoverage, sumValues, calculateImpliedEbitda, calculateMargin} from "@offroad/financial-core";
import {websiteAdvisorFixture} from "@offroad/testing-fixtures";
import type {AppLocale} from "@/i18n/routing";

export const boardScenarioKeys = ["base","plant","integrated","defer"] as const;
export type BoardScenarioKey = typeof boardScenarioKeys[number];

/** Orchestration and display only. Every financial operation is delegated to financial-core. */
export function websiteAdvisorExample(locale:AppLocale) {
  const fixture=websiteAdvisorFixture;
  const n=new Intl.NumberFormat(locale,{maximumFractionDigits:1});
  const ratio=new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2});
  const r=fixture.receivables;
  const eligible=applyCollateralHaircuts([{name:"illustrative_exclusions",grossValue:r.face,haircutRate:r.ineligibleHaircut}]);
  const full=applyCollateralHaircuts([{name:"illustrative_advance",grossValue:r.face,haircutRate:r.advanceHaircut}]);
  const restricted=applyCollateralHaircuts([{name:"illustrative_advance",grossValue:eligible.value,haircutRate:r.advanceHaircut}]);
  const b=fixture.board;
  const scenarios=Object.fromEntries(boardScenarioKeys.map(key=>{
    const s=b.scenarios[key];
    const flows=b.years.map((year,index)=>{
      const sources=[{id:"operating",amount:b.operatingCash[index]},{id:"draw",amount:s.draws[index]}];
      const uses=[{id:"maintenance",amount:b.maintenance[index]},{id:"expansion",amount:s.expansion[index]},{id:"dividend",amount:s.dividends[index]},{id:"maturity",amount:b.maturities[index]},{id:"fee",amount:s.fees[index]},{id:"interest",amount:s.incrementalInterest[index]},{id:"principal",amount:s.newPrincipal[index]},{id:"operating_shortfall",amount:s.operatingShortfall[index]}];
      const reconciled=reconcileSourcesAndUses({sources,uses,tolerance:"0"});
      return {period:String(year),openingLiquidity:b.openingCash,scheduledSources:reconciled.totalSources,scheduledUses:reconciled.totalUses,sources,uses};
    });
    const result=testDisbursementCoverage(flows);
    let grossDebt:string=b.openingGrossDebt;
    const rows=result.periods.map((row,index)=>{
      const repaid=reconcileSourcesAndUses({sources:[],uses:[{id:"maturity",amount:b.maturities[index]},{id:"new_principal",amount:s.newPrincipal[index]}],tolerance:"0"}).totalUses;
      const position=calculateProFormaPosition({grossDebt,unrestrictedCash:row.closing,newDebt:s.draws[index],refinancedDebt:repaid,feesPaidFromCash:"0",cashContribution:"0",adjustedEbitda:b.ebitda[index]});
      grossDebt=position.grossDebt;
      const cashHeadroom=calculateCovenantHeadroom({actual:row.closing,limit:b.minimumCash,direction:"minimum"});
      return {year:b.years[index],opening:n.format(Number(row.opening)),cash:n.format(Number(row.closing)),value:Number(row.closing),meetsFloor:cashHeadroom.passes,leverage:Number(row.closing)<0?null:position.leverage,netDebt:position.netDebt,sources:flows[index].sources.map(line=>({id:line.id,value:n.format(Number(line.amount))})),uses:flows[index].uses.map(line=>({id:line.id,value:n.format(Number(line.amount))}))};
    });
    return [key,{rows,values:[Number(b.openingCash),...rows.map(row=>row.value)],cash2027:rows[1].cash,cash2028:rows[2].cash,totalDraws:n.format(Number(sumValues(s.draws))),allYearsMeetFloor:rows.every(row=>row.meetsFloor)}];
  })) as Record<BoardScenarioKey,{rows:Array<{year:number;opening:string;cash:string;value:number;meetsFloor:boolean;leverage:string|null;netDebt:string;sources:Array<{id:string;value:string}>;uses:Array<{id:string;value:string}>}>;values:number[];cash2027:string;cash2028:string;totalDraws:string;allYearsMeetFloor:boolean}>;
  const selected=scenarios.integrated.rows[1];
  const downside=applyCollateralHaircuts([{name:"ebitda_only_sensitivity",grossValue:b.ebitda[1],haircutRate:b.downsideHaircut}]);
  const historical=b.history.map(row=>({...row,revenue:n.format(Number(row.revenue)),ebitda:n.format(Number(row.ebitda)),netDebt:n.format(Number(row.netDebt)),leverage:ratio.format(Number(calculateLeverage(row.netDebt,row.ebitda).value))}));
  const current=b.history[2];
  const minimumEbitda=calculateImpliedEbitda(current.netDebt,b.covenantLimit).value;
  const ebitdaHeadroom=calculateCovenantHeadroom({actual:current.ebitda,limit:minimumEbitda,direction:"minimum"}).absolute;
  return {
    receivables:{face:n.format(Number(r.face)),debtors:n.format(r.debtors),days:n.format(r.days),monthly:n.format(Number(r.monthlySales)),eligible:n.format(Number(eligible.value)),full:n.format(Number(full.value)),restricted:n.format(Number(restricted.value))},
    board:{years:[2025,...b.years],minimumCash:Number(b.minimumCash),history:historical,scenarios,covenantLimit:ratio.format(Number(b.covenantLimit)),leverage:ratio.format(Number(selected.leverage)),downsideLeverage:ratio.format(Number(calculateLeverage(selected.netDebt,downside.value).value)),downsideEbitda:n.format(Number(downside.value)),ebitdaHeadroom:n.format(Number(ebitdaHeadroom)),margin:new Intl.NumberFormat(locale,{style:"percent",maximumFractionDigits:1}).format(Number(calculateMargin(current.ebitda,current.revenue))),capex:n.format(Number(sumValues(b.expansion))),maturity:n.format(Number(b.maturities[1])),dividend:n.format(Number(b.dividends[0]))},
  };
}
export type WebsiteAdvisorExample = ReturnType<typeof websiteAdvisorExample>;
