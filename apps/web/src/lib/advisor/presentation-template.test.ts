import {createHash} from "node:crypto";
import {describe, expect, it, vi} from "vitest";

import {loadPresentationTemplateContext, presentationTemplateForProject, resolvePresentationTemplate} from "./presentation-template";

const projectId = "10000000-0000-4000-8000-000000000001";
const logoBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const logoHash = createHash("sha256").update(logoBytes).digest("hex");
const definition = {
  template_key: "synthetic-client", template_version: "2026.09.11-v1", origin: "client_supplied",
  colors: {ink: "1B2430", paper: "FFFFFF", accent: "1F4E79", muted: "6B7780", warning: "A66C1F", danger: "A23B3B"},
  fonts: {display: "Founders Grotesk", body: "Founders Grotesk", pdf_display: "Helvetica", pdf_body: "Times New Roman"},
  logo: {object_path: "20000000-0000-4000-8000-000000000001/logo.png", sha256: logoHash, byte_length: logoBytes.byteLength, content_type: "image/png"},
  confidentiality_label: "CONFIDENCIAL",
};
const stored = {template_id: "30000000-0000-4000-8000-000000000001", template_key: "synthetic-client", template_version: "2026.09.11-v1", origin: "client_supplied", fingerprint: "c".repeat(64), scope: "organization", definition};
const context = (overrides: Record<string, unknown> = {}) => ({
  project_id: projectId, organization_id: "20000000-0000-4000-8000-000000000001", can_manage: true,
  effective: stored, organization: stored, project: null, pdf_fonts: ["Helvetica", "Times New Roman", "Courier New"], ...overrides,
});
const client = (data: unknown, download: unknown = {data: {arrayBuffer: async () => logoBytes.buffer}}) => ({
  rpc: vi.fn().mockResolvedValue({data, error: null}),
  storage: {from: vi.fn().mockReturnValue({download: vi.fn().mockResolvedValue(download)})},
}) as never;

describe("project visual identity", () => {
  it("reads the record, the override and the families the PDF can embed", async () => {
    const override = {...stored, scope: "project", template_key: "project-only", definition: {...definition, template_key: "project-only"}};
    const result = await loadPresentationTemplateContext(client(context({project: override})), projectId);
    expect(result?.canManage).toBe(true);
    expect(result?.project?.definition.templateKey).toBe("project-only");
    expect(result?.organization?.definition.fonts.pdfBody).toBe("Times New Roman");
    expect(result?.pdfFonts).toEqual(["Helvetica", "Times New Roman", "Courier New"]);
  });

  it("uses the Offroad identity when nothing is recorded", async () => {
    const {template, logoOmitted} = await presentationTemplateForProject(client(context({effective: null, organization: null})), projectId);
    expect(template.id).toBe("offroad-house");
    expect(template.origin).toBe("offroad_house");
    expect(template.logo).toBeUndefined();
    expect(logoOmitted).toBe(false);
  });

  it("embeds the logo only after recomputing its hash from the stored object", async () => {
    const {template, logoOmitted} = await presentationTemplateForProject(client(context()), projectId);
    expect(template.origin).toBe("client_supplied");
    expect(template.fingerprint).toBe("c".repeat(64));
    expect(template.logo?.extension).toBe("png");
    expect(template.logo?.data).toEqual(logoBytes);
    expect(logoOmitted).toBe(false);
  });

  it("drops a logo whose bytes no longer match the recorded hash instead of embedding it", async () => {
    const tampered = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 9, 9, 9]);
    const {template, logoOmitted} = await presentationTemplateForProject(client(context(), {data: {arrayBuffer: async () => tampered.buffer}}), projectId);
    expect(template.logo).toBeUndefined();
    expect(logoOmitted).toBe(true);
    // The rest of the identity is still honoured; only the unverified mark is left out.
    expect(template.colors.accent).toBe("1F4E79");
  });

  it("drops the logo when the object cannot be read at all", async () => {
    const {template, logoOmitted} = await presentationTemplateForProject(client(context(), {data: null, error: {message: "denied"}}), projectId);
    expect(template.logo).toBeUndefined();
    expect(logoOmitted).toBe(true);
  });

  it("falls back to the Offroad identity when the read fails or the record is malformed", async () => {
    expect(await loadPresentationTemplateContext({rpc: vi.fn().mockResolvedValue({data: null, error: {code: "42501"}})} as never, projectId)).toBeNull();
    expect(await loadPresentationTemplateContext(client({unexpected: true}), projectId)).toBeNull();
    expect((await resolvePresentationTemplate(client(context()), null)).template.origin).toBe("offroad_house");
  });
});
