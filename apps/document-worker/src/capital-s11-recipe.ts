/** Prospective S11 renderer. A metadata recipe is never permission to read or dispatch. */
import {createHash} from "node:crypto";
import {z} from "zod";
import {collaborativeAdvisoryPolicy, workspaceJourneyBlueprint} from "@offroad/agent-contracts";
import {capitalPlanningBriefSchema, capitalPlanningMapSchema} from "@offroad/domain-contracts";
import {capitalPlanningCompatibilityPolicy} from "@offroad/credit-playbook";
import {assertGatewaySchemaUnchanged, buildEffectiveAdapterRequest, legacyGatewayFingerprint, ordinalGatewayFingerprint, listPrices, prepareGatewayInput, type ModelRef} from "@offroad/model-gateway";
import {researchSourceSchema} from "@offroad/public-research";
import {institutionCapabilitiesSchema} from "./advisor-context";

export const capitalS11RendererVersion = "capital-public-task-renderer.s11.v1";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z.strictObject({slot:z.enum(["company","brief","institution","research","source","revision","dependency"]),id:z.uuid(),version:z.number().int().positive(),bodyFingerprint:hash});
const basisSchema = z.strictObject({jobId:z.uuid(),organizationId:z.uuid(),workId:z.uuid(),planId:z.uuid(),planFingerprint:hash,locale:z.enum(["pt-BR","en-US"]),asOfDate:z.iso.date()});
const researchSchema = z.strictObject({status:z.enum(["succeeded","partial","abstained"]),jurisdiction:z.enum(["BR","US"]),jurisdictionNeedsConfirmation:z.boolean(),strategyFingerprint:hash,sourceIds:z.array(z.uuid()).max(500)});
const revisionSchema = z.strictObject({correctionNote:z.string().min(2).max(5000),priorContent:z.record(z.string(),z.unknown())}).nullable();
const gaps = ["server_recipe_receipt_required","current_component_authority_required","retention_and_source_closure_required","task_and_accepted_body_binding_required"] as const;
export const capitalS11RecipeSchema = z.strictObject({...basisSchema.shape,
  schemaVersion:z.literal("capital-public-task-recipe.s11.v1"),state:z.literal("unresolved"),taskId:z.literal("S11"),
  executorVersion:z.literal("2026.09.24-v2"),rendererVersion:z.literal(capitalS11RendererVersion),transformationVersion:z.literal("capital-planning-public-sources-1400.v1"),
  compatibilityPolicyHash:z.literal(capitalPlanningCompatibilityPolicy.policyHash),systemSha256:hash,schemaFingerprint:hash,
  components:z.array(ref).min(7).max(1000),reconstructionFingerprint:hash,
  gaps:z.tuple([z.literal(gaps[0]),z.literal(gaps[1]),z.literal(gaps[2]),z.literal(gaps[3])])});
export type CapitalS11Recipe = z.infer<typeof capitalS11RecipeSchema>;
export type CapitalS11Component = z.infer<typeof ref> & {body:unknown};
function deny():never {throw new Error("capital_s11_recipe_invalid");}
function owned<T>(value:T):T {if(value&&typeof value==="object"){for(const child of Object.values(value))owned(child);Object.freeze(value);}return value;}

/** Actual bodies are ephemeral; only references and observed fingerprints enter metadata. */
export function prepareCapitalS11Recipe(input:{basis:z.infer<typeof basisSchema>;components:readonly CapitalS11Component[]}) {
  try {
    const basis=basisSchema.parse(input.basis);
    const all=input.components.map(value=>{
      const component=z.strictObject({...ref.shape,body:z.unknown()}).parse(structuredClone(value));
      if(legacyGatewayFingerprint(component.body)!==component.bodyFingerprint)deny();return owned(component);
    });
    if(new Set(all.map(value=>`${value.slot}:${value.id}`)).size!==all.length)deny();
    for(const slot of ["company","brief","institution","research","revision"] as const)if(all.filter(value=>value.slot===slot).length!==1)deny();
    if(!all.some(value=>value.slot==="dependency"))deny();
    const body=(slot:CapitalS11Component["slot"])=>all.find(value=>value.slot===slot)!.body;
    const company=z.strictObject({name:z.string().min(1),website:z.string().nullable()}).parse(body("company"));
    const brief=capitalPlanningBriefSchema.strict().parse(body("brief"));
    const institution=institutionCapabilitiesSchema.nullable().parse(body("institution"));
    const research=researchSchema.parse(body("research")),revision=revisionSchema.parse(body("revision"));
    const sourceRefs=all.filter(value=>value.slot==="source");
    if(new Set(research.sourceIds).size!==research.sourceIds.length||sourceRefs.length!==research.sourceIds.length)deny();
    const sources=research.sourceIds.map(id=>{const value=sourceRefs.find(value=>value.id===id);if(!value)deny();return researchSourceSchema.strict().parse(value.body);});
    for(const dependency of all.filter(value=>value.slot==="dependency"))z.strictObject({artifactFingerprint:hash}).parse(dependency.body);
    const modelInput={locale:basis.locale,asOfDate:basis.asOfDate,jurisdiction:research.jurisdiction,jurisdictionNeedsConfirmation:research.jurisdictionNeedsConfirmation,
      company,capitalPlanningBrief:brief,institutionCapabilities:institution,journeyBlueprint:workspaceJourneyBlueprint("capital_planning"),collaborativeAdvisoryPolicy,
      evidenceBasis:"public_information_only",methodFamilies:capitalPlanningCompatibilityPolicy.families,
      publicSources:sources.map(source=>({topic:source.topic,title:source.title,url:source.url,snippet:source.snippet.slice(0,1400),publishedAt:source.publishedAt})),
      ...(revision?{requestedCorrection:revision.correctionNote,priorWorkProduct:revision.priorContent}:{})};
    const prepared=prepareGatewayInput({task:"capital_planning",system:capitalPlanningCompatibilityPolicy.system,input:[{type:"text",text:JSON.stringify(modelInput)}],
      schema:capitalPlanningMapSchema,schemaName:"capital_planning_map_v1",maxOutputTokens:8000,
      metadata:{jobId:basis.jobId,projectId:basis.workId,publicSourceCount:String(sources.length),jurisdiction:research.jurisdiction,revision:revision?"true":"false"},
      cacheKey:`capital-planning-map:${capitalPlanningCompatibilityPolicy.policyHash}`});
    const recipe=owned(capitalS11RecipeSchema.parse({...basis,schemaVersion:"capital-public-task-recipe.s11.v1",state:"unresolved",taskId:"S11",executorVersion:"2026.09.24-v2",
      rendererVersion:capitalS11RendererVersion,transformationVersion:"capital-planning-public-sources-1400.v1",compatibilityPolicyHash:capitalPlanningCompatibilityPolicy.policyHash,
      systemSha256:createHash("sha256").update(capitalPlanningCompatibilityPolicy.system).digest("hex"),schemaFingerprint:legacyGatewayFingerprint(prepared.schemaJson),
      components:all.map(({body:_body,...reference})=>reference),reconstructionFingerprint:prepared.inputFingerprint,gaps}));
    return Object.freeze({recipe,prepared});
  } catch {return deny();}
}

