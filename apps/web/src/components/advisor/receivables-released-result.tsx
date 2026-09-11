import {specialistMethodRuntimeManifest} from "@offroad/credit-playbook";
import {getTranslations} from "next-intl/server";

import type {ReceivablesReleasedResult} from "@/lib/receivables/released-result";

type Locale = "pt-BR" | "en-US";
type Result = NonNullable<ReceivablesReleasedResult["result"]>;
type Content = Result["artifact"]["content"];

const performanceMetricIds = [
  "delinquency1Share", "delinquency30Share", "delinquency90Share", "grossDefaultRate",
  "netLossRate", "recoveryRate", "dilutionRate", "repurchaseRate", "substitutionRate",
] as const;

function money(locale: Locale, currency: string, value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat(locale, {style: "currency", currency, maximumFractionDigits: 2}).format(parsed)
    : value;
}

function share(locale: Locale, value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat(locale, {style: "percent", maximumFractionDigits: 2}).format(parsed)
    : value;
}

function plain(locale: Locale, value: string | number, digits = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat(locale, {maximumFractionDigits: digits}).format(parsed)
    : String(value);
}

function Pair({label, value}: {label: string; value: string}) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

/** The founder approval that took the method to production, read from the compiled method. */
const methodApproval = specialistMethodRuntimeManifest
  .find((method) => method.procedure.id === "underwrite-receivables-pool")?.approval ?? null;

function approvalDate(locale: Locale, isoDate: string) {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? isoDate
    : new Intl.DateTimeFormat(locale, {dateStyle: "long", timeZone: "UTC"}).format(parsed);
}

/**
 * The organization's own released R01 analysis. Every number here comes from the stored
 * deterministic result; nothing is recomputed in the browser and no absent measurement is
 * rendered as a zero. External direction, financier recommendation and credit approval are
 * outside this component by construction: the released contract carries none of them.
 */
