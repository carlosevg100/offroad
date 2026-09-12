"use client";

import {useState} from "react";
import Link from "next/link";
import {brand} from "@/config/brand";
import type {AppLocale} from "@/i18n/routing";
import {publicPath} from "@/lib/website-routes";
import styles from "./public-site.module.css";

type Copy = typeof import("../../messages/pt-BR.json")["Website"];

export function ComparisonExample({copy}: {copy: Copy["lab"]}) {
  const [focus, setFocus] = useState<"liquidity" | "flexibility" | "cost">("liquidity");
  return <div className={styles.lab}>
    <div className={styles.labHeading}><span className={styles.eyebrow}>{copy.label}</span><h2>{copy.title}</h2><p>{copy.body}</p></div>
    <div className={styles.labBody}><div className={styles.offers}><article><span>{copy.offerA}</span><p>{copy.aTerms}</p></article><article><span>{copy.offerB}</span><p>{copy.bTerms}</p></article></div>
      <div className={styles.segmented} role="group" aria-label={copy.focus}>{(["liquidity", "flexibility", "cost"] as const).map(key => <button type="button" key={key} aria-pressed={focus === key} onClick={() => setFocus(key)}>{copy[key]}</button>)}</div>
      <div className={styles.labAnswer} aria-live="polite" aria-atomic="true"><h3>{copy[`${focus}Title`]}</h3><p>{copy[`${focus}Body`]}</p><div className={styles.labNext}><span>{copy.next}</span><p>{copy[`${focus}Work`]}</p></div></div>
    </div><p className={styles.finePrint}>{copy.note}</p>
  </div>;
}

export function DemoContact({locale, copy, audiences}: {locale: AppLocale; copy: Copy["demo"]; audiences: Copy["who"]}) {
  const [prepared, setPrepared] = useState(false);
  function prepareEmail(data: FormData) {
    const body = (["name", "email", "institution", "role", "message"] as const)
      .map(key => `${copy[key]}: ${String(data.get(key) ?? "").trim()}`).join("\n\n");
    window.location.href = `mailto:${brand.email}?subject=${encodeURIComponent(copy.subject)}&body=${encodeURIComponent(body)}`;
    setPrepared(true);
  }
  return <div className={styles.contactPanel}><form action={prepareEmail} className={styles.contactForm}>
    <div className={styles.formPair}><label htmlFor="demo-name">{copy.name}<input id="demo-name" name="name" autoComplete="name" maxLength={100} required /></label><label htmlFor="demo-email">{copy.email}<input id="demo-email" name="email" autoComplete="email" type="email" maxLength={160} required /></label></div>
    <label htmlFor="demo-institution">{copy.institution}<input id="demo-institution" name="institution" autoComplete="organization" maxLength={160} required /></label>
    <label htmlFor="demo-role">{copy.role}<select id="demo-role" name="role" defaultValue="" required><option value="" disabled>{copy.choose}</option>{(["companies", "advisors", "investors"] as const).map(key => <option key={key}>{audiences[key].name}</option>)}</select></label>
    <label htmlFor="demo-message">{copy.message}<textarea id="demo-message" name="message" maxLength={800} rows={4} aria-describedby="demo-message-help" /></label><p className={styles.finePrint} id="demo-message-help">{copy.optional}</p>
    <p className={styles.finePrint}>{copy.note} <Link href={publicPath(locale,"privacy")}>{copy.privacy}</Link></p>
    <button className={styles.button} type="submit">{copy.submit}<span aria-hidden="true">↗</span></button>
    {prepared && <p className={styles.contactStatus} role="status">{copy.prepared}</p>}
  </form><div className={styles.directContact}><p>{copy.direct}</p><a href={`mailto:${brand.email}`}>{brand.email} ↗</a></div></div>;
}
