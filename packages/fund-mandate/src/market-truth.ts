import {createHash} from "node:crypto";
import type {CriterionId, MandateFit} from "./fit";
import type {ResolvedMandate} from "./mandate";
import type {Resolved} from "./provenance";

export const marketTruthVersion="2026.08.26-v1";
type Status="completed"|"partial"|"blocked"|"not_computable"|"not_applicable";
type SourceClass="direct_confirmation"|"public_rule"|"governed_observation"|"unconfirmed";

export type MarketProcedureResult={
  procedureId:`MK-${string}`;
  status:Status;
  result:Record<string,unknown>|null;
  outputCount:number;
  evidenceCount:number;
  missingInputs:string[];
  exceptionIds:string[];
};

export type IntroductionRecipient={
  fundId:string;
  contactId:string;
  rationale:string;
  materialKinds:string[];
  materialFingerprint:string;
  mandateFingerprint:string;
  order:number;
  anchor:boolean;
};

export type QualifiedIntroductionAuthorization={
  id:string;
  caseFingerprint:string;
  materialFingerprint:string;
  authorizedBy:string;
  authorizedAt:string;
  recipientIds:string[];
  scope:string[];
  revokedAt?:string|null;
};

export type QualifiedIntroductionRecord={
  id:string;
  fundId:string;
  contactId:string;
  materialFingerprint:string;
  authorizationId:string;
  introducedBy:string;
  introducedAt:string;
};

export type MarketTruthSet={
  version:string;
  fingerprint:string;
  boundary:"qualified_introduction";
  status:"complete"|"partial"|"blocked";
  mandateRegistry:{total:number;current:number;stale:number;incomplete:number;divergent:number};
  screening:{screened:boolean;fits:number;possible:number;excluded:number;blockedByMandateGovernance:number;structuralExclusions:CriterionId[]};
  shortlist:Array<{
    fundId:string;
    fundName:string;
    verdict:MandateFit["verdict"];
    eligibleForShortlist:boolean;
    mandateFingerprint:string;
    sourceClasses:SourceClass[];
    rationale:string;
    confirmations:string[];
    blockers:string[];
  }>;
  distribution:{waveLimit:number|null;recipients:IntroductionRecipient[];companyApproved:boolean;broadBlastProhibited:true;ready:boolean};
  introductions:{ready:number;introduced:number;blocked:number;records:QualifiedIntroductionRecord[]};
  exceptions:Array<{id:string;severity:"high"|"critical";message:string;affectedProcedures:`MK-${string}`[]}>;
  missingInputs:string[];
  procedureCoverage:MarketProcedureResult[];
};

type MaterialGate={
  releaseDecision:"internal_only"|"ready_for_authorization"|"authorized_for_named_recipients";
  fingerprint:string|null;
  recipientIds:string[];
};

type BuildInput={
  mandates:readonly ResolvedMandate[];
  fits:readonly MandateFit[];
  structuralExclusions:readonly string[];
  mandateMaxAgeMonths:number|null;
  waveLimit:number|null;
  caseFingerprint:string;
  materialGate:MaterialGate;
  recipients?:readonly IntroductionRecipient[];
  authorization?:QualifiedIntroductionAuthorization|null;
  introductions?:readonly QualifiedIntroductionRecord[];
};

const criterionField:Record<CriterionId,keyof Pick<ResolvedMandate,"active"|"instruments"|"ticket"|"termMonths"|"sectors"|"geographies"|"collateral"|"leverageCeiling"|"minimumDscr">>={
  active:"active",instrument:"instruments",ticket:"ticket",term:"termMonths",sector:"sectors",geography:"geographies",collateral:"collateral",leverage:"leverageCeiling",dscr:"minimumDscr",
};

