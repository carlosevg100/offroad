import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
const ptNew = pt;
const enNew = en;
import type {ProjectReviewPolicyContext} from "@/lib/advisor/project-review-policy-context";
import {ProjectReviewRoles} from "./project-review-roles";
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
vi.mock("@/app/[locale]/app/projects/[projectId]/review-actions", () => ({setProjectReviewAssignment: vi.fn(), setProjectReviewPolicyV2: vi.fn(), setOrganizationReviewPolicyV2: vi.fn()}));
const context: ProjectReviewPolicyContext = {projectId: "30000000-0000-4000-8000-000000000001", organizationId: "20000000-0000-4000-8000-000000000001", policyFingerprint: "a".repeat(64), organizationPolicyFingerprint: "b".repeat(64),
 assignmentRequired: {effective: true, project: "inherit", organization: true}, selfApproval: {effective: false, project: "forbidden", organization: true}, regime: "assigned", canManage: true,
 caller: {userId: "10000000-0000-4000-8000-000000000001", roles: ["approver"]},
 members: [{userId: "10000000-0000-4000-8000-000000000001", fullName: "Ana Lima", email: "ana@example.invalid", membershipRole: "owner", roles: ["approver"]}], membersTruncated: false};
function render(locale: "pt-BR" | "en-US", value = context) {
 const existing = locale === "pt-BR" ? pt : en; const added = locale === "pt-BR" ? ptNew : enNew;
 const messages = {...existing, ProjectReviewRoles: {...existing.ProjectReviewRoles, ...added.ProjectReviewRoles, selfApproval: {...existing.ProjectReviewRoles.selfApproval, ...added.ProjectReviewRoles.selfApproval}, errors: {...existing.ProjectReviewRoles.errors, ...added.ProjectReviewRoles.errors}}};
 return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages}><ProjectReviewRoles context={value} locale={locale} projectId={value.projectId}/></NextIntlClientProvider>);
}
describe("content review policy configuration", () => {
 it.each(["pt-BR", "en-US"] as const)("shows both effective requirements and their origins in %s", locale => {
  const html = render(locale); const messages = locale === "pt-BR" ? ptNew : enNew;
  expect(html).toContain(messages.ProjectReviewRoles.contentTitle); expect(html).toContain(messages.ProjectReviewRoles.contentScope);
  expect(html).toContain('data-regime="assigned"'); expect(html).toContain('name="project_assignment_required"'); expect(html).toContain('name="project_self_approval"');
  expect(html).toContain('name="organization_assignment_required"'); expect(html).toContain('name="organization_self_approval"');
  expect(html).not.toContain('disabled=""'); expect(html).not.toMatch(/—/); expect(html).not.toContain("30000000-0000-4000-8000-000000000001");
 });
 it("keeps policy read only without manage and never offers a content approval", () => {
  const html = render("pt-BR", {...context, canManage: false}); expect(html).toContain(ptNew.ProjectReviewRoles.contentReadOnly);
  expect(html).not.toContain('name="project_assignment_required"'); expect(html).not.toContain('name="organization_self_approval"');
  expect(html).toContain('disabled=""'); expect(html).not.toContain('artifact-revision-review'); expect(html).not.toContain('reassign');
 });
 it("does not expose an internal UUID as a missing member name", () => {
  const html = render("pt-BR", {...context, members: context.members.map(member => ({...member, fullName: null, email: null}))});
  expect(html).toContain("Membro 1"); const text = html.replace(/<[^>]*>/g, ""); expect(text).not.toContain(context.members[0].userId); expect(text).not.toContain(context.members[0].userId.slice(0, 8));
 });
 it("discloses truncation", () => expect(render("pt-BR", {...context, membersTruncated: true})).toContain(ptNew.ProjectReviewRoles.membersTruncated));
 it("does not describe open as unrestricted approval", () => {
  const html = render("pt-BR", {...context, assignmentRequired: {effective: false, project: "not_required", organization: true}, regime: "open"});
  expect(html).toContain(ptNew.ProjectReviewRoles.regime.open); expect(html).not.toContain(pt.ProjectReviewRoles.mode.open);
 });
});
