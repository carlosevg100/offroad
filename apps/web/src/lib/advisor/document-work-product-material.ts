import {materialToDocx} from "@offroad/case-export";
import type {Material, MaterialBlock} from "@offroad/case-materials";
import {documentWorkProductSchema, type DocumentWorkProduct} from "@offroad/domain-contracts";

export type DocumentWorkProductLabels = Record<"comparisonTitle" | "meetingTitle" | "reviewTitle" | "preliminary" | "insufficientEvidence" | "scope" | "scopeBody" | "hypotheses" | "gaps" | "question" | "evidence" | "sources" | "coverage" | "documents" | "omitted" | "download" | "version", string>;
const localized = (value: string) => ({pt: value, en: value});

/** Pure projection of an already authorized persisted result. It performs no analysis or translation. */
export function documentWorkProductMaterial(product: DocumentWorkProduct, labels: DocumentWorkProductLabels): Material {
  const value = documentWorkProductSchema.parse(product);
  const heading = (text: string): MaterialBlock => ({type: "heading", text: localized(text)});
  const paragraph = (text: string, supportIds?: string[]): MaterialBlock => ({type: "paragraph", text: localized(text), ...(supportIds ? {supportIds} : {})});
  const sourceLabel = (id: string) => {
    const source = value.sources.find(item => item.id === id);
    if (!source) throw new Error("Missing document source");
    return `${source.documentName} · ${source.anchor}`;
  };
  const blocks: MaterialBlock[] = [paragraph(value.status === "insufficient_evidence" ? labels.insufficientEvidence : labels.preliminary), heading(labels.scope), paragraph(labels.scopeBody),
    ...value.sections.flatMap(section => [heading(section.title), ...section.observations.flatMap(observation => [
      paragraph(observation.text, observation.citations.map(citation => sourceLabel(citation.passageId))),
      ...observation.citations.filter(citation => citation.quote !== observation.text).map(citation => paragraph(`“${citation.quote}”`, [sourceLabel(citation.passageId)])),
    ])]),
    heading(labels.hypotheses), ...value.hypotheses.flatMap(hypothesis => [paragraph(hypothesis.text, hypothesis.basisPassageIds.map(sourceLabel)), paragraph(`${labels.question}: ${hypothesis.question}`)]),
    heading(labels.gaps), ...value.gaps.flatMap(gap => [paragraph(gap.text), paragraph(`${labels.question}: ${gap.question}`)]),
    heading(labels.coverage), paragraph(`${labels.documents}: ${value.coverage.documentsConsidered}`), paragraph(`${labels.omitted}: ${value.coverage.omittedPassages}`),
    ...value.coverage.limitations.map(item => paragraph(item)), heading(labels.sources),
    ...value.sources.flatMap(source => [paragraph(`${source.documentName} · ${labels.version} ${source.version} · ${source.anchor}`), paragraph(`SHA-256: ${source.hash}`), paragraph(source.text)]),
  ];
  return {kind: "credit_memo", title: localized(labels[`${value.job}Title`]), blocks, dependsOn: [value.fingerprint]};
}

export function documentWorkProductToDocx(input: {product: DocumentWorkProduct; labels: DocumentWorkProductLabels; issuedOn: string}): Uint8Array {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issuedOn)) throw new Error("Invalid document issue date");
  return materialToDocx({material: documentWorkProductMaterial(input.product, input.labels), lang: input.product.locale === "pt-BR" ? "pt" : "en", meta: {issuedOn: input.issuedOn}});
}
