/** Publisher-supplied envelope, never a licence or URL created by the worker. */
import {createHash} from "node:crypto";
import {z} from "zod";
import {capitalPublicLicensedPayloadSchema,freezeArtifactValue} from "@offroad/domain-contracts";
import {stableJson} from "@offroad/case-understanding";
import {publicCapitalCatalogSourceSnapshot,publicCapitalCatalogReference} from "@offroad/public-research/capital-catalog";
import type {CapitalPublicDeliveryRequest} from "./capital-public-capture-adapter";
const schema=z.strictObject({deliveryKey:z.string().min(1).max(160),requestId:z.uuid(),physicalSnapshotSha256:z.string().regex(/^[a-f0-9]{64}$/),payload:capitalPublicLicensedPayloadSchema,origin:z.strictObject({licensingOrganizationId:z.uuid(),sourceVersionId:z.uuid(),rightsVersionId:z.uuid(),sourceBindingId:z.uuid()}).optional()});
export function nativeProviderCataloguePublicationFromEnvironment(raw:string|undefined):(()=>Promise<CapitalPublicDeliveryRequest>)|undefined{
 if(!raw)return undefined;
 try{
  if(Buffer.byteLength(raw)>1048576)throw Error();const parsed=schema.parse(JSON.parse(raw)),snapshot=stableJson(publicCapitalCatalogSourceSnapshot);
  if(parsed.payload.snippet!==snapshot||parsed.payload.contentHash!==publicCapitalCatalogReference.sourceFingerprint||createHash("sha256").update(snapshot).digest("hex")!==parsed.physicalSnapshotSha256)throw Error();
  const {physicalSnapshotSha256:_proof,...request}=parsed;const frozen=freezeArtifactValue(request);
  return async()=>structuredClone(frozen)as CapitalPublicDeliveryRequest;
 }catch{throw Error("capital_native_provider_catalogue_configuration_invalid");}
}
