import {
  aggregateDistributionFeedback,
  nextStepsForResponse,
  recipientFollowUps,
  type DistributionFeedbackSummary,
  type DistributionNextStep,
  type DistributionResponse,
  type DistributionResponseState,
} from "@offroad/market-feedback";

import type {InformationPackItemInput} from "./information-pack-items";

export type DistributionCandidate = {
  targetId: string;
  position: number;
  providerName: string;
  rationale: string;
  recipientKind: "registered_organization" | "directory_entry";
  recipientOrganizationId: string | null;
  recipientDirectoryId: string | null;
  deliverable: boolean;
  shareId: string | null;
  sharedRevisionId: string | null;
  preparationId: string | null;
  preparationStatus: "prepared" | "released" | null;
  candidateFit: "eligible" | "hypothesis" | null;
};

export type DistributionRecipientView = DistributionCandidate & {
  responseState: DistributionResponseState;
  respondedAt: string | null;
  refersToCurrentRevision: boolean;
  availableNextSteps: readonly DistributionNextStep[];
  lastNextStep: {code: DistributionNextStep; note: string | null; recordedAt: string} | null;
  reads: number;
  lastReadAt: string | null;
};

export type DistributionPackView = {
  id: string;
  revisionNumber: number;
  packFingerprint: string;
  issuedAt: string;
  items: Array<{id: string; deliverableId: string; format: string; templateKey: string; templateVersion: string}>;
};

export type DistributionAuthorizationView = {
  id: string;
  packRevisionId: string;
  packFingerprint: string;
  identityPolicy: "identified_restricted" | "blind_initial";
  waveLimit: number;
  policyVersion: string;
  consentStatement: string;
  consentedAt: string;
  coversCurrentRevision: boolean;
};

export type DistributionView = {
  currentPack: DistributionPackView | null;
  revisionCount: number;
  packMatchesApprovedMaterial: boolean;
  authorization: DistributionAuthorizationView | null;
  recipients: DistributionRecipientView[];
  feedback: DistributionFeedbackSummary;
  canAuthorize: boolean;
};

type RevisionRow = {
  id: string;
  revision_number: number;
  pack_fingerprint: string;
  created_at: string;
  status: string;
};
type ItemRow = {
  id: string;
  pack_revision_id: string;
  deliverable_id: string;
  format: string;
  artifact_fingerprint: string;
  template_key: string;
  template_version: string;
  template_origin: string;
  template_fingerprint: string | null;
  position: number;
};
type AuthorizationRow = {
  id: string;
  pack_revision_id: string;
  pack_fingerprint: string;
  identity_policy: string;
  wave_limit: number;
  policy_version: string;
  consent_statement: string;
  consented_at: string;
  status: string;
};
type ShareRow = {id: string; recipient_organization_id: string | null; pack_revision_id: string; status: string};
type AccessRow = {share_id: string; accessed_at: string};
type NextStepRow = {share_id: string; step_code: string; note: string | null; recorded_at: string};

/**
 * One read-only view of the distribution of a project: the current pack, whether it still matches
 * the approved material, the live authorization, one row per shortlisted recipient with its answer
 * and next step, and the aggregated market feedback for the next revision.
 */
