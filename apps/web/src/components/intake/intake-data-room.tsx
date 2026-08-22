import {getTranslations} from "next-intl/server";

import type {DataRoomPlan} from "@offroad/data-room";

type Props = {
  locale: string;
  plan: DataRoomPlan | null;
  /** Needed to address the index route; absent on screens that only preview a case. */
  sessionId?: string;
};

const asLocale = (locale: string) => (locale === "en-US" ? "en" : "pt") as "pt" | "en";

/**
 * The outbound room as the desk sees it before anything leaves: each folder with its gate,
 * each entry with its state and, when held, why. The counts come first because "3 ready, 6
 * held, 2 requested" is the sentence the analyst says to the company on the phone.
 */
export async function IntakeDataRoom({locale, plan, sessionId}: Props) {
  const t = await getTranslations({locale, namespace: "Intake.dataRoom"});
  const lang = asLocale(locale);
  if (!plan) return null;

  return (
    <div className={`case-room ${plan.releasable ? "is-releasable" : "is-held"}`}>
      <div className="case-room__head">
        <h3>{t("title")}</h3>
        <span className="case-room__state">{plan.releasable ? t("releasable") : t("notReleasable")}</span>
      </div>
      <p className="case-room__counts">{t("counts", {ready: plan.counts.ready, held: plan.counts.held, requested: plan.counts.requested})}</p>
      {plan.holds.length > 0 ? (
        <ul className="case-room__holds">
          {plan.holds.map((hold) => (
            <li key={hold.pt}>{hold[lang]}</li>
          ))}
        </ul>
      ) : null}

      {plan.folders.map((folder) => {
        const entries = plan.entries.filter((entry) => entry.folderId === folder.id);
        if (entries.length === 0) return null;
        return (
          <section className="case-room__folder" key={folder.id}>
            <h4>
              {folder.name[lang]}
              <span className={`case-room__tier is-${folder.tier}`}>{t(`tier_${folder.tier}`)}</span>
            </h4>
            <ul>
              {entries.map((entry) => (
                <li className={`is-${entry.status}`} key={entry.id}>
                  <span className="case-room__name">{entry.name[lang]}</span>
                  <span className="case-room__status">{t(`status_${entry.status}`)}</span>
                  {entry.source.type === "document" && entry.source.sha256 ? (
                    <code className="case-room__hash" title={entry.source.sha256}>
                      {entry.source.sha256.slice(0, 12)}
                    </code>
                  ) : null}
                  {entry.heldBy.length > 0 ? <span className="case-room__why">{entry.heldBy.map((hold) => hold[lang]).join("; ")}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {sessionId ? (
        <p className="case-room__index">
          <a href={`/${locale}/app/materials/${sessionId}/data_room_index`} rel="noreferrer" target="_blank">
            {t("openIndex")}
          </a>
        </p>
      ) : null}
    </div>
  );
}
