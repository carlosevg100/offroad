import {getTranslations} from "next-intl/server";
import type {CapitalProjectReviewBasis} from "@/lib/artifacts/capital-project-review";
import {OriginationDecision} from "./origination-decision";

/** Native S11 commands target the exact physically read revision. The existing
 * command component uses v2 and rechecks human policy and assignment in SQL. */
export async function CapitalPlanningNativeReview({locale,basis}:{locale:string;basis:CapitalProjectReviewBasis}) {
 const t=await getTranslations({locale,namespace:"App.capitalPlanning"});
 if(basis.status==="superseded"||basis.status==="stale")return null;
 return <OriginationDecision artifactId={basis.artifactId} fingerprint={basis.artifactFingerprint}
  locale={locale} projectId={basis.projectId} reviewBasis={basis} copy={{
   confirm:t("decision.confirm"),confirmed:t("decision.confirmed"),errorInvalid:t("decision.errors.invalid"),
   errorSave:t("decision.errors.save"),errorStale:t("decision.errors.stale"),note:t("decision.note"),
   notePlaceholder:t("decision.notePlaceholder"),requestChanges:t("decision.requestChanges"),requested:t("decision.requested"),title:t("decision.title"),
  }}/>;
}
