import Link from "next/link";
import Image from "next/image";
import {Plus, ScanSearch, SlidersHorizontal, Layers3, CircleUserRound} from "lucide-react";
import type {AppLocale} from "@/i18n/routing";
import {publicPath} from "@/lib/website-routes";
import {websiteFinancialBaseline} from "@/lib/website-example";
import styles from "./public-offering.module.css";

type Copy = typeof import("../../messages/pt-BR.json")["Website"]["offering"];
const roles = [{key: "advisor", page: "strategy"}, {key: "analyst", page: "execution"}, {key: "connection", page: "intelligence"}] as const;

export function PublicOffering({locale, copy: c}: {locale: AppLocale; copy: Copy}) {
  const f = websiteFinancialBaseline(locale);
  return <>
    <section className={styles.section} aria-labelledby="offering-title" id="offering" data-reveal>
      <span className={styles.label}>{c.label}</span>
      <div className={styles.heading}><h2 id="offering-title">{c.title}</h2><p>{c.intro}</p></div>
      <div className={styles.offerGrid}>{roles.map(({key, page}) => <article key={key} className={styles.offerCard}>
        <div className={styles.visual}>
          {key === "advisor" && <div className={styles.advisorVisual}><div className={styles.visualLabel}><ScanSearch size={17} aria-hidden="true"/>{c.visualAdvisor}</div><div className={styles.question}>{c.visualQuestion}</div><div className={styles.factors}>{(["visualAdvisorOne","visualAdvisorTwo","visualAdvisorThree"] as const).map(label => <span key={label}>{c[label]}</span>)}</div><div className={styles.advisorMark}><Image src="/brand/offroad-symbol.png" width={512} height={520} alt=""/></div></div>}
          {key === "analyst" && <div className={styles.analystVisual}><div className={styles.visualLabel}><Layers3 size={17} aria-hidden="true"/>{c.visualAnalyst}</div><div className={styles.miniModel}><div><span>{c.visualReported}</span><strong>{f.reported}</strong></div><div><span>{c.visualAdjustment}</span><strong>{f.adjustment}</strong></div><div><span>{c.visualAdjusted}</span><strong>{f.adjusted}</strong></div></div><p className={styles.example}>{c.visualUnit}</p></div>}
          {key === "connection" && <div className={styles.connectionVisual}><div className={styles.visualLabel}><SlidersHorizontal size={17} aria-hidden="true"/>{c.visualConnection}</div><div className={styles.matchRows}>{(["visualConnectionOne","visualConnectionTwo","visualConnectionThree"] as const).map(label => <div key={label}><span aria-hidden="true"/><span>{c[label]}</span><span aria-hidden="true"/></div>)}</div><p className={styles.example}>{c.visualFit}</p></div>}
        </div>
        <div className={styles.cardCopy}><h3>{c[key].title}</h3><p className={styles.benefit}>{c[key].benefit}</p><details className={styles.expand}><summary>{c.more}<Plus size={18} aria-hidden="true"/></summary><p>{c[key].body}</p><p>{c[key].detail}</p></details><Link className={styles.cardLink} href={publicPath(locale, page)}>{c[key].link}</Link></div>
      </article>)}</div>
      <p className={styles.principle}>{c.principle}</p>
    </section>
  </>;
}

export function PublicEmpower({copy: c}: {copy: Copy}) {
  return <section className={styles.empower} id="professional-capacity" aria-labelledby="empower-title"><div className={styles.empowerInner}>
    <div className={styles.empowerEquation}><span><CircleUserRound size={25} strokeWidth={1.4} aria-hidden="true"/>{c.human}</span><span className={styles.equationLine} aria-hidden="true"/><span className={styles.offroadNode}><Image src="/brand/offroad-symbol.png" width={512} height={520} alt=""/><span>{c.platform}</span></span></div>
    <h2 id="empower-title">{c.empowerTitle}<span>{c.empowerAccent}</span></h2><p>{c.empowerBody}</p>
  </div></section>;
}
