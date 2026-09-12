import Image from "next/image";
import Link from "next/link";
import {Plus, LockKeyhole} from "lucide-react";
import type {AppLocale} from "@/i18n/routing";
import {publicPath} from "@/lib/website-routes";
import {websiteFinancialBaseline} from "@/lib/website-example";
import {PublicOffering} from "./public-offering";
import {PublicCapitalJourney} from "./public-capital-journey";
import styles from "./public-narrative.module.css";

type Copy = typeof import("../../messages/pt-BR.json")["Website"];
const audiences = ["companies", "advisors", "investors"] as const;

export function ProductHome({locale, copy}: {locale: AppLocale; copy: Copy}) {
  const {audiences: a, method: m, market, journey: j, trust: t} = copy.narrative;
  return <>
    <PublicOffering locale={locale} copy={copy.offering}/>
    <section className={styles.section} id="audiences" aria-labelledby="audiences-title">
      <span className={styles.label}>{a.label}</span>
      <div className={`${styles.heading} ${styles.wideHeading}`}><h2 id="audiences-title">{a.title}</h2><p>{a.intro}</p></div>
      <div className={styles.audienceRows}>{audiences.map((key, i) => <Link href={publicPath(locale, key)} key={key} className={styles.audienceRow}>
        <div className={styles.audienceIdentity}><span className={styles.index}>0{i + 1}</span><span className={styles.position}>{a[key].position}</span><h3>{a[key].name}</h3><p className={styles.roles}>{a[key].roles}</p></div>
        <div className={styles.audienceBenefit}><h4>{a[key].benefit}</h4><p>{a[key].body}</p><span className={styles.linkLabel}>{a[key].link}</span></div>
      </Link>)}</div>
      <div className={styles.audienceFoot}><p>{a.seniority}</p><p>{a.boundary}</p></div>
    </section>
    <section className={styles.method} id="by-finance" aria-labelledby="method-title">
      <div className={styles.section}>
        <span className={styles.label}>{m.label}</span>
        <div className={styles.heading}><h2 id="method-title">{m.title}</h2><p>{m.intro}</p></div>
        <Image className={styles.productPhoto} src={`/website/product-${locale === "pt-BR" ? "pt" : "en"}.png`} width={1672} height={941} sizes="(max-width: 800px) 100vw, 1240px" alt={m.photoAlt}/>
        <div className={styles.methodDetails}>
          <div className={styles.modelRole}><div><h3>{m.modelsTitle}</h3><p>{m.modelsBody}</p></div><div><h3>{m.expertiseTitle}</h3><p>{m.expertiseBody}</p></div><Link className={styles.textLink} href={publicPath(locale,"about")}>{m.link}</Link></div>
          <div className={styles.methodList}>{(["workflow", "calculations", "materials", "detail"] as const).map((key, i) => <details key={key} className={styles.methodItem}><summary><span>0{i + 1}</span><h3>{m[key].title}</h3><Plus size={20} aria-hidden="true"/></summary><p>{m[key].body}</p></details>)}</div>
        </div>
      </div>
    </section>
    <section className={styles.section} id="capital-intelligence" aria-labelledby="market-title">
      <span className={styles.label}>{market.label}</span><div className={styles.heading}><h2 id="market-title">{market.title}</h2><p>{market.intro}</p></div>
      <div className={styles.marketSides}><article><span>{market.leftLabel}</span><h3>{market.leftTitle}</h3><p>{market.leftBody}</p></article><div className={styles.marketMark} aria-hidden="true"><Image src="/brand/offroad-symbol.png" width={512} height={520} alt=""/></div><article><span>{market.rightLabel}</span><h3>{market.rightTitle}</h3><p>{market.rightBody}</p></article></div>
      <div className={styles.marketCriteria}><h3>{market.criteriaTitle}</h3><ul>{(["instrument", "ticket", "risk", "policy"] as const).map(key => <li key={key}>{market[key]}</li>)}</ul></div>
      <details className={styles.relationship}><summary>{market.relationshipTitle}<Plus size={18} aria-hidden="true"/></summary><p>{market.relationshipBody}</p></details>
      <div className={styles.marketFoot}><p>{market.note}</p><Link className={styles.textLink} href={publicPath(locale,"intelligence")}>{market.link}</Link></div>
    </section>
    <section className={styles.journeySection} id="how-it-works" aria-labelledby="journey-title"><div className={styles.section}>
      <span className={styles.label}>{j.label}</span><div className={styles.heading}><h2 id="journey-title">{j.title}</h2><p>{j.intro}</p></div>
      <PublicCapitalJourney copy={j} financialCopy={copy.workbench} financials={websiteFinancialBaseline(locale)}/>
      <div className={styles.continuity}><h3>{j.continuityTitle}</h3><div><p>{j.continuityBody}</p><Link className={styles.textLink} href={publicPath(locale,"cases")}>{j.link}</Link></div></div>
    </div></section>
    <section className={styles.section} id="institutional-trust" aria-labelledby="trust-title">
      <span className={styles.label}>{t.label}</span><div className={styles.heading}><h2 id="trust-title">{t.title}</h2><p>{t.intro}</p></div>
      <div className={styles.trustGrid}>{(["standards", "collaboration", "security"] as const).map((key,i) => <article key={key}><span className={styles.index}>0{i + 1}</span><h3>{t[key].title}</h3><p>{t[key].benefit}</p><details className={styles.expand}><summary>{t.more}<Plus size={18} aria-hidden="true"/></summary><p>{t[key].body}</p></details></article>)}</div>
      <div className={styles.trustFoot}><LockKeyhole size={24} strokeWidth={1.5} aria-hidden="true"/><div><p>{t.status}</p><p>{t.soc}</p></div><Link className={styles.textLink} href={publicPath(locale,"security")}>{t.link}</Link></div>
    </section>
  </>;
}
