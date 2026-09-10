import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import type {ProjectReviewContext} from "@/lib/advisor/project-review-context";
import {ProjectReviewRoles} from "./project-review-roles";

vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
vi.mock("@/app/[locale]/app/projects/[projectId]/review-actions", () => ({setProjectReviewAssignment: vi.fn(), setProjectReviewPolicy: vi.fn(), setOrganizationReviewPolicy: vi.fn()}));

const context: ProjectReviewContext = {
  projectId: "30000000-0000-4000-8000-000000000001",
  organizationId: "20000000-0000-4000-8000-000000000001",
  mode: "assigned",
  selfApproval: {effective: false, project: "inherit", organization: false},
  canManage: true,
  caller: {userId: "10000000-0000-4000-8000-000000000001", roles: ["approver"], canPrepare: false, canReturn: true, canApprove: true},
  members: [
    {userId: "10000000-0000-4000-8000-000000000001", fullName: "Ana Lima", email: "ana@example.invalid", membershipRole: "owner", roles: ["approver"]},
    {userId: "10000000-0000-4000-8000-000000000002", fullName: null, email: "bruno@example.invalid", membershipRole: "analyst", roles: ["preparer"]},
  ],
};
function render(locale: "pt-BR" | "en-US", value: ProjectReviewContext) {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? pt : en}>
    <ProjectReviewRoles context={value} locale={locale} projectId={value.projectId} />
  </NextIntlClientProvider>);
}

describe("project review roles configuration", () => {
  it.each(["pt-BR", "en-US"] as const)("lets an organization administrator assign roles and the self-approval setting in %s", (locale) => {
    const messages = locale === "pt-BR" ? pt : en;
    const html = render(locale, context);
    expect(html).toContain('data-mode="assigned"');
    expect(html).toContain(messages.ProjectReviewRoles.mode.assigned);
    expect(html).toContain('data-effective="false"');
    expect(html).toContain("Ana Lima");
    expect(html).toContain("bruno@example.invalid");
    expect(html).toContain('aria-label="Ana Lima: ' + messages.ProjectReviewRoles.roles.approver + '" type="checkbox" name="review_role" checked=""');
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('name="project_self_approval"');
    expect(html).toContain('name="organization_self_approval"');
    expect(html).toContain(messages.ProjectReviewRoles.profileNote);
    expect(html).not.toMatch(/—/);
  });

  it("keeps the configuration read-only for members who cannot manage the organization", () => {
    const html = render("pt-BR", {...context, canManage: false, mode: "open", caller: {...context.caller, roles: []}});
    expect(html).toContain('data-mode="open"');
    expect(html).toContain(pt.ProjectReviewRoles.mode.open);
    expect(html).toContain(pt.ProjectReviewRoles.readOnly);
    expect(html).not.toContain('name="project_self_approval"');
    expect(html).toMatch(/<input aria-label="[^"]+" disabled="" type="checkbox" name="review_role" checked=""/);
    expect(html).toContain(pt.ProjectReviewRoles.none);
  });
});
