import type {DocxMeta} from "@offroad/case-export";
import {
  deliverableFormatAllowed,
  type DeliverableContext,
  type DeliverableFormatBlock,
  type DeliverableType,
} from "@offroad/case-export/deliverable-formats";
import type {InstitutionalPresentationTemplate} from "@offroad/case-export/presentation-template";
import type {Material} from "@offroad/case-materials";

import {isMaterialFileFormat, materialRendererByFormat} from "./artifact-renderers";

/**
 * The single file serializer of an artifact revision. The materials routes, the approved financial
 * result and the documentary work product used to call the docx, pdf and pptx writers each in their
 * own way; they now pass here, where the delivery's format policy is applied once, the approved
 * numbers are replayed before any file, and every date and identity comes from the revision, never
 * from the clock of the request.
 */

export type ArtifactFileFormat = "docx" | "pdf" | "pptx" | "xlsx";

export type RenderArtifactRevisionInput = {
  /** What the served revision fixes: the date of the version and the identity it renders with. */
  revision: {issuedOn: string; template?: InstitutionalPresentationTemplate};
  format: string;
  lang: "pt" | "en";
  /** The document of the revision, compiled only when a document format is asked for. */
  material?: () => Material;
  meta?: Pick<DocxMeta, "companyName" | "preparedBy" | "referenceTargets">;
  /** The delivery's format policy; a delivery without one offers every document format. */
  policy?: {types: readonly DeliverableType[]; context: DeliverableContext};
  /** Replays the approved numbers before any file; null blocks the delivery. For xlsx these are the bytes. */
  reproduce?: () => Promise<Uint8Array | null>;
};

export type RenderArtifactRevisionResult =
  | {ok: true; bytes: Uint8Array; format: ArtifactFileFormat}
  | {ok: false; block: DeliverableFormatBlock | "format_not_in_policy"};

export async function renderArtifactRevision(input: RenderArtifactRevisionInput): Promise<RenderArtifactRevisionResult> {
  if (input.policy) {
    const decision = deliverableFormatAllowed(input.policy.types, input.format, input.policy.context);
    if (!decision.allowed) return {ok: false, block: decision.block};
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.revision.issuedOn)) throw new Error("artifact_render_issue_date_invalid");
  let replayed: Uint8Array | null = null;
  if (input.reproduce) {
    replayed = await input.reproduce();
    if (!replayed) return {ok: false, block: "reproduction_divergence"};
  }
  if (input.format === "xlsx") return replayed ? {ok: true, bytes: replayed, format: "xlsx"} : {ok: false, block: "format_not_in_policy"};
  if (!isMaterialFileFormat(input.format) || !input.material) return {ok: false, block: "format_not_in_policy"};
  const bytes = await materialRendererByFormat[input.format].produce({
    material: input.material(),
    lang: input.lang,
    meta: {...input.meta, issuedOn: input.revision.issuedOn, ...(input.revision.template ? {template: input.revision.template} : {})},
  });
  return {ok: true, bytes, format: input.format};
}
