import {describe, expect, it} from "vitest";

import {buildDistributionView, type DistributionCandidate} from "./distribution-view";
import type {InformationPackItemInput} from "./information-pack-items";

const revisionId = "50000000-0000-4000-8000-000000000002";
const previousRevisionId = "50000000-0000-4000-8000-000000000001";
const shareId = "60000000-0000-4000-8000-000000000001";
const recipientOrg = "20000000-0000-4000-8000-000000000002";
const fingerprint = "a".repeat(64);
const artifact = "b".repeat(64);

const proposed: InformationPackItemInput[] = [{
  deliverableId: "teaser",
  format: "pdf",
  artifactFingerprint: artifact,
  templateKey: "offroad-house",
  templateVersion: "2026.09.07-v1",
  templateOrigin: "offroad_house",
  sourceResultIds: [],
  title: "Teaser",
}];

const items = [{
  id: "70000000-0000-4000-8000-000000000001",
  pack_revision_id: revisionId,
  deliverable_id: "teaser",
  format: "pdf",
  artifact_fingerprint: artifact,
  template_key: "offroad-house",
  template_version: "2026.09.07-v1",
  template_origin: "offroad_house",
  template_fingerprint: null,
  position: 1,
}];

const revisions = [
  {id: revisionId, revision_number: 2, pack_fingerprint: fingerprint, created_at: "2026-09-11T12:00:00.000Z", status: "current"},
  {id: previousRevisionId, revision_number: 1, pack_fingerprint: "c".repeat(64), created_at: "2026-09-10T12:00:00.000Z", status: "superseded"},
];

const authorizations = [{
  id: "80000000-0000-4000-8000-000000000001",
  pack_revision_id: revisionId,
  pack_fingerprint: fingerprint,
  identity_policy: "blind_initial",
  wave_limit: 3,
  policy_version: "policy-v1",
  consent_statement: "A companhia autoriza disponibilizar este pacote.",
  consented_at: "2026-09-11T12:30:00.000Z",
  status: "active",
}];

const shares = [{id: shareId, recipient_organization_id: recipientOrg, pack_revision_id: revisionId, status: "active"}];

const candidates: DistributionCandidate[] = [
  {
    targetId: "90000000-0000-4000-8000-000000000001",
    position: 1,
    providerName: "Financier A",
    rationale: "Mandato confirmado.",
    recipientKind: "registered_organization",
    recipientOrganizationId: recipientOrg,
    recipientDirectoryId: "a0000000-0000-4000-8000-000000000001",
    deliverable: true,
    shareId,
    sharedRevisionId: revisionId,
    preparationId: "b0000000-0000-4000-8000-000000000001",
    preparationStatus: "prepared",
    candidateFit: "eligible",
  },
  {
    targetId: "90000000-0000-4000-8000-000000000002",
    position: 2,
    providerName: "Unclaimed fund",
    rationale: "Atuacao historica observada.",
    recipientKind: "directory_entry",
    recipientOrganizationId: null,
    recipientDirectoryId: "a0000000-0000-4000-8000-000000000002",
    deliverable: false,
    shareId: null,
    sharedRevisionId: null,
    preparationId: null,
    preparationStatus: null,
    candidateFit: null,
  },
];

function build(overrides: Partial<Parameters<typeof buildDistributionView>[0]> = {}) {
  return buildDistributionView({
    accessEvents: [],
    authorizations,
    candidates,
    items,
    nextSteps: [],
    proposedItems: proposed,
    representationVerified: true,
    responses: [],
    revisions,
    shares,
    ...overrides,
  });
}

describe("distribution view", () => {
  it("shows the current revision, keeps the previous one and says the pack still matches the material", () => {
    const view = build();
    expect(view.currentPack).toMatchObject({revisionNumber: 2, packFingerprint: fingerprint});
    expect(view.revisionCount).toBe(2);
    expect(view.packMatchesApprovedMaterial).toBe(true);
    expect(view.authorization).toMatchObject({identityPolicy: "blind_initial", waveLimit: 3, coversCurrentRevision: true});
  });

  it("asks for a new revision when the approved material changed", () => {
    const view = build({proposedItems: [{...proposed[0]!, artifactFingerprint: "d".repeat(64)}]});
    expect(view.packMatchesApprovedMaterial).toBe(false);
  });

  it("treats a recipient without an answer as awaiting one and never as a decline", () => {
    const view = build();
    expect(view.recipients[0]).toMatchObject({responseState: "no_response_yet", reads: 0});
    expect(view.recipients[0]?.availableNextSteps).toEqual(["keep_on_hold", "schedule_conversation"]);
    expect(view.feedback.awaitingCount).toBe(1);
    expect(view.feedback.respondedCount).toBe(0);
  });

  it("keeps a recipient with no product access out of the deliverable set", () => {
    const view = build();
    expect(view.recipients[1]).toMatchObject({deliverable: false, shareId: null});
  });

  it("counts the reads of the shared pack and the issuer next step", () => {
    const view = build({
      accessEvents: [
        {share_id: shareId, accessed_at: "2026-09-11T13:00:00.000Z"},
        {share_id: shareId, accessed_at: "2026-09-11T14:00:00.000Z"},
      ],
      nextSteps: [
        {share_id: shareId, step_code: "keep_on_hold", note: null, recorded_at: "2026-09-11T13:30:00.000Z"},
        {share_id: shareId, step_code: "prepare_information_answer", note: "detalhe da carteira", recorded_at: "2026-09-11T15:00:00.000Z"},
      ],
    });
    expect(view.recipients[0]).toMatchObject({reads: 2, lastReadAt: "2026-09-11T14:00:00.000Z"});
    expect(view.recipients[0]?.lastNextStep).toMatchObject({code: "prepare_information_answer"});
  });

  it("marks an answer that refers to a previous revision and aggregates the objections", () => {
    const view = build({
      responses: [{
        id: "c0000000-0000-4000-8000-000000000001",
        shareId,
        packRevisionId: previousRevisionId,
        recipientOrganizationId: recipientOrg,
        responseState: "needs_information",
        note: "precisamos do detalhe",
        requestedConditions: [{code: "pool_detail_by_debtor"}],
        termObjections: [{code: "tenor_too_long"}],
        occurredAt: "2026-09-11T16:00:00.000Z",
      }],
    });
    expect(view.recipients[0]).toMatchObject({responseState: "needs_information", refersToCurrentRevision: false});
    expect(view.feedback.objectedTerms).toEqual([{code: "tenor_too_long", count: 1, shareIds: [shareId]}]);
    expect(view.feedback.requestedConditions[0]?.code).toBe("pool_detail_by_debtor");
  });

  it("does not offer the authorization without verified representation", () => {
    expect(build({representationVerified: false}).canAuthorize).toBe(false);
    expect(build().canAuthorize).toBe(true);
  });
});
