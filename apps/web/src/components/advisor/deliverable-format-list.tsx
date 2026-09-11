"use client";

import {useTranslations} from "next-intl";
import type {DeliverableFormatDecision} from "@offroad/case-export/deliverable-formats";

import styles from "./deliverable-format-list.module.css";

/**
 * The formats one delivery may produce, exactly as the shared policy decided them. The surface
 * never invents a format and never hides a refusal behind a disabled control: a format that is not
 * offered stays visible with the reason, so the person knows what to do next.
 */
export function DeliverableFormatList({decisions, basePath, label}: {
  decisions: readonly DeliverableFormatDecision[];
  /** Download path of this exact delivery; the format is the last segment. */
  basePath: string;
  label?: string;
}) {
  const t = useTranslations("DeliverableFormats");
  if (decisions.length === 0) return null;
  const conditions = [...new Set(decisions.filter(decision => decision.available).flatMap(decision => decision.conditions))];
  return <section className={styles.formats} aria-label={label ?? t("title")} data-testid="deliverable-formats">
    <ul className={styles.list}>
      {decisions.map(decision => {
        // Reading in the product is not a file, so it never becomes a download link.
        const href = decision.available && decision.format !== "interactive" ? `${basePath}/${decision.format}` : null;
        const name = t(`formats.${decision.format}`);
        const role = t(`roles.${decision.role}`);
        return <li key={decision.format} className={styles.item} data-format={decision.format} data-available={decision.available && href !== null ? "yes" : "no"}>
          {href
            ? <a className={styles.link} href={href} data-format={decision.format}><span className={styles.name}>{name}</span><span className={styles.role}>{role}</span></a>
            : <span className={styles.unavailable}><span className={styles.name}>{name}</span><span className={styles.role}>{decision.block ? t(`blocked.${decision.block}`) : decision.available ? role : t("unavailableLabel")}</span></span>}
        </li>;
      })}
    </ul>
    {conditions.length > 0 && <dl className={styles.conditions}>
      <dt>{t("conditionsLabel")}</dt>
      {conditions.map(condition => <dd key={condition}>{t(`conditions.${condition}`)}</dd>)}
    </dl>}
  </section>;
}
