import {describe,it,expect,vi} from "vitest";
import type {DocumentWorkProductInput,DocumentWorkProductNarrative} from "@offroad/domain-contracts";
import type {ModelGateway} from "@offroad/model-gateway";
import {documentWorkAuthoredFields,documentWorkReviewFields,reviewAndProposeDocumentWorkRevision,reviewDocumentWorkSourceFidelity,verifyDocumentWorkSourceFidelity} from "./document-work-source-review";
const input:DocumentWorkProductInput={job:"comparison",locale:"en-US",approvedRequest:{text:"Compare proposals",fingerprint:"a".repeat(64)},passages:[{id:"alpha",documentId:"a",documentName:"Alpha",version:"1",hash:"b".repeat(64),anchor:"terms",text:"Alpha requires quarterly reporting."},{id:"beta",documentId:"b",documentName:"Beta",version:"1",hash:"c".repeat(64),anchor:"terms",text:"Beta requires monthly reporting."}],coverage:{documentsConsidered:2,omittedPassages:0,limitations:[]}};
const narrative:DocumentWorkProductNarrative={sections:["terms","differences","clarifications"].map(key=>({key:key as "terms"|"differences"|"clarifications",title:key,observations:[]})),hypotheses:[{text:"Alpha reports more frequently than Beta.",basisPassageIds:["alpha","beta"],question:"Can you confirm the reporting obligations?"}],gaps:[{text:"Covenant terms were not supplied.",question:"Can you provide them or confirm whether covenants exist?"}]};
const ids=documentWorkAuthoredFields(narrative).map(f=>f.id);
const deps=(output:unknown)=>({gateway:{complete:vi.fn().mockImplementation(async request=>{
  if(!output||typeof output!=="object")return {output};
  const wire=output as {reviewedFieldIds?:string[];issues?:Array<{fieldId?:string;sourceIds?:string[]}>;fieldAssessments?:unknown};
  const fields=JSON.parse(request.input[0].text).authoredFields as Array<{id:string;text:string}>;
  const alias=(id:string)=>id==="alpha"?"p1":id==="beta"?"p2":id;
  return {output:{...output,fieldAssessments:wire.fieldAssessments??(wire.reviewedFieldIds??[]).map(fieldId=>({fieldId,verdict:wire.issues?.some(issue=>issue.fieldId===fieldId)?"unsupported":"no_factual_assertion",exactExcerpt:fields.find(f=>f.id===fieldId)?.text.slice(0,160)??"invalid",sourceIds:[]})),issues:wire.issues?.map(issue=>({...issue,sourceIds:issue.sourceIds?.map(alias)}))}};
})} as unknown as Pick<ModelGateway,"complete">});
describe("documentary source review boundaries",()=>{
  it("sends complete sources and authored fields without duplicate narrative to one stateless restricted review",async()=>{
    const d=deps({reviewedFieldIds:ids,issues:[]});
    await verifyDocumentWorkSourceFidelity(input,narrative,d);
    expect(d.gateway.complete).toHaveBeenCalledTimes(1);
    const request=vi.mocked(d.gateway.complete).mock.calls[0]![0];
    expect(request).toMatchObject({schemaName:"document_work_source_review_v5",task:"preliminary_understanding",maxOutputTokens:4000,dataHandling:{classification:"restricted",purpose:"case_analysis"}});
    expect(JSON.parse((request.input[0] as {text:string}).text)).toMatchObject({passages:input.passages.map((p,index)=>({id:`p${index+1}`,documentId:p.documentId,documentName:p.documentName,text:p.text})),authoredFields:documentWorkAuthoredFields(narrative)});
  });
  it.each(["inverse_comparison","unsupported_premise","unknown_as_absent","other_unsupported"])("fails closed for reviewer finding %s without repair",async code=>{
    const output={reviewedFieldIds:ids,issues:[{fieldId:"hypotheses.0.text",code,sourceIds:["alpha","beta"],exactExcerpt:narrative.hypotheses[0]!.text,premiseRole:"asserted_fact",rationale:"The stated reporting comparison reverses the source frequency."}]};
    expect(await reviewDocumentWorkSourceFidelity(input,narrative,deps(output))).toMatchObject(output);
    const d=deps(output);await expect(verifyDocumentWorkSourceFidelity(input,narrative,d)).rejects.toThrow("document_work_product_source_review_failed");expect(d.gateway.complete).toHaveBeenCalledTimes(1);
  });
  it.each([
    {reviewedFieldIds:ids.slice(1),issues:[]},
    {reviewedFieldIds:[...ids,ids[0]],issues:[]},
    {reviewedFieldIds:["invented",...ids.slice(1)],issues:[]},
    {reviewedFieldIds:ids,issues:[{fieldId:"invented",code:"other_unsupported",sourceIds:[]}]},
    {reviewedFieldIds:ids,issues:[{fieldId:ids[0],code:"other_unsupported",sourceIds:["invented"]}]},
    {reviewedFieldIds:ids,issues:[{fieldId:ids[0],code:"other_unsupported",sourceIds:["alpha","alpha"]}]},
    {reviewedFieldIds:ids,issues:[],approved:true},
  ])("rejects structurally incomplete or fabricated review %j",async output=>{
    await expect(reviewDocumentWorkSourceFidelity(input,narrative,deps(output))).rejects.toThrow("document_work_product_source_review_failed");
  });
  it("retains a legitimate exploratory question when reviewer finds no unsupported premise",async()=>{
    const conditional={...narrative,hypotheses:[{text:"If no covenant exists, other protections may matter.",basisPassageIds:["alpha"],question:"Can you confirm whether a covenant exists?"}]};
    const output={reviewedFieldIds:documentWorkAuthoredFields(conditional).map(f=>f.id),issues:[]};
    expect(await verifyDocumentWorkSourceFidelity(input,conditional,deps(output))).toMatchObject(output);
  });
  it.each([
    {exactExcerpt:"Not present in this field",premiseRole:"asserted_fact",rationale:"Unsupported assertion."},
    {exactExcerpt:"Alpha",premiseRole:"invented",rationale:"Unsupported assertion."},
    {exactExcerpt:"Alpha",premiseRole:"asserted_fact",rationale:" "},
    {exactExcerpt:"Alpha",premiseRole:"asserted_fact",rationale:"x".repeat(161)},
  ])("rejects unanchored or malformed issue detail %j",async detail=>{
    const output={reviewedFieldIds:ids,issues:[{fieldId:"hypotheses.0.text",code:"unsupported_premise",sourceIds:["alpha"],...detail}]};
    await expect(reviewDocumentWorkSourceFidelity(input,narrative,deps(output))).rejects.toThrow("document_work_product_source_review_failed");
  });
  it.each([
    {text:"If operating volumes fluctuate, the borrower has a guaranteed revenue floor.",excerpt:"the borrower has a guaranteed revenue floor",role:"implication",locale:"en-US"},
    {text:"Se o projeto atrasar, o patrocinador é obrigado a cobrir todo o custo.",excerpt:"o patrocinador é obrigado a cobrir todo o custo",role:"implication",locale:"pt-BR"},
    {text:"Quais medidas compensam a inexistência de seguro?",excerpt:"a inexistência de seguro",role:"question_presupposition",locale:"pt-BR"},
  ] as const)("anchors local issue in mixed logical roles: $locale",async sample=>{
    const candidate={...narrative,hypotheses:[{...narrative.hypotheses[0]!,text:sample.text}]};
    const review={reviewedFieldIds:documentWorkAuthoredFields(candidate).map(f=>f.id),issues:[{fieldId:"hypotheses.0.text",code:"unsupported_premise",sourceIds:[],exactExcerpt:sample.excerpt,premiseRole:sample.role,rationale:"The sources do not establish this assertion."}]};
    const d=deps(review);
    expect(await reviewDocumentWorkSourceFidelity({...input,locale:sample.locale},candidate,d)).toMatchObject(review);
    await expect(verifyDocumentWorkSourceFidelity({...input,locale:sample.locale},candidate,d)).rejects.toThrow("document_work_product_source_review_failed");
  });
  it("does not produce approval if the provider fails",async()=>{
    const d=deps(null);vi.mocked(d.gateway.complete).mockRejectedValue(new Error("provider_unavailable"));
    await expect(verifyDocumentWorkSourceFidelity(input,narrative,d)).rejects.toThrow("provider_unavailable");
  });
});

