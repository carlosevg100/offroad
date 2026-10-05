import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {artifactBlockDraftSchema, artifactManifestSchema, documentWorkProductSchema, roundtripManifestVersion, type RoundtripManifest} from "@offroad/domain-contracts";
import {embedRoundtripManifest, roundtripSha256} from "@offroad/case-export/artifact-roundtrip";
import {houseDocumentTemplate, materialToDocx, materialToPdf, materialToPptxRoundtrip, materialDocxRoundtripRegions, type MaterialRoundtripBinding} from "@offroad/case-export";
import {institutionalFinancialModelMaterial, type Material, type MaterialBlock} from "@offroad/case-materials";
import {buildInstitutionalFinancialModel, parseVerifiedInstitutionalWorkbookArtifact, renderApprovedInstitutionalFinancialWorkbook, renderInstitutionalRoundtripWorkbook, type FinancialModel, type InstitutionalWorkbookArtifact, type InstitutionalModelInput} from "@offroad/financial-model";
import type {ArtifactRoundtripClaim, RoundtripRenderer} from "./artifact-roundtrip-processing";

const bilingual = z.object({pt: z.string().max(100000), en: z.string().max(100000)});
const metadata = {supportIds: z.array(z.string()).optional(), claimId: z.string().optional(), material: z.boolean().optional(), claimKind: z.string().optional(), qualifierBasis: z.array(z.string()).optional(), approvedFingerprint: z.string().optional()};
const blockSchema = z.discriminatedUnion("type", [
  z.object({type:z.literal("heading"),text:bilingual}), z.object({type:z.literal("paragraph"),text:bilingual,...metadata}),
  z.object({type:z.literal("disclaimer"),text:bilingual}),z.object({type:z.literal("list"),items:z.array(bilingual).max(1000)}),
  z.object({type:z.literal("table"),caption:bilingual,head:z.array(bilingual).max(100),rows:z.array(z.array(z.union([z.string().max(100000),bilingual])).max(100)).max(10000)}),
  z.object({type:z.literal("metrics"),items:z.array(z.object({label:bilingual,value:z.string(),formatted:bilingual,supportIds:z.array(z.string())})).max(1000)}),
  z.object({type:z.literal("kv"),caption:bilingual.optional(),rows:z.array(z.object({label:bilingual,value:bilingual,note:bilingual.optional(),...metadata})).max(1000)}),
  z.object({type:z.literal("callout"),title:bilingual,items:z.array(z.object({label:bilingual,value:bilingual,...metadata})).max(1000)}),
]);
const materialSchema = z.object({kind:z.enum(["teaser","credit_profile","package","credit_memo","term_sheet","financial_model","diligence_qa","data_room_index"]),title:bilingual,blocks:z.array(blockSchema).max(1000),dependsOn:z.array(z.string()).max(2000),artifactFingerprint:z.string().regex(/^[a-f0-9]{64}$/).optional()}).passthrough();
const storageSchema = z.object({bucket:z.enum(["case-artifacts","opportunity-documents"]),path:z.string().min(1).max(1024)});
const producers = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("institutional"),artifact:z.unknown(),resultId:z.uuid(),configurationId:z.uuid()}),
  z.object({kind:z.literal("stored"),storage:storageSchema,sha256:z.string().regex(/^[a-f0-9]{64}$/),byteLength:z.number().int().positive().max(104857600),sourceFormat:z.enum(["xlsx","docx","pptx","pdf"])}),
  z.object({kind:z.literal("material_package"),materials:z.array(z.unknown()),financialModel:z.unknown().optional(),sourceRowId:z.uuid()}),
  z.object({kind:z.literal("work_product"),content:z.unknown(),artifactType:z.string(),sourceRowId:z.uuid()}),
  z.object({kind:z.literal("blocks"),blocks:z.array(artifactBlockDraftSchema).max(1000).optional()}),
]);
type Draft = z.infer<typeof artifactBlockDraftSchema>;
const recorded = (block: MaterialBlock, financial = false): boolean => financial || ["table","metrics","kv","callout"].includes(block.type)
  || /\d/.test(JSON.stringify(block.type === "paragraph" || block.type === "heading" || block.type === "disclaimer" ? block.text : block));
