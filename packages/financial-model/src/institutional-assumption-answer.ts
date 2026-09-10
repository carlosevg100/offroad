import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {normalizeDeclaredAssumptionValue} from "@offroad/financial-core";
import {institutionalAssumptionAnswerCopy,institutionalAssumptionUnitLabels} from "@offroad/credit-playbook";
import type {AssumptionUnit} from "./assumptions";
import {fingerprintInstitutionalModelConfiguration,type InstitutionalModelConfiguration} from "./institutional-input";

export const institutionalAssumptionAnswerNamespace="institutional_model_assumptions";
export type InstitutionalAssumptionAnswerBinding={
  schemaVersion:"institutional-assumption-answer-binding.v1";
  category:"forecast_premise";
  targetPaths:readonly string[];
  expectedConfigurationFingerprint:string;
  assumptionId:string;
  period:string;
  unit:AssumptionUnit;
  currency:string;
  locale:"pt-BR"|"en-US";
};
const sha=(text:string)=>createHash("sha256").update(text).digest("hex");
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const object=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const timestamp=(v:unknown):v is string=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(`${v.slice(0,10)}T00:00:00Z`).toISOString().slice(0,10)===v.slice(0,10);
const fail=(code:string):never=>{throw new Error(`institutional_assumption_answer_${code}`);};
const requestKey=(binding:InstitutionalAssumptionAnswerBinding)=>`institutional.assumption.${sha(JSON.stringify(binding))}`;
function valueTarget(configuration:InstitutionalModelConfiguration,assumptionId:string,period:string){
  const matches=configuration.assumptionBook.assumptions.filter(a=>a.id===assumptionId);
  if(matches.length!==1||!matches[0]!.editable)fail("target_unavailable");
  if(!/^\d{4}$/.test(period)||!configuration.assumptionBook.periods.includes(period))fail("period_invalid");
  const assumption=matches[0]!;
  if(!Object.hasOwn(institutionalAssumptionUnitLabels,assumption.unit))fail("unit_invalid");
  return assumption;
}

/** Produce one numeric question only for an existing, reviewed assumption definition.
 * Grouped document/scope questions remain outside automatic financial value application.
 */
export function buildInstitutionalAssumptionValueRequest(input:{configuration:InstitutionalModelConfiguration;assumptionId:string;period:string;locale:"pt-BR"|"en-US"}){
  const assumption=valueTarget(input.configuration,input.assumptionId,input.period);
  const language=input.locale==="pt-BR"?"pt":"en";
  const copy=institutionalAssumptionAnswerCopy[language];
  const binding:InstitutionalAssumptionAnswerBinding={schemaVersion:"institutional-assumption-answer-binding.v1",category:"forecast_premise",
    targetPaths:[`assumptionBook.${assumption.id}.values.${input.period}`],expectedConfigurationFingerprint:fingerprintInstitutionalModelConfiguration(input.configuration),
    assumptionId:assumption.id,period:input.period,unit:assumption.unit,currency:input.configuration.currency,locale:input.locale};
  const label=assumption.label[language].trim();if(!label||label.length>180)fail("label_invalid");
  const unit=assumption.unit==="currency"?`${input.configuration.currency} (${institutionalAssumptionUnitLabels.currency[language]})`:institutionalAssumptionUnitLabels[assumption.unit][language];
  return {key:requestKey(binding),sourceNamespace:institutionalAssumptionAnswerNamespace,producerBinding:binding,
    question:`${copy.questionPrefix} ${label} (${input.period}, ${unit})? ${copy.questionSuffix}`,
    whyItMatters:copy.why,decisionImpact:copy.impact,acceptableEvidence:[copy.evidence],answerKind:"number" as const,choices:[] as string[]};
}

export type InstitutionalAssumptionAnswerApplication={
  status:"review_required";
  patchId:string;
  expectedConfigurationFingerprint:string;
  nextConfigurationFingerprint:string;
  nextConfiguration:InstitutionalModelConfiguration;
  answerEvidence:{requestId:string;messageId:string;answeredBy:string;answeredAt:string;responseFingerprint:string;assumptionId:string;period:string;unit:AssumptionUnit;canonicalValue:string;priorValue:string|null};
  willExecute:false;
}|{status:"unavailable";willExecute:false};

