import {z} from "zod";
import {describe,expect,it,vi} from "vitest";
import type {InformationGap,TracedCalculation} from "@offroad/reconciliation";
import {auditBrief,compileAuthoredBrief,type CaseBrief} from "./brief";
import {financialNumbersIn} from "./audit";
import {briefReviewWithRevisionSchema,reviewBriefWithOneRevision,type BriefReviewResponse} from "./brief-review";
import {boundSemanticAuditSchema,expandBoundSemanticAudit,supportedSemanticAudit,type SemanticAudit} from "./semantic-audit";

const gap:InformationGap={id:"insurance",reference:"insurance",severity:"high",title:"Insurance",description:"Insurance information is not evidenced in the current analysis.",ownerRole:"company"};
const calculation:TracedCalculation={id:"cash",value:"100",labels:{pt:"Caixa",en:"Cash"},inputs:[],trace:[],warnings:[]};
const evidence={facts:[],calculations:[calculation],gaps:[gap],exceptions:[]};
const brief=compileAuthoredBrief({sections:[{id:"risks",heading:"Coverage",claims:[
  {id:"cash",text:"Cash is R$ 100.",material:true,kind:"calculation",supportIds:["cash"]},
  {id:"insurance",text:"The company has no insurance.",material:true,kind:"fact",supportIds:["gap:insurance"]},
]}],executiveSummaryClaimIds:["cash","insurance"]});
const audit:SemanticAudit={reviews:[
  {claimId:"cash",verdict:"supported",reasons:[],explanation:"Matches the calculated value."},
  {claimId:"insurance",verdict:"blocked",reasons:["unsupported_inference"],explanation:"An unsatisfied requirement does not establish absence."},
]};
const boundAudit={reviewsByClaim:Object.fromEntries(audit.reviews.map(({claimId,...review})=>[claimId,review]))};
const patch={claimId:"insurance",text:"Insurance coverage remains unverified in the current analysis.",kind:"fact" as const,supportIds:["gap:insurance"]};

