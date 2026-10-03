import {describe,expect,it} from "vitest";
import {workUpdateAdoptionCommand} from "./work-update-adoption-command";
const id="10000000-0000-4000-8000-000000000001",other="10000000-0000-4000-8000-000000000002";
const basis={updateId:id,workId:other,revision:3,basisFingerprint:"a".repeat(64),adoptedResults:[other],replacedResults:[id],preparedBy:[id,other],viewerId:id,workAccess:true,
 policy:{assignmentRequired:false,selfApprovalAllowed:true,roles:[]},status:"ready"};
describe("work update native adoption",()=>{
 it("binds the adopted result set through the fixed basis fingerprint",()=>{expect(workUpdateAdoptionCommand(basis,{commandId:other,selfApprovalDeclared:true})).toEqual({rpc:"adopt_work_update_v2",args:{p_command_id:other,p_update_id:id,p_expected_revision:3,p_expected_basis_fingerprint:basis.basisFingerprint,p_self_approval_declared:true}});});
 it("requires declaration when any adopted result was prepared by the reviewer",()=>{expect(()=>workUpdateAdoptionCommand(basis,{commandId:other,selfApprovalDeclared:false})).toThrow("self_approval");});
 it("denies read-only, unassigned review and unknown result sets",()=>{for(const raw of [{...basis,workAccess:false},{...basis,policy:{...basis.policy,assignmentRequired:true}},{...basis,adoptedResults:[]}])expect(()=>workUpdateAdoptionCommand(raw,{commandId:other,selfApprovalDeclared:true})).toThrow();});
});
