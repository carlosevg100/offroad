import {z} from "zod";
import {createHash} from "node:crypto";
import type {ReconciledFact} from "@offroad/reconciliation";
import {prepareInstitutionalModelInput,fingerprintInstitutionalModelConfiguration,type InstitutionalModelConfiguration} from "./institutional-input";
import {buildInstitutionalFinancialModel} from "./institutional-model";
import {reviewInstitutionalFinancialModel} from "./review";
const text=z.string().trim().min(1).max(500);
const id=z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/);
const decimal=z.string().regex(/^-?\d+(?:\.\d+)?$/).max(100);
const year=z.string().regex(/^\d{4}$/);
const date=z.iso.date();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const units=z.enum(["currency","percent","days","multiple","quantity","index"]);
const absence=z.strictObject({confirmedBy:text,confirmedAt:z.iso.datetime({offset:true}),rationale:text});
export const institutionalFactSelectionSchema=z.strictObject({fieldPath:z.string().min(1).max(300),periodEnd:date,periodStart:date.optional(),entityName:text,entityScope:z.enum(["consolidated","standalone","segment"]),sourceDocument:text,sourceVersion:text,sourceHash:hash});
const selection=institutionalFactSelectionSchema;
const evidence=z.strictObject({sourceId:text,title:text,asOfDate:date,locator:text.optional(),url:z.url().optional()});
export const institutionalAssumptionSchema=z.strictObject({id,label:z.strictObject({pt:text,en:text}),unit:units,values:z.record(year,decimal),sourceType:z.enum(["company_budget","company_guidance","public_filing","earnings_call","licensed_consensus","company_operating_plan","market_curve","sector_data","normalized_history","offroad_scenario"]),evidence:z.array(evidence).max(100),rationale:text,methodology:text,confidence:z.enum(["high","medium","low"]),editable:z.boolean(),lowerBound:decimal.optional(),upperBound:decimal.optional(),impacts:z.array(text).max(100)});
const debt=z.strictObject({instrumentId:id,openingPrincipal:decimal,indexer:z.enum(["none","IPCA","CDI","SOFR","fixed","other"]),indexationTreatment:z.enum(["not_applicable","cash_paid","capitalized_principal"]),couponTreatment:z.enum(["cash_paid","capitalized_principal"]),couponBase:z.enum(["opening_principal","indexed_principal","average_principal"]),periods:z.array(z.strictObject({period:year,indexationRate:decimal,couponRate:decimal,drawdown:decimal,scheduledPrincipal:decimal.optional(),prepayment:decimal.optional(),repayAll:z.boolean().optional()})).min(1).max(40)});
/** Strict transport contract shared by guided forms, worker producers and stored snapshots. */
export const institutionalModelConfigurationSchema=z.strictObject({
 modelId:id,currency:z.string().regex(/^[A-Z]{3}$/),
 absenceConfirmations:z.strictObject({debtInstruments:absence.optional(),capex:absence.optional()}).optional(),
 assumptionBook:z.strictObject({scenarioId:id,scenarioName:text,asOfDate:date,periods:z.array(year).min(1).max(40),assumptions:z.array(institutionalAssumptionSchema).min(1).max(300),parentScenarioId:text.optional(),overrides:z.array(z.strictObject({assumptionId:id,values:z.record(year,decimal),rationale:text,requestedBy:text,createdAt:z.iso.datetime({offset:true})})).max(300).optional()}),
 openingBalanceSheet:z.strictObject({period:year,bindings:z.strictObject({unrestrictedCash:selection,restrictedCash:selection,receivables:selection,inventory:selection,otherCurrentAssets:selection,netPpe:selection,otherAssets:selection,payables:selection,otherCurrentLiabilities:selection,grossDebt:selection,otherLiabilities:selection,equity:selection})}),
 revenueSegments:z.array(z.strictObject({id,baseRevenue:selection,volumeGrowthAssumptionId:id,priceGrowthAssumptionId:id,mixEffectAssumptionId:id,fxEffectAssumptionId:id,inorganicRevenueAssumptionId:id})).min(1).max(100),
 operatingCosts:z.array(z.discriminatedUnion("method",[z.strictObject({id,method:z.literal("percent_of_revenue"),ratioAssumptionId:id}),z.strictObject({id,method:z.literal("base_and_growth"),baseCost:selection,growthAssumptionId:id})])).min(1).max(100),
 capex:z.array(z.strictObject({id,classification:z.enum(["maintenance","growth"]),amountAssumptionId:id,usefulLifeYears:z.number().int().positive().max(100),depreciationConvention:z.enum(["next_period","half_year"])})).max(100),
 existingAssetDepreciationAssumptionId:id,
 workingCapital:z.strictObject({dsoAssumptionId:id,dioAssumptionId:id,dpoAssumptionId:id,otherCurrentAssetsPctRevenueAssumptionId:id,otherCurrentLiabilitiesPctRevenueAssumptionId:id}),
 taxes:z.strictObject({cashTaxRateAssumptionId:id,interestDeductibilityEbitdaPctAssumptionId:id.optional(),openingTaxLossCarryforward:selection,openingDisallowedInterestCarryforward:selection}),
 debtInstruments:z.array(debt).max(100),debtRateLineage:z.array(z.strictObject({instrumentId:id,period:year,indexationSourceId:text,indexationAsOfDate:date,indexationMethodology:text,couponSourceId:text,couponAsOfDate:date,couponMethodology:text})).max(4000),
 distributionsAssumptionId:id,minimumOperatingCashAssumptionId:id,minimumDscrAssumptionId:id.optional(),maximumNetLeverageAssumptionId:id.optional(),sectorPackId:id.optional(),
});
export const institutionalReviewedSourceSchema=z.strictObject({sourceDocument:text,version:text,hash,asOfDate:date,currency:z.string().regex(/^[A-Z]{3}$/),amountScale:z.literal("units"),metadataEvidence:z.strictObject({locator:text,rationale:text}),reviewedBy:z.uuid(),reviewedAt:z.iso.datetime({offset:true})});
export type InstitutionalReviewedSource=z.infer<typeof institutionalReviewedSourceSchema>;
export type InstitutionalConfigurationSourceManifest=readonly {sourceDocument:string;version:string;hash:string;hashVerified:boolean}[];

