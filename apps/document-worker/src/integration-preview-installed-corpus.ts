/** Packaging is not publication. These bytes require a current separately
 * published and verified SourceVersion before the SQL allocator accepts them. */
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve,basename} from "node:path";
import {z} from "zod";
import {case01,preview} from "@offroad/credit-playbook";
import {compilePreviewConsumedBasis} from "./integration-preview-consumed-basis";
const entry=z.strictObject({file:z.string().min(1),bytes:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/)});
const manifestSchema=z.strictObject({schemaVersion:z.literal("ai-review-corpus.v1"),caseId:z.literal("gc01-analista-ib-camil"),extractor:z.string(),entries:z.array(entry)});
export function selectInstalledPreviewCorpus(manifest:unknown){
 const source=manifestSchema.parse(manifest),composition="prepare_material" as const;
 const context:preview.PreviewRunContext={evidence:case01.case01Evidence(),premises:{},outputs:new Map(),request:{turn:1,composition,audience:null,form:"internal_briefing",pages:null,sponsorInstruction:null,undefinedAspects:[]},previousBrief:null};
 const inputs=Object.fromEntries(preview.previewStepsForComposition(composition).map(step=>[step.taskId,["A01","A02"].includes(step.taskId)?{}:preview.previewStepInput(step,context)]));
 const selected=compilePreviewConsumedBasis({composition,inputs,corpusManifest:source});
 if(selected.entries.length!==17)throw Error("capital_preview_installed_manifest_changed");
 return manifestSchema.parse({...source,entries:selected.entries});
}
/** A basename allowlist is enforced before I/O, then SHA and byte length are
 * checked without text decoding (one installed CSV has non-UTF8 bytes). */
export function createInstalledPreviewCorpus(directory:string,manifest:unknown){
 const pinned=selectInstalledPreviewCorpus(manifest),root=resolve(directory);
 return Object.freeze({manifest:pinned,async extraction(file:string){
  const expected=pinned.entries.find(value=>value.file===file);
  if(!expected||basename(file)!==file)throw Error("capital_preview_extraction_denied");
  const bytes=await readFile(resolve(root,file));
  if(bytes.length!==expected.bytes||createHash("sha256").update(bytes).digest("hex")!==expected.sha256)throw Error("capital_preview_extraction_changed");
  return bytes;
 }});
}
