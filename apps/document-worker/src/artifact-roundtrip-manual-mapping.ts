import {isDeepStrictEqual} from "node:util";
import {z} from "zod";
import {artifactBlockDraftSchema} from "@offroad/domain-contracts";
import {roundtripManifestSchema, roundtripSha256, type RoundtripComparison, type RoundtripDifference, type RoundtripEntry, type RoundtripManifest, type RoundtripSnapshot} from "@offroad/case-export/artifact-roundtrip";

export const artifactManualMappingsSchema = z.array(z.strictObject({receivedKey:z.string().min(1).max(300),blockKey:z.string().regex(/^\S{1,160}$/)})).max(1000);
export type ArtifactManualMapping = z.infer<typeof artifactManualMappingsSchema>[number];
/** Exact JSON equality as well as receipt SHA verification is required. Never project or
 * rewrite the captured manifest to make a received file fit. SQL remains fingerprint authority. */
export function assertCapturedRoundtripManifest(snapshot:RoundtripSnapshot,captured:unknown):RoundtripManifest {
 const parsed=roundtripManifestSchema.safeParse(captured);
 if(!parsed.success||!snapshot.manifest||!isDeepStrictEqual(snapshot.manifest,captured)||!isDeepStrictEqual(parsed.data,captured))throw new Error("artifact_roundtrip_receipt_manifest_changed");
 return snapshot.manifest;
}
export function unmatchedRoundtripDifferences(snapshot:RoundtripSnapshot):RoundtripDifference[] {
 return [...snapshot.entries.map((entry,index)=>({key:`unmatched:${entry.key}:${index}`,classification:"unmatched" as const,base:null,received:entry,current:null,alreadyPresent:false})),
 ...snapshot.unmatched.map((content,index)=>({key:`loose:${roundtripSha256(`${content.locator}:${index}`)}`,classification:"unmatched" as const,base:null,
 received:{key:`unmatched:${content.locator}`,blockKey:null,role:"text" as const,value:content.value,formula:null,locator:content.locator,claimIds:[]},current:null,alreadyPresent:false}))];
}
function canonicalText(blocks:readonly unknown[],blockKey:string):RoundtripEntry|null {
 const candidates=blocks.map(value=>artifactBlockDraftSchema.safeParse(value)).filter(result=>result.success&&result.data.blockKey===blockKey);
 if(candidates.length!==1||!candidates[0]?.success)return null;
 const block=candidates[0].data;
 if(!["paragraph","section"].includes(block.kind)||typeof block.content.text!=="string")return null;
 return {key:`block:${blockKey}`,blockKey,role:"text",value:block.content.text,formula:null,locator:`canonical:${blockKey}`,claimIds:block.claims.map(claim=>claim.claimId)};
}
/** Mappings are supplied only by the leased SQL claim after a human matching command.
 * This helper grants no authority and never treats file claims as verified support. */
export function applyArtifactManualMappings(input:{comparison:RoundtripComparison;base:RoundtripSnapshot;current:RoundtripSnapshot;mappings:readonly ArtifactManualMapping[];baseBlocks?:readonly unknown[];currentBlocks?:readonly unknown[]}):RoundtripComparison {
 const mappings=artifactManualMappingsSchema.parse(input.mappings);
 if(!mappings.length)return input.comparison;
 if(new Set(mappings.map(value=>value.receivedKey)).size!==mappings.length||new Set(mappings.map(value=>value.blockKey)).size!==mappings.length)throw new Error("artifact_roundtrip_manual_mapping_duplicate");
 const differences=[...input.comparison.differences];
 for(const mapping of mappings) {
  const source=differences.find(diff=>diff.key===mapping.receivedKey);
  if(!source||source.classification!=="unmatched"||source.received?.role!=="text"||source.received.formula!==null||source.received.value===null)throw new Error("artifact_roundtrip_manual_mapping_invalid");
  const manifestBlock=input.comparison.baseManifest.blocks.find(block=>block.blockKey===mapping.blockKey);
  if(manifestBlock&&(manifestBlock.recorded||!["paragraph","section"].includes(manifestBlock.kind)))throw new Error("artifact_roundtrip_manual_mapping_recorded");
  const base=input.base.entries.find(entry=>entry.blockKey===mapping.blockKey&&entry.role==="text")??canonicalText(input.baseBlocks??[],mapping.blockKey);
  const current=input.current.entries.find(entry=>entry.blockKey===mapping.blockKey&&entry.role==="text")??canonicalText(input.currentBlocks??[],mapping.blockKey);
  if(!base||base.formula!==null||(current!==null&&current.formula!==null))throw new Error("artifact_roundtrip_manual_mapping_target_unverified");
  const old=differences.find(diff=>diff.key===base.key);
  if(old&&!['unchanged','missing'].includes(old.classification))throw new Error("artifact_roundtrip_manual_mapping_ambiguous");
  const received:RoundtripEntry={...source.received,key:base.key,blockKey:mapping.blockKey,claimIds:[],formula:null};
  const unchanged=received.value===base.value;
  const alreadyPresent=!unchanged&&current!==null&&received.value===current.value;
  const classification=unchanged?"unchanged":current!==null&&(base.value===current.value||alreadyPresent)?"edited":"conflict";
  for(let index=differences.length-1;index>=0;index--)if(differences[index]!.key===source.key||differences[index]!.key===base.key)differences.splice(index,1);
  differences.push({key:base.key,classification,base,received,current,alreadyPresent});
 }
 if(new Set(differences.map(value=>value.key)).size!==differences.length)throw new Error("artifact_roundtrip_manual_mapping_duplicate");
 return {...input.comparison,status:"candidate",differences};
}
