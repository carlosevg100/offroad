export type LiveProduct = {
  job: string; status: string; fingerprint: string; inputFingerprint: string;
  sections: Array<{key: string; observations: Array<{text: string; citations: Array<{passageId: string; quote: string}>}>}>;
  hypotheses: Array<{text: string; question: string}>; gaps: Array<{text: string; question: string}>;
};
export function assertDocumentWorkLiveEnvironment(env: Record<string, string | undefined>) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "carlosevg100/offroad"
    || env.GITHUB_RUN_ATTEMPT !== "1"
    || env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_EVENT_NAME !== "workflow_dispatch"
    || env.GITHUB_WORKFLOW_REF !== "carlosevg100/offroad/.github/workflows/document-work-product-live.yml@refs/heads/main"
    || !/^[a-f0-9]{40}$/i.test(env.GITHUB_SHA ?? "")) throw new Error("document_work_live_requires_protected_main_workflow");
}
type SemanticAssertion = {id:string;rationale:string;sourceId:string;sourceQuote:string;forbiddenClaims:readonly {id:string;pattern:string}[]};
type LiveSample = {job:string;expected:readonly string[];passages:readonly {id:string;text:string}[];semanticAssertions?:readonly SemanticAssertion[]};
/** Authored reference-case checks, not a general claim of semantic verification. */
export function scoreDocumentWorkSemantics(product: LiveProduct, sample: LiveSample) {
  const failures: Array<{assertionId:string;ruleId:string;field:string;matchedText:string}> = [];
  for (const assertion of sample.semanticAssertions ?? []) {
    if (!sample.passages.some(passage => passage.id === assertion.sourceId && passage.text.includes(assertion.sourceQuote))) {
      failures.push({assertionId:assertion.id,ruleId:"reference-source-mismatch",field:"reference",matchedText:""});
      continue;
    }
    const fields = [...product.hypotheses.flatMap((item,index) => [{field:`hypotheses.${index}.text`,text:item.text,pairedText:null},{field:`hypotheses.${index}.question`,text:item.question,pairedText:item.text}]),
      ...product.gaps.flatMap((item,index) => [{field:`gaps.${index}.text`,text:item.text,pairedText:null},{field:`gaps.${index}.question`,text:item.question,pairedText:item.text}])];
    for (const {field,text,pairedText} of fields) for (const rule of assertion.forbiddenClaims) {
      const pattern = new RegExp(rule.pattern,"gi");
      for (const match of text.matchAll(pattern)) {
        const sentenceStart = Math.max(text.lastIndexOf(".",match.index),text.lastIndexOf("?",match.index),text.lastIndexOf("!",match.index)) + 1;
        const sentenceEnd = text.slice(match.index).search(/[.!?]/);
        const clause = text.slice(sentenceStart,sentenceEnd < 0 ? undefined : match.index + sentenceEnd);
        const conditionalEnd = clause.indexOf(",");
        // A stated hypothesis antecedent is not an assertion that its condition already holds.
        if (/^\s*if\b/i.test(clause) && conditionalEnd >= 0 && match.index - sentenceStart < conditionalEnd) continue;
        if (/\bif\s+(?:the\s+)?$/i.test(text.slice(sentenceStart,match.index))) continue;
        // Documentary absence explicitly scoped to supplied information preserves the source meaning.
        const afterClaim = text.slice(match.index + match[0].length);
        if (rule.id === "asserted-absence" && /^(?: and (?:a |an )?(?:leverage covenant|amortization schedule))? (?:from|in) (?:the )?(?:supplied|provided|reviewed|available) (?:passages|documents|materials|information)\b/i.test(afterClaim)) continue;
        // Narrow paired-field exception for this English reference rule: the same term is
        // explicitly hypothetical in the paired text and the question asks for possibly none.
        // Other assertions in either field still pass through every rule independently.
        const term = /\b(leverage covenant|amortization schedule)\b/i.exec(match[0])?.[1];
        if (rule.id === "asserted-absence" && pairedText && term
          && new RegExp(`^if (?:the (?:agreement|loan) (?:has no|lacks)|no) (?:an? )?${term}\\b[^,]*,`, "i").test(pairedText.trim())
          && /^what (?:other|additional) [^.!?]+, if any, [^.!?]+\?$/i.test(text.trim())
          && /^in the $/i.test(text.slice(Math.max(0,match.index-7),match.index))) continue;
        failures.push({assertionId:assertion.id,ruleId:rule.id,field,matchedText:match[0]});
      }
    }
  }
  return {passed:failures.length === 0,scope:"authored_reference_assertions_only" as const,assertions:(sample.semanticAssertions ?? []).map(item=>({id:item.id,rationale:item.rationale})),failures};
}
export function scoreDocumentWorkLive(product: LiveProduct, sample: LiveSample) {
  const observations = product.sections.flatMap(section => section.observations);
  const quotes = observations.flatMap(observation => observation.citations);
  const text = quotes.map(quote => quote.quote).join("\n").toLowerCase();
  const expectedCoverage = sample.expected.map(term => ({term, covered: text.includes(term.toLowerCase())}));
  const supported = observations.every(observation => observation.citations.some(citation => citation.quote.includes(observation.text)))
    && quotes.every(citation => sample.passages.some(passage => passage.id === citation.passageId && passage.text.includes(citation.quote)));
  const sourceCoverage = sample.passages.every(source => quotes.some(quote => quote.passageId === source.id));
  const substantive = observations.length >= 2 && product.hypotheses.length + product.gaps.length > 0;
  const semantics = scoreDocumentWorkSemantics(product,sample);
  return {passed: semantics.passed && product.job === sample.job && product.status === "preliminary" && supported && sourceCoverage && substantive && expectedCoverage.every(item => item.covered), supported, sourceCoverage, substantive, expectedCoverage, semantics};
}
export function compareDocumentWorkRepeats(first: LiveProduct, second: LiveProduct, sample: Parameters<typeof scoreDocumentWorkLive>[1]) {
  const a = scoreDocumentWorkLive(first,sample), b = scoreDocumentWorkLive(second,sample);
  return {passed: a.passed && b.passed && first.inputFingerprint === second.inputFingerprint,
    sameInput: first.inputFingerprint === second.inputFingerprint, sameFullOutput: first.fingerprint === second.fingerprint,
    expectedFactCoverageStable: JSON.stringify(a.expectedCoverage) === JSON.stringify(b.expectedCoverage)};
}

/** Exact authored control expectations; never a general semantic acceptance claim. */
export function scoreDocumentWorkSourceReviewControl(
  sample: {expectedIssueFieldId:string|null;expectedIssueFieldIds:readonly string[];expectedCleanFieldIds:readonly string[]},
  review: {issues:readonly {fieldId:string}[]},
): boolean {
  const flagged = new Set(review.issues.map(issue=>issue.fieldId));
  return (sample.expectedIssueFieldId !== null || review.issues.length === 0)
    && sample.expectedIssueFieldIds.every(id=>flagged.has(id))
    && sample.expectedCleanFieldIds.every(id=>!flagged.has(id));
}
