import {getTranslations} from "next-intl/server";

import type {CollateralKind, Instrument} from "@offroad/fund-mandate";

import {briefCompleteness, type DealBrief} from "@/lib/intake/deal-brief";

type Props = {
  locale: string;
  sessionId: string;
  brief: DealBrief;
  /** Saves the brief (`amount`, `term_months`, `grace_months`, `sector`, `geography`, …). */
  action: (formData: FormData) => Promise<void>;
};

/**
 * The one page that decides who could buy the paper.
 *
 * A short set of questions, all answerable from a conversation and none requiring a document. The archetype
 * already said what the money is for; this says enough about the shape of it that a desk can
 * name the funds that write this kind of cheque — and, more usefully, tell a company on day one
 * when *nobody* does.
 *
 * Two decisions here are about who is filling it in, and they matter more than the layout.
 *
 * **Nobody is asked to know the market.** The instrument question is the one a company genuinely
 * cannot answer — knowing whether an operation should be a debênture, a CCB or a CRA is the
 * expertise they came here to borrow. So it is optional, it is phrased as a preference rather
 * than a decision, and leaving it blank is the *better* early answer: in the fit assessment an
 * unstated instrument keeps every fund in play, while a guessed one silently removes the ones
 * that would have said yes. The copy says exactly that, because a blank field with no explanation
 * reads as a failure rather than a choice.
 *
 * **Everything else is asked in the company's own terms.** A company knows what it owns; it does
 * not necessarily know that a duplicata pledged to a bank is a "cessão fiduciária de recebíveis".
 * Each option is labelled by the thing, with the market's word underneath rather than instead.
 *
 * Nothing is required. A brief is filled in across a conversation, often by different people, and
 * the fit assessment is built to answer from whatever exists. The counter says how much is
 * answered without ever calling the rest missing.
 */

const INSTRUMENTS: readonly Instrument[] = [
  "debenture",
  "nota_comercial",
  "ccb",
  "cri",
  "cra",
  "fidc",
  "direct_loan",
  "receivables_purchase",
  "project_finance",
];

const COLLATERAL: readonly CollateralKind[] = [
  "recebiveis",
  "imovel",
  "equipamento",
  "estoque",
  "aval_fianca",
  "cessao_fiduciaria",
  "conta_reserva",
  "quirografario",
];

