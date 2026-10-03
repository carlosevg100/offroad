import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import {artifactReviewSchema} from "@offroad/domain-contracts";
import pt from "../../../messages/pt-BR.json";
import {materialReviewFixture} from "@/lib/artifacts/material-package-review.test-support";
import {parseMaterialPackageReviewContext, type MaterialPackageReviewContext} from "@/lib/artifacts/material-package-review-context";
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
vi.mock("@/app/[locale]/app/projects/[projectId]/material-package-review-actions", () => ({reviewMaterialPackage: vi.fn()}));
import {MaterialPackageReview} from "./material-package-review";

function fixture() {
  const f = materialReviewFixture();
  const basis = parseMaterialPackageReviewContext(f.basis, f.expected)!;
  return {basis, u: f.u};
}
function render(basis: MaterialPackageReviewContext, userId: string) {
  return renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" messages={pt} timeZone="UTC">
    <MaterialPackageReview basis={basis} userId={userId} />
  </NextIntlClientProvider>);
}
function approval(basis: MaterialPackageReviewContext) {
  return artifactReviewSchema.parse({id: materialReviewFixture().u(20), target: {
    organizationId: materialReviewFixture().u(21), workId: basis.workId, artifactId: basis.review.artifact.id,
    revisionId: basis.revisionId, manifestFingerprint: basis.manifestFingerprint, audience: "internal"},
    act: "approve", reviewerId: basis.preparedBy, preparedBy: basis.preparedBy,
    selfApprovalDeclared: true, reviewMode: "individual",
    policySnapshot: {assignmentRequired: false, selfApprovalAllowed: true, roles: []},
    block: null, basisReviewId: null, changeReport: null, commandId: materialReviewFixture().u(22),
    note: "Synthetic historical approval", createdAt: "2026-10-02T12:00:00Z"});
}
describe("material package human review surface", () => {
  it("requires an unchecked explicit declaration from the human preparer", () => {
    const {basis} = fixture(), html = render(basis, basis.preparedBy);
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked=""');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>/);
  });
  it("denies approval when current assigned roles do not include approver", () => {
    const {basis, u} = fixture();
    basis.review.policy = {assignmentRequired: true, selfApprovalAllowed: false, roles: ["reviewer"]};
    expect(render(basis, u(99))).toMatch(/<button[^>]*disabled=""[^>]*>/);
    basis.review.policy.roles = ["approver"];
    expect(render(basis, u(99))).not.toContain('disabled=""');
  });
  it("shows history without treating a revoked current approval as active", () => {
    const {basis, u} = fixture(), review = approval(basis);
    basis.review.reviews = [review];
    const html = render(basis, u(99));
    expect(html).toContain(review.note!);
    expect(html).toContain(pt.MaterialPackageReview.scope);
    expect(html).not.toContain(pt.MaterialPackageReview.approved);
    expect(html).not.toContain(`>${pt.ArtifactRevisionReview.revoke}</button>`);
  });
  it("offers revocation only for the server's current active approval", () => {
    const {basis, u} = fixture(), review = approval(basis);
    basis.review.reviews = [review]; basis.activeApprovalReviewIds = [review.id];
    const html = render(basis, u(99));
    expect(html).toContain(pt.MaterialPackageReview.approved);
    expect(html).toContain(`>${pt.ArtifactRevisionReview.revoke}</button>`);
    expect(html).not.toContain(`>${pt.ArtifactRevisionReview.approve}</button>`);
  });
});
