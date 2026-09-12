import {describe, expect, it, vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import pt from "../../messages/pt-BR.json";
import en from "../../messages/en-US.json";
import {routing} from "@/i18n/routing";
import {publicPages, publicPath, resolvePublicPage} from "./website-routes";
import {websiteMetadata} from "./website-metadata";
import {PublicPageContent} from "@/components/public-content";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

vi.mock("next-intl/server", () => ({
  getMessages: async ({locale}: {locale: string}) => locale === "pt-BR" ? pt : en,
  getTranslations: async ({locale, namespace}: {locale: string; namespace: string}) => (key: string) => {
    let value: unknown = locale === "pt-BR" ? pt : en;
    for (const part of `${namespace}.${key}`.split(".")) value = (value as Record<string, unknown>)[part];
    if (typeof value !== "string") throw new Error(`Missing localized string: ${key}`);
    return value;
  },
}));

describe("public website boundaries", () => {
  it("keeps 42 unique localized routes and resolves only the allowlist", () => {
    const paths = routing.locales.flatMap(locale => publicPages.map(page => publicPath(locale,page)));
    expect(new Set(paths).size).toBe(42);
    for (const locale of routing.locales) {
      for (const page of publicPages.filter(key => key !== "home")) {
        expect(resolvePublicPage(locale, publicPath(locale,page).split("/").slice(2))).toBe(page);
      }
      for (const path of ["app", "app/projects", "login", "demo", "api/private", "unknown", "solutions/unknown"]) {
        expect(resolvePublicPage(locale,path.split("/"))).toBeUndefined();
      }
    }
  });

  it("indexes only the explicit public routes and retains private-route exclusion", () => {
    expect(sitemap()).toHaveLength(42);
    const rules = robots().rules as {disallow: string; allow: string[]};
    expect(rules.disallow).toBe("/");
    for (const entry of sitemap()) expect(rules.allow).toContain(`${new URL(entry.url).pathname}$`);
    expect(rules.allow).not.toContain("/pt-BR/app$");
  });

  it.each(routing.locales)("renders every detail and catalog page with native %s copy", async locale => {
    for (const page of publicPages.filter(key => key !== "home")) {
      const html = renderToStaticMarkup(await PublicPageContent({locale,page}));
      expect(html.match(/<h1[ >]/g)).toHaveLength(1);
      expect(html).not.toContain("Website.");
      expect(html).not.toContain("Offroad Capital");
      expect(html).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it.each(routing.locales)("provides page-specific canonical URLs and language equivalents in %s", async locale => {
    for (const page of publicPages) {
      const meta = await websiteMetadata(locale,page);
      expect(meta.alternates?.canonical).toBe(publicPath(locale,page));
      expect(meta.alternates?.languages?.["en-US"]).toBe(publicPath("en-US",page));
      expect(meta.alternates?.languages?.["pt-BR"]).toBe(publicPath("pt-BR",page));
      expect(meta.description).toBeTruthy();
    }
  });

  it("preserves the approved hero and honest security and contact boundaries", () => {
    expect(pt.Website.hero.title).toBe("Plataforma de IA agêntica especializada em estrutura de capital e financiamento por dívida.");
    expect(en.Website.hero.title).toBe("Agentic AI platform purpose-built for capital structure and debt financing.");
    expect(pt.Website.security.socBody).toContain("ainda não possui relatório SOC 2");
    expect(en.Website.security.socBody).toContain("does not currently have a SOC 2 report");
    expect(pt.Website.demo.note).toContain("Nada é enviado pelo site");
    expect(en.Website.demo.note).toContain("Nothing is sent by the website");
    expect(JSON.stringify(pt.Website)).not.toMatch(/[\u2013\u2014]/);
    expect(JSON.stringify(en.Website)).not.toMatch(/[\u2013\u2014]/);
  });
});
