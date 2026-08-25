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
    expect(parseProductEvent("intake_request_batch_viewed", {
      locale: "pt-BR",
      archetype: "growth_expansion",
      state: "ready",
      activeCount: 3,
      hiddenOpenCount: 2,
      companyName: "Private Company",
    })).toBeNull();
  });

  it("accepts only aggregate request-batch telemetry", () => {
    expect(parseProductEvent("intake_request_batch_viewed", {
      locale: "pt-BR",
      archetype: "growth_expansion",
      state: "ready",
      activeCount: 3,
      hiddenOpenCount: 2,
    })).toEqual({
      locale: "pt-BR",
      archetype: "growth_expansion",
      state: "ready",
      activeCount: 3,
      hiddenOpenCount: 2,
    });
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

describe("a stack frame keeps a filename Sentry can fetch", () => {
  const frameOf = (filename: string) => {
    const event: Event = {
      exception: {
        values: [
          {type: "Error", value: "boom", stacktrace: {frames: [{filename, function: "x", lineno: 1, colno: 2, in_app: true}]}},
        ],
      },
    };
    return scrubSentryEvent(event).exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename;
  };

  it("leaves a hashed chunk name intact", () => {
    // The blanket digit rule turned this into a file that does not exist, so Sentry could never
    // fetch the script or its source map and every browser trace stayed minified.
    const chunk = "https://offroad.capital/_next/static/immutable/chunks/08f3ut8074cvq.js";
    expect(frameOf(chunk)).toBe(chunk);
  });

  it("leaves a server route path intact, brackets and all", () => {
    const route = "/var/task/.next/server/app/[locale]/app/opportunities/[id]/page.js";
    expect(frameOf(route)).toBe(route);
  });

  it("still removes an id, an email and a token from a path", () => {
    // Dropping the digit rule is not dropping the rule that matters: anything identifying on
    // its own still goes.
    expect(frameOf("/app/3f1b0c1e-2b7a-4d4e-9a1e-2c9f0a1b2c3d/page.js")).toBe("/app/[id]/page.js");
    expect(frameOf("/u/carlos@example.com/page.js")).toBe("/u/[email]/page.js");
    expect(frameOf("/x/" + "A".repeat(40) + "/page.js")).toBe("/x/[token]/page.js");
  });

  it("drops the query string, where a signed link would be", () => {
    expect(frameOf("https://offroad.capital/chunk.js?token=abc")).toBe("https://offroad.capital/chunk.js");
  });

  it("keeps redacting numbers everywhere else, because there a number is money", () => {
    const event: Event = {message: "valor 48200000.55 recusado"};
    expect(scrubSentryEvent(event).message).not.toContain("48200000");
  });
});

describe("a browser frame points at a URL Sentry can fetch", () => {
  const frameOf = (filename: string) => {
    const event: Event = {
      exception: {values: [{type: "Error", value: "boom", stacktrace: {frames: [{filename}]}}]},
    };
    return scrubSentryEvent(event).exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename;
  };

  it("turns the SDK's app:/// prefix back into the origin the script came from", () => {
    // `app:///` is what Sentry matches against uploaded artifacts. Nothing is uploaded here, so
    // a frame in that shape is one Sentry cannot resolve, and every browser trace stays minified.
    const previous = globalThis.location;
    Object.defineProperty(globalThis, "location", {value: {origin: "https://offroad.capital"}, configurable: true});

    expect(frameOf("app:///_next/static/immutable/chunks/08f3ut8074cvq.js")).toBe(
      "https://offroad.capital/_next/static/immutable/chunks/08f3ut8074cvq.js",
    );

    Object.defineProperty(globalThis, "location", {value: previous, configurable: true});
  });

  it("leaves a frame alone on the server, where nothing could be scraped anyway", () => {
    const previous = globalThis.location;
    Object.defineProperty(globalThis, "location", {value: undefined, configurable: true});

    expect(frameOf("app:///.next/server/app/page.js")).toBe("app:///.next/server/app/page.js");

    Object.defineProperty(globalThis, "location", {value: previous, configurable: true});
  });
});
