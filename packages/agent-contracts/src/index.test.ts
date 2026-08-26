import {describe, expect, it} from "vitest";
import {createAgentChangeProposal, proposalIsCurrent} from "./index";

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  caseId: "22222222-2222-4222-8222-222222222222",
  baseManifestFingerprint: "a".repeat(64),
  target: "operation_brief" as const,
  title: "Ajustar a descrição da destinação",
  rationale: "A formulação proposta reflete o documento de origem com maior precisão.",
  impactSummary: "Atualiza o briefing e recompila os materiais dependentes.",
  patches: [{operation: "set" as const, path: "/useOfProceeds", value: "Expansão de três lojas", previousFingerprint: null}],
  evidence: [{kind: "document_anchor" as const, id: "document-1:page-2"}],
  recompute: ["claims" as const, "materials" as const, "language_conduct" as const],
  proposedBy: "offroad_agent" as const,
  proposedAt: "2026-08-26T12:00:00.000Z",
  expiresAt: "2026-08-27T12:00:00.000Z",
};

describe("agent change contracts", () => {
  it("binds every proposal to the exact case snapshot and impact preview", () => {
    const proposal = createAgentChangeProposal(base);
    expect(proposal.proposalFingerprint).toHaveLength(64);
    expect(proposal.recompute).toEqual(["claims", "materials", "language_conduct"]);
    expect(proposalIsCurrent(proposal, {manifestFingerprint: "a".repeat(64), now: new Date("2026-08-26T13:00:00.000Z")})).toBe(true);
  });

  it("invalidates stale or expired proposals", () => {
    const proposal = createAgentChangeProposal(base);
    expect(proposalIsCurrent(proposal, {manifestFingerprint: "b".repeat(64), now: new Date("2026-08-26T13:00:00.000Z")})).toBe(false);
    expect(proposalIsCurrent(proposal, {manifestFingerprint: "a".repeat(64), now: new Date("2026-08-28T13:00:00.000Z")})).toBe(false);
  });

  it("does not let public context alone rewrite a numerical case value", () => {
    expect(() => createAgentChangeProposal({
      ...base,
      patches: [{operation: "set", path: "/requestedAmount", value: 50_000_000, previousFingerprint: null}],
      evidence: [{kind: "public_source", id: "source-1"}],
    })).toThrow();
  });
});
