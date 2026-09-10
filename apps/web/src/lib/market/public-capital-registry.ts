import {z} from "zod";
import snapshot from "./public-capital-registry.json";

const schema = z.object({
  schemaVersion: z.literal("offroad.public-capital-registry-summary.v1"),
  generatedAt: z.string().datetime({offset: true}), registryReferenceDate: z.null(),
  sources: z.array(z.object({id: z.string(), url: z.string().url().refine(value => new URL(value).protocol === "https:"), downloadedAt: z.string().datetime({offset: true}), sha256: z.string().regex(/^[a-f0-9]{64}$/), license: z.string()})),
  records: z.array(z.discriminatedUnion("kind", [
    z.object({id: z.string(), identity: z.string().regex(/^\d{14}$/), name: z.string(), kind: z.literal("cvm_manager"), sourceId: z.string(), activeCandidateFunds: z.number().int().positive()}),
    z.object({id: z.string(), identity: z.string().regex(/^\d{8}$/), name: z.string(), kind: z.literal("bcb_root"), sourceId: z.string(), segment: z.string().nullable(), collection: z.enum(["SedesBancoComMultCE", "SedesCooperativas", "SedesSociedades", "SedesConsorcios"])}),
  ])),
}).superRefine((data, ctx) => {
  const sourceIds = new Set(data.sources.map(row => row.id));
  if (new Set(data.records.map(row => row.id)).size !== data.records.length) ctx.addIssue({code: "custom", message: "Duplicate registry identity"});
  for (const row of data.records) if (!sourceIds.has(row.sourceId) || row.id !== `${row.kind === "cvm_manager" ? "cnpj" : "bcb-root"}:${row.identity}`) ctx.addIssue({code: "custom", message: "Invalid registry identity or evidence"});
});
export const parsePublicCapitalRegistry = (value: unknown) => schema.parse(value);
export const publicCapitalRegistry = parsePublicCapitalRegistry(snapshot);
export type PublicCapitalRegistry = z.infer<typeof schema>;
export function searchPublicCapitalRegistry(registry: PublicCapitalRegistry, query: string, kind: "all" | "cvm_manager" | "bcb_root", page = 0) {
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const text = normalize(query.trim());
  const numeric = text.replace(/\D/g, "");
  const matches = registry.records.filter(row => (kind === "all" || row.kind === kind) && (!text || normalize(`${row.name} ${row.kind === "bcb_root" ? [row.segment, row.collection].join(" ") : ""}`).includes(text) || (numeric.length > 0 && /^[\d.\-/\s]+$/.test(text) && row.identity.includes(numeric))));
  const pageIndex = Math.max(0, Math.min(Math.floor(Number.isFinite(page) ? page : 0), Math.max(0, Math.ceil(matches.length / 25) - 1)));
  return {total: matches.length, page: pageIndex, pages: Math.ceil(matches.length / 25), rows: matches.slice(pageIndex * 25, pageIndex * 25 + 25)};
}
