import {receivablesCaseSchema, type ReceivablesCase} from "./schema";
import {diversifiedReceivablesCase} from "./scenarios";

export type ReceivablesAnchor = {
  id: string;
  kind: "handcrafted_review_candidate";
  title: string;
  thesis: string;
  specialistReview: {status: "pending" | "approved" | "changes_requested"; reviewer: string | null; reviewedAt: string | null; notes: string[]};
  case: ReceivablesCase;
  expectedQuestions: string[];
};

const retailInstallments = diversifiedReceivablesCase("anchor-retail-installments");
retailInstallments.cedent = {id: "cedent-varejo", legalName: "Rede Prisma Varejista S.A.", servicingRole: "shared"};
retailInstallments.portfolio = retailInstallments.portfolio.map((item, index) => ({
  ...item,
  debtorSector: "consumer",
  debtorId: `CONSUMER-${String(index + 1).padStart(4, "0")}`,
  debtorGroupId: `CONSUMER-${String(index + 1).padStart(4, "0")}`,
  registration: "not_required",
}));
retailInstallments.policy.registrationRule = "required_when_applicable";

const b2bInvoices = diversifiedReceivablesCase("anchor-b2b-invoices");
b2bInvoices.cedent = {id: "cedent-industrial", legalName: "Componentes Delta Ltda.", servicingRole: "cedent"};
b2bInvoices.portfolio = b2bInvoices.portfolio.map((item, index) => ({
  ...item,
  debtorSector: index < 30 ? "automotive" : "industrial",
  debtorGroupId: `GROUP-${String((index % 15) + 1).padStart(2, "0")}`,
  disputed: index === 4,
  encumbrance: index === 9 ? "unknown" : "free",
}));
b2bInvoices.structure.requestedFacility = "2800000.00";

export const receivablesAnchorCandidates: readonly ReceivablesAnchor[] = [
  {
    id: "anchor-retail-installments",
    kind: "handcrafted_review_candidate",
    title: "Carteira pulverizada de parcelado próprio no varejo",
    thesis: "Testa grande número de sacados, servicing compartilhado, histórico de coortes e conciliação de recebimentos sem presumir registro quando ele não for aplicável.",
    specialistReview: {status: "pending", reviewer: null, reviewedAt: null, notes: []},
    case: receivablesCaseSchema.parse(retailInstallments),
    expectedQuestions: [
      "Como chargebacks, cancelamentos e devoluções entram na diluição?",
      "Quem controla baixa, renegociação e recuperação por coorte?",
      "Como a conta vinculada separa recebimento ordinário de estorno?",
    ],
  },
  {
    id: "anchor-b2b-invoices",
    kind: "handcrafted_review_candidate",
    title: "Duplicatas B2B com concentração por grupo econômico",
    thesis: "Testa lastro contratual, aceite, concentração, disputas comerciais, cessões prévias e capacidade operacional do cedente.",
    specialistReview: {status: "pending", reviewer: null, reviewedAt: null, notes: []},
    case: receivablesCaseSchema.parse(b2bInvoices),
    expectedQuestions: [
      "O aceite e a entrega podem ser demonstrados título a título?",
      "A concentração é por CNPJ ou por grupo econômico consolidado?",
      "Há cláusulas contratuais que vedem ou condicionem a cessão?",
      "Qual parcela da carteira já está cedida, prometida ou sujeita a disputa?",
    ],
  },
] as const;
