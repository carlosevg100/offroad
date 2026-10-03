/** Rollback SQL fixture: shared producer renderers, not HTTP or live inference. */
import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {companyDebtDiagnosticSchema} from '@offroad/domain-contracts';
import {researchSourceSchema} from '@offroad/public-research';
import {legacyGatewayFingerprint,prepareGatewayInput,retentionMatrixVersion} from '@offroad/model-gateway';
import {companyDebtContextSchema,validateCompanyDebtDiagnostic} from '../src/company-debt-view.js';
import {assembleCapitalCompanyDebtComponents} from '../src/capital-company-debt-native-consumer.js';
import {capitalCompanyDebtPreludeIds,capitalCompanyDebtPreludeProduct,capitalCompanyDebtDerivedIds,capitalCompanyDebtDerivedProduct} from '../src/capital-company-debt-task-products.js';
import {prepareCapitalCompanyDebtRecipe,capitalCompanyDebtExecutionPins} from '../src/capital-company-debt-recipe.js';
import {transformCapitalCompanyDebtFinalProduct} from '../src/capital-company-debt-final.js';
const input=JSON.parse(readFileSync(0,'utf8')),context=companyDebtContextSchema.parse(input.context);
const name=context.session.company_profile.name,website=context.session.company_profile.website;
if(typeof name!=='string'||!name.trim())throw new Error('debt_fixture_company_identity_missing');
const company={name:name.trim(),website:typeof website==='string'?website:null};
if(!input.base){
 const preludes=capitalCompanyDebtPreludeIds.map(taskId=>{const artifact=capitalCompanyDebtPreludeProduct(taskId,{context,company,maxDispatches:2});const body={schemaVersion:'company-debt-task.v1',taskId,artifactType:artifact.type,content:artifact.content};return{taskId,body,semanticFingerprint:legacyGatewayFingerprint(body)};});
 process.stdout.write(JSON.stringify({preludes}));process.exit(0);
}
const source=researchSourceSchema.strict().parse({...input.source,publishedAt:input.source.publishedAt??null});
const research={status:'succeeded' as const,researchRunId:input.recipeId,sources:[source],costExposureUsd:0};
const components=assembleCapitalCompanyDebtComponents({jobId:input.jobId,recipeId:input.recipeId,context,company,research,executionPlan:input.executionPlan,delivered:[{deliveryId:input.deliveryId,retainedPayloadId:input.retainedPayloadId,source}]});
const reconstruction=prepareCapitalCompanyDebtRecipe({basis:{jobId:input.jobId,organizationId:context.project.organization_id,workId:context.project.id,planId:context.plan.id,planFingerprint:context.plan.fingerprint,locale:context.session.locale,asOfDate:input.base.asOfDate},components});
const prepared=prepareGatewayInput({...reconstruction.prepared.request,requireInputAttestation:true,outputMode:'structured',timeoutMs:240000,dataHandling:{classification:'confidential',purpose:'case_analysis',requiredPolicyVersion:retentionMatrixVersion}});
const primary=capitalCompanyDebtExecutionPins({...reconstruction,prepared},{provider:'anthropic',model:'claude-sonnet-5',effort:'medium'});
const fallback=capitalCompanyDebtExecutionPins({...reconstruction,prepared},{provider:'openai',model:'gpt-5.6-terra',effort:'medium'});
const synthetic=(s:any):any=>s.const!==undefined?s.const:s.enum?s.enum[0]:s.anyOf?synthetic(s.anyOf.find((v:any)=>v.type!=='null')??s.anyOf[0]):s.type==='object'?Object.fromEntries((s.required??[]).map((k:string)=>[k,synthetic(s.properties[k])])):s.type==='array'?Array.from({length:s.minItems??0},()=>synthetic(s.items)):s.type==='string'?s.format==='uri'?'https://example.invalid/synthetic':s.pattern?'fixture':'x'.repeat(Math.max(1,s.minLength??1)):s.type==='number'||s.type==='integer'?s.minimum??0:s.type==='boolean'?true:s.type==='null'?null:(()=>{throw new Error('unsupported_fixture_schema');})();
const shape=z.toJSONSchema(companyDebtDiagnosticSchema),raw=synthetic(shape);
raw.capacityAssessment.status='not_computable';raw.businessRiskProfile.sourceUrls=[source.url];
// Citation constraints use the licensed fixture URL throughout.
for(const key of ['financialSignals','debtAndLiquiditySignals','workingCapitalSignals','risks','diagnosticHypotheses'])for(const item of raw[key])item.sourceUrls=[source.url];
const parsed=companyDebtDiagnosticSchema.parse(raw),qualityResults=validateCompanyDebtDiagnostic(parsed,new Set([source.url]),[source]).map(({id,passed})=>({id,passed}));
if(qualityResults.some(v=>!v.passed))throw new Error(JSON.stringify(qualityResults));
const final=transformCapitalCompanyDebtFinalProduct({parsed,company,locale:context.session.locale,asOfDate:input.base.asOfDate,sources:[source],researchStatus:'succeeded',accepted:{provider:'anthropic',reportedModel:'claude-sonnet-5'}});
const tasks=capitalCompanyDebtDerivedIds.map(taskId=>{const a=capitalCompanyDebtDerivedProduct(taskId,{company,diagnostic:parsed,research});const body={schemaVersion:'company-debt-task.v1',taskId,artifactType:a.type,content:a.content};return{taskId,body,semanticFingerprint:legacyGatewayFingerprint(body)};});
process.stdout.write(JSON.stringify({components:reconstruction.recipe.components,inputFingerprint:prepared.inputFingerprint,promptFingerprint:primary.promptFingerprint,primaryRequestFingerprint:primary.requestFingerprint,fallbackRequestFingerprint:fallback.requestFingerprint,research,parsed,outputFingerprint:legacyGatewayFingerprint(parsed),final,finalBodyFingerprint:legacyGatewayFingerprint(final),qualityResults,tasks}));
