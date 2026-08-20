import {describe, expect, it, vi} from "vitest";

/**
 * An unknown URL segment must be a 404, never a 500.
 *
 * This was live in production for days: `/wp-login.php`, `/.env` and `/foo.bar` returned 500
 * while `/nonexistentpage` returned 307, because only a segment containing a dot escapes the
 * static-file matcher and reaches the i18n config. Every WordPress scanner was generating a
 * server error.
 *
 * The test drives the exported request config directly rather than booting a route, because the
 * defect was one missing branch and the assertion that matters is narrow: an unrecognised locale
 * calls `notFound()` and never attempts a message import.
 */

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({notFound}));
vi.mock("next/root-params", () => ({locale: async () => undefined}));

const loadConfig = async () => {
  const captured: {handler?: (params: {locale?: string}) => Promise<unknown>} = {};
  vi.doMock("next-intl/server", () => ({
    getRequestConfig: (handler: (params: {locale?: string}) => Promise<unknown>) => {
      captured.handler = handler;
      return handler;
    },
  }));
  vi.resetModules();
  await import("./request");
  return captured.handler!;
};

describe("the i18n request config", () => {
  it("serves a known locale", async () => {
    const handler = await loadConfig();
    const config = (await handler({locale: "pt-BR"})) as {locale: string; messages: unknown};
    expect(config.locale).toBe("pt-BR");
    expect(config.messages).toBeTruthy();
  });

  it("refuses a segment that only looks like a locale, instead of throwing on the import", async () => {
    // The exact production failures. Each one used to become
    // `import("../../messages/wp-login.php.json")`, which throws, which is a 500.
    const handler = await loadConfig();
    for (const segment of ["wp-login.php", ".env", "foo.bar", "en", "xx-YY", "../secrets"]) {
      notFound.mockClear();
      await expect(handler({locale: segment})).rejects.toThrow("NEXT_NOT_FOUND");
      expect(notFound, segment).toHaveBeenCalled();
    }
  });

  it("still validates when next-intl resolves nothing", async () => {
    const handler = await loadConfig();
    await expect(handler({})).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
