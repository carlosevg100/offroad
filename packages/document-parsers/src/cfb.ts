import * as XLSX from "xlsx";

/**
 * Office 97–2003 files (`.xls`, `.doc`, `.ppt`) are all the same container — OLE2/CFB — so
 * their magic bytes are identical (`d0 cf 11 e0 a1 b1 1a e1`) and content sniffing alone
 * cannot tell a spreadsheet from a letter. What distinguishes them is the name of the main
 * stream inside the container, which is what this reads.
 *
 * Deciding from the container instead of the file extension matters here: these formats are
 * old enough that renamed files are common (a `.doc` that is really a `.xls` is a classic of
 * accounting departments), and the extension is exactly the part an attacker controls.
 */
export type CfbSubtype = "xls" | "doc" | "ppt" | "unknown";

const streamMarkers: readonly {subtype: CfbSubtype; names: readonly string[]}[] = [
  {subtype: "xls", names: ["Workbook", "Book"]},
  {subtype: "doc", names: ["WordDocument"]},
  {subtype: "ppt", names: ["PowerPoint Document", "Current User"]},
];

export function detectCfbSubtype(bytes: Uint8Array): CfbSubtype {
  let names: string[];
  try {
    const container = XLSX.CFB.read(bytes, {type: "array"});
    const entries = (container.FileIndex ?? []) as {name?: string}[];
    names = entries.map((entry) => entry?.name ?? "").filter(Boolean);
  } catch {
    return "unknown";
  }

  for (const marker of streamMarkers) {
    if (marker.names.some((name) => names.includes(name))) return marker.subtype;
  }
  return "unknown";
}

export const cfbMimeTypes: Record<Exclude<CfbSubtype, "unknown">, string> = {
  xls: "application/vnd.ms-excel",
  doc: "application/msword",
  ppt: "application/vnd.ms-powerpoint",
};
