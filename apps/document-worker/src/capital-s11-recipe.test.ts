import {randomUUID} from "node:crypto";
import {describe,expect,it} from "vitest";
import {capitalPlanningCompatibilityPolicy} from "@offroad/credit-playbook";
import {buildEffectiveAdapterRequest,legacyGatewayFingerprint,createModelGateway} from "@offroad/model-gateway";
import {prepareCapitalS11Recipe,reconstructCapitalS11Request,capitalS11DispatchPins,capitalS11ExecutionPins,type CapitalS11Component} from "./capital-s11-recipe";
const component=(slot:CapitalS11Component["slot"],body:unknown):CapitalS11Component=>({slot,id:randomUUID(),version:1,bodyFingerprint:legacyGatewayFingerprint(body),body});
function fixture(){const source=component("source",{topic:"identity",provider:"official",retrievedAt:"2026-10-02T00:00:00Z",contentHash:"c".repeat(64),title:"Synthetic source",url:"https://example.test/s11",snippet:"Source evidence",publishedAt:"2026-10-01"});return {
  basis:{jobId:randomUUID(),organizationId:randomUUID(),workId:randomUUID(),planId:randomUUID(),planFingerprint:"a".repeat(64),locale:"pt-BR" as const,asOfDate:"2026-10-02"},
  components:[component("company",{name:"PRIVATE_CANARY",website:null}),component("brief",{capitalIntent:"Compare public financing alternatives"}),component("institution",null),
    component("research",{status:"succeeded",jurisdiction:"BR",jurisdictionNeedsConfirmation:false,strategyFingerprint:"d".repeat(64),sourceIds:[source.id]}),source,component("revision",null),component("dependency",{artifactFingerprint:"b".repeat(64)})]};}
