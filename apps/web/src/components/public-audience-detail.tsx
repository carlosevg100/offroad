import styles from "./public-narrative.module.css";

type Copy = typeof import("../../messages/pt-BR.json")["Website"]["audienceDetail"];
export function PublicAudienceDetail({audience, copy: c}: {audience: "companies" | "advisors" | "investors"; copy: Copy}) {
  const a = c[audience];
  return <section className={`${styles.section} ${styles.audienceDetail}`}>
    <span className={styles.label}>{c.rolesLabel}</span><p className={styles.detailRoles}>{a.roles}</p>
    <span className={styles.label}>{c.label}</span>
    {(["one", "two", "three"] as const).map((key, i) => <article className={styles.application} key={key}><div><span className={styles.index}>0{i + 1}</span><h2>{a[`${key}Title`]}</h2></div><dl><dt>{c.workLabel}</dt><dd>{a[`${key}Work`]}</dd><dt>{c.valueLabel}</dt><dd>{a[`${key}Value`]}</dd></dl></article>)}
    <div className={styles.seniority}><h2>{c.seniorityTitle}</h2><div><article><h3>{a.juniorTitle}</h3><p>{a.juniorBody}</p></article><article><h3>{a.seniorTitle}</h3><p>{a.seniorBody}</p></article></div><p>{a.guidance}</p></div>
    <div className={styles.perspective}><h2>{c.perspectiveTitle}</h2><p>{a.perspective}</p></div>
  </section>;
}
