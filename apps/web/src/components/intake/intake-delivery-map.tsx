import {Check, CircleDashed, FileText, Hourglass, MinusCircle, Search} from "lucide-react";
import {getTranslations} from "next-intl/server";

import type {IntakeChecklist as Checklist} from "@/lib/intake/checklist";
import type {IntakeDocumentSummary} from "@/lib/intake/types";

export type DeliveryMapChecklist = Pick<Checklist, "activeBatch" | "resolved" | "unmatched">;

type Props = {
  locale: string;
  documents: IntakeDocumentSummary[];
  checklist: DeliveryMapChecklist | null;
  /** Whether the documents have been read yet: before processing, every file is "waiting". */
  sessionStatus: string;
};

/**
 * What has been delivered, what each file turned out to be, and what is still open, in one
 * glance, next to the drop zone.
 *
 * The checklist below is the full list with reasons; this is the map a company looks at while
 * dragging files in. Each uploaded file gets a sentence about itself: which requirement it
 * discharged, what it was recognised as when it discharged nothing, or that it is still waiting
 * to be read. A file that lands and shows only its name teaches the company nothing about
 * whether it was the right file.
 */
export async function IntakeDeliveryMap({locale, documents, checklist, sessionStatus}: Props) {
  const t = await getTranslations({locale, namespace: "Intake.deliveryMap"});
  if (!checklist) return null;

  const now = [...checklist.resolved, ...checklist.activeBatch].filter((item) => item.source === "document");
  const delivered = now.filter((item) => item.satisfied);
  const unmatched = new Map(checklist.unmatched.map((entry) => [entry.name, entry.kind]));
  const processing = sessionStatus === "processing";
  const read = !["open", "collecting", "processing", "failed"].includes(sessionStatus);

  const statusOf = (name: string) => {
    const satisfies = now.filter((item) => item.satisfiedBy.includes(name)).map((item) => item.label);
    if (satisfies.length > 0) return {tone: "ok", text: t("fileSatisfies", {items: satisfies.join(", ")})};
    if (unmatched.has(name)) return {tone: "warn", text: t("fileUnmatched", {kind: unmatched.get(name)!})};
    if (processing) return {tone: "wait", text: t("fileReading")};
    if (read) return {tone: "warn", text: t("fileUnrecognised")};
    return {tone: "wait", text: t("fileWaiting")};
  };

  return (
    <section aria-label={t("kicker")} className="intake-map">
      <header className="intake-map__head">
        <div>
          <span className="section-kicker">{t("kicker")}</span>
          <h4>{t("progress", {delivered: delivered.length, total: now.length})}</h4>
        </div>
        <div aria-hidden="true" className="intake-map__bar">
          <span style={{width: `${now.length ? Math.round((delivered.length / now.length) * 100) : 0}%`}} />
        </div>
      </header>

      <ul className="intake-map__items">
        {now.map((item) => (
          <li key={item.id} className={item.satisfied ? "is-delivered" : item.response ? `is-${item.response}` : "is-open"}>
            {item.satisfied ? (
              item.response === "not_applicable" ? <MinusCircle aria-hidden="true" size={13} /> : <Check aria-hidden="true" size={13} />
            ) : item.response === "partial" ? (
              <Hourglass aria-hidden="true" size={13} />
            ) : (
              <CircleDashed aria-hidden="true" size={13} />
            )}
            <span>{item.label}</span>
          </li>
        ))}
      </ul>

      {documents.length > 0 ? (
        <ul className="intake-map__files">
          {documents.map((document) => {
            const status = statusOf(document.original_name);
            return (
              <li key={document.id} className={`is-${status.tone}`}>
                <FileText aria-hidden="true" size={13} />
                <strong>{document.original_name}</strong>
                <span>{status.text}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="intake-map__empty">
          <Search aria-hidden="true" size={13} /> {t("empty")}
        </p>
      )}
    </section>
  );
}
