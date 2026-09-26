import {
  caseExportVersion,
  institutionalPresentationRendererVersion,
  materialPdfRendererVersion,
  materialToDocx,
  materialToPdf,
  materialToPptx,
  type DocxLang,
  type DocxMeta,
} from "@offroad/case-export";
import type {Material} from "@offroad/case-materials";
import {materialHtmlRendererVersion, renderMaterialHtml, type RenderMeta} from "@offroad/case-render";
import {governedWorkbookRendererVersion, renderApprovedInstitutionalFinancialWorkbook} from "@offroad/financial-model";

/**
 * The package functions that produce the bytes of an artifact revision, by the name a manifest
 * uses for them. A manifest pins a renderer and its version; the reader maps that name here and
 * refuses any name or version this build cannot reproduce. The routes use the same entries for
 * revisions that pin no bytes, so there is exactly one serializer per format.
 */

export type MaterialRenderInput = {material: Material; lang: DocxLang; meta: DocxMeta};

type Entry<Family extends string, Format extends string, Produce> = {
  readonly id: string;
  readonly family: Family;
  readonly format: Format;
  /** The version a pinned manifest must name for this build to promise the same bytes. */
  readonly version: string;
  readonly produce: Produce;
};

const institutionalWorkbook = (id: "institutional-workbook-snapshot.v1" | "institutional-workbook-editable.v2") => ({
  id,
  family: "institutional_workbook" as const,
  format: "xlsx" as const,
  // The institutional adapter names the artifact version as renderer and the workbook renderer as its version.
  version: governedWorkbookRendererVersion,
  produce: (artifact: unknown, lang: DocxLang): Promise<Uint8Array | null> => renderApprovedInstitutionalFinancialWorkbook(artifact, lang),
});

export const artifactRenderers = {
  "case-export.material-docx": {
    id: "case-export.material-docx", family: "material", format: "docx", version: caseExportVersion,
    produce: async (input: MaterialRenderInput): Promise<Uint8Array> => materialToDocx(input),
  },
  "case-export.material-pdf": {
    id: "case-export.material-pdf", family: "material", format: "pdf", version: materialPdfRendererVersion,
    produce: (input: MaterialRenderInput): Promise<Uint8Array> => materialToPdf(input),
  },
  "case-export.material-pptx": {
    id: "case-export.material-pptx", family: "material", format: "pptx", version: institutionalPresentationRendererVersion,
    produce: (input: MaterialRenderInput): Promise<Uint8Array> => materialToPptx(input),
  },
  "case-render.material-html": {
    id: "case-render.material-html", family: "html", format: "html", version: materialHtmlRendererVersion,
    produce: (input: {material: Material; lang: DocxLang; meta: RenderMeta}): string => renderMaterialHtml(input),
  },
  "institutional-workbook-snapshot.v1": institutionalWorkbook("institutional-workbook-snapshot.v1"),
  "institutional-workbook-editable.v2": institutionalWorkbook("institutional-workbook-editable.v2"),
} as const satisfies Record<string,
  | Entry<"material", "docx" | "pdf" | "pptx", (input: MaterialRenderInput) => Promise<Uint8Array>>
  | Entry<"html", "html", (input: {material: Material; lang: DocxLang; meta: RenderMeta}) => string>
  | Entry<"institutional_workbook", "xlsx", (artifact: unknown, lang: DocxLang) => Promise<Uint8Array | null>>>;

export type ArtifactRendererId = keyof typeof artifactRenderers;
export type ArtifactRendererEntry = (typeof artifactRenderers)[ArtifactRendererId];
export type MaterialFileFormat = "docx" | "pdf" | "pptx";

/** The single material serializer of each file format. */
export const materialRendererByFormat = {
  docx: artifactRenderers["case-export.material-docx"],
  pdf: artifactRenderers["case-export.material-pdf"],
  pptx: artifactRenderers["case-export.material-pptx"],
} as const satisfies Record<MaterialFileFormat, ArtifactRendererEntry>;

export function artifactRendererEntry(id: string): ArtifactRendererEntry | null {
  return Object.hasOwn(artifactRenderers, id) ? artifactRenderers[id as ArtifactRendererId] : null;
}

export function isMaterialFileFormat(format: string): format is MaterialFileFormat {
  return Object.hasOwn(materialRendererByFormat, format);
}
