import {describe,expect,it} from "vitest";
import {materialTemplateReference} from "@offroad/credit-playbook";
import type {Material} from "./compile";
import {buildMaterialTruthSet,materialPackageFingerprint,type MaterialExternalReleaseEvidence} from "./truth";

const disclaimer={type:"disclaimer" as const,text:{pt:"Material indicativo. Não é parecer de crédito.",en:"Indicative material. Not a credit opinion."}};
const sectionIds:Record<string,string[]>={"institutional-teaser":["transaction_snapshot","company_profile","financial_snapshot","structure_snapshot","fit_and_open_points"],"institutional-credit-memo":["key_terms","supportability","executive_summary","transaction","company","historical_performance","capital_structure","business_plan","risks","credit_considerations","open_points","basis"],"indicative-term-sheet":["parties","facility","use_of_proceeds","economics","security","covenants","conditions","events","process_terms"],"institutional-data-room-index":["corporate","financial","debt","project","offroad_materials","open_items"]};
const material=(kind:Material["kind"],templateId?:string):Material=>({kind,title:{pt:kind,en:kind},blocks:[{type:"paragraph",text:{pt:"Fato suportado.",en:"Supported fact."},claimId:`${kind}.fact`,material:true,claimKind:"fact",supportIds:["fact.1"]},disclaimer],dependsOn:["fact.1"],...(templateId?{template:materialTemplateReference(templateId),sections:sectionIds[templateId]}:{}),conductAudit:{status:"pass",version:"test",findings:[],fingerprint:"a".repeat(64)}});
const room={folders:[{id:"01"}],entries:[{id:"teaser",tier:"pre_nda" as const,heldBy:[]},{id:"memo",tier:"nda" as const,heldBy:[]}],counts:{ready:2,held:0,requested:0},releasable:true};
const modelFingerprint="f".repeat(64);
const financialModel={fingerprint:modelFingerprint,workbooks:{pt:{sha256:"1".repeat(64),byteSize:8192},en:{sha256:"2".repeat(64),byteSize:8192}}};
const modelMaterial={...material("financial_model"),artifactFingerprint:modelFingerprint};
const materials=[material("teaser","institutional-teaser"),material("credit_memo","institutional-credit-memo"),modelMaterial,material("term_sheet","indicative-term-sheet"),material("diligence_qa"),material("data_room_index","institutional-data-room-index")];
const stamps=(source:readonly Material[],authorized:boolean):MaterialExternalReleaseEvidence=>{const fingerprint=materialPackageFingerprint({materials:source,dataRoom:room});return {technicalReview:{approved:true,fingerprint,reviewedBy:"desk",reviewedAt:"2026-08-26T00:00:00Z"},companyAuthorization:{authorized,fingerprint:authorized?fingerprint:null,scope:authorized?["qualified_introduction"]:[],recipientIds:authorized?["fund-1"]:[]}}};

describe("M7 material truth",()=>{
  it("emits exactly MA-01 through MA-32 and keeps internal material internal without authorization",()=>{
    const truth=buildMaterialTruthSet({materials,dataRoom:room,financialModel});
    expect(truth.procedureCoverage).toHaveLength(32);
    expect(truth.procedureCoverage.map((entry)=>entry.procedureId)).toEqual(Array.from({length:32},(_,index)=>`MA-${String(index+1).padStart(2,"0")}`));
    expect(truth.releaseDecision).toBe("internal_only");
    expect(truth.procedureCoverage.find((entry)=>entry.procedureId==="MA-32")?.status).toBe("blocked");
  });

  it("authorizes only named recipients against one exact fingerprint",()=>{
    const truth=buildMaterialTruthSet({materials,dataRoom:room,financialModel,claimAuditApproved:true,release:stamps(materials,true)});
    expect(truth.releaseDecision).toBe("authorized_for_named_recipients");
    expect(truth.procedureCoverage.find((entry)=>entry.procedureId==="MA-32")?.status).toBe("completed");
  });

  it("blocks a material claim without support",()=>{
    const broken={...materials[0]!,blocks:[{type:"paragraph" as const,text:{pt:"R$ 10 milhões",en:"BRL 10 million"},material:true,claimKind:"fact" as const},disclaimer]};
    const truth=buildMaterialTruthSet({materials:[broken,...materials.slice(1)],dataRoom:room,financialModel,claimAuditApproved:true,release:stamps(materials,true)});
    expect(truth.status).toBe("blocked");
    expect(truth.exceptions.map((entry)=>entry.id)).toContain("unsupported-claims:teaser");
    expect(truth.releaseDecision).toBe("internal_only");
    expect(truth.procedureCoverage.find((entry)=>entry.procedureId==="MA-32")?.status).toBe("blocked");
  });

  it("does not treat facts as a deliverable financial model",()=>{
    const truth=buildMaterialTruthSet({materials:materials.filter((entry)=>entry.kind!=="financial_model"),dataRoom:room,financialModel:null});
    expect(truth.missingInputs).toContain("material.financial_model");
    expect(truth.procedureCoverage.find((entry)=>entry.procedureId==="MA-27")?.status).toBe("not_computable");
  });

  it("blocks a workbook whose fingerprint differs from its package entry",()=>{
    const truth=buildMaterialTruthSet({materials,dataRoom:room,financialModel:{...financialModel,fingerprint:"e".repeat(64)}});
    expect(truth.exceptions.map((entry)=>entry.id)).toContain("financial-model-fingerprint-mismatch");
    expect(truth.releaseDecision).toBe("internal_only");
  });
});


describe("governed material field identity",()=>{
 const row=(label:string,value:string,supportIds=["structure.v1","period.2025"])=>({label:{pt:label,en:label},value:{pt:value,en:value},material:true,supportIds});
 const withRows=(kind:Material["kind"],rows:ReturnType<typeof row>[]):Material=>({...material(kind),blocks:[{type:"kv",rows},disclaimer]});
 const consistency=(source:Material[])=>buildMaterialTruthSet({materials:source,dataRoom:room,financialModel:null}).consistency;
 it("separates amount, tenor and structure backed by the same evidence",()=>expect(consistency([withRows("financial_model",[row("Amount","10000000"),row("Tenor","48 months"),row("Selected structure","ccb")])]).status).toBe("pass"));
 it("blocks divergent values for the same field within an artifact",()=>expect(consistency([withRows("financial_model",[row("Amount","10000000"),row("Amount","12000000")])]).status).toBe("blocked"));
 it("blocks the same metric and period diverging across artifacts",()=>expect(consistency([withRows("teaser",[row("EBITDA","25000000")]),withRows("credit_memo",[row("EBITDA","21000000")])]).status).toBe("blocked"));
 it("keeps genuinely different periods separate",()=>expect(consistency([withRows("teaser",[row("EBITDA","25000000",["audited.2025"])]),withRows("credit_memo",[row("EBITDA","21000000",["audited.2024"])])]).status).toBe("pass"));
});