/** Consumes only server-projected persisted responses. Callers must enforce organization,
 * project, source-namespace ownership, version CAS and patchId idempotency in one transaction.
 * Returns a proposed scenario; no historical balance or arbitrary JSON path can be changed.
 */
export function applyInstitutionalAssumptionAnswer(input:{configuration:InstitutionalModelConfiguration;answeredRequest:unknown;content:string;messageId:string}):InstitutionalAssumptionAnswerApplication|null{
  const answer=input.answeredRequest;
  if(!object(answer)||answer.sourceNamespace!==institutionalAssumptionAnswerNamespace)return null;
  if(!uuid(answer.id)||!uuid(answer.answeredBy)||!uuid(answer.messageId)||answer.messageId!==input.messageId||!uuid(input.messageId)
    ||!timestamp(answer.answeredAt)
    ||!object(answer.producerBinding)||answer.answerKind!=="number"||! ["custom","unavailable"].includes(String(answer.answerSource)))fail("metadata_invalid");
  const content=input.content.trim();
  if(!content||content.length>8_000||answer.responseFingerprint!==sha(content))fail("response_mismatch");
  const raw=answer.producerBinding;
  if(!object(raw))return fail("binding_invalid");
  if(typeof raw.assumptionId!=="string"||typeof raw.period!=="string"||! ["pt-BR","en-US"].includes(String(raw.locale)))return fail("binding_invalid");
  const expected=buildInstitutionalAssumptionValueRequest({configuration:input.configuration,assumptionId:raw.assumptionId,period:raw.period,locale:raw.locale as "pt-BR"|"en-US"});
  const keys=Object.keys(expected.producerBinding);
  if(Object.keys(raw).length!==keys.length||keys.some(key=>JSON.stringify(raw[key])!==JSON.stringify(expected.producerBinding[key as keyof InstitutionalAssumptionAnswerBinding]))||answer.requirementKey!==expected.key)fail("stale_or_invalid_binding");
  if(answer.answerSource==="unavailable")return {status:"unavailable",willExecute:false};
  const pattern=expected.producerBinding.locale==="pt-BR"?/^-?\d+(?:[.,]\d+)?$/ : /^-?\d+(?:\.\d+)?$/;
  if(content.length>80||!pattern.test(content))fail("number_invalid");
  const assumption=valueTarget(input.configuration,raw.assumptionId,raw.period);
  const normalized=normalizeDeclaredAssumptionValue(content.replace(",","."),assumption.unit);
  const numeric=new Decimal(normalized.value);
  if((assumption.lowerBound!==undefined&&numeric.lt(assumption.lowerBound))||(assumption.upperBound!==undefined&&numeric.gt(assumption.upperBound)))fail("outside_governed_bounds");
  const next=JSON.parse(JSON.stringify(input.configuration)) as InstitutionalModelConfiguration;
  const language=expected.producerBinding.locale==="pt-BR"?"pt":"en";
  const rationale=institutionalAssumptionAnswerCopy[language].rationale;
  const priorValue=assumption.values[raw.period]??null;
  next.assumptionBook={...next.assumptionBook,parentScenarioId:input.configuration.assumptionBook.scenarioId,scenarioId:`institutional-response:${input.messageId}`,
    scenarioName:institutionalAssumptionAnswerCopy[language].scenarioName,
    assumptions:next.assumptionBook.assumptions.map(a=>a.id!==raw.assumptionId?a:{...a,values:{...a.values,[raw.period as string]:normalized.value},sourceType:"offroad_scenario",evidence:[],rationale,methodology:`Explicit user scenario value; ${normalized.conversion}; answer ${input.messageId}.`,confidence:"low"}),
    overrides:[{assumptionId:raw.assumptionId,values:{[raw.period]:normalized.value},rationale,requestedBy:answer.answeredBy as string,createdAt:answer.answeredAt as string}],
  };
  return {status:"review_required",patchId:`information-response:${input.messageId}`,expectedConfigurationFingerprint:expected.producerBinding.expectedConfigurationFingerprint,
    nextConfigurationFingerprint:fingerprintInstitutionalModelConfiguration(next),nextConfiguration:next,
    answerEvidence:{requestId:answer.id as string,messageId:input.messageId,answeredBy:answer.answeredBy as string,answeredAt:answer.answeredAt as string,responseFingerprint:sha(content),
      assumptionId:raw.assumptionId,period:raw.period,unit:assumption.unit,canonicalValue:normalized.value,priorValue},willExecute:false};
}
