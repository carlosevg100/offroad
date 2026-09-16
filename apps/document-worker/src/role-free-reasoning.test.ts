// Synthetic counterfactual based on a rolled-back staging capture; no production data.
import {it,expect} from "vitest";
import {buildIntentClassifierInput, routeWorkspaceExecution} from "@offroad/agent-contracts";
import {compileObjectiveToPlan} from "@offroad/work-plan";
import type {ModelGateway} from "@offroad/model-gateway";
import {processAgentOperationBriefJob} from "./agent-operation-brief";
import type {AgentOperationBriefJob,QueueClient} from "./queue";
it("sends identical reasoning, budget, quality contract and routing with CFO, analyst, advisor or no profile",async()=>{
 const common = {
  "brief": {
    "instruments": [],
    "collateralKinds": []
  },
  "tasks": [],
  "locale": "pt-BR",
  "message": "Compare as alternativas de estrutura de capital com base no documento disponível.",
  "project": {
    "id": "a11c0000-0000-4000-9000-000000000002",
    "name": "Synthetic restricted project",
    "phase": "understand",
    "status": "active",
    "entryJob": "capital_planning",
    "accessBasis": "authorized_private"
  },
  "artifacts": [],
  "documents": [
    {
      "id": "a11c0000-0000-4000-9000-000000000004",
      "kind": null,
      "name": "Synthetic confidential source",
      "status": "ready"
    }
  ],
  "message_id": "2ed2436b-1797-4cc5-b73f-d9fa854ba3b0",
  "session_id": "a11c0000-0000-4000-9000-000000000003",
  "active_plan": null,
  "manifest_id": null,
  "company_profile": {},
  "recent_messages": [
    {
      "id": "a11c0000-0000-4000-9000-000000000007",
      "role": "user",
      "content": "Synthetic confidential question",
      "created_at": "2026-09-16T00:17:11.083177+00:00"
    }
  ],
  "message_metadata": {},
  "snapshot_fingerprint": "fc31c770af7f8d7e7d39a1946c66199713b55f88e0aca8e7bd50413bcdb9abfc",
  "projection_updated_at": "2026-09-16T00:17:11.083177+00:00",
  "latest_execution_brief": null,
  "related_project_memory": [],
  "institution_capabilities": null,
  "organization_methodology": null,
  "answered_information_request": null
};
 const contexts=['cfo','credit_analyst','financial_advisor','absent'].map(profile=>({profile,loader:'worker_load_agent_context_v5',context:{...common,...(profile==='absent'?{}:{professional_context:{professionalRoles:[profile],useForms:['institutional_work'],practiceAreas:['corporate_finance'],primaryObjectives:['evaluate_capital_options'],institutionName:null,disclosureStatus:'complete',lastConfirmedAt:null}})}}));
 const requests:unknown[]=[];
 for(const item of contexts.filter(x=>x.loader==='worker_load_agent_context_v5')){
  const job={claimed:true,job_id:'a11c0000-0000-4000-9000-000000000099',capability_token:'d'.repeat(64),lease_expires_at:'2026-09-16T01:00:00Z',attempt:1,kind:'agent_operation_brief',organization_id:'a11c0000-0000-4000-9000-000000000001',intake_session_id:item.context.session_id,processing_run_id:'a11c0000-0000-4000-9000-000000000005',payload:{message_id:item.context.message_id,locale:'pt-BR'}} as AgentOperationBriefJob;
  const queue={writeStage:async()=>{},loadAgentContext:async()=>item.context,recordAgentResponse:async()=>({}),complete:async()=>{},recordAgentFailure:async()=>{},recordIntentEnvelope:async()=>{},fail:async()=>{throw Error('unexpected failure')}} as unknown as QueueClient;
  const gateway={complete:async(request:unknown)=>{requests.push(request);return {output:{state:'idle',reply:'A análise compara custos, prazos, garantias, diluição e condições de execução usando a evidência disponível.'},usage:{inputTokens:1,outputTokens:1,cachedInputTokens:0}}},spent:()=>({costUsd:0,calls:1})} as unknown as ModelGateway;
  const result=await processAgentOperationBriefJob(job,{queue,gateway,log:()=>{},shadowRouting:false});
  expect(result.status).toBe('succeeded');
 }
 expect(requests).toHaveLength(4);
 for(const request of requests){
  expect(request).toEqual(requests[0]);
  const serialized=JSON.stringify(request);
  expect(serialized).not.toContain('professionalContext');
  expect(serialized).not.toContain('professionalRoles');
 }

});

it("keeps intent, execution gates and plan independent of legacy role and disclosure status",()=>{
 const decisions=['cfo','credit_analyst','financial_advisor',null].map(role=>{
  const input={locale:'pt-BR' as const,latestUserMessage:'Prepare alternativas de estrutura de capital para uma decisão do conselho.',recentConversation:[],entryJob:'capital_planning',documentCount:1,professionalContext:role?{professionalRoles:[role]}:null};
  const route={entryJob:'capital_planning',companyName:'Synthetic company',documentCount:1,artifactTypes:[],requestText:input.latestUserMessage,professionalContextStatus:role?'complete':'skipped'};
  const plan={message:input.latestUserMessage,hasAttachments:true,professionalRole:role};
  return {intent:buildIntentClassifierInput(input),execution:routeWorkspaceExecution(route),plan:compileObjectiveToPlan(plan)};
 });
 for(const decision of decisions)expect(decision).toEqual(decisions[0]);
 expect(decisions[0]?.intent).not.toHaveProperty('professionalContext');
 expect(compileObjectiveToPlan({message:'Qual é a diferença entre IPCA capitalizado no principal e IPCA pago em caixa?',hasAttachments:false})).not.toEqual(decisions[0]?.plan);
});
