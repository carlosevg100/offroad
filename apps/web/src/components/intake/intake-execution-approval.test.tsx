import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";
import type {IntakeExecutionApprovalState} from "@/lib/intake/execution-approval";
const mocks=vi.hoisted(()=>({refresh:vi.fn(),approve:vi.fn(),edit:vi.fn(),cardProps:null as null | {onRequestEdit:(content:string)=>Promise<unknown>;onApprove:(input:{expectedFingerprint:string;expectedVersion:number})=>Promise<unknown>}}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:mocks.refresh})}));
vi.mock("next-intl",()=>({useTranslations:()=>((key:string)=>key)}));
vi.mock("@/app/[locale]/app/advisor-actions",()=>({approveAdvisorExecutionBrief:mocks.approve,requestAdvisorExecutionBriefEdit:mocks.edit}));
vi.mock("@/components/advisor/execution-brief-card",()=>({ExecutionBriefCard:(props:NonNullable<typeof mocks.cardProps>)=>{mocks.cardProps=props;return <div>agreement</div>;}}));
import {IntakeExecutionApproval} from "./intake-execution-approval";
const state={projectId:"project",blockReview:true,pending:true,active:false,planning:false,brief:{id:"brief",version:2,value:{fingerprint:"a".repeat(64)},approval:{status:"awaiting",fingerprint:"a".repeat(64),version:2}}} as IntakeExecutionApprovalState;
beforeEach(()=>{mocks.approve.mockReset();mocks.edit.mockReset();mocks.refresh.mockReset();mocks.cardProps=null;});
describe("shared intake approval panel",()=>{
  it("reuses the exact command after a rejected attempt and refreshes the same route only on acceptance",async()=>{
    mocks.approve.mockResolvedValueOnce({ok:false,error:"save"}).mockResolvedValueOnce({ok:true});
    renderToStaticMarkup(<IntakeExecutionApproval locale="pt-BR" state={state}/>);
    const input={expectedFingerprint:"a".repeat(64),expectedVersion:2};
    expect(await mocks.cardProps!.onApprove(input)).toEqual({ok:false,error:"failed"});
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(await mocks.cardProps!.onApprove(input)).toEqual({ok:true});
    expect(mocks.approve.mock.calls[0]![0]).toEqual(mocks.approve.mock.calls[1]![0]);
    expect(mocks.approve.mock.calls[0]![0]).toMatchObject({projectId:"project",executionBriefId:"brief",expectedFingerprint:input.expectedFingerprint,commandId:expect.any(String)});
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("keeps an edit retry distinct from approval and creates a new command for changed instructions",async()=>{
    mocks.edit.mockResolvedValueOnce({ok:false,error:"stale"}).mockResolvedValue({ok:true});
    mocks.approve.mockResolvedValue({ok:true});
    renderToStaticMarkup(<IntakeExecutionApproval locale="pt-BR" state={state}/>);
    expect(await mocks.cardProps!.onRequestEdit(" Revisar o prazo ")).toEqual({ok:false,error:"stale"});
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(await mocks.cardProps!.onRequestEdit("Revisar o prazo")).toEqual({ok:true});
    expect(mocks.edit.mock.calls[0]![0]).toEqual(mocks.edit.mock.calls[1]![0]);
    await mocks.cardProps!.onRequestEdit("Revisar prazo e garantias");
    expect(mocks.edit.mock.calls[2]![0].messageId).not.toBe(mocks.edit.mock.calls[0]![0].messageId);
    await mocks.cardProps!.onApprove({expectedFingerprint:"a".repeat(64),expectedVersion:2});
    expect(mocks.approve.mock.calls[0]![0].commandId).not.toBe(mocks.edit.mock.calls[0]![0].messageId);
    expect(mocks.edit.mock.calls[0]![0]).toMatchObject({projectId:"project",executionBriefId:"brief",expectedFingerprint:"a".repeat(64),content:"Revisar o prazo"});
    expect(mocks.refresh).toHaveBeenCalledTimes(3);
  });
  it("shows planning without fabricating an approval control when no bound brief exists",()=>{
    const html=renderToStaticMarkup(<IntakeExecutionApproval locale="en-US" state={{...state,active:true,planning:true,brief:null}}/>);
    expect(html).toContain("preparingTitle");
    expect(mocks.cardProps).toBeNull();
    expect(mocks.approve).not.toHaveBeenCalled();
  });
});
