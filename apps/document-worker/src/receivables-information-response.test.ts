import {applyReceivablesSupplementPatch, receivablesSupplementPatchVersion, newReceivablesSupplementDraft, type ReceivablesPhaseOneInput} from "@offroad/receivables-analysis";
import {replayReceivablesPreparationHistory} from "./receivables-preparation-history";
import {describe, expect, it} from "vitest";

import {applyGovernedReceivablesInformationResponse} from "./receivables-information-response";

const answer = {
  id: "10000000-0000-4000-8000-000000000001",
  requirementKey: "receivables.r01.field.structure.advance_rate",
  question: "Qual advance rate devemos testar?",
  answerKind: "number" as const,
  answerSource: "custom" as const,
  sourceNamespace: "receivables_method_r01_fields",
  answeredAt: "2026-09-07T02:00:00.000Z",
  answeredBy: "20000000-0000-4000-8000-000000000001",
  producerBinding: {
    schemaVersion: "receivables-information-request-binding.v1" as const,
    methodId: "R01" as const,
    sourceDatasetHash: "a".repeat(64),
    fieldPath: "/structure/advanceRate" as const,
    valueKind: "percentage" as const,
    unit: "percent_0_100" as const,
    minimum: 0,
    maximum: 100,
    options: [],
  },
};

describe("governed receivables information responses", () => {
  it("normalizes an explicit percentage and preserves its exact user-message lineage", () => {
    const applied = applyGovernedReceivablesInformationResponse({
      answeredRequest: answer,
      content: "72,5%",
      messageId: "30000000-0000-4000-8000-000000000001",
    });
    expect(applied).toMatchObject({
      fieldPath: "/structure/advanceRate",
      canonicalValue: "0.725",
      nextDraft: {revision: 1, fields: {"/structure/advanceRate": {value: "0.725"}}},
      status: {state: "incomplete"},
    });
    expect(applied?.patch.suppliedBy.evidence).toEqual([{
      sourceClass: "user_confirmation",
      sourceId: "30000000-0000-4000-8000-000000000001",
      anchor: "information_request:10000000-0000-4000-8000-000000000001",
    }]);
  });

  it("fails closed on a value outside the bound range", () => {
    expect(() => applyGovernedReceivablesInformationResponse({
      answeredRequest: answer, content: "125%", messageId: "30000000-0000-4000-8000-000000000001",
    })).toThrow("receivables_information_response_range_invalid");
  });

  it("does not reinterpret an unbound workflow response as a financial input", () => {
    expect(applyGovernedReceivablesInformationResponse({
      answeredRequest: {...answer, sourceNamespace: "agent_assessment", producerBinding: null},
      content: "72.5", messageId: "30000000-0000-4000-8000-000000000001",
    })).toBeNull();
  });
});


const phaseOne: ReceivablesPhaseOneInput = {
  datasetHash: answer.producerBinding.sourceDatasetHash,
  universe: {id:"preparation",currency:"BRL",dates:{reportingDate:"2026-08-31",latestOriginationDate:"2026-08-01",dataStartDate:"2026-08-01",dataEndDate:"2026-08-31"},
    receivables:[],settlements:[],dilutions:[],extensions:[],repurchases:[],assignmentsAndLiens:[],obligors:[],economicGroups:[],
    eventCoverage: {
      settlements: {status:"not_provided",startDate:null,endDate:null,basis:"synthetic missing evidence",limitations:[]},
      dilutions: {status:"not_provided",startDate:null,endDate:null,basis:"synthetic missing evidence",limitations:[]},
      extensions: {status:"not_provided",startDate:null,endDate:null,basis:"synthetic missing evidence",limitations:[]},
      repurchases: {status:"not_provided",startDate:null,endDate:null,basis:"synthetic missing evidence",limitations:[]},
      assignmentsAndLiens: {status:"not_provided",startDate:null,endDate:null,basis:"synthetic missing evidence",limitations:[]},
    },
  },
};
function preparationInput() {
  const response = {answeredRequest: answer, content:"72,5%",messageId:"30000000-0000-4000-8000-000000000001"};
  const applied = applyGovernedReceivablesInformationResponse(response)!;
  return {phaseOne,documents:[],history:[{patch:applied.patch,resultingDraft:applied.nextDraft}],currentDraft:applied.nextDraft,responses:[response],resolvedValues:[]};
}
describe("human response preparation authority", () => {
  it("replays the bound human response using its exact parser and dataset", () => {
    const input=preparationInput();
    expect(replayReceivablesPreparationHistory(input)).toEqual(input.currentDraft);
  });
  it("refuses a matching suppliedBy label without the persisted response authority", () => {
    expect(() => replayReceivablesPreparationHistory({...preparationInput(),responses:[]})).toThrow("receivables_preparation_answer_authority_missing");
  });
  it("refuses a changed value, author, field or dataset in the persisted answer proof", () => {
    const input=preparationInput();
    expect(() => replayReceivablesPreparationHistory({...input,responses:[{...input.responses[0]!,content:"82,5%"}]})).toThrow("receivables_preparation_answer_value_changed");
    expect(() => replayReceivablesPreparationHistory({...input,responses:[{...input.responses[0]!,answeredRequest:{...answer,answeredBy:"other-user"}}]})).toThrow("receivables_preparation_answer_value_changed");
    expect(() => replayReceivablesPreparationHistory({...input,responses:[{...input.responses[0]!,answeredRequest:{...answer,producerBinding:{...answer.producerBinding,fieldPath:"/structure/reserveRate"}}}]})).toThrow("receivables_preparation_answer_value_changed");
    expect(() => replayReceivablesPreparationHistory({...input,responses:[{...input.responses[0]!,answeredRequest:{...answer,producerBinding:{...answer.producerBinding,sourceDatasetHash:"b".repeat(64)}}}]})).toThrow("receivables_preparation_answer_dataset_changed");
  });
  it("does not recover a withdrawn answer from a historical draft", () => {
    const input=preparationInput();
    expect(() => replayReceivablesPreparationHistory({...input,responses:[{...input.responses[0]!,answeredRequest:{...answer,answerSource:"unavailable"}}]})).toThrow("receivables_preparation_answer_value_changed");
    expect(() => replayReceivablesPreparationHistory({...input,currentDraft:newReceivablesSupplementDraft(phaseOne.datasetHash)})).toThrow("receivables_preparation_history_incomplete");
  });
});


