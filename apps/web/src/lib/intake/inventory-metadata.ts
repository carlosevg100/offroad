import {documentKindDefinition, documentKindSchema} from "@offroad/credit-ontology";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import type {Database} from "@/types/database";

export type InventoryMetadata = {classification: string | null; entityName: string | null; periodStart: string | null; periodEnd: string | null};
type Profile = Pick<Database["public"]["Tables"]["document_profiles"]["Row"], "document_version" | "document_kind" | "entity_name" | "period_start" | "period_end" | "review_state">;
const date = (value: unknown) => {const result = z.iso.date().safeParse(value); return result.success ? result.data : null;};

/** Initial classification is display metadata, never evidence that a requirement was met.
 * A stale or rejected profile cannot describe the currently received immutable version. */
export function inventoryMetadata(profile: Profile | null, version: number, locale: "pt-BR" | "en-US"): InventoryMetadata | null {
  if (!profile || profile.document_version !== version || !["proposed", "accepted"].includes(profile.review_state)) return null;
  const kind = documentKindSchema.safeParse(profile.document_kind);
  const entity = z.string().trim().min(1).max(300).safeParse(profile.entity_name);
  let periodStart = date(profile.period_start), periodEnd = date(profile.period_end);
  if (periodStart && periodEnd && periodStart > periodEnd) {periodStart = null; periodEnd = null;}
  return {classification: kind.success ? documentKindDefinition(kind.data).labels[locale === "pt-BR" ? "pt" : "en"] : null,
    entityName: entity.success ? entity.data : null, periodStart, periodEnd};
}

/** The page supplies only its already-authorized document IDs. Reading through source_versions
 * rechecks version rights in the same statement as the exact-version profile join. No profile
 * cache, service credential, old-version fallback or filename lookup is used. */
export async function loadInventoryMetadata(supabase: SupabaseClient<Database>, organizationId: string, documents: readonly {id: string; document_version: number}[], locale: "pt-BR" | "en-US") {
  const batches = Array.from({length: Math.ceil(documents.length / 100)}, (_, n) => documents.slice(n * 100, (n + 1) * 100));
  const results = await Promise.all(batches.map(batch => supabase.from("source_versions")
    .select("id, legacy_document_version, document_profiles!document_profiles_exact_source_version_fkey(document_version, document_kind, entity_name, period_start, period_end, review_state)")
    .eq("organization_id", organizationId).in("id", batch.map(d => d.id))));
  const versions = new Map(documents.map(d => [d.id, d.document_version]));
  const metadata = new Map<string, InventoryMetadata | null>();
  for (const result of results) for (const row of result.data ?? []) {
    const expected = versions.get(row.id);
    if (expected !== undefined && expected === row.legacy_document_version) metadata.set(row.id, inventoryMetadata(row.document_profiles, expected, locale));
  }
  return metadata;
}
