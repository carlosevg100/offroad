/** Preserve every decimal digit; formatting is never an input conversion. */
export function formatBasisValue(value: {type: string; value: unknown} | null, locale: string, labels: {absent:string;yes:string;no:string}): string {
 if (!value || value.value === null) return labels.absent;
 if (value.type === "boolean") return value.value ? labels.yes : labels.no;
 if (Array.isArray(value.value)) return value.value.join(", ");
 const raw=String(value.value);
 if(value.type === "number" && /^-?\d+(?:\.\d+)?$/.test(raw)) {
  const negative=raw.startsWith("-");
  const [integer,fraction]=raw.replace(/^-/,"").split(".");
  const grouped=new Intl.NumberFormat(locale).format(BigInt(integer!));
  const separator=new Intl.NumberFormat(locale).formatToParts(1.1).find(p=>p.type==="decimal")?.value??".";
  return `${negative?"-":""}${grouped}${fraction===undefined?"":separator+fraction}`;
 }
 return raw;
}
