import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {createAnthropicAdapter,createOpenAIAdapter,createModelGateway,type GatewayCallLog} from "@offroad/model-gateway";
import {assertDocumentWorkLiveEnvironment} from "../src/document-work-product-live";

async function main(){
  assertDocumentWorkLiveEnvironment(process.env);
  const anthropicKey=process.env.ANTHROPIC_API_KEY,openaiKey=process.env.OPENAI_API_KEY;
  if(!anthropicKey||!openaiKey)throw new Error("advisor_probe_credentials_missing");
  const {advisorResponseContract}=await import(new URL("../../../apps/document-worker/src/agent-operation-brief.ts",import.meta.url).href);
  const calls:GatewayCallLog[]=[];
  const gateway=createModelGateway({adapters:{anthropic:createAnthropicAdapter({apiKey:anthropicKey}),openai:createOpenAIAdapter({apiKey:openaiKey})},budget:{maxCostUsd:1,maxCalls:8},onCall:call=>calls.push(call)});
  const input=[{type:"text" as const,text:JSON.stringify({locale:"pt-BR",currentBrief:{},project:{name:"Synthetic company meeting",entryJob:"origination_thesis",accessBasis:"public_information"},companyProfile:{companyName:"Synthetic Company"},documentInventory:[],workPlan:[],artifacts:[],recentConversation:[],latestUserMessage:"Quero preparar uma reunião com a Synthetic Company. Quais informações sobre o objetivo da reunião você precisa?",executionRoute:{action:"clarify",reasonCode:"missing_mission_context",analysisScope:null}})}];
  const results:Array<{provider:string;shape:string;passed:boolean;failure:string|null;start:number;end:number}>=[];
  for(const provider of ["anthropic","openai"] as const){
    for(const shape of ["prior_structured","current_prompted"] as const){
      const start=calls.length;
      try{
        const generated=await gateway.complete({...advisorResponseContract,input,allowFallback:false,
          outputMode:shape==="prior_structured"?"structured":"prompted_json",maxOutputTokens:shape==="prior_structured"?2000:advisorResponseContract.maxOutputTokens,
          model:provider==="anthropic"?{provider,model:"claude-sonnet-5",effort:"medium"}:{provider,model:"gpt-5.6-sol",effort:"high"}});
        const parsed=advisorResponseContract.schema.safeParse(generated.output);
        results.push({provider,shape,passed:parsed.success,failure:parsed.success?null:"response_contract_failed",start,end:calls.length});
      }catch(error){
        const code=error&&typeof error==="object"&&"code" in error?String(error.code):"provider_failed";
        results.push({provider,shape,passed:false,failure:code,start,end:calls.length});
      }
    }
  }
  const spent=gateway.spent();
  const passed=results.filter(result=>result.shape==="current_prompted").length===2&&results.filter(result=>result.shape==="current_prompted").every(result=>result.passed)&&spent.calls<=8&&spent.budgetExposureUsd<=1;
  const directory=resolve(process.env.RUNNER_TEMP??"outputs","advisor-response-live");mkdirSync(directory,{recursive:true});
  writeFileSync(resolve(directory,"evidence.json"),JSON.stringify({synthetic:true,promotion:false,scope:"actual_advisor_response_contract_not_full_application",gitSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,passed,budget:{maxCostUsd:1,maxCalls:8},spent,results,calls},null,2));
  writeFileSync(resolve(directory,"summary.md"),`# Advisor response provider contract\n\n${passed?"PASS":"FAIL"}. Synthetic input, production schema and instructions. Prior shape is diagnostic; both current provider routes must pass. This does not prove an entire user journey.\n\n${results.map(result=>`- ${result.provider} / ${result.shape}: ${result.passed?"PASS":result.failure}`).join("\n")}\n\nMeasured USD ${spent.costUsd}; reserved exposure USD ${spent.budgetExposureUsd}; ${spent.calls} attempts; unknown costs ${spent.unknownCostCalls}.\n`);
  if(!passed)process.exitCode=1;
}
main().catch(()=>{process.exitCode=1;console.error("advisor_response_probe_failed");});
