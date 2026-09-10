import ptMessages from "../../../messages/pt-BR.json";
import enMessages from "../../../messages/en-US.json";
import {normalizeDeclaredAssumptionValue} from "@offroad/financial-core";
import type {InstitutionalModelConfiguration} from "@offroad/financial-model";

export type SetupSource = {sourceDocument: string; version: string; hash: string; hashVerified: boolean; originalName: string};
export type SetupFact = {label?:string;id: string; field_path: string; normalized_value: unknown; value_type: string; source_document_id: string; period_start: string | null; period_end: string | null; entity_name: string | null; entity_scope: string | null; source_anchor: unknown; anchor_verified: boolean; review_state: string; currency: string | null; unit: string | null; value_scale: unknown; extraction_document_version: string | number | null; extraction_source_sha256: string | null};
export const openingKeys = ["unrestrictedCash","restrictedCash","receivables","inventory","otherCurrentAssets","netPpe","otherAssets","payables","otherCurrentLiabilities","grossDebt","otherLiabilities","equity"] as const;
export const premiseKeys = ["volumeGrowth","priceGrowth","mixEffect","fxEffect","inorganicRevenue","costRatio","existingDepreciation","dso","dio","dpo","otherCurrentAssetsRatio","otherCurrentLiabilitiesRatio","cashTaxRate","distributions","minimumCash"] as const;
export const premiseUnits = {volumeGrowth:"percent",priceGrowth:"percent",mixEffect:"percent",fxEffect:"percent",inorganicRevenue:"currency",costRatio:"percent",existingDepreciation:"currency",dso:"days",dio:"days",dpo:"days",otherCurrentAssetsRatio:"percent",otherCurrentLiabilitiesRatio:"percent",cashTaxRate:"percent",distributions:"currency",minimumCash:"currency"} as const;
export type SetupPremise = {label: {pt: string; en: string}; rationale: string; values: Record<string,string>};
export type SetupDraft = {currency: string; asOfDate: string; baseYear: string; periods: string[]; selections: Record<string,string>; premises: Record<string,SetupPremise>; noDebtRationale: string; noCapexRationale: string;
 capex: Array<{classification:"maintenance"|"growth"; usefulLifeYears:number; depreciationConvention:"next_period"|"half_year"; premise:SetupPremise}>;
 debt: InstitutionalModelConfiguration["debtInstruments"]; debtRateLineage: InstitutionalModelConfiguration["debtRateLineage"]};
/** A bounded aggregate corporate starter. Historical amounts always reference selected facts;
 * forecast numbers are explicit user scenarios. No implicit zero and no raw-scale multiplication. */
export function compileInstitutionalSetupForm(input:{draft:SetupDraft; facts:SetupFact[]; sources:SetupSource[]; actorId:string; submittedAt:string; submissionId:string}): InstitutionalModelConfiguration {
 const {draft}=input;
 const fail=():never=>{throw new Error("institutional_setup_incomplete");};
 if(!/^\d{4}$/.test(draft.baseYear)||!draft.periods.length||draft.periods.length>40||new Set(draft.periods).size!==draft.periods.length||draft.periods.some((p,i)=>Number(p)!==Number(draft.baseYear)+i+1))fail();
 const select=(key:string)=>{const matches=input.facts.filter(f=>f.id===draft.selections[key]);if(matches.length!==1) return fail();const f=matches[0]!;const source=input.sources.find(s=>s.sourceDocument===f.source_document_id);
 if(!source?.hashVerified||!f.anchor_verified||f.review_state!=="accepted"||!f.period_end||!f.entity_name||!["consolidated","standalone","segment"].includes(f.entity_scope??"")||String(f.extraction_document_version)!==source.version||f.extraction_source_sha256!==source.hash) return fail();
 return {fieldPath:f.field_path,periodEnd:f.period_end,...(f.period_start?{periodStart:f.period_start}:{}),entityName:f.entity_name,entityScope:f.entity_scope as "consolidated"|"standalone"|"segment",sourceDocument:source.sourceDocument,sourceVersion:source.version,sourceHash:source.hash};};
 const assumptions:InstitutionalModelConfiguration["assumptionBook"]["assumptions"][number][]=[];
 const add=(id:string,premise:SetupPremise|undefined,unit:"currency"|"percent"|"days")=>{if(!premise?.rationale.trim()||!premise.label.pt.trim()||!premise.label.en.trim())return fail();const values=Object.fromEntries(draft.periods.map(period=>{const raw=premise.values[period]?.trim();if(!raw||!/^[-]?\d+(?:[.,]\d+)?$/.test(raw))return fail();return [period,normalizeDeclaredAssumptionValue(raw.replace(",","."),unit).value];}));
 assumptions.push({id,label:premise.label,unit,values,sourceType:"offroad_scenario",evidence:[],rationale:premise.rationale,methodology:"Explicit user scenario entered through the guided setup.",confidence:"low",editable:true,impacts:["financial_model"]});return id;};
 for(const key of premiseKeys){const premise=draft.premises[key];add(key,premise?{...premise,label:{pt:ptMessages.InstitutionalSetup.premises[key],en:enMessages.InstitutionalSetup.premises[key]}}:undefined,premiseUnits[key]);}
 const capex=draft.capex.map((c,i)=>({id:`capex-${i+1}`,classification:c.classification,usefulLifeYears:c.usefulLifeYears,depreciationConvention:c.depreciationConvention,amountAssumptionId:add(`capex-${i+1}`,c.premise,"currency")}));
 const absence=(rationale:string)=>{if(!rationale.trim())return fail();return {confirmedBy:input.actorId,confirmedAt:input.submittedAt,rationale};};
 return {modelId:`setup:${input.submissionId}`,currency:draft.currency,
  absenceConfirmations:{...(draft.debt.length?{}:{debtInstruments:absence(draft.noDebtRationale)}),...(capex.length?{}:{capex:absence(draft.noCapexRationale)})},
  assumptionBook:{scenarioId:`setup:${input.submissionId}`,scenarioName:"User scenario",asOfDate:draft.asOfDate,periods:draft.periods,assumptions},
  openingBalanceSheet:{period:draft.baseYear,bindings:Object.fromEntries(openingKeys.map(k=>[k,select(k)])) as InstitutionalModelConfiguration["openingBalanceSheet"]["bindings"]},
  revenueSegments:[{id:"aggregate-revenue",baseRevenue:select("baseRevenue"),volumeGrowthAssumptionId:"volumeGrowth",priceGrowthAssumptionId:"priceGrowth",mixEffectAssumptionId:"mixEffect",fxEffectAssumptionId:"fxEffect",inorganicRevenueAssumptionId:"inorganicRevenue"}],
  operatingCosts:[{id:"aggregate-costs",method:"percent_of_revenue",ratioAssumptionId:"costRatio"}],capex,existingAssetDepreciationAssumptionId:"existingDepreciation",
  workingCapital:{dsoAssumptionId:"dso",dioAssumptionId:"dio",dpoAssumptionId:"dpo",otherCurrentAssetsPctRevenueAssumptionId:"otherCurrentAssetsRatio",otherCurrentLiabilitiesPctRevenueAssumptionId:"otherCurrentLiabilitiesRatio"},
  taxes:{cashTaxRateAssumptionId:"cashTaxRate",openingTaxLossCarryforward:select("taxLossCarryforward"),openingDisallowedInterestCarryforward:select("disallowedInterestCarryforward")},
  debtInstruments:draft.debt,debtRateLineage:draft.debtRateLineage,distributionsAssumptionId:"distributions",minimumOperatingCashAssumptionId:"minimumCash"};
}