const kindOf = (block: MaterialBlock): RoundtripManifest["blocks"][number]["kind"] => block.type === "table" || block.type === "kv" || block.type === "metrics" ? "table" : block.type === "heading" ? "section" : "paragraph";
function prospectiveBindings(material: Material, variant: string): MaterialRoundtripBinding[] {
  return material.blocks.map((_block, blockIndex) => ({blockIndex, blockKey:`export.${variant}.b${blockIndex}`, claimIds:[]}));
}
function textMaterial(blocks: readonly Draft[], fingerprint: string): {material:Material;bindings:MaterialRoundtripBinding[]} {
  const result:MaterialBlock[]=[];const bindings:MaterialRoundtripBinding[]=[];
  for(const block of blocks) {
    const text=block.content.text;
    if(typeof text!=="string")throw new Error("artifact_roundtrip_producer_block_unsupported");
    bindings.push({blockIndex:result.length,blockKey:block.blockKey,claimIds:block.claims.map(claim=>claim.claimId)});
    result.push({type:block.kind==="section"?"heading":"paragraph",text:{pt:text,en:text},...(block.kind!=="section"?{supportIds:block.claims.flatMap(claim=>claim.supportIds)}:{})} as MaterialBlock);
  }
  if(!result.length)throw new Error("artifact_roundtrip_producer_empty");
  return {material:{kind:"credit_memo",title:{pt:"Documento do trabalho",en:"Work document"},blocks:result,dependsOn:[fingerprint]},bindings};
}
/** Bindings are captured prospectively from an authorized producer, never inferred from received text. */
export function createArtifactRoundtripRenderer(client:SupabaseClient):RoundtripRenderer {
  return async(claim,identity)=>{
    if(!identity || !claim.variant || !/^[a-zA-Z0-9_.-]{1,80}$/.test(claim.variant))throw new Error("artifact_roundtrip_producer_identity_missing");
    const isHead=claim.operation!=="export"&&claim.importCandidate?.headRevision?.id===identity.id;
    const normalized=unpackProducer(isHead?claim.importCandidate?.headProducer:claim.producer);
    const producer=normalized.producer;
    const blocks=z.array(artifactBlockDraftSchema).max(1000).parse(producer.kind==="blocks"&&producer.blocks?producer.blocks:isHead?claim.importCandidate?.headBlocks??[]:claim.blocks);
    const manifest=artifactManifestSchema.parse(identity.manifest);
    const template=manifest.template;
    if(template!==null&&template.templateVersionId!==`${houseDocumentTemplate.id}@${houseDocumentTemplate.version}`&&template.templateVersionId!=="offroad-house@2026.09.07-v1")
      throw new Error("artifact_roundtrip_producer_template_unavailable");
    const exportedAt=new Date(identity.issuedAt).toISOString();
    const roundtrip:RoundtripManifest={schemaVersion:roundtripManifestVersion,artifactId:identity.artifactId,revisionId:identity.id,revisionNo:identity.revisionNo,
      logicalManifestFingerprint:identity.logicalManifestFingerprint,format:claim.format,variant:claim.variant,exportedAt,blocks:[],inputs:[],outputs:[],formulas:[]};
    const scope={p_task_id:claim.taskId,p_capability_token:claim.capabilityToken};
    const current=async()=>{
      if(Date.parse(claim.leaseExpiresAt)<=Date.now())throw new Error("artifact_roundtrip_source_revoked");
      const r=await client.rpc("worker_revalidate_artifact_roundtrip_v1",scope);
      if(r.error||!z.object({valid:z.literal(true)}).safeParse(r.data).success)throw new Error("artifact_roundtrip_source_revoked");
    };
    const lang=claim.locale==="en-US"?"en":"pt";
    let bytes:Uint8Array;
    if(producer.kind==="stored") {
      if(normalized.overlays.length)throw new Error("artifact_roundtrip_producer_stored_overlay_unsupported");
      if(claim.format!==producer.sourceFormat)throw new Error("artifact_roundtrip_producer_format_unsupported");
      await current();
      const downloaded=await client.storage.from(producer.storage.bucket).download(producer.storage.path);
      if(downloaded.error||!downloaded.data)throw new Error("artifact_roundtrip_missing_base");
      if(downloaded.data.size!==producer.byteLength)throw new Error("artifact_roundtrip_bytes_changed");
      bytes=new Uint8Array(await downloaded.data.arrayBuffer());
      if(bytes.byteLength!==producer.byteLength||roundtripSha256(bytes)!==producer.sha256)throw new Error("artifact_roundtrip_bytes_changed");
      await current();
    } else if(producer.kind==="institutional") {
      const artifact=parseVerifiedInstitutionalWorkbookArtifact(producer.artifact);
      if(!artifact||!await renderApprovedInstitutionalFinancialWorkbook(artifact,lang))throw new Error("artifact_roundtrip_producer_calculation_divergence");
      const model=await renderInstitutionalRoundtripWorkbook(artifact,lang);
      if(!model)throw new Error("artifact_roundtrip_producer_calculation_divergence");
      if(claim.format==="xlsx") {
        if(normalized.overlays.some(overlay=>typeof overlay.content.text==="string"))throw new Error("artifact_roundtrip_producer_workbook_overlay_unsupported");
        bytes=model.bytes;
        roundtripWorkbookBindings(roundtrip,model.model,artifact,blocks,lang);
      } else {
        const material=institutionalMaterial(artifact,lang);
        const composed=applyOverlays(material,prospectiveBindings(material,claim.variant),normalized.overlays,claim.variant);
        bytes=await renderMaterial(composed.material,composed.bindings,roundtrip,lang,true);
      }
    } else {
      let material:Material;let bindings:MaterialRoundtripBinding[];
      if(producer.kind==="material_package") {
        const matches=producer.materials.filter(item=>!!item&&typeof item==="object"&&(item as Record<string,unknown>).kind===claim.variant);
        if(matches.length!==1)throw new Error("artifact_roundtrip_producer_variant_unsupported");
        material=materialSchema.parse(matches[0]) as Material;
        bindings=prospectiveBindings(material,claim.variant);
      } else if(producer.kind==="work_product") {
        const parsed=materialSchema.safeParse(producer.content);
        material=parsed.success?parsed.data as Material:workProductMaterial(producer.content,lang);
        bindings=prospectiveBindings(material,claim.variant);
      } else {
        const projected=textMaterial(blocks,identity.logicalManifestFingerprint);material=projected.material;bindings=projected.bindings;
      }
      const composed=applyOverlays(material,bindings,normalized.overlays,claim.variant);
      if(claim.format==="xlsx")throw new Error("artifact_roundtrip_producer_format_unsupported");
      bytes=await renderMaterial(composed.material,composed.bindings,roundtrip,lang,material.kind==="financial_model");
    }
    await current();
    const embedded=await embedRoundtripManifest(bytes,roundtrip);await current();
    return {bytes:embedded,templateFingerprint:template?.fingerprint??null,manifest:roundtrip};
  };
}
async function renderMaterial(material:Material,bindings:MaterialRoundtripBinding[],roundtrip:RoundtripManifest,lang:"pt"|"en",financial:boolean):Promise<Uint8Array> {
  const meta={issuedOn:roundtrip.exportedAt.slice(0,10),roundtrip:{blocks:bindings}};
  if(roundtrip.format==="docx") {
    roundtrip.blocks=materialDocxRoundtripRegions({blocks:bindings}).map((region,index)=>({...region,claimIds:[...region.claimIds],kind:kindOf(material.blocks[index]!),recorded:recorded(material.blocks[index]!,financial)}));
    return materialToDocx({material,lang,meta});
  }
  if(roundtrip.format==="pptx") {
    const result=await materialToPptxRoundtrip({material,lang,meta});
    roundtrip.blocks=result.blocks.map((region,index)=>({...region,claimIds:[...region.claimIds],kind:kindOf(material.blocks[index]!),recorded:recorded(material.blocks[index]!,financial)}));
    return result.bytes;
  }
  if(roundtrip.format==="pdf")return materialToPdf({material,lang,meta});
  throw new Error("artifact_roundtrip_producer_format_unsupported");
}
function institutionalMaterial(artifact:InstitutionalWorkbookArtifact,lang:"pt"|"en"):Material {
  const value=institutionalFinancialModelMaterial({lang,artifactFingerprint:artifact.fingerprint,supportIds:artifact.supportIds,
    scenarios:artifact.institutional.scenarios.map(scenario=>({name:scenario.input.assumptionBook.scenarioName,currency:scenario.input.currency,periods:buildInstitutionalFinancialModel(scenario.input as InstitutionalModelInput).periods}))});
  return {...value,blocks:[...value.blocks.slice(0,-1),...artifact.institutional.scenarios.map(scenario=>({type:"table" as const,
    caption:{pt:"Premissas aprovadas",en:"Approved assumptions"},head:[{pt:"Premissa",en:"Assumption"},{pt:"Período",en:"Period"},{pt:"Valor exato",en:"Exact value"}],
    rows:scenario.input.assumptionBook.assumptions.flatMap(assumption=>Object.entries(assumption.values).map(([period,approved])=>[assumption.label[lang],period,approved]))})),...value.blocks.slice(-1)]};
}
function roundtripWorkbookBindings(manifest:RoundtripManifest,model:FinancialModel,artifact:InstitutionalWorkbookArtifact,canonical:readonly Draft[],lang:"pt"|"en"):void {
  for(const sheet of model.sheets) {
    const names=sheet.rows.flatMap((row,rowIndex)=>row.cells.map((cell,columnIndex)=>({cell,rowIndex,columnIndex}))).filter(({cell})=>cell.roundtrip);
    if(!names.length)continue;
    const configurationId=names.find(({cell})=>cell.roundtrip?.configurationId)?.cell.roundtrip?.configurationId;
    const scenario=artifact.institutional.scenarios.find(value=>value.configurationId===configurationId);
    const key=scenario?`scenario:${scenario.configurationId}`:`export.${manifest.variant}.sheet.${createHash("sha256").update(sheet.key).digest("hex").slice(0,32)}`;
    const block=scenario?canonical.find(item=>item.blockKey===key&&isDeepStrictEqual(item.content.scenario,scenario)):null;
    const exportKey=block?.blockKey??key;
    const regionName=`block.id${roundtripSha256(sheet.key)}`;
    // Exact correspondence is prospectively captured in the export receipt, without claiming an old content block existed.
    manifest.blocks.push({blockKey:exportKey,kind:"cell_region",recorded:true,claimIds:block?.claims.map(claim=>claim.claimId)??[],region:{kind:"cell",sheet:sheet.name[lang],ref:`A1:${columnLetter(Math.max(0,sheet.widths.length-1))}${Math.max(1,sheet.rows.length)}`,definedName:regionName}});
    for(const {cell,rowIndex,columnIndex} of names) {
      const binding=cell.roundtrip!;const ref=`${columnLetter(columnIndex)}${rowIndex+1}`;
      if(binding.role==="input"&&binding.assumptionId&&binding.period&&binding.configurationId) {
        const exact=artifact.institutional.scenarios.find(value=>value.configurationId===binding.configurationId)?.input.assumptionBook.assumptions.find(value=>value.id===binding.assumptionId)?.values[binding.period];
        if(exact===undefined)throw new Error("artifact_roundtrip_producer_assumption_unbound");
        manifest.inputs.push({name:binding.name,blockKey:exportKey,assumptionId:binding.assumptionId,period:binding.period,configurationId:binding.configurationId,approved:exact,cellRef:ref});
      } else if(cell.formula)manifest.formulas.push({name:binding.name,cellRef:ref,formulaSha256:roundtripSha256(cell.formula)});
      else manifest.outputs.push({name:binding.name,cellRef:ref,traceId:binding.name});
    }
  }
}
function columnLetter(index:number):string {let value=index+1;let result="";while(value>0){value-=1;result=String.fromCharCode(65+value%26)+result;value=Math.floor(value/26);}return result;}

