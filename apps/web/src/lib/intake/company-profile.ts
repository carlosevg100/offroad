/**
 * Accepts the way people naturally type a company website and stores one
 * canonical HTTP(S) URL. The form intentionally does not rely on the browser's
 * native `type=url` validation because that blocks submission without showing
 * our product-level error state when the protocol is omitted.
 */
export function normalizeCompanyWebsite(raw: string) {
  const website = raw.trim();
  if (!website) return "";
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}
