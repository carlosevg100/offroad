import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";

import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import {
  SharedPackResponse,
  sharedPackConditionCodes,
  sharedPackObjectionCodes,
} from "./shared-pack-response";

vi.mock("@/app/[locale]/app/shared/actions", () => ({recordSharedPackResponse: vi.fn()}));

const shareId = "60000000-0000-4000-8000-000000000001";

function render(locale: "pt-BR" | "en-US", latestResponseId: string | null = null) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? pt : en}>
      <SharedPackResponse latestResponseId={latestResponseId} locale={locale} shareId={shareId} />
    </NextIntlClientProvider>,
  );
}

describe("shared pack response form", () => {
  it.each(["pt-BR", "en-US"] as const)("offers the four answers and the structured feedback in %s", (locale) => {
    const messages = locale === "pt-BR" ? pt : en;
    const html = render(locale);
    expect(html).toContain('data-testid="shared-pack-response"');
    for (const state of ["interested", "needs_information", "declined", "no_response_yet"] as const) {
      expect(html).toContain(messages.SharedInformationPacks.responseState[state]);
    }
    for (const code of sharedPackConditionCodes) expect(html).toContain(`value="${code}"`);
    for (const code of sharedPackObjectionCodes) expect(html).toContain(`value="${code}"`);
    expect(html).toContain(messages.SharedInformationPacks.responseBoundary);
  });

  it("carries the previous answer so a correction supersedes it instead of erasing it", () => {
    const html = render("pt-BR", "c0000000-0000-4000-8000-000000000001");
    expect(html).toContain('name="supersedes_response_id"');
    expect(html).toContain('value="c0000000-0000-4000-8000-000000000001"');
  });

  it("never presents an answer as a commitment in either catalogue", () => {
    const forbidden = /aprova|financiament|approv|funding|closing/i;
    for (const value of [
      ...Object.values(pt.SharedInformationPacks.responseState),
      ...Object.values(en.SharedInformationPacks.responseState),
    ]) {
      expect(value).not.toMatch(forbidden);
    }
    expect(pt.SharedInformationPacks.responseBoundary).toMatch(/Nao e proposta, aprovacao nem compromisso/);
    expect(en.SharedInformationPacks.responseBoundary).toMatch(/not a proposal, an approval or a funding commitment/);
  });
});
