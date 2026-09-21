import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";
import {loadMethodLibrary,loadReviewRecords,compileMethodDocument} from "./procedure-markdown";
const root=resolve(import.meta.dirname,"../knowledge");
const id="prepare-capital-structure-decision-2026-09-21-v3-independent-review";
const read=(p:string)=>readFileSync(resolve(root,p),"utf8");
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
describe("capital independent review on record",()=>{
  it("preserves the reviewer record and every subject evidence byte",()=>{
    const review=loadReviewRecords(resolve(root,"reviews")).get(id)!;
    const directory=`reviews/evidence/${id}`;const bytes=read(`${directory}/REVIEW-SUBJECT-BASIS.json`);
    expect(review.subject.fingerprint).toBe(hash(bytes));
    const basis=JSON.parse(bytes) as {evidenceFiles:{path:string;sha256:string}[]};
    for(const e of basis.evidenceFiles)expect(hash(read(`${directory}/${e.path}`))).toBe(e.sha256);
    expect(review.result).toBe("conditional");expect(review.humanApproval).toBe(false);
  });
  it("allows technical evaluation while leaving publication and task execution unapproved",()=>{
    const method=loadMethodLibrary(resolve(root,"procedures"),resolve(root,"reviews")).methods.find(m=>m.procedure.id==="prepare-capital-structure-decision")!;
    expect(method.procedure.maturity).toBe("tested");expect(method.composition?.authoringStatus).toBe("ready_for_review");
    expect(method.procedure.owner.approvedAt).toBeUndefined();expect(method.frontmatter.task_specs).toEqual([]);expect(method.frontmatter.capability_availability).toBeUndefined();
  });
  it("refuses a missing review and refuses production without the real human approval",()=>{
    const path="capital/prepare-capital-structure-decision.md";const source=read(`procedures/${path}`);const reviews=loadReviewRecords(resolve(root,"reviews"));
    expect(()=>compileMethodDocument(source,path)).toThrow("not on record");
    expect(()=>compileMethodDocument(source.replace("maturity: tested","maturity: production"),path,id=>reviews.get(id)??null)).toThrow(/approval/);
  });
});
