import {z} from "zod";
import {buildBriefEvidenceCatalog, type BriefEvidenceInput} from "./brief-evidence";
import {auditBrief, briefClaimSchema, compileAuthoredBrief, resolveExecutiveSummaryClaims, type CaseBrief} from "./brief";
import {normalizeSemanticAudit, semanticAuditSchema, type NormalizedSemanticAudit, type SemanticAudit} from "./semantic-audit";
import type {AuditReport} from "./audit";

const claimRevisionSchema = briefClaimSchema.pick({text:true,kind:true,supportIds:true}).extend({claimId:z.string().min(1)});
export type BriefClaimRevision = z.infer<typeof claimRevisionSchema>;
export type BriefReviewResponse = {audit:SemanticAudit; revisions?:readonly BriefClaimRevision[]};
export type BriefReviewAttempt = {phase:"critique"|"final_review"; brief:CaseBrief; numericAudit:AuditReport; semanticAudit:NormalizedSemanticAudit|null};
export type BriefReviewOutcome = {
  brief:CaseBrief|null; proposedBrief:CaseBrief; numericAudit:AuditReport;
  semanticAudit:NormalizedSemanticAudit|null; attempts:BriefReviewAttempt[]; blockedBy:string[];
};

/** The reviewer may propose patches, but cannot remove claims or change materiality. */
export function briefReviewWithRevisionSchema(brief:CaseBrief,evidence:BriefEvidenceInput) {
  const ids=brief.sections.flatMap(section=>section.claims.filter(claim=>claim.material).map(claim=>claim.id));
  const support=[...buildBriefEvidenceCatalog(evidence).keys()];
  if(!ids.length||!support.length)throw new Error("brief_review_evidence_required");
  return semanticAuditSchema.extend({revisions:z.array(claimRevisionSchema.extend({
    claimId:z.enum(ids as [string,...string[]]),
    supportIds:z.array(z.enum(support as [string,...string[]])).min(1),
  })).max(ids.length)});
}

/** Only rejected claims can change. All other claims and summary selection are retained. */
export function applyBriefReviewRevisions(brief:CaseBrief,audit:NormalizedSemanticAudit,revisions:readonly BriefClaimRevision[]):CaseBrief {
  if(audit.status!=="blocked"||audit.findings.some(finding=>finding.reason==="review_missing"))throw new Error("brief_revision_invalid_review");
  const rejected=new Set(audit.findings.map(finding=>finding.claimId));
  const patches=new Map(revisions.map(revision=>[revision.claimId,claimRevisionSchema.parse(revision)]));
  if(patches.size!==revisions.length||patches.size!==rejected.size||[...patches.keys()].some(id=>!rejected.has(id)))throw new Error("brief_revision_scope_mismatch");
  const summary=resolveExecutiveSummaryClaims(brief);
  if(!summary)throw new Error("brief_revision_unbound_summary");
  const sections=brief.sections.map(section=>({...section,claims:section.claims.map(claim=>{
    const patch=patches.get(claim.id);
    return patch?{...claim,text:patch.text,kind:patch.kind,supportIds:patch.supportIds}:claim;
  })}));
  return compileAuthoredBrief({sections,executiveSummaryClaimIds:summary.map(claim=>claim.id)});
}

/** At most one revision and one fresh review; no failed draft becomes a deliverable. */
export async function reviewBriefWithOneRevision(input:{
  brief:CaseBrief; evidence:BriefEvidenceInput;
  verify:(brief:CaseBrief,allowRevision:boolean)=>Promise<BriefReviewResponse>;
}):Promise<BriefReviewOutcome> {
  let candidate=input.brief;
  const attempts:BriefReviewAttempt[]=[];
  for(const ordinal of [0,1]) {
    const numeric=auditBrief({brief:candidate,...input.evidence,requireJudgmentApproval:false});
    const attempt:BriefReviewAttempt={phase:ordinal===0?"critique":"final_review",brief:candidate,numericAudit:numeric.audit,semanticAudit:null};
    attempts.push(attempt);
    const result=(brief:CaseBrief|null,blockedBy:string[]):BriefReviewOutcome=>({brief,proposedBrief:candidate,numericAudit:numeric.audit,semanticAudit:attempt.semanticAudit,attempts,blockedBy});
    if(!numeric.ok)return result(null,numeric.audit.findings.map(finding=>`${finding.claimId}: ${finding.reason}`));
    const verified=await input.verify(candidate,ordinal===0);
    const semantic=normalizeSemanticAudit(candidate,verified.audit);
    attempt.semanticAudit=semantic;
    const revisions=verified.revisions??[];
    if(semantic.status==="pass") {
      if(revisions.length)return result(null,["brief_revision_without_rejection"]);
      // The critique also saw the repair catalog. Final acceptance always uses a fresh
      // review with only each claim's own cited support, even when no patch was needed.
      if(ordinal===0)continue;
      return result(candidate,[]);
    }
    const failures=semantic.findings.map(finding=>`${finding.claimId}: semantic:${finding.reason}`);
    if(ordinal===1||revisions.length===0)return result(null,failures);
    try {candidate=applyBriefReviewRevisions(candidate,semantic,revisions);}
    catch {return result(null,[...failures,"brief_revision_invalid"]);}
  }
  throw new Error("brief_review_unreachable");
}
