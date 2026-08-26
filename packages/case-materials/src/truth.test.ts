import {describe,expect,it} from "vitest";
import {materialTemplateReference} from "@offroad/credit-playbook";
import type {Material} from "./compile";
import {buildMaterialTruthSet,materialPackageFingerprint,type MaterialExternalReleaseEvidence} from "./truth";

const disclaimer={type:"disclaimer" as const,text:{pt:"Material indicativo. Não é parecer de crédito.",en:"Indicative material. Not a credit opinion."}};
const sectionIds:Record<string,string[]>={"institutional-teaser":["transaction_snapshot","company_profile","financial_snapshot","structure_snapshot","fit_and_open_points"],"institutional-credit-memo":["key_terms","supportability","executive_summary","transaction","company","historical_performance","capital_structure","business_plan","risks","credit_considerations","open_points","basis"],"indicative-term-sheet":["parties","facility","use_of_proceeds","economics","security","covenants","conditions","events","process_terms"],"institutional-data-room-index":["corporate","financial","debt","project","offroad_materials","open_items"]};
const material=(kind:Material["kind"],templateId?:string):Material=>({kind,title:{pt:kind,en:kind},blocks:[{type:"paragraph",text:{pt:"Fato suportado.",en:"Supported fact."},claimId:`${kind}.fact`,material:true,claimKind:"fact",supportIds:["fact.1"]},disclaimer],dependsOn:["fact.1"],...(templateId?{template:materialTemplateReference(templateId),sections:sectionIds[templateId]}:{}),conductAudit:{status:"pass",version:"test",findings:[],fingerprint:"a".repeat(64)}});
const room={folders:[{id:"01"}],entries:[{id:"teaser",tier:"pre_nda" as const,heldBy:[]},{id:"memo",tier:"nda" as const,heldBy:[]}],counts:{ready:2,held:0,requested:0},releasable:true};
const materials=[material("teaser","institutional-teaser"),material("credit_memo","institutional-credit-memo"),material("term_sheet","indicative-term-sheet"),material("diligence_qa"),material("data_room_index","institutional-data-room-index")];
const stamps=(source:readonly Material[],authorized:boolean):MaterialExternalReleaseEvidence=>{const fingerprint=materialPackageFingerprint({materials:source,dataRoom:room});return {technicalReview:{approved:true,fingerprint,reviewedBy:"desk",reviewedAt:"2026-08-26T00:00:00Z"},companyAuthorization:{authorized,fingerprint:authorized?fingerprint:null,scope:authorized?["qualified_introduction"]:[],recipientIds:authorized?["fund-1"]:[]}}};

describe("M7 material truth",()=>{
  it("emits exactly MA-01 through MA-32 and keeps internal material internal without authorization",()=>{
    const truth=buildMaterialTruthSet({materials,dataRoom:room,modelAvailable:true});
    expect(truth.procedureCoverage).toHaveLength(32);
    expect(truth.procedureCoverage.map((entry)=>entry.procedureId)).toEqual(Array.from({length:32},(_,index)=>`MA-${String(index+1).padStart(2,"0")}`));
    expect(truth.releaseDecision).toBe("internal_only");
    expect(truth.procedureCoverage.find((entry)=>entry.procedureId==="MA-32")?.status).toBe("blocked");
  });

  it("authorizes only named recipients against one exact fingerprint",()=>{
    const truth=buildMaterialTruthSet({materials,dataRoom:room,modelAvailable:true,claimAuditApproved:true,release:stamps(materials,true)});
    expect(truth.releaseDecision).toBe("authorized_for_named_recipients");
    expect(truth.procedureCoverage.find((entry)=>entry.procedureId==="MA-32")?.status).toBe("completed");
  });

  it("blocks a material claim without support",()=>{
    const broken={...materials[0]!,blocks:[{type:"paragraph" as const,text:{pt:"R$ 10 milhões",en:"BRL 10 million"},material:true,claimKind:"fact" as const},disclaimer]};
    const truth=buildMaterialTruthSet({materials:[broken,...materials.slice(1)],dataRoom:room,modelAvailable:true,claimAuditApproved:true,release:stamps(materials,true)});
    expect(truth.status).toBe("blocked");
    expect(truth.exceptions.map((entry)=>entry.id)).toContain("unsupported-claims:teaser");
    expect(truth.releaseDecision).toBe("internal_only");
    expect(truth.procedureCoverage.find((entry)=>entry.procedureId==="MA-32")?.status).toBe("blocked");
  });
});
