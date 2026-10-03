import {describe,expect,it} from "vitest";
import {assessmentReviewBasisSchema,assessmentReviewCommand} from "./assessment-review-command";
const id="10000000-0000-4000-8000-000000000001",other="10000000-0000-4000-8000-000000000002";
const basis={workId:id,assessmentId:other,decisionKey:"case.structure_direction",revision:2,decisionFingerprint:"a".repeat(64),proposalFingerprint:"b".repeat(64),preparedBy:id,viewerId:id,workAccess:true,
 policy:{assignmentRequired:false,selfApprovalAllowed:true,roles:[]},totalSourceCount:3,documentSourceCount:1,houseSourceCount:1,publicSourceCount:1,status:"open",nativeOutcome:null,frozen:false,nativeDecisionId:null};
const intent={commandId:other,outcome:"approved" as const,freeze:true,selfApprovalDeclared:true};
describe("assessment review exact command",()=>{
 it("fixes the server's economic identity and original preparer declaration",()=>{const command=assessmentReviewCommand(basis,intent);expect(command.rpc).toBe("review_assessment_v2");expect(command.args).toMatchObject({p_expected_revision:2,p_expected_decision_fingerprint:basis.decisionFingerprint,p_expected_proposal_fingerprint:basis.proposalFingerprint,p_self_approval_declared:true});});
 it("requires explicit self approval and WORK even in assigned mode",()=>{expect(()=>assessmentReviewCommand(basis,{...intent,selfApprovalDeclared:false})).toThrow("self_approval");expect(()=>assessmentReviewCommand({...basis,workAccess:false,policy:{...basis.policy,assignmentRequired:true,roles:["approver"]}},intent)).toThrow("review_denied");});
 it("distinguishes rejection without freeze from approval",()=>{expect(assessmentReviewCommand(basis,{...intent,outcome:"rejected",freeze:false,selfApprovalDeclared:false}).args.p_freeze).toBe(false);expect(()=>assessmentReviewCommand(basis,{...intent,freeze:false})).toThrow("requires_freeze");});
 it("does not treat absent or inconsistent source cardinality as zero",()=>{expect(assessmentReviewBasisSchema.safeParse({...basis,totalSourceCount:0}).success).toBe(false);const without={...basis};Reflect.deleteProperty(without,"totalSourceCount");expect(assessmentReviewBasisSchema.safeParse(without).success).toBe(false);});
});
