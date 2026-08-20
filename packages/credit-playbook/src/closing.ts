import type {Requirement} from "./types";

/**
 * What only exists if the operation happens.
 *
 * These are never asked for. They are on the list so that a company reading the request can
 * see the whole road at once, and none of them is a task today.
 *
 * The reason to show them at all is a failure this product would otherwise repeat. A company
 * assembles what the desk asked for, feels finished, and then a fund arrives with a diligence
 * list four times longer and a closing checklist longer still. Everyone involved concludes
 * that the platform under-asked and the fund moved the goalposts, when in fact this is simply
 * what a private credit transaction requires and nobody said so at the start. Naming the road
 * costs a paragraph; discovering it in week six costs the deal's momentum.
 *
 * They are drawn from the closing tier of a standard Brazilian DCM information request:
 * corporate approvals, registrations, legal opinions, certificates dated at signing, and the
 * evidence that conditions precedent were met. Each carries the reason it exists, in the same
 * voice as everything else — a list of legal artefacts with no explanation is exactly the
 * intimidation this section is meant to prevent.
 *
 * They never count toward readiness, never appear in the missing list, and never block
 * anything. `assessSufficiency` filters them out; a test asserts it, because the day one of
 * these starts counting is the day the request becomes the data room it promised not to be.
 */
export const commonClosing: readonly Requirement[] = [
  {
    id: "closing_corporate_approvals",
    level: "ideal",
    stage: "closing",
    source: "notice",
    satisfiedBy: [],
    singleDocument: true,
    purposes: ["structure"],
    labels: {
      pt: "Aprovações societárias da operação",
      en: "Corporate approvals for the transaction",
    },
    period: {
      pt: "Assinadas antes do desembolso",
      en: "Signed before disbursement",
    },
    rationale: {
      pt: "Ata ou aprovação que autoriza contrair a dívida, emitir o título e constituir as garantias. Só faz sentido depois que os termos estiverem definidos — assinar antes é aprovar uma operação que ainda vai mudar.",
      en: "The resolution authorising the debt, the issuance, and the security. It only makes sense once terms are settled — signing earlier approves a transaction that is still going to change.",
    },
  },
  {
    id: "closing_certificates",
    level: "ideal",
    stage: "closing",
    source: "notice",
    satisfiedBy: [],
    singleDocument: true,
    purposes: ["structure"],
    labels: {
      pt: "Certidões com data próxima à assinatura",
      en: "Certificates dated close to signing",
    },
    period: {
      pt: "Emitidas dias antes do fechamento",
      en: "Issued days before closing",
    },
    rationale: {
      pt: "Certidões fiscais, trabalhistas e de distribuição têm validade curta. Tirar agora é trabalho perdido: no fechamento estarão vencidas e terão de ser tiradas de novo.",
      en: "Tax, labour and court certificates expire quickly. Pulling them now is wasted work: by closing they will have lapsed and be pulled again.",
    },
  },
  {
    id: "closing_security_registration",
    level: "ideal",
    stage: "closing",
    source: "notice",
    satisfiedBy: [],
    singleDocument: true,
    purposes: ["structure"],
    labels: {
      pt: "Registro das garantias em cartório e órgãos competentes",
      en: "Registration of the security with the relevant registries",
    },
    period: {
      pt: "Após a assinatura dos contratos",
      en: "After the contracts are signed",
    },
    rationale: {
      pt: "Alienação fiduciária, hipoteca e cessão fiduciária valem contra terceiros a partir do registro, não da assinatura. É o passo que transforma a garantia negociada em garantia oponível.",
      en: "Chattel mortgage, real estate mortgage and fiduciary assignment bind third parties from registration, not from signature. It is the step that turns agreed security into enforceable security.",
    },
  },
  {
    id: "closing_legal_opinion",
    level: "ideal",
    stage: "closing",
    source: "notice",
    satisfiedBy: [],
    singleDocument: true,
    purposes: ["structure"],
    labels: {
      pt: "Pareceres legais e condições precedentes cumpridas",
      en: "Legal opinions and satisfied conditions precedent",
    },
    period: {
      pt: "Na data do desembolso",
      en: "At disbursement",
    },
    rationale: {
      pt: "O financiador desembolsa contra uma lista de condições verificadas por advogados — dos dois lados. É trabalho dos escritórios, não da companhia, e entra na conta do custo da operação.",
      en: "The lender disburses against a list of conditions verified by lawyers on both sides. It is the firms' work rather than the company's, and it is part of the transaction's cost.",
    },
  },
  {
    id: "closing_disbursement_evidence",
    level: "ideal",
    stage: "closing",
    source: "notice",
    satisfiedBy: [],
    singleDocument: true,
    purposes: ["structure"],
    labels: {
      pt: "Comprovação do uso dos recursos",
      en: "Evidence of how the proceeds were used",
    },
    period: {
      pt: "Durante a vigência da dívida",
      en: "Over the life of the debt",
    },
    rationale: {
      pt: "Quando a destinação é vinculada, o uso tem de ser comprovado periodicamente ao longo da operação. Vale saber disso antes de assinar: é uma obrigação recorrente, não um documento único.",
      en: "Where use of proceeds is restricted, it must be evidenced periodically over the life of the facility. Worth knowing before signing: it is a recurring obligation, not a one-off document.",
    },
  },
];
