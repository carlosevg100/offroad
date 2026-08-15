import {describe, expect, it} from "vitest";

import {brand} from "./brand";

describe("replaceable brand configuration", () => {
  it("keeps every public digital identity value in one record", () => {
    expect(brand.url).toBe(`https://${brand.domain}`);
    expect(brand.email.endsWith(`@${brand.domain}`)).toBe(true);
    expect(brand.name).not.toEqual(brand.slug);
  });
});
