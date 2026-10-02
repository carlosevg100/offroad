import {describe,it,expect,vi} from 'vitest';
import {createMaterialPackageReviewPort,materialPackageReviewReceiptSchema,type MaterialPackageReviewCommand} from './material-package-review';
const u=(n:number)=>`aa300000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const command:MaterialPackageReviewCommand={workId:u(1),revisionId:u(2),manifestFingerprint:'a'.repeat(64),act:'approve',note:null,selfApprovalDeclared:false,commandId:u(3),basisReviewId:null};
const receipt={schemaVersion:'capital-material-package-review.v1',workId:u(1),revisionId:u(2),reviewId:u(4),decisionId:u(5),act:'approve',effect:'request_followup_brief',jobId:u(6),runId:u(7),replayed:false};
describe('internal material package human command',()=>{
 it('calls one atomic command and reports a brief request, never execution',async()=>{const rpc=vi.fn<(_name:string,_args:Record<string,unknown>)=>Promise<{data:typeof receipt;error:null}>>(async()=>({data:receipt,error:null}));const r=await createMaterialPackageReviewPort({rpc}).decide(command);expect(r.effect).toBe('request_followup_brief');expect(rpc).toHaveBeenCalledOnce();expect(rpc.mock.calls[0]?.[0]).toBe('decide_material_package_v1');});
 it('does not infer successful approval when authority is denied',async()=>{const rpc=vi.fn(async()=>({data:null,error:{message:'material_package_review_denied'}}));await expect(createMaterialPackageReviewPort({rpc}).decide(command)).rejects.toThrow('denied');expect(rpc).toHaveBeenCalledOnce();});
 it('rejects receipt for another revision',async()=>{const rpc=vi.fn(async()=>({data:{...receipt,revisionId:u(9)},error:null}));await expect(createMaterialPackageReviewPort({rpc}).decide(command)).rejects.toThrow('identity_mismatch');});
 it('rejects ambiguous or external operational effects',()=>{for(const effect of ['queue_execution','send','introduction'])expect(materialPackageReviewReceiptSchema.safeParse({...receipt,effect}).success).toBe(false);expect(materialPackageReviewReceiptSchema.safeParse({...receipt,jobId:null}).success).toBe(false);});
 it('rejects revocation without exact approval basis before RPC',async()=>{const rpc=vi.fn();await expect(createMaterialPackageReviewPort({rpc}).decide({...command,act:'revoke_approval'})).rejects.toThrow('basis_required');expect(rpc).not.toHaveBeenCalled();});
 it('preserves exact replay receipt without another command',async()=>{const rpc=vi.fn(async()=>({data:{...receipt,replayed:true},error:null}));expect((await createMaterialPackageReviewPort({rpc}).decide(command)).replayed).toBe(true);expect(rpc).toHaveBeenCalledOnce();});
});
