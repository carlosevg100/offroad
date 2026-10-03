/** Local rollback fixture, actual shared deterministic prelude only. */
import {readFileSync} from "node:fs";
import {legacyGatewayFingerprint,prepareGatewayInput,retentionMatrixVersion} from "@offroad/model-gateway";
import {capitalPlanningMapSchema} from "@offroad/domain-contracts";
import {researchSourceSchema} from "@offroad/public-research";
import {z} from "zod";
import {capitalPlanningContextSchema,planningPreludeTaskArtifact} from "../src/capital-planning.js";
import {assembleCapitalS11Components,assembleCapitalS11RevisionComponents,capitalS11NativeTaskArtifact} from "../src/capital-s11-native-consumer.js";
import {prepareCapitalS11Recipe,capitalS11ExecutionPins} from "../src/capital-s11-recipe.js";
import {transformCapitalS11FinalProduct} from "../src/capital-s11-final.js";
const input=JSON.parse(readFileSync(0,"utf8")),context=capitalPlanningContextSchema.parse(input.context);
const name=context.session.company_profile.name,website=context.session.company_profile.website;
if(typeof name!=="string"||!name.trim())throw new Error("s11_fixture_company_identity_missing");
if(input.base){
 const source=researchSourceSchema.strict().parse({...input.source,publishedAt:input.source.publishedAt??null}),company={name:name.trim(),website:typeof website==="string"?website:null};
 const research={status:"succeeded" as const,sources:[source],costExposureUsd:0,jurisdiction:"BR" as const,jurisdictionNeedsConfirmation:false,strategyFingerprint:"e".repeat(64)};
 const components=input.revision?assembleCapitalS11RevisionComponents({jobId:input.jobId,recipeId:input.recipeId,predecessorRecipeId:input.predecessorRecipeId,context,company,research,predecessors:input.predecessors,delivered:[{deliveryId:input.deliveryId,retainedPayloadId:input.retainedPayloadId,source}]}):assembleCapitalS11Components({jobId:input.jobId,recipeId:input.recipeId,context,company,research,prelude:input.prelude,delivered:[{deliveryId:input.deliveryId,retainedPayloadId:input.retainedPayloadId,source}]});
 const reconstruction=prepareCapitalS11Recipe({basis:{jobId:input.jobId,organizationId:context.project.organization_id,workId:context.project.id,planId:context.plan.id,planFingerprint:context.plan.fingerprint,locale:context.session.locale,asOfDate:input.base.asOfDate},components});
 const prepared=prepareGatewayInput({...reconstruction.prepared.request,requireInputAttestation:true,outputMode:"structured",timeoutMs:240000,dataHandling:{classification:"confidential",purpose:"case_analysis",requiredPolicyVersion:retentionMatrixVersion}});
 const primary=capitalS11ExecutionPins({...reconstruction,prepared},{provider:"anthropic",model:"claude-sonnet-5",effort:"medium"});
 const fallback=capitalS11ExecutionPins({...reconstruction,prepared},{provider:"openai",model:"gpt-5.6-terra",effort:"medium"});
 // Schema-driven synthetic model response, explicitly a rollback SQL fixture.
 // The separate HTTP/SDK gate is required to claim producer transport behavior.
 const synthetic=(s:any):any=>s.const!==undefined?s.const:s.enum?s.enum[0]:s.anyOf?synthetic(s.anyOf.find((v:any)=>v.type!=="null")??s.anyOf[0]):s.type==="object"?Object.fromEntries((s.required??[]).map((k:string)=>[k,synthetic(s.properties[k])])):s.type==="array"?Array.from({length:s.minItems??0},()=>synthetic(s.items)):s.type==="string"?s.format==="uri"?"https://example.invalid/synthetic":s.pattern?"alt_fixture":"x".repeat(Math.max(1,s.minLength??1)):s.type==="number"||s.type==="integer"?s.minimum??0:s.type==="boolean"?true:s.type==="null"?null:(()=>{throw new Error("unsupported_fixture_schema");})();
 const shape=z.toJSONSchema(capitalPlanningMapSchema),raw=synthetic(shape);raw.evidenceCoverage.status="insufficient";raw.directionalRecommendation.status="not_ready";raw.directionalRecommendation.alternativeId=null;
 raw.informationRequests=[synthetic((shape as any).properties.informationRequests.items)];const parsed=capitalPlanningMapSchema.parse(raw);
 const transformed=transformCapitalS11FinalProduct({parsed,company,locale:context.session.locale,asOfDate:input.base.asOfDate,sources:[source],researchStatus:"succeeded",accepted:{provider:"anthropic",reportedModel:"claude-sonnet-5"}});
 if(transformed.qualityResults.some(v=>!v.passed))throw new Error("s11_fixture_shared_grader_failure");
 const tasks=context.tasks.filter(t=>!["M01","M02","M03","S11"].includes(t.id)).map(t=>{
  const a=capitalS11NativeTaskArtifact(t.id,{context,planningMap:parsed,companyName:company.name,website:company.website,research:{...research,recipeId:input.recipeId,failures:[]}},{maxDispatches:2,researchReservationMicroUsd:300000});
  const body={schemaVersion:"capital-planning-task.v1",taskId:t.id,artifactType:a.type,content:a.content};return{taskId:t.id,body,semanticFingerprint:legacyGatewayFingerprint(body)};
 });
 process.stdout.write(JSON.stringify({components:reconstruction.recipe.components,inputFingerprint:prepared.inputFingerprint,promptFingerprint:primary.promptFingerprint,primaryRequestFingerprint:primary.requestFingerprint,fallbackRequestFingerprint:fallback.requestFingerprint,research,parsed,outputFingerprint:legacyGatewayFingerprint(parsed),final:transformed.finalProduct,finalBodyFingerprint:legacyGatewayFingerprint(transformed.finalProduct),qualityResults:transformed.qualityResults,tasks}));process.exit(0);
}
const preludes=(["M01","M02","M03"] as const).map(taskId=>{
 const artifact=planningPreludeTaskArtifact(taskId,{context,companyName:name.trim(),website:typeof website==="string"?website:null});
 const body={schemaVersion:"capital-planning-task.v1",taskId,artifactType:artifact.type,content:artifact.content};
 return{taskId,body,semanticFingerprint:legacyGatewayFingerprint(body)};
});
process.stdout.write(JSON.stringify({preludes}));
