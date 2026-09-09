/** Planning hint only. Runtime authority additionally requires the signed SQL scope marker. */
export function canCompileStandaloneDocumentWorkRequest(request: {objective:string;proposedDeliverable:string}): boolean {
  if (!documentWorkJob(request.objective)) return false;
  const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const deliverable = normalize(request.proposedDeliverable);
  if (!/\b(?:documental|documentary|document[- ]only)\b/.test(deliverable)
    || !/\b(?:preliminar|preliminary|qualitativ\w*|only|somente|apenas)\b/.test(deliverable)) return false;
  const work = normalize(`${request.objective} ${request.proposedDeliverable}`)
    .replace(/\b(?:sem|without|no)\s+(?:calculos?|calculations?|financial calculations?)\b/g, "");
  return !/\b(?:calcul\w*|recalcul\w*|reconcili\w*|concili\w*|model\w*|custo efetivo|effective cost|cet|tir|irr|npv|vpl|dscr|ebitda|stress|sensibil\w*|sensitivity|amortization schedule|cronograma de amortizacao)\b/.test(work);
}

/** Only explicit bounded requests activate this additional document reading. */
export function documentWorkJob(request: string): "comparison" | "meeting" | "review" | null {
  const text = request.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/\b(nao|not|without|sem|don[’']t)\b[^.!?;\n]{0,35}\b(?:compar|revis|review|prepar|briefing)/.test(text)) return null;
  if (/\b(compar\w*|compare)\b.{0,100}\b(propostas?|offers?|proposals?|term\s*sheets?)\b/.test(text)) return "comparison";
  if (/\bbriefing\b/.test(text)) return "meeting";
  if (/\b(prepar\w*|prepare|briefing)\b.{0,100}\b(reuniao|meeting|briefing)\b/.test(text)) return "meeting";
  if (/\b(revis\w*|review|analis\w*|analy[sz]e)\b.{0,100}\b(oportunidade|opportunity|operacao|transaction|proposta|proposal|term\s*sheet)\b/.test(text)) return "review";
  return null;
}

