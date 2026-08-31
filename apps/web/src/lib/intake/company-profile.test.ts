import {describe, expect, it} from "vitest";

import {normalizeCompanyWebsite} from "./company-profile";

describe("normalizeCompanyWebsite", () => {
  it("accepts a natural domain and adds HTTPS", () => {
    expect(normalizeCompanyWebsite("www.cedro-distribuicao.example.com")).toBe("https://www.cedro-distribuicao.example.com");
    expect(normalizeCompanyWebsite("cedro.com.br/empresa")).toBe("https://cedro.com.br/empresa");
  });

  it("preserves complete HTTP(S) URLs", () => {
    expect(normalizeCompanyWebsite("https://cedro.com.br")).toBe("https://cedro.com.br");
    expect(normalizeCompanyWebsite("http://cedro.local")).toBe("http://cedro.local");
  });

  it("trims whitespace and preserves an optional blank value", () => {
    expect(normalizeCompanyWebsite("  cedro.com.br  ")).toBe("https://cedro.com.br");
    expect(normalizeCompanyWebsite("   ")).toBe("");
  });
});
