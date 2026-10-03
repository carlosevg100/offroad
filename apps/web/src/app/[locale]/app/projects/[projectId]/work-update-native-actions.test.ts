import{beforeEach,describe,expect,it,vi}from"vitest";
const m=vi.hoisted(()=>({workspace:vi.fn(),rpc:vi.fn(),refresh:vi.fn()}));vi.mock("@/lib/auth/workspace",()=>({requireWorkspace:m.workspace}));vi.mock("next/cache",()=>({revalidatePath:m.refresh}));
import{adoptWorkUpdate,readWorkUpdateAdoption}from"./work-update-actions";
const id="10000000-0000-4000-8000-000000000001",other="10000000-0000-4000-8000-000000000002";
const basis={updateId:id,workId:other,revision:2,basisFingerprint:"a".repeat(64),adoptedResults:[other],replacedResults:[id],preparedBy:[id],viewerId:id,workAccess:true,policy:{assignmentRequired:false,selfApprovalAllowed:true,roles:[]},status:"ready"};
const input={locale:"pt-BR",updateId:id,expectedRevision:2,expectedBasisFingerprint:basis.basisFingerprint,commandId:other,selfApprovalDeclared:true};
beforeEach(()=>{vi.clearAllMocks();m.workspace.mockResolvedValue({supabase:{rpc:m.rpc}});m.rpc.mockImplementation(async(n:string)=>({data:n==="read_work_update_adoption_basis_v2"?basis:{},error:null}));});
describe("native adoption action",()=>{
 it("reads exact result set before atomically adopting under explicit declaration",async()=>{expect((await readWorkUpdateAdoption({locale:"pt-BR",updateId:id,expectedRevision:2})).ok).toBe(true);expect(await adoptWorkUpdate(input)).toEqual({ok:true});expect(m.rpc.mock.calls.at(-1)?.[0]).toBe("adopt_work_update_v2");expect(m.rpc.mock.calls.at(-1)?.[1]).toMatchObject({p_expected_basis_fingerprint:basis.basisFingerprint,p_self_approval_declared:true});});
 it("refuses changed base or absent declaration without any write",async()=>{expect(await adoptWorkUpdate({...input,expectedBasisFingerprint:"b".repeat(64)})).toEqual({ok:false,error:"stale"});expect(await adoptWorkUpdate({...input,selfApprovalDeclared:false})).toEqual({ok:false,error:"denied"});expect(m.rpc.mock.calls.every(c=>c[0]==="read_work_update_adoption_basis_v2")).toBe(true);});
 it("never falls back to v1 for unproved or revoked result sources",async()=>{m.rpc.mockResolvedValue({data:null,error:{code:"42501",message:"work_update_basis_denied"}});expect(await adoptWorkUpdate(input)).toEqual({ok:false,error:"denied"});expect(m.rpc).toHaveBeenCalledOnce();expect(m.refresh).not.toHaveBeenCalled();});
 it("rejects bare legacy-shaped or arbitrary authority input",async()=>{expect(await adoptWorkUpdate({locale:"pt-BR",updateId:id,expectedRevision:2,commandId:other})).toEqual({ok:false,error:"invalid"});expect(await adoptWorkUpdate({...input,organizationId:other})).toEqual({ok:false,error:"invalid"});expect(m.rpc).not.toHaveBeenCalled();});
});
