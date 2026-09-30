import {describe, expect, it, vi} from "vitest";
vi.mock("server-only", () => ({}));

import {renderedRevisionStillAuthorized, type ServedRead} from "./artifact-route";
import {parseArtifactRead} from "./authorized-artifact-reader";
import {legacyMaterialRead, materialRevisionId, materialSupabase} from "./material-fixtures.test-support";

const initial = legacyMaterialRead({audience: "external", release: "released"});
const parsed = parseArtifactRead(initial);
if (!parsed.ok || parsed.read.withheld) throw new Error("invalid test fixture");
const rendered: ServedRead = parsed.read;

describe("rendered revision authorization", () => {
  it("rechecks the exact rendered revision when the head advances", async () => {
    const rpc = vi.fn().mockResolvedValue({data: {...initial, isHead: false, artifact: {...initial.artifact, headRevisionId: "90000000-0000-4000-8000-000000000001"}}, error: null});
    const db = materialSupabase().client;
    db.rpc = rpc;
    expect(await renderedRevisionStillAuthorized(db as never, rendered)).toBe(true);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_artifact_revision_v1", {p_revision_id: materialRevisionId});
  });

  it.each([
    ["source revoked", legacyMaterialRead({audience: "external", release: "released", restriction: {kind: "source_rights", linkIds: [], unresolvedRevisionIds: [materialRevisionId]}})],
    ["approval revoked", legacyMaterialRead({audience: "external", release: "blocked"})],
    ["approval no longer released", {...initial, release: "internal"}],
    ["manifest mismatch", {...initial, revision: {...initial.revision, manifestFingerprint: "f".repeat(64)}}],
    ["content mismatch", {...initial, revision: {...initial.revision, contentSha256: "f".repeat(64)}}],
    ["revision mismatch", {...initial, revision: {...initial.revision, id: "90000000-0000-4000-8000-000000000001"}}],
    ["work mismatch", {...initial, artifact: {...initial.artifact, workId: "90000000-0000-4000-8000-000000000001"}}],
    ["artifact mismatch", {...initial, artifact: {...initial.artifact, id: "90000000-0000-4000-8000-000000000001"}}],
    ["subject mismatch", {...initial, artifact: {...initial.artifact, subject: "other"}}],
    ["kind mismatch", {...initial, artifact: {...initial.artifact, kind: "work_product"}}],
    ["audience mismatch", legacyMaterialRead({audience: "internal", release: "released"})],
    ["freshness changed", {...initial, freshness: "stale"}],
    ["malformed answer", {}],
  ])("withholds bytes on %s", async (_name, data) => {
    const db = materialSupabase().client;
    db.rpc = async () => ({data, error: null});
    expect(await renderedRevisionStillAuthorized(db as never, rendered)).toBe(false);
  });

  it.each(["rpc error", "transport exception"])("withholds bytes on %s", async mode => {
    const db = materialSupabase().client;
    db.rpc = async () => {
      if (mode === "transport exception") throw new Error("unavailable");
      return {data: null, error: {code: "42501"}};
    };
    expect(await renderedRevisionStillAuthorized(db as never, rendered)).toBe(false);
  });
});
