import Image from "next/image";
import Link from "next/link";
import {Plus, LockKeyhole, Workflow, Calculator, Presentation, ScanSearch, ListChecks, UsersRound} from "lucide-react";
import type {AppLocale} from "@/i18n/routing";
import {publicPath} from "@/lib/website-routes";
import {websiteAdvisorExample} from "@/lib/website-advisor-example";
import {PublicOffering, PublicEmpower} from "./public-offering";
import {PublicCapitalJourney} from "./public-capital-journey";
import {PublicAudienceShowcase} from "./public-audience-showcase";
import {PublicScrollEffects} from "./public-scroll-effects";
import styles from "./public-narrative.module.css";
import visual from "./public-visual-home.module.css";

type Copy = typeof import("../../messages/pt-BR.json")["Website"];
const methodTiles = [{key:"workflow",Icon:Workflow},{key:"calculations",Icon:Calculator},{key:"materials",Icon:Presentation},{key:"detail",Icon:ScanSearch}] as const;
const trustTiles = [{key:"standards",Icon:ListChecks},{key:"collaboration",Icon:UsersRound},{key:"security",Icon:LockKeyhole}] as const;

function SplitHeading({id,title}:{id:string;title:string}) {
  return <h2 id={id} className={visual.splitHeading}>{title.split("\n").map((line,index)=><span key={line} data-tone={index ? "muted" : "ink"}>{line}</span>)}</h2>;
}

export function ProductHome({locale, copy}: {locale: AppLocale; copy: Copy}) {
  const {audiences: a, method: m, market, journey: j, trust: t} = copy.narrative;
  return <PublicScrollEffects>
    <PublicEmpower copy={copy.offering}/>
    <PublicOffering locale={locale} copy={copy.offering} caseCopy={copy.capitalCase}/>
    <section className={`${styles.section} ${visual.audienceSection}`} id="audiences" aria-labelledby="audiences-title" data-reveal>
      <span className={styles.label}>{a.label}</span>
      <div className={`${styles.heading} ${styles.wideHeading}`}><SplitHeading id="audiences-title" title={a.title}/><p>{a.intro}</p></div>
      <PublicAudienceShowcase locale={locale} audiences={a} visuals={copy.visualHome} labels={{companies:copy.workbench.companies.label,advisors:copy.workbench.advisors.label,investors:copy.workbench.investors.label}} examples={{companies:copy.pages.companies.example,advisors:copy.pages.advisors.example,investors:copy.pages.investors.example}}/>
      <div className={styles.audienceFoot}><p>{a.seniority}</p><p>{a.boundary}</p></div>
    </section>
    <section className={`${styles.method} ${visual.methodSection}`} id="by-finance" aria-labelledby="method-title" data-reveal>
      <div className={styles.section}>
        <span className={styles.label}>{m.label}</span>
        <div className={styles.heading}><SplitHeading id="method-title" title={m.title}/><p>{m.intro}</p></div>
        <div className={visual.methodShowcase}><div className={visual.photoFrame}><Image src={`/website/product-${locale === "pt-BR" ? "pt" : "en"}.png`} width={1672} height={941} sizes="(max-width: 1000px) 100vw, 760px" alt={m.photoAlt}/></div><div className={visual.methodTiles}>{methodTiles.map(({key,Icon}) => <details key={key} className={visual.methodTile}><summary><Icon size={25} strokeWidth={1.35} aria-hidden="true"/><span>{m[key].title}</span><Plus size={18} aria-hidden="true"/></summary><p>{m[key].body}</p></details>)}</div></div>
        <div className={visual.intelligenceLayers}><div><h3>{m.modelsTitle}</h3><p>{m.modelsBody}</p></div><div><h3>{m.expertiseTitle}</h3><p>{m.expertiseBody}</p></div></div><Link className={styles.textLink} href={publicPath(locale,"about")}>{m.link}</Link>
      </div>
    </section>
    <section className={`${styles.section} ${visual.marketSection}`} id="capital-intelligence" aria-labelledby="market-title" data-reveal>
      <span className={styles.label}>{market.label}</span><div className={styles.heading}><SplitHeading id="market-title" title={market.title}/><p>{market.intro}</p></div>
      <div className={styles.marketSides}><article><span>{market.leftLabel}</span><h3>{market.leftTitle}</h3><p>{market.leftBody}</p></article><div className={styles.marketMark} aria-hidden="true"><Image src="/brand/offroad-symbol.png" width={512} height={520} alt=""/></div><article><span>{market.rightLabel}</span><h3>{market.rightTitle}</h3><p>{market.rightBody}</p></article></div>
      <div className={styles.marketCriteria}><h3>{market.criteriaTitle}</h3><ul>{(["instrument", "ticket", "risk", "policy"] as const).map(key => <li key={key}>{market[key]}</li>)}</ul></div>
      <details className={styles.relationship}><summary>{market.relationshipTitle}<Plus size={18} aria-hidden="true"/></summary><p>{market.relationshipBody}</p></details>
      <div className={styles.marketFoot}><p>{market.note}</p><Link className={styles.textLink} href={publicPath(locale,"intelligence")}>{market.link}</Link></div>
    </section>
    <section className={`${styles.journeySection} ${visual.journeySection}`} id="how-it-works" aria-labelledby="journey-title" data-reveal><div className={styles.section}>
      <span className={styles.label}>{j.label}</span><div className={styles.heading}><SplitHeading id="journey-title" title={j.title}/><p>{j.intro}</p></div>
      <PublicCapitalJourney copy={j} caseCopy={copy.capitalCase} analysis={websiteAdvisorExample(locale)}/>
      <div className={styles.continuity}><h3>{j.continuityTitle}</h3><div><p>{j.continuityBody}</p><Link className={styles.textLink} href={publicPath(locale,"cases")}>{j.link}</Link></div></div>
    </div></section>
    <section className={`${styles.section} ${visual.trustSection}`} id="institutional-trust" aria-labelledby="trust-title" data-reveal>
      <span className={styles.label}>{t.label}</span><div className={styles.heading}><SplitHeading id="trust-title" title={t.title}/><p>{t.intro}</p></div>
      <div className={visual.trustCards}>{trustTiles.map(({key,Icon}) => <article key={key}><div className={visual.trustIcon}><Icon size={28} strokeWidth={1.25} aria-hidden="true"/></div><h3>{t[key].title}</h3><p>{t[key].benefit}</p><details className={styles.expand}><summary>{t.more}<Plus size={18} aria-hidden="true"/></summary><p>{t[key].body}</p></details></article>)}</div>
      <div className={styles.trustFoot}><LockKeyhole size={24} strokeWidth={1.5} aria-hidden="true"/><div><p>{t.status}</p><p>{t.soc}</p></div><Link className={styles.textLink} href={publicPath(locale,"security")}>{t.link}</Link></div>
    </section>
  </PublicScrollEffects>;
}
