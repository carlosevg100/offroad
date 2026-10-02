/** Prospective request pins for both real preview model boundaries. They never
 * authorize a call; SQL must admit the recipe and its physical input closure. */
import {z} from "zod";
import {createHash} from "node:crypto";
import {prepareGatewayInput,buildEffectiveAdapterRequest,assertGatewaySchemaUnchanged,defaultTaskPolicies,resolveModel,
 legacyGatewayFingerprint,ordinalGatewayFingerprint,listPrices,type PreparedGatewayInput,type ModelRef} from "@offroad/model-gateway";
import {preparePreviewQuestionsGatewayRequest,type PreviewQuestionsInput} from "./preview-questions";
import {preparePreviewSynthesisGatewayRequest,type PreviewSynthesisInput} from "./preview-synthesis";
export type PreviewModelRecipeInput={boundary:"questions";input:PreviewQuestionsInput}|{boundary:"synthesis";input:PreviewSynthesisInput};
export function preparePreviewNativeModelRecipe(input:PreviewModelRecipeInput){
 const boundary=input.boundary,task=boundary==="questions"?"preview_questions":"preview_synthesis",taskId=boundary==="questions"?"A01":"A02";
 const maxOutputTokens=boundary==="questions"?2000:6000,timeoutMs=boundary==="questions"?60000:120000;
 const execution={requireInputAttestation:true,outputMode:"structured" as const,maxOutputTokens,timeoutMs,
 dataHandling:{classification:"restricted" as const,purpose:"case_analysis" as const,requiredPolicyVersion:"offroad-provider-retention-v2"}};
 // These are the runtime's existing constructors, not a parallel prompt builder.
 const make=<T extends z.ZodType>(prepared:PreparedGatewayInput<T>)=>{
 const resolved=resolveModel(task,defaultTaskPolicies,{}),routes=[resolved.primary,resolved.fallback!];
 if(!resolved.fallback||routes.some(r=>!((r.provider==="anthropic"&&r.model==="claude-sonnet-5")||(r.provider==="openai"&&r.model==="gpt-5.6-terra"))||r.effort!==(boundary==="questions"?"low":"medium")))throw new Error("capital_preview_model_policy_changed");
 const systemSha256=createHash("sha256").update(prepared.request.system).digest("hex"),schemaFingerprint=legacyGatewayFingerprint(prepared.schemaJson);
 const reconstruct=(route:ModelRef)=>{assertGatewaySchemaUnchanged(prepared);if(!routes.some(r=>legacyGatewayFingerprint(r)===legacyGatewayFingerprint(route)))throw new Error("capital_preview_model_route_denied");return buildEffectiveAdapterRequest(prepared,route,{maxOutputTokens,timeoutMs});};
 const pins=routes.map(route=>{const effective=reconstruct(route),price=listPrices[route.model];if(!price)throw new Error("capital_preview_model_price_missing");
  const policyFingerprint=ordinalGatewayFingerprint(["capital-preview-dispatch-policy.v1",boundary,route.provider,route.model,route.effort,systemSha256,Buffer.byteLength(prepared.request.system,"utf8"),schemaFingerprint,Buffer.byteLength(JSON.stringify(prepared.schemaJson),"utf8"),maxOutputTokens,timeoutMs,{input:price.input,output:price.output,cachedInput:price.cachedInput,cacheWrite:price.cacheWrite,longContext:price.longContext}]);
  return Object.freeze({provider:route.provider,model:route.model,effort:route.effort,requestFingerprint:effective.requestFingerprintV1,policyFingerprint});});
 return Object.freeze({schemaVersion:"capital-preview-model-recipe.v1" as const,state:"unresolved" as const,boundary,task,taskId,rendererVersion:`capital-preview-renderer.${boundary}.v1`,
  systemSha256,schemaFingerprint,inputFingerprint:prepared.inputFingerprint,promptFingerprint:reconstruct(routes[0]!).promptFingerprint,maxOutputTokens,timeoutMs,pins,
  gaps:["server_boundary_receipt_required","retained_input_and_current_source_closure_required","one_use_dispatch_and_terminal_outcome_required"] as const,prepared,reconstruct});
 };
 return input.boundary==="questions"?make(prepareGatewayInput({...preparePreviewQuestionsGatewayRequest(input.input),...execution})):make(prepareGatewayInput({...preparePreviewSynthesisGatewayRequest(input.input),...execution}));
}
