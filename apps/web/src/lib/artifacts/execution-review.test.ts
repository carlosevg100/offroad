import {describe,expect,it} from "vitest";
import {parseExecutionReview} from "./execution-review";
const work="10000000-0000-4000-8000-000000000001",result="20000000-0000-4000-8000-000000000001",revision="30000000-0000-4000-8000-000000000001";
const context={revisionId:revision,withheld:false,artifact:{id:result,workId:work,kind:"execution_result",subject:`execution:${result}`},
 snapshot:{revision:{id:revision,revisionNo:1,manifestFingerprint:"a".repeat(64),audience:"internal",createdAt:"2026-09-29T00:00:00Z"},blocks:[]},
 policy:{assignmentRequired:true,selfApprovalAllowed:false,roles:[]},preparedBy:work,release:"internal",freshness:"current",reviews:[]};
describe("execution review context",()=>{
 it("retains the server regime and exact persisted revision",()=>{expect(parseExecutionReview(context,work,result,revision)?.policy).toEqual(context.policy);});
 it.each([
  {...context,withheld:true}, {...context,revisionId:work}, {...context,snapshot:{...context.snapshot,revision:{...context.snapshot.revision,id:work}}},
  {...context,artifact:{...context.artifact,workId:result}}, {...context,artifact:{...context.artifact,subject:"institutional-workbook"}},
  {...context,policy:{...context.policy,assignmentRequired:"false"}},
 ])("refuses withheld, mismatched, or malformed authority %j",data=>{expect(parseExecutionReview(data,work,result,revision)).toBeNull();});
});
