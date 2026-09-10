import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {publicCapitalCatalog} from "@/lib/market/public-capital-catalog";
import {publicCapitalRegistry} from "@/lib/market/public-capital-registry";
import {PublicCapitalHistory} from "./public-capital-history";
import {PublicCapitalRegistryBrowser} from "./public-capital-registry-browser";

describe("market evidence surfaces", () => {
  it.each(["pt-BR", "en-US"] as const)("distinguishes issuer coupon, announced approval and missing investor identity in %s", locale => {
    const messages = locale === "pt-BR" ? pt : en;
    const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><PublicCapitalHistory catalog={publicCapitalCatalog} /></NextIntlClientProvider>);
    expect(html).toContain("MOVIB2");
    expect(html).toContain(messages.PublicCapitalMarket.history.noLender);
    expect(html).toContain(messages.PublicCapitalMarket.history.approval_announced_disbursement_not_verified);
    expect(html).toContain(messages.PublicCapitalMarket.history.noPricing);
    expect(html).toContain("BNDES");
    expect(html.match(/<article/g)).toHaveLength(5);
  });
  it.each(["pt-BR", "en-US"] as const)("renders only a bounded registry page with source and no eligibility in %s", locale => {
    const messages = locale === "pt-BR" ? pt : en;
    const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><PublicCapitalRegistryBrowser registry={publicCapitalRegistry} /></NextIntlClientProvider>);
    expect(html.match(/<article/g)).toHaveLength(25);
    expect(html).toContain(messages.PublicCapitalMarket.registry.noMandate);
    expect(html).toContain('https://dados.cvm.gov.br/dados/FI/CAD/DADOS/registro_fundo_classe.zip');
    expect(html).not.toContain('type="checkbox"');
  });
});
