import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {readArtifactRevision,artifactServing,type ArtifactRead} from "./authorized-artifact-reader";
const bindingSchema=z.discriminatedUnion("state",[z.object({state:z.literal("legacy")}),z.object({state:z.literal("native"),resultId:z.uuid(),revisionId:z.uuid()})]);
export async function readInstitutionalWorkbookBinding(client:SupabaseClient<Database>,workId:string,fingerprint:string):Promise<{ok:false}|{ok:true;native:Extract<ArtifactRead,{withheld:false}>|null}> {
 const {data,error}=await client.rpc("read_institutional_workbook_binding_v1",{p_work:workId,p_fingerprint:fingerprint});
 const parsed=bindingSchema.safeParse(data);if(error||!parsed.success)return {ok:false};
 if(parsed.data.state==="legacy")return {ok:true,native:null};
 const b=parsed.data;const r=await readArtifactRevision(client,{revisionId:b.revisionId});
 if(!r.ok||r.read.withheld||!artifactServing(r.read).serve||r.read.artifact.workId!==workId
  ||r.read.artifact.subject!==`institutional-native:${b.resultId}`||r.read.revision.manifest.institutionalResult?.id!==b.resultId)return {ok:false};
 return {ok:true,native:r.read};
}
