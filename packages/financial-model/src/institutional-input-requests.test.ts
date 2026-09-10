import {describe,expect,it} from "vitest";
import {buildInstitutionalModelInformationRequests} from "./institutional-input-requests";
import {prepareInstitutionalModelInput,type PreparedInstitutionalModelInput,type InstitutionalModelInputGap} from "./institutional-input";
function blocked(missingInputs:InstitutionalModelInputGap[]):PreparedInstitutionalModelInput{
  return {...prepareInstitutionalModelInput({facts:[],sources:[]}),missingInputs};
}
describe("guided financial input questions",()=>{
  it("starts absent configuration with scope, history, premises and debt without asking for JSON",()=>{
    const prepared=prepareInstitutionalModelInput({facts:[],sources:[]});
    const result=buildInstitutionalModelInformationRequests(prepared,"pt-BR");
    expect(result.requests).toHaveLength(4);
    expect(result.requests[0]!.answerBinding.category).toBe("scope_confirmation");
    expect(result.requests[0]!.answerKind).toBe("text");
    expect(result.requests.every(r=>r.answerBinding.expectedConfigurationFingerprint===prepared.configurationFingerprint)).toBe(true);
    expect(result.unresolvedTargetPaths).toEqual(["configuration"]);
    expect(result.requests.map(r=>r.question).join(" ")).not.toMatch(/JSON|hash|fingerprint|sourceId|targetPath/i);
    expect(prepared.status).toBe("missing_inputs");
  });
  it("groups historical slots and shows their business labels",()=>{
    const result=buildInstitutionalModelInformationRequests(blocked([
      {targetPath:"openingBalanceSheet.unrestrictedCash",code:"fact_missing",detail:"technical detail"},
      {targetPath:"openingBalanceSheet.inventory",code:"fact_missing",detail:"technical detail"},
    ]),"pt-BR");
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({answerKind:"document",answerBinding:{category:"historical_document"}});
    expect(result.requests[0]!.whyItMatters).toContain("caixa disponível");
    expect(result.requests[0]!.whyItMatters).toContain("estoques");
  });
  it("routes source version errors to internal actions without exposing diagnostics",()=>{
    const result=buildInstitutionalModelInformationRequests(blocked([{targetPath:"openingBalanceSheet.cash",code:"source_unbound",detail:"secret-document-id:hash-123"}]),"en-US");
    expect(result.requests).toEqual([]);
    expect(result.internalActions).toEqual([{code:"source_unbound",targetPaths:["openingBalanceSheet.cash"]}]);
    expect(result.unresolvedTargetPaths).toEqual(["openingBalanceSheet.cash"]);
    expect(JSON.stringify(result)).not.toContain("secret-document");
  });
  it("separates forecast premises, historical reconciliation and perimeter confirmation",()=>{
    const result=buildInstitutionalModelInformationRequests(blocked([
      {targetPath:"assumptionBook.growth",code:"assumption_invalid",detail:"missing"},
      {targetPath:"historicalPerimeter",code:"configuration_invalid",detail:"scope"},
      {targetPath:"openingBalanceSheet.grossDebt",code:"fact_disputed",detail:"difference"},
      {targetPath:"debtInstruments.loan.2027",code:"configuration_invalid",detail:"missing drawdown"},
    ]),"en-US");
    expect(result.requests.map(r=>r.answerBinding.category)).toEqual(["scope_confirmation","historical_document","forecast_premise","forecast_premise"]);
    expect(result.requests.every(r=>r.question.length<=500&&r.whyItMatters.length<=700&&r.acceptableEvidence.length<=5)).toBe(true);
  });
  it("keeps binding identity bilingual, order independent and invalidates changed configuration",()=>{
    const first=blocked([{targetPath:"openingBalanceSheet.inventory",code:"fact_missing",detail:"missing"},{targetPath:"openingBalanceSheet.payables",code:"fact_missing",detail:"missing"}]);
    const pt=buildInstitutionalModelInformationRequests(first,"pt-BR");
    const en=buildInstitutionalModelInformationRequests({...first,missingInputs:[...first.missingInputs].reverse()},"en-US");
    expect(pt.requests[0]!.key).toBe(en.requests[0]!.key);
    expect(pt.requests[0]!.answerBinding).toEqual(en.requests[0]!.answerBinding);
    expect(pt.requests[0]!.question).not.toBe(en.requests[0]!.question);
    const revised=buildInstitutionalModelInformationRequests({...first,configurationFingerprint:"b".repeat(64)},"pt-BR");
    expect(revised.requests[0]!.key).not.toBe(pt.requests[0]!.key);
  });
  it("leaves a ready input without new information requests",()=>{
    const result=buildInstitutionalModelInformationRequests({...blocked([]),status:"ready"},"en-US");
    expect(result.requests).toEqual([]);expect(result.internalActions).toEqual([]);
  });
});
