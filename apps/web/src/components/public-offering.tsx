import Link from "next/link";
import {Plus} from "lucide-react";
import type {AppLocale} from "@/i18n/routing";
import {publicPath} from "@/lib/website-routes";
import {websiteFinancialBaseline, websiteOfferExample} from "@/lib/website-example";
import {PublicAdvisorDemo, PublicAnalystDemo, PublicConnectionDemo} from "./public-offer-demos";
import styles from "./public-offering.module.css";

type Copy = typeof import("../../messages/pt-BR.json")["Website"]["offering"];
const roles = [{key:"advisor",page:"strategy"},{key:"analyst",page:"execution"},{key:"connection",page:"intelligence"}] as const;

export function PublicOffering({locale, copy:c}: {locale:AppLocale; copy:Copy}) {
  const example = websiteOfferExample(locale);
  return <section className={styles.section} aria-labelledby="offering-title" id="offering">
    <div className={styles.inner}>
      <div className={styles.heading} data-reveal><div><span className={styles.label}>{c.label}</span><h2 id="offering-title">{c.title.split("\n").map((line,index) => <span key={line} data-tone={index ? "muted" : "ink"}>{line}</span>)}</h2></div><p>{c.intro}</p></div>
      <div className={styles.cards}>{roles.map(({key,page}) => {
        const role = c[key];
        return <article key={key} className={[styles.card, styles[key]].filter(Boolean).join(" ")} aria-labelledby={`offer-${key}-title`} data-reveal>
          <div className={styles.copy}>
            <span className={styles.roleLabel}>{role.label}</span>
            <h3 id={`offer-${key}-title`}>{role.title.slice(0,-role.accent.length)}<span>{role.accent}</span></h3>
            <p className={styles.benefit}>{role.benefit}</p><p className={styles.body}>{role.body}</p>
            <details className={styles.expand}><summary>{c.more}<Plus size={17} aria-hidden="true"/></summary><p>{role.detail}</p></details>
            <Link className={styles.link} href={publicPath(locale,page)}>{role.link}</Link>
          </div>
          <div className={styles.stage}>
            {key === "advisor" && <PublicAdvisorDemo copy={c.demo.advisor} data={example} exampleLabel={c.demo.example}/>}
            {key === "analyst" && <PublicAnalystDemo copy={c.demo.analyst} data={example} exampleLabel={c.demo.example} replayLabel={c.demo.replay} financials={websiteFinancialBaseline(locale)}/>}
            {key === "connection" && <PublicConnectionDemo copy={c.demo.connection} data={example}/>}
          </div>
        </article>;
      })}</div>
      <p className={styles.principle} data-reveal>{c.principle.split(/(?<=\.)\s+/).map(sentence => <span key={sentence}>{sentence}</span>)}</p>
    </div>
  </section>;
}

export function PublicEmpower({copy:c}: {copy:Copy}) {
  return <section className={styles.empower} id="professional-capacity" aria-labelledby="empower-title" data-reveal><div className={styles.empowerInner}>
    <h2 id="empower-title">{c.empowerTitle}<span>{c.empowerAccent}</span></h2><p>{c.empowerBody}</p>
  </div></section>;
}
