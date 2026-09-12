import Image from "next/image";
import Link from "next/link";
import {getMessages} from "next-intl/server";
import {brand} from "@/config/brand";
import type {AppLocale} from "@/i18n/routing";
import {publicPath, type PublicPage} from "@/lib/website-routes";
import {DemoContact} from "./public-interactions";
import {PublicWorkbench, type WorkbenchAudience} from "./public-workbench";
import {websiteFinancialBaseline} from "@/lib/website-example";
import styles from "./public-site.module.css";

type Copy = typeof import("../../messages/pt-BR.json")["Website"];
const solutionKeys = ["strategy", "execution", "intelligence"] as const;
const audienceKeys = ["companies", "advisors", "investors"] as const;
const caseKeys = ["growth", "terms", "pitch", "credit", "investment", "monitoring"] as const;
const stepKeys = ["one", "two", "three"] as const;
type DetailPage = typeof solutionKeys[number] | typeof audienceKeys[number] | typeof caseKeys[number];
const relatedCases: Record<DetailPage, readonly typeof caseKeys[number][]> = {
  strategy: ["growth", "terms"], execution: ["pitch", "credit"], intelligence: ["investment", "pitch"],
  companies: ["growth", "terms"], advisors: ["pitch", "credit"], investors: ["investment", "monitoring"],
  growth: ["terms", "pitch"], terms: ["growth", "credit"], pitch: ["growth", "credit"],
  credit: ["investment", "monitoring"], investment: ["credit", "monitoring"], monitoring: ["credit", "investment"],
};

export async function websiteCopy(locale: AppLocale) {
  const messages = await getMessages({locale});
  return messages.Website as Copy;
}

function AudienceList({locale, c}: {locale: AppLocale; c: Copy}) {
  return <div className={styles.audienceList}>{audienceKeys.map((key, index) => <Link className={styles.audienceRow} href={publicPath(locale,key)} key={key}><div><span className={styles.index}>0{index+1}</span><h3>{c.who[key].name}</h3><span className={styles.roles}>{c.who[key].roles}</span></div><div><h4>{c.who[key].title}</h4><p>{c.who[key].body}</p></div></Link>)}</div>;
}

function CaseList({locale, c, keys = caseKeys}: {locale: AppLocale; c: Copy; keys?: readonly typeof caseKeys[number][]}) {
  return <div className={styles.caseGrid}>{keys.map(key => <Link className={styles.caseCard} href={publicPath(locale,key)} key={key}><span className={styles.index}>0{caseKeys.indexOf(key)+1}</span><h3>{c.pages[key].title}</h3><p>{c.pages[key].intro}</p><span className={styles.cardLink}>{c.common.explore}</span></Link>)}</div>;
}

function SolutionList({locale, c}: {locale: AppLocale; c: Copy}) {
  return <div className={styles.solutionList}>{solutionKeys.map((key, i) => <Link href={publicPath(locale,key)} key={key}><span className={styles.index}>0{i+1}</span><h3>{c.pages[key].title}</h3><p>{c.pages[key].intro}</p><span className={styles.cardLink}>{c.common.learn}</span></Link>)}</div>;
}

function Connection({locale, c}: {locale: AppLocale; c: Copy}) {
  return <section className={styles.connection}><div className={styles.section}><span className={styles.eyebrow}>{c.connection.label}</span><h2>{c.connection.title}</h2><div className={styles.connectionSides}><article><h3>{c.connection.leftTitle}</h3><p>{c.connection.leftBody}</p></article><div className={styles.connectionMark} aria-hidden="true"><Image src="/brand/offroad-symbol.png" width={512} height={520} alt="" /></div><article><h3>{c.connection.rightTitle}</h3><p>{c.connection.rightBody}</p></article></div><div className={styles.connectionFoot}><p>{c.connection.note}</p><Link className={styles.textLink} href={publicPath(locale,"intelligence")}>{c.common.learn}</Link></div></div></section>;
}


function PageIntro({title, intro, locale, c, parent}: {title: string; intro: string; locale: AppLocale; c: Copy; parent?: "solutions" | "audiences" | "cases"}) {
  return <section className={`${styles.section} ${styles.pageIntro}`}>{parent && <Link className={styles.breadcrumb} href={publicPath(locale,parent)}>{c.nav[parent]}</Link>}<h1>{title}</h1><p>{intro}</p><Link className={styles.button} href={publicPath(locale,"demo")}>{c.nav.demo}</Link></section>;
}

