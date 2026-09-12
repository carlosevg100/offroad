import Image from "next/image";
import Link from "next/link";
import {LockKeyhole, FileSpreadsheet, FileText, Presentation} from "lucide-react";
import type {AppLocale} from "@/i18n/routing";
import {publicPath} from "@/lib/website-routes";
import {websiteFinancialBaseline} from "@/lib/website-example";
import {PublicWorkbench} from "./public-workbench";
import styles from "./public-product-home.module.css";

type Copy = typeof import("../../messages/pt-BR.json")["Website"];

export function ProductHome({locale, copy}: {locale: AppLocale; copy: Copy}) {
  const c = copy.productHome;
  return <>
    <section className={styles.productSection} aria-labelledby="product-heading"><div className={styles.intro}><h2 id="product-heading">{c.title}</h2><p>{c.body}</p></div><PublicWorkbench locale={locale} copy={copy.workbench} financials={websiteFinancialBaseline(locale)}/></section>
    <section className={styles.execution}>
      <div className={styles.executionHeading}><h2>{c.executionTitle}</h2><p>{c.executionBody}</p></div>
      <div className={styles.outputLabels}><span><FileSpreadsheet size={17} aria-hidden="true"/>{c.outputOne}</span><span><FileText size={17} aria-hidden="true"/>{c.outputTwo}</span><span><Presentation size={17} aria-hidden="true"/>{c.outputThree}</span></div>
      <Image className={styles.productPhoto} src={`/website/product-${locale === "pt-BR" ? "pt" : "en"}.png`} width={1672} height={941} sizes="(max-width: 800px) 100vw, 1280px" alt={copy.intro.alt}/>
      <Link className={styles.simpleLink} href={publicPath(locale,"execution")}>{copy.common.learn}</Link>
    </section>
    <section className={styles.benefits}><h2>{c.benefitTitle}</h2><div>{(["One","Two","Three"] as const).map((key,index) => <article key={key}><span className={styles.number}>0{index+1}</span><h3>{c[`benefit${key}`]}</h3><p>{c[`benefit${key}Body`]}</p></article>)}</div></section>
    <section className={styles.capital}>
      <div><h2>{c.connectionTitle}</h2><p>{c.connectionBody}</p><Link className={styles.simpleLink} href={publicPath(locale,"intelligence")}>{copy.common.learn}</Link></div>
      <div className={styles.criteria}><div className={styles.criteriaHeading}><Image src="/brand/offroad-symbol.png" width={512} height={520} alt=""/><span>{c.criteria}</span></div><div className={styles.criteriaGrid}>{(["instrument","ticket","tenor","collateral","sector","restrictions"] as const).map(key => <span key={key}>{c[key]}</span>)}</div><p>{c.connectionNote}</p></div>
    </section>
    <section className={styles.institutional}><div><h2>{c.teamTitle}</h2><p>{c.teamBody}</p><Link className={styles.simpleLink} href={publicPath(locale,"about")}>{c.teamLink}</Link></div><div><LockKeyhole size={25} strokeWidth={1.25} aria-hidden="true"/><h3>{c.securityTitle}</h3><p>{c.securityBody}</p><Link className={styles.simpleLink} href={publicPath(locale,"security")}>{c.securityLink}</Link></div></section>
  </>;
}
