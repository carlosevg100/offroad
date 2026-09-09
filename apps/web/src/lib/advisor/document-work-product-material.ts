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
  // References address passages, not counterparties. Distinct files never imply distinct lenders.
  const references = new Map(value.sources.map((source, index) => [source.id, String(index + 1)]));
  const sourceLabel = (id: string) => {
    const reference = references.get(id);
    if (!reference) throw new Error("Missing document source");
    return reference;
  };
  const sourceGroups = new Map<string, typeof value.sources>();
  for (const source of value.sources) {
    // Keep identity, name, version and hash together; never conflate similarly named documents.
    const key = JSON.stringify([source.documentId, source.documentName, source.version, source.hash]);
    const group = sourceGroups.get(key) ?? [];
    group.push(source);
    sourceGroups.set(key, group);
  }
  const questions = (items: Array<{text: string; question: string; basisPassageIds?: string[]}>): MaterialBlock[] => items.length ? [{
    type: "table", caption: localized(""), head: [localized(labels.hypotheses), localized(labels.question)],
    rows: items.map(item => [item.text + (item.basisPassageIds?.length ? ` [${item.basisPassageIds.map(sourceLabel).join(", ")}]` : ""), item.question]),
  }] : [];
  const blocks: MaterialBlock[] = [paragraph(value.status === "insufficient_evidence" ? labels.insufficientEvidence : labels.preliminary), heading(labels.scope), paragraph(labels.scopeBody),
    ...value.sections.filter(section => section.observations.length > 0).flatMap(section => [heading(section.title), ...section.observations.flatMap(observation => [
      paragraph(observation.text, observation.citations.map(citation => sourceLabel(citation.passageId))),
      ...observation.citations.filter(citation => citation.quote !== observation.text).map(citation => paragraph(`“${citation.quote}”`, [sourceLabel(citation.passageId)])),
    ])]),
    ...(value.hypotheses.length ? [heading(labels.hypotheses), ...questions(value.hypotheses)] : []),
    ...(value.gaps.length ? [heading(labels.gaps), {type: "table" as const, caption: localized(""), head: [localized(labels.gaps), localized(labels.question)], rows: value.gaps.map(gap => [gap.text, gap.question])}] : []),
    heading(labels.coverage), paragraph(`${labels.documents}: ${value.coverage.documentsConsidered}`), paragraph(`${labels.omitted}: ${value.coverage.omittedPassages}`),
    ...value.coverage.limitations.map(item => paragraph(item)), heading(labels.sources),
    ...Array.from(sourceGroups.values()).flatMap(group => [
      {type: "table" as const, caption: localized(`${group[0].documentName} · ${labels.version} ${group[0].version}`),
        head: [localized(labels.sources), localized(labels.evidence)],
        rows: group.map(source => [`[${sourceLabel(source.id)}] ${source.anchor}`, source.text])},
      {type: "disclaimer" as const, text: localized(`SHA-256: ${group[0].hash}`)},
    ]),
  ];
  return {kind: "credit_memo", title: localized(labels[`${value.job}Title`]), blocks, dependsOn: [value.fingerprint]};
}

export function documentWorkProductToDocx(input: {product: DocumentWorkProduct; labels: DocumentWorkProductLabels; issuedOn: string}): Uint8Array {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issuedOn)) throw new Error("Invalid document issue date");
  return materialToDocx({material: documentWorkProductMaterial(input.product, input.labels), lang: input.product.locale === "pt-BR" ? "pt" : "en", meta: {issuedOn: input.issuedOn}});
}
