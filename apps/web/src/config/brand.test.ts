import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

import en from "../../messages/en-US.json";
import pt from "../../messages/pt-BR.json";
import {brand} from "./brand";

const manifest = JSON.parse(
  readFileSync(new URL("../../public/site.webmanifest", import.meta.url), "utf8"),
) as {description: string};

describe("replaceable brand configuration", () => {
  it("keeps every public digital identity value in one record", () => {
    expect(brand.url).toBe(`https://${brand.domain}`);
    expect(brand.email.endsWith(`@${brand.domain}`)).toBe(true);
    expect(brand.name).not.toEqual(brand.slug);
  });

  it("projects the specialist debt-capital-markets identity without reviving the old category", () => {
    expect(brand).toMatchObject({
      browserTitle: "Offroad Capital | AI for Debt Capital Markets",
      category: "AI Platform for Debt Capital Markets",
    });
    expect(manifest.description).toBe(brand.description);
    expect(pt.HomeV2.category).toBe("PLATAFORMA ESPECIALIZADA EM CRÉDITO, POTENCIALIZADA POR IA");
    expect(en.HomeV2.category).toBe("THE AI PLATFORM FOR DEBT CAPITAL MARKETS");

    const publicIdentity = JSON.stringify({brand, manifest, pt: pt.HomeV2, en: en.HomeV2});
    expect(publicIdentity).not.toMatch(/AI-Driven Private Credit Origination & Market Access/i);
    expect(publicIdentity).not.toMatch(/originação de crédito privado impulsionada por IA/i);
  });
});
