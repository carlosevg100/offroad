export type LiveProduct = {
  job: string; status: string; fingerprint: string; inputFingerprint: string;
  sections: Array<{key: string; observations: Array<{text: string; citations: Array<{passageId: string; quote: string}>}>}>;
  hypotheses: Array<{text: string; question: string}>; gaps: Array<{text: string; question: string}>;
};
export function assertDocumentWorkLiveEnvironment(env: Record<string, string | undefined>) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "carlosevg100/offroad"
    || env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_EVENT_NAME !== "workflow_dispatch"
    || env.GITHUB_WORKFLOW_REF !== "carlosevg100/offroad/.github/workflows/document-work-product-live.yml@refs/heads/main"
    || !/^[a-f0-9]{40}$/i.test(env.GITHUB_SHA ?? "")) throw new Error("document_work_live_requires_protected_main_workflow");
}
export function scoreDocumentWorkLive(product: LiveProduct, sample: {job: string; expected: readonly string[]; passages: readonly {id: string; text: string}[]}) {
  const observations = product.sections.flatMap(section => section.observations);
  const quotes = observations.flatMap(observation => observation.citations);
  const text = quotes.map(quote => quote.quote).join("\n").toLowerCase();
  const expectedCoverage = sample.expected.map(term => ({term, covered: text.includes(term.toLowerCase())}));
  const supported = observations.every(observation => observation.citations.some(citation => citation.quote.includes(observation.text)))
    && quotes.every(citation => sample.passages.some(passage => passage.id === citation.passageId && passage.text.includes(citation.quote)));
  const sourceCoverage = sample.passages.every(source => quotes.some(quote => quote.passageId === source.id));
  const substantive = observations.length >= 2 && product.hypotheses.length + product.gaps.length > 0;
  return {passed: product.job === sample.job && product.status === "preliminary" && supported && sourceCoverage && substantive && expectedCoverage.every(item => item.covered), supported, sourceCoverage, substantive, expectedCoverage};
}
export function compareDocumentWorkRepeats(first: LiveProduct, second: LiveProduct, sample: Parameters<typeof scoreDocumentWorkLive>[1]) {
  const a = scoreDocumentWorkLive(first,sample), b = scoreDocumentWorkLive(second,sample);
  return {passed: a.passed && b.passed && first.inputFingerprint === second.inputFingerprint,
    sameInput: first.inputFingerprint === second.inputFingerprint, sameFullOutput: first.fingerprint === second.fingerprint,
    expectedFactCoverageStable: JSON.stringify(a.expectedCoverage) === JSON.stringify(b.expectedCoverage)};
}
