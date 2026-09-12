import {describe, expect, it, vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {createElement} from "react";
import pt from "../../messages/pt-BR.json";
import en from "../../messages/en-US.json";
import {routing} from "@/i18n/routing";
import {publicPages, publicPath, resolvePublicPage} from "./website-routes";
import {websiteMetadata} from "./website-metadata";
import {PublicPageContent} from "@/components/public-content";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import {ProductHome} from "@/components/public-product-home";
import {PublicWorkbench} from "@/components/public-workbench";
import {PublicCapitalJourney, capitalJourneyStages} from "@/components/public-capital-journey";
import {websiteFinancialBaseline} from "./website-example";

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
      expect(html).not.toMatch(/[↗▶Ⅱ]/);
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
    expect(pt.Website.hero.title).toBe("Plataforma de IA agêntica construída para quem estrutura e investe em dívida.");
    expect(en.Website.hero.title).toBe("Agentic AI platform purpose-built for those who structure and invest in debt.");
    expect(pt.Website.security.socBody).toContain("ainda não possui relatório SOC 2");
    expect(en.Website.security.socBody).toContain("does not currently have a SOC 2 report");
    expect(pt.Website.demo.note).toContain("Nada é enviado pelo site");
    expect(en.Website.demo.note).toContain("Nothing is sent by the website");
    expect(JSON.stringify(pt.Website)).not.toMatch(/[\u2013\u2014]/);
    expect(JSON.stringify(en.Website)).not.toMatch(/[\u2013\u2014]/);
  });

  it.each(routing.locales)("presents the offer, audiences, method, journey and trust in the requested order in %s", locale => {
    const copy = locale === "pt-BR" ? pt.Website : en.Website;
    const html = renderToStaticMarkup(createElement(ProductHome, {locale, copy}));
    const sections = ["offering", "audiences", "by-finance", "capital-intelligence", "how-it-works", "institutional-trust"];
    const positions = sections.map(id => html.indexOf(`id="${id}"`));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a,b) => a-b));
    expect(html).toContain(copy.offering.advisor.title);
    expect(html).toContain(copy.offering.analyst.title);
    expect(html).toContain(copy.offering.connection.title);
    expect(html).toContain(copy.narrative.journey.example);
    for (const audience of ["companies", "advisors", "investors"] as const) {
      expect(html).toContain(`href="${publicPath(locale,audience)}"`);
    }
    expect(html).toContain("<details");
    expect(html).not.toContain(copy.productHome.title);
    expect(html).not.toMatch(/[↗▶Ⅱ\u2013\u2014]/);
    expect(html).not.toContain("Da questão financeira");
    expect(html).not.toContain("Ilustração conceitual da experiência");
    expect(html).not.toContain("A menor taxa resolve");
  });

  it.each(routing.locales)("renders all five example stages with one active control and distinct artifacts in %s", locale => {
    const copy = locale === "pt-BR" ? pt.Website : en.Website;
    const escape = (value: string) => value.replace(/&/g,"&amp;").replace(/'/g,"&#x27;");
    for (const initialStage of capitalJourneyStages) {
      const html = renderToStaticMarkup(createElement(PublicCapitalJourney, {copy: copy.narrative.journey, financialCopy: copy.workbench, financials: websiteFinancialBaseline(locale), initialStage}));
      expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
      expect(html.match(/<button /g)).toHaveLength(5);
      expect(html).toContain(escape(copy.narrative.journey[initialStage].prompt));
      expect(html).toContain(escape(copy.narrative.journey[initialStage].title));
      expect(html).not.toContain("undefined");
      expect(html).not.toMatch(/[↗▶Ⅱ\u2013\u2014]/);
      if (initialStage === "investigate") expect(html).toContain(websiteFinancialBaseline(locale).adjusted);
      if (initialStage === "connect") expect(html).toContain(copy.narrative.journey.connect.note);
    }
  });

  it.each(routing.locales)("gives every audience applications, benefits and role-specific depth in %s", async locale => {
    const copy = locale === "pt-BR" ? pt.Website : en.Website;
    for (const page of ["companies", "advisors", "investors"] as const) {
      const html = renderToStaticMarkup(await PublicPageContent({locale,page}));
      for (const key of ["oneTitle", "twoTitle", "threeTitle", "juniorTitle", "seniorTitle", "guidance"] as const) {
        expect(html).toContain(copy.audienceDetail[page][key].replace(/&/g,"&amp;").replace(/'/g,"&#x27;"));
      }
      expect(html).toContain(copy.audienceDetail.perspectiveTitle);
      expect(html).toContain("<details");
    }
  });

  it("keeps matching native-language key trees for the new narrative", () => {
    function keys(value: object, prefix = ""): string[] {
      return Object.entries(value).flatMap(([key, item]) => typeof item === "object" ? keys(item, `${prefix}${key}.`) : [`${prefix}${key}`]);
    }
    for (const section of ["offering", "narrative", "audienceDetail", "solutionDepth"] as const) expect(keys(pt.Website[section])).toEqual(keys(en.Website[section]));
  });

  it.each(routing.locales)("provides distinct, fully localized journeys for all three audiences in %s", locale => {
    const copy = (locale === "pt-BR" ? pt.Website : en.Website).workbench;
    for (const audience of ["companies", "advisors", "investors"] as const) {
      const html = renderToStaticMarkup(createElement(PublicWorkbench, {locale, copy, financials: websiteFinancialBaseline(locale), initialAudience: audience, fixedAudience: true}));
      expect(html).toContain(copy[audience].title.replace(/'/g,"&#x27;"));
      expect(html).not.toContain("undefined");
      for (const stage of ["one", "two", "three"] as const) {
        for (const value of Object.values(copy[audience][stage])) expect(value.trim().length).toBeGreaterThan(5);
      }
    }
  });

  it("uses core calculations for the fictional financial baseline", () => {
    expect(websiteFinancialBaseline("pt-BR")).toEqual({reported:"30,4", adjustment:"0,8", adjusted:"31,2", debt:"56,4", leverage:"1,81x"});
    expect(websiteFinancialBaseline("en-US")).toEqual({reported:"30.4", adjustment:"0.8", adjusted:"31.2", debt:"56.4", leverage:"1.81x"});
  });
});
