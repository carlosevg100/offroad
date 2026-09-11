import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";

import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import {PrivateDistributionWork} from "./private-distribution-work";
import type {DistributionView} from "./distribution-view";

vi.mock("@/app/[locale]/app/projects/[projectId]/distribution-actions", () => ({
  authorizeProjectPackDistribution: vi.fn(),
  prepareProjectQualifiedContact: vi.fn(),
  recordProjectDistributionNextStep: vi.fn(),
  recordProjectInformationPack: vi.fn(),
  releaseProjectQualifiedContact: vi.fn(),
  revokeProjectPackDistribution: vi.fn(),
}));

const projectId = "30000000-0000-4000-8000-000000000001";
const sessionId = "40000000-0000-4000-8000-000000000001";
const fingerprint = "a".repeat(64);

const baseView: DistributionView = {
  currentPack: {
    id: "50000000-0000-4000-8000-000000000002",
    revisionNumber: 2,
    packFingerprint: fingerprint,
    issuedAt: "2026-09-11T12:00:00.000Z",
    items: [{
      id: "70000000-0000-4000-8000-000000000001",
      deliverableId: "teaser",
      format: "pdf",
      templateKey: "offroad-house",
      templateVersion: "2026.09.07-v1",
    }],
  },
  revisionCount: 2,
  packMatchesApprovedMaterial: true,
  authorization: null,
  recipients: [{
    targetId: "90000000-0000-4000-8000-000000000001",
    position: 1,
    providerName: "Financier A",
    rationale: "Mandato confirmado com ticket compativel para esta estrutura.",
    recipientKind: "registered_organization",
    recipientOrganizationId: "20000000-0000-4000-8000-000000000002",
    recipientDirectoryId: null,
    deliverable: true,
    shareId: null,
    sharedRevisionId: null,
    preparationId: null,
    preparationStatus: null,
    candidateFit: null,
    responseState: "no_response_yet",
    respondedAt: null,
    refersToCurrentRevision: false,
    availableNextSteps: ["keep_on_hold", "schedule_conversation"],
    lastNextStep: null,
    reads: 0,
    lastReadAt: null,
  }],
  feedback: {
    version: "2026.09.11-v1",
    respondedCount: 0,
    awaitingCount: 1,
    interestedCount: 0,
    needsInformationCount: 0,
    declinedCount: 0,
    objectedTerms: [],
    requestedConditions: [],
    ticketRanges: [],
    tenorMonths: null,
    pricingRanges: [],
    fingerprint: "b".repeat(64),
  },
  canAuthorize: true,
};

function render(locale: "pt-BR" | "en-US", distribution: DistributionView) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? pt : en}>
      <PrivateDistributionWork distribution={distribution} locale={locale} projectId={projectId} sessionId={sessionId} />
    </NextIntlClientProvider>,
  );
}

