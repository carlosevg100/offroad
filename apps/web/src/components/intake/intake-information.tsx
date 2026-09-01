import {Check, CircleDashed} from "lucide-react";
import {getTranslations} from "next-intl/server";

import type {ChecklistItem} from "@/lib/intake/checklist";

type Props = {
  locale: string;
  sessionId: string;
  items: ChecklistItem[];
  /** Saves one answer (`requirement_id`, `answer`, `session_id`, `locale`). */
  action: (formData: FormData) => Promise<void>;
};

/**
 * The half of the request that is not a file.
 *
 * Why now, who the customers are, what the last unit's ramp actually looked like, whether the
 * receivables are already assigned. Nobody uploads a document that says these, and they decide
 * how the case reads — so the desk asks, in the words a banker would use, with an example so
 * nobody has to guess the format.
 *
 * Each answer is one small form that posts on its own. A single long form would lose everything
 * on a mistyped field and would push the company to fill it in one sitting; a data room is
 * assembled over days, by different people, and the request has to survive that.
 */
export async function IntakeInformation({locale, sessionId, items, action}: Props) {
  const t = await getTranslations({locale, namespace: "Intake.checklist"});
  if (items.length === 0) return null;

  return (
    <div className="intake-information">
      <h4>{t("informationTitle")}</h4>

      <ul>
        {items.map((item) => (
          <li key={item.id} className={item.satisfied ? "is-satisfied" : "is-pending"}>
            <div className="intake-information__head">
              <span className="intake-checklist__mark" aria-hidden="true">
                {item.satisfied ? <Check size={14} /> : <CircleDashed size={14} />}
              </span>
              <div>
                <strong>{item.question ?? item.label}</strong>
                <span className="intake-checklist__why">
                  <em>{t("whyItMatters")}:</em> {item.rationale}
                </span>
                {item.example ? (
                  <span className="intake-information__example">
                    <em>{t("example")}:</em> {item.example}
                  </span>
                ) : null}
              </div>
            </div>

            <form action={action} className="intake-information__form">
              <input type="hidden" name="session_id" value={sessionId} />
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="requirement_id" value={item.id} />
              <input type="hidden" name="response" value="provided" />
              <label className="sr-only" htmlFor={`answer-${item.id}`}>
                {item.question ?? item.label}
              </label>
              <textarea
                defaultValue={item.answer ?? ""}
                id={`answer-${item.id}`}
                name="answer"
                placeholder={t("answerPlaceholder")}
                rows={item.answerFormat === "text" || item.answerFormat === "list" ? 3 : 2}
              />
              <button className="button button--ghost" type="submit">
                {t("answerSave")}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}

type PurposeProps = {
  locale: string;
  missingByPurpose: Record<string, string[]>;
};

/**
 * What each pending item buys.
 *
 * A flat list of gaps says how much work is left. This says what the work is *for* — these
 * block the numbers, those are what an investor will ask about, the others are what turns a
 * spreadsheet into a business somebody can picture. People close gaps faster when they can see
 * which part of the outcome each one unblocks, and storytelling in particular gets ignored
 * until someone explains that two identical credit profiles raise different amounts.
 */
export async function IntakeGapPurposes({locale, missingByPurpose}: PurposeProps) {
  const t = await getTranslations({locale, namespace: "Intake.checklist"});
  const purposes = ["investor_case", "financials", "structure", "storytelling"] as const;
  const total = purposes.reduce((sum, purpose) => sum + (missingByPurpose[purpose]?.length ?? 0), 0);
  if (total === 0) return null;

  return (
    <div className="intake-purposes">
      <h4>{t("purposeTitle")}</h4>
      <div className="intake-purposes__grid">
        {purposes.map((purpose) => {
          const missing = missingByPurpose[purpose] ?? [];
          return (
            <div key={purpose} className="intake-purposes__cell">
              <strong>{t(`purpose_${purpose}`)}</strong>
              {missing.length === 0 ? (
                <span className="intake-purposes__empty">{t("purposeEmpty")}</span>
              ) : (
                <ul>
                  {missing.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
