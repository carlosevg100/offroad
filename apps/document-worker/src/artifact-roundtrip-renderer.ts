import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {artifactBlockDraftSchema, artifactManifestSchema, documentWorkProductSchema, roundtripManifestVersion, type RoundtripManifest} from "@offroad/domain-contracts";
import {embedRoundtripManifest, roundtripSha256} from "@offroad/case-export/artifact-roundtrip";
import {houseDocumentTemplate, materialToDocx, materialToPdf, materialToPptxRoundtrip, materialDocxRoundtripRegions, renderDecisionWorkbook, type MaterialRoundtripBinding} from "@offroad/case-export";
import {institutionalFinancialModelMaterial, type Material, type MaterialBlock} from "@offroad/case-materials";
import {buildInstitutionalFinancialModel, buildFinancialModel, parseVerifiedInstitutionalWorkbookArtifact, renderApprovedInstitutionalFinancialWorkbook, renderInstitutionalRoundtripWorkbook, renderApprovedFinancialWorkbook, toGovernedXlsxBuffer, type ApprovedWorkbookBinding, type GovernedWorkbookMetadata, type FinancialModel, type InstitutionalWorkbookArtifact, type InstitutionalModelInput} from "@offroad/financial-model";
import {decisionArtifactContractSchema, deskEvidence, type DecisionArtifactContract} from "@offroad/case-understanding";
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
const nativeBodySchema=z.object({retainedPayloadId:z.uuid(),allocationId:z.uuid(),storage:z.object({bucket:z.literal("capital-input-capture"),path:z.string().min(1).max(1024)}),sha256:z.string().regex(/^[a-f0-9]{64}$/),byteLength:z.number().int().positive().max(1048576),storageObjectId:z.uuid(),storageVersion:z.string().min(1).max(200),expiresAt:z.string().min(1)});
const producers = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("native_material"),recipeId:z.uuid(),variants:z.array(z.string().min(1).max(80)).min(1).max(8),archetypeId:z.string().nullable(),packageBody:nativeBodySchema,stateBody:nativeBodySchema,filenames:z.array(z.object({id:z.string().min(1).max(160),name:z.string().min(1).max(1024)})).max(20000).optional()}),
  z.object({kind:z.literal("institutional"),artifact:z.unknown(),resultId:z.uuid(),configurationId:z.uuid()}),
  z.object({kind:z.literal("stored"),storage:storageSchema,sha256:z.string().regex(/^[a-f0-9]{64}$/),byteLength:z.number().int().positive().max(104857600),sourceFormat:z.enum(["xlsx","docx","pptx","pdf"])}),
  z.object({kind:z.literal("material_package"),materials:z.array(z.unknown()),financialModel:z.unknown().optional(),financialReplay:z.unknown().optional(),sourceRowId:z.uuid()}),
  z.object({kind:z.literal("work_product"),content:z.unknown(),artifactType:z.string(),financialReplay:z.unknown().optional(),sourceRowId:z.uuid()}),
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
    let producer=normalized.producer;
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
      if(!Number.isFinite(Date.parse(claim.leaseExpiresAt))||Date.parse(claim.leaseExpiresAt)<=Date.now())throw new Error("artifact_roundtrip_source_revoked");
      const r=await client.rpc("worker_revalidate_artifact_roundtrip_v1",scope);
      if(r.error||!z.object({valid:z.literal(true)}).safeParse(r.data).success)throw new Error("artifact_roundtrip_source_revoked");
    };
    const lang=claim.locale==="en-US"?"en":"pt";
    if(producer.kind==="native_material") {
      if(!producer.variants.includes(claim.variant))throw new Error("artifact_roundtrip_producer_variant_unsupported");
      const readBody=async(body:z.infer<typeof nativeBodySchema>):Promise<unknown>=>{
        if(!Number.isFinite(Date.parse(body.expiresAt))||Date.parse(body.expiresAt)<=Date.now())throw new Error("artifact_roundtrip_source_revoked");
        await current();const result=await client.storage.from(body.storage.bucket).download(body.storage.path);
        if(result.error||!result.data||result.data.size!==body.byteLength)throw new Error("artifact_roundtrip_missing_base");
        const value=new Uint8Array(await result.data.arrayBuffer());
        if(value.byteLength!==body.byteLength||roundtripSha256(value)!==body.sha256)throw new Error("artifact_roundtrip_bytes_changed");
        await current();
        try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(value)) as unknown;}catch{throw new Error("artifact_roundtrip_producer_native_body_invalid");}
      };
      const packageValue=await readBody(producer.packageBody),stateValue=await readBody(producer.stateBody);
      const packageBody=z.object({schemaVersion:z.literal("2026.08.29-v1"),materials:z.array(materialSchema).max(1000),financialModel:z.unknown().nullable(),materialTruth:z.unknown()}).parse(packageValue);
      const stateBody=z.object({materials:z.array(materialSchema).max(1000),financialModel:z.unknown().nullable(),materialTruth:z.unknown(),reconciliation:z.object({facts:z.array(z.unknown()).max(20000),calculations:z.array(z.unknown()).max(20000)}).optional(),desk:z.unknown().optional(),trajectory:z.unknown().optional()}).parse(stateValue);
      const rawPackage=packageValue as Record<string,unknown>,rawState=stateValue as Record<string,unknown>;
      if(["materials","financialModel","materialTruth"].some(key=>!isDeepStrictEqual(rawPackage[key],rawState[key])))throw new Error("artifact_roundtrip_producer_native_body_mismatch");
      const evidence=stateBody.reconciliation?deskEvidence((stateBody.desk??null) as Parameters<typeof deskEvidence>[0],(stateBody.trajectory??null) as Parameters<typeof deskEvidence>[1]):null;
      const financialReplay=producer.archetypeId&&stateBody.reconciliation?{archetypeId:producer.archetypeId,facts:stateBody.reconciliation.facts,calculations:[...stateBody.reconciliation.calculations,...(evidence?.calculations??[])],filenames:producer.filenames??[]}:undefined;
      producer={kind:"material_package",sourceRowId:producer.recipeId,materials:packageBody.materials,financialModel:packageBody.financialModel,...(financialReplay?{financialReplay}:{})};
    }
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
    } else if (claim.format === "xlsx" && (producer.kind === "material_package" || producer.kind === "work_product")) {
      if (normalized.overlays.length) throw new Error("artifact_roundtrip_producer_workbook_overlay_unsupported");
      if (producer.kind === "material_package") {
        const selection = producer.materials.filter(item => item && typeof item === "object" && (item as Record<string, unknown>).kind === claim.variant);
        if (claim.variant !== "financial_model" || selection.length !== 1) throw new Error("artifact_roundtrip_producer_variant_unsupported");
        const selected = materialSchema.parse(selection[0]);
        const institutional = parseVerifiedInstitutionalWorkbookArtifact(producer.financialModel);
        if (institutional) {
          if (selected.artifactFingerprint !== institutional.fingerprint || !await renderApprovedInstitutionalFinancialWorkbook(institutional, lang)) throw new Error("artifact_roundtrip_producer_calculation_divergence");
          const rendered = await renderInstitutionalRoundtripWorkbook(institutional, lang);
          if (!rendered) throw new Error("artifact_roundtrip_producer_calculation_divergence");
          bytes = rendered.bytes; roundtripWorkbookBindings(roundtrip, rendered.model, institutional, blocks, lang);
        } else {
          const rendered = await renderExactFinancialEvidence(producer.financialModel, selected.artifactFingerprint, roundtrip, lang, producer.financialReplay);
          bytes = rendered;
        }
      } else {
        const body = producer.content && typeof producer.content === "object" && !Array.isArray(producer.content) ? producer.content as Record<string, unknown> : {};
        const decision = decisionArtifactContractSchema.safeParse(body.decisionContract ?? body.decisionWorkbook ?? producer.content);
        if (decision.success) bytes = await renderDecisionEvidence(decision.data, roundtrip, lang);
        else bytes = await renderExactFinancialEvidence(body.financialModel ?? producer.content, undefined, roundtrip, lang, producer.financialReplay);
      }
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

async function renderDecisionEvidence(contract:DecisionArtifactContract,manifest:RoundtripManifest,lang:"pt"|"en"):Promise<Uint8Array> {
  // Scalar assumptions have no declared period in this historical contract. Preserve the
  // editable workbook but record those cells on import until a producer supplies period bindings.
  const rendered=await renderDecisionWorkbook({contract,locale:lang==="pt"?"pt-BR":"en-US",title:lang==="pt"?"Workbook de decisão":"Decision workbook",roundtrip:{assumptions:[]}});
  if(!rendered.roundtrip)throw new Error("artifact_roundtrip_producer_workbook_binding_missing");
  recordedWorkbookBindings(manifest,rendered.roundtrip.model,lang);
  return rendered.bytes;
}
const financialCellSchema=z.object({role:z.enum(["input","formula","historical","label","header","total","note"]),value:z.union([z.string().max(100000),z.number().finite()]).optional(),formula:z.string().max(10000).optional(),format:z.enum(["money","percent","multiple","integer","text","years"]).optional()});
const financialModelSchema=z.object({sheets:z.array(z.object({key:z.string().min(1).max(160),name:bilingual,widths:z.array(z.number().finite()).max(128),rows:z.array(z.object({key:z.string().max(160),cells:z.array(financialCellSchema).max(128)})).max(20000)})).min(1).max(128),periods:z.array(z.string().max(80)).max(1000),deskAssumptions:z.array(z.string().max(100000)).max(1000)});
async function renderExactFinancialEvidence(value:unknown,expectedFingerprint:string|undefined,manifest:RoundtripManifest,lang:"pt"|"en",replay?:unknown):Promise<Uint8Array> {
  const body=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
  if(expectedFingerprint&&body.fingerprint!==expectedFingerprint)throw new Error("artifact_roundtrip_producer_calculation_divergence");
  let parsed=financialModelSchema.safeParse(body.model);
  if(!parsed.success && replay!==undefined) {
    const context=z.object({archetypeId:z.string().min(1).max(80),facts:z.array(z.unknown()).max(20000),calculations:z.array(z.unknown()).max(20000),filenames:z.array(z.object({id:z.string().min(1).max(160),name:z.string().min(1).max(1024)})).max(20000)}).parse(replay);
    const economic=z.object({amount:z.string().min(1).max(100),termMonths:z.number().int().positive().max(1200),graceMonths:z.number().int().nonnegative().max(1200),amortization:z.enum(["sac","price","bullet"]),annualInterestRate:z.string().max(100).nullable().optional()}).parse(body.inputs);
    type Input=Parameters<typeof buildFinancialModel>[0];
    // Current case state is only a reconstruction candidate. The approved byte digest below,
    // not its freshness or a fabricated historical snapshot, proves economic equivalence.
    const model=buildFinancialModel({archetypeId:context.archetypeId as Input["archetypeId"],facts:context.facts as Input["facts"],calculations:context.calculations as Input["calculations"],filenames:new Map(context.filenames.map(item=>[item.id,item.name])),lang,
      requestedAmount:economic.amount,requestedTermMonths:economic.termMonths,requestedGraceMonths:economic.graceMonths,amortizationFormat:economic.amortization,...(economic.annualInterestRate?{annualInterestRate:economic.annualInterestRate}:{})});
    parsed=financialModelSchema.safeParse(model);
  }
  const binding=z.object({workbooks:z.object({pt:z.object({sha256:z.string().regex(/^[a-f0-9]{64}$/),byteSize:z.number().int().positive()}),en:z.object({sha256:z.string().regex(/^[a-f0-9]{64}$/),byteSize:z.number().int().positive()})}),rendering:z.object({rendererVersion:z.string(),metadata:z.object({pt:z.unknown(),en:z.unknown()})}).optional()}).safeParse(body);
  if(!parsed.success||!binding.success)throw new Error("artifact_roundtrip_producer_workbook_replay_missing");
  const model=parsed.data as FinancialModel;
  if(!await renderApprovedFinancialWorkbook(model,lang,binding.data as ApprovedWorkbookBinding))throw new Error("artifact_roundtrip_producer_calculation_divergence");
  // The historical replay above proves this exact model; new names belong only to the new export.
  for(const sheet of model.sheets)for(const row of sheet.rows)for(const[column,cell]of row.cells.entries())if(cell.formula||typeof cell.value==="number")cell.roundtrip={name:`${cell.formula?"f":"out"}.id${roundtripSha256(`${sheet.key}.${row.key}.${column}`)}`,role:cell.formula?"formula":"recorded"};
  recordedWorkbookBindings(manifest,model,lang);
  const metadata=binding.data.rendering?.metadata[lang] as GovernedWorkbookMetadata|undefined;
  if(metadata)return(await toGovernedXlsxBuffer(model,lang,metadata)).bytes;
  // Reuse the existing exporter for a historical ungoverned binding, preserving model economics.
  const {toXlsxBuffer}=await import("@offroad/financial-model");return toXlsxBuffer(model,lang);
}
function recordedWorkbookBindings(manifest:RoundtripManifest,model:FinancialModel,lang:"pt"|"en"):void {
 for(const sheet of model.sheets){
  const blockKey=`export.${manifest.variant}.sheet.${roundtripSha256(sheet.key).slice(0,32)}`;
  manifest.blocks.push({blockKey,kind:"cell_region",recorded:true,claimIds:[],region:{kind:"cell",sheet:sheet.name[lang],ref:`A1:${columnLetter(Math.max(0,sheet.widths.length-1))}${Math.max(1,sheet.rows.length)}`,definedName:`block.id${roundtripSha256(sheet.key)}`}});
  for(const[rowIndex,row]of sheet.rows.entries())for(const[columnIndex,cell]of row.cells.entries())if(cell.roundtrip){const ref=`${columnLetter(columnIndex)}${rowIndex+1}`;
   if(cell.formula)manifest.formulas.push({name:cell.roundtrip.name,cellRef:ref,formulaSha256:roundtripSha256(cell.formula)});
   else manifest.outputs.push({name:cell.roundtrip.name,cellRef:ref,traceId:cell.roundtrip.name});
  }
 }
}
