import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {HeadObjectCommand, PutObjectCommand} from "@aws-sdk/client-s3";
import {describe, expect, it, vi} from "vitest";
import {createAuditArchive} from "./audit-archive";
const bytes = '{"events":[]}', sha = createHash("sha256").update(bytes).digest("hex");
const claim = {claimed: true, blockedCount: 0, oldestPendingSeconds: 0, batchId: "a4220000-0000-4000-8000-000000000001", organizationId: "a4220000-0000-4000-9000-000000000001", capability: "a".repeat(64), canonicalPayload: bytes, sha256: sha, leaseExpiresAt: "2026-10-06T12:02:00Z"};
const head = {VersionId: "real-s3-version", ContentLength: Buffer.byteLength(bytes), ChecksumSHA256: Buffer.from(sha, "hex").toString("base64"), ServerSideEncryption: "AES256", ObjectLockMode: "COMPLIANCE", ObjectLockRetainUntilDate: new Date("2027-10-06T12:00:00Z")};
function fixture() {
 const rpc = vi.fn(async(name:string):Promise<{data:unknown;error:unknown}> => ({data: name.includes("claim") ? claim : {completed:true,replayed:false}, error:null}));
 const send = vi.fn(async(command:unknown):Promise<unknown> => command instanceof HeadObjectCommand ? head : {});const log=vi.fn();
 return {rpc,send,log,archive:createAuditArchive({rpc} as unknown as SupabaseClient,"private-token","offroad-audit-test","sa-east-1",log,{send},()=>Date.parse("2026-10-06T12:00:00Z"))};
}
describe("immutable audit archive",()=>{
 it("writes exact sealed bytes conditionally and verifies checksum, version, encryption and Object Lock",async()=>{
  const f=fixture();expect(await f.archive.poll()).toBe(true);const command=f.send.mock.calls[0]?.[0] as PutObjectCommand;
  expect(command.input.IfNoneMatch).toBe("*");expect(command.input.Key).toBe(`audit/v1/${claim.organizationId}/${claim.batchId}.json`);
  expect(f.rpc).toHaveBeenCalledWith("worker_ack_audit_batch_v1",expect.objectContaining({p_verified_sha256:sha,p_s3_version_id:head.VersionId}));
 });
 it.each(["ChecksumSHA256","ObjectLockMode","VersionId","ServerSideEncryption"])("never acknowledges a batch with an invalid %s",async field=>{
  const f=fixture();f.send.mockImplementation(async command=>command instanceof HeadObjectCommand?{...head,[field]:field==="VersionId"?"null":"invalid"}:{});
  expect(await f.archive.poll()).toBe(false);expect(f.rpc.mock.calls.some(([name])=>name.includes("ack"))).toBe(false);
 });
 it("refuses tampered payload bytes before making an S3 call",async()=>{
  const f=fixture();f.rpc.mockResolvedValueOnce({data:{...claim,canonicalPayload:'{"private":"do not log"}'},error:null});
  expect(await f.archive.poll()).toBe(false);expect(f.send).not.toHaveBeenCalled();expect(JSON.stringify(f.log.mock.calls)).not.toContain("private");
 });
 it("reconciles only a precondition conflict with a fresh verified HEAD",async()=>{
  const f=fixture();f.send.mockImplementation(async command=>{if(command instanceof PutObjectCommand)throw {$metadata:{httpStatusCode:412}};return head;});
  expect(await f.archive.poll()).toBe(true);expect(f.send).toHaveBeenCalledTimes(2);
 });
 it("does not treat a transport failure as an existing archived object",async()=>{
  const f=fixture();f.send.mockRejectedValue(new Error("private transport detail"));expect(await f.archive.poll()).toBe(false);
  expect(f.send).toHaveBeenCalledTimes(1);expect(JSON.stringify(f.log.mock.calls)).not.toContain("private transport");
 });
});
