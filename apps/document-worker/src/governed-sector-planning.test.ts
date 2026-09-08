import {describe, expect, it} from "vitest";
import {buildGovernedSectorPlanning, sectorIntentForObjective, type GovernedSectorContextInputs} from "./governed-sector-planning";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function packet(): GovernedSectorContextInputs {return {
  schema_version: "governed-sector-context-inputs.v1", as_of: "2026-09-08",
  candidates: [{id:id(1),field_path:"company.sector",normalized_value:"energia",review_state:"accepted",is_primary:true,reviewed_by:id(2),reviewed_at:"2026-09-08T12:00:00Z",entity_name:"Synthetic Company",entity_scope:"company",period_start:null,period_end:null,source_anchor:{page:3},anchor_verified:true,extraction_method:"document",processing_run_id:id(3),source_document_id:id(4),extraction_document_version:2,extraction_source_sha256:"a".repeat(64)}],
  sources:[{id:id(4),original_name:"Synthetic source",document_version:2,sha256:"a".repeat(64),processing_status:"ready",scan_verdict:"clean"}],
};}
function build(inputs = packet(), objective = "Analyze the company") {return buildGovernedSectorPlanning({inputs,sessionId:id(5),companyLabel:"Synthetic Company",locale:"en-US",objective})!;}
describe("governed sector planning producer", () => {
  it("preserves reviewed document lineage and changes fingerprint when the source revision changes", () => {
    const p=packet(); const result=build(p);
    expect(result.objects[0]!.attributes[0]).toMatchObject({status:"confirmed",sources:[{basis:"reviewed_document",version:`2:${"a".repeat(64)}`,anchor:'{"page":3}'}]});
    p.sources[0]!.document_version=3;
    const stale=build(p); expect(stale.contextFingerprint).not.toBe(result.contextFingerprint);
    expect(stale.objects[0]!.attributes[0]!.status).toBe("proposed");
  });
  it("attributes an edited fact to user review, never the original document", () => {
    const p=packet(); p.candidates[0]!.review_state="edited";
    expect(build(p).objects[0]!.attributes[0]).toMatchObject({status:"confirmed",sources:[{basis:"user_review",label:"User-reviewed information"}]});
  });
  it.each(["wrong_entity","quarantine","hash","reviewer","unknown"])("does not confirm %s", (issue) => {
    const p=packet(); const c=p.candidates[0]!;
    if(issue==="wrong_entity") c.entity_name="Other Company";
    if(issue==="quarantine") p.sources[0]!.processing_status="quarantined";
    if(issue==="hash") c.extraction_source_sha256=null;
    if(issue==="reviewer") c.reviewed_by=null;
    if(issue==="unknown") c.normalized_value="unmapped category";
    expect(build(p).objects[0]!.attributes[0]!.status).not.toBe("confirmed");
  });
  it.each([null,"2026-01-01"])("does not confirm incomplete or reversed period ending %s", (end) => {
    const p=packet(); p.candidates[0]!.period_start="2026-09-01";p.candidates[0]!.period_end=end;
    const result=build(p);expect(result.objects[0]!.attributes[0]!.status).toBe("proposed");
    expect(result.objects[0]!.gaps.some(g=>g.id.endsWith(":period"))).toBe(true);
  });
  it("accepts a valid future economic period without treating asOf as its end", () => {
    const p=packet();p.candidates[0]!.period_start="2027-01-01";p.candidates[0]!.period_end="2027-12-31";
    expect(build(p).objects[0]!.attributes[0]!.status).toBe("confirmed");
  });
  it("bounds repeated gaps for 100 individually valid unresolved candidates", () => {
    const p=packet();p.candidates=Array.from({length:100},(_,i)=>({...p.candidates[0]!,id:id(i+10),entity_name:"Other",normalized_value:"unsupported",period_start:"2026-01-01"}));
    const result=build(p);expect(result.objects[0]!.gaps.length).toBeLessThan(10);
  });
  it("keeps economic fingerprints bilingual and exposes actual periods", () => {
    const p=packet();p.candidates[0]!.review_state="edited";
    p.candidates[0]!.period_start="2026-01-01";p.candidates[0]!.period_end="2026-12-31";
    const en=build(p);const pt=buildGovernedSectorPlanning({inputs:p,sessionId:id(5),companyLabel:"Synthetic Company",locale:"pt-BR",objective:"Analyze the company"})!;
    expect(pt.planFingerprint).toBe(en.planFingerprint);
    expect(pt.contextFingerprint).toBe(en.contextFingerprint);
    expect(en.objects[0]!.attributes[0]!.label).toContain("2026-01-01 → 2026-12-31");
  });
  it("deduplicates conflicting identical classifications without silently confirming them", () => {
    const p=packet();p.candidates.push({...p.candidates[0]!,id:id(8),entity_name:"Other Company"});
    const result=build(p);
    expect(result.objects[0]!.attributes).toHaveLength(1);
    expect(result.objects[0]!.attributes[0]!.status).toBe("conflicting");
    p.candidates.reverse();expect(build(p)).toEqual(result);
  });
  it.each(["review_date", "source_hash", "extraction_hash"])("rejects malformed trusted metadata %s", (field) => {
    const p=packet();
    if(field==="review_date") p.candidates[0]!.reviewed_at="";
    if(field==="source_hash") p.sources[0]!.sha256="invalid";
    if(field==="extraction_hash") p.candidates[0]!.extraction_source_sha256="invalid";
    expect(()=>build(p)).toThrow();
  });
  it("preserves factual intent and leaves legacy absence untouched", () => {
    expect(sectorIntentForObjective("Qual é o CNPJ da companhia?")).toBe("factual_answer");
    expect(buildGovernedSectorPlanning({sessionId:id(5),companyLabel:"Company",locale:"en-US",objective:"Analyze"})).toBeUndefined();
    expect(build({...packet(),candidates:[]})).toBeUndefined();
  });
});
