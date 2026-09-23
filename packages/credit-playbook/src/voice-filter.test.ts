import {describe, expect, it} from "vitest";

import {VOICE_FILTER_VERSION, auditVoice, classifyLevel, voiceRules, type VoiceRuleId} from "./voice-filter";

const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);

/**
 * One offending and one clean example per rule. N4 keeps the words of negative examples in the
 * test corpus, which is why they live here and nowhere in delivered text. The banned characters
 * are built from their code points so that the corpus never carries the literal either.
 */
const corpus: readonly {id: VoiceRuleId; fires: readonly string[]; passes: readonly string[]}[] = [
  {
    id: "VF-01",
    fires: [`Prazo ${EM_DASH} 48 meses`],
    passes: ["Prazo: 48 meses", "Prazo de 48 meses, carência de 12"],
  },
  {
    id: "VF-02",
    fires: [`Safra 2026${EN_DASH}2027`],
    passes: ["Safra 2026/2027", "Safra de 2026 a 2027", "Taxa pre-fixada"],
  },
  {
    id: "VF-03",
    fires: ["Fechamos \u{1F680}", "Aprovado \u{2705}", "Atenção \u{26A0}\u{FE0F}"],
    passes: ["Fechamos em 30/06/2027", "Marca registrada \u{A9} 2026", "Item 1 # 2 * 3"],
  },
  {
    id: "VF-04",
    fires: ["Como IA, não posso opinar.", "Como modelo de linguagem, não tenho acesso.", "As an AI, I cannot say.", "As a language model I cannot."],
    passes: ["Como ia dizendo, a carência termina em 2027.", "A leitura da IA interna foi revisada."],
  },
  {
    id: "VF-05",
    fires: ["Vale destacar que a alavancagem subiu.", "Ótima pergunta.", "Great question."],
    passes: ["Vale a pena estender a carência.", "A pergunta sobre a garantia continua aberta."],
  },
  {
    id: "VF-06",
    fires: [
      "O banco vai pedir garantia.",
      "O investidor vai aceitar o prazo.",
      "O mercado vai absorver a emissão.",
      "Os bancos não vão renovar.",
      "The bank will accept the tenor.",
    ],
    passes: ["O banco pode pedir garantia.", "O banco tende a pedir garantia; a probabilidade é alta.", "The bank may ask for collateral."],
  },
  {
    id: "VF-07",
    fires: ["Assinar antes que a diligência chegue ao contrato.", "Resolver antes que descubram a cláusula."],
    passes: ["Declarar a restrição antes da diligência.", "A cláusula entra no material antes da assinatura."],
  },
  {
    id: "VF-08",
    fires: ["Não é um problema de preço, é um problema de prazo.", "This isn't a pricing issue, it's a tenor issue."],
    passes: ["Não é possível concluir, e o prazo é curto.", "O custo não é o único critério; o prazo pesa mais."],
  },
  {
    id: "VF-09",
    fires: ["A conta não fecha.", "Esse cronograma não para em pé."],
    passes: ["Não fecha em 2027 por 12 milhões.", "A conta fecha com folga de 3 meses."],
  },
  {
    id: "VF-10",
    fires: ["Recusar a proposta.", "Recomendamos aceitar a proposta.", "Convém recusar."],
    passes: [
      "Recomendamos aceitar a proposta a 14,2% ao ano.",
      "Eu tentaria estender a carência até a entrada em operação, sujeito ao que a análise de crédito aceitar.",
    ],
  },
  {
    id: "VF-11",
    fires: ["A proposta é excelente.", "Ótimo prazo.", "Estrutura perfeita.", "Resultado incrível.", "An excellent structure."],
    passes: ["A taxa foi de 14,2%.", "Otimização do cronograma."],
  },
  {
    id: "VF-12",
    fires: ["Fechamos a operação!"],
    passes: ["Fechamos a operação em 30/06/2027.", "x != y"],
  },
  {
    id: "VF-13",
    fires: ["O que importa:\nA carência termina antes da receita.", "Why:", "**Implicação:**", "Por quê:", "what matters :"],
    passes: ["O que importa é a carência.", "Por que a carência termina antes da receita.", "Implicação para o caixa: pressão em 2027."],
  },
];

const codesOf = (text: string) => auditVoice([text], {channel: "packet"}).map((finding) => finding.code);

