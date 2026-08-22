import {getTranslations} from "next-intl/server";

import type {SoundingView} from "@/lib/sounding/server";

type Props = {
  locale: string;
  sessionId: string;
  view: SoundingView | null;
  deal: {archetypeId: string; amount: string; tenorMonths: number; rating: string; sector: string; secured: boolean};
  actions: {
    open: (formData: FormData) => Promise<void>;
    addInvestor: (formData: FormData) => Promise<void>;
    recordEvent: (formData: FormData) => Promise<void>;
  };
};

const asLocale = (locale: string) => (locale === "en-US" ? "en" : "pt") as "pt" | "en";
const intl = (locale: string) => (locale === "en-US" ? "en-US" : "pt-BR");
const money = (value: string, locale: string) => `R$ ${(Number(value) / 1_000_000).toLocaleString(intl(locale), {minimumFractionDigits: 1, maximumFractionDigits: 1})}M`;
const when = (iso: string, locale: string) => new Date(iso).toLocaleString(intl(locale), {dateStyle: "short", timeStyle: "short"});

const kinds = ["credit_fund", "bank_treasury", "family_office", "fidc_manager", "venture_debt_fund", "insurer", "development_bank"] as const;
const eventTypes = ["teaser_sent", "nda_signed", "room_opened", "question_asked", "question_answered", "indication_received", "declined", "allocated", "dropped"] as const;

/**
 * Three panels in the order a desk works them: the list (who, at which stage), the book (what
 * they said, on one ruler), the trail (who saw what, when). Every form posts one event; the
 * server refuses what the process does not allow and the page says why.
 */
