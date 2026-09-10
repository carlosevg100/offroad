import type {GovernedMaterialPackage} from "@/lib/deal-state/materials";

export type PrivateMaterialArtifactId = "teaser" | "financial_model" | "indicative_term_sheet" | "data_room_index";
export type PrivateMaterialActionKind = "excel" | "open" | "pdf" | "word" | "powerpoint";

export type PrivateMaterialArtifact = {
  actions: Array<{href: string; kind: PrivateMaterialActionKind}>;
  available: boolean;
  id: PrivateMaterialArtifactId;
};

/** An approval for an earlier package must never label regenerated materials as approved. */
export function privateMaterialPackageApproved(
  review: {status: string; dependencies: unknown; payload: unknown} | null,
  artifactFingerprint: string,
): boolean {
  if (!review || review.status !== "approved" || !Array.isArray(review.dependencies)) return false;
  const payload = review.payload;
  if (!payload || typeof payload !== "object" || !("approval" in payload)) return false;
  const approval = payload.approval;
  if (!approval || typeof approval !== "object" || !("artifactFingerprint" in approval)
    || approval.artifactFingerprint !== artifactFingerprint) return false;
  return review.dependencies.some((item: unknown) => Boolean(item && typeof item === "object"
    && "objectType" in item && item.objectType === "material_artifact"
    && "objectFingerprint" in item && item.objectFingerprint === artifactFingerprint));
}

/**
 * One governed package, several delivery formats. All document links resolve the same immutable
 * material blocks, while the spreadsheet is regenerated and hash-checked by its own route.
 */
export function privateMaterialArtifacts(
  governed: GovernedMaterialPackage,
  locale: "pt-BR" | "en-US",
  sessionId: string,
): PrivateMaterialArtifact[] {
  const materialBase = `/${locale}/app/materials/${sessionId}`;
  const has = (kind: GovernedMaterialPackage["materials"][number]["kind"]) => (
    governed.materials.some((item) => item.kind === kind)
  );

  const artifacts: PrivateMaterialArtifact[] = [
    {
      id: "teaser",
      available: has("teaser"),
      actions: [
        {kind: "pdf", href: `${materialBase}/teaser/pdf`},
        {kind: "word", href: `${materialBase}/teaser/docx`},
        {kind: "powerpoint", href: `${materialBase}/teaser/pptx`},
      ],
    },
    {
      id: "financial_model",
      available: Boolean(governed.financialModel),
      actions: [{kind: "excel", href: `/${locale}/app/model/${sessionId}`}],
    },
    {
      id: "indicative_term_sheet",
      available: has("term_sheet"),
      actions: [
        {kind: "pdf", href: `${materialBase}/term_sheet/pdf`},
        {kind: "word", href: `${materialBase}/term_sheet/docx`},
      ],
    },
    {
      id: "data_room_index",
      available: has("data_room_index"),
      actions: [
        {kind: "open", href: `${materialBase}/data_room_index`},
        {kind: "word", href: `${materialBase}/data_room_index/docx`},
      ],
    },
  ];
  // The package may retain other outputs, but this review concerns only the approved plan.
  // A deliberately small materials task must not wait for four unrelated deliverables.
  return artifacts.filter((artifact) => governed.plannedArtifacts.includes(artifact.id));
}