describe("voice filter rules", () => {
  it("pins the version and keeps every rule as data", () => {
    expect(VOICE_FILTER_VERSION).toBe("2026.09.24-v1");
    expect(new Set(voiceRules.map((rule) => rule.id)).size).toBe(voiceRules.length);
    expect(new Set(voiceRules.map((rule) => rule.code)).size).toBe(voiceRules.length);
    for (const rule of voiceRules) {
      expect(rule.origin, rule.id).toMatch(/N4|T1|founder/u);
      expect(rule.description.length, rule.id).toBeGreaterThan(10);
      expect(rule.message.length, rule.id).toBeGreaterThan(10);
      expect(rule.patterns.length, rule.id).toBeGreaterThan(0);
      for (const pattern of rule.patterns) {
        // A global or sticky regex carries state between calls, which is how determinism dies.
        if (pattern instanceof RegExp) expect(pattern.flags, `${rule.id} ${pattern.source}`).not.toMatch(/[gy]/u);
      }
    }
  });

  it("blocks only the constructions the brief names and warns on the rest", () => {
    expect(voiceRules.filter((rule) => rule.severity === "block").map((rule) => rule.code)).toEqual([
      "em_dash",
      "en_dash",
      "emoji",
      "ai_self_reference",
      "filler",
      "third_party_certainty",
      "bad_faith_framing",
    ]);
    expect(voiceRules.filter((rule) => rule.severity === "warn").map((rule) => rule.code)).toEqual([
      "not_x_but_y",
      "does_not_close_without_number",
      "verdict_without_number",
      "superlative",
      "exclamation",
      "stamped_label",
    ]);
  });

  it("has a positive and a negative example for every rule", () => {
    expect(corpus.map((entry) => entry.id).sort()).toEqual(voiceRules.map((rule) => rule.id).sort());
    for (const entry of corpus) {
      expect(entry.fires.length, entry.id).toBeGreaterThan(0);
      expect(entry.passes.length, entry.id).toBeGreaterThan(0);
    }
  });

  it.each(corpus)("$id fires on its corpus and stays quiet on clean text", ({id, fires, passes}) => {
    const rule = voiceRules.find((candidate) => candidate.id === id)!;
    for (const text of fires) expect(codesOf(text), text).toContain(rule.code);
    for (const text of passes) expect(codesOf(text), text).not.toContain(rule.code);
  });

  it("leaves legitimate finance language alone", () => {
    for (const text of [
      "Não fecha em 2027 por 12 milhões.",
      "A taxa foi de 14,2%.",
      "O banco pode pedir garantia.",
      "Dívida líquida de R$ 182,4 milhões e alavancagem de 2,7x em 31/12/2025.",
      "Eu tentaria estender a carência até a entrada em operação, sujeito ao que a análise de crédito aceitar.",
    ]) {
      expect(auditVoice([text], {channel: "packet"}), text).toEqual([]);
    }
  });

  it("is deterministic: same input, same findings, same order", () => {
    const strings = [`Ótima pergunta ${EM_DASH} o banco vai aceitar.`, "A taxa foi de 14,2%.", "A conta não fecha.\nWhy:"];
    const first = auditVoice(strings, {channel: "screen"});
    const second = auditVoice(strings, {channel: "screen"});
    expect(second).toEqual(first);
    expect(first.map((finding) => `${finding.stringId}:${finding.ruleId}`)).toEqual([
      "0:VF-01",
      "0:VF-05",
      "0:VF-06",
      "0:VF-11",
      "2:VF-09",
      "2:VF-13",
    ]);
    expect(first.every((finding) => finding.channel === "screen")).toBe(true);
    expect(first.filter((finding) => finding.severity === "block").map((finding) => finding.code)).toEqual(["em_dash", "filler", "third_party_certainty"]);
  });

  it("keeps the caller's ids and falls back to the index", () => {
    const named = auditVoice([{id: "packet.rationale", text: "Perfeito."}], {channel: "packet"});
    expect(named.map((finding) => finding.stringId)).toEqual(["packet.rationale"]);
    const indexed = auditVoice(["Ok.", "Perfeito."], {channel: "catalogue"});
    expect(indexed.map((finding) => [finding.stringId, finding.code])).toEqual([["1", "superlative"]]);
  });

  it("reports one finding per offending sentence or line, with an excerpt a reader can find", () => {
    const perSentence = auditVoice(["A conta não fecha. O prazo não para em pé. Fecha em 2027 por 12 milhões."], {channel: "packet"});
    expect(perSentence.map((finding) => finding.code)).toEqual(["does_not_close_without_number", "does_not_close_without_number"]);
    expect(perSentence.map((finding) => finding.excerpt)).toEqual(["A conta não fecha.", "O prazo não para em pé."]);

    const long = auditVoice([`${"a".repeat(100)} ${EM_DASH} ${"b".repeat(100)}`], {channel: "packet"});
    expect(long.map((finding) => finding.code)).toEqual(["em_dash"]);
    // Forty characters of context on each side, the separating spaces included.
    expect(long[0]?.excerpt).toBe(`...${"a".repeat(39)} ${EM_DASH} ${"b".repeat(39)}...`);
  });

  it("does not mutate its input", () => {
    const strings = [{id: "a", text: `Ótimo ${EM_DASH} perfeito.`}];
    const before = JSON.stringify(strings);
    auditVoice(strings, {channel: "packet"});
    expect(JSON.stringify(strings)).toBe(before);
  });
});

describe("three levels of statement", () => {
  it.each([
    ["Em 31/12/2025, a dívida líquida era de R$ 182,4 milhões.", "fato"],
    ["A taxa foi de 14,2%.", "fato"],
    ["O spread ficou em 180 bps.", "fato"],
    ["Minha leitura é que esse cronograma pressiona o caixa antes de o investimento gerar receita.", "leitura"],
    ["O cronograma parece pressionar o caixa em 2027.", "leitura"],
    ["A série sugere sazonalidade no segundo trimestre.", "leitura"],
    ["Eu tentaria estender a carência até a entrada em operação, sujeito ao que a análise de crédito aceitar.", "recomendacao"],
    ["Recomendamos estender a carência em 12 meses.", "recomendacao"],
    ["Convém separar os usos.", "recomendacao"],
    // The N4 fact example carries neither number nor unit; the lexical reading stays undecided
    // rather than guessing, which is the point of an informational classifier.
    ["O contrato prevê amortização mensal após a carência.", "indeterminado"],
    ["", "indeterminado"],
  ] as const)("%s reads as %s", (sentence, level) => {
    expect(classifyLevel(sentence)).toBe(level);
  });

  it("is informational: a level never becomes a finding", () => {
    expect(auditVoice(["Recomendamos estender a carência em 12 meses.", "Minha leitura é que o caixa aperta."], {channel: "screen"})).toEqual([]);
  });
});
