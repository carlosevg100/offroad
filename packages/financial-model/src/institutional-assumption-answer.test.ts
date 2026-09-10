import {createHash} from "node:crypto";
import {describe,it,expect} from "vitest";
import {applyInstitutionalAssumptionAnswer,buildInstitutionalAssumptionValueRequest} from "./institutional-assumption-answer";
import {institutionalInputFixture} from "./institutional-input.fixture";
const id="11111111-1111-4111-8111-111111111111";
function setup(locale:"pt-BR"|"en-US"="en-US",content="7.25"){
 const configuration=institutionalInputFixture().configuration;
 configuration.assumptionBook={...configuration.assumptionBook,scenarioId:"reviewed-base",assumptions:[{id:"growth",label:{pt:"Crescimento orgânico",en:"Organic growth"},unit:"percent",values:{"2027":"0.03"},editable:true,lowerBound:"-1",upperBound:"1",sourceType:"company_budget",evidence:[{sourceId:"budget",title:"Budget",asOfDate:"2026-01-01"}],rationale:"Budget",methodology:"Reviewed budget",confidence:"high",impacts:["revenue"]}]};
 const request=buildInstitutionalAssumptionValueRequest({configuration,assumptionId:"growth",period:"2027",locale});
 const answeredRequest={id,sourceNamespace:request.sourceNamespace,requirementKey:request.key,producerBinding:request.producerBinding,answerKind:"number",answerSource:"custom",answeredBy:id,answeredAt:"2026-09-09T12:00:00Z",messageId:id,responseFingerprint:createHash("sha256").update(content).digest("hex")};
 return {configuration,answeredRequest,content,messageId:id};
}
describe("persisted institutional assumption answer",()=>{
 it.each([["en-US","7.25"],["pt-BR","7,25"]] as const)("normalizes declared percent for %s without changing historical facts",(locale,content)=>{
  const input=setup(locale,content);const original=structuredClone(input.configuration);const result=applyInstitutionalAssumptionAnswer(input)!;
  expect(result.status).toBe("review_required");if(result.status!=="review_required")return;
  expect(result.nextConfiguration.assumptionBook.assumptions[0]!.values["2027"]).toBe("0.0725");
  expect(result.answerEvidence).toMatchObject({answeredBy:id,messageId:id,priorValue:"0.03",canonicalValue:"0.0725"});
  expect(result.nextConfiguration.assumptionBook.parentScenarioId).toBe("reviewed-base");
  expect(result.nextConfiguration.assumptionBook.assumptions[0]!.evidence).toEqual([]);
  expect(result.willExecute).toBe(false);expect(input.configuration).toEqual(original);
 });
 it.each(["{\"value\":7}","7%","about 7","1,000","1e3","NaN"])("rejects unsupported notation %s",content=>expect(()=>applyInstitutionalAssumptionAnswer(setup("en-US",content))).toThrow());
 it("rejects stale configuration and changed response bytes",()=>{
  const input=setup();input.configuration.assumptionBook.scenarioName="Changed";expect(()=>applyInstitutionalAssumptionAnswer(input)).toThrow("stale");
  const other=setup();other.content="8";expect(()=>applyInstitutionalAssumptionAnswer(other)).toThrow("response_mismatch");
 });
 it("rejects tampered target, immutable assumption and out-of-bounds values",()=>{
  const input=setup();input.answeredRequest.producerBinding.targetPaths=["openingBalanceSheet.cash"];expect(()=>applyInstitutionalAssumptionAnswer(input)).toThrow();
  const immutable=setup();immutable.configuration.assumptionBook.assumptions[0]!.editable=false;expect(()=>applyInstitutionalAssumptionAnswer(immutable)).toThrow();
  expect(()=>applyInstitutionalAssumptionAnswer(setup("en-US","101"))).toThrow("bounds");
 });
 it("records unavailability without proposing a value and ignores unrelated namespaces",()=>{
  const input=setup();input.answeredRequest.answerSource="unavailable";expect(applyInstitutionalAssumptionAnswer(input)).toEqual({status:"unavailable",willExecute:false});
  input.answeredRequest.sourceNamespace="unrelated";expect(applyInstitutionalAssumptionAnswer(input)).toBeNull();
 });
});
