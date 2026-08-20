import Decimal from "decimal.js";
import {archetype, type ArchetypeId} from "@offroad/credit-playbook";

import type {CapacityAssessment} from "./capacity";

/**
 * The indicative term sheet — the shape of the paper, with every term traceable to why.
 *
 * This is the document a company takes to a conversation, and the discipline that makes it
 * useful is the same one that makes it safe: **it is indicative and it says so in its own
 * structure**, not in a footnote. Amounts come from the capacity assessment, tenor and
 * covenants come from the playbook's bands, and pricing is deliberately absent — the desk does
 * not know what an investor will charge, and inventing a rate is the fastest way to lose the
 * company's trust when the market answers differently.
 *
 * Every term carries a `basis`: where it came from. A company reading "prazo 60 meses" learns
 * nothing; reading "60 meses — dentro da banda típica para expansão (48–84), limitada pela
 * maturação do projeto" can argue with it, which is the point.
 *
 * The endpoint of this product is a qualified introduction. Nothing here commits anyone to
 * anything, and the language is written so it cannot be read as an offer.
 */

export type TermBasis = "capacity" | "playbook" | "company_request" | "reconciled_fact";

export type Term = {
  id: string;
  labels: {pt: string; en: string};
  /** The value, formatted for reading. */
  value: {pt: string; en: string};
  basis: TermBasis;
  /** Why this value and not another. */
  rationale: {pt: string; en: string};
};

export type IndicativeTermSheet = {
  archetypeId: ArchetypeId;
  /** `indicative` always. The type exists to make the absence of other values obvious. */
  status: "indicative";
  terms: Term[];
  /** Covenants proposed for discussion, from the archetype's menu. */
  covenants: string[];
  /** The security package the desk would ask for. */
  collateral: string[];
  /** What stops this being circulated, if anything. */
  blockers: string[];
  /** Stated plainly, in the document, in both languages. */
  disclaimer: {pt: string; en: string};
};

export type TermSheetInput = {
  archetypeId: ArchetypeId;
  capacity: CapacityAssessment;
  /** Tenor the company asked for, in months. */
  requestedTermMonths?: number;
  /** Grace the company asked for, in months. */
  requestedGraceMonths?: number;
  /** Currency of the operation. */
  currency?: string;
  /** Anything that holds the case — a critical exception, a missing minimum document. */
  blockers?: readonly string[];
};

const formatMoney = (value: string, currency: string, locale: "pt-BR" | "en-US") =>
  `${currency} ${Number(value).toLocaleString(locale, {maximumFractionDigits: 0})}`;

/** Clamps a requested figure into a band, and says which end it hit. */
function withinBand(requested: number | undefined, band: [number, number]): {value: number; clamped: "low" | "high" | null} {
  if (requested === undefined) return {value: band[1], clamped: null};
  if (requested < band[0]) return {value: band[0], clamped: "low"};
  if (requested > band[1]) return {value: band[1], clamped: "high"};
  return {value: requested, clamped: null};
}