function stable(value:unknown):string{
  if(value===undefined)return"undefined";
  if(Array.isArray(value))return`[${value.map(stable).join(",")}]`;
  if(value&&typeof value==="object")return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,child])=>`${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value)??"undefined";
}
const sha=(value:unknown)=>createHash("sha256").update(stable(value)).digest("hex");

function sourceClass(resolved:Resolved<unknown>|null):SourceClass{
  const provenance=resolved?.accepted.provenance;
  if(provenance==="declared"||provenance==="conversation")return"direct_confirmation";
  if(provenance==="published")return"public_rule";
  if(provenance==="observed")return"governed_observation";
  return"unconfirmed";
}

function hardFieldAudit(mandate:ResolvedMandate,fit:MandateFit,maxAge:number|null){
  const hard=fit.criteria.filter((criterion)=>criterion.hard);
  const classes=hard.map((criterion)=>sourceClass(mandate[criterionField[criterion.id]] as Resolved<unknown>|null));
  const missing=hard.filter((criterion)=>!mandate[criterionField[criterion.id]]).map((criterion)=>criterion.id);
  const stale=hard.filter((criterion)=>{
    const resolved=mandate[criterionField[criterion.id]] as Resolved<unknown>|null;
    return resolved!==null&&(maxAge===null||resolved.ageMonths>maxAge);
  }).map((criterion)=>criterion.id);
  const unconfirmed=hard.filter((criterion)=>sourceClass(mandate[criterionField[criterion.id]] as Resolved<unknown>|null)==="unconfirmed").map((criterion)=>criterion.id);
  return{classes:[...new Set(classes)],missing,stale,unconfirmed};
}

export function buildMarketTruthSet(input:BuildInput):MarketTruthSet{
  const exceptions:MarketTruthSet["exceptions"]=[];
  const missing=new Set<string>();
  if(input.mandateMaxAgeMonths===null)missing.add("policy.market.mandate_max_age");
  if(input.waveLimit===null)missing.add("policy.market.distribution-waves");
  const fitByFund=new Map(input.fits.map((fit)=>[fit.fundId,fit]));
  const mandateByFund=new Map(input.mandates.map((mandate)=>[mandate.fundId,mandate]));
  const shortlist=input.fits.map((fit)=>{
    const mandate=mandateByFund.get(fit.fundId);
    if(!mandate)throw new Error(`fit ${fit.fundId} lacks its resolved mandate`);
    const audit=hardFieldAudit(mandate,fit,input.mandateMaxAgeMonths);
    const blockers=[
      ...audit.missing.map((id)=>`mandate_missing:${id}`),
      ...audit.stale.map((id)=>`mandate_stale:${id}`),
      ...audit.unconfirmed.map((id)=>`mandate_unconfirmed:${id}`),
      ...(mandate.divergences.length?[`mandate_divergent:${mandate.divergences.join(",")}`]:[]),
    ];
    const eligibleForShortlist=fit.verdict!=="excluded"&&blockers.length===0;
    const passed=fit.criteria.filter((criterion)=>criterion.outcome==="fits").map((criterion)=>`${criterion.labels.pt}: ${criterion.request??"confirmado"}`);
    const confirmations=fit.criteria.filter((criterion)=>criterion.outcome==="unknown"||criterion.outcome==="not_assessed").map((criterion)=>criterion.labels.pt);
    const rationale=passed.length?`Mandato compatível em ${passed.slice(0,3).join("; ")}.`:`Nenhum critério de aderência foi confirmado.`;
    return{fundId:fit.fundId,fundName:fit.fundName,verdict:fit.verdict,eligibleForShortlist,mandateFingerprint:sha(mandate),sourceClasses:audit.classes,rationale,confirmations,blockers};
  });
  const governedBlocked=shortlist.filter((entry)=>entry.verdict!=="excluded"&&!entry.eligibleForShortlist).length;
  if(governedBlocked)exceptions.push({id:"mandate-governance-block",severity:"critical",message:"One or more possible recipients lack a current, confirmed hard-filter mandate.",affectedProcedures:["MK-11","MK-12","MK-13","MK-14","MK-17"]});

  const recipients=[...(input.recipients??[])].sort((a,b)=>a.order-b.order);
  const duplicateRecipients=recipients.filter((recipient,index)=>recipients.findIndex((other)=>other.fundId===recipient.fundId) !== index);
  const unauthorizedRecipients=recipients.filter((recipient)=>!input.authorization?.recipientIds.includes(recipient.fundId));
  const outsideShortlist=recipients.filter((recipient)=>!shortlist.some((entry)=>entry.fundId===recipient.fundId&&entry.eligibleForShortlist));
  const invalidFingerprint=recipients.filter((recipient)=>recipient.materialFingerprint!==input.materialGate.fingerprint||recipient.mandateFingerprint!==shortlist.find((entry)=>entry.fundId===recipient.fundId)?.mandateFingerprint);
  const authorizationCurrent=Boolean(input.authorization&&!input.authorization.revokedAt&&input.authorization.caseFingerprint===input.caseFingerprint&&input.authorization.materialFingerprint===input.materialGate.fingerprint);
  const companyApproved=authorizationCurrent&&recipients.length>0&&unauthorizedRecipients.length===0;
  const waveWithinLimit=input.waveLimit!==null&&recipients.length<=input.waveLimit;
  const materialAuthorized=input.materialGate.releaseDecision==="authorized_for_named_recipients"&&recipients.every((recipient)=>input.materialGate.recipientIds.includes(recipient.fundId));
  const distributionReady=recipients.length>0&&companyApproved&&waveWithinLimit&&materialAuthorized&&!duplicateRecipients.length&&!outsideShortlist.length&&!invalidFingerprint.length;
  if(recipients.length>0&&!distributionReady)exceptions.push({id:"distribution-gate-block",severity:"critical",message:"The recipient plan is not authorized for the exact current mandates and material fingerprint.",affectedProcedures:["MK-15","MK-16","MK-17","MK-18"]});

  const records=[...(input.introductions??[])];
  const validRecords=records.filter((record)=>distributionReady&&record.authorizationId===input.authorization?.id&&recipients.some((recipient)=>recipient.fundId===record.fundId&&recipient.contactId===record.contactId&&recipient.materialFingerprint===record.materialFingerprint));
  const invalidRecords=records.filter((record)=>!validRecords.includes(record));
  if(invalidRecords.length)exceptions.push({id:"invalid-qualified-introduction",severity:"critical",message:"An introduction record is not tied to the current authorization, contact and material fingerprint.",affectedProcedures:["MK-18"]});

  const result=(procedureId:`MK-${string}`,status:Status,value:Record<string,unknown>|null,missingInputs:string[]=[],evidenceCount=0):MarketProcedureResult=>({procedureId,status,result:value,outputCount:value?Object.keys(value).length:0,evidenceCount,missingInputs,exceptionIds:exceptions.filter((exception)=>exception.affectedProcedures.includes(procedureId)).map((exception)=>exception.id)});
  const hasMandates=input.mandates.length>0;
  const buyerCoverage=Array.from({length:10},(_,index)=>result(`MK-${String(index+1).padStart(2,"0")}`,hasMandates?"partial":"not_computable",hasMandates?{screenedMandates:input.mandates.length,buyerTypeClassification:"not_available_in_current_mandate_contract"}:null,["governed fund and vehicle type"],input.mandates.length));
  const coverage:MarketProcedureResult[]=[
    ...buyerCoverage,
    result("MK-11",hasMandates&&governedBlocked===0?"completed":hasMandates?"partial":"not_computable",{total:input.mandates.length,governedBlocked},governedBlocked?["current dated hard-filter mandate fields"]:[],input.mandates.length),
    result("MK-12",hasMandates?"completed":"not_computable",{screened:input.fits.length,excluded:input.fits.filter((fit)=>fit.verdict==="excluded").length,structuralExclusions:input.structuralExclusions},hasMandates?[]:["resolved mandates"],input.fits.length),
    result("MK-13",shortlist.some((entry)=>entry.eligibleForShortlist)?"completed":hasMandates?"partial":"not_computable",{shortlist:shortlist.map(({fundId,verdict,eligibleForShortlist,rationale,confirmations})=>({fundId,verdict,eligibleForShortlist,rationale,confirmations}))},shortlist.some((entry)=>entry.eligibleForShortlist)?[]:["at least one governed compatible mandate"],shortlist.length),
    result("MK-14",hasMandates&&governedBlocked===0?"completed":hasMandates?"partial":"not_computable",{sourceClasses:shortlist.map(({fundId,sourceClasses,blockers})=>({fundId,sourceClasses,blockers}))},governedBlocked?["fresh confirmed sources"]:[],input.mandates.length),
    result("MK-15",recipients.some((recipient)=>recipient.anchor)&&distributionReady?"completed":recipients.length?"partial":"not_computable",{anchors:recipients.filter((recipient)=>recipient.anchor).map((recipient)=>recipient.fundId)},["authorized anchor wave and recorded learning gate"],recipients.length),
    result("MK-16",distributionReady?"completed":recipients.length?"blocked":"not_computable",{waveLimit:input.waveLimit,recipientCount:recipients.length,broadBlastProhibited:true},distributionReady?[]:["authorized wave within house limit"],recipients.length),
    result("MK-17",distributionReady?"completed":recipients.length?"blocked":"not_computable",{orderedRecipients:recipients.map(({fundId,contactId,order})=>({fundId,contactId,order})),companyApproved},distributionReady?[]:["company-approved recipient plan"],recipients.length),
    result("MK-18",validRecords.length>0&&invalidRecords.length===0?"completed":distributionReady?"partial":recipients.length?"blocked":"not_computable",{ready:distributionReady?recipients.length:0,introduced:validRecords.length,invalid:invalidRecords.length},validRecords.length?[ ]:["immutable qualified-introduction record"],validRecords.length),
    ...Array.from({length:10},(_,index)=>result(`MK-${String(index+19).padStart(2,"0")}`,"not_applicable",{boundary:"outside_current_product_scope"},[],0)),
  ];
  if(coverage.length!==28)throw new Error(`market procedure coverage expected 28, received ${coverage.length}`);
  const status:MarketTruthSet["status"]=exceptions.some((exception)=>exception.severity==="critical")?"blocked":coverage.slice(0,18).every((entry)=>entry.status==="completed")?"complete":"partial";
  const payload={version:marketTruthVersion,boundary:"qualified_introduction" as const,status,mandateRegistry:{total:input.mandates.length,current:shortlist.filter((entry)=>!entry.blockers.some((blocker)=>blocker.startsWith("mandate_stale"))).length,stale:shortlist.filter((entry)=>entry.blockers.some((blocker)=>blocker.startsWith("mandate_stale"))).length,incomplete:shortlist.filter((entry)=>entry.blockers.some((blocker)=>blocker.startsWith("mandate_missing"))).length,divergent:input.mandates.filter((mandate)=>mandate.divergences.length).length},screening:{screened:hasMandates,fits:input.fits.filter((fit)=>fit.verdict==="fits").length,possible:input.fits.filter((fit)=>fit.verdict==="possible").length,excluded:input.fits.filter((fit)=>fit.verdict==="excluded").length,blockedByMandateGovernance:governedBlocked,structuralExclusions:input.structuralExclusions as CriterionId[]},shortlist,distribution:{waveLimit:input.waveLimit,recipients,companyApproved,broadBlastProhibited:true as const,ready:distributionReady},introductions:{ready:distributionReady?recipients.length-validRecords.length:0,introduced:validRecords.length,blocked:invalidRecords.length,records:validRecords},exceptions,missingInputs:[...missing].sort(),procedureCoverage:coverage};
  return{...payload,fingerprint:sha(payload)};
}