it("gives both critic stages identical paired context and local source bindings",async()=>{
  const d=deps({reviewedFieldIds:ids,issues:[],revisedSelection:null});
  const selection={sections:[{key:"terms",title:"Terms",quoteIds:[]},{key:"differences",title:"Differences",quoteIds:[]},{key:"clarifications",title:"Clarifications",quoteIds:[]}],hypotheses:[],gaps:[]};
  await reviewAndProposeDocumentWorkRevision(input,narrative,selection,d);
  const revisionInput=JSON.parse((vi.mocked(d.gateway.complete).mock.calls[0]![0].input[0] as {text:string}).text);
  const independent=deps({reviewedFieldIds:ids,issues:[]});
  await reviewDocumentWorkSourceFidelity(input,narrative,independent);
  const finalInput=JSON.parse((vi.mocked(independent.gateway.complete).mock.calls[0]![0].input[0] as {text:string}).text);
  expect(revisionInput.authoredFields).toEqual(finalInput.authoredFields);
  expect(finalInput.authoredFields).toEqual(documentWorkReviewFields(input,narrative));
  expect(finalInput.authoredFields.find((f:{id:string})=>f.id==="hypotheses.0.question")).toMatchObject({pairId:"hypotheses.0",pairedText:narrative.hypotheses[0]!.text,basisSourceIds:["p1","p2"]});
  expect(finalInput.authoredFields.find((f:{id:string})=>f.id==="gaps.0.question")).toMatchObject({pairId:"gaps.0",pairedText:narrative.gaps[0]!.text,basisSourceIds:[]});
  expect(()=>documentWorkReviewFields(input,{...narrative,hypotheses:[{...narrative.hypotheses[0]!,basisPassageIds:["foreign-source"]}]})).toThrow("document_work_product_source_review_failed");
});

it("requires a local anchored verdict for every field, independently of the reviewed ID list", async () => {
  const fields=documentWorkAuthoredFields(narrative);
  const assessments=fields.map(field=>({fieldId:field.id,verdict:"no_factual_assertion",exactExcerpt:field.text.slice(0,160),sourceIds:[] as string[]}));
  const bad=[assessments.slice(1),[...assessments,assessments[0]],assessments.map((a,i)=>i===0?{...a,exactExcerpt:"not in this title"}:a),assessments.map((a,i)=>i===0?{...a,verdict:"source_supported",sourceIds:[]}:a),assessments.map((a,i)=>i===0?{...a,verdict:"unsupported"}:a)];
  for(const fieldAssessments of bad)await expect(reviewDocumentWorkSourceFidelity(input,narrative,deps({reviewedFieldIds:ids,fieldAssessments,issues:[]}))).rejects.toThrow("source_review_failed");
  // An assessment for another field cannot cover a missing title, hypothesis or question.
  for(let index=0;index<fields.length;index++)await expect(reviewDocumentWorkSourceFidelity(input,narrative,deps({reviewedFieldIds:ids,fieldAssessments:assessments.filter((_,i)=>i!==index),issues:[]}))).rejects.toThrow("source_review_failed");
});