export async function IntakeDealBrief({locale, sessionId, brief, action}: Props) {
  const t = await getTranslations({locale, namespace: "Intake.brief"});
  const {answered, total} = briefCompleteness(brief);

  return (
    <section className="intake-brief">
      <div className="intake-brief__head">
        <span className="section-kicker">{t("kicker")}</span>
        <h3>{t("title")}</h3>
        <p className="intake-brief__body">{t("body")}</p>
        <span className="intake-brief__progress">{t("answered", {answered, total})}</span>
      </div>

      <form action={action} className="intake-brief__form">
        <input type="hidden" name="session_id" value={sessionId} />
        <input type="hidden" name="locale" value={locale} />

        <div className="intake-brief__row">
          <label htmlFor="brief-objective">
            {t("objectiveLabel")}
            <span className="intake-brief__hint">{t("objectiveHint")}</span>
          </label>
          <textarea
            defaultValue={brief.objective ?? ""}
            id="brief-objective"
            maxLength={4000}
            name="objective"
            placeholder={t("objectivePlaceholder")}
            rows={4}
          />
        </div>

        <div className="intake-brief__pair">
          <div className="intake-brief__row">
            <label htmlFor="brief-amount">
              {t("amountLabel")}
              <span className="intake-brief__hint">{t("amountHint")}</span>
            </label>
            <input
              defaultValue={brief.requestedAmount ? Number(brief.requestedAmount).toLocaleString(locale, {maximumFractionDigits: 0}) : ""}
              id="brief-amount"
              inputMode="text"
              name="amount"
              placeholder={t("amountPlaceholder")}
              type="text"
            />
          </div>

          <div className="intake-brief__row">
            <label htmlFor="brief-currency">
              {t("currencyLabel")}
              <span className="intake-brief__hint">{t("currencyHint")}</span>
            </label>
            <select defaultValue={brief.currency ?? "BRL"} id="brief-currency" name="currency">
              <option value="BRL">BRL</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>

        <div className="intake-brief__row">
          <label htmlFor="brief-urgency">
            {t("urgencyLabel")}
            <span className="intake-brief__hint">{t("urgencyHint")}</span>
          </label>
          <select defaultValue={brief.urgency ?? ""} id="brief-urgency" name="urgency">
            <option value="">{t("urgencyUnknown")}</option>
            <option value="up_to_3_months">{t("urgencyUpTo3")}</option>
            <option value="3_to_6_months">{t("urgency3To6")}</option>
            <option value="6_to_12_months">{t("urgency6To12")}</option>
            <option value="no_rush">{t("urgencyNoRush")}</option>
          </select>
        </div>

        <div className="intake-brief__pair">
          <div className="intake-brief__row">
            <label htmlFor="brief-term">
              {t("termLabel")}
              <span className="intake-brief__hint">{t("termHint")}</span>
            </label>
            <input
              defaultValue={brief.requestedTermMonths ?? ""}
              id="brief-term"
              inputMode="numeric"
              max={360}
              min={1}
              name="term_months"
              placeholder="60"
              type="number"
            />
          </div>

          <div className="intake-brief__row">
            <label htmlFor="brief-grace">
              {t("graceLabel")}
              <span className="intake-brief__hint">{t("graceHint")}</span>
            </label>
            <input
              defaultValue={brief.requestedGraceMonths ?? ""}
              id="brief-grace"
              inputMode="numeric"
              max={120}
              min={0}
              name="grace_months"
              placeholder="12"
              type="number"
            />
          </div>
        </div>

        <div className="intake-brief__row">
          <label htmlFor="brief-consequence">
            {t("consequenceLabel")}
            <span className="intake-brief__hint">{t("consequenceHint")}</span>
          </label>
          <textarea
            defaultValue={brief.consequenceIfNotExecuted ?? ""}
            id="brief-consequence"
            maxLength={4000}
            name="consequence"
            placeholder={t("consequencePlaceholder")}
            rows={3}
          />
        </div>

        <div className="intake-brief__pair">
          <div className="intake-brief__row">
            <label htmlFor="brief-sector">
              {t("sectorLabel")}
              <span className="intake-brief__hint">{t("sectorHint")}</span>
            </label>
            <input defaultValue={brief.sector ?? ""} id="brief-sector" name="sector" placeholder={t("sectorPlaceholder")} type="text" />
          </div>

          <div className="intake-brief__row">
            <label htmlFor="brief-geography">
              {t("geographyLabel")}
              <span className="intake-brief__hint">{t("geographyHint")}</span>
            </label>
            <input
              defaultValue={brief.geography ?? ""}
              id="brief-geography"
              maxLength={2}
              name="geography"
              placeholder="SP"
              style={{textTransform: "uppercase"}}
              type="text"
            />
          </div>
        </div>

        <details className="intake-brief__advanced">
          <summary>{t("advancedTitle")}</summary>
          <p>{t("advancedBody")}</p>

          <div className="intake-brief__row">
            <label htmlFor="brief-rate">
              {t("rateLabel")}
              <span className="intake-brief__hint">{t("rateHint")}</span>
            </label>
            <input defaultValue={brief.expectedRate ?? ""} id="brief-rate" name="expected_rate" placeholder={t("ratePlaceholder")} type="text" />
          </div>

          {/* What the company owns, in the company's words. It knows the thing; it does not
              necessarily know the market's name for pledging it. */}
          <fieldset className="intake-brief__set">
            <legend>{t("collateralLabel")}</legend>
            <p className="intake-brief__hint">{t("collateralHint")}</p>
            <div className="intake-brief__options">
              {COLLATERAL.map((kind) => (
                <label className="intake-brief__option" key={kind} htmlFor={`collateral-${kind}`}>
                  <input
                    defaultChecked={brief.collateralKinds?.includes(kind)}
                    id={`collateral-${kind}`}
                    name="collateral_kinds"
                    type="checkbox"
                    value={kind}
                  />
                  <span>
                    <strong>{t(`collateral_${kind}`)}</strong>
                    <em>{t(`collateralNote_${kind}`)}</em>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* The one question a company genuinely cannot answer. Blank is the better early answer
              and the copy has to say so, or an empty field reads as a failure. */}
          <fieldset className="intake-brief__set intake-brief__set--optional">
            <legend>{t("instrumentLabel")}</legend>
            <p className="intake-brief__hint">{t("instrumentHint")}</p>
            <div className="intake-brief__options">
              {INSTRUMENTS.map((instrument) => (
                <label className="intake-brief__option" key={instrument} htmlFor={`instrument-${instrument}`}>
                  <input
                    defaultChecked={brief.instruments?.includes(instrument)}
                    id={`instrument-${instrument}`}
                    name="instruments"
                    type="checkbox"
                    value={instrument}
                  />
                  <span>
                    <strong>{t(`instrument_${instrument}`)}</strong>
                    <em>{t(`instrumentNote_${instrument}`)}</em>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </details>

        <button className="button" type="submit">
          {t("save")}
        </button>
      </form>
    </section>
  );
}
