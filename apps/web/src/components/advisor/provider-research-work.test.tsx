import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it} from "vitest";
import {publicCapitalCatalogReference} from "@offroad/public-research/capital-catalog";
import {compileProviderResearchArtifact} from "@offroad/work-plan";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {ProviderResearchWork} from "./provider-research-work";
const research = compileProviderResearchArtifact({schemaVersion: "provider-research.v1", scope: "research_only", projectId: "10000000-0000-4000-8000-000000000001", planId: "10000000-0000-4000-8000-000000000002", planFingerprint: "a".repeat(64), locale: "pt-BR", objective: "Pesquisa sintética", asOf: "2026-09-10T00:00:00Z", sourceFingerprint: "b".repeat(64), providers: [{providerId: "synthetic", name: "Provedor sintético", sourceClass: "registered", observations: [{criterion: "Instrumentos", value: "Crédito corporativo", provenance: "Registro autorizado sintético", observedAt: null}], gaps: ["Condições ainda não confirmadas."]}], limitations: ["Amostra sintética para teste."], shortlistAuthorized: false, externalEffectAllowed: false});
describe("ProviderResearchWork", () => {
  it.each(["pt-BR", "en-US"] as const)("shows sources and unknown recency without selection or contact actions in %s", (locale) => {
    const messages = locale === "pt-BR" ? pt : en;
    const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><ProviderResearchWork research={{...research, locale}} /></NextIntlClientProvider>);
    expect(html).toContain("Provedor sintético");
    expect(html).toContain("Registro autorizado sintético");
    expect(html).toContain(messages.ProviderResearchWork.dateUnknown);
    expect(html).toContain(messages.ProviderResearchWork.boundary);
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
    expect(html).not.toContain(research.sourceFingerprint);
  });
  it("distinguishes absent authorized records from no capital providers in the market", () => {
    const html = renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" messages={pt} timeZone="UTC"><ProviderResearchWork research={{...research, providers: []}} /></NextIntlClientProvider>);
    expect(html).toContain(pt.ProviderResearchWork.empty);
    expect(html).not.toContain('type="search"');
  });
});


describe("public research artifact display", () => {
  it.each(["pt-BR", "en-US"] as const)("shows exact persisted public source links and dates in %s", locale => {
    const {fingerprint, ...payload} = research;
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    const artifact = compileProviderResearchArtifact({...payload, schemaVersion: "provider-research.v2", publicCatalog: publicCapitalCatalogReference,
      providers: [{providerId: "public:itau", name: "Itaú", sourceClass: "public_research", observations: [{criterion: "Estratégia pública", value: "Crédito empresarial", provenance: "Pesquisa pública", observedAt: "2026-09-10T00:00:00Z", sources: [{id: "source-itau", publisher: "Itaú", url: "https://www.itau.com.br/empresas/emprestimos-financiamentos", accessedAt: "2026-09-10"}]}], gaps: ["Apetite não confirmado"]}]});
    const messages = locale === "pt-BR" ? pt : en;
    const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><ProviderResearchWork research={{...artifact, locale}} /></NextIntlClientProvider>);
    expect(html).toContain('href="https://www.itau.com.br/empresas/emprestimos-financiamentos"');
    expect(html).toContain(messages.ProviderResearchWork.sourceClass.public_research);
    expect(html).toContain("2026-09-10");
    expect(html).not.toContain(publicCapitalCatalogReference.sourceFingerprint);
  });
});
