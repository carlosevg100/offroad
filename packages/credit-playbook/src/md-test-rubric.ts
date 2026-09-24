/**
 * The ten questions of the MD test (section Q1 of the capital procedure) as data. Each question is
 * a literal copy of the procedure text. `evaluation` says how the rubric expects the question to be
 * answered: `deterministic` for a check the pipeline can run, `human_required` for the signature
 * question, which no automated check may answer. The deterministic evaluator itself is not part of
 * this module.
 */
export const MD_TEST_RUBRIC_VERSION = "2026.09.24-v1";

export const MD_TEST_RUBRIC_SOURCE = {
  procedureId: "prepare-capital-structure-decision",
  procedurePath: "capital/prepare-capital-structure-decision.md",
  section: "Q1",
} as const;

export type MdTestEvaluation = "deterministic" | "human_required";

export type MdTestQuestion = {
  id: string;
  /** The question, verbatim from the procedure. */
  question: string;
  source: "Q1";
  evaluation: MdTestEvaluation;
};

export const MD_TEST_RUBRIC = [
  {id: "q1", question: "Entendemos o problema real ou apenas respondemos ao pedido literal?", source: "Q1", evaluation: "deterministic"},
  {id: "q2", question: "Pesquisamos e verificamos o que precisava ser verificado?", source: "Q1", evaluation: "deterministic"},
  {id: "q3", question: "Questionamos as premissas relevantes e mostramos o que permanece de pé?", source: "Q1", evaluation: "deterministic"},
  {id: "q4", question: "Existe conclusão clara, compatível com o estado de conhecimento?", source: "Q1", evaluation: "deterministic"},
  {id: "q5", question: "Os números e as evidências sustentam essa conclusão?", source: "Q1", evaluation: "deterministic"},
  {id: "q6", question: "Os riscos principais e as lacunas materiais estão evidentes?", source: "Q1", evaluation: "deterministic"},
  {id: "q7", question: "Existe alternativa melhor que deveríamos apresentar, inclusive manter ou adiar?", source: "Q1", evaluation: "deterministic"},
  {id: "q8", question: "Um decisor que não viu a conversa entende o essencial em menos de um minuto?", source: "Q1", evaluation: "deterministic"},
  {id: "q9", question: "O leitor consegue aprofundar e auditar cada afirmação material?", source: "Q1", evaluation: "deterministic"},
  {id: "q10", question: "Um MD altamente qualificado assinaria essa entrega no escopo e para a audiência indicados?", source: "Q1", evaluation: "human_required"},
] as const satisfies readonly MdTestQuestion[];

export type MdTestQuestionId = (typeof MD_TEST_RUBRIC)[number]["id"];
