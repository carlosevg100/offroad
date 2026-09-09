import {getTranslations} from "next-intl/server";
import type {DocumentWorkProductLabels} from "./document-work-product-material";

export async function documentWorkProductLabels(locale:"pt-BR"|"en-US"):Promise<DocumentWorkProductLabels> {
  const t=await getTranslations({locale,namespace:"App.documentWorkProduct"});
  return {comparisonTitle:t("comparisonTitle"),meetingTitle:t("meetingTitle"),reviewTitle:t("reviewTitle"),preliminary:t("preliminary"),insufficientEvidence:t("insufficientEvidence"),scope:t("scope"),scopeBody:t("scopeBody"),hypotheses:t("hypotheses"),gaps:t("gaps"),question:t("question"),evidence:t("evidence"),sources:t("sources"),coverage:t("coverage"),documents:t("documents"),omitted:t("omitted"),download:t("download"),version:t("version")};
}
