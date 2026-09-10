import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {publicCapitalCatalog} from "@/lib/market/public-capital-catalog";
import {publicCapitalRegistry} from "@/lib/market/public-capital-registry";
import {PublicCapitalBrowser} from "./public-capital-browser";

describe("public capital browser", () => {
  it.each(["pt-BR", "en-US"] as const)("renders sourced roles, vehicles, unknowns and no selection/outreach in %s", locale => {
    const messages = locale === "pt-BR" ? pt : en;
    const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><PublicCapitalBrowser catalog={publicCapitalCatalog} registry={publicCapitalRegistry} /></NextIntlClientProvider>);
    expect(html).toContain(messages.PublicCapitalMarket.title);
    expect(html).toContain(messages.PublicCapitalMarket.boundary);
    expect(html).toContain(messages.PublicCapitalMarket.unknowns);
    expect(html).toContain("KNCR11");
    expect(html).toContain('href="https://www.kinea.com.br/credito-privado/"');
    expect(html).toContain(messages.PublicCapitalMarket.statuses.intermediary_only);
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("<form");
    expect(html).toContain(messages.PublicCapitalMarket.views.registry);
  });
});