function workProductMaterial(content:unknown,lang:"pt"|"en"):Material {
  const product=documentWorkProductSchema.safeParse(content);
  if(!product.success)throw new Error("artifact_roundtrip_producer_work_product_unsupported");
  if(product.data.locale!==(lang==="pt"?"pt-BR":"en-US"))throw new Error("artifact_roundtrip_producer_locale_unsupported");
  const local=(text:string)=>({pt:text,en:text});
  const paragraphs:MaterialBlock[]=product.data.sections.flatMap(section=>[
    {type:"heading" as const,text:local(section.title)},
    ...section.observations.flatMap(observation=>[
      {type:"paragraph" as const,text:local(observation.text)},
      ...observation.citations.map(citation=>({type:"paragraph" as const,text:local(`“${citation.quote}”`)})),
    ]),
  ]);
  for(const hypothesis of product.data.hypotheses)paragraphs.push({type:"paragraph",text:local(`${hypothesis.text} ${hypothesis.question}`)});
  for(const gap of product.data.gaps)paragraphs.push({type:"paragraph",text:local(`${gap.text} ${gap.question}`)});
  paragraphs.push({type:"heading",text:{pt:"Fontes",en:"Sources"}});
  for(const source of product.data.sources)paragraphs.push({type:"table",caption:local(source.documentName),head:[{pt:"Versão",en:"Version"},{pt:"Âncora",en:"Anchor"},{pt:"Trecho original",en:"Original passage"}],rows:[[source.version,source.anchor,source.text]]});
  return {kind:"credit_memo",title:{pt:"Revisão documental",en:"Document review"},blocks:paragraphs,dependsOn:[product.data.fingerprint]};
}