/** The first configuration is proposed from typed controls and reconciled source selections.
 * It cannot attest externally entered forecast numbers as extracted company facts.
 */
export function buildInitialInstitutionalConfigurationCandidate(input:{configuration:unknown;reviewedSources:readonly unknown[];currentSources:InstitutionalConfigurationSourceManifest;facts:readonly ReconciledFact[];actorId:string;submittedAt:string;submissionId:string}){
 const configuration=JSON.parse(JSON.stringify(institutionalModelConfigurationSchema.parse(input.configuration))) as InstitutionalModelConfiguration;
 const actor=z.uuid().parse(input.actorId);z.uuid().parse(input.submissionId);z.iso.datetime({offset:true}).parse(input.submittedAt);
 const sources=input.reviewedSources.map(s=>institutionalReviewedSourceSchema.parse(s));
 if(new Set(sources.map(s=>s.sourceDocument)).size!==sources.length)throw new Error("institutional_duplicate_source_review");
 for(const source of sources){const actual=input.currentSources.filter(s=>s.sourceDocument===source.sourceDocument);if(actual.length!==1||!actual[0]!.hashVerified||actual[0]!.version!==source.version||actual[0]!.hash!==source.hash)throw new Error("institutional_source_review_stale");}
 const normalized:InstitutionalModelConfiguration={...configuration,assumptionBook:{...configuration.assumptionBook,overrides:configuration.assumptionBook.assumptions.map(a=>({assumptionId:a.id,values:a.values,rationale:a.rationale,requestedBy:actor,createdAt:input.submittedAt})),assumptions:configuration.assumptionBook.assumptions.map(a=>({...a,sourceType:"offroad_scenario",confidence:"low",evidence:[],methodology:a.methodology}))}};
 const prepared=prepareInstitutionalModelInput({configuration:normalized,facts:input.facts,sources});
 if(prepared.status!=="ready")return {status:"missing_inputs" as const,prepared,willExecute:false as const};
 let model:ReturnType<typeof buildInstitutionalFinancialModel>;let review:ReturnType<typeof reviewInstitutionalFinancialModel>;
 try {model=buildInstitutionalFinancialModel(prepared.input!);review=reviewInstitutionalFinancialModel(prepared.input!,model);}catch(error){
  if(!(error instanceof RangeError))throw error;
  return {status:"calculation_blocked" as const,prepared,review:{status:"blocked" as const,promotionEligible:false as const,findings:[{id:"model.input_inconsistent",severity:"blocker" as const,message:error.message,remediation:"Review the configured schedules and reconcile them to the opening position."}],coverage:[]},willExecute:false as const};
 }
 if(review.status==="blocked")return {status:"calculation_blocked" as const,prepared,review,willExecute:false as const};
 const configurationFingerprint=fingerprintInstitutionalModelConfiguration(normalized);
 return {status:"review_required" as const,configuration:normalized,configurationFingerprint,inputFingerprint:prepared.inputFingerprint!,sourceBindings:sources,lineage:prepared.lineage,review,submission:{id:input.submissionId,actorId:actor,submittedAt:input.submittedAt},resultFingerprint:createHash("sha256").update(JSON.stringify(model)).digest("hex"),willExecute:false as const};
}
