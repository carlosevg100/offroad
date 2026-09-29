import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({workspace:vi.fn(),context:vi.fn(),refresh:vi.fn(),rpc:vi.fn(),project:vi.fn()}));
vi.mock("@/lib/auth/workspace",()=>({requireWorkspace:mocks.workspace}));
vi.mock("@/lib/artifacts/institutional-review",()=>({loadInstitutionalReview:mocks.context}));
vi.mock("next/cache",()=>({revalidatePath:mocks.refresh}));
import {reviewInstitutionalArtifact} from "./artifact-review-actions";
const id="10000000-0000-4000-8000-000000000001";
const command={locale:"pt-BR",projectId:id,resultId:id,revisionId:id,fingerprint:"a".repeat(64),act:"approve",declared:true,commandId:id,note:"",basisReviewId:null,blockId:null};
const eq=vi.fn();
beforeEach(()=>{
 vi.clearAllMocks();eq.mockReturnValue({eq,maybeSingle:mocks.project});
 mocks.project.mockResolvedValue({data:{id},error:null});mocks.rpc.mockResolvedValue({error:null});
 mocks.workspace.mockResolvedValue({organization:{id:"session-org"},supabase:{rpc:mocks.rpc,from:()=>({select:()=>({eq})})}});
 mocks.context.mockResolvedValue({snapshot:{revision:{manifestFingerprint:command.fingerprint}}});
});
describe("institutional review action authority",()=>{
 it("resolves tenant from the session and keeps the command identity on replay",async()=>{
  expect(await reviewInstitutionalArtifact(command)).toEqual({ok:true});
  expect(await reviewInstitutionalArtifact(command)).toEqual({ok:true});
  expect(eq).toHaveBeenCalledWith("organization_id","session-org");
  expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
  expect(mocks.rpc.mock.calls[0][1]).toMatchObject({p_command_id:id,p_self_approval_declared:true});
 });
 it("rejects an organization injected into the command",async()=>{
  expect(await reviewInstitutionalArtifact({...command,organizationId:"other"})).toEqual({ok:false,error:"save"});expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("denies foreign projects before writing",async()=>{
  mocks.project.mockResolvedValue({data:null,error:null});expect(await reviewInstitutionalArtifact(command)).toEqual({ok:false,error:"denied"});expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("denies withheld review context",async()=>{
  mocks.context.mockResolvedValue(null);expect(await reviewInstitutionalArtifact(command)).toEqual({ok:false,error:"denied"});expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("rejects a changed fingerprint",async()=>{
  expect(await reviewInstitutionalArtifact({...command,fingerprint:"b".repeat(64)})).toEqual({ok:false,error:"changed"});expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("honors a database denial after the initial context read",async()=>{
  mocks.rpc.mockResolvedValue({error:{code:"42501"}});expect(await reviewInstitutionalArtifact(command)).toEqual({ok:false,error:"denied"});expect(mocks.refresh).not.toHaveBeenCalled();
 });
});
