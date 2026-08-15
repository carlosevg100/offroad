import type {Event} from "@sentry/nextjs";
import {describe, expect, it} from "vitest";

import {parseProductEvent} from "./events";
import {redactTelemetryText, scrubSentryEvent} from "./privacy";

describe("privacy-safe observability", () => {
  it("rejects product analytics outside the explicit taxonomy", () => {
    expect(parseProductEvent("document_uploaded", {filename: "confidential.pdf"})).toBeNull();
    expect(parseProductEvent("workspace_viewed", {
      locale: "pt-BR",
      role: "owner",
      email: "person@example.com",
    })).toBeNull();
  });

  it("removes PII, identifiers, request payloads and financial numbers", () => {
    const event: Event = {
      message: "person@example.com failed opportunity 7990d3a9-115e-4ad0-b6a7-ae5ab56afc1a for R$ 54000000",
      request: {
        url: "https://offroad.capital/pt-BR/app/opportunities/7990d3a9-115e-4ad0-b6a7-ae5ab56afc1a?token=secret",
        method: "POST",
        data: {document: "private"},
        cookies: {session: "secret"},
        headers: {authorization: "Bearer secret"},
      },
      user: {email: "person@example.com", id: "user-1"},
      extra: {amount: 54000000},
      tags: {environment: "test", company_name: "Secret Company"},
    };

    const scrubbed = scrubSentryEvent(event);
    const serialized = JSON.stringify(scrubbed);

    expect(serialized).not.toContain("person@example.com");
    expect(serialized).not.toContain("7990d3a9-115e-4ad0-b6a7-ae5ab56afc1a");
    expect(serialized).not.toContain("54000000");
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("company_name");
    expect(scrubbed.request).toEqual({
      method: "POST",
      url: "https://offroad.capital/pt-BR/app/opportunities/[id]",
    });
  });

  it("redacts all numeric tokens from free text", () => {
    expect(redactTelemetryText("DSCR 1.74x and amount 54.0")).toBe("DSCR [number] and amount [number]");
  });
});
