import {describe, expect, it} from "vitest";

import {readOdblRelease, type OdblRpc} from "./odbl-release";

const payload = '{"release":"1"}\n';
const served = {releaseNumber: 1, state: "served", publishedAt: "2026-10-22T12:00:00.000000Z", dataBase: "2026-10-22", sha256: "a".repeat(64),
  byteSize: new TextEncoder().encode(payload).length, payload};
const rpc = (data: unknown, error: unknown = null): OdblRpc => async (name, args) => {
  expect(name).toBe("market_odbl_release_v1");
  expect(args).toEqual({p_release: null});
  return {data, error};
};

describe("readOdblRelease", () => {
  it("returns a served edition with its exact payload", async () => {
    expect(await readOdblRelease(rpc(served))).toEqual(served);
  });
  it("tells missing from withdrawn", async () => {
    expect(await readOdblRelease(rpc(null))).toEqual({state: "missing"});
    expect(await readOdblRelease(rpc({releaseNumber: 2, state: "withdrawn"}))).toEqual({state: "withdrawn", releaseNumber: 2});
  });
  it("treats a failure, an unknown shape or a payload of the wrong size as an error, never as missing", async () => {
    await expect(readOdblRelease(rpc(null, {message: "x"}))).rejects.toThrow("market_odbl_reader_failed");
    await expect(readOdblRelease(rpc({state: "served"}))).rejects.toThrow("market_odbl_reader_shape");
    await expect(readOdblRelease(rpc({...served, byteSize: 3}))).rejects.toThrow("market_odbl_payload_invalid");
    await expect(readOdblRelease(rpc({...served, payload: '{"release":"1"}', byteSize: 15}))).rejects.toThrow("market_odbl_payload_invalid");
    await expect(readOdblRelease(null)).rejects.toThrow("market_odbl_reader_unconfigured");
  });
});