export function buildTermSheet(input: TermSheetInput): IndicativeTermSheet {
  const definition = archetype(input.archetypeId);
  const currency = input.currency ?? "R$";
  const terms: Term[] = [];

  // ---- amount ------------------------------------------------------------------------------
  const recommended = input.capacity.recommended;
  const requested = input.capacity.requested;
  const constrained = recommended !== null && new Decimal(recommended).lt(new Decimal(requested));

  terms.push({
    id: "amount",
    labels: {pt: "Montante indicativo", en: "Indicative amount"},
    value: {
      pt: recommended ? formatMoney(recommended, currency, "pt-BR") : "a definir",
      en: recommended ? formatMoney(recommended, currency, "en-US") : "to be determined",
    },
    basis: "capacity",
    rationale: constrained
      ? {
          pt: `Pedido de ${formatMoney(requested, currency, "pt-BR")}. O limite é ${definition.structure.leverageCeiling ? "" : ""}${input.capacity.bindingConstraint === "cash_flow" ? "a geração de caixa" : input.capacity.bindingConstraint === "collateral" ? "a capacidade de garantias" : "o apetite de mercado"} — a conversa é sobre essa restrição, não sobre o montante.`,
          en: `Requested ${formatMoney(requested, currency, "en-US")}. The binding limit is ${input.capacity.bindingConstraint === "cash_flow" ? "cash generation" : input.capacity.bindingConstraint === "collateral" ? "collateral capacity" : "market appetite"} — the conversation is about that constraint, not about the amount.`,
        }
      : {
          pt: "O montante pedido cabe nas três restrições calculadas.",
          en: "The requested amount fits inside all three computed constraints.",
        },
  });

  // ---- tenor and grace ---------------------------------------------------------------------
  const tenor = withinBand(input.requestedTermMonths, definition.structure.tenorMonths.typical);
  terms.push({
    id: "tenor",
    labels: {pt: "Prazo", en: "Tenor"},
    value: {pt: `${tenor.value} meses`, en: `${tenor.value} months`},
    basis: input.requestedTermMonths === undefined ? "playbook" : "company_request",
    rationale: {
      pt: tenor.clamped
        ? `Pedido de ${input.requestedTermMonths} meses ajustado para a banda típica desta operação (${definition.structure.tenorMonths.typical.join("–")} meses). ${definition.structure.notes.pt}`
        : `Dentro da banda típica desta operação (${definition.structure.tenorMonths.typical.join("–")} meses). ${definition.structure.notes.pt}`,
      en: tenor.clamped
        ? `Requested ${input.requestedTermMonths} months adjusted into this operation's typical band (${definition.structure.tenorMonths.typical.join("–")} months). ${definition.structure.notes.en}`
        : `Inside this operation's typical band (${definition.structure.tenorMonths.typical.join("–")} months). ${definition.structure.notes.en}`,
    },
  });

  const grace = withinBand(input.requestedGraceMonths, definition.structure.gracePeriodMonths.typical);
  terms.push({
    id: "grace",
    labels: {pt: "Carência", en: "Grace period"},
    value: {pt: `${grace.value} meses`, en: `${grace.value} months`},
    basis: input.requestedGraceMonths === undefined ? "playbook" : "company_request",
    rationale: {
      pt: `Banda típica: ${definition.structure.gracePeriodMonths.typical.join("–")} meses.`,
      en: `Typical band: ${definition.structure.gracePeriodMonths.typical.join("–")} months.`,
    },
  });

  terms.push({
    id: "amortization",
    labels: {pt: "Amortização", en: "Amortisation"},
    value: {pt: definition.structure.amortization.join(" · "), en: definition.structure.amortization.join(" · ")},
    basis: "playbook",
    rationale: {
      pt: "Formatos usuais para esta operação; o definitivo acompanha o perfil de geração.",
      en: "Usual formats for this operation; the final one follows the generation profile.",
    },
  });

  // Pricing is deliberately absent. The desk does not know what an investor will charge, and a
  // rate invented here is the fastest way to lose the company's trust when the market answers.
  terms.push({
    id: "pricing",
    labels: {pt: "Custo", en: "Pricing"},
    value: {pt: "definido pelo investidor", en: "set by the investor"},
    basis: "playbook",
    rationale: {
      pt: "A Offroad não precifica: o custo sai da conversa com quem toma o risco. O que este documento faz é chegar nessa conversa com os números conciliados e rastreáveis.",
      en: "Offroad does not price: cost comes from the conversation with whoever takes the risk. What this document does is arrive at that conversation with reconciled, traceable numbers.",
    },
  });

  return {
    archetypeId: input.archetypeId,
    status: "indicative",
    terms,
    covenants: [...definition.structure.covenants],
    collateral: [...definition.structure.collateral],
    blockers: [...(input.blockers ?? [])],
    disclaimer: {
      pt: "Documento indicativo, preparado a partir das informações fornecidas pela companhia e conciliadas pela Offroad. Não constitui oferta, compromisso de crédito ou garantia de captação. Termos definitivos dependem de diligência e da decisão de cada investidor.",
      en: "Indicative document, prepared from information provided by the company and reconciled by Offroad. It is not an offer, a credit commitment or a guarantee of funding. Definitive terms depend on diligence and on each investor's decision.",
    },
  };
}