describe("resolved preparation values", () => {
  function contextInput() {
    const reference = {sourceClass:"project_context" as const,sourceId:"revision-1",anchor:"adopted:/structure/advanceRate"};
    const patch = {schemaVersion:receivablesSupplementPatchVersion,patchId:"adoption-revision-1",sourceDatasetHash:phaseOne.datasetHash,
      suppliedBy:{actorType:"user" as const,actorId:"historical-author",suppliedAt:"2026-09-23T00:00:00Z",evidence:[reference]},
      sections:{},fields:[{path:"/structure/advanceRate" as const,value:"0.725"}],evidence:{facilityAndWaterfall:[reference]}};
    const currentDraft = applyReceivablesSupplementPatch({draft:newReceivablesSupplementDraft(phaseOne.datasetHash),patch});
    return {phaseOne,documents:[],history:[{patch,resultingDraft:currentDraft}],currentDraft,responses:[],
      resolvedValues:[{...reference,path:"/structure/advanceRate",value:"0.725"}]};
  }
  it("accepts only the exact adopted path and value independently resolved by the loader", () => {
    const input = contextInput();
    expect(replayReceivablesPreparationHistory(input)).toEqual(input.currentDraft);
    for (const change of [{path:"/structure/reserveRate"},{value:"0.8"},{sourceId:"other-revision"},{anchor:"other-anchor"}]) {
      expect(() => replayReceivablesPreparationHistory({...input,resolvedValues:[{...input.resolvedValues[0]!,...change}]})).toThrow("patch_value_unbound");
    }
  });
  it("refuses a multi-target patch that swaps the authority of policy and structure", () => {
    const input = contextInput();
    const base = input.history[0]!.patch;
    const policyReference = {sourceClass:"project_context" as const,sourceId:"policy-revision",anchor:"adopted:/policy/maxDaysPastDue"};
    const patch = {...base,fields:[...base.fields,{path:"/policy/maxDaysPastDue" as const,value:30}],
      suppliedBy:{...base.suppliedBy,evidence:[policyReference]},
      evidence:{eligibilityPolicy:base.evidence.facilityAndWaterfall,facilityAndWaterfall:[policyReference]}};
    const currentDraft = applyReceivablesSupplementPatch({draft:newReceivablesSupplementDraft(phaseOne.datasetHash),patch});
    expect(() => replayReceivablesPreparationHistory({...input,history:[{patch,resultingDraft:currentDraft}],currentDraft,
      resolvedValues:[...input.resolvedValues,{...policyReference,path:"/policy/maxDaysPastDue",value:30}]})).toThrow("authority_target_ambiguous");
  });
  it("refuses an extra reference even when another reference binds the financial value", () => {
    const input = contextInput();
    const invented = {...input.history[0]!.patch.suppliedBy.evidence[0]!,sourceId:"invented-revision"};
    input.history[0]!.patch.suppliedBy.evidence.push(invented);
    input.history[0]!.patch.evidence.facilityAndWaterfall.push(invented);
    expect(() => replayReceivablesPreparationHistory(input)).toThrow("reference_unbound");
  });
  it("refuses evidence in a section with no corresponding contributed value", () => {
    const input = contextInput();
    const patch = input.history[0]!.patch;
    expect(() => replayReceivablesPreparationHistory({...input,history:[{...input.history[0]!,patch:{...patch,evidence:{...patch.evidence,eligibilityPolicy:patch.suppliedBy.evidence}}}]})).toThrow("evidence_target_mismatch");
  });
  it("replays a published house parameter only with an exact resolved parameter value", () => {
    const input = contextInput();
    const reference = {...input.history[0]!.patch.suppliedBy.evidence[0]!,sourceClass:"house_method" as const};
    const patch = {...input.history[0]!.patch,suppliedBy:{...input.history[0]!.patch.suppliedBy,evidence:[reference]},evidence:{facilityAndWaterfall:[reference]}};
    const currentDraft = applyReceivablesSupplementPatch({draft:newReceivablesSupplementDraft(phaseOne.datasetHash),patch});
    expect(replayReceivablesPreparationHistory({...input,history:[{patch,resultingDraft:currentDraft}],currentDraft,
      resolvedValues:[{...input.resolvedValues[0]!,...reference}]})).toEqual(currentDraft);
    expect(() => replayReceivablesPreparationHistory({...input,history:[{patch,resultingDraft:currentDraft}],currentDraft})).toThrow("patch_value_unbound");
  });
  it("does not treat a house parameter as authority for reported accounting facts", () => {
    const reference = {sourceClass:"house_method" as const,sourceId:"published-component",anchor:"parameters"};
    const patch = {schemaVersion:receivablesSupplementPatchVersion,patchId:"misused-method",sourceDatasetHash:phaseOne.datasetHash,
      suppliedBy:{actorType:"system" as const,actorId:"preparer",suppliedAt:"2026-09-23T00:00:00Z",evidence:[reference]},
      sections:{accounting:{value:{grossReceivablesBalance:"100",allowanceBalance:"0",reportedCollectionsInPeriod:"0"}}},fields:[],evidence:{accountingReconciliation:[reference]}};
    const currentDraft = applyReceivablesSupplementPatch({draft:newReceivablesSupplementDraft(phaseOne.datasetHash),patch});
    expect(() => replayReceivablesPreparationHistory({phaseOne,documents:[],history:[{patch,resultingDraft:currentDraft}],currentDraft,responses:[],
      resolvedValues:[{...reference,path:"/accounting",value:patch.sections.accounting.value}]})).toThrow("method_not_factual_authority");
  });
});


