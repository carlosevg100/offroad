import {Check, CircleDashed, FileText} from "lucide-react";
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
};

/**
 * What the desk needs, and what it already has.
 *
 * Two lists, never one bar. The minimum is the line below which the case cannot be opened; the
 * ideal is the line above which it can be priced and taken to market. A single percentage
 * would average the two and hide the only distinction the company actually needs to act on.
 *
 * Every pending item carries its reason. A checklist that says *what* without *why* is a form;
 * the reason is the desk explaining itself, and it is what makes a company send the right file
 * instead of the closest one.
 */
export async function IntakeChecklist({locale, checklist}: ChecklistProps) {
  const t = await getTranslations({locale, namespace: "Intake.checklist"});

  if (!checklist) {
    return (
      <section className="intake-checklist intake-checklist--empty">
        <span className="section-kicker">{t("kicker")}</span>
        <p>{t("emptyBody")}</p>
      </section>
    );
  }

  const groups = [
    {level: "minimum" as const, title: t("minimumTitle"), counts: checklist.minimum},
    {level: "ideal" as const, title: t("idealTitle"), counts: checklist.ideal},
  ];

  // Documents and questions are both part of one request, and the counts above cover both —
  // but they are answered in completely different ways, so they are shown apart.

  return (
    <section className="intake-checklist">
      <div className="intake-checklist__head">
        <span className="section-kicker">{t("kicker")}</span>
        <p className={`intake-checklist__next intake-checklist__next--${checklist.next.state}`} role="status">
          {checklist.next.message}
        </p>
      </div>

      {groups.map((group) => (
        <div key={group.level} className={`intake-checklist__group intake-checklist__group--${group.level}`}>
          <header>
            <h4>{group.title}</h4>
            <span className="intake-checklist__progress">
              {t("progress", {satisfied: group.counts.satisfied, total: group.counts.total})}
            </span>
          </header>

          <ul>
            {checklist.items
              .filter((item) => item.level === group.level && item.source === "document")
              .map((item) => (
                <li key={item.id} className={item.satisfied ? "is-satisfied" : "is-pending"}>
                  <span className="intake-checklist__mark" aria-hidden="true">
                    {item.satisfied ? <Check size={14} /> : <CircleDashed size={14} />}
                  </span>
                  <div className="intake-checklist__item">
                    <strong>{item.label}</strong>
                    <span className="intake-checklist__state">{item.satisfied ? t("satisfied") : t("pending")}</span>
                    {item.satisfied ? (
                      <span className="intake-checklist__files">
                        <FileText aria-hidden="true" size={12} /> {item.satisfiedBy.join(" · ")}
                      </span>
                    ) : (
                      <span className="intake-checklist__why">
                        <em>{t("whyItMatters")}:</em> {item.rationale}
                      </span>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        </div>
      ))}

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
