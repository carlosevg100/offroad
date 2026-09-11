import {materialToDocx, materialToPdf, materialToPptx} from "@offroad/case-export";
import type {MaterialKind} from "@offroad/case-materials";
import {z} from "zod";

import {requireWorkspace} from "@/lib/auth/workspace";
import {governedMaterial, governedMaterialPackageFromRows} from "@/lib/deal-state/materials";
import type {DealStateRow} from "@/lib/deal-state/workbench";

type Params = {params: Promise<{locale: string; shareId: string; itemId: string}>};

const kindByDeliverable: Readonly<Record<string, MaterialKind>> = {
  teaser: "teaser",
  indicative_term_sheet: "term_sheet",
  data_room_index: "data_room_index",
};

const payloadSchema = z.object({
  deliverable_id: z.string(),
  format: z.enum(["interactive", "xlsx", "pptx", "docx", "pdf"]),
  revision_number: z.number().int().positive(),
  artifact_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  deal_state_rows: z.array(z.record(z.string(), z.unknown())),
});

/**
 * The exact authorized file, served to the recipient organization that may open it. The database
 * command verifies the live share, refuses when the project moved past the authorized revision,
 * and records the read. The bytes come from the same renderer that produced the issuer's file.
 */
export async function GET(_request: Request, {params}: Params) {
  const {locale, shareId, itemId} = await params;
  const lang = locale === "en-US" ? "en" : "pt";
  if (!z.uuid().safeParse(shareId).success || !z.uuid().safeParse(itemId).success) {
    return new Response("Not found", {status: 404});
  }

  const {supabase} = await requireWorkspace(locale);
  const {data, error} = await supabase.rpc("read_shared_pack_item_material", {
    p_share_id: shareId,
    p_item_id: itemId,
  });
  if (error) {
    const outdated = error.message.includes("revision_outdated");
    return new Response(
      outdated
        ? (lang === "pt"
          ? "Esta revisão do pacote não corresponde mais ao material do projeto. Peça uma revisão atualizada."
          : "This pack revision no longer matches the project material. Ask for an updated revision.")
        : (lang === "pt" ? "Este pacote não está disponível." : "This pack is not available."),
      {status: outdated ? 409 : 403},
    );
  }
  const payload = payloadSchema.safeParse(data);
  if (!payload.success) return new Response("Not found", {status: 404});

  const kind = kindByDeliverable[payload.data.deliverable_id];
  const governed = governedMaterialPackageFromRows(payload.data.deal_state_rows as unknown as DealStateRow[]);
  const material = kind && governed ? governedMaterial(governed, kind) : null;
  if (!material || !governed) {
    return new Response(
      lang === "pt" ? "Este arquivo não pode ser aberto neste formato." : "This file cannot be opened in this format.",
      {status: 409},
    );
  }

  const meta = {issuedOn: governed.issuedOn};
  const filename = `${payload.data.deliverable_id}-r${payload.data.revision_number}-${payload.data.artifact_fingerprint.slice(0, 12)}`;
  if (payload.data.format === "pdf") {
    const bytes = await materialToPdf({material, lang, meta});
    return fileResponse(bytes, "application/pdf", `${filename}.pdf`);
  }
  if (payload.data.format === "docx") {
    const bytes = materialToDocx({material, lang, meta});
    return fileResponse(bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", `${filename}.docx`);
  }
  if (payload.data.format === "pptx") {
    const bytes = await materialToPptx({material, lang, meta});
    return fileResponse(bytes, "application/vnd.openxmlformats-officedocument.presentationml.presentation", `${filename}.pptx`);
  }
  return new Response("Not found", {status: 404});
}

function fileResponse(bytes: Uint8Array, contentType: string, filename: string) {
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
