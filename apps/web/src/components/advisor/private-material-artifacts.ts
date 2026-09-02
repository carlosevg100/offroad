import type {GovernedMaterialPackage} from "@/lib/deal-state/materials";

export type PrivateMaterialArtifactId = "teaser" | "financial_model" | "indicative_term_sheet" | "data_room_index";
export type PrivateMaterialActionKind = "excel" | "open" | "pdf" | "word";

export type PrivateMaterialArtifact = {
  actions: Array<{href: string; kind: PrivateMaterialActionKind}>;
  available: boolean;
  id: PrivateMaterialArtifactId;
};

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

  return [
    {
      id: "teaser",
      available: has("teaser"),
      actions: [{kind: "pdf", href: `${materialBase}/teaser?print=1`}],
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
        {kind: "pdf", href: `${materialBase}/term_sheet?print=1`},
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
}
