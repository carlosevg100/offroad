import {describe,it,expect} from "vitest";
import {documentWorkProductInputSchema} from "@offroad/domain-contracts";
import {buildDocumentWorkInput,documentWorkJob,type DocumentWorkRequest} from "./document-work-input";
import {encodeReceivablesEvidence,receivablesEvidenceEnvelopeSchema} from "./receivables-evidence";

const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const request:DocumentWorkRequest={projectId:id(1),jobId:id(2),briefId:id(3),planId:id(4),version:1,objective:"Compare the provided proposals",proposedDeliverable:"Proposal comparison",inputFingerprint:"a".repeat(64),requestFingerprint:"b".repeat(64)};
function document(n:number,texts:string[]){
  const hash="c".repeat(64);const documentId=id(n);
  const encoded=encodeReceivablesEvidence({id:documentId,fileName:`Proposal ${n}.pdf`,fileHash:hash,layer:{documentId,documentVersion:1,kind:"pdf",pages:[{n:1,scanned:false,tables:[],blocks:texts.map((text,i)=>({id:`p1.b${i}`,kind:"text",text}))}],scaleDeclarations:[],stats:{}}});
  return {source:{id:documentId,sha256:hash,document_version:1,processing_status:"ready",original_name:`Proposal ${n}.pdf`},envelope:receivablesEvidenceEnvelopeSchema.parse({source_document_id:documentId,document_version:1,content_kind:"document_layer",schema_version:encoded.schemaVersion,source_sha256:hash,content_sha256:encoded.contentSha256,payload_sha256:encoded.payloadSha256,codec:"gzip-json-v1",uncompressed_bytes:encoded.uncompressedBytes,payload_base64:encoded.payloadBase64})};
}
describe("bounded document work input",()=>{
  it.each([["Compare these proposals","comparison"],["Prepare a meeting briefing","meeting"],["Revisar esta oportunidade","review"],["Não quero comparar propostas",null],["Do not compare proposals",null],["Calculate EBITDA",null],["Não preciso comparar as propostas",null],["Don’t compare these proposals",null],["Briefing da companhia para amanhã","meeting"]] as const)("routes only explicit request %s",(text,job)=>expect(documentWorkJob(text)).toBe(job));
  it("preserves both proposals within the character budget",()=>{
    const docs=[document(11,Array.from({length:20},()=>"First proposal "+"a".repeat(11900))),document(12,["Second proposal requires a guarantee. "+"b".repeat(2000)])];
    const result=buildDocumentWorkInput({request,locale:"en-US",sources:docs.map(d=>d.source),envelopes:docs.map(d=>d.envelope)});
    expect(result).not.toBeNull();
    expect(new Set(result!.passages.map(p=>p.documentId)).size).toBe(2);
    expect(documentWorkProductInputSchema.safeParse(result).success).toBe(true);
    expect(result!.coverage.omittedPassages).toBeGreaterThan(0);
  });
  it("has stable source ordering and explicit partial coverage",()=>{
    const docs=[document(11,Array.from({length:90},(_,i)=>`Clause ${i}: parental guarantee is required.`)),document(12,["Other proposal has unsecured ranking."])];
    const args={request,locale:"en-US" as const,sources:docs.map(d=>d.source),envelopes:docs.map(d=>d.envelope)};
    const result=buildDocumentWorkInput(args)!;
    expect(result).toEqual(buildDocumentWorkInput({...args,envelopes:[...args.envelopes].reverse()}));
    expect(result.passages.length).toBeLessThanOrEqual(80);
    expect(result.coverage.omittedPassages).toBeGreaterThan(0);
  });
  it.each([{document_version:2},{sha256:"d".repeat(64)},{processing_status:"queued"}])("rejects stale or unready source %o",patch=>{
    const doc=document(11,["Proposal requires parental guarantee."]);
    expect(()=>buildDocumentWorkInput({request,locale:"en-US",sources:[{...doc.source,...patch}],envelopes:[doc.envelope]})).toThrow("source_not_current");
  });
  it("rejects corrupt source payload before constructing a product",()=>{
    const doc=document(11,["Proposal requires parental guarantee."]);
    expect(()=>buildDocumentWorkInput({request,locale:"en-US",sources:[doc.source],envelopes:[{...doc.envelope,content_sha256:"d".repeat(64)}]})).toThrow();
  });
  it("returns no model input for empty document evidence",()=>{
    const doc=document(11,[]);
    expect(buildDocumentWorkInput({request,locale:"en-US",sources:[doc.source],envelopes:[doc.envelope]})).toBeNull();
  });
});
