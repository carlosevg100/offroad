import {Check, CircleDashed, Clock, FileText, Flag, MinusCircle} from "lucide-react";
import {getTranslations} from "next-intl/server";

import type {ArchetypeId} from "@offroad/credit-playbook";
import type {IntakeChecklist as Checklist} from "@/lib/intake/checklist";

type OperationProps = {
  locale: string;
  selected: ArchetypeId | null;
  /** Sets the session's archetype (`archetype`, `session_id`, `locale`). */
  action: (formData: FormData) => Promise<void>;
  sessionId: string;
};

const OPERATIONS: readonly ArchetypeId[] = [
  "growth_expansion",
  "working_capital",
  "refinance",
  "acquisition",
  "equipment_finance",
  "other",
];

/**
 * The first question a desk asks, asked first.
 *
 * Everything downstream — which documents are required, what gets read first, which questions
 * come back, what the structure looks like — follows from what the money is for. Asking it at
 * the end, or inferring it from the documents, is how an intake ends up requesting things the
 * operation never needed.
 */
export async function IntakeOperation({locale, selected, action, sessionId}: OperationProps) {
  const t = await getTranslations({locale, namespace: "Intake.operation"});

  return (
    <section className="intake-operation">
      <div className="intake-operation__intro">
        <span className="section-kicker">{t("kicker")}</span>
        <h3>{t("title")}</h3>
        <p>{t("body")}</p>
      </div>

      <form action={action} className="intake-operation__options">
        <input type="hidden" name="session_id" value={sessionId} />
        <input type="hidden" name="locale" value={locale} />
        {OPERATIONS.map((id) => (
          <button
            key={id}
            type="submit"
            name="archetype"
            value={id}
            className={`intake-operation__option${selected === id ? " intake-operation__option--selected" : ""}`}
            aria-pressed={selected === id}
          >
            <span>{t(id)}</span>
            {selected === id ? <Check aria-hidden="true" size={16} /> : <CircleDashed aria-hidden="true" size={16} />}
          </button>
        ))}
      </form>
    </section>
  );
}

type ChecklistProps = {
  locale: string;
  checklist: Checklist | null;
  sessionId?: string;
  /** Records "does not apply" / "partly ready" / "after the NDA" against one item. */
  respond?: (formData: FormData) => Promise<void>;
};

/**
 * What the desk needs now, what a fund will ask later, and what only exists at closing.
 *
 * The old screen showed two lists — minimum and ideal — with no time on them, and it failed in
 * both directions at once. A company read the whole thing as the price of admission and
 * concluded it had to assemble a data room before anyone would look at it. Then, having sent
 * everything, it met a fund's diligence list and decided the platform had under-asked.
 *
 * So the axis is time, and the horizon is stated rather than implied. **Agora** is small and
 * open. **Na diligência** is closed by default, explicitly not requested, and there so the road
 * is visible. **No fechamento** is closed, has no marks at all, and contains nothing anyone
 * could mistake for a task.
 *
 * Collapsed sections are `<details>`, which costs no JavaScript, keeps keyboard and screen
 * reader behaviour correct, and is honest: the later stages are one click away rather than
 * hidden.
 *
 * Every pending item can be answered without a file — does not apply, partly ready, after the
 * NDA. A list whose only states are sent and missing makes a company look delinquent for things
 * it does not have and cannot have, and people stop reading a list that is permanently red.
 */