export async function ReceivablesReleasedResultSection({released, locale}: {released: ReceivablesReleasedResult; locale: Locale}) {
  const t = await getTranslations({locale, namespace: "ReceivablesReleasedResult"});

  if (released.state === "superseded") {
    return <section
      className="information-request-card"
      data-testid="receivables-released-superseded"
      data-superseded-reason={released.supersededReason ?? "unknown"}
      style={{padding: 24}}
    >
      <h3>{t("supersededTitle")}</h3>
      <p>{t("supersededBody")}</p>
      {released.supersededReason ? <p>{t(`supersededReason.${released.supersededReason}`)}</p> : null}
      <p>{t("limitations.assumptions")}</p>
    </section>;
  }
  if (released.state !== "current" || !released.result) return null;

  const result = released.result;
  const content: Content = result.artifact.content;
  const currency = content.currency;
  const summary = content.portfolio_summary;
  const base = content.borrowing_base;
  const policy = content.trace.policy;
  const coverage = content.history_coverage;
  const conventions = content.economic_conventions;
  const evidenceRefs = result.artifact.evidenceRefs;
  const computedAt = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short"})
    .format(new Date(result.createdAt));

  return <section
    className="information-request-card"
    data-testid="receivables-released-result"
    data-decision={content.decision_boundary.status}
    data-method-maturity={result.methodMaturity}
    style={{display: "flex", flexDirection: "column", gap: 24, padding: 24}}
  >
    <header>
      <h3>{t("title")}</h3>
      <p><strong>{t(`decision.${content.decision_boundary.status}`)}</strong></p>
      <p>{t("subtitle")}</p>
      <p><small>{t("referenceDate")}: {content.reference_date} · {t("computedAt")}: {computedAt}</small></p>
    </header>

    <div data-testid="receivables-released-base">
      <h4>{t("portfolio.heading")}</h4>
      <dl style={{display: "flex", flexWrap: "wrap", gap: 24}}>
        <Pair label={t("portfolio.titleCount")} value={plain(locale, summary.receivableCount, 0)} />
        <Pair label={t("portfolio.debtorCount")} value={plain(locale, summary.debtorCount, 0)} />
        <Pair label={t("portfolio.groupCount")} value={plain(locale, summary.debtorGroupCount, 0)} />
        <Pair label={t("portfolio.totalOutstanding")} value={money(locale, currency, summary.totalOutstanding)} />
        <Pair label={t("portfolio.preliminaryEligible")} value={money(locale, currency, summary.preliminaryEligibleBalance)} />
        <Pair label={t("portfolio.adjustedEligible")} value={money(locale, currency, summary.concentrationAdjustedEligibleBalance)} />
        <Pair label={t("portfolio.eligibleShare")} value={share(locale, summary.eligibleShare)} />
        <Pair label={t("portfolio.weightedAverageRemainingDays")} value={plain(locale, summary.weightedAverageRemainingDays)} />
      </dl>
      <p><small>{t("portfolio.convention")}</small></p>
      {conventions ? <p><small>{conventions.concentrationOrder.join(" · ")}</small></p> : null}
    </div>

    <div data-testid="receivables-released-facility">
      <h4>{t("facility.heading")}</h4>
      <dl style={{display: "flex", flexWrap: "wrap", gap: 24}}>
        <Pair label={t("facility.requested")} value={money(locale, currency, base.requestedFacility)} />
        <Pair label={t("facility.maximumByAdvanceRate")} value={money(locale, currency, base.maximumByAdvanceRate)} />
        <Pair label={t("facility.maximumByOvercollateralization")} value={money(locale, currency, base.maximumByOvercollateralization)} />
        <Pair label={t("facility.supported")} value={money(locale, currency, base.supportedFacility)} />
        <Pair label={t("facility.overcollateralizationAtRequest")} value={plain(locale, base.overcollateralizationAtRequest, 4)} />
        <Pair label={t("facility.requiredOvercollateralization")} value={plain(locale, base.requiredOvercollateralization, 4)} />
        <Pair label={t("facility.actualSubordination")} value={share(locale, base.actualSubordinationRate)} />
        <Pair label={t("facility.requiredSubordination")} value={share(locale, base.requiredSubordinationRate)} />
        <Pair label={t("facility.reserveTarget")} value={money(locale, currency, base.reserveTarget)} />
      </dl>
      <p><small>{t("facility.note")}</small></p>
    </div>

    <div data-testid="receivables-released-concentration">
      <h4>{t("concentration.heading")}</h4>
      <dl style={{display: "flex", flexWrap: "wrap", gap: 24}}>
        <Pair label={t("concentration.topDebtor")} value={share(locale, summary.topDebtorShare)} />
        <Pair label={t("concentration.topFiveDebtors")} value={share(locale, summary.topFiveDebtorShare)} />
        <Pair label={t("concentration.topGroup")} value={share(locale, summary.topGroupShare)} />
        <Pair label={t("concentration.debtorLimit")} value={share(locale, policy.maxSingleDebtorShare)} />
        <Pair label={t("concentration.groupLimit")} value={share(locale, policy.maxDebtorGroupShare)} />
        <Pair label={t("concentration.herfindahl")} value={plain(locale, summary.debtorHerfindahl, 6)} />
      </dl>
    </div>

    <div data-testid="receivables-released-waterfall">
      <h4>{t("waterfall.heading")}</h4>
      <p><small>{t("waterfall.convention")}</small></p>
      {content.waterfall.length === 0 ? <p>{t("waterfall.empty")}</p> : <div style={{overflowX: "auto"}}>
        <table>
          <thead><tr>
            <th scope="col">{t("waterfall.priority")}</th>
            <th scope="col">{t("waterfall.item")}</th>
            <th scope="col">{t("waterfall.due")}</th>
            <th scope="col">{t("waterfall.paid")}</th>
            <th scope="col">{t("waterfall.shortfall")}</th>
          </tr></thead>
          <tbody>{content.waterfall.map((line) => <tr key={`${line.priority}:${line.item}`}>
            <td>{plain(locale, line.priority, 0)}</td>
            <td>{t.has(`waterfall.items.${line.item}`) ? t(`waterfall.items.${line.item}`) : line.item}</td>
            <td>{money(locale, currency, line.due)}</td>
            <td>{money(locale, currency, line.paid)}</td>
            <td>{money(locale, currency, line.shortfall)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </div>

    <div data-testid="receivables-released-triggers">
      <h4>{t("triggers.heading")}</h4>
      <div style={{overflowX: "auto"}}>
        <table>
          <thead><tr>
            <th scope="col">{t("triggers.heading")}</th>
            <th scope="col">{t("triggers.actual")}</th>
            <th scope="col">{t("triggers.threshold")}</th>
            <th scope="col">{t("triggers.statusLabel")}</th>
          </tr></thead>
          <tbody>{content.triggers.map((trigger) => <tr key={trigger.id} data-trigger-status={trigger.status}>
            <td>{t.has(`triggers.ids.${trigger.id}`) ? t(`triggers.ids.${trigger.id}`) : trigger.id}</td>
            <td>{share(locale, trigger.actual)}</td>
            <td>{share(locale, trigger.threshold)}</td>
            <td>{t(`triggers.status.${trigger.status}`)} · {t(`triggers.consequence.${trigger.consequence}`)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>

    <div data-testid="receivables-released-gaps">
      <h4>{t("gaps.heading")}</h4>
      {content.gaps.length === 0 ? <p>{t("gaps.empty")}</p> : <ul>{content.gaps.map((entry) => <li key={entry.code} data-gap-severity={entry.severity}>
        <strong>{t(`gaps.severity.${entry.severity}`)} · {t(`gaps.scope.${entry.scope}`)}</strong>
        <span>{locale === "en-US" ? entry.message.en : entry.message.pt}</span>
      </li>)}</ul>}
    </div>

    <div data-testid="receivables-released-coverage">
      <h4>{t("coverage.heading")}</h4>
      <p><small>{t("coverage.note")}</small></p>
      {coverage ? <ul>{coverage.families.map((family) => <li key={family.id} data-coverage-status={family.status}>
        <strong>{t(`coverage.families.${family.id}`)}</strong>
        <span>{t(`coverage.status.${family.status}`)}</span>
        {family.unavailableMetricIds.length > 0
          ? <span>{t("coverage.unavailable")}: {family.unavailableMetricIds.join(", ")}</span> : null}
        {family.warnings.length > 0
          ? <span>{t("coverage.warnings")}: {family.warnings.join(", ")}</span> : null}
      </li>)}</ul> : <p>{t("coverage.absent")}</p>}
      {coverage && coverage.warnings.length > 0
        ? <p><small>{t("coverage.warnings")}: {coverage.warnings.join(", ")}</small></p> : null}
      <h4>{t("coverage.aggregateHeading")}</h4>
      <p><small>{t("coverage.aggregateBasis")}</small></p>
      <dl style={{display: "flex", flexWrap: "wrap", gap: 24}}>
        {performanceMetricIds.map((id) => (
          <Pair key={id} label={t(`coverage.metrics.${id}`)} value={share(locale, content.performance[id])} />
        ))}
      </dl>
    </div>

    <div data-testid="receivables-released-evidence">
      <h4>{t("evidence.heading")}</h4>
      {evidenceRefs.length === 0 ? <p>{t("evidence.empty")}</p> : <div style={{overflowX: "auto"}}>
        <table>
          <thead><tr>
            <th scope="col">{t("evidence.section")}</th>
            <th scope="col">{t("evidence.source")}</th>
            <th scope="col">{t("evidence.anchor")}</th>
          </tr></thead>
          <tbody>{evidenceRefs.map((reference) => (
            <tr key={`${reference.section}:${reference.sourceId}:${reference.anchor}`}>
              <td>{reference.section}</td>
              <td>{reference.sourceClass} · {reference.sourceId}</td>
              <td>{reference.anchor}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>}
    </div>

    <footer data-testid="receivables-released-limitations">
      <h4>{t("limitations.heading")}</h4>
      <ul>
        <li>{t("limitations.assumptions")}</li>
        <li>{t("limitations.noExternalDirection")}</li>
        <li>{t("limitations.noFinancierRecommendation")}</li>
        <li>{t("limitations.noCreditApproval")}</li>
        <li>{t("limitations.method", {
          procedure: result.release.procedure.id,
          version: result.release.procedure.version,
          maturity: t(`limitations.maturityNames.${result.methodMaturity}`),
        })}</li>
        {result.methodMaturity === "production" && methodApproval
          ? <li data-testid="receivables-released-founder-approval">
            {t("limitations.founderApproval", {approvedAt: approvalDate(locale, methodApproval.approvedAt)})}
          </li>
          : null}
        <li>{t("limitations.engine", {schema: content.schema_version, currency})}</li>
      </ul>
    </footer>
  </section>;
}
