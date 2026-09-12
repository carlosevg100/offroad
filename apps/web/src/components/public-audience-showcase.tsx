"use client";

import {useId, useState} from "react";
import Link from "next/link";
import {Building2, BriefcaseBusiness, Landmark, FileText} from "lucide-react";
import type {AppLocale} from "@/i18n/routing";
import {publicPath} from "@/lib/website-routes";
import styles from "./public-visual-home.module.css";

type Website = typeof import("../../messages/pt-BR.json")["Website"];
type Audience = "companies" | "advisors" | "investors";
const choices = [{key:"companies", Icon:Building2}, {key:"advisors", Icon:BriefcaseBusiness}, {key:"investors", Icon:Landmark}] as const;

export function PublicAudienceShowcase({locale, audiences, labels, examples, visuals, initialAudience = "companies"}: {
  locale: AppLocale; audiences: Website["narrative"]["audiences"]; labels: Record<Audience, string>; examples: Record<Audience, string>; visuals: Website["visualHome"]; initialAudience?: Audience;
}) {
  const [audience, setAudience] = useState<Audience>(initialAudience);
  const id = useId();
  const c = audiences[audience];
  return <div className={styles.audienceShowcase}>
    <div className={styles.audiencePicker} role="group" aria-label={visuals.audienceSelector}>{choices.map(({key, Icon}) => <button type="button" key={key} id={`${id}-${key}`} aria-pressed={audience === key} aria-controls={`${id}-panel`} onClick={() => setAudience(key)}><Icon size={24} strokeWidth={1.4} aria-hidden="true"/><span>{labels[key]}<small>{audiences[key].position}</small></span></button>)}</div>
    <div className={styles.audiencePanel} id={`${id}-panel`} role="region" aria-labelledby={`${id}-${audience}`}>
      <div className={styles.audienceMessage} key={`${audience}-message`}><span>{c.roles}</span><h3>{c.benefit}</h3><p>{c.body}</p><Link href={publicPath(locale,audience)}>{c.link}</Link></div>
      <div className={styles.audienceWork} key={`${audience}-work`} aria-live="polite" aria-atomic="true"><span>{visuals.example}</span><blockquote>{examples[audience]}</blockquote><div className={styles.outputStack}><span>{visuals.outputs}</span>{(["one", "two", "three"] as const).map(key => <div key={key}><FileText size={18} strokeWidth={1.4} aria-hidden="true"/><span>{visuals[audience][key]}</span></div>)}</div></div>
    </div>
  </div>;
}