/** Closed existing production policy, no repair serializer and no S11 authority inference. */
export function reconstructCapitalS11Request(preparation:ReturnType<typeof prepareCapitalS11Recipe>,route:ModelRef) {
  capitalS11RecipeSchema.parse(preparation.recipe);assertGatewaySchemaUnchanged(preparation.prepared);
  if(preparation.prepared.inputFingerprint!==preparation.recipe.reconstructionFingerprint||route.effort!=="medium"
    ||!((route.provider==="anthropic"&&route.model==="claude-sonnet-5")||(route.provider==="openai"&&route.model==="gpt-5.6-terra")))deny();
  return buildEffectiveAdapterRequest(preparation.prepared,route,{maxOutputTokens:8000,timeoutMs:240000});
}

/** Identity of the current gateway-adapter-input.v1 send, also fixed by the SQL seal. */
export function capitalS11ExecutionPins(preparation:ReturnType<typeof prepareCapitalS11Recipe>,route:ModelRef) {
  const actual=reconstructCapitalS11Request(preparation,route);
  return Object.freeze({requestFingerprint:actual.requestFingerprintV1,promptFingerprint:actual.promptFingerprint,inputFingerprint:actual.inputFingerprint});
}

/** Observed namespace for future server pin parity, not an authorization receipt or budget. */
export function capitalS11DispatchPins(preparation:ReturnType<typeof prepareCapitalS11Recipe>,route:ModelRef) {
  const actual=reconstructCapitalS11Request(preparation,route),anthropic=route.provider==="anthropic",price=listPrices[route.model];
  if(preparation.recipe.systemSha256!=="3a27694f0e520b374c3077048f3af27eb19dcb6e6aa2dc261e8201ac4024c54b"||Buffer.byteLength(actual.adapterRequest.system)!==3304
    ||preparation.recipe.schemaFingerprint!=="4049ec522b661267da0e33a26b2a61705f7cdc2576577c6e75467bba92da93b5"
    ||capitalPlanningCompatibilityPolicy.policyHash!=="31ca5d156de399e5b8c3db53c50bd67003d05709711894cda6fb36c7f2265516")deny();
  const expectedLong=anthropic?null:{aboveInputTokens:272000,inputMultiplier:2,outputMultiplier:1.5};
  if(!price||price.input!==2||price.output!==(anthropic?10:12)||price.cacheWrite!==2.5||price.cachedInput!==0.2
    ||legacyGatewayFingerprint(price.longContext)!==legacyGatewayFingerprint(expectedLong))deny();
  const pins=owned({schemaVersion:"capital-s11-dispatch-pins.v1" as const,rendererVersion:capitalS11RendererVersion,
    provider:route.provider,model:route.model,effort:route.effort,systemSha256:preparation.recipe.systemSha256,
    systemBytes:Buffer.byteLength(actual.adapterRequest.system),schemaFingerprint:preparation.recipe.schemaFingerprint,
    compatibilityPolicyHash:capitalPlanningCompatibilityPolicy.policyHash,maxOutputTokens:8000,timeoutMs:240000,
    cacheKey:`capital-planning-map:${capitalPlanningCompatibilityPolicy.policyHash}`,
    pricing:{input:price.input,output:price.output,cacheWrite:price.cacheWrite,cachedInput:price.cachedInput,longContext:structuredClone(price.longContext)},
    requestFingerprint:actual.ordinalFingerprints().requestFingerprint});
  return Object.freeze({pins,policyFingerprint:ordinalGatewayFingerprint(["capital-s11-dispatch-policy.v1",pins.rendererVersion,
    pins.provider,pins.model,pins.effort,pins.systemSha256,pins.systemBytes,pins.schemaFingerprint,pins.compatibilityPolicyHash,
    pins.maxOutputTokens,pins.timeoutMs,pins.cacheKey,pins.pricing])});
}
