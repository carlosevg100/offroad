import {createHash} from "node:crypto";
import {institutionalInputRequestCatalog,institutionalInputRequestCatalogVersion,institutionalInputTargetLabels,type InstitutionalInputRequestTopic} from "@offroad/credit-playbook";
import type {PreparedInstitutionalModelInput,InstitutionalModelInputGap} from "./institutional-input";

export type InstitutionalModelInformationRequest = {
  key:string;
  question:string;whyItMatters:string;decisionImpact:string;
  answerKind:"document"|"text";
  choices:readonly string[];acceptableEvidence:readonly string[];
  /** Persist separately from the visible copy; an answer does not automatically resolve it. */
  answerBinding:{
    category:"historical_document"|"forecast_premise"|"scope_confirmation";
    targetPaths:readonly string[];
    expectedConfigurationFingerprint:string;
  };
};
export type InstitutionalModelInformationRequests = {
  schemaVersion:"institutional-model-information-requests.v1";
  catalogVersion:string;
  requests:readonly InstitutionalModelInformationRequest[];
  internalActions:readonly {code:InstitutionalModelInputGap["code"];targetPaths:readonly string[]}[];
  unresolvedTargetPaths:readonly string[];
};
const topics:readonly InstitutionalInputRequestTopic[]=["scope","history","historical_resolution","forecast","debt"];
const unique=(values:readonly string[])=>[...new Set(values)].sort();

/** Pure projection to the existing information-request card. No model inference, no answer
 * acceptance, no invented UUID/time, and no technical source identifiers in visible questions.
 */
export function buildInstitutionalModelInformationRequests(
  prepared:PreparedInstitutionalModelInput,
  locale:"pt-BR"|"en-US",
):InstitutionalModelInformationRequests {
  if(!/^[a-f0-9]{64}$/.test(prepared.configurationFingerprint))throw new RangeError("a configuration fingerprint is required for answer binding");
  const groups=new Map<InstitutionalInputRequestTopic,string[]>();
  const internal=new Map<InstitutionalModelInputGap["code"],string[]>();
  const add=(topic:InstitutionalInputRequestTopic,path:string)=>groups.set(topic,[...(groups.get(topic)??[]),path]);
  for(const gap of prepared.missingInputs){
    const path=gap.targetPath;
    if(gap.code==="source_unbound") {internal.set(gap.code,[...(internal.get(gap.code)??[]),path]);continue;}
    if(gap.code==="configuration_required") {for(const topic of ["scope","history","forecast","debt"] as const)add(topic,path);continue;}
    if(gap.code==="period_mismatch"||path==="currency"||path==="historicalPerimeter"||path==="periods"||path==="assumptionBook.asOfDate"
      ||(gap.code==="unit_mismatch"&&(path.startsWith("openingBalanceSheet")||path.endsWith(".baseRevenue")||path.endsWith(".baseCost")||path.startsWith("taxes.opening")))||(gap.code==="configuration_invalid"&&path==="openingBalanceSheet")){add("scope",path);continue;}
    if(gap.code==="fact_disputed"||gap.code==="fact_ambiguous"||gap.code==="fact_invalid"){add("historical_resolution",path);continue;}
    if(gap.code==="fact_missing"){add("history",path);continue;}
    if(path.startsWith("debtInstruments")||path.startsWith("debtRateLineage")){add("debt",path);continue;}
    add("forecast",path);
  }
  const requests=topics.flatMap(topic=>{
    const paths=groups.get(topic);if(!paths)return [];
    const targetPaths=unique(paths);const entry=institutionalInputRequestCatalog[topic];
    const copy=entry[locale==="pt-BR"?"pt":"en"];
    const answerBinding={category:entry.category,targetPaths,expectedConfigurationFingerprint:prepared.configurationFingerprint};
    const key=`institutional:${topic}:${createHash("sha256").update(JSON.stringify({catalogVersion:institutionalInputRequestCatalogVersion,...answerBinding})).digest("hex")}`;
    const language=locale==="pt-BR"?"pt":"en";
    const labels=unique(targetPaths.flatMap(path=>{
      const label=institutionalInputTargetLabels[path]??institutionalInputTargetLabels[path.split(".").at(-1)!];
      return label?[label[language]]:[];
    }));
    const clarification=labels.length?`${locale==="pt-BR"?"Ainda falta confirmar":"Still to confirm"}: ${labels.join(", ")}.`:"";
    return [{key,...copy,whyItMatters:clarification?`${copy.whyItMatters} ${clarification}`:copy.whyItMatters,answerKind:entry.answerKind,choices:[],answerBinding}];
  });
  return {schemaVersion:"institutional-model-information-requests.v1",catalogVersion:institutionalInputRequestCatalogVersion,requests,
    internalActions:[...internal].map(([code,paths])=>({code,targetPaths:unique(paths)})),unresolvedTargetPaths:unique(prepared.missingInputs.map(g=>g.targetPath))};
}
