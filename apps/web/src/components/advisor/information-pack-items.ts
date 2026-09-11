import {privateMaterialArtifacts, type PrivateMaterialActionKind} from "./private-material-artifacts";
import type {GovernedMaterialPackage} from "@/lib/deal-state/materials";

/** The delivery formats of the deliverable format policy. The pack records the one it exported. */
export type InformationPackFormat = "interactive" | "xlsx" | "pptx" | "docx" | "pdf";

export type PresentationTemplateIdentity = {
  key: string;
  version: string;
  origin: "offroad_house" | "client_supplied";
  fingerprint: string | null;
};

export type InformationPackItemInput = {
  deliverableId: string;
  format: InformationPackFormat;
  artifactFingerprint: string;
  templateKey: string;
  templateVersion: string;
  templateOrigin: "offroad_house" | "client_supplied";
  templateFingerprint?: string;
  sourceResultIds: string[];
  title: string;
};

/** The Offroad template that a project uses until it binds its own visual identity. */
export const houseTemplateIdentity: PresentationTemplateIdentity = {
  key: "offroad-house",
  version: "2026.09.07-v1",
  origin: "offroad_house",
  fingerprint: null,
};

const formatByAction: Readonly<Record<PrivateMaterialActionKind, InformationPackFormat>> = {
  excel: "xlsx",
  open: "interactive",
  pdf: "pdf",
  word: "docx",
  powerpoint: "pptx",
};

/**
 * The exact files a pack revision would carry: one row per available deliverable and format of the
 * approved material package, each keeping the fingerprint of the artifact it renders, the template
 * identity and version that produced it, and the governed results behind it. This never renders
 * anything and never invents a file that the package does not have.
 */
export function informationPackItems(input: {
  governed: GovernedMaterialPackage;
  locale: "pt-BR" | "en-US";
  sessionId: string;
  sourceResultIds: readonly string[];
  template: PresentationTemplateIdentity;
  titles: Readonly<Record<string, string>>;
}): InformationPackItemInput[] {
  const sourceResultIds = [...new Set(input.sourceResultIds)].sort().slice(0, 50);
  return privateMaterialArtifacts(input.governed, input.locale, input.sessionId)
    .filter((artifact) => artifact.available)
    .flatMap((artifact) => artifact.actions.map((action) => ({
      deliverableId: artifact.id,
      format: formatByAction[action.kind],
      artifactFingerprint: input.governed.artifactFingerprint,
      templateKey: input.template.key,
      templateVersion: input.template.version,
      templateOrigin: input.template.origin,
      ...(input.template.fingerprint ? {templateFingerprint: input.template.fingerprint} : {}),
      sourceResultIds,
      title: input.titles[artifact.id] ?? artifact.id,
    })));
}

/** Two pack proposals are the same pack when every exported file matches, in the same order. */
export function informationPackItemsMatch(
  left: readonly InformationPackItemInput[],
  right: readonly InformationPackItemInput[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return Boolean(other)
      && item.deliverableId === other!.deliverableId
      && item.format === other!.format
      && item.artifactFingerprint === other!.artifactFingerprint
      && item.templateKey === other!.templateKey
      && item.templateVersion === other!.templateVersion
      && item.templateOrigin === other!.templateOrigin
      && (item.templateFingerprint ?? null) === (other!.templateFingerprint ?? null);
  });
}
