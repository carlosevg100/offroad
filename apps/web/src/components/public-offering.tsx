import Link from "next/link";
import {Plus} from "lucide-react";
import type {AppLocale} from "@/i18n/routing";
import {publicPath} from "@/lib/website-routes";
import styles from "./public-narrative.module.css";

type Copy = typeof import("../../messages/pt-BR.json")["Website"]["offering"];
const roles = [{key: "advisor", page: "strategy"}, {key: "analyst", page: "execution"}, {key: "connection", page: "intelligence"}] as const;

export function PublicOffering({locale, copy: c}: {locale: AppLocale; copy: Copy}) {
  return <>
    <section className={styles.section} aria-labelledby="offering-title" id="offering">
      <span className={styles.label}>{c.label}</span>
      <div className={styles.heading}><h2 id="offering-title">{c.title}</h2><p>{c.intro}</p></div>
      <div className={styles.offerGrid}>{roles.map(({key, page}, index) => <article key={key}>
        <span className={styles.index}>0{index + 1}</span><h3>{c[key].title}</h3><p className={styles.benefit}>{c[key].benefit}</p><p>{c[key].body}</p>
        <details className={styles.expand}><summary>{c.more}<Plus size={18} aria-hidden="true"/></summary><p>{c[key].detail}</p><Link href={publicPath(locale, page)}>{c[key].link}</Link></details>
      </article>)}</div>
      <p className={styles.principle}>{c.principle}</p>
    </section>
    <section className={styles.empower}><div><h2>{c.empowerTitle}</h2><p>{c.empowerBody}</p></div></section>
  </>;
}
