import {createHash} from "node:crypto";
import {materialTemplate, materialTemplateRegistryHash} from "@offroad/credit-playbook";
import type {Material, MaterialBlock, MaterialKind} from "./compile";

export const materialTruthVersion = "2026.08.26-v1";
type Status = "completed" | "partial" | "blocked" | "not_computable" | "not_applicable";

export type MaterialReleaseEvidence = {
  crossValidation: {approved: boolean; fingerprint: string | null};
  claimAudit: {approved: boolean; fingerprint: string | null};
  technicalReview: {approved: boolean; fingerprint: string | null; reviewedBy: string | null; reviewedAt: string | null};
  companyAuthorization: {authorized: boolean; fingerprint: string | null; scope: string[]; recipientIds: string[]};
};

export type MaterialExternalReleaseEvidence = Pick<MaterialReleaseEvidence, "technicalReview" | "companyAuthorization">;

export type MaterialProcedureResult = {
  procedureId: `MA-${string}`;
  status: Status;
  result: Record<string, unknown> | null;
  outputCount: number;
  evidenceCount: number;
  missingInputs: string[];
  exceptionIds: string[];
};

export type MaterialTruthSet = {
  version: string;
  fingerprint: string;
  templateRegistryHash: string;
  status: "complete" | "partial" | "blocked";
  releaseDecision: "internal_only" | "ready_for_authorization" | "authorized_for_named_recipients";
  artifacts: Array<{
    kind: MaterialKind;
    fingerprint: string;
    templateId: string | null;
    templateVersion: string | null;
    templateCurrent: boolean;
    conductStatus: "pass" | "blocked" | "review" | "not_run";
    supportCount: number;
    unsupportedMaterialClaims: string[];
    hasDisclaimer: boolean;
    bilingualComplete: boolean;
    templateSectionsComplete:boolean;
    missingTemplateSections:string[];
  }>;
  consistency: {status: "pass" | "blocked"; conflicts: Array<{key: string; values: string[]; artifacts: MaterialKind[]}>};
  room: {releasable: boolean; ready: number; held: number; requested: number; hygieneIssues: string[]};
  release: MaterialReleaseEvidence;
  exceptions: Array<{id: string; severity: "high" | "critical"; message: string; affectedProcedures: `MA-${string}`[]}>;
  missingInputs: string[];
  procedureCoverage: MaterialProcedureResult[];
};

type MaterialRoomPlan = {
  entries: Array<{id:string;tier:"pre_nda"|"nda"|"internal";heldBy:Array<{pt:string;en:string}>}>;
  folders: Array<{id:string}>;
  counts: {ready:number;held:number;requested:number};
  releasable:boolean;
};

const emptyExternalRelease = (): MaterialExternalReleaseEvidence => ({
  technicalReview:{approved:false,fingerprint:null,reviewedBy:null,reviewedAt:null},
  companyAuthorization:{authorized:false,fingerprint:null,scope:[],recipientIds:[]},
});

