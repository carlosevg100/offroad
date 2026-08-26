import {AlertTriangle, FileDown, FileText, Info, Landmark, Printer, Table2} from "lucide-react";
import {getTranslations} from "next-intl/server";

import type {CaseState} from "@/lib/intake/case-pipeline";

import {IntakeCommittee} from "./intake-committee";
import {IntakeDataRoom} from "./intake-data-room";
import {IntakeDesk} from "./intake-desk";

type Props = {
  locale: string;
  caseState: CaseState | null;
  /** Needed to address the material routes; absent on screens that only preview a case. */
  sessionId?: string;
};

const asLocale = (locale: string) => (locale === "en-US" ? "en" : "pt") as "pt" | "en";
const intl = (locale: string) => (locale === "en-US" ? "en-US" : "pt-BR");

const money = (value: string, locale: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `R$ ${parsed.toLocaleString(intl(locale), {maximumFractionDigits: 0})}` : value;
};

const ratio = (value: string | null, locale: string) => {
  if (value === null) return "N/D";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${(parsed * 100).toLocaleString(intl(locale), {maximumFractionDigits: 1})}%` : value;
};

const multiple = (value: string | null, locale: string) => {
  if (value === null) return "N/D";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString(intl(locale), {maximumFractionDigits: 2})}x` : value;
};

/**
 * The case as the desk sees it, on one screen.
 *
 * Ordered the way a credit professional reads: is this ready and what holds it, how much does
 * it carry and what binds, what shape the paper takes, what the analysis says, what is still
 * open. Readiness comes first because it is the only question whose answer changes what to do
 * next; the summary comes late because nobody acts on prose before they know whether the case
 * is blocked.
 *
 * Every absence explains itself. A missing brief says the audit refused it; a missing capacity
 * wall says which input it lacked. A screen that silently omits what it could not compute
 * teaches the reader to assume the blanks are zeroes.
 */
