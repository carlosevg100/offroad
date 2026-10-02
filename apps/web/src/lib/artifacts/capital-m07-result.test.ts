import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {describe, expect, it, vi} from "vitest";

vi.mock("server-only", () => ({}));

import type {Database} from "@/types/database";

import {isCapitalM07Projection, readCapitalM07Result} from "./capital-m07-result";

const organizationId = "10000000-0000-4000-8000-000000000001";
const revisionId = "20000000-0000-4000-8000-000000000001";
const recipeId = "30000000-0000-4000-8000-000000000001";
// Transport fixture only; the page still parses the complete financial product contract.
const content = {schemaVersion: "origination-senior-readout.v3", synthetic: true};
const text = JSON.stringify(content);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const projection = {schemaVersion: "capital-m07-projection.v1", revisionId, recipeId,
  finalFingerprint: "a".repeat(64), physicalSha256: hash(text), byteLength: Buffer.byteLength(text)};
function fixture(options: {text?: string; headers?: Record<string, string>; error?: unknown; data?: unknown} = {}) {
  const headers = {"content-type": "application/octet-stream", "cache-control": "private, no-store",
    "x-offroad-revision-id": revisionId, "x-offroad-recipe-id": recipeId, "x-offroad-final-fingerprint": projection.finalFingerprint, "x-offroad-allocation-id": recipeId, "x-offroad-object-id": organizationId,
    "x-offroad-storage-version": "storage-version-1", "x-offroad-payload-sha256": projection.physicalSha256,
    "x-offroad-byte-length": String(projection.byteLength), ...options.headers};
  const invoke = vi.fn().mockResolvedValue({error: options.error ?? null,
    data: Object.hasOwn(options, "data") ? options.data : new Blob([options.text ?? text]),
    response: new Response(null, {headers})});
  return {invoke, supabase: {functions: {invoke}} as unknown as SupabaseClient<Database>};
}
const input = {organizationId, projection};
const denied = {ok: false, error: "capital_m07_result_withheld"};

describe("human M07 retained result read", () => {
  it("uses only the exact revision and current workspace without a job lease or capability", async () => {
    const f = fixture();
    expect(await readCapitalM07Result(f.supabase, input)).toEqual({ok: true, content, revisionId, recipeId,
      finalFingerprint: projection.finalFingerprint});
    expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read", {method: "POST",
      body: {kind: "m07_result", revisionId}, headers: {"x-offroad-workspace": organizationId}, timeout: 10000});
  });
  it.each([null, {...projection, path: "caller/path"}, {...projection, byteLength: 1048577}, {...projection, revisionId: "other"},
    {...projection, physicalSha256: "x".repeat(64)}])("rejects malformed or expanded permanent metadata before transport (%j)", async value => {
    const f = fixture(); expect(await readCapitalM07Result(f.supabase, {...input, projection: value})).toEqual(denied);
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([
    {"x-offroad-recipe-id": revisionId}, {"x-offroad-final-fingerprint": "b".repeat(64)},
    {"x-offroad-revision-id": recipeId}, {"x-offroad-payload-sha256": "b".repeat(64)},
    {"x-offroad-byte-length": "1"}, {"x-offroad-object-id": "not-uuid"}, {"x-offroad-allocation-id": "not-uuid"},
    {"x-offroad-storage-version": ""}, {"cache-control": "public, max-age=3600"}, {"content-type": "application/json"},
  ])("rejects a mismatched or cacheable physical response (%j)", async headers => {
    const f = fixture({headers}); expect(await readCapitalM07Result(f.supabase, input)).toEqual(denied);
  });
  it("rehashes actual bytes even when transport headers claim the expected hash", async () => {
    const f = fixture({text: text.replace("true", "null")});
    expect(await readCapitalM07Result(f.supabase, input)).toEqual(denied);
  });
  it.each(["{not-json}", "null", "[]", '{"schemaVersion":"origination-senior-readout.v2"}'])("rejects invalid final JSON (%s)", async badText => {
    const pin = {...projection, physicalSha256: hash(badText), byteLength: Buffer.byteLength(badText)};
    const f = fixture({text: badText, headers: {"x-offroad-payload-sha256": pin.physicalSha256, "x-offroad-byte-length": String(pin.byteLength)}});
    expect(await readCapitalM07Result(f.supabase, {...input, projection: pin})).toEqual(denied);
  });
  it("never renders an inline legacy body after current authority denies the retained body", async () => {
    const f = fixture({error: {message: "denied"}, data: content});
    expect(await readCapitalM07Result(f.supabase, input)).toEqual(denied);
  });
  it("does not expose transport errors, paths or secrets", async () => {
    const f = fixture(); f.invoke.mockRejectedValue(new Error("secret object path"));
    expect(await readCapitalM07Result(f.supabase, input)).toEqual(denied);
  });
  it("keeps a malformed native projection on the native refusal path", () => {
    expect(isCapitalM07Projection({...projection, path: "forbidden"})).toBe(true);
    expect(isCapitalM07Projection(content)).toBe(false);
  });
});
