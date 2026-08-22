import {Check, CircleDashed, Clock, FileText} from "lucide-react";
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
  "venture_debt",
  "other",
];

/** Common supporting material that improves almost every case before operation-specific depth. */
const RECOMMENDED_REQUIREMENTS = new Set([
  "reviewed_interim",
  "bank_statements",
  "tax_clearance",
  "auditor_opinion",
  "institutional_materials",
]);

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
            <span><strong>{t(id)}</strong><small>{t(`${id}Body`)}</small></span>
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
 * The operation-specific information request list.
 *
 * Minimum holds the material needed to open the analysis. Recommended holds the common
 * supporting material that improves almost every case. Ideal holds the operation-specific
 * depth that prepares a later diligence process. Closing requirements are intentionally absent:
 * they are a roadmap for execution, not an upload task during origination.
 *
 * Every pending item explains what can be sent, why it matters and how to record that it is
 * partial, unavailable until an NDA, or not applicable. The list is answered by classified
 * documents rather than by asking the company to tick boxes itself.
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

  const minimum = checklist.byStage.now.filter((item) => item.source === "document" && item.level === "minimum");
  const later = checklist.byStage.diligence.filter((item) => item.source === "document");
  const recommended = later.filter((item) => RECOMMENDED_REQUIREMENTS.has(item.id));
  const ideal = later.filter((item) => !RECOMMENDED_REQUIREMENTS.has(item.id));
  const allRequested = [...minimum, ...recommended, ...ideal];

  /** One item, with its reason, what to send, and a way to say it does not apply. */
  const renderItem = (item: (typeof minimum)[number], interactive: boolean) => (
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
          <details className="intake-checklist__guidance">
            <summary>{t("viewGuidance")}</summary>
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
              <div className="intake-checklist__respond">
                <strong>{t("cannotSend")}</strong>
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
              </div>
            ) : null}
          </details>
        ) : null}
      </div>
    </li>
  );

  const renderTier = (id: "minimum" | "recommended" | "ideal", items: typeof minimum, index: number) => {
    const satisfied = items.filter((item) => item.satisfied).length;
    return (
      <section className={`intake-request-tier intake-request-tier--${id}`} key={id}>
        <header>
          <span className="intake-request-tier__number">0{index}</span>
          <div><h4>{t(`${id}Title`)}</h4><p>{t(`${id}Body`)}</p></div>
          <span className="intake-checklist__progress">{t("progress", {satisfied, total: items.length})}</span>
        </header>
        {items.length ? <ul>{items.map((item) => renderItem(item, id !== "ideal"))}</ul> : <p className="intake-request-tier__empty">{t("tierEmpty")}</p>}
      </section>
    );
  };

  return (
    <section className="intake-checklist intake-request-list">
      <div className="intake-checklist__head">
        <span className="section-kicker">{t("requestKicker")}</span>
        <h3>{t("requestTitle")}</h3>
        <p className="intake-checklist__frame">{t("requestBody")}</p>
        <p className={`intake-checklist__next intake-checklist__next--${checklist.next.state}`} role="status">{checklist.next.message}</p>
      </div>

      <div className="intake-request-list__tiers">
        {renderTier("minimum", minimum, 1)}
        {renderTier("recommended", recommended, 2)}
        {renderTier("ideal", ideal, 3)}
      </div>

      {checklist.unmatched.length > 0 ? (
        <p className="intake-checklist__unmatched">
          {t("unmatched", {count: checklist.unmatched.length})}{" "}
          {checklist.unmatched
            .filter((document) => document.kind)
            .map((document) => `${document.name} (${t("recognizedAs")}: ${document.kind})`)
            .join(" · ")}
        </p>
      ) : null}
      <span className="sr-only">{t("totalItems", {count: allRequested.length})}</span>
    </section>
  );
}