describe("one reviewed brief revision",()=>{
  it("preserves supported content and materiality, rebuilds the summary and retains both reviews",async()=>{
    const verify=vi.fn(async(candidate:CaseBrief,allowRevision:boolean):Promise<BriefReviewResponse>=>allowRevision?{audit,revisions:[patch]}:{audit:supportedSemanticAudit(candidate)});
    const result=await reviewBriefWithOneRevision({brief,evidence,verify});
    expect(verify.mock.calls.map(call=>call[1])).toEqual([true,false]);
    expect(result.brief?.sections[0]!.claims[0]).toEqual(brief.sections[0]!.claims[0]);
    expect(result.brief?.sections[0]!.claims[1]).toEqual({id:"insurance",material:true,text:patch.text,kind:patch.kind,supportIds:patch.supportIds});
    expect(result.brief?.executiveSummary).toContain(patch.text);
    expect(result.brief?.executiveSummary).not.toContain("has no insurance");
    expect(result.attempts.map(attempt=>attempt.semanticAudit?.status)).toEqual(["blocked","pass"]);
    expect(result.attempts[0]!.brief).toEqual(brief);
    expect(result.blockedBy).toEqual([]);
  });
  it("does not erase a second rejection or make another repair attempt",async()=>{
    const verify=vi.fn(async()=>({audit,revisions:[patch]}));
    const result=await reviewBriefWithOneRevision({brief,evidence,verify});
    expect(result.brief).toBeNull();expect(result.attempts).toHaveLength(2);expect(verify).toHaveBeenCalledTimes(2);
    expect(result.blockedBy).toContain("insurance: semantic:unsupported_inference");
  });
  it.each([
    {revisions:[{...patch,claimId:"cash"}]},
    {revisions:[patch,patch]},
    {revisions:[{...patch,claimId:"new-claim"}]},
  ])("rejects patches outside the exact rejected claim set",async({revisions})=>{
    const verify=vi.fn(async()=>({audit,revisions}));
    const result=await reviewBriefWithOneRevision({brief,evidence,verify});
    expect(result.brief).toBeNull();expect(result.blockedBy).toContain("brief_revision_invalid");expect(verify).toHaveBeenCalledTimes(1);
  });
  it("requires a complete original review before applying any patch",async()=>{
    const result=await reviewBriefWithOneRevision({brief,evidence,verify:async()=>({audit:{reviews:[audit.reviews[1]!]},revisions:[patch]})});
    expect(result.brief).toBeNull();expect(result.attempts).toHaveLength(1);expect(result.blockedBy).toContain("brief_revision_invalid");
  });
  it("blocks a repaired invented number before asking for another semantic review",async()=>{
    const verify=vi.fn(async()=>({audit,revisions:[{...patch,text:"Insurance covers R$ 999."}]}));
    const result=await reviewBriefWithOneRevision({brief,evidence,verify});
    expect(result.brief).toBeNull();expect(result.numericAudit.findings.some(finding=>finding.reason==="number_not_in_support")).toBe(true);
    expect(verify).toHaveBeenCalledTimes(1);
  });
  it("rejects unsolicited revisions of a clean result",async()=>{
    const result=await reviewBriefWithOneRevision({brief,evidence,verify:async()=>({audit:supportedSemanticAudit(brief),revisions:[patch]})});
    expect(result.brief).toBeNull();expect(result.blockedBy).toEqual(["brief_revision_without_rejection"]);
  });
  it("requires fresh support-only review even when the critique proposes no repairs",async()=>{
    const verify=vi.fn(async()=>({audit:supportedSemanticAudit(brief),revisions:[]}));
    const result=await reviewBriefWithOneRevision({brief,evidence,verify});
    expect(verify.mock.calls).toHaveLength(2);expect(result.attempts).toHaveLength(2);
  });
  it("bounds patch identities and support to the current case",()=>{
    const schema=briefReviewWithRevisionSchema(brief,evidence);
    expect(schema.safeParse({...boundAudit,revisions:[patch]}).success).toBe(true);
    expect(schema.safeParse({...boundAudit,revisions:[{...patch,supportIds:["another-case"]}]}).success).toBe(false);
    expect(schema.safeParse({...boundAudit,revisions:[{...patch,claimId:"invented"}]}).success).toBe(false);
  });
  it("does not promote a revised judgment to human approval",async()=>{
    const result=await reviewBriefWithOneRevision({brief,evidence,verify:async(candidate,allowRevision)=>allowRevision
      ? {audit,revisions:[{...patch,kind:"judgment"}]}
      : {audit:supportedSemanticAudit(candidate)}});
    expect(result.brief).not.toBeNull();
    expect(auditBrief({brief:result.brief!,...evidence}).audit.findings).toContainEqual(expect.objectContaining({reason:"material_judgment_without_approval"}));
  });
  it("recognizes explicit currency even for small amounts and year-shaped amounts",()=>{
    expect(financialNumbersIn("R$ 999, USD 2026, 25 euros; 3 stores in 2026.")).toEqual(["999","2026","25"]);
  });
});


describe("complete provider review contract",()=>{
  it("requires every material claim at the provider schema boundary and preserves the canonical review",()=>{
    const schema=boundSemanticAuditSchema(brief);
    const json=z.toJSONSchema(schema);
    expect((json.properties?.reviewsByClaim as {required:string[]}).required).toEqual(["cash","insurance"]);
    expect(expandBoundSemanticAudit(brief,boundAudit)).toEqual(audit);
    expect(schema.safeParse({reviewsByClaim:{cash:boundAudit.reviewsByClaim.cash}}).success).toBe(false);
    expect(schema.safeParse({reviewsByClaim:{...boundAudit.reviewsByClaim,foreign:boundAudit.reviewsByClaim.cash}}).success).toBe(false);
    expect(schema.safeParse(audit).success).toBe(false);
  });
  it("rejects ambiguous claim identities before provider execution",()=>{
    const duplicate={...brief,sections:[...brief.sections,brief.sections[0]!]};
    expect(()=>boundSemanticAuditSchema(duplicate)).toThrow("brief_review_duplicate_claim_id");
  });
});
