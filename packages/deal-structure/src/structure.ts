import {archetype, type ArchetypeId, type InstrumentVerdict} from "@offroad/credit-playbook";
import {
  buildDebtServiceSchedule,
  calculateCoverageSeries,
  calculateCovenantHeadroom,
  maturityConcentration,
  type GraceInterest,
  type InterestConvention,
  type RepaymentFormat,
} from "@offroad/financial-core";
import type {DebtTruthSet, FinancialTruthSet, ReconciledFact} from "@offroad/reconciliation";
import Decimal from "decimal.js";

import type {CapacityAssessment} from "./capacity";
import type {CollateralPackage} from "./collateral";
import type {OperationTruthSet} from "./operation";
import type {IndicativeTermSheet} from "./termsheet";

export const structureTruthVersion = "2026.08.25-v1";
type Status = "completed" | "partial" | "blocked" | "not_computable" | "not_applicable";
type EvidenceLink = {fieldPath: string; sourceDocument: string; anchor?: unknown};

export type StructurePolicies = {
  version: string;
  annualSizingRate?: string;
  rateConvention?: InterestConvention;
  amortizationFormat?: RepaymentFormat;
  graceInterest?: GraceInterest;
  balloonPercent?: string;
  minimumDscr?: string;
  minimumCovenantHeadroom?: string;
  maturityConcentrationLimit?: string;
  constructionDelayMonths?: number;
  reserveMonths?: string;
  collateralPolicyVersion?: string;
  minimumCollateralCoverage?: string;
  matchedTicketMin?: string;
  matchedTicketMax?: string;
};

export type StructureProcedureResult = {
  procedureId: `ES-${string}`;
  status: Status;
  result: Record<string, unknown> | null;
  outputCount: number;
  evidenceCount: number;
  missingInputs: string[];
  exceptionIds: string[];
};

export type StructureTruthSet = {
  version: string;
  policyVersion: string;
  status: "complete" | "partial" | "blocked";
  proposal: {
    amount: string | null;
    termMonths: number | null;
    graceMonths: number | null;
    amortizationFormat: RepaymentFormat | null;
    bindingConstraint: string | null;
    minimumDownsideDscr: string | null;
    collateralCoverage: string | null;
    dayOneCompatible: boolean | null;
  };
  capacityEnvelope: {ceilings: Array<{id: string; amount: string; basis: string}>; amount: string | null; bindingConstraint: string | null};
  repayment: {
    origin: "declared" | "policy" | "house_playbook_candidate" | null;
    schedule: ReturnType<typeof buildDebtServiceSchedule> | null;
    coverage: ReturnType<typeof calculateCoverageSeries>;
  };
  security: {
    package: CollateralPackage | null;
    mechanics: Array<{asset: string; type: string; procedureId: string; status: Status; missingInputs: string[]}>;
  };
  dayOne: {covenants: boolean | null; negativePledge: boolean | null; corporateAuthority: boolean | null; maturityWall: boolean | null; passes: boolean | null};
  finalSizing: {requested: string | null; calculated: string | null; envelope: string | null; proposed: string | null; ticketCompatible: boolean | null; rationale: string[]};
  exceptions: Array<{id: string; severity: "medium" | "high" | "critical"; message: string; affectedProcedures: `ES-${string}`[]}>;
  missingInputs: string[];
  procedureCoverage: StructureProcedureResult[];
};

const number = (value: string | undefined | null) => value !== undefined && value !== null && value.trim() !== "" && Number.isFinite(Number(value)) ? value : undefined;
const integer = (value: string | undefined | null) => number(value) !== undefined && Number.isInteger(Number(value)) ? Number(value) : null;
const bool = (value: string | undefined) => value === undefined ? null : ["true","yes","sim","1","pass","compliant"].includes(value.toLowerCase()) ? true : ["false","no","não","nao","0","fail","conflict"].includes(value.toLowerCase()) ? false : null;
const minimum = (values: Array<string | undefined | null>) => {
  const present = values.flatMap((value) => number(value) === undefined ? [] : [new Decimal(value!)]);
  return present.length ? present.reduce((lowest, value) => value.lt(lowest) ? value : lowest).toFixed() : null;
};
const firstRecognizedFormat = (labels: readonly string[]): RepaymentFormat | null => {
  for (const label of labels) {
    const normalized = label.toLowerCase();
    if (/\bsac\b/.test(normalized)) return "sac";
    if (/\bprice\b/.test(normalized)) return "price";
    if (/bullet/.test(normalized)) return "bullet";
    if (/bal[aã]o/.test(normalized)) return "balloon";
  }
  return null;
};