export async function SoundingBoard({locale, sessionId, view, deal, actions}: Props) {
  const t = await getTranslations({locale, namespace: "Sounding"});
  const lang = asLocale(locale);

  if (!view) {
    return (
      <section className="sounding sounding--open">
        <h2>{t("openTitle")}</h2>
        <p className="sounding__hint">{t("openHint")}</p>
        <form action={actions.open} className="sounding__form">
          <input name="locale" type="hidden" value={locale} />
          <input name="session_id" type="hidden" value={sessionId} />
          <label>{t("targetAmount")}<input defaultValue={deal.amount !== "0" ? deal.amount : ""} inputMode="numeric" name="target_amount" required /></label>
          <label>{t("cdi")}<input defaultValue="10.50" inputMode="decimal" name="cdi_pct" required /></label>
          <label>{t("ipca")}<input defaultValue="4.00" inputMode="decimal" name="ipca_pct" /></label>
          <label>{t("method")}
            <select defaultValue="price_priority" name="method">
              <option value="price_priority">{t("method_price_priority")}</option>
              <option value="pro_rata">{t("method_pro_rata")}</option>
            </select>
          </label>
          <button className="button" type="submit">{t("openButton")}</button>
        </form>
      </section>
    );
  }

  const {sounding, investors, tracks, book, trail, candidates} = view;
  const trackOf = new Map(tracks.map((track) => [track.investorId, track]));

  return (
    <div className="sounding">
      <section className="sounding__summary">
        <div><span>{t("target")}</span><strong>{money(String(sounding.target_amount), locale)}</strong></div>
        <div><span>{t("coverage")}</span><strong>{(Number(book.coverage) * 100).toLocaleString(intl(locale), {maximumFractionDigits: 0})}%</strong></div>
        <div><span>{t("allocated")}</span><strong>{money(book.allocatedTotal, locale)}</strong></div>
        <div><span>{t("weightedCost")}</span><strong>{book.weightedAllInPct ? `${book.weightedAllInPct}% a.a.` : t("none")}</strong></div>
        <div><span>{t("basis")}</span><strong>CDI {String(sounding.cdi_pct)}%</strong></div>
      </section>

      <section className="sounding__list">
        <h2>{t("listTitle")}</h2>
        {investors.length === 0 ? <p className="sounding__hint">{t("listEmpty")}</p> : (
          <ul>
            {investors.map((investor) => {
              const track = trackOf.get(investor.id);
              return (
                <li className={`is-${track?.stage ?? "listed"}`} key={investor.id}>
                  <div className="sounding__investor">
                    <strong>{investor.name}</strong>
                    <span className="sounding__kind">{t(`kind_${investor.kind}`)}{investor.synthetic ? ` · ${t("synthetic")}` : ""}</span>
                    <span className="sounding__stage">{t(`stage_${track?.stage ?? "listed"}`)}</span>
                    {track?.latestIndication ? <span className="sounding__indication">{money(track.latestIndication.amount, locale)} · {track.latestIndication.tenorMonths}m · {track.latestIndication.firm ? t("firm") : t("subject")}</span> : null}
                  </div>
                  <form action={actions.recordEvent} className="sounding__event">
                    <input name="locale" type="hidden" value={locale} />
                    <input name="session_id" type="hidden" value={sessionId} />
                    <input name="sounding_id" type="hidden" value={sounding.id} />
                    <input name="investor_id" type="hidden" value={investor.id} />
                    <select aria-label={t("eventType")} name="type">
                      {eventTypes.map((type) => <option key={type} value={type}>{t(`event_${type}`)}</option>)}
                    </select>
                    <input aria-label={t("note")} name="note" placeholder={t("note")} />
                    <details className="sounding__indicationForm">
                      <summary>{t("indicationFields")}</summary>
                      <input aria-label={t("amount")} inputMode="numeric" name="amount" placeholder={t("amount")} />
                      <input aria-label={t("tenor")} inputMode="numeric" name="tenor_months" placeholder={t("tenor")} />
                      <input aria-label={t("grace")} inputMode="numeric" name="grace_months" placeholder={t("grace")} />
                      <select aria-label={t("pricingType")} name="pricing_type">
                        <option value="cdi_plus">CDI +</option>
                        <option value="cdi_pct">% CDI</option>
                        <option value="fixed">{t("fixed")}</option>
                        <option value="ipca_plus">IPCA +</option>
                      </select>
                      <input aria-label={t("pricingValue")} inputMode="decimal" name="pricing_value" placeholder={t("pricingValue")} />
                      <input aria-label={t("securityAsked")} name="security_asked" placeholder={t("securityAsked")} />
                      <label className="sounding__check"><input name="firm" type="checkbox" value="1" /> {t("firm")}</label>
                    </details>
                    <button className="button button--ghost" type="submit">{t("record")}</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
        <form action={actions.addInvestor} className="sounding__form sounding__add">
          <input name="locale" type="hidden" value={locale} />
          <input name="session_id" type="hidden" value={sessionId} />
          <input name="sounding_id" type="hidden" value={sounding.id} />
          <label>{t("investorName")}<input list="sounding-candidates" name="name" required /></label>
          <datalist id="sounding-candidates">
            {candidates.map((entry) => <option key={entry.investor.id} value={entry.investor.name}>{`${entry.fit} · ${entry.eligible ? t("eligible") : t("ineligible")}`}</option>)}
          </datalist>
          <label>{t("investorKind")}
            <select name="kind">{kinds.map((kind) => <option key={kind} value={kind}>{t(`kind_${kind}`)}</option>)}</select>
          </label>
          <button className="button" type="submit">{t("addInvestor")}</button>
        </form>
        {candidates.length > 0 ? (
          <div className="sounding__shortlist">
            <h3>{t("shortlistTitle")}</h3>
            <ul>
              {candidates.slice(0, 8).map((entry) => (
                <li className={entry.eligible ? "" : "is-ineligible"} key={entry.investor.id}>
                  <strong>{entry.investor.name}</strong>
                  <span>{t(`kind_${entry.investor.kind}`)} · {t("fit")} {entry.fit}</span>
                  <span className="sounding__why">{entry.reasons.map((reason) => reason[lang]).join("; ")}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="sounding__book">
        <h2>{t("bookTitle")}</h2>
        {book.lines.length === 0 ? <p className="sounding__hint">{t("bookEmpty")}</p> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>#</th><th>{t("investor")}</th><th>{t("amount")}</th><th>{t("tenor")}</th><th>{t("allIn")}</th><th>{t("spread")}</th><th>{t("allocatedLine")}</th><th>{t("share")}</th></tr></thead>
              <tbody>
                {book.lines.map((line) => (
                  <tr className={Number(line.allocated) === 0 ? "is-cut" : ""} key={line.investor.id}>
                    <td>{line.rank}</td>
                    <td>{line.investor.name}{line.indication.firm ? "" : ` (${t("subject")})`}</td>
                    <td>{money(line.indication.amount, locale)}</td>
                    <td>{line.indication.tenorMonths}m</td>
                    <td>{line.allInPct}%</td>
                    <td>{line.spreadOverCdiPct}%</td>
                    <td>{money(line.allocated, locale)}</td>
                    <td>{line.share}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {book.notes.length > 0 ? <ul className="sounding__notes">{book.notes.map((note) => <li key={note.pt}>{note[lang]}</li>)}</ul> : null}
      </section>

      <section className="sounding__trail">
        <h2>{t("trailTitle")}</h2>
        {trail.length === 0 ? <p className="sounding__hint">{t("trailEmpty")}</p> : (
          <ol>
            {trail.map((entry, index) => (
              <li key={`${entry.at}-${index}`}><time dateTime={entry.at}>{when(entry.at, locale)}</time> <strong>{entry.investor}</strong> {entry.what[lang]} <span className="sounding__actor">({entry.actor})</span></li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
