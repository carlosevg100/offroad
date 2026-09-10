import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {DocumentaryWorkRequest} from "./documentary-work-request";

describe("explicit new documentary work", () => {
  it.each([["pt-BR", pt], ["en-US", en]] as const)("states preservation, scope and fresh consent in %s", (locale, messages) => {
    const request = vi.fn();
    const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages}>
      <DocumentaryWorkRequest disabled={false} onRequest={request} />
    </NextIntlClientProvider>);
    expect(html).toContain(messages.DocumentaryWorkRequest.description);
    expect(html).toContain(messages.DocumentaryWorkRequest.scope);
    expect(html).toContain(messages.DocumentaryWorkRequest.submit);
    expect(html).toContain('type="submit" disabled=""');
    expect(request).not.toHaveBeenCalled();
  });
  it("disables input while a preceding action is still running", () => {
    const html = renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" messages={pt}>
      <DocumentaryWorkRequest disabled onRequest={vi.fn()} />
    </NextIntlClientProvider>);
    expect(html).toMatch(/<textarea[^>]+disabled=""/);
  });
});
