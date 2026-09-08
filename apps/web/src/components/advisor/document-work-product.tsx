import type {DocumentWorkProduct as WorkProduct} from "@offroad/domain-contracts";
import type {DocumentWorkProductLabels} from "@/lib/advisor/document-work-product-material";
import styles from "./document-work-product.module.css";

export function DocumentWorkProduct({product, labels, downloadHref}: {product: WorkProduct; labels: DocumentWorkProductLabels; downloadHref?: string}) {
  const sourceLabel = (id: string) => {
    const source = product.sources.find(item => item.id === id);
    return source ? `${source.documentName} · ${source.anchor}` : labels.sources;
  };
  return <article className={styles.product}>
    <header className={styles.header}><div><p className={styles.eyebrow}>{product.status === "insufficient_evidence" ? labels.insufficientEvidence : labels.preliminary}</p><h2>{labels[`${product.job}Title`]}</h2></div>{downloadHref && <a className={styles.download} href={downloadHref}>{labels.download}</a>}</header>
    <p className={styles.scope}>{labels.scopeBody}</p>
    {product.sections.map(section => <section key={section.key} className={styles.section}><h3>{section.title}</h3>{section.observations.map((observation, index) => <div key={index} className={styles.observation}><p>{observation.text}</p><details><summary>{labels.evidence}</summary>{observation.citations.map((citation, citationIndex) => <blockquote key={citationIndex}><p>{citation.quote}</p><cite>{sourceLabel(citation.passageId)}</cite></blockquote>)}</details></div>)}</section>)}
    {product.hypotheses.length > 0 && <section className={styles.section}><h3>{labels.hypotheses}</h3>{product.hypotheses.map((hypothesis, index) => <div key={index} className={styles.observation}><p>{hypothesis.text}</p><small>{hypothesis.basisPassageIds.map(sourceLabel).join("; ")}</small><p><strong>{labels.question}: </strong>{hypothesis.question}</p></div>)}</section>}
    {product.gaps.length > 0 && <section className={styles.section}><h3>{labels.gaps}</h3>{product.gaps.map((gap, index) => <div key={index} className={styles.observation}><p>{gap.text}</p><p><strong>{labels.question}: </strong>{gap.question}</p></div>)}</section>}
    <footer className={styles.footer}><details><summary>{labels.coverage}</summary><p>{labels.documents}: {product.coverage.documentsConsidered} · {labels.omitted}: {product.coverage.omittedPassages}</p>{product.coverage.limitations.map((limitation, index) => <p key={index}>{limitation}</p>)}</details><details><summary>{labels.sources}</summary>{product.sources.map(source => <section key={source.id}><h4>{source.documentName}</h4><p>{labels.version} {source.version} · {source.anchor}</p><small>SHA-256: {source.hash}</small><blockquote>{source.text}</blockquote></section>)}</details></footer>
  </article>;
}
