import {getTranslations} from "next-intl/server";

import type {InternalRating, StressScenario} from "@offroad/credit-analysis";
import type {InstrumentVerdict} from "@offroad/credit-playbook";
import type {CollateralPackage} from "@offroad/deal-structure";
import type {IndicativePrice} from "@offroad/market-reference";

type Props = {
  locale: string;
  rating: InternalRating | null;
  stress: StressScenario[];
  instruments: InstrumentVerdict[];
  collateral: CollateralPackage | null;
  price?: IndicativePrice | null;
};

const asLocale = (locale: string) => (locale === "en-US" ? "en" : "pt") as "pt" | "en";
const intl = (locale: string) => (locale === "en-US" ? "en-US" : "pt-BR");
const millions = (value: string | null, locale: string) => (value === null ? null : `R$ ${(Number(value) / 1_000_000).toLocaleString(intl(locale), {minimumFractionDigits: 1, maximumFractionDigits: 1})}M`);
const turns = (value: string | null, locale: string) => (value === null ? null : `${Number(value).toLocaleString(intl(locale), {minimumFractionDigits: 2, maximumFractionDigits: 2})}x`);

/**
 * What a committee reads after the desk: the grade with its factors, the shocks, the papers the
 * profile admits and the security package. All arithmetic over the battery; nothing here is
 * written by a model, and every factor shows the band it fell in so the grade can be argued.
 */
export async function IntakeCommittee({locale, rating, stress, instruments, collateral, price = null}: Props) {
  const t = await getTranslations({locale, namespace: "Intake.committee"});
  const lang = asLocale(locale);
  if (!rating && stress.length === 0 && instruments.length === 0 && !collateral) return null;
  const open = instruments.filter((verdict) => verdict.eligible);
  const closed = instruments.filter((verdict) => !verdict.eligible);

  return (
    <div className="case-committee">
      <h3>{t("title")}</h3>

      {rating ? (
        <section className={`case-committee__rating is-${rating.band}`}>
          <div className="case-committee__grade">
            <span className="case-committee__gradeNumber">{rating.grade}</span>
            <span className="case-committee__gradeOf">/ 10</span>
            <span className="case-committee__band">{t(`band_${rating.band}`)}</span>
          </div>
          <p className="case-committee__summary">{rating.summary[lang]}</p>
          <ul className="case-committee__factors">
            {rating.factors.map((factor) => (
              <li key={factor.id} className={factor.points === null ? "is-unassessed" : `is-points-${factor.points}`}>
                <strong>{factor.labels[lang]}</strong>
                <span className="case-committee__points">{factor.points === null ? t("notAssessed") : t("points", {points: factor.points, weight: factor.weight})}</span>
                <span className="case-committee__why">{factor.rationale[lang]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stress.length > 0 ? (
        <section className="case-committee__stress">
          <h4>{t("stressTitle")}</h4>
          <div className="case-desk__table">
            <table>
              <thead>
                <tr><th>{t("scenario")}</th><th>{t("leverage")}</th><th>{t("interest")}</th><th>{t("headroom")}</th><th>{t("breaches")}</th></tr>
              </thead>
              <tbody>
                {stress.map((row) => (
                  <tr key={row.id} className={row.breachesCovenant ? "is-breach" : ""}>
                    <th scope="row">{row.labels[lang]}<span className="case-committee__assumption">{row.assumptions[lang]}</span></th>
                    <td>{turns(row.leverage, locale) ?? t("na")}</td>
                    <td>{millions(row.annualInterest, locale) ?? t("na")}</td>
                    <td>{millions(row.covenantHeadroom, locale) ?? t("na")}</td>
                    <td>{row.breachesCovenant === null ? t("na") : row.breachesCovenant ? t("yes") : t("no")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {instruments.length > 0 ? (
        <section className="case-committee__instruments">
          <h4>{t("instrumentsTitle")}</h4>
          <ul>
            {open.map((verdict) => (
              <li key={verdict.instrument.id} className="is-open">
                <strong>{verdict.instrument.labels[lang]}</strong>
                <span>{verdict.instrument.tenorMonths.min} a {verdict.instrument.tenorMonths.max} {t("months")} · {verdict.instrument.buyers.join(", ")}</span>
                <span className="case-committee__why">{verdict.reasons[0]?.[lang]}</span>
              </li>
            ))}
            {closed.map((verdict) => (
              <li key={verdict.instrument.id} className="is-closed">
                <strong>{verdict.instrument.labels[lang]}</strong>
                <span className="case-committee__why">{verdict.reasons[0]?.[lang]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {price ? (
        <section className="case-committee__price">
          <h4>{t("priceTitle")}</h4>
          <p className="case-committee__priceRange">
            CDI + {(price.bps.min / 100).toLocaleString(intl(locale), {minimumFractionDigits: 2, maximumFractionDigits: 2})}% {t("to")} CDI + {(price.bps.max / 100).toLocaleString(intl(locale), {minimumFractionDigits: 2, maximumFractionDigits: 2})}% a.a.
          </p>
          <p className="case-desk__note">{price.sentence[lang]}</p>
        </section>
      ) : null}

      {collateral ? (
        <section className="case-committee__collateral">
          <h4>{t("collateralTitle")}</h4>
          <p className={`case-committee__coverage ${collateral.sufficient ? "is-ok" : "is-short"}`}>
            {t("coverage", {achieved: turns(collateral.coverageAchieved, locale) ?? "", target: turns(collateral.target.coverage, locale) ?? ""})}
            {collateral.shortfall ? ` ${t("shortfall", {amount: millions(collateral.shortfall, locale) ?? ""})}` : ""}
          </p>
          <ul>
            {collateral.lines.map((line) => (
              <li key={line.asset.description} className={line.selected ? "is-selected" : ""}>
                <strong>{line.asset.description}</strong>
                <span>{millions(line.asset.value, locale)} · {t("haircut")} {(Number(line.haircut) * 100).toFixed(0)}%{line.haircutSource === "policy" ? ` (${t("policy")})` : ""} · {t("eligible")} {millions(line.eligible, locale)}</span>
                <span className="case-committee__why">{line.lien[lang]}</span>
              </li>
            ))}
          </ul>
          {collateral.notes.map((note) => (
            <p key={note.pt} className="case-desk__note">{note[lang]}</p>
          ))}
        </section>
      ) : null}
    </div>
  );
}
