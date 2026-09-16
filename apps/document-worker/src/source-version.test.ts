import {describe,expect,it} from "vitest";
import {jobPayloadSchema} from "./queue";
const id="a6660000-0000-4000-9000-000000000001";
const payload={source_document_id:id,original_name:"file.pdf",object_path:"org/session/file.pdf"};
describe("document job exact version",()=>{
 it("reads historical queued payloads with the stable document identity",()=>{
  expect(jobPayloadSchema.parse(payload).source_document_id).toBe(id);
 });
 it("refuses a substituted version even if its filename matches",()=>{
  expect(jobPayloadSchema.safeParse({...payload,source_version_id:"a6660000-0000-4000-9000-000000000002"}).success).toBe(false);
 });
 it("keeps explicit logical source separate from byte version",()=>{
  expect(jobPayloadSchema.parse({...payload,source_version_id:id,source_id:"a6660000-0000-4000-9000-000000000002"}).source_version_id).toBe(id);
 });
});
