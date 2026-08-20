import * as rootParams from "next/root-params";
import {hasLocale} from "next-intl";
import {getRequestConfig} from "next-intl/server";
import {notFound} from "next/navigation";

import {routing} from "./routing";

/**
 * The locale is validated before it is ever used to build a path.
 *
 * The guard used to sit inside the `!locale` branch, which meant it only ran when next-intl had
 * failed to resolve a locale itself. Any caller that passed one explicitly skipped it, and the
 * raw URL segment reaches `getTranslations({locale})` in fifteen route files. So a request for
 * `/wp-login.php` became `import("../../messages/wp-login.php.json")`, which throws, which is a
 * 500.
 *
 * That was live in production: `/wp-login.php`, `/.env` and `/foo.bar` all returned 500 while
 * `/nonexistentpage` correctly returned 307, because only a segment containing a dot escapes the
 * static-file matcher and reaches this code. Every bot scanning for WordPress was generating a
 * server error, which is both noise that would have drowned an error tracker and a signal that
 * the application throws on untrusted input.
 *
 * Validating unconditionally is the whole fix: an unknown segment is a 404, which is what it was
 * always meant to be.
 */
export default getRequestConfig(async ({locale}) => {
  const candidate = locale ?? (await rootParams.locale());

  if (!hasLocale(routing.locales, candidate)) {
    notFound();
  }

  return {
    locale: candidate,
    messages: (await import(`../../messages/${candidate}.json`)).default,
    timeZone: "America/Sao_Paulo",
  };
});
