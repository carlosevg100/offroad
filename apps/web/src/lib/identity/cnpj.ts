/** A CNPJ as the Receita Federal defines it: twelve characters (digits, or since July 2026 also
 * uppercase letters) and two check digits, each a weighted sum modulo 11 over the character values
 * (ASCII code minus 48). Formatting characters are ignored. Returns the fourteen characters, or null. */
export function normalizeCnpj(raw: string): string | null {
  const v = raw.toUpperCase().replace(/[.\-/\s]/g, "");
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(v) || /^(\d)\1{13}$/.test(v)) return null;
  const check = (body: string) => {
    const weights = body.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = [...body].reduce((t, c, i) => t + (c.charCodeAt(0) - 48) * weights[i]!, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const first = check(v.slice(0, 12)), second = check(v.slice(0, 12) + first);
  return v.endsWith(`${first}${second}`) ? v : null;
}