function stable(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,child])=>`${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
const sha = (value: unknown) => createHash("sha256").update(stable(value)).digest("hex");

export function materialPackageFingerprint(input:{materials:readonly Material[];dataRoom:MaterialRoomPlan}):string{
  return sha({
    materials:input.materials,
    dataRoom:{
      entries:input.dataRoom.entries.map(({id,tier,heldBy})=>({id,tier,heldBy})),
      folders:input.dataRoom.folders.map(({id})=>({id})),
      counts:input.dataRoom.counts,
      releasable:input.dataRoom.releasable,
    },
  });
}

function claimRows(block: MaterialBlock, prefix: string): Array<{key:string;value:string;artifactValue:string;supportIds:string[];material:boolean;comparable:boolean}> {
  if (block.type === "paragraph") return block.material ? [{key:block.claimId??prefix,value:`${block.text.pt}\u0000${block.text.en}`,artifactValue:block.text.pt,supportIds:block.supportIds??[],material:true,comparable:false}] : [];
  if (block.type === "metrics") return block.items.map((item,index)=>({key:`${prefix}:metric:${index}:${item.supportIds.join("|")}`,value:item.value,artifactValue:item.value,supportIds:item.supportIds,material:true,comparable:true}));
  if (block.type === "kv") return block.rows.filter((row)=>row.material).map((row,index)=>({key:row.claimId??`${prefix}:kv:${index}:${(row.supportIds??[]).join("|")}`,value:`${row.value.pt}\u0000${row.value.en}`,artifactValue:row.value.pt,supportIds:row.supportIds??[],material:true,comparable:true}));
  if (block.type === "callout") return block.items.filter((item)=>item.material).map((item,index)=>({key:item.claimId??`${prefix}:callout:${index}:${(item.supportIds??[]).join("|")}`,value:`${item.value.pt}\u0000${item.value.en}`,artifactValue:item.value.pt,supportIds:item.supportIds??[],material:true,comparable:true}));
  return [];
}

function bilingual(block: MaterialBlock): boolean {
  const pairs: Array<{pt:string;en:string}> = [];
  if ("text" in block) pairs.push(block.text);
  if (block.type === "heading") pairs.push(block.text);
  if (block.type === "metrics") for (const item of block.items) pairs.push(item.label,item.formatted);
  if (block.type === "table") pairs.push(block.caption,...block.head);
  if (block.type === "list") pairs.push(...block.items);
  if (block.type === "kv") {if(block.caption)pairs.push(block.caption); for(const row of block.rows){pairs.push(row.label,row.value);if(row.note)pairs.push(row.note);}}
  if (block.type === "callout") {pairs.push(block.title);for(const item of block.items)pairs.push(item.label,item.value);}
  return pairs.every((pair)=>pair.pt.trim().length>0&&pair.en.trim().length>0);
}

export function buildMaterialTruthSet(input:{materials:readonly Material[];dataRoom:MaterialRoomPlan;modelAvailable:boolean;claimAuditApproved?:boolean;release?:MaterialExternalReleaseEvidence;governanceBlockers?:readonly string[]}):MaterialTruthSet {
  const externalRelease=input.release??emptyExternalRelease();
  const packageFingerprint=materialPackageFingerprint(input);
  const exceptions:MaterialTruthSet["exceptions"]=[];
  const missing=new Set<string>();
  for(const blocker of input.governanceBlockers??[])exceptions.push({id:`external-governance:${blocker}`,severity:"critical",message:"External release is blocked by governed case controls.",affectedProcedures:["MA-32"]});
  const artifacts=input.materials.map((material)=>{
    const rows=material.blocks.flatMap((block,index)=>claimRows(block,`${material.kind}:${index}`));
    const unsupported=rows.filter((row)=>row.material&&row.supportIds.length===0).map((row)=>row.key);
    const templateCurrent=Boolean(material.template&&material.template.registryHash===materialTemplateRegistryHash&&materialTemplate(material.template.id).version===material.template.version);
    const hasDisclaimer=material.blocks.some((block)=>block.type==="disclaimer");
    const bilingualComplete=material.blocks.every(bilingual);
    const expectedSections=material.template?materialTemplate(material.template.id).sections.filter((section)=>section.required).map((section)=>section.id):[];
    const actualSections=material.sections??[];
    const missingTemplateSections=expectedSections.filter((section,index)=>actualSections[index]!==section);
    const templateSectionsComplete=expectedSections.length===actualSections.length&&missingTemplateSections.length===0;
    if(!templateCurrent&&["teaser","credit_memo","term_sheet","data_room_index"].includes(material.kind)) exceptions.push({id:`stale-template:${material.kind}`,severity:"critical",message:"Material template reference is missing or stale.",affectedProcedures:["MA-28","MA-31","MA-32"]});
    if(unsupported.length) exceptions.push({id:`unsupported-claims:${material.kind}`,severity:"critical",message:"Material claims lack evidence links.",affectedProcedures:["MA-14","MA-28","MA-32"]});
    if(!hasDisclaimer&&material.kind!=="data_room_index") exceptions.push({id:`missing-disclaimer:${material.kind}`,severity:"critical",message:"Required advisory disclaimer is missing.",affectedProcedures:["MA-16","MA-19","MA-30","MA-32"]});
    if(!bilingualComplete) exceptions.push({id:`bilingual-incomplete:${material.kind}`,severity:"critical",message:"The bilingual artifact is incomplete.",affectedProcedures:["MA-29","MA-32"]});
    if(material.template&&!templateSectionsComplete)exceptions.push({id:`template-sections:${material.kind}`,severity:"critical",message:"Required template sections are missing or out of order.",affectedProcedures:[material.kind==="teaser"?"MA-01":material.kind==="credit_memo"?"MA-04":material.kind==="term_sheet"?"MA-17":"MA-24","MA-28","MA-32"]});
    const conductStatus:MaterialTruthSet["artifacts"][number]["conductStatus"]=material.conductAudit?.status??"not_run";
    return {kind:material.kind,fingerprint:sha(material),templateId:material.template?.id??null,templateVersion:material.template?.version??null,templateCurrent,conductStatus,supportCount:new Set(rows.flatMap((row)=>row.supportIds)).size,unsupportedMaterialClaims:unsupported,hasDisclaimer,bilingualComplete,templateSectionsComplete,missingTemplateSections};
  });

  const values=new Map<string,Array<{value:string;kind:MaterialKind}>>();
  for(const material of input.materials) for(const [index,block] of material.blocks.entries()) for(const row of claimRows(block,`${material.kind}:${index}`)){
    if(!row.supportIds.length||!row.comparable)continue;
    const key=row.supportIds.slice().sort().join("|");
    values.set(key,[...(values.get(key)??[]),{value:row.value,kind:material.kind}]);
  }
  const conflicts=[...values.entries()].flatMap(([key,entries])=>{
    const unique=[...new Set(entries.map((entry)=>entry.value))];
    return unique.length>1?[{key,values:unique,artifacts:[...new Set(entries.map((entry)=>entry.kind))]}]:[];
  });
  if(conflicts.length)exceptions.push({id:"cross-material-conflict",severity:"critical",message:"The same governed support produces divergent values across artifacts.",affectedProcedures:["MA-12","MA-18","MA-21","MA-28","MA-29","MA-32"]});

  const hygieneIssues=input.dataRoom.entries.flatMap((entry)=>entry.heldBy.map((hold)=>`${entry.id}:${hold.en}`));
  const byKind=new Map(artifacts.map((artifact)=>[artifact.kind,artifact]));
  const exists=(kind:MaterialKind)=>byKind.has(kind);
  const clean=(kind:MaterialKind)=>{const artifact=byKind.get(kind);return Boolean(artifact&&artifact.templateCurrent&&artifact.templateSectionsComplete&&artifact.conductStatus==="pass"&&!artifact.unsupportedMaterialClaims.length&&artifact.hasDisclaimer&&artifact.bilingualComplete);};
  if(!exists("teaser"))missing.add("material.teaser");
  if(!exists("credit_memo"))missing.add("material.credit_memo");
  if(!exists("term_sheet"))missing.add("material.term_sheet");
  if(!exists("diligence_qa"))missing.add("material.diligence_qa");
  if(!input.modelAvailable)missing.add("material.financial_model");

  const status=(ok:boolean,available:boolean=true):Status=>ok?"completed":available?"blocked":"not_computable";
  const result=(procedureId:`MA-${string}`,s:Status,value:Record<string,unknown>|null,procedureMissing:string[]=[],evidenceCount=0):MaterialProcedureResult=>({procedureId,status:s,result:value,outputCount:value?Object.keys(value).length:0,evidenceCount,missingInputs:procedureMissing,exceptionIds:exceptions.filter((exception)=>exception.affectedProcedures.includes(procedureId)).map((exception)=>exception.id)});
  const claimAuditClear=input.claimAuditApproved===true&&artifacts.every((artifact)=>artifact.conductStatus==="pass"&&!artifact.unsupportedMaterialClaims.length);
  const release:MaterialReleaseEvidence={
    crossValidation:{approved:conflicts.length===0,fingerprint:conflicts.length===0?packageFingerprint:null},
    claimAudit:{approved:claimAuditClear,fingerprint:claimAuditClear?packageFingerprint:null},
    technicalReview:externalRelease.technicalReview,
    companyAuthorization:externalRelease.companyAuthorization,
  };
  const releaseFingerprints=[release.crossValidation.fingerprint,release.claimAudit.fingerprint,release.technicalReview.fingerprint,release.companyAuthorization.fingerprint];
  const materialGateClear=!exceptions.some((exception)=>exception.severity==="critical")&&input.dataRoom.releasable;
  const exactFingerprints=releaseFingerprints.every((fingerprint)=>fingerprint===packageFingerprint);
  const releaseReady=materialGateClear&&release.crossValidation.approved&&release.claimAudit.approved&&release.technicalReview.approved&&exactFingerprints;
  const releaseAuthorized=releaseReady&&release.companyAuthorization.authorized&&release.companyAuthorization.recipientIds.length>0&&exactFingerprints;
  const coverage:MaterialProcedureResult[]=[
    result("MA-01",status(clean("teaser"),exists("teaser")),exists("teaser")?{artifact:byKind.get("teaser")}:null,exists("teaser")?[]:["teaser"],byKind.get("teaser")?.supportCount??0),
    result("MA-02",status(clean("teaser"),exists("teaser")),exists("teaser")?{anonymous:!input.materials.find((m)=>m.kind==="teaser")?.title.pt.includes(":")}:null,exists("teaser")?[]:["teaser"],0),
    result("MA-03",exists("teaser")?"partial":"not_computable",exists("teaser")?{mechanicalChecks:true,deskReview:false}:null,["recorded 90-second desk review"],0),
    ...Array.from({length:13},(_,i)=>{const id=`MA-${String(i+4).padStart(2,"0")}` as `MA-${string}`;return result(id,status(clean("credit_memo"),exists("credit_memo")),exists("credit_memo")?{artifact:byKind.get("credit_memo")}:null,exists("credit_memo")?[]:["credit memo"],byKind.get("credit_memo")?.supportCount??0)}),
    ...Array.from({length:5},(_,i)=>{const id=`MA-${String(i+17).padStart(2,"0")}` as `MA-${string}`;return result(id,status(clean("term_sheet"),exists("term_sheet")),exists("term_sheet")?{artifact:byKind.get("term_sheet")}:null,exists("term_sheet")?[]:["indicative term sheet"],byKind.get("term_sheet")?.supportCount??0)}),
    result("MA-22",exists("diligence_qa")?"partial":"not_computable",exists("diligence_qa")?{artifact:byKind.get("diligence_qa")}:null,exists("diligence_qa")?[]:["diligence Q&A"],byKind.get("diligence_qa")?.supportCount??0),
    result("MA-23",clean("diligence_qa")?"completed":exists("diligence_qa")?"partial":"not_computable",exists("diligence_qa")?{artifact:byKind.get("diligence_qa")}:null,exists("diligence_qa")?[]:["sourced diligence answers"],byKind.get("diligence_qa")?.supportCount??0),
    result("MA-24",exists("data_room_index")?"completed":"not_computable",{entries:input.dataRoom.entries.length,folders:input.dataRoom.folders.length},exists("data_room_index")?[]:["data room index"],input.dataRoom.entries.length),
    result("MA-25",input.dataRoom.entries.every((entry)=>Boolean(entry.tier))?"completed":"blocked",{tiers:[...new Set(input.dataRoom.entries.map((entry)=>entry.tier))]},[],input.dataRoom.entries.length),
    result("MA-26",hygieneIssues.length?"partial":"completed",{issues:hygieneIssues},hygieneIssues, input.dataRoom.entries.length),
    result("MA-27",input.modelAvailable?"completed":"not_computable",input.modelAvailable?{modelAvailable:true}:null,input.modelAvailable?[]:["deliverable financial model"],0),
    result("MA-28",conflicts.length?"blocked":release.crossValidation.approved?"completed":"partial",{conflicts,fingerprint:release.crossValidation.fingerprint},release.crossValidation.approved?[]:["cross-validation approval"],values.size),
    result("MA-29",artifacts.every((artifact)=>artifact.bilingualComplete)?"completed":"blocked",{artifacts:artifacts.length},[],artifacts.length),
    result("MA-30",artifacts.filter((artifact)=>artifact.kind!=="data_room_index").every((artifact)=>artifact.hasDisclaimer)?"completed":"blocked",{covered:artifacts.filter((artifact)=>artifact.hasDisclaimer).map((artifact)=>artifact.kind)},[],artifacts.length),
    result("MA-31",artifacts.every((artifact)=>artifact.templateCurrent&&artifact.fingerprint)?"completed":"blocked",{artifacts:artifacts.map(({kind,fingerprint,templateId,templateVersion})=>({kind,fingerprint,templateId,templateVersion}))},[],artifacts.length),
    result("MA-32",releaseAuthorized?"completed":releaseReady?"partial":"blocked",{releaseReady,releaseAuthorized,recipients:release.companyAuthorization.recipientIds.length},releaseAuthorized?[]:["exact-fingerprint QC stamps and company authorization for named recipients"],releaseFingerprints.filter(Boolean).length),
  ];
  if(coverage.length!==32)throw new Error(`material procedure coverage expected 32, received ${coverage.length}`);
  const critical=exceptions.some((exception)=>exception.severity==="critical");
  return {version:materialTruthVersion,fingerprint:packageFingerprint,templateRegistryHash:materialTemplateRegistryHash,status:critical?"blocked":coverage.every((entry)=>entry.status==="completed"||entry.status==="not_applicable")?"complete":"partial",releaseDecision:releaseAuthorized?"authorized_for_named_recipients":releaseReady?"ready_for_authorization":"internal_only",artifacts,consistency:{status:conflicts.length?"blocked":"pass",conflicts},room:{releasable:input.dataRoom.releasable,ready:input.dataRoom.counts.ready,held:input.dataRoom.counts.held,requested:input.dataRoom.counts.requested,hygieneIssues},release,exceptions,missingInputs:[...missing].sort(),procedureCoverage:coverage};
}
