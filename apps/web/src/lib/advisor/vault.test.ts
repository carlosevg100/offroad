import {describe, expect, it} from "vitest";
import {vaultVersionInput, vaultProposalInput, vaultFailure} from "./vault";
const id = "a5120000-0000-4000-9000-000000000001";
const base = {locale: "pt-BR", entryId: id, versionId: id, expectedVersionId: null, kind: "directive", title: "Review", text: "Review this direction", referenceId: null, sourceVersionIds: []};
describe("human vault review boundary", () => {
  it("requires one typed reference or directive and bounded content", () => {
    expect(vaultVersionInput.safeParse(base).success).toBe(true);
    for (const patch of [{text: " "}, {text: null}, {referenceId: id}, {title: " "}, {text: "x".repeat(32001)}]) expect(vaultVersionInput.safeParse({...base, ...patch}).success).toBe(false);
    expect(vaultVersionInput.safeParse({...base, kind: "source", text: null, referenceId: id}).success).toBe(true);
    expect(vaultVersionInput.safeParse({...base, kind: "source"}).success).toBe(false);
  });
  it("requires the exact version fingerprint, scope and purpose for review", () => {
    const p = {locale: "pt-BR", requestId: id, versionId: id, fingerprint: "a".repeat(64), expectedPublicationId: null, workScopeId: null, purpose: "analysis", reason: "Reviewed version"};
    expect(vaultProposalInput.safeParse(p).success).toBe(true);
    for (const patch of [{fingerprint: "latest"}, {purpose: "any"}, {reason: ""}, {workScopeId: "organization"}]) expect(vaultProposalInput.safeParse({...p, ...patch}).success).toBe(false);
  });
  it("never exposes database exception content", () => {
    expect(vaultFailure({code: "42501"})).toEqual({ok: false, error: "denied"});
    expect(vaultFailure({code: "40001"})).toEqual({ok: false, error: "stale"});
    expect(vaultFailure({code: "XX000"})).toEqual({ok: false, error: "save"});
  });
});
