import {describe,expect,it} from "vitest";
import {sourceVersionReferenceSchema,sourceVersionDownloadSchema} from "./source-version";
const id="a6660000-0000-4000-9000-000000000001";
const reference={sourceId:id,sourceVersionId:id,organizationId:id,version:1,sha256:null,byteSize:null,verification:"legacy_unverified"};
describe("source version identity",()=>{
 it("preserves unverified legacy identity without inventing bytes",()=>{
  expect(sourceVersionReferenceSchema.parse(reference).sha256).toBeNull();
 });
 it("requires hash and size before declaring a verified version",()=>{
  expect(sourceVersionReferenceSchema.safeParse({...reference,verification:"verified"}).success).toBe(false);
  expect(sourceVersionReferenceSchema.safeParse({...reference,verification:"verified",sha256:"a".repeat(64),byteSize:10}).success).toBe(true);
 });
 it("does not accept a filename as source identity",()=>{
  expect(sourceVersionReferenceSchema.safeParse({...reference,sourceId:"balance.pdf"}).success).toBe(false);
 });
 it("rejects another bucket in a download capability result",()=>{
  expect(sourceVersionDownloadSchema.safeParse({id,bucket_id:"public",object_path:"path",original_name:"file"}).success).toBe(false);
 });
});