function unpackProducer(value:unknown):{producer:z.infer<typeof producers>;overlays:Draft[]} {
  const chain:Draft[][]=[];const seen=new Set<string>();let current=value;
  for(let depth=0;depth<=64;depth++) {
    if(!current||typeof current!=="object"||(current as Record<string,unknown>).kind!=="composite")return {producer:producers.parse(current),overlays:chain.reverse().flat()};
    if(depth===64)throw new Error("artifact_roundtrip_producer_ancestry_limit");
    const composite=z.object({kind:z.literal("composite"),parentRevisionId:z.uuid(),parent:z.unknown(),overlays:z.array(artifactBlockDraftSchema).max(1000),importCandidateId:z.uuid()}).parse(current);
    if(seen.has(composite.parentRevisionId))throw new Error("artifact_roundtrip_producer_ancestry_cycle");
    seen.add(composite.parentRevisionId);chain.push(composite.overlays);current=composite.parent;
  }
  throw new Error("artifact_roundtrip_producer_ancestry_limit");
}
function applyOverlays(original:Material,bindings:MaterialRoundtripBinding[],overlays:readonly Draft[],variant:string):{material:Material;bindings:MaterialRoundtripBinding[]} {
  const material:Material={...original,blocks:[...original.blocks]};const mapped=bindings.map(binding=>({...binding,claimIds:[...binding.claimIds]}));
  for(const overlay of overlays) {
    // A package may contain contributions to another explicitly selected material variant.
    if(overlay.blockKey.startsWith("export.")&&!overlay.blockKey.startsWith(`export.${variant}.`))continue;
    const binding=mapped.find(value=>value.blockKey===overlay.blockKey);
    if(typeof overlay.content.text!=="string") {if(binding)throw new Error("artifact_roundtrip_producer_overlay_unsupported");continue;}
    if(overlay.claims.length)throw new Error("artifact_roundtrip_producer_human_claims_unverified");
    const text={pt:overlay.content.text,en:overlay.content.text};
    if(binding) {
      const previous=material.blocks[binding.blockIndex]!;
      if(recorded(previous,material.kind==="financial_model"))throw new Error("artifact_roundtrip_producer_recorded_overlay_denied");
      material.blocks[binding.blockIndex]=previous.type==="heading"?{type:"heading",text}:{type:"paragraph",text,supportIds:[]};
      binding.claimIds=[];
    } else {
      mapped.push({blockIndex:material.blocks.length,blockKey:overlay.blockKey,claimIds:[]});material.blocks.push({type:"paragraph",text,supportIds:[]});
    }
  }
  return {material,bindings:mapped};
}