export function buildDistributionView(input: {
  accessEvents: readonly AccessRow[];
  authorizations: readonly AuthorizationRow[];
  candidates: readonly DistributionCandidate[];
  items: readonly ItemRow[];
  nextSteps: readonly NextStepRow[];
  proposedItems: readonly InformationPackItemInput[];
  responses: readonly DistributionResponse[];
  revisions: readonly RevisionRow[];
  representationVerified: boolean;
  shares: readonly ShareRow[];
}): DistributionView {
  const current = input.revisions.find((revision) => revision.status === "current") ?? null;
  const currentItems = current
    ? [...input.items].filter((item) => item.pack_revision_id === current.id).sort((left, right) => left.position - right.position)
    : [];
  const currentPack: DistributionPackView | null = current ? {
    id: current.id,
    revisionNumber: current.revision_number,
    packFingerprint: current.pack_fingerprint,
    issuedAt: current.created_at,
    items: currentItems.map((item) => ({
      id: item.id,
      deliverableId: item.deliverable_id,
      format: item.format,
      templateKey: item.template_key,
      templateVersion: item.template_version,
    })),
  } : null;

  const activeAuthorization = input.authorizations.find((row) => row.status === "active") ?? null;
  const authorization: DistributionAuthorizationView | null = activeAuthorization ? {
    id: activeAuthorization.id,
    packRevisionId: activeAuthorization.pack_revision_id,
    packFingerprint: activeAuthorization.pack_fingerprint,
    identityPolicy: activeAuthorization.identity_policy === "blind_initial" ? "blind_initial" : "identified_restricted",
    waveLimit: activeAuthorization.wave_limit,
    policyVersion: activeAuthorization.policy_version,
    consentStatement: activeAuthorization.consent_statement,
    consentedAt: activeAuthorization.consented_at,
    coversCurrentRevision: Boolean(current) && activeAuthorization.pack_revision_id === current!.id,
  } : null;

  const shareRefs = input.shares
    .filter((share) => share.status === "active" && share.recipient_organization_id !== null)
    .map((share) => ({
      shareId: share.id,
      recipientOrganizationId: share.recipient_organization_id!,
      packRevisionId: share.pack_revision_id,
    }));
  const followUps = new Map(recipientFollowUps({
    shares: shareRefs,
    responses: input.responses,
    currentPackRevisionId: current?.id ?? null,
  }).map((followUp) => [followUp.shareId, followUp]));

  const reads = new Map<string, {count: number; last: string}>();
  for (const event of input.accessEvents) {
    const entry = reads.get(event.share_id);
    reads.set(event.share_id, {
      count: (entry?.count ?? 0) + 1,
      last: !entry || entry.last < event.accessed_at ? event.accessed_at : entry.last,
    });
  }
  const latestStep = new Map<string, NextStepRow>();
  for (const step of [...input.nextSteps].sort((left, right) => left.recorded_at.localeCompare(right.recorded_at))) {
    latestStep.set(step.share_id, step);
  }

  const recipients: DistributionRecipientView[] = [...input.candidates]
    .sort((left, right) => left.position - right.position)
    .map((candidate) => {
      const followUp = candidate.shareId ? followUps.get(candidate.shareId) : undefined;
      const responseState = followUp?.responseState ?? "no_response_yet";
      const step = candidate.shareId ? latestStep.get(candidate.shareId) : undefined;
      const read = candidate.shareId ? reads.get(candidate.shareId) : undefined;
      return {
        ...candidate,
        responseState,
        respondedAt: followUp?.respondedAt ?? null,
        refersToCurrentRevision: followUp?.refersToCurrentRevision ?? Boolean(candidate.sharedRevisionId && candidate.sharedRevisionId === current?.id),
        availableNextSteps: followUp?.availableNextSteps ?? nextStepsForResponse(responseState),
        lastNextStep: step && isNextStep(step.step_code)
          ? {code: step.step_code, note: step.note, recordedAt: step.recorded_at}
          : null,
        reads: read?.count ?? 0,
        lastReadAt: read?.last ?? null,
      };
    });

  return {
    currentPack,
    revisionCount: input.revisions.length,
    packMatchesApprovedMaterial: packMatchesItems(currentItems, input.proposedItems),
    authorization,
    recipients,
    feedback: aggregateDistributionFeedback({shares: shareRefs, responses: input.responses}),
    canAuthorize: input.representationVerified && Boolean(current) && input.candidates.some((candidate) => candidate.deliverable),
  };
}

function isNextStep(value: string): value is DistributionNextStep {
  return [
    "prepare_information_answer",
    "revise_structure",
    "schedule_conversation",
    "keep_on_hold",
    "close_without_continuation",
  ].includes(value);
}

/** The recorded revision still shows the approved material when every exported file matches. */
function packMatchesItems(
  recorded: readonly ItemRow[],
  proposed: readonly InformationPackItemInput[],
): boolean {
  if (recorded.length !== proposed.length) return false;
  return recorded.every((item, index) => {
    const other = proposed[index];
    return Boolean(other)
      && item.deliverable_id === other!.deliverableId
      && item.format === other!.format
      && item.artifact_fingerprint === other!.artifactFingerprint
      && item.template_key === other!.templateKey
      && item.template_version === other!.templateVersion
      && item.template_origin === other!.templateOrigin
      && (item.template_fingerprint ?? null) === (other!.templateFingerprint ?? null);
  });
}