export async function PublicPageContent({locale, page}: {locale: AppLocale; page: Exclude<PublicPage,"home">}) {
  const c = await websiteCopy(locale);
  if (page === "solutions" || page === "audiences" || page === "cases") return <><PageIntro title={c.pages[page].title} intro={c.pages[page].intro} locale={locale} c={c}/><section className={`${styles.section} ${styles.catalogSection}`}>{page === "solutions" ? <SolutionList locale={locale} c={c}/> : page === "audiences" ? <AudienceList locale={locale} c={c}/> : <CaseList locale={locale} c={c}/>}</section>{page === "solutions" && <Connection locale={locale} c={c}/>}<p className={`${styles.section} ${styles.catalogNote}`}>{c.common.demoNote}</p></>;

  if (page === "about") return <><PageIntro title={c.about.title} intro={c.about.intro} locale={locale} c={c}/><section className={styles.aboutStatement}><div className={styles.section}><Image src="/brand/offroad-symbol.png" width={512} height={520} alt=""/><div><h2>{c.about.whyTitle}</h2><p>{c.about.whyBody}</p></div></div></section><section className={styles.section}><div className={styles.sectionHeading}><h2>{c.about.experienceTitle}</h2><p>{c.about.experienceBody}</p></div><div className={styles.editorialRows}>{(["One","Two","Three"] as const).map(key => <article key={key}><h3>{c.about[`principle${key}`]}</h3><p>{c.about[`principle${key}Body`]}</p></article>)}</div><p className={styles.finePrint}>{c.about.teamNote}</p></section></>;

  if (page === "security") return <><PageIntro title={c.security.title} intro={c.security.intro} locale={locale} c={c}/><section className={`${styles.section} ${styles.catalogSection}`}><div className={styles.securityGrid}>{(["one","two","three","four"] as const).map((key,index) => <article key={key}><span className={styles.index}>0{index+1}</span><h2>{c.security[`${key}Title`]}</h2><p>{c.security[`${key}Body`]}</p></article>)}</div><div className={styles.socNote}><h2>{c.security.socTitle}</h2><p>{c.security.socBody}</p></div><p className={styles.finePrint}>{c.security.boundary}</p></section><section className={styles.wash}><div className={styles.section}><div className={styles.sectionHeading}><h2>{c.security.reviewTitle}</h2><p>{c.security.reviewBody}</p></div><Link className={styles.button} href={publicPath(locale,"demo")}>{c.security.cta}</Link></div></section></>;

  if (page === "demo") return <section className={`${styles.section} ${styles.demoLayout}`}><div><h1>{c.demo.title}</h1><p className={styles.demoIntro}>{c.demo.intro}</p><div className={styles.demoAgenda}><h2>{c.demo.stepsTitle}</h2><ol>{(["stepOne","stepTwo","stepThree"] as const).map(key => <li key={key}>{c.demo[key]}</li>)}</ol></div></div><DemoContact locale={locale} copy={c.demo} audiences={c.who}/></section>;

  if (page === "privacy" || page === "legal") return <section className={`${styles.section} ${styles.legalPage}`}><h1>{c[page].title}</h1><p>{c[page].intro}</p>{(["one","two","three","four"] as const).map(key => <article key={key}><h2>{c[page][`${key}Title`]}</h2><p>{c[page][`${key}Body`]}</p></article>)}<a className={styles.textLink} href={`mailto:${brand.email}`}>{brand.email}</a></section>;

  const detail = c.pages[page];
  const parent = (solutionKeys as readonly string[]).includes(page) ? "solutions" : (audienceKeys as readonly string[]).includes(page) ? "audiences" : "cases";
  const journeys: Partial<Record<DetailPage, WorkbenchAudience>> = {companies: "companies", advisors: "advisors", investors: "investors", growth: "companies", pitch: "advisors", investment: "investors"};
  const journey = journeys[page];
  if (journey) return <><PageIntro title={detail.title} intro={detail.intro} locale={locale} c={c} parent={parent}/><section className={`${styles.section} ${styles.catalogSection}`}><div className={styles.sectionHeading}><h2>{c.common.workflow}</h2><p>{c.common.review}</p></div><PublicWorkbench locale={locale} copy={c.workbench} financials={websiteFinancialBaseline(locale)} initialAudience={journey} fixedAudience/></section><section className={`${styles.section} ${styles.related}`}><div className={styles.sectionHeading}><h2>{c.common.related}</h2></div><CaseList locale={locale} c={c} keys={relatedCases[page]}/></section></>;
  return <><PageIntro title={detail.title} intro={detail.intro} locale={locale} c={c} parent={parent}/>
    <section className={styles.questionBand}><div className={styles.section}><span className={styles.eyebrow}>{c.common.question}</span><blockquote>{detail.example}</blockquote><p>{detail.pain}</p></div></section>
    <section className={styles.section}><div className={styles.sectionHeading}><h2>{c.common.workflow}</h2><p>{c.common.review}</p></div><div className={styles.workflow}>{stepKeys.map((key,index) => <article key={key}><span className={styles.index}>0{index+1}</span><h3>{detail[`${key}Title`]}</h3><p>{detail[`${key}Body`]}</p></article>)}</div><div className={styles.deliverable}><span className={styles.eyebrow}>{c.common.deliverables}</span><p>{detail.output}</p></div><p className={styles.finePrint}>{c.common.illustrative}</p></section>
    <section className={`${styles.section} ${styles.related}`}><div className={styles.sectionHeading}><h2>{c.common.related}</h2><Link className={styles.textLink} href={publicPath(locale,"cases")}>{c.common.backCases}</Link></div><CaseList locale={locale} c={c} keys={relatedCases[page]}/></section>
  </>;
}
