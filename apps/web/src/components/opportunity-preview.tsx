import {Check, FileCheck2, Gauge, ShieldCheck} from "lucide-react";
import {useTranslations} from "next-intl";

const metrics = [
  ["metricRevenue", "metricRevenueValue"],
  ["metricEbitda", "metricEbitdaValue"],
  ["metricDscr", "metricDscrValue"],
  ["metricCapacity", "metricCapacityValue"],
] as const;

export function OpportunityPreview() {
  const t = useTranslations("Home");

  return (
    <figure className="opportunity-preview">
      <figcaption className="opportunity-preview__caption">
        <span>{t("productPreview")}</span>
        <span className="live-dot" aria-hidden="true" />
      </figcaption>

      <div className="opportunity-window">
        <div className="opportunity-window__bar">
          <div>
            <span className="mono-label">{t("opportunity")}</span>
            <span className="status-pill">
              <Check aria-hidden="true" size={11} strokeWidth={2.5} />
              {t("opportunityStatus")}
            </span>
          </div>
          <span className="window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>

        <div className="opportunity-window__heading">
          <div>
            <span className="micro-label">{t("company")}</span>
            <h2>{t("facility")}</h2>
          </div>
          <span className="verified-badge">
            <ShieldCheck aria-hidden="true" size={15} />
            {t("verified")}
          </span>
        </div>

        <div className="metric-grid">
          {metrics.map(([label, value], index) => (
            <div className="metric-card" key={label}>
              <div className="metric-card__top">
                <span>{t(label)}</span>
                {index < 2 ? (
                  <FileCheck2 aria-hidden="true" size={14} />
                ) : (
                  <Gauge aria-hidden="true" size={14} />
                )}
              </div>
              <strong>{t(value)}</strong>
              <span className={`sparkline sparkline--${index + 1}`} aria-hidden="true">
                <i />
              </span>
            </div>
          ))}
        </div>

        <div className="provenance-strip">
          <div>
            <span>{t("sourceLabel")}</span>
            <strong>{t("sourceValue")}</strong>
          </div>
          <div>
            <span>{t("policyLabel")}</span>
            <strong>{t("policyValue")}</strong>
          </div>
          <div>
            <span>{t("reviewLabel")}</span>
            <strong>{t("reviewValue")}</strong>
          </div>
        </div>
      </div>
      <p className="opportunity-preview__disclaimer">{t("previewDisclaimer")}</p>
    </figure>
  );
}