export async function IntakeCase({locale, caseState: state, sessionId}: Props) {
  const t = await getTranslations({locale, namespace: "Intake.case"});
  const lang = asLocale(locale);
  const structureConstraint = (value: string | null) => {
    if (!value) return t("notInformed");
    const known = new Set(["cash_flow", "collateral", "market", "arr_and_round", "existing_covenant"]);
    return known.has(value) ? t(`structureConstraint_${value}`) : value.replaceAll("_", " ");
  };
  const repaymentFormat = (value: string | null) => {
    if (!value) return t("notInformed");
    const known = new Set(["sac", "price", "bullet", "balloon"]);
    return known.has(value) ? t(`structureRepayment_${value}`) : value.replaceAll("_", " ");
  };

  if (!state) {
    return (
      <section className="intake-case intake-case--empty">
        <span className="section-kicker">{t("kicker")}</span>
        <p>{t("empty")}</p>
      </section>
    );
  }

  const {readiness, capacity, termSheet, brief, materials} = state;
  const readinessLabel =
    readiness.state === "blocked" ? t("readinessBlocked") : readiness.state === "ready" ? t("readinessReady") : t("readinessInProgress");

  return (
    <section className="intake-case">
      <span className="section-kicker">{t("kicker")}</span>

      {/* Readiness: five components, because one number is not actionable. */}
      <div className={`case-readiness case-readiness--${readiness.state}`}>
        <header>
          <h3>{t("readinessTitle")}</h3>
          <span className="case-readiness__state">{readinessLabel}</span>
          <span className="case-readiness__score">{Math.round(readiness.score * 100)}%</span>
        </header>

        <ul className="case-readiness__components">
          {readiness.components.map((component) => (
            <li key={component.id}>
              <div className="case-readiness__bar" aria-hidden="true">
                <span style={{width: `${Math.round(component.score * 100)}%`}} />
              </div>
              <strong>{component.labels[lang]}</strong>
              <span>{component.explanation[lang]}</span>
            </li>
          ))}
        </ul>

        {readiness.blockers.length > 0 ? (
          <div className="case-readiness__blockers">
            <strong>
              <AlertTriangle aria-hidden="true" size={14} /> {t("blockersTitle")}
            </strong>
            <ul>
              {readiness.blockers.map((blocker) => (
                <li key={blocker.id}>{blocker.labels[lang]}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Capacity: three walls, and which one binds. */}
      {capacity ? (
        <div className="case-capacity">
          <h3>{t("capacityTitle")}</h3>
          <div className="case-capacity__headline">
            <div>
              <span>{t("capacityRequested")}</span>
              <strong>{money(capacity.requested, locale)}</strong>
            </div>
            <div>
              <span>{t("capacityRecommended")}</span>
              <strong>{capacity.recommended ? money(capacity.recommended, locale) : t("capacityNotComputed")}</strong>
            </div>
            {capacity.bindingConstraint ? (
              <div>
                <span>{t("capacityBinding")}</span>
                <strong>{capacity.walls.find((wall) => wall.id === capacity.bindingConstraint)?.labels[lang]}</strong>
              </div>
            ) : null}
          </div>

          <ul className="case-capacity__walls">
            {capacity.walls.map((wall) => (
              <li key={wall.id} className={wall.id === capacity.bindingConstraint ? "is-binding" : ""}>
                <strong>{wall.labels[lang]}</strong>
                <span className="case-capacity__amount">{wall.amount ? money(wall.amount, locale) : t("capacityNotComputed")}</span>
                <span className="case-capacity__why">{wall.explanation[lang]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* The desk's reading: arithmetic first, prose later. */}
      <IntakeDesk
        clientQuestions={state.clientQuestions ?? []}
        desk={state.desk ?? null}
        deskMissing={state.deskMissing ?? []}
        locale={locale}
        trajectory={state.trajectory ?? null}
      />

      <div className="case-truth-grid">
        <section className="case-financial-truth">
          <header className="case-truth__head">
            <div>
              <span className="section-kicker">M2</span>
              <h3>{t("financialTruthTitle")}</h3>
            </div>
            <span className={`case-truth__status is-${state.reconciliation.financialTruth.status}`}>
              {t(`truthStatus_${state.reconciliation.financialTruth.status}`)}
            </span>
          </header>
          <p>{t("financialTruthBody")}</p>
          {state.reconciliation.financialTruth.statements.length > 0 ? (
            <div className="case-truth__table">
              <table>
                <thead><tr><th>{t("truthPeriod")}</th><th>{t("truthRevenue")}</th><th>{t("truthAdjustedEbitda")}</th><th>{t("truthMargin")}</th><th>{t("truthCfads")}</th></tr></thead>
                <tbody>
                  {state.reconciliation.financialTruth.statements.map((statement) => {
                    const revenue = statement.lines.find((line) => line.metric === "revenue")?.value ?? null;
                    return (
                      <tr key={statement.id}>
                        <th scope="row">{statement.period}</th>
                        <td>{revenue ? money(revenue, locale) : t("notInformed")}</td>
                        <td>{statement.adjustedEbitda ? money(statement.adjustedEbitda, locale) : t("notInformed")}</td>
                        <td>{ratio(statement.ebitdaMargin, locale)}</td>
                        <td>{statement.cfads ? money(statement.cfads, locale) : t("notInformed")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="form-notice">{t("financialTruthEmpty")}</p>}
          <div className="case-truth__summary">
            <span>{t("truthProcedures")}: <strong>{state.reconciliation.financialTruth.procedureCoverage.filter((item) => item.status === "completed").length}/18</strong></span>
            <span>{t("truthIdentities")}: <strong>{state.reconciliation.financialTruth.identityChecks.filter((check) => check.status === "pass").length}/{state.reconciliation.financialTruth.identityChecks.length}</strong></span>
            <span>{t("truthOpenItems")}: <strong>{state.reconciliation.financialTruth.exceptions.length + new Set(state.reconciliation.financialTruth.procedureCoverage.flatMap((item) => item.missingInputs)).size}</strong></span>
          </div>
        </section>

        <section className="case-debt-truth">
          <header className="case-truth__head">
            <div>
              <span className="section-kicker">M3</span>
              <h3>{t("debtTruthTitle")}</h3>
            </div>
            <span className={`case-truth__status is-${state.reconciliation.debtTruth.status}`}>
              {t(`truthStatus_${state.reconciliation.debtTruth.status}`)}
            </span>
          </header>
          <p>{t("debtTruthBody")}</p>
          <dl className="case-truth__metrics">
            <div><dt>{t("grossFinancialDebt")}</dt><dd>{money(state.reconciliation.debtTruth.views.grossFinancialDebt, locale)}</dd></div>
            <div><dt>{t("netFinancialDebt")}</dt><dd>{money(state.reconciliation.debtTruth.views.netFinancialDebt, locale)}</dd></div>
            <div><dt>{t("covenantDebt")}</dt><dd>{money(state.reconciliation.debtTruth.views.covenantDebt, locale)}</dd></div>
            <div><dt>{t("capacityObligations")}</dt><dd>{money(state.reconciliation.debtTruth.views.adjustedCapacityObligations, locale)}</dd></div>
            <div><dt>{t("truthService12Months")}</dt><dd>{money(state.reconciliation.debtTruth.serviceNext12Months, locale)}</dd></div>
            <div><dt>{t("truthOffBalance")}</dt><dd>{money(state.reconciliation.debtTruth.views.offBalanceSheetExposures, locale)}</dd></div>
          </dl>
          {state.reconciliation.debtTruth.instruments.length > 0 ? (
            <ul className="case-truth__instruments">
              {state.reconciliation.debtTruth.instruments.map((instrument) => (
                <li key={instrument.id}>
                  <div><strong>{instrument.lender ?? t("notInformed")}</strong><span>{instrument.instrument ?? t("notInformed")}</span></div>
                  <span>{money(instrument.balance, locale)}</span>
                  <small>{instrument.maturity ?? t("notInformed")}</small>
                </li>
              ))}
            </ul>
          ) : <p className="form-notice">{t("debtTruthEmpty")}</p>}
          <div className="case-truth__summary">
            <span>{t("truthProcedures")}: <strong>{state.reconciliation.debtTruth.procedureCoverage.filter((item) => item.status === "completed").length}/31</strong></span>
            <span>{t("truthCovenants")}: <strong>{state.reconciliation.debtTruth.covenants.length}</strong></span>
            <span>{t("truthOpenItems")}: <strong>{state.reconciliation.debtTruth.exceptions.length + new Set(state.reconciliation.debtTruth.procedureCoverage.flatMap((item) => item.missingInputs)).size}</strong></span>
          </div>
        </section>
      </div>

      <section className="case-operation-truth">
        <header className="case-truth__head">
          <div>
            <span className="section-kicker">M4</span>
            <h3>{t("operationTruthTitle")}</h3>
          </div>
          <span className={`case-truth__status is-${state.operationTruth.status}`}>
            {t(`truthStatus_${state.operationTruth.status}`)}
          </span>
        </header>
        <p>{t("operationTruthBody")}</p>
        <dl className="case-truth__metrics">
          <div><dt>{t("operationRequested")}</dt><dd>{state.operationTruth.request.amount ? money(state.operationTruth.request.amount, locale) : t("notInformed")}</dd></div>
          <div><dt>{t("operationCalculatedNeed")}</dt><dd>{state.operationTruth.calculatedNeed ? money(state.operationTruth.calculatedNeed.value, locale) : t("notInformed")}</dd></div>
          <div><dt>{t("operationSources")}</dt><dd>{money(state.operationTruth.sourcesAndUses.totalSources, locale)}</dd></div>
          <div><dt>{t("operationUses")}</dt><dd>{money(state.operationTruth.sourcesAndUses.totalUses, locale)}</dd></div>
          <div><dt>{t("operationDifference")}</dt><dd>{money(state.operationTruth.sourcesAndUses.difference, locale)}</dd></div>
          <div><dt>{t("operationProFormaDebt")}</dt><dd>{state.operationTruth.proForma ? money(state.operationTruth.proForma.netDebt, locale) : t("notInformed")}</dd></div>
        </dl>
        <div className="case-truth__summary">
          <span>{t("truthProcedures")}: <strong>{state.operationTruth.procedureCoverage.filter((item) => item.status === "completed").length}/14</strong></span>
          <span>{t("operationTie")}: <strong>{state.operationTruth.sourcesAndUses.status === "pass" ? t("operationTied") : t("operationNotTied")}</strong></span>
          <span>{t("truthOpenItems")}: <strong>{state.operationTruth.exceptions.length + new Set(state.operationTruth.procedureCoverage.flatMap((item) => item.missingInputs)).size}</strong></span>
        </div>
      </section>

      <section className="case-structure-truth">
        <header className="case-truth__head">
          <div>
            <span className="section-kicker">M5</span>
            <h3>{t("structureTruthTitle")}</h3>
          </div>
          <span className={`case-truth__status is-${state.structureTruth.status}`}>
            {t(`truthStatus_${state.structureTruth.status}`)}
          </span>
        </header>
        <p>{t("structureTruthBody")}</p>
        <dl className="case-truth__metrics">
          <div><dt>{t("structureProposedAmount")}</dt><dd>{state.structureTruth.proposal.amount ? money(state.structureTruth.proposal.amount, locale) : t("notInformed")}</dd></div>
          <div><dt>{t("structureBindingConstraint")}</dt><dd>{structureConstraint(state.structureTruth.proposal.bindingConstraint)}</dd></div>
          <div><dt>{t("structureTerm")}</dt><dd>{state.structureTruth.proposal.termMonths === null ? t("notInformed") : t("months", {count: state.structureTruth.proposal.termMonths})}</dd></div>
          <div><dt>{t("structureRepayment")}</dt><dd>{repaymentFormat(state.structureTruth.proposal.amortizationFormat)}</dd></div>
          <div><dt>{t("structureDownsideDscr")}</dt><dd>{multiple(state.structureTruth.proposal.minimumDownsideDscr, locale)}</dd></div>
          <div><dt>{t("structureCollateralCoverage")}</dt><dd>{multiple(state.structureTruth.proposal.collateralCoverage, locale)}</dd></div>
        </dl>
        <div className="case-truth__summary">
          <span>{t("truthProcedures")}: <strong>{state.structureTruth.procedureCoverage.filter((item) => item.status === "completed").length}/45</strong></span>
          <span>{t("structureDayOne")}: <strong>{state.structureTruth.dayOne.passes === true ? t("structureCompatible") : state.structureTruth.dayOne.passes === false ? t("structureIncompatible") : t("structurePending")}</strong></span>
          <span>{t("truthOpenItems")}: <strong>{state.structureTruth.exceptions.length + new Set(state.structureTruth.procedureCoverage.flatMap((item) => item.missingInputs)).size}</strong></span>
        </div>
      </section>

      {/* The committee pack: grade, shocks, papers, security. */}
      <IntakeCommittee
        collateral={state.collateral ?? null}
        instruments={state.instruments ?? []}
        locale={locale}
        price={state.price ?? null}
        rating={state.rating ?? null}
        stress={state.stress ?? []}
      />

      {/* What leaves the desk, behind which gate, and what still holds it. */}
      <IntakeDataRoom locale={locale} plan={state.dataRoom ?? null} {...(sessionId ? {sessionId} : {})} />

      {/* Structure: every term with the reason it is that term. */}
      {termSheet ? (
        <div className="case-terms">
          <h3>{t("termsTitle")}</h3>
          <ul>
            {termSheet.terms.map((term) => (
              <li className={term.divergence ? "is-divergent" : ""} key={term.id}>
                <strong>{term.labels[lang]}</strong>
                <span className="case-terms__value">{term.value[lang]}</span>
                {/* Requested or proposed changes what the sentence beside the number has to do,
                    so the reader is told which it is before reading the reason. */}
                <span className={`case-terms__origin case-terms__origin--${term.origin}`}>
                  {t(`origin_${term.origin}`)}
                </span>
                <span className="case-terms__basis">
                  {t("termBasis")}: {term.basis}
                </span>
                <span className="case-terms__why">{term.rationale[lang]}</span>
                {/* The disagreement, with both sides. A term sheet that quietly replaces a
                    company's number teaches it nothing and ambushes it in the first meeting
                    where somebody asks why the figure changed. */}
                {term.divergence ? (
                  <div className="case-terms__divergence">
                    <span className="case-terms__asked">
                      {t("youAskedFor")}: <strong>{term.divergence.requested[lang]}</strong>
                    </span>
                    <span>{term.divergence.reason[lang]}</span>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="case-terms__disclaimer">{termSheet.disclaimer[lang]}</p>
        </div>
      ) : null}

      {/* Computed figures, each traceable to the fields behind it. */}
      {state.reconciliation.calculations.length > 0 ? (
        <div className="case-calculations">
          <h3>{t("calculationsTitle")}</h3>
          <ul>
            {state.reconciliation.calculations.map((calculation) => (
              <li key={calculation.id}>
                <strong>{calculation.labels[lang]}</strong>
                <span className="case-calculations__value">{money(calculation.value, locale)}</span>
                <span className="case-calculations__trace">
                  {t("tracedFrom")}: {calculation.inputs.join(" · ")}
                </span>
                {calculation.warnings.map((warning) => (
                  <span className="case-calculations__warning" key={warning}>
                    <Info aria-hidden="true" size={12} /> {warning}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* The written case, or the reason it was refused. */}
      <div className="case-brief">
        <h3>{t("briefTitle")}</h3>
        {brief ? (
          <>
            <p className="case-brief__summary">{brief.executiveSummary}</p>
            {brief.sections
              .filter((section) => section.id !== "executive_summary")
              .map((section) => (
                <div key={section.id} className="case-brief__section">
                  <h4>{section.heading}</h4>
                  {section.claims.map((claim) => (
                    <p key={claim.id}>
                      {claim.text}
                      {claim.supportIds.length > 0 ? <span className="case-brief__support">{claim.supportIds.join(" · ")}</span> : null}
                    </p>
                  ))}
                </div>
              ))}
          </>
        ) : (
          // "Being prepared" and "the audit refused it" are different situations with different
          // next actions, and a single message for both teaches the reader to ignore it.
          <p className="form-notice">
            {state.briefBlockedBy.includes("brief_in_progress") ? t("briefInProgress") : t("briefBlocked")}
          </p>
        )}
      </div>

      {/* Open points belong in front of the reader, not to be discovered. */}
      {state.reconciliation.exceptions.length > 0 ? (
        <div className="case-exceptions">
          <h3>{t("exceptionsTitle")}</h3>
          <ul>
            {state.reconciliation.exceptions.map((exception, index) => (
              <li key={`${exception.ruleId}-${index}`} className={`is-${exception.severity}`}>
                <strong>{exception.title}</strong>
                <span>{exception.description}</span>
                {exception.evidence.length > 0 ? (
                  <span className="case-exceptions__evidence">
                    {exception.evidence.map((entry) => `${entry.label}: ${entry.value ?? ""}${entry.sourceDocument ? ` (${entry.sourceDocument})` : ""}`).join(" · ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* The model stands apart from the materials on purpose: it is arithmetic over reconciled
          facts, so it can be issued even in a case whose written brief the audit refused. A
          company blocked from circulating a memo can still hand an investor the numbers. */}
      <div className="case-model">
        <h3>{t("modelTitle")}</h3>
        <p className="case-model__what">{t("modelWhat")}</p>
        {sessionId && state.reconciliation.facts.length > 0 ? (
          <a className="button button--ghost" href={`/${locale}/app/model/${sessionId}`}>
            <Table2 aria-hidden="true" size={13} /> {t("modelDownload")}
          </a>
        ) : null}
        {sessionId && state.rating ? (
          <a className="button button--ghost" href={`/${locale}/app/sounding/${sessionId}`}>
            <Landmark aria-hidden="true" size={13} /> {t("soundingOpen")}
          </a>
        ) : (
          <p className="form-notice">{t("modelBlocked")}</p>
        )}
      </div>

      <div className="case-materials">
        <h3>{t("materialsTitle")}</h3>
        {materials.length > 0 ? (
          <ul>
            {materials.map((material) => {
              const href = sessionId ? `/${locale}/app/materials/${sessionId}/${material.kind}` : null;
              return (
                <li key={material.kind}>
                  <FileText aria-hidden="true" size={14} />
                  <strong>{material.title[lang]}</strong>
                  <span>{t("materialSections", {count: material.blocks.length})}</span>
                  {href ? (
                    <span className="case-materials__actions">
                      {/* New tab, not a route change: the company is mid-review and losing the
                          screen to a document it wanted to glance at is its own small failure. */}
                      <a className="button button--ghost" href={href} rel="noreferrer" target="_blank">
                        {t("materialOpen")}
                      </a>
                      <a className="button button--ghost" href={`${href}?print=1`} rel="noreferrer" target="_blank">
                        <Printer aria-hidden="true" size={13} /> {t("materialPdf")}
                      </a>
                      <a className="button button--ghost" href={`${href}/docx`}>
                        <FileDown aria-hidden="true" size={13} /> {t("materialDocx")}
                      </a>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="form-notice">{t("materialsBlocked")}</p>
        )}
      </div>
    </section>
  );
}
