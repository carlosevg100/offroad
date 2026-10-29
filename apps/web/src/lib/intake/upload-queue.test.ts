import {describe, expect, it, vi} from "vitest";

import {uploadDocuments} from "./upload-client";

function client(fail?: {upload?: number; register?: number}) {
  let uploadIndex = 0;
  let registerIndex = 0;
  const upload = vi.fn(async (path: string) => {
    uploadIndex += 1;
    if (uploadIndex === fail?.upload) throw new Error("network unavailable");
    return {error: null, path};
  });
  const remove = vi.fn(async () => ({error: null}));
  const rpc = vi.fn(async (_name: string, input: Record<string, unknown>) => {
    registerIndex += 1;
    if (registerIndex === fail?.register) throw new Error("registration response lost");
    return {data: {id: input.p_document_id, original_name: input.p_original_name, byte_size: input.p_byte_size, duplicate: false}, error: null};
  });
  return {upload, remove, rpc, value: {storage: {from: () => ({upload, remove})}, rpc}};
}

const files = (count: number) => Array.from({length: count}, (_, i) => new File([`conta;valor\nreceita;${i + 1}\n`], `balancete-${i + 1}.csv`, {type: "text/csv"}));
const scope = {organizationId: "organization", userId: "user", scope: {kind: "session" as const, sessionId: "session"}};

describe("a selected folder is completely accounted for", () => {
  it("uploads every selected document beyond the old twenty-file cutoff, in arrival order", async () => {
    const stub = client();
    const selected = files(31);
    const result = await uploadDocuments({...scope, supabase: stub.value as never, files: selected});
    expect(result.failure).toBeNull();
    expect(result.uploaded.map((file) => file.original_name)).toEqual(selected.map((file) => file.name));
    expect(stub.upload).toHaveBeenCalledTimes(31);
    expect(stub.rpc).toHaveBeenCalledTimes(31);
    expect(stub.remove).not.toHaveBeenCalled();
  });

  it("continues with the rest of the selection when one storage request rejects", async () => {
    const stub = client({upload: 2});
    const result = await uploadDocuments({...scope, supabase: stub.value as never, files: files(4)});
    expect(result.failure).toBe("upload");
    expect(result.failed).toEqual([{original_name: "balancete-2.csv", reason: "upload"}]);
    expect(result.uploaded.map((file) => file.original_name)).toEqual(["balancete-1.csv", "balancete-3.csv", "balancete-4.csv"]);
    expect(stub.upload).toHaveBeenCalledTimes(4);
  });

  it("does not delete an object after an uncertain registration response and still uploads later files", async () => {
    const stub = client({register: 2});
    const result = await uploadDocuments({...scope, supabase: stub.value as never, files: files(4)});
    expect(result.failure).toBe("register");
    expect(result.failed).toEqual([{original_name: "balancete-2.csv", reason: "register"}]);
    expect(result.uploaded.map((file) => file.original_name)).toEqual(["balancete-1.csv", "balancete-3.csv", "balancete-4.csv"]);
    expect(stub.upload).toHaveBeenCalledTimes(4);
    // Registration might have committed before its response was lost.
    expect(stub.remove).not.toHaveBeenCalled();
  });

  it("names every refused file and still attempts the valid ones", async () => {
    const stub = client();
    const selected = [new File(["MZ"], "programa.exe"), ...files(1), new File([], "vazio.pdf")];
    const result = await uploadDocuments({...scope, supabase: stub.value as never, files: selected});
    expect(result.failed).toEqual([{original_name: "programa.exe", reason: "invalid"}, {original_name: "vazio.pdf", reason: "invalid"}]);
    expect(result.uploaded.map((file) => file.original_name)).toEqual(["balancete-1.csv"]);
    expect(stub.upload).toHaveBeenCalledTimes(1);
  });

  it.each([
    {data: null, error: {message: "gateway timeout"}},
    {data: {id: "committed"}, error: null},
  ])("preserves the uploaded bytes when registration is ambiguous: %j", async (response) => {
    const stub = client();
    stub.rpc.mockResolvedValueOnce(response as never);
    const result = await uploadDocuments({...scope, supabase: stub.value as never, files: files(2)});
    expect(result.failed).toEqual([{original_name: "balancete-1.csv", reason: "register"}]);
    expect(result.uploaded).toHaveLength(1);
    expect(stub.remove).not.toHaveBeenCalled();
  });

  it.each([false, true])("recovers its exact registered source after a lost response (thrown: %s)", async (thrown) => {
    const stub = client({register: thrown ? 2 : undefined});
    if (!thrown) stub.rpc.mockResolvedValueOnce({data: null, error: {message: "response lost"}} as never);
    const eq = vi.fn().mockReturnThis();
    const query = {select: vi.fn().mockReturnThis(), eq, maybeSingle: vi.fn(async () => {
      const path = stub.upload.mock.calls.at(-1)?.[0];
      const input = stub.rpc.mock.calls.at(-1)![1];
      return {error: null, data: {id: input.p_document_id, original_name: input.p_original_name, byte_size: input.p_byte_size, object_path: path, sha256: input.p_sha256}};
    })};
    const supabase = {...stub.value, from: () => query};
    const selected = files(3);
    const result = await uploadDocuments({...scope, supabase: supabase as never, files: selected});
    expect(result.failure).toBeNull();
    expect(result.failed).toEqual([]);
    expect(result.uploaded.map((file) => file.original_name)).toEqual(selected.map((file) => file.name));
    expect(eq).toHaveBeenCalledWith("organization_id", "organization");
    expect(eq).toHaveBeenCalledWith("intake_session_id", "session");
    expect(stub.remove).not.toHaveBeenCalled();
  });

  it.each(["object_path", "sha256"])("refuses a recovery with a different %s", async (field) => {
    const stub = client({register: 1});
    const query = {select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => {
      const input = stub.rpc.mock.calls[0]![1];
      return {error: null, data: {id: input.p_document_id, original_name: input.p_original_name, byte_size: input.p_byte_size,
        object_path: stub.upload.mock.calls[0]![0], sha256: input.p_sha256, [field]: "different-source"}};
    })};
    const result = await uploadDocuments({...scope, supabase: {...stub.value, from: () => query} as never, files: files(1)});
    expect(result.failure).toBe("register");
    expect(result.uploaded).toEqual([]);
    expect(stub.remove).not.toHaveBeenCalled();
  });

  it("keeps a confirmed duplicate accepted even when temporary cleanup rejects", async () => {
    const stub = client();
    stub.rpc.mockResolvedValueOnce({data: {id: "existing-source", original_name: "balancete-1.csv", byte_size: 10, duplicate: true}, error: null});
    stub.remove.mockRejectedValueOnce(new Error("cleanup response lost"));
    const result = await uploadDocuments({...scope, supabase: stub.value as never, files: files(2)});
    expect(result.failure).toBeNull();
    expect(result.failed).toEqual([]);
    expect(result.duplicateCount).toBe(1);
    expect(result.uploaded.map((file) => file.original_name)).toEqual(["balancete-2.csv"]);
  });
});
