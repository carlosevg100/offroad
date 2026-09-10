import {createHash} from "node:crypto";
import {z} from "zod";
export const documentaryContinuationSource={runId:"34467680287",runAttempt:"1",gitSha:"d3763a7fd28e9ff5e35acdb9d748ef8b3d126ce1",receiptSha256:"01c86a6de3c52f704a9ecf1917d03163d29d2a84d9b51c542e8b3ac0a480ed47"} as const;
export const documentaryContinuationCaseId="source-review-diligence-request-versus-commitment";
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const range=z.object({start:z.number().int().nonnegative(),end:z.number().int().nonnegative()});
const spend=z.object({calls:z.number().int().nonnegative(),costUsd:z.number().finite().nonnegative(),unknownCostCalls:z.literal(0),budgetExposureUsd:z.number().finite().nonnegative()});
const call=z.object({invocationId:z.string(),costUsd:z.number().finite().nonnegative(),costStatus:z.literal("measured"),fromCassette:z.literal(false)});
const receipt=z.object({schemaVersion:z.literal("document-work-product-executor-eval.v5"),synthetic:z.literal(true),promotion:z.literal(false),runId:z.literal(documentaryContinuationSource.runId),runAttempt:z.literal("1"),gitSha:z.literal(documentaryContinuationSource.gitSha),workflowRef:z.literal("carlosevg100/offroad/.github/workflows/document-work-product-live.yml@refs/heads/main"),budgetReservation:z.literal("conservative_text_v1"),fixtureFingerprint:hash,sourceReviewFixtureFingerprint:hash,passed:z.literal(false),budget:z.object({maxCostUsd:z.literal(3),maxCalls:z.literal(26),gold:z.object({maxCostUsd:z.literal(2.5),maxCalls:z.literal(18)}),sourceReviewControls:z.object({maxCostUsd:z.literal(.5),maxCalls:z.literal(8)})}),spent:spend,sourceReviewControlSpend:spend,accounting:z.object({passed:z.literal(true),requestsRecorded:z.literal(6)}),runs:z.array(z.object({caseId:z.string(),repeat:z.number().int(),score:z.object({passed:z.literal(true)}),failure:z.null(),providerCallRange:range})).length(6),repeats:z.array(z.object({caseId:z.string(),comparison:z.object({passed:z.literal(true)})})).length(3),sourceReviewControls:z.array(z.object({caseId:z.string(),passed:z.boolean(),review:z.unknown(),failure:z.string().nullable(),providerCallRange:range})).length(8),calls:z.array(call).length(17),sourceReviewControlCalls:z.array(call).length(8)});
/** trusted metadata must come from the protected workflow, never from receipt fields.
 * This authorizes no dispatch: the workflow must claim the sole continuation before secrets. */
export function validateDocumentWorkProductContinuation(input:{receiptBytes:string;trusted:{runId:string;runAttempt:string;gitSha:string;receiptSha256:string;fixtureFingerprint:string;sourceReviewFixtureFingerprint:string}}){
 const fail=():never=>{throw new Error("document_work_continuation_receipt_invalid");};
 const t=input.trusted;
 if(t.runId!==documentaryContinuationSource.runId||t.runAttempt!=="1"||t.gitSha!==documentaryContinuationSource.gitSha||createHash("sha256").update(input.receiptBytes).digest("hex")!==t.receiptSha256)fail();
 const r=receipt.parse(JSON.parse(input.receiptBytes));
 if(r.fixtureFingerprint!==t.fixtureFingerprint||r.sourceReviewFixtureFingerprint!==t.sourceReviewFixtureFingerprint)fail();
 const groups=[...new Set(r.runs.map(x=>x.caseId))];
 if(groups.length!==3||groups.some(id=>r.runs.filter(x=>x.caseId===id).map(x=>x.repeat).sort().join(",")!=="1,2")||new Set(r.repeats.map(x=>x.caseId)).size!==3||r.repeats.some(x=>!groups.includes(x.caseId)))fail();
 function verifyRanges(rows:Array<{providerCallRange:{start:number;end:number}}>,total:number){let end=0;for(const row of rows){if(row.providerCallRange.start!==end||row.providerCallRange.end<=end)fail();end=row.providerCallRange.end;}if(end!==total)fail();}
 verifyRanges(r.runs,17);verifyRanges(r.sourceReviewControls.slice(0,7),8);
 const last=r.sourceReviewControls[7]!;
 if(new Set(r.sourceReviewControls.map(x=>x.caseId)).size!==8||r.sourceReviewControls.slice(0,7).some(x=>!x.passed||x.failure!==null||x.review==null)||last.caseId!==documentaryContinuationCaseId||last.passed||last.review!==null||last.failure!=="executor_or_provider_rejected"||last.providerCallRange.start!==8||last.providerCallRange.end!==8)fail();
 const all=[...r.calls,...r.sourceReviewControlCalls];if(new Set(all.map(x=>x.invocationId)).size!==25)fail();
 const micro=(n:number)=>Math.round(n*1e6);
 for(const [s,calls]of [[r.spent,r.calls],[r.sourceReviewControlSpend,r.sourceReviewControlCalls]] as const){if(s.calls!==calls.length||micro(s.costUsd)!==calls.reduce((sum,c)=>sum+micro(c.costUsd),0)||micro(s.budgetExposureUsd)!==micro(s.costUsd))fail();}
 const gold=micro(r.spent.costUsd),controls=micro(r.sourceReviewControlSpend.costUsd);
 if(gold>2500000||controls>=500000||gold+controls>=3000000||r.spent.calls+r.sourceReviewControlSpend.calls!==25)fail();
 return {sourceRunId:r.runId,sourceReceiptSha256:t.receiptSha256,caseId:documentaryContinuationCaseId,remainingCalls:1 as const,maxCostUsd:Math.min(500000-controls,3000000-gold-controls)/1e6,priorCalls:25 as const,priorCostUsd:(gold+controls)/1e6};
}