describe("authorized distribution on the issuer side", () => {
  it.each(["pt-BR", "en-US"] as const)("offers the authorization with a consent record in %s", (locale) => {
    const messages = locale === "pt-BR" ? pt : en;
    const html = render(locale, baseView);
    expect(html).toContain('data-testid="authorized-distribution"');
    expect(html).toContain(messages.AuthorizedDistribution.packRevision.replace("{number}", "2"));
    expect(html).toContain(messages.AuthorizedDistribution.consentAttestation);
    expect(html).toContain('name="consent_statement"');
    expect(html).toContain('value="registered_organization|20000000-0000-4000-8000-000000000002|Financier A"');
    expect(html).toContain(messages.AuthorizedDistribution.boundary);
  });

  it("never says approval, funding or closing in either catalogue", () => {
    const forbidden = /aprova|financiamento garantido|funding|approval|closing/i;
    for (const value of [
      ...Object.values(pt.AuthorizedDistribution.nextStep),
      ...Object.values(en.AuthorizedDistribution.nextStep),
      ...Object.values(pt.AuthorizedDistribution.responseState),
      ...Object.values(en.AuthorizedDistribution.responseState),
    ]) {
      expect(value).not.toMatch(forbidden);
    }
  });

  it("asks for a new revision when the approved material changed", () => {
    const html = render("pt-BR", {...baseView, packMatchesApprovedMaterial: false});
    expect(html).toContain(pt.AuthorizedDistribution.packOutdated);
    expect(html).toContain(pt.AuthorizedDistribution.packRecord);
  });

  it("blocks the authorization without verified representation", () => {
    const html = render("pt-BR", {...baseView, canAuthorize: false});
    expect(html).toContain(pt.AuthorizedDistribution.authorizeBlocked);
    expect(html).toContain("disabled=\"\"");
  });

  it("shows the live authorization, the recipients and the market answers once authorized", () => {
    const html = render("pt-BR", {
      ...baseView,
      authorization: {
        id: "80000000-0000-4000-8000-000000000001",
        packRevisionId: baseView.currentPack!.id,
        packFingerprint: fingerprint,
        identityPolicy: "blind_initial",
        waveLimit: 3,
        policyVersion: "policy-v1",
        consentStatement: "A companhia autoriza disponibilizar este pacote.",
        consentedAt: "2026-09-11T12:30:00.000Z",
        coversCurrentRevision: true,
      },
      recipients: [{
        ...baseView.recipients[0]!,
        shareId: "60000000-0000-4000-8000-000000000001",
        sharedRevisionId: baseView.currentPack!.id,
        preparationId: "b0000000-0000-4000-8000-000000000001",
        preparationStatus: "prepared",
        candidateFit: "eligible",
        responseState: "needs_information",
        respondedAt: "2026-09-11T16:00:00.000Z",
        refersToCurrentRevision: true,
        reads: 2,
        lastReadAt: "2026-09-11T14:00:00.000Z",
      }],
      feedback: {
        ...baseView.feedback,
        respondedCount: 1,
        awaitingCount: 0,
        needsInformationCount: 1,
        objectedTerms: [{code: "tenor_too_long", count: 1, shareIds: ["60000000-0000-4000-8000-000000000001"]}],
        requestedConditions: [{code: "pool_detail_by_debtor", count: 1, shareIds: ["60000000-0000-4000-8000-000000000001"]}],
      },
    });
    expect(html).toContain(pt.AuthorizedDistribution.identityPolicy.blind_initial);
    expect(html).toContain(pt.AuthorizedDistribution.responseState.needs_information);
    expect(html).toContain(pt.AuthorizedDistribution.reads.replace("{count}", "2"));
    expect(html).toContain(pt.AuthorizedDistribution.releaseAttestation);
    expect(html).toContain(pt.AuthorizedDistribution.objection.tenor_too_long);
    expect(html).toContain(pt.AuthorizedDistribution.condition.pool_detail_by_debtor);
  });

  it("marks a research hypothesis as never introduced", () => {
    const html = render("pt-BR", {
      ...baseView,
      authorization: {
        id: "80000000-0000-4000-8000-000000000001",
        packRevisionId: baseView.currentPack!.id,
        packFingerprint: fingerprint,
        identityPolicy: "identified_restricted",
        waveLimit: 3,
        policyVersion: "policy-v1",
        consentStatement: "A companhia autoriza disponibilizar este pacote.",
        consentedAt: "2026-09-11T12:30:00.000Z",
        coversCurrentRevision: true,
      },
      recipients: [{
        ...baseView.recipients[0]!,
        shareId: "60000000-0000-4000-8000-000000000001",
        preparationId: "b0000000-0000-4000-8000-000000000001",
        preparationStatus: "prepared",
        candidateFit: "hypothesis",
      }],
    });
    expect(html).toContain('data-testid="research-only"');
    expect(html).toContain(pt.AuthorizedDistribution.researchOnly);
    expect(html).not.toContain(pt.AuthorizedDistribution.releaseAttestation);
  });
});
