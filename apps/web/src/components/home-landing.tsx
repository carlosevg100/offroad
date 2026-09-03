import {
  ArrowRight,
  ArrowUp,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  Landmark,
  Paperclip,
  Plus,
} from "lucide-react";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import type {AppLocale} from "@/i18n/routing";

import {BrandMark} from "./brand-mark";
import {HomeLandingMotion} from "./home-landing-motion";
import styles from "./home-landing.module.css";

type HomeLandingProps = {
  locale: AppLocale;
};

const audienceKeys = ["companies", "cfos", "banks", "advisors", "dcm", "investors", "lenders"] as const;

export async function HomeLanding({locale}: HomeLandingProps) {
  const t = await getTranslations({locale, namespace: "HomeV2"});
  const signupHref = `/${locale}/signup`;
  const prompts = [t("prompt1"), t("prompt2"), t("prompt3"), t("prompt4")];
  const workInsights = [
    [t("workInsight1Label"), t("workInsight1Title")],
    [t("workInsight2Label"), t("workInsight2Title")],
    [t("workInsight3Label"), t("workInsight3Title")],
    [t("workInsight4Label"), t("workInsight4Title")],
  ];

  return (
    <>
      <main id="main-content" className={styles.page}>
        <section className={styles.hero} data-oc-hero aria-labelledby="home-title">
          <div className={styles.heroMesh} aria-hidden="true" />
          <div className={styles.grain} aria-hidden="true" />

          <div className={styles.heroLayout}>
            <div className={styles.heroCopy}>
              <p className={styles.kicker}>{t("category")}</p>
              <h1 id="home-title">
                <span>{t("heroTitleLine1")}</span>{" "}
                <span>{t("heroTitleLine2")}</span>
              </h1>
              <p className={styles.heroIntro}>{t("heroIntro")}</p>
              <p className={styles.heroBody}>{t("heroBody")}</p>
              <p className={styles.heroNote}>{t("heroNote")}</p>
              <div className={styles.heroActions}>
                <Link className={styles.primaryButton} href={signupHref}>
                  {t("primaryCta")}
                </Link>
                <a className={styles.textLink} href="#produto">
                  {t("secondaryCta")} <ArrowRight aria-hidden="true" size={15} />
                </a>
              </div>
            </div>

            <aside className={styles.heroProduct} aria-label={t("heroProductAria")}>
              <header className={styles.workspaceBar}>
                <WindowDots inline />
                <strong>{t("heroWorkspaceTitle")}</strong>
                <span>{t("illustrative")}</span>
              </header>
              <div className={styles.workspaceRequest}>
                <span>{t("capitalQuestionLabel")}</span>
                <p>{t("capitalQuestion")}</p>
              </div>
              <section className={styles.workspaceSection}>
                <header><div><span>{t("capitalCardLabel")}</span><strong>{t("capitalCardTitle")}</strong></div><b>{t("capitalPathCount")}</b></header>
                <div className={styles.capitalPaths}>
                  <CapitalPath number="01" title={t("capitalPath1")} detail={t("capitalPath1Detail")} state={t("capitalPathStrong")} />
                  <CapitalPath number="02" title={t("capitalPath2")} detail={t("capitalPath2Detail")} state={t("capitalPathReview")} />
                  <CapitalPath number="03" title={t("capitalPath3")} detail={t("capitalPath3Detail")} state={t("capitalPathConditional")} />
                </div>
              </section>
              <section className={`${styles.workspaceSection} ${styles.workspaceMatch}`}>
                <header><div><span>{t("fitCardLabel")}</span><strong>{t("fitCardTitle")}</strong></div><b>{t("matchUpdated")}</b></header>
                <CapitalMatchRow
                  initials="FA"
                  name={t("matchProvider1")}
                  structure={t("matchStructure1")}
                  detail={t("matchDetail1")}
                  fit={t("matchFitHigh")}
                  reason={t("matchReason1")}
                  expanded
                />
                <CapitalMatchRow initials="BB" name={t("matchProvider2")} structure={t("matchStructure2")} detail={t("matchDetail2")} fit={t("matchFitRelevant")} />
              </section>
              <div className={styles.heroComposer} aria-label={t("composerAria")}>
                <div className={styles.composer}>
                  <i className={styles.composerPlus}><Plus aria-hidden="true" size={15} /></i>
                  <span className={styles.composerPrompt} data-oc-prompt data-prompts={JSON.stringify(prompts)}>{prompts[0]}</span>
                  <i className={styles.composerSend}><ArrowUp aria-hidden="true" size={14} /></i>
                </div>
              </div>
            </aside>

            <div className={styles.heroJourney} aria-label={t("heroJourneyAria")}>
              <JourneyStep number="01" from={t("journey1From")} to={t("journey1To")} />
              <JourneyStep number="02" from={t("journey2From")} to={t("journey2To")} />
              <JourneyStep number="03" from={t("journey3From")} to={t("journey3To")} />
            </div>
          </div>
        </section>

        <div className={styles.audienceLine} aria-label={t("audienceAria")}>
          <div className={styles.audienceTrack}>
            {[...audienceKeys, ...audienceKeys].map((key, index) => <span key={`${key}-${index}`}>{t(`audience${key}`)}</span>)}
          </div>
        </div>

        <section className={`${styles.section} ${styles.marketLayerSection}`} id="produto" aria-labelledby="platform-title">
          <div className={styles.shell}>
            <header className={styles.centerHeading} data-oc-reveal>
              <p className={styles.kicker}>{t("platformKicker")}</p>
              <h2 id="platform-title" className={styles.sectionTitle}>{t("platformTitle")}</h2>
              <p className={styles.sectionIntro}>{t("platformBody")}</p>
            </header>
            <MarketWorkLayer t={t} />
          </div>
        </section>

        <section className={`${styles.section} ${styles.workSection}`} aria-labelledby="work-title">
          <div className={styles.shell}>
            <header className={styles.splitHeading} data-oc-reveal>
              <div><p className={styles.kicker}>{t("workKicker")}</p><h2 id="work-title" className={styles.sectionTitle}>{t("workTitle")}</h2></div>
              <p className={styles.sectionIntro}>{t("workBody")}</p>
            </header>
            <div className={styles.workbench} data-oc-reveal>
              <div className={styles.workbenchScreen}>
                <div className={styles.screenToolbar}><WindowDots inline /><strong>Offroad Capital</strong><span>{t("illustrative")}</span></div>
                <div className={styles.screenLayout}>
                  <aside className={styles.screenSidebar}>
                    <div className={styles.sidebarLogo}><i>O</i>{t("workspace")}</div>
                    <span className={styles.sidebarLabel}>{t("projects")}</span>
                    {[t("projectListedCompany"), t("projectX"), t("projectExpansion"), t("projectTermSheet")].map((item, index) => <div className={`${styles.sidebarItem} ${index === 0 ? styles.active : ""}`} key={item}><i />{item}</div>)}
                  </aside>
                  <section className={styles.screenChat}>
                    <div className={styles.chatTitle}><span>{t("project")}</span><strong>{t("projectTitle")}</strong></div>
                    <div className={styles.chatUser}>{t("userMessage")}</div>
                    <div className={styles.chatAnswer}><strong>Offroad</strong>{t("assistantMessage")}</div>
                    <div className={styles.liveRow}>
                      {[t("live1"), t("live2"), t("live3"), t("live4")].map((item, index) => <span className={index === 0 ? styles.active : ""} data-oc-live={index} key={item}>{item}</span>)}
                    </div>
                    <article className={styles.insight} data-oc-insight data-insights={JSON.stringify(workInsights)}>
                      <span>{workInsights[0][0]}</span><h4>{workInsights[0][1]}</h4><p>{t("insightBody")}</p>
                    </article>
                    <div className={styles.screenComposer}><Paperclip aria-hidden="true" size={13} /><span>{t("workspaceComposer")}</span><b><ArrowUp aria-hidden="true" size={12} /></b></div>
                  </section>
                  <aside className={styles.screenRail}>
                    <h4>{t("workResults")}</h4>
                    {[
                      [t("task1"), t("task1Meta")],
                      [t("task2"), t("task2Meta")],
                      [t("task3"), t("task3Meta")],
                      [t("task4"), t("task4Meta")],
                    ].map(([title, meta], index) => <div className={`${styles.task} ${index === 0 ? styles.active : ""}`} data-oc-task={index} key={title}><i>{index + 1}</i><div><strong>{title}</strong><span>{meta}</span></div></div>)}
                    <div className={styles.railSep} />
                    <h4>{t("artifacts")}</h4>
                    <Artifact extension="MD" title={t("artifactAnalysis")} meta={t("updating")} />
                    <Artifact extension="XLS" title={t("artifactModel")} meta={t("scenarios")} />
                    <Artifact extension="PPT" title={t("artifactPitch")} meta={t("awaitingDirection")} />
                  </aside>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.audienceSection}`} id="para-quem" aria-labelledby="audiences-title">
          <div className={styles.shell}>
            <header className={styles.centerHeading} data-oc-reveal><p className={styles.kicker}>{t("audienceKicker")}</p><h2 id="audiences-title" className={styles.sectionTitle}>{t("audienceTitle")}</h2></header>

            <AudienceBlock
              kicker={t("companiesKicker")}
              title={t("companiesTitle")}
              body={t("companiesBody")}
              action={t("companiesAction")}
              href={signupHref}
              art={<CompanyPanel t={t} />}
            />
            <AudienceBlock
              reverse
              kicker={t("professionalsKicker")}
              title={t("professionalsTitle")}
              body={t("professionalsBody")}
              action={t("professionalsAction")}
              href={signupHref}
              tone="sand"
              art={<ProfessionalPanel t={t} />}
            />
            <AudienceBlock
              kicker={t("investorsKicker")}
              title={t("investorsTitle")}
              body={t("investorsBody")}
              action={t("investorsAction")}
              href={signupHref}
              tone="blue"
              art={<InvestorPanel t={t} />}
            />
          </div>
        </section>

        <section className={`${styles.section} ${styles.intelligence}`} id="inteligencia" aria-labelledby="intelligence-title">
          <div className={styles.shell}>
            <header className={styles.centerHeading} data-oc-reveal><p className={styles.kicker}>{t("intelligenceKicker")}</p><h2 id="intelligence-title" className={styles.sectionTitle}>{t("intelligenceTitle")}</h2><p className={styles.sectionIntro}>{t("intelligenceBody")}</p></header>
            <div className={styles.intelligenceGrid}>
              <article className={styles.memoryCard} data-oc-reveal>
                <p className={styles.kicker}>{t("memoryKicker")}</p><h3>{t("memoryTitle")}</h3><p>{t("memoryBody")}</p>
                <div className={styles.memoryOrbit} aria-hidden="true"><i /><i /><i /><div>{t("memoryCore")}</div><b>{t("memoryPublic")}</b><b>{t("memoryDecisions")}</b><b>{t("memoryPrivate")}</b></div>
              </article>
              <article className={styles.marketCard} data-oc-reveal>
                <p className={styles.kicker}>{t("marketKicker")}</p><h3>{t("marketTitle")}</h3><p>{t("marketBody")}</p>
                <div className={styles.marketList}><div><strong>{t("marketGeo")}</strong><span>{t("marketContinuous")}</span></div><div><strong>{t("marketDeals")}</strong><span>{t("marketSources")}</span></div><div><strong>{t("marketProviders")}</strong><span>{t("marketFit")}</span></div></div>
              </article>
            </div>
          </div>
        </section>

        <section className={styles.trust} id="confianca" aria-labelledby="trust-title">
          <div className={styles.shell}>
            <div className={styles.trustRow} data-oc-reveal>
              <div className={styles.trustLead}><p className={styles.kicker}>{t("trustKicker")}</p><h2 id="trust-title">{t("trustTitle")}</h2></div>
              <TrustItem number="01" title={t("trustSources")} body={t("trustSourcesBody")} />
              <TrustItem number="02" title={t("trustMath")} body={t("trustMathBody")} />
              <TrustItem number="03" title={t("trustPrivate")} body={t("trustPrivateBody")} />
              <TrustItem number="04" title={t("trustControl")} body={t("trustControlBody")} />
            </div>
          </div>
        </section>

        <section className={styles.closing} id="comece" aria-labelledby="closing-title">
          <div className={styles.shell}><p className={styles.kicker}>Go Offroad</p><h2 id="closing-title">{t("closingTitle")}</h2><p>{t("closingBody")}</p><Link className={styles.closingButton} href={signupHref}>{t("primaryCta")} <ArrowRight aria-hidden="true" size={15} /></Link><small>{t("closingNote")}</small></div>
        </section>
      </main>

      <footer className={styles.footer}><div className={styles.shell}><BrandMark inverted locale={locale} /><span>{t("footerLine")}</span></div></footer>
      <HomeLandingMotion />
    </>
  );
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function CapitalPath({detail, number, state, title}: {detail: string; number: string; state: string; title: string}) {
  return (
    <div className={styles.capitalPath}>
      <i>{number}</i>
      <div><strong>{title}</strong><span>{detail}</span></div>
      <b>{state}</b>
    </div>
  );
}

function CapitalMatchRow({detail, expanded = false, fit, initials, name, reason, structure}: {detail: string; expanded?: boolean; fit: string; initials: string; name: string; reason?: string; structure: string}) {
  return (
    <div className={`${styles.capitalMatchRow} ${expanded ? styles.expanded : ""}`}>
      <div className={styles.matchSummary}>
        <ChevronDown aria-hidden="true" size={13} />
        <i>{initials}</i>
        <div><strong>{name}<span>/</span>{structure}</strong><small>{detail}</small></div>
        <b>{fit}</b>
      </div>
      {reason ? <div className={styles.matchReason}><Check aria-hidden="true" size={12} /><p><strong>{reason}</strong><span>{detail}</span></p></div> : null}
    </div>
  );
}

function JourneyStep({from, number, to}: {from: string; number: string; to: string}) {
  return (
    <div className={styles.journeyStep}>
      <i>{number}</i>
      <p><strong>{from}</strong><span>{to}</span></p>
      <ArrowRight aria-hidden="true" size={15} />
    </div>
  );
}

function MarketWorkLayer({t}: {t: Translator}) {
  const profiles = [
    {
      icon: <Building2 aria-hidden="true" size={18} />,
      name: t("flowCompanyName"),
      input: t("flowCompanyInput"),
      outcomeTitle: t("flowCompanyOutcomeTitle"),
      outcomeBody: t("flowCompanyOutcomeBody"),
    },
    {
      icon: <BriefcaseBusiness aria-hidden="true" size={18} />,
      name: t("flowProfessionalName"),
      input: t("flowProfessionalInput"),
      outcomeTitle: t("flowProfessionalOutcomeTitle"),
      outcomeBody: t("flowProfessionalOutcomeBody"),
    },
    {
      icon: <Landmark aria-hidden="true" size={18} />,
      name: t("flowCapitalName"),
      input: t("flowCapitalInput"),
      outcomeTitle: t("flowCapitalOutcomeTitle"),
      outcomeBody: t("flowCapitalOutcomeBody"),
    },
  ];

  return (
    <figure className={styles.marketFlow} data-oc-reveal aria-label={t("flowAria")}>
      <div className={styles.flowColumnHead} aria-hidden="true">
        <span>{t("flowInputLabel")}</span><span>{t("flowCoreLabel")}</span><span>{t("flowOutcomeLabel")}</span>
      </div>

      <article className={styles.flowCore}>
        <div className={styles.coreMark}><span>O</span><i /></div>
        <p>{t("flowCoreKicker")}</p>
        <h3>{t("flowCoreTitle")}</h3>
        <div className={styles.coreCapabilities}>
          {["flowCapability1", "flowCapability2", "flowCapability3", "flowCapability4", "flowCapability5", "flowCapability6"].map((key, index) => (
            <span key={key}><i>{String(index + 1).padStart(2, "0")}</i>{t(key)}</span>
          ))}
        </div>
      </article>

      {profiles.map((profile, index) => (
        <div className={styles.flowLane} data-profile={index} key={profile.name}>
          <article className={styles.flowEntry}>
            <div className={styles.flowProfileIcon}>{profile.icon}</div>
            <div><strong>{profile.name}</strong><p>{profile.input}</p></div>
          </article>
          <div className={styles.flowConnector} aria-hidden="true"><i /></div>
          <article className={styles.flowOutcome}>
            <span>{t("flowOutcomeEyebrow")}</span>
            <h3>{profile.outcomeTitle}</h3>
            <p>{profile.outcomeBody}</p>
          </article>
        </div>
      ))}
    </figure>
  );
}

function WindowDots({inline = false}: {inline?: boolean}) {
  return <div className={inline ? styles.inlineDots : styles.windowDots} aria-hidden="true"><i /><i /><i /></div>;
}

function FitRow({detail, name, score}: {detail: string; name: string; score: string}) {
  return <div className={styles.fitRow}><div><strong>{name}</strong><span>{detail}</span></div><b>{score}</b></div>;
}

function Artifact({extension, meta, title}: {extension: string; meta: string; title: string}) {
  return <div className={styles.artifact}><i>{extension}</i><div><strong>{title}</strong><span>{meta}</span></div></div>;
}

function AudienceBlock({action, art, body, href, kicker, reverse = false, title, tone = "sage"}: {action: string; art: React.ReactNode; body: string; href: string; kicker: string; reverse?: boolean; title: string; tone?: "blue" | "sage" | "sand"}) {
  return <article className={`${styles.audienceBlock} ${reverse ? styles.reverse : ""}`} data-oc-reveal><div className={styles.audienceCopy}><p className={styles.kicker}>{kicker}</p><h3>{title}</h3><p>{body}</p><Link href={href}>{action} <ArrowRight aria-hidden="true" size={14} /></Link></div><div className={`${styles.audienceArt} ${styles[tone]}`}>{art}</div></article>;
}

function CompanyPanel({t}: {t: Translator}) {
  return <div className={styles.artPanel}><div className={styles.artHead}><strong>{t("companyPanelTitle")}</strong><span>{t("projectX")}</span></div><div className={styles.artBody}><span>{t("documentsReceived")}</span><h4>{t("companyPanelHeading")}</h4><DocumentRow extension="XLS" title={t("balanceSheet")} meta={t("reconciled")} state="ok" /><DocumentRow extension="PDF" title={t("expansionPlan")} meta={t("processed")} state="ok" /><DocumentRow extension="XLS" title={t("debtSchedule")} meta={t("reviewRequired")} state="review" /></div></div>;
}

function ProfessionalPanel({t}: {t: Translator}) {
  return <div className={styles.artPanel}><div className={styles.artHead}><strong>{t("professionalPanelTitle")}</strong><span>{t("listedCompany")}</span></div><div className={styles.artBody}><span>{t("capitalStructure")}</span><h4>{t("professionalPanelHeading")}</h4><div className={styles.strategyGrid}><div><span>{t("refinance")}</span><strong>{t("extendMaturities")}</strong></div><div className={styles.selected}><span>{t("structure")}</span><strong>{t("optimizeCostTenor")}</strong></div><div><span>{t("liquidity")}</span><strong>{t("reinforceFlexibility")}</strong></div></div><DocumentRow extension="PPT" title={t("strategicPitch")} meta={t("narrativeAlternatives")} state="ok" /><DocumentRow extension="XLS" title={t("scenarioModel")} meta={t("reviewable")} state="ok" /></div></div>;
}

function InvestorPanel({t}: {t: Translator}) {
  return <div className={styles.artPanel}><div className={styles.artHead}><strong>{t("investorPanelTitle")}</strong><span>{t("institutionalMandate")}</span></div><div className={styles.artBody}><span>{t("qualifiedDealFlow")}</span><h4>{t("investorPanelHeading")}</h4><FitRow name="Projeto XXX / Senior secured" detail={t("fitTicketSectorCollateral")} score={t("fitHigh")} /><FitRow name="Projeto YYY / Asset-backed" detail={t("fitTenorReturnStructure")} score={t("fitHigh")} /><FitRow name="Projeto ZZZ / Bridge" detail={t("outsideTenorPolicy")} score={t("fitLow")} /></div></div>;
}

function DocumentRow({extension, meta, state, title}: {extension: string; meta: string; state: "ok" | "review"; title: string}) {
  return <div className={styles.documentRow}><i>{extension}</i><div><strong>{title}</strong><span>{meta}</span></div><b>{state === "ok" ? <Check aria-hidden="true" size={12} /> : "!"}</b></div>;
}

function TrustItem({body, number, title}: {body: string; number: string; title: string}) {
  return <article className={styles.trustItem}><b>{number}</b><strong>{title}</strong><p>{body}</p></article>;
}
