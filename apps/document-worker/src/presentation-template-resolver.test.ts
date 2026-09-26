import {createHash} from "node:crypto";

import {offroadHousePresentationStructure, offroadHousePresentationTemplate} from "@offroad/case-export";
import {describe, expect, it} from "vitest";

import {resolvePresentationTemplateForJob} from "./presentation-template-resolver";

const job = {job_id: "80000000-0000-4000-8000-000000000001", capability_token: "c".repeat(64)};
const versionId = "50000000-0000-4000-8000-000000000001";
const logoBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const definition = (logo: boolean) => ({
  template_key: "synthetic-client", template_version: "2026.09.27-v1", origin: "client_supplied",
  colors: {ink: "1B2430", paper: "FFFFFF", accent: "1F4E79", muted: "6B7780", warning: "A66C1F", danger: "A23B3B"},
  fonts: {display: "Arial", body: "Arial", pdf_display: "Helvetica", pdf_body: "Helvetica"},
  logo: logo ? {object_path: "20000000-0000-4000-8000-000000000001/presentation-templates/logo.png", sha256: createHash("sha256").update(logoBytes).digest("hex"), byte_length: logoBytes.byteLength, content_type: "image/png"} : null,
  confidentiality_label: "CONFIDENCIAL",
});
const version = (logo = false) => ({template: {
  template_id: "30000000-0000-4000-8000-000000000001", scope: "project", template_key: "synthetic-client", template_version: "2026.09.27-v1", origin: "client_supplied",
  version_id: versionId, version_no: 3, fingerprint: "e".repeat(64), definition: definition(logo), structure: offroadHousePresentationStructure,
}});

describe("worker presentation template choice", () => {
  it("renders with the house template when the queue cannot read versions or the project has none", async () => {
    const withoutReader = await resolvePresentationTemplateForJob(job, {}, offroadHousePresentationTemplate);
    expect(withoutReader).toMatchObject({source: "house", reason: "no_client_version", versionId: null, template: {id: "offroad-house"}});
    const withoutVersion = await resolvePresentationTemplateForJob(job, {readPresentationTemplateVersion: async () => ({template: null})}, offroadHousePresentationTemplate);
    expect(withoutVersion).toMatchObject({source: "house", reason: "no_client_version"});
  });

  it("renders with the exact client version: its definition, structure, fingerprint and id", async () => {
    const resolved = await resolvePresentationTemplateForJob(job, {readPresentationTemplateVersion: async () => version()}, offroadHousePresentationTemplate);
    expect(resolved.source).toBe("client_version");
    expect(resolved.versionId).toBe(versionId);
    expect(resolved.versionNo).toBe(3);
    expect(resolved.scope).toBe("project");
    expect(resolved.logoOmitted).toBe(false);
    expect(resolved.template).toMatchObject({id: "synthetic-client", version: "2026.09.27-v1", origin: "client_supplied", fingerprint: "e".repeat(64), versionId, colors: {accent: "1F4E79"}});
    expect(resolved.template.structure?.sections.map((section) => section.key)).toEqual(offroadHousePresentationStructure.sections.map((section) => section.key));
    expect(resolved.template.logo).toBeUndefined();
  });

  it("embeds the logo only after verifying its bytes and leaves it out, reported, otherwise", async () => {
    const verified = await resolvePresentationTemplateForJob(job, {readPresentationTemplateVersion: async () => version(true), downloadBrandTemplateLogo: async () => logoBytes}, offroadHousePresentationTemplate);
    expect(verified.logoOmitted).toBe(false);
    expect(verified.template.logo?.data).toEqual(logoBytes);
    const events: string[] = [];
    const tampered = await resolvePresentationTemplateForJob(job, {readPresentationTemplateVersion: async () => version(true), downloadBrandTemplateLogo: async () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 9])}, offroadHousePresentationTemplate, (event) => events.push(event));
    expect(tampered.logoOmitted).toBe(true);
    expect(tampered.template.logo).toBeUndefined();
    expect(tampered.source).toBe("client_version");
    const unreadable = await resolvePresentationTemplateForJob(job, {readPresentationTemplateVersion: async () => version(true), downloadBrandTemplateLogo: async () => null}, offroadHousePresentationTemplate, (event) => events.push(event));
    expect(unreadable.logoOmitted).toBe(true);
    expect(events).toEqual(["presentation_template.logo_omitted", "presentation_template.logo_omitted"]);
  });

  it("treats a version the renderers cannot honour, or a read it cannot parse, as absent and says why", async () => {
    const events: string[] = [];
    const broken = version();
    broken.template.structure = {...offroadHousePresentationStructure, sections: []};
    const unrenderable = await resolvePresentationTemplateForJob(job, {readPresentationTemplateVersion: async () => broken}, offroadHousePresentationTemplate, (event) => events.push(event));
    expect(unrenderable).toMatchObject({source: "house", reason: "version_unrenderable", versionId: null});
    const invalid = await resolvePresentationTemplateForJob(job, {readPresentationTemplateVersion: async () => ({unexpected: true})}, offroadHousePresentationTemplate, (event) => events.push(event));
    expect(invalid).toMatchObject({source: "house", reason: "read_invalid"});
    expect(events).toEqual(["presentation_template.version_unrenderable", "presentation_template.read_invalid"]);
  });
});
