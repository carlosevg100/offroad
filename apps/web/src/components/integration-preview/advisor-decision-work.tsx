import type {DecisionArtifactContract} from "@offroad/case-understanding";
import {useTranslations} from "next-intl";
import {DecisionArtifactWork} from "./decision-artifact-work";
import {IntegrationPreviewWork, isSupportedPreviewArtifact, type PreviewArtifactView} from "./integration-preview-work";

type Props = {
  contract: DecisionArtifactContract | null;
  artifacts: PreviewArtifactView[];
  locale: "pt-BR" | "en-US";
  materialHref?: string;
};

/** The readout and the complete method outputs are complementary views of existing evidence. */
export function AdvisorDecisionWork({contract, artifacts, locale, materialHref}: Props) {
  const t = useTranslations("IntegrationPreviewWork");
  const hasReadout = Boolean(contract?.views.some((view) => view.surface === "conversation"));
  const methods = artifacts.filter((artifact) => isSupportedPreviewArtifact(artifact.type));
  if (!contract && !methods.length) return null;
  return <div className="advisor-decision-work">
    {contract && hasReadout ? <DecisionArtifactWork contract={contract} locale={locale} materialHref={materialHref} /> : <section className="advisor-decision-work__unavailable" data-testid="decision-readout-unavailable">
      <h2>{t("decisionUnavailable")}</h2>
      <p>{t("availableResults")}</p>
    </section>}
    {methods.length ? <details className="advisor-decision-work__methods" data-testid="decision-method-inspection">
      <summary>{t("inspectMethods")}</summary>
      <IntegrationPreviewWork artifacts={methods} locale={locale} materialHref={materialHref} />
    </details> : null}
  </div>;
}
