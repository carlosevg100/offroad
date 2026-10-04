import {describe,it,expect} from "vitest";
import {createHash} from "node:crypto";
import {stableJson} from "@offroad/case-understanding";
import {publicCapitalCatalogReference,publicCapitalCatalogSourceSnapshot} from "@offroad/public-research/capital-catalog";
import {nativeProviderCataloguePublicationFromEnvironment} from "./capital-native-provider-config";
const snapshot=stableJson(publicCapitalCatalogSourceSnapshot);
const fixture=()=>({deliveryKey:"publisher-catalogue-v1",requestId:"10000000-0000-4000-8000-000000000001",physicalSnapshotSha256:createHash("sha256").update(snapshot).digest("hex"),payload:{url:"https://example.invalid/published-local-fixture",title:"Synthetic publisher catalogue",snippet:snapshot,contentHash:publicCapitalCatalogReference.sourceFingerprint as string}});
describe("native provider publisher configuration",()=>{
 it("absent publication produces no synthetic source or licence",()=>expect(nativeProviderCataloguePublicationFromEnvironment(undefined)).toBeUndefined());
 it("preserves exact physical publisher envelope for server licence lookup",async()=>{const value=fixture(),load=nativeProviderCataloguePublicationFromEnvironment(JSON.stringify(value))!;const envelope=await load();expect(envelope.payload).toEqual(value.payload);expect(envelope).not.toHaveProperty("origin");envelope.payload.title="Changed caller";expect((await load()).payload.title).toBe(value.payload.title);});
 for(const mutation of [(v:ReturnType<typeof fixture>)=>{v.physicalSnapshotSha256="a".repeat(64);},(v:ReturnType<typeof fixture>)=>{v.payload.snippet+=" ";},(v:ReturnType<typeof fixture>)=>{v.payload.contentHash="b".repeat(64);},(v:ReturnType<typeof fixture>)=>{v.payload.url="http://unsafe.invalid";}])it("rejects changed bytes/hash and sanitizes configuration errors",()=>{const v=fixture();mutation(v);expect(()=>nativeProviderCataloguePublicationFromEnvironment(JSON.stringify(v))).toThrow("capital_native_provider_catalogue_configuration_invalid");});
});