describe("finding disposition preparation provenance", () => {
  function findingInput() {
    const reference = {sourceClass:"project_context" as const,sourceId:"adopted-disposition-revision",anchor:"finding:synthetic"};
    const value = [{findingId:"synthetic-finding",disposition:"remediated" as const,rationale:"Synthetic adopted remediation record",evidence:[reference]}];
    const patch = {schemaVersion:receivablesSupplementPatchVersion,patchId:"adopted-disposition",sourceDatasetHash:phaseOne.datasetHash,
      suppliedBy:{actorType:"user" as const,actorId:"historical-author",suppliedAt:"2026-09-23T00:00:00Z",evidence:[reference]},
      sections:{findingResolutions:{value}},fields:[],evidence:{}};
    const currentDraft = applyReceivablesSupplementPatch({draft:newReceivablesSupplementDraft(phaseOne.datasetHash),patch});
    return {phaseOne,documents:[],history:[{patch,resultingDraft:currentDraft}],currentDraft,responses:[],resolvedValues:[{...reference,path:"/findingResolutions",value:structuredClone(value)}]};
  }
  it("preserves the exact adopted disposition without asserting method readiness", () => {
    const input = findingInput();
    expect(replayReceivablesPreparationHistory(input)).toEqual(input.currentDraft);
  });
  it("refuses changes to finding identity, disposition or rationale", () => {
    for (const change of [{findingId:"invented"},{disposition:"false_positive"},{rationale:"Changed remediation rationale"}]) {
      const input = findingInput();
      Object.assign(input.history[0]!.patch.sections.findingResolutions.value[0]!,change);
      expect(() => replayReceivablesPreparationHistory(input)).toThrow("patch_value_unbound");
    }
  });
  it("refuses an unresolved nested finding reference even when the outer value is pinned", () => {
    const input = findingInput();
    input.history[0]!.patch.sections.findingResolutions.value[0]!.evidence[0] = {...input.history[0]!.patch.sections.findingResolutions.value[0]!.evidence[0]!,sourceId:"invented-reference"};
    input.resolvedValues[0]!.value = structuredClone(input.history[0]!.patch.sections.findingResolutions.value);
    expect(() => replayReceivablesPreparationHistory(input)).toThrow("reference_unbound");
  });
});