export async function IntakeChecklist({locale, checklist, sessionId, respond}: ChecklistProps) {
  const t = await getTranslations({locale, namespace: "Intake.checklist"});

  if (!checklist) {
    return (
      <section className="intake-checklist intake-checklist--empty">
        <span className="section-kicker">{t("kicker")}</span>
        <p>{t("emptyBody")}</p>
      </section>
    );
  }

  const now = checklist.byStage.now.filter((item) => item.source === "document");
  const later = checklist.byStage.diligence.filter((item) => item.source === "document");
  const closing = checklist.byStage.closing;
  const outstanding = now.filter((item) => !item.satisfied).length;

  /** One item, with its reason, what to send, and a way to say it does not apply. */
  const renderItem = (item: (typeof now)[number], interactive: boolean) => (
    <li key={item.id} className={item.satisfied ? "is-satisfied" : `is-pending is-${item.response ?? "open"}`}>
      <span className="intake-checklist__mark" aria-hidden="true">
        {item.satisfied ? <Check size={14} /> : item.response === "partial" ? <Clock size={14} /> : <CircleDashed size={14} />}
      </span>
      <div className="intake-checklist__item">
        <strong>{item.label}</strong>
        {item.period ? <span className="intake-checklist__period">{item.period}</span> : null}
        <span className="intake-checklist__state">
          {item.satisfied
            ? item.response === "not_applicable"
              ? t("notApplicable")
              : t("satisfied")
            : item.response
              ? t(`response_${item.response}`)
              : t("pending")}
        </span>

        {item.satisfied && item.satisfiedBy.length > 0 ? (
          <span className="intake-checklist__files">
            <FileText aria-hidden="true" size={12} /> {item.satisfiedBy.join(" · ")}
          </span>
        ) : null}
        {item.note ? <span className="intake-checklist__note">{item.note}</span> : null}

        {!item.satisfied ? (
          <>
            <span className="intake-checklist__why">
              <em>{t("whyItMatters")}:</em> {item.rationale}
            </span>
            {item.accepts.length > 0 ? (
              <div className="intake-checklist__accepts">
                <em>{t("whatToSend")}:</em>
                <ul>
                  {item.accepts.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {interactive && respond && sessionId ? (
              <details className="intake-checklist__respond">
                <summary>{t("cannotSend")}</summary>
                <form action={respond}>
                  <input type="hidden" name="session_id" value={sessionId} />
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="requirement_id" value={item.id} />
                  <label htmlFor={`response-${item.id}`}>{t("responseLabel")}</label>
                  <select defaultValue={item.response ?? "not_applicable"} id={`response-${item.id}`} name="response">
                    <option value="not_applicable">{t("response_not_applicable")}</option>
                    <option value="partial">{t("response_partial")}</option>
                    <option value="after_nda">{t("response_after_nda")}</option>
                  </select>
                  <label htmlFor={`note-${item.id}`}>{t("noteLabel")}</label>
                  <textarea
                    defaultValue={item.note ?? ""}
                    id={`note-${item.id}`}
                    name="note"
                    placeholder={t("notePlaceholder")}
                    required
                    rows={2}
                  />
                  <button className="button button--ghost" type="submit">
                    {t("responseSave")}
                  </button>
                </form>
              </details>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );

  return (
    <section className="intake-checklist">
      <div className="intake-checklist__head">
        <span className="section-kicker">{t("kicker")}</span>
        {/* The frame, stated before the list. Without it the list is the message. */}
        <p className="intake-checklist__frame">{t("frame", {count: now.length})}</p>
        <p className={`intake-checklist__next intake-checklist__next--${checklist.next.state}`} role="status">
          {checklist.next.message}
        </p>
      </div>

      <div className="intake-checklist__group intake-checklist__group--now">
        <header>
          <h4>{t("stageNowTitle")}</h4>
          <span className="intake-checklist__progress">
            {t("progress", {satisfied: now.length - outstanding, total: now.length})}
          </span>
        </header>
        <p className="intake-checklist__stageBody">{t("stageNowBody")}</p>
        <ul>{now.map((item) => renderItem(item, true))}</ul>
      </div>

      {/* Closed by default and explicitly not requested. The point is that the road is visible,
          not that there is more work today. */}
      {later.length > 0 ? (
        <details className="intake-checklist__group intake-checklist__group--diligence">
          <summary>
            <Flag aria-hidden="true" size={14} />
            <span>{t("stageDiligenceTitle")}</span>
            <span className="intake-checklist__count">{t("stageCount", {count: later.length})}</span>
          </summary>
          <p className="intake-checklist__stageBody">{t("stageDiligenceBody")}</p>
          <ul>{later.map((item) => renderItem(item, true))}</ul>
        </details>
      ) : null}

      {closing.length > 0 ? (
        <details className="intake-checklist__group intake-checklist__group--closing">
          <summary>
            <MinusCircle aria-hidden="true" size={14} />
            <span>{t("stageClosingTitle")}</span>
            <span className="intake-checklist__count">{t("stageCount", {count: closing.length})}</span>
          </summary>
          <p className="intake-checklist__stageBody">{t("stageClosingBody")}</p>
          <ul className="intake-checklist__notices">
            {closing.map((item) => (
              <li key={item.id}>
                <strong>{item.label}</strong>
                {item.period ? <span className="intake-checklist__period">{item.period}</span> : null}
                <span className="intake-checklist__why">{item.rationale}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {checklist.unmatched.length > 0 ? (
        <p className="intake-checklist__unmatched">
          {t("unmatched", {count: checklist.unmatched.length})}{" "}
          {checklist.unmatched
            .filter((document) => document.kind)
            .map((document) => `${document.name} (${t("recognizedAs")}: ${document.kind})`)
            .join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