const payload=(value:ReturnType<typeof prepareCapitalS11Recipe>)=>JSON.parse((value.prepared.input[0] as {text:string}).text);
const rehash=(value:CapitalS11Component)=>{value.bodyFingerprint=legacyGatewayFingerprint(value.body);};
describe("prospective S11 recipe, unit reconstruction only",()=>{
  it("seals the V1 identity of the real gateway attempt instead of the ordinal V2 namespace",async()=>{
    const value=prepareCapitalS11Recipe(fixture()),route={provider:"anthropic" as const,model:"claude-sonnet-5",effort:"medium" as const};
    const sealed=capitalS11ExecutionPins(value,route),built=reconstructCapitalS11Request(value,route);
    expect(sealed.requestFingerprint).toBe(built.requestFingerprintV1);
    expect(sealed.requestFingerprint).not.toBe(built.ordinalFingerprints().requestFingerprint);
    let calls=0;
    const gateway=createModelGateway({adapters:{anthropic:{provider:"anthropic",complete:async()=>{throw new Error("denied_attempt_must_not_dispatch");}}},
      processingEligibility:async({attempt})=>{calls++;expect(attempt.adapterInputVersion).toBe("gateway-adapter-input.v1");
        expect(attempt.requestFingerprint).toBe(sealed.requestFingerprint);expect(attempt.promptFingerprint).toBe(sealed.promptFingerprint);expect(attempt.inputFingerprint).toBe(sealed.inputFingerprint);
        return {allowed:false,policyVersion:"offroad-provider-retention-v2",assuranceId:null,reasons:["processing_resource_ineligible:inference"]};}});
    await expect(gateway.complete({...value.prepared.request,dataHandling:{classification:"confidential",purpose:"case_analysis",requiredPolicyVersion:"offroad-provider-retention-v2"}})).rejects.toThrow();
    expect(calls).toBeGreaterThan(0);
  });
  it("uses actual policy and common request builder without inventing authority",()=>{
    const value=prepareCapitalS11Recipe(fixture());const route={provider:"anthropic" as const,model:"claude-sonnet-5",effort:"medium" as const};
    const actual=reconstructCapitalS11Request(value,route),expected=buildEffectiveAdapterRequest(value.prepared,route,{maxOutputTokens:8000,timeoutMs:240000});
    expect(actual.adapterRequest).toEqual(expected.adapterRequest);expect(actual.requestFingerprintV1).toBe(expected.requestFingerprintV1);
    expect(value.recipe.state).toBe("unresolved");expect(value.recipe.gaps).toHaveLength(4);expect(value.recipe.taskId).toBe("S11");
    expect(value.prepared.request.system).toBe(capitalPlanningCompatibilityPolicy.system);expect(payload(value).methodFamilies).toEqual(capitalPlanningCompatibilityPolicy.families);
    expect(actual.adapterRequest.maxOutputTokens).toBe(8000);expect(actual.adapterRequest.timeoutMs).toBe(240000);
    expect(JSON.stringify(value.recipe)).not.toContain("PRIVATE_CANARY");expect(JSON.stringify(value.recipe)).not.toContain("https://example.test");
  });
  it("keeps economic input stable across locale and pins rendered request separately",()=>{
    const input=fixture(),pt=prepareCapitalS11Recipe(input),en=prepareCapitalS11Recipe({...input,basis:{...input.basis,locale:"en-US"}});
    const {locale:_pt,...a}=payload(pt),{locale:_en,...b}=payload(en);expect(a).toEqual(b);expect(pt.recipe.components).toEqual(en.recipe.components);
    expect(pt.recipe.reconstructionFingerprint).not.toBe(en.recipe.reconstructionFingerprint);
  });
  it("pins full physical source content even beyond consumed1400chars",()=>{
    const input=fixture(),source=input.components[4]!;(source.body as {snippet:string}).snippet="x".repeat(1400)+"tailone";rehash(source);const first=prepareCapitalS11Recipe(input);
    (source.body as {snippet:string}).snippet="x".repeat(1400)+"tailtwo";rehash(source);const second=prepareCapitalS11Recipe(input);
    expect(first.recipe.reconstructionFingerprint).toBe(second.recipe.reconstructionFingerprint);expect(first.recipe.components).not.toEqual(second.recipe.components);expect(payload(second).publicSources[0].snippet).toHaveLength(1400);
  });
  it.each(["body","missing_source","unlisted_source","duplicate_source","missing_absence","missing_dependency","wrong_strategy"])("rejects changed or incomplete closure: %s",mode=>{
    const input=fixture();if(mode==="body")(input.components[0]!.body as {name:string}).name="altered";
    if(mode==="missing_source")input.components.splice(4,1);if(mode==="unlisted_source")input.components.push(component("source",input.components[4]!.body));
    if(mode==="duplicate_source"){(input.components[3]!.body as {sourceIds:string[]}).sourceIds.push(input.components[4]!.id);rehash(input.components[3]!);}
    if(mode==="missing_absence")input.components.splice(2,1);if(mode==="missing_dependency")input.components.pop();
    if(mode==="wrong_strategy"){(input.components[3]!.body as {jurisdiction:string}).jurisdiction="GLOBAL";rehash(input.components[3]!);}
    expect(()=>prepareCapitalS11Recipe(input)).toThrow("capital_s11_recipe_invalid");
  });
  it("owns input and allows only existing two specific routes",()=>{
    const input=fixture(),value=prepareCapitalS11Recipe(input);(input.components[0]!.body as {name:string}).name="later";expect(payload(value).company.name).toBe("PRIVATE_CANARY");
    expect(reconstructCapitalS11Request(value,{provider:"openai",model:"gpt-5.6-terra",effort:"medium"}).adapterRequest.model).toBe("gpt-5.6-terra");
    expect(()=>reconstructCapitalS11Request(value,{provider:"openai",model:"gpt-5.6-sol",effort:"high"})).toThrow("capital_s11_recipe_invalid");
  });
  it("requires revision bytes as a separately pinned component, never rebuilds historical sources",()=>{
    const input=fixture();input.components[5]=component("revision",{correctionNote:"Compare another path",priorContent:{privateCanary:"historical"}});
    const value=prepareCapitalS11Recipe(input);expect(payload(value).priorWorkProduct).toEqual({privateCanary:"historical"});expect(JSON.stringify(value.recipe)).not.toContain("historical");
    expect(value.recipe.state).toBe("unresolved");expect(value.recipe.gaps).toContain("current_component_authority_required");
  });
  it("pins schema, methods, policy rates and each actual request independently",()=>{
    const input=fixture(),preparation=prepareCapitalS11Recipe(input);
    const primary=capitalS11DispatchPins(preparation,{provider:"anthropic",model:"claude-sonnet-5",effort:"medium"});
    const fallback=capitalS11DispatchPins(preparation,{provider:"openai",model:"gpt-5.6-terra",effort:"medium"});
    expect(primary.pins.pricing).toEqual({input:2,output:10,cacheWrite:2.5,cachedInput:0.2,longContext:null});
    expect(fallback.pins.pricing.longContext).toEqual({aboveInputTokens:272000,inputMultiplier:2,outputMultiplier:1.5});
    expect(primary.policyFingerprint).not.toBe(fallback.policyFingerprint);expect(primary.pins.schemaFingerprint).toBe(fallback.pins.schemaFingerprint);
    (input.components[0]!.body as {name:string}).name="different";rehash(input.components[0]!);
    const changed=capitalS11DispatchPins(prepareCapitalS11Recipe(input),{provider:"anthropic",model:"claude-sonnet-5",effort:"medium"});
    expect(primary.policyFingerprint).toBe(changed.policyFingerprint);expect(primary.pins.requestFingerprint).not.toBe(changed.pins.requestFingerprint);
  });
});