export function buildStructureTruthSet(input: {
  archetypeId: ArchetypeId;
  facts: readonly ReconciledFact[];
  financialTruth: FinancialTruthSet;
  debtTruth: DebtTruthSet;
  operationTruth: OperationTruthSet;
  capacity: CapacityAssessment | null;
  termSheet: IndicativeTermSheet | null;
  collateral: CollateralPackage | null;
  instruments: readonly InstrumentVerdict[];
  referenceDate: string;
  policies?: StructurePolicies;
}): StructureTruthSet {
  const definition = archetype(input.archetypeId);
  const policy = input.policies ?? {version:"required_missing"};
  const facts = input.facts;
  const fact = (path:string)=>facts.find((candidate)=>candidate.key.fieldPath===path);
  const value = (path:string)=>fact(path)?.value;
  const indexed = (prefix:string)=>[...new Set(facts.flatMap((candidate)=>candidate.key.fieldPath.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\.(\\d+)\\.`))?.[1]??[]))].sort((a,b)=>Number(a)-Number(b));
  const evidence = (...paths:string[]):EvidenceLink[]=>paths.flatMap((path)=>fact(path)?[{fieldPath:path,sourceDocument:fact(path)!.accepted.sourceDocument,...(fact(path)!.accepted.anchor!==undefined?{anchor:fact(path)!.accepted.anchor}: {})}]:[]);
  const evidencePrefix = (prefix:string)=>facts.filter((candidate)=>candidate.key.fieldPath.startsWith(prefix)).length;
  const missing = new Set<string>();
  const exceptions: StructureTruthSet["exceptions"] = [];

  const requested = input.operationTruth.request.amount;
  const calculated = input.operationTruth.calculatedNeed?.value ?? null;
  const capacityCeilings: Array<{id: string; amount: string; basis: string}> = input.capacity?.walls.flatMap((wall)=>wall.amount===null?[]:[{id:wall.id,amount:wall.amount,basis:"capacity_assessment"}]) ?? [];
  const covenantCeiling = number(value("structure.capacity.covenant_limit"));
  if (covenantCeiling) capacityCeilings.push({id:"existing_covenant",amount:covenantCeiling,basis:"reconciled_fact"});
  const envelopeAmount = minimum(capacityCeilings.map((ceiling)=>ceiling.amount));
  const bindingConstraint = envelopeAmount ? capacityCeilings.find((ceiling)=>new Decimal(ceiling.amount).eq(envelopeAmount))?.id ?? null : null;
  if (!capacityCeilings.length) missing.add("structure.capacity_envelope");

  const sizingBase = calculated ?? requested;
  const beforeTicket = minimum([sizingBase,envelopeAmount]);
  const ticketMin = number(value("structure.mandate.ticket_min")) ?? policy.matchedTicketMin;
  const ticketMax = number(value("structure.mandate.ticket_max")) ?? policy.matchedTicketMax;
  let proposed = beforeTicket;
  if (proposed && ticketMax && new Decimal(proposed).gt(ticketMax)) proposed = ticketMax;
  const ticketCompatible = proposed && ticketMin && ticketMax
    ? new Decimal(proposed).gte(ticketMin) && new Decimal(proposed).lte(ticketMax)
    : null;
  if (proposed && envelopeAmount && new Decimal(proposed).gt(envelopeAmount)) exceptions.push({id:"sizing-exceeds-envelope",severity:"critical",message:"Proposed sizing exceeds the binding capacity envelope.",affectedProcedures:["ES-03","ES-45"]});
  if (ticketCompatible===false) exceptions.push({id:"ticket-incompatible",severity:"high",message:"Proposed sizing does not fit the confirmed mandate ticket.",affectedProcedures:["ES-41","ES-45"]});
  if (input.operationTruth.sourcesAndUses.status!=="pass") exceptions.push({id:"sources-uses-not-closed",severity:"critical",message:"Final sizing cannot close before sources and uses tie.",affectedProcedures:["ES-45"]});

  const proFormaLeverage = input.operationTruth.proForma?.leverage ?? null;
  const leverageCeiling = definition.structure.leverageCeiling;
  const leveragePosition = proFormaLeverage===null ? null : new Decimal(proFormaLeverage).lte(leverageCeiling)?"inside":"above";
  if (leveragePosition==="above") exceptions.push({id:"leverage-above-band",severity:"high",message:"Pro forma leverage is above the current house-playbook ceiling and requires an ES-40 alternative.",affectedProcedures:["ES-01","ES-03","ES-40"]});

  const termValue = input.termSheet?.terms.find((term)=>term.id==="tenor")?.value.en.match(/\d+/)?.[0];
  const graceValue = input.termSheet?.terms.find((term)=>term.id==="grace")?.value.en.match(/\d+/)?.[0];
  const termMonths = integer(value("structure.term_months")) ?? integer(termValue) ?? input.operationTruth.request.termMonths;
  const graceMonths = integer(value("structure.grace_months")) ?? integer(graceValue) ?? 0;
  const declaredFormat = value("structure.amortization_format") as RepaymentFormat | undefined;
  const allowedFormats:RepaymentFormat[]=["sac","price","bullet","balloon"];
  const format = declaredFormat&&allowedFormats.includes(declaredFormat)?declaredFormat:policy.amortizationFormat??firstRecognizedFormat(definition.structure.amortization);
  const formatOrigin = declaredFormat&&allowedFormats.includes(declaredFormat)?"declared" as const:policy.amortizationFormat?"policy" as const:format?"house_playbook_candidate" as const:null;
  const annualRate = number(value("structure.sizing_annual_rate")) ?? policy.annualSizingRate;
  const declaredRateConvention=value("structure.rate_convention");
  const rateConvention:InterestConvention|undefined=declaredRateConvention==="nominal_annual"||declaredRateConvention==="effective_annual"?declaredRateConvention:policy.rateConvention;
  const declaredGraceInterest=value("structure.grace_interest");
  const graceInterest:GraceInterest=declaredGraceInterest==="paid"||declaredGraceInterest==="capitalized"?declaredGraceInterest:policy.graceInterest??"paid";
  const balloonPercent=number(value("structure.balloon_percent"))??policy.balloonPercent;
  const scheduleInputsValid=Boolean(
    proposed&&termMonths&&format&&annualRate&&rateConvention&&
    graceMonths>=0&&graceMonths<termMonths&&new Decimal(annualRate).gte(0)&&
    (format!=="balloon"||(balloonPercent!==undefined&&new Decimal(balloonPercent).gte(0)&&new Decimal(balloonPercent).lte(1))),
  );
  if (!termMonths) missing.add("structure.term_months");
  if (format===null) missing.add("structure.amortization_format");
  if (!annualRate) missing.add("structure.sizing_annual_rate");
  if (!rateConvention) missing.add("structure.rate_convention");
  if(termMonths&&graceMonths>=termMonths)exceptions.push({id:"invalid-grace-period",severity:"critical",message:"Grace must end before final maturity.",affectedProcedures:["ES-05","ES-07","ES-42"]});
  if(annualRate&&new Decimal(annualRate).lt(0))exceptions.push({id:"invalid-sizing-rate",severity:"critical",message:"The governed sizing rate cannot be negative.",affectedProcedures:["ES-02","ES-05"]});
  if(format==="balloon"&&(balloonPercent===undefined||new Decimal(balloonPercent).lt(0)||new Decimal(balloonPercent).gt(1)))exceptions.push({id:"invalid-balloon",severity:"critical",message:"Balloon amortisation requires a governed percentage between zero and one.",affectedProcedures:["ES-05","ES-06"]});
  let schedule:ReturnType<typeof buildDebtServiceSchedule>|null=null;
  if (scheduleInputsValid&&proposed&&termMonths&&format&&annualRate&&rateConvention) {
    schedule=buildDebtServiceSchedule({amount:proposed,annualRate,rateConvention,termMonths,graceMonths,graceInterest,format,...(format==="balloon"?{balloonPercent:balloonPercent!}: {})});
  }
  const scenarioInputs = indexed("structure.cfads_scenarios").flatMap((scenarioIndex)=>{
    const name=value(`structure.cfads_scenarios.${scenarioIndex}.name`);
    if(!name)return[];
    const cfadsByPeriod:Record<number,string>={};
    for(const periodIndex of indexed(`structure.cfads_scenarios.${scenarioIndex}.periods`)){
      const period=integer(value(`structure.cfads_scenarios.${scenarioIndex}.periods.${periodIndex}.period`));
      const cfads=number(value(`structure.cfads_scenarios.${scenarioIndex}.periods.${periodIndex}.cfads`));
      if(period!==null&&cfads!==undefined)cfadsByPeriod[period]=cfads;
    }
    return Object.keys(cfadsByPeriod).length?[{name,cfadsByPeriod}]:[];
  });
  const coverage=schedule&&scenarioInputs.length?calculateCoverageSeries({schedule:schedule.rows,scenarios:scenarioInputs}):[];
  const incompleteCoverage=coverage.some((scenario)=>scenario.periods.some((period)=>period.dscr===null));
  if(incompleteCoverage)exceptions.push({id:"incomplete-coverage-series",severity:"critical",message:"At least one CFADS scenario does not cover every debt-service period.",affectedProcedures:["ES-02","ES-05","ES-24","ES-42"]});
  const downside=coverage.find((scenario)=>/down|stress|advers|baixa/i.test(scenario.name));
  const minimumDscr=downside?.minimumDscr??null;
  const dscrFloor=policy.minimumDscr??definition.structure.minimumDscr;
  if(minimumDscr!==null&&new Decimal(minimumDscr).lt(dscrFloor))exceptions.push({id:"downside-coverage-breach",severity:"critical",message:"The proposed repayment schedule breaches the downside DSCR floor.",affectedProcedures:["ES-02","ES-03","ES-04","ES-05","ES-24","ES-42"]});
  if(!scenarioInputs.length)missing.add("structure.cfads_scenarios");

  const baseCoverage=coverage.find((scenario)=>/base/i.test(scenario.name));
  const covenantHeadroom=baseCoverage?.minimumDscr?calculateCovenantHeadroom({actual:baseCoverage.minimumDscr,limit:dscrFloor,direction:"minimum"}):null;
  if(covenantHeadroom&&!covenantHeadroom.passes)exceptions.push({id:"covenant-no-headroom",severity:"critical",message:"The proposed covenant has no headroom in the base case.",affectedProcedures:["ES-04","ES-23","ES-24","ES-42"]});
  if(covenantHeadroom?.percentage&&policy.minimumCovenantHeadroom&&new Decimal(covenantHeadroom.percentage).lt(policy.minimumCovenantHeadroom))exceptions.push({id:"covenant-insufficient-headroom",severity:"critical",message:"The proposed covenant headroom is below the governed minimum in the base case.",affectedProcedures:["ES-04","ES-23","ES-24","ES-42"]});

  const proposedMaturities:Record<string,string>={};
  for(const row of schedule?.rows??[]){
    if(new Decimal(row.principal).eq(0))continue;
    const key=`Y${Math.ceil(row.period/12)}`;
    proposedMaturities[key]=new Decimal(proposedMaturities[key]??0).plus(row.principal).toFixed();
  }
  const referenceYear=Number(input.referenceDate.slice(0,4));
  const existingMaturities:Record<string,string>={};
  for(const [period,amount] of Object.entries(input.debtTruth.maturity)){
    const year=Number(period.slice(0,4));
    const key=Number.isFinite(year)&&year>=referenceYear?`Y${Math.max(1,year-referenceYear+1)}`:period;
    existingMaturities[key]=new Decimal(existingMaturities[key]??0).plus(amount).toFixed();
  }
  const maturity=schedule?maturityConcentration({existing:existingMaturities,proposed:proposedMaturities}):null;
  const maturityLimit=policy.maturityConcentrationLimit;
  const maturityWallPass=maturity&&maturityLimit?maturity.rows.every((row)=>new Decimal(row.share).lte(maturityLimit)):null;
  if(maturityWallPass===false)exceptions.push({id:"new-maturity-wall",severity:"critical",message:"The proposed schedule creates a consolidated maturity concentration above policy.",affectedProcedures:["ES-10","ES-42"]});

  const bulletSource=value("structure.bullet_repayment_source")??input.operationTruth.bridgeAndTakeout.takeout;
  if(format==="bullet"&&!bulletSource)exceptions.push({id:"bullet-without-repayment-source",severity:"critical",message:"Bullet amortisation lacks a named and evidenced repayment source.",affectedProcedures:["ES-06","ES-29","ES-42"]});
  const rampMonths=integer(value("project.ramp_up_months"));
  const delayMonths=policy.constructionDelayMonths;
  if(rampMonths!==null&&delayMonths!==undefined&&graceMonths!==null&&graceMonths<rampMonths+delayMonths)exceptions.push({id:"grace-shorter-than-ramp",severity:"critical",message:"Grace is shorter than project ramp-up plus the governed delay margin.",affectedProcedures:["ES-07","ES-09","ES-42"]});

  const securityMechanics:StructureTruthSet["security"]["mechanics"]=(input.collateral?.lines.filter((line)=>line.selected)??[]).map((line)=>{
    const procedureId:{[key:string]:string}={receivables:"ES-11",property:"ES-13",inventory:"ES-14",equipment:"ES-15",vehicles:"ES-15",shares:"ES-16",guarantee:"ES-19",financial:"ES-20",other:"ES-20"};
    const required=line.asset.type==="receivables"?["domicile account","coverage ratio","replenishment rule","eligibility"]:line.asset.type==="property"?["independent appraisal","appraisal date","title and lien search","liquidity adjustment"]:line.asset.type==="inventory"?["independent monitoring","custodian","identifiability","minimum turnover"]:line.asset.type==="equipment"||line.asset.type==="vehicles"?["resale evidence","useful life","insurance","registered lien"]:line.asset.type==="shares"?["shareholders agreement","enforcement feasibility","rights while outstanding"]:line.asset.type==="guarantee"?["existing guarantees","evidenced reachable net worth"]:[];
    const confirmed=required.filter((item)=>bool(value(`structure.security.${line.asset.type}.${item.replaceAll(" ","_")}`))===true);
    return {asset:line.asset.description,type:line.asset.type,procedureId:procedureId[line.asset.type]??"ES-20",status:required.length===0?"partial" as const:confirmed.length===required.length?"completed" as const:"partial" as const,missingInputs:required.filter((item)=>!confirmed.includes(item))};
  });
  const collateralCoverage=input.collateral?.coverageAchieved??null;
  const collateralSufficient=input.collateral?.sufficient??null;
  if(collateralSufficient===false)exceptions.push({id:"collateral-shortfall",severity:"critical",message:"Post-haircut collateral coverage is below the required package.",affectedProcedures:["ES-03","ES-20","ES-40","ES-42"]});
  if(collateralCoverage&&policy.minimumCollateralCoverage&&new Decimal(collateralCoverage).lt(policy.minimumCollateralCoverage))exceptions.push({id:"collateral-policy-shortfall",severity:"critical",message:"Post-haircut collateral coverage is below the governed minimum.",affectedProcedures:["ES-03","ES-20","ES-40","ES-42"]});

  const covenantConflict=input.operationTruth.proForma?.dayOneCovenantConflict===null||input.operationTruth.proForma?.dayOneCovenantConflict===undefined?null:!input.operationTruth.proForma.dayOneCovenantConflict;
  const negativePledge=value("structure.day_one.negative_pledge_compliant")!==undefined?bool(value("structure.day_one.negative_pledge_compliant")):null;
  const corporateAuthority=value("structure.day_one.corporate_authority_complete")!==undefined?bool(value("structure.day_one.corporate_authority_complete")):null;
  const dayOneValues=[covenantConflict,negativePledge,corporateAuthority,maturityWallPass];
  const dayOnePasses=dayOneValues.some((item)=>item===false)?false:dayOneValues.every((item)=>item===true)?true:null;
  if(dayOnePasses===false)exceptions.push({id:"day-one-incompatibility",severity:"critical",message:"At least one mandatory day-one compatibility check failed.",affectedProcedures:["ES-26","ES-36","ES-42","ES-43"]});

  const selectedInstrument=value("structure.selected_instrument");
  const candidateInstrument=input.instruments.find((instrument)=>instrument.eligible)?.instrument;
  const routeAlternatives=input.instruments.map((verdict)=>({instrument:verdict.instrument.id,route:verdict.route,eligible:verdict.eligible,reasons:verdict.reasons}));
  if(!routeAlternatives.some((route)=>route.eligible))exceptions.push({id:"no-eligible-route",severity:"critical",message:"No currently assessed financing route is eligible for the issuer and use.",affectedProcedures:["ES-41","ES-44"]});
  const termBasis=(input.termSheet?.terms??[]).map((term)=>({termId:term.id,basis:term.basis,supportIds:term.supportIds,complete:term.supportIds.length>0}));
  if(termBasis.some((term)=>!term.complete))exceptions.push({id:"unsupported-term",severity:"critical",message:"At least one indicative term lacks a support basis.",affectedProcedures:["ES-43"]});

  const adjustments=(()=>{
    if(!bindingConstraint)return[];
    const gap=requested&&envelopeAmount?Decimal.max(new Decimal(requested).minus(envelopeAmount),0).toFixed():null;
    if(bindingConstraint==="collateral")return[{id:"eligible_security",effect:"increase collateral ceiling",quantifiedGap:gap},{id:"lower_amount",effect:"fit current collateral envelope",quantifiedGap:gap}];
    if(bindingConstraint==="cash_flow")return[{id:"repayment_profile",effect:"reduce periodic service",quantifiedGap:gap},{id:"lower_amount",effect:"fit cash-flow envelope",quantifiedGap:gap}];
    if(bindingConstraint==="market")return[{id:"staged_transaction",effect:"reduce initial ticket",quantifiedGap:gap},{id:"wait_for_milestone",effect:"reassess after documented operating milestone",quantifiedGap:gap}];
    return[{id:"consent_or_redesign",effect:"remove covenant conflict or reduce amount",quantifiedGap:gap}];
  })();

  const rationale=[
    ...(requested&&calculated&&!new Decimal(requested).eq(calculated)?[`calculated need ${calculated} differs from request ${requested}`]:[]),
    ...(envelopeAmount&&sizingBase&&new Decimal(envelopeAmount).lt(sizingBase)?[`binding ${bindingConstraint} envelope caps sizing at ${envelopeAmount}`]:[]),
    ...(ticketMax&&beforeTicket&&new Decimal(beforeTicket).gt(ticketMax)?[`confirmed mandate maximum caps sizing at ${ticketMax}`]:[]),
  ];
  const finalSizing={requested,calculated,envelope:envelopeAmount,proposed,ticketCompatible,rationale};

  const result=(procedureId:`ES-${string}`,status:Status,value:Record<string,unknown>|null,procedureMissing:string[]=[],exceptionIds:string[]=[],evidenceCount=0):StructureProcedureResult=>({procedureId,status,result:value,outputCount:value?Object.keys(value).length:0,evidenceCount,missingInputs:procedureMissing,exceptionIds});
  const owned=(id:`ES-${string}`)=>exceptions.filter((exception)=>exception.affectedProcedures.includes(id)).map((exception)=>exception.id);
  const blocked=(id:`ES-${string}`,otherwise:Status)=>owned(id).some((exceptionId)=>exceptions.find((exception)=>exception.id===exceptionId)?.severity==="critical")?"blocked":otherwise;
  const mechanics=(id:string)=>securityMechanics.filter((item)=>item.procedureId===id);
  const structuredCovenants=indexed("structure.covenants").map((index)=>({id:index,name:value(`structure.covenants.${index}.name`)??null,definition:value(`structure.covenants.${index}.definition`)??null,limit:number(value(`structure.covenants.${index}.limit`))??null,frequency:value(`structure.covenants.${index}.frequency`)??null,cure:value(`structure.covenants.${index}.cure`)??null}));
  const issuer={entity:value("structure.issuer.entity")??null,justification:value("structure.issuer.justification")??null,compensations:indexed("structure.issuer.compensations").map((index)=>value(`structure.issuer.compensations.${index}.description`)).filter(Boolean)};
  const guarantors=indexed("structure.guarantors").map((index)=>({entity:value(`structure.guarantors.${index}.entity`)??null,limit:number(value(`structure.guarantors.${index}.limit`))??null,authority:bool(value(`structure.guarantors.${index}.authority_confirmed`))}));
  const genericClause=(prefix:string)=>Object.fromEntries(facts.filter((candidate)=>candidate.key.fieldPath.startsWith(prefix)).map((candidate)=>[candidate.key.fieldPath.slice(prefix.length),candidate.value]));
  const results:StructureProcedureResult[]=[
    result("ES-01",blocked("ES-01",proFormaLeverage?policy.version==="required_missing"?"partial":"completed":"not_computable"),proFormaLeverage?{proFormaLeverage,band:{ceiling:leverageCeiling,source:"house_playbook"},position:leveragePosition}:null,proFormaLeverage?[]:["pro forma leverage"],owned("ES-01"),evidence("transaction.requested_amount").length),
    result("ES-02",blocked("ES-02",coverage.length?downside?"completed":"partial":"not_computable"),coverage.length?{scenarios:coverage,criticalScenario:downside?.name??null}:null,coverage.length?downside?[]:["downside scenario"]:["debt-service schedule","CFADS scenarios"],owned("ES-02"),evidencePrefix("structure.cfads_scenarios.")),
    result("ES-03",blocked("ES-03",envelopeAmount?capacityCeilings.length>=3?"completed":"partial":"not_computable"),envelopeAmount?{ceilings:capacityCeilings,envelope:envelopeAmount,bindingConstraint}:null,envelopeAmount?capacityCeilings.length>=3?[]:["remaining capacity ceilings"]:["capacity ceilings"],owned("ES-03"),0),
    result("ES-04",blocked("ES-04",covenantHeadroom?policy.minimumCovenantHeadroom?"completed":"partial":"not_computable"),covenantHeadroom?{metric:"DSCR",headroom:covenantHeadroom,downside:downside?.minimumDscr??null}:null,covenantHeadroom?policy.minimumCovenantHeadroom?[]:["headroom policy"]:["base and downside coverage"],owned("ES-04"),evidencePrefix("structure.covenants.")),
    result("ES-05",blocked("ES-05",schedule&&coverage.length?downside?"completed":"partial":"not_computable"),schedule?{schedule,coverage}:null,schedule?coverage.length?downside?[]:["downside scenario"]:["CFADS scenarios"]:["amount","rate","term","format"],owned("ES-05"),evidencePrefix("structure.")),
    result("ES-06",blocked("ES-06",format?formatOrigin==="house_playbook_candidate"?"partial":"completed":"not_computable"),format?{format,origin:formatOrigin,bulletRepaymentSource:bulletSource??null}:null,format?format==="bullet"&&!bulletSource?["bullet repayment source"]:[]:["amortization format"],owned("ES-06"),evidence("structure.amortization_format","structure.bullet_repayment_source").length),
    result("ES-07",blocked("ES-07",termMonths?"completed":"not_computable"),termMonths?{type:graceInterest,months:graceMonths,capitalizedInterest:schedule?.rows.filter((row)=>new Decimal(row.interestCapitalized).gt(0)).reduce((sum,row)=>sum.plus(row.interestCapitalized),new Decimal(0)).toFixed()??null}:null,termMonths?[]:["term and grace"],owned("ES-07"),evidence("structure.grace_months","structure.grace_interest").length),
    result("ES-08",blocked("ES-08",value("structure.seasonality.design")?"completed":value("structure.seasonality.material")?"partial":"not_applicable"),value("structure.seasonality.material")?{material:bool(value("structure.seasonality.material")),design:value("structure.seasonality.design")??null,reserve:value("structure.seasonality.reserve_mechanism")??null}:null,bool(value("structure.seasonality.material"))===true&&!value("structure.seasonality.design")?["seasonal payment calendar"]:[],owned("ES-08"),evidencePrefix("structure.seasonality.")),
    result("ES-09",blocked("ES-09",rampMonths!==null?delayMonths!==undefined?"completed":"partial":"not_applicable"),rampMonths!==null?{rampMonths,delayMarginMonths:delayMonths??null,graceMonths,physicalMilestones:indexed("structure.project_milestones").length}:null,rampMonths!==null&&delayMonths===undefined?["construction delay policy"]:[],owned("ES-09"),evidencePrefix("structure.project_milestones.")),
    result("ES-10",blocked("ES-10",maturity?maturityLimit?"completed":"partial":"not_computable"),maturity?{...maturity,limit:maturityLimit??null,passes:maturityWallPass}:null,maturity?maturityLimit?[]:["maturity concentration policy"]:["proposed repayment schedule"],owned("ES-10"),0),
    ...(["ES-11","ES-12","ES-13","ES-14","ES-15","ES-16"] as const).map((id)=>{const rows=mechanics(id);return result(id,blocked(id,rows.length?rows.every((row)=>row.status==="completed")?"completed":"partial":"not_applicable"),rows.length?{assets:rows}:null,rows.flatMap((row)=>row.missingInputs),owned(id),0);}),
    result("ES-17",blocked("ES-17",policy.reserveMonths||value("structure.reserve.months")?value("structure.reserve.replenishment")?"completed":"partial":"not_applicable"),policy.reserveMonths||value("structure.reserve.months")?{months:value("structure.reserve.months")??policy.reserveMonths,funding:value("structure.reserve.funding")??null,replenishment:value("structure.reserve.replenishment")??null,lockup:value("structure.reserve.lockup")??null}:null,policy.reserveMonths||value("structure.reserve.months")?value("structure.reserve.replenishment")?[]:["reserve funding, replenishment and lock-up"]:[],owned("ES-17"),evidencePrefix("structure.reserve.")),
    result("ES-18",blocked("ES-18",evidencePrefix("structure.bank_guarantee.")?"partial":"not_applicable"),evidencePrefix("structure.bank_guarantee.")?genericClause("structure.bank_guarantee."):null,evidencePrefix("structure.bank_guarantee.")?["rating, tenor match, renewal and exclusions"]:[],owned("ES-18"),evidencePrefix("structure.bank_guarantee.")),
    result("ES-19",blocked("ES-19",mechanics("ES-19").length?"partial":"not_applicable"),mechanics("ES-19").length?{assets:mechanics("ES-19")}:null,mechanics("ES-19").flatMap((row)=>row.missingInputs),owned("ES-19"),0),
    result("ES-20",blocked("ES-20",input.collateral?policy.collateralPolicyVersion?input.collateral.sufficient?"completed":"blocked":"partial":"not_computable"),input.collateral?{package:input.collateral,policyVersion:policy.collateralPolicyVersion??null}:null,input.collateral?policy.collateralPolicyVersion?[]:["approved collateral policy version"]:["collateral inventory"],owned("ES-20"),0),
    result("ES-21",blocked("ES-21",evidencePrefix("structure.dedicated_flow.")?"partial":"not_applicable"),evidencePrefix("structure.dedicated_flow.")?genericClause("structure.dedicated_flow."):null,evidencePrefix("structure.dedicated_flow.")?["complete account waterfall and incremental cost"]:[],owned("ES-21"),evidencePrefix("structure.dedicated_flow.")),
    result("ES-22",blocked("ES-22",evidencePrefix("structure.shared_security.")?"partial":"not_applicable"),evidencePrefix("structure.shared_security.")?genericClause("structure.shared_security."):null,evidencePrefix("structure.shared_security.")?["documented release or intercreditor path"]:[],owned("ES-22"),evidencePrefix("structure.shared_security.")),
    result("ES-23",blocked("ES-23",structuredCovenants.some((covenant)=>/alav|leverage|d[ií]vida/i.test(covenant.name??""))?"partial":"not_computable"),structuredCovenants.some((covenant)=>/alav|leverage|d[ií]vida/i.test(covenant.name??""))?{covenants:structuredCovenants.filter((covenant)=>/alav|leverage|d[ií]vida/i.test(covenant.name??"")),definition:"debt truth bridge and adjusted EBITDA policy"}:null,["annual step-down and downside test"],owned("ES-23"),evidencePrefix("structure.covenants.")),
    result("ES-24",blocked("ES-24",structuredCovenants.some((covenant)=>/dscr|icr|cobertura/i.test(covenant.name??""))?"partial":"not_computable"),structuredCovenants.some((covenant)=>/dscr|icr|cobertura/i.test(covenant.name??""))?{covenants:structuredCovenants.filter((covenant)=>/dscr|icr|cobertura/i.test(covenant.name??"")),coverage}:null,["complete definition and downside test"],owned("ES-24"),evidencePrefix("structure.covenants.")),
    ...(["ES-25","ES-26","ES-27","ES-28","ES-29","ES-30","ES-31","ES-32","ES-33","ES-34","ES-35"] as const).map((id,index)=>{const prefixes=["structure.dividends.","structure.negative_pledge.","structure.additional_debt.","structure.cross_default.","structure.cash_sweep.","structure.reporting.","structure.definitions.","structure.cure_waiver.","structure.acceleration.","structure.change_of_control.","structure.mac."];const prefix=prefixes[index]!;const count=evidencePrefix(prefix);return result(id,blocked(id,count?"partial":"not_computable"),count?genericClause(prefix):null,count?["complete calibrated clause and test"]:[prefix.slice(0,-1)],owned(id),count);}),
    result("ES-36",blocked("ES-36",issuer.entity?issuer.justification?"completed":"partial":"not_computable"),issuer.entity?issuer:null,issuer.entity?issuer.justification?[]:["issuer rationale and compensations"]:["issuer entity"],owned("ES-36"),evidencePrefix("structure.issuer.")),
    result("ES-37",blocked("ES-37",guarantors.length?guarantors.every((guarantor)=>guarantor.entity&&guarantor.limit&&guarantor.authority)?"completed":"partial":"not_applicable"),guarantors.length?{guarantors}:null,guarantors.length?guarantors.every((guarantor)=>guarantor.entity&&guarantor.limit&&guarantor.authority)?[]:["guarantor limits and authority"]:[],owned("ES-37"),evidencePrefix("structure.guarantors.")),
    result("ES-38",blocked("ES-38",value("structure.structural_subordination.exists")?value("structure.structural_subordination.mitigation")?"completed":"partial":"not_computable"),value("structure.structural_subordination.exists")?genericClause("structure.structural_subordination."):null,value("structure.structural_subordination.exists")&&!value("structure.structural_subordination.mitigation")?["mitigation and pricing effect"]:[],owned("ES-38"),evidencePrefix("structure.structural_subordination.")),
    result("ES-39",blocked("ES-39",evidencePrefix("structure.intercreditor.")?"partial":"not_applicable"),evidencePrefix("structure.intercreditor.")?genericClause("structure.intercreditor."):null,evidencePrefix("structure.intercreditor.")?["creditor map, consents, priority and standstill"]:[],owned("ES-39"),evidencePrefix("structure.intercreditor.")),
    result("ES-40",blocked("ES-40",adjustments.length?"completed":"not_applicable"),adjustments.length?{bindingConstraint,alternatives:adjustments}:null,[],owned("ES-40"),0),
    result("ES-41",blocked("ES-41",selectedInstrument?"completed":candidateInstrument?"partial":"not_computable"),selectedInstrument||candidateInstrument?{selected:selectedInstrument??candidateInstrument?.id??null,origin:selectedInstrument?"declared":"catalogue_candidate",buyer:value("structure.target_buyer")??null,allIn:value("structure.all_in")??null}:null,selectedInstrument?value("structure.target_buyer")?[]:["target buyer and all-in"]:candidateInstrument?["confirm selected route, target buyer and all-in"]:["eligible route"],owned("ES-41"),evidence("structure.selected_instrument","structure.target_buyer","structure.all_in").length),
    result("ES-42",blocked("ES-42",dayOnePasses===true?"completed":dayOnePasses===false?"blocked":"partial"),{covenants:covenantConflict,negativePledge,corporateAuthority,maturityWall:maturityWallPass,passes:dayOnePasses},dayOnePasses===null?["all four day-one checks"]:[],owned("ES-42"),evidencePrefix("structure.day_one.")),
    result("ES-43",blocked("ES-43",termBasis.length?termBasis.every((term)=>term.complete)?"completed":"blocked":"not_computable"),termBasis.length?{terms:termBasis}:null,termBasis.length?[]:["indicative term sheet"],owned("ES-43"),0),
    result("ES-44",blocked("ES-44",routeAlternatives.length?routeAlternatives.some((route)=>route.eligible)?"partial":"blocked":"not_computable"),routeAlternatives.length?{alternatives:routeAlternatives}:null,routeAlternatives.length?["current legal review, service providers, execution time and all-in"]:["issuer and transaction route inputs"],owned("ES-44"),0),
    result("ES-45",blocked("ES-45",proposed&&input.operationTruth.sourcesAndUses.status==="pass"?ticketCompatible===null?"partial":"completed":"not_computable"),proposed?finalSizing:null,proposed?ticketCompatible===null?["confirmed mandate ticket"]:[]:["calculated need and capacity envelope"],owned("ES-45"),evidence("structure.mandate.ticket_min","structure.mandate.ticket_max").length),
  ];
  if(results.length!==45)throw new Error(`structure procedure coverage expected 45, received ${results.length}`);
  const critical=exceptions.some((exception)=>exception.severity==="critical");
  return {
    version:structureTruthVersion,policyVersion:policy.version,status:critical?"blocked":results.every((entry)=>entry.status==="completed"||entry.status==="not_applicable")?"complete":"partial",
    proposal:{amount:proposed,termMonths,graceMonths,amortizationFormat:format,bindingConstraint,minimumDownsideDscr:minimumDscr,collateralCoverage,dayOneCompatible:dayOnePasses},
    capacityEnvelope:{ceilings:capacityCeilings,amount:envelopeAmount,bindingConstraint},repayment:{origin:formatOrigin,schedule,coverage},security:{package:input.collateral,mechanics:securityMechanics},
    dayOne:{covenants:covenantConflict,negativePledge,corporateAuthority,maturityWall:maturityWallPass,passes:dayOnePasses},finalSizing,exceptions,missingInputs:[...missing].sort(),procedureCoverage:results,
  };
}
