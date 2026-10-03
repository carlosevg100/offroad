/** Entry-point orchestration regression. These mocked boundary denials do not
 * claim SQL authority, model dispatch or physical Storage execution. */
import {describe,it,expect,vi} from "vitest";
import type {ModelGateway} from "@offroad/model-gateway";
import type {QueueClient,CapitalProjectAnalysisJob} from "./queue";
import type {CapitalCompanyDebtNativeRuntime} from "./capital-company-debt-native-runtime";
const native=vi.hoisted(()=>({debt:vi.fn(),s11:vi.fn(),revision:vi.fn()}));
vi.mock("./capital-company-debt-native-consumer",()=>({consumeCapitalCompanyDebtInitial:native.debt}));
vi.mock("./capital-s11-native-consumer",()=>({consumeCapitalS11Initial:native.s11,consumeCapitalS11Revision:native.revision}));
import {processCompanyDebtViewJob} from "./company-debt-view";
import {processCapitalPlanningJob} from "./capital-planning";
import {job as planningJob} from "./capital-planning.test-support";

function harness(family:"C11"|"S11",errorCode:string,atRecovery=false){
 const deny=Object.assign(new Error(errorCode),{code:errorCode});
 native.debt.mockReset();native.s11.mockReset();native.revision.mockReset();
 native.debt.mockRejectedValue(deny);native.s11.mockRejectedValue(deny);native.revision.mockRejectedValue(deny);
 const recovery=vi.fn(atRecovery?async()=>{throw deny;}:async()=>null);
 const adapter=vi.fn(()=>({}));
 const queue={writeStage:vi.fn(async()=>{}),fail:vi.fn(async()=>{}),complete:vi.fn(async()=>{}),
  completeAdvisorSpecializedJob:vi.fn(async()=>{}),createCapitalS11Adapter:adapter,createCapitalS11RecoveryAdapter:()=>({recover:recovery}),
  loadCapitalProjectContext:vi.fn(),recordCapitalProjectArtifact:vi.fn(),recordPublicResearch:vi.fn(),recordAgentAssessment:vi.fn(),
  loadPrivateProjectMemory:vi.fn(),writePrivateProjectMemory:vi.fn()} as unknown as QueueClient;
 const model=vi.fn(),search=vi.fn();const gateway={complete:model,spent:()=>({costUsd:0,calls:0,unknownCostCalls:0,budgetExposureUsd:0})} as unknown as ModelGateway;
 const runtime={adapters:{},connections:{},maxCostUsd:.95,maxCalls:2,researchReserveUsd:.2};
 const deps={queue,gateway,lineage:()=>[],researchProviders:[{id:"official" as const,maxCostUsdPerCall:0,search}],
  ...(family==="C11"?{nativeRuntime:{...runtime,createAdapter:adapter,createRecoveryAdapter:()=>({recover:recovery})} as unknown as CapitalCompanyDebtNativeRuntime}:{s11Runtime:runtime})};
 const job:CapitalProjectAnalysisJob={...planningJob,payload:{...planningJob.payload,analysis_scope:family==="C11"?"company_debt_view":"capital_planning"}};
 return{job,deps,queue,model,search,recovery,adapter};
}
describe.each(["C11","S11"] as const)("%s active native entry denial",family=>{
 const run=family==="C11"?processCompanyDebtViewJob:processCapitalPlanningJob;
 it.each(["capital_capture_inputs_changed","provider_processing_denied","budget_exceeded","capital_retained_body_unavailable"])("never invokes the historical loader/gateway/writer after native %s",async code=>{
  const h=harness(family,code);expect((await run(h.job,h.deps)).status).toBe("failed");
  expect(h.recovery).toHaveBeenCalledOnce();expect(h.adapter).toHaveBeenCalledOnce();
  expect(h.queue.fail).toHaveBeenCalledWith(h.job,expect.objectContaining({retryable:false}),expect.objectContaining({retryable:false}));
  for(const method of [h.model,h.search,h.queue.loadCapitalProjectContext,h.queue.recordCapitalProjectArtifact,h.queue.recordPublicResearch,h.queue.recordAgentAssessment,h.queue.complete,h.queue.completeAdvisorSpecializedJob])expect(method).not.toHaveBeenCalled();
 });
 it("does not reinterpret current revocation as an absent recipe and start generation",async()=>{
  const h=harness(family,"42501",true);expect((await run(h.job,h.deps)).status).toBe("failed");
  expect(h.adapter).not.toHaveBeenCalled();expect(native.debt).not.toHaveBeenCalled();expect(native.s11).not.toHaveBeenCalled();
  expect(h.model).not.toHaveBeenCalled();expect(h.search).not.toHaveBeenCalled();expect(h.queue.loadCapitalProjectContext).not.toHaveBeenCalled();
 });
});
