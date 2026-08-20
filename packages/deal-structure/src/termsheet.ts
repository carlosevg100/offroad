import Decimal from "decimal.js";
import {archetype, type ArchetypeId} from "@offroad/credit-playbook";

import type {CapacityAssessment} from "./capacity";
import {bandProvenanceNote, playbookBand, reconcileTenor, type MarketBand} from "./market";

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

/**
 * Whether this term answers something the company asked for, or fills something it did not.
 *
 * A company often arrives knowing one thing — "I need R$ 40 million" — and nothing else. It does
 * not know whether it wants 48 months or 72, six months of grace or twelve, a debênture or a
 * CCB. That is the expertise it came here for, and a product that treats those blanks as missing
 * input has misunderstood its own job.
 *
 * So every term is either **`requested`** — the company stated a preference and this is our read
 * on it — or **`proposed`**, which we filled in from the analysis. The distinction is not
 * cosmetic: it changes what the sentence next to the number has to do. A proposed term must
 * justify itself from scratch; a requested one must explain why we agree, or why we do not.
 */
export type TermOrigin = "requested" | "proposed";

export type Term = {
  id: string;
  labels: {pt: string; en: string};
  /** The value, formatted for reading. */
  value: {pt: string; en: string};
  basis: TermBasis;
  origin: TermOrigin;
  /** Why this value and not another. */
  rationale: {pt: string; en: string};
  /**
   * Present only when the company asked for something the analysis does not support.
   *
   * This is the sentence that has to survive a hard conversation, so it carries both sides: what
   * they asked for, and the reason ours differs. A term sheet that quietly replaces a company's
   * number with a better one teaches it nothing and ambushes it in the first meeting where
   * somebody asks why the figure changed.
   */
  divergence?: {
    requested: {pt: string; en: string};
    reason: {pt: string; en: string};
  };
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
  /**
   * The cost the company hoped for, as it wrote it ("13% a.a.", "CDI + 4").
   *
   * Recorded and answered, never argued with by an invented number. Kept as free text because a
   * company writes a rate in whatever convention it thinks in, and normalising it here would be
   * pretending to a precision the field does not have.
   */
  expectedRate?: string;
  /** Currency of the operation. */
  currency?: string;
  /** Anything that holds the case — a critical exception, a missing minimum document. */
  blockers?: readonly string[];
  /**
   * What the market does for this profile. Defaults to the playbook's band, labelled as ours.
   *
   * Passing an observed band is what turns "this operation usually carries 48–84 months" into
   * "fourteen transactions of this profile cleared between 48 and 72 months in the last year" —
   * the same sentence with evidence behind it.
   */
  market?: MarketBand;
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

  const bindingLabel =
    input.capacity.bindingConstraint === "cash_flow"
      ? {pt: "a geração de caixa", en: "cash generation"}
      : input.capacity.bindingConstraint === "collateral"
        ? {pt: "a capacidade de garantias", en: "collateral capacity"}
        : {pt: "o apetite de mercado", en: "market appetite"};

  terms.push({
    id: "amount",
    labels: {pt: "Montante indicativo", en: "Indicative amount"},
    value: {
      pt: recommended ? formatMoney(recommended, currency, "pt-BR") : "a definir",
      en: recommended ? formatMoney(recommended, currency, "en-US") : "to be determined",
    },
    basis: "capacity",
    // The amount is always something the company asked for — it is the one thing nobody else can
    // state on its behalf.
    origin: "requested",
    rationale: constrained
      ? {
          pt: `Pedido de ${formatMoney(requested, currency, "pt-BR")}. O limite é ${bindingLabel.pt} — a conversa é sobre essa restrição, não sobre o montante.`,
          en: `Requested ${formatMoney(requested, currency, "en-US")}. The binding limit is ${bindingLabel.en} — the conversation is about that constraint, not about the amount.`,
        }
      : {
          pt: "O montante pedido cabe nas três restrições calculadas.",
          en: "The requested amount fits inside all three computed constraints.",
        },
    ...(constrained
      ? {
          divergence: {
            requested: {
              pt: formatMoney(requested, currency, "pt-BR"),
              en: formatMoney(requested, currency, "en-US"),
            },
            reason: {
              pt: `A operação não suporta o pedido inteiro: ${bindingLabel.pt} limita em ${formatMoney(recommended!, currency, "pt-BR")}. Para chegar aos ${formatMoney(requested, currency, "pt-BR")} é preciso mexer nessa restrição — mais garantia, prazo maior, ou o caixa crescendo antes do desembolso.`,
              en: `The operation does not carry the full request: ${bindingLabel.en} caps it at ${formatMoney(recommended!, currency, "en-US")}. Reaching ${formatMoney(requested, currency, "en-US")} means moving that constraint — more security, a longer tenor, or cash growing before disbursement.`,
            },
          },
        }
      : {}),
  });

  // ---- tenor and grace ---------------------------------------------------------------------
  //
  // Two different constraints, and conflating them is how a company is told something beautiful
  // and then hears nothing back from the market. The cash flow decides whether the operation can
  // be serviced; the band decides whether anyone buys that shape. This is the second one.
  const band = input.market ?? playbookBand(input.archetypeId);
  const bandNote = bandProvenanceNote(band);
  const verdict = reconcileTenor(band, input.requestedTermMonths);
  const tenor = {value: verdict.recommended, clamped: verdict.binding === "market" ? ((input.requestedTermMonths ?? 0) < band.tenorMonths.min ? "low" : "high") : null} as const;
  terms.push({
    id: "tenor",
    labels: {pt: "Prazo", en: "Tenor"},
    value: {pt: `${tenor.value} meses`, en: `${tenor.value} months`},
    basis: input.requestedTermMonths === undefined ? "playbook" : "company_request",
    origin: input.requestedTermMonths === undefined ? "proposed" : "requested",
    rationale:
      input.requestedTermMonths === undefined
        ? {
            pt: `Você não indicou prazo, então propomos ${tenor.value} meses: é o prazo que os financiadores compram neste perfil (${band.tenorMonths.min}–${band.tenorMonths.max} meses). ${bandNote.pt} ${definition.structure.notes.pt}`,
            en: `You did not state a tenor, so we propose ${tenor.value} months: it is the tenor lenders buy in this profile (${band.tenorMonths.min}–${band.tenorMonths.max} months). ${bandNote.en} ${definition.structure.notes.en}`,
          }
        : {
            pt: `Dentro do que os financiadores compram neste perfil (${band.tenorMonths.min}–${band.tenorMonths.max} meses). ${bandNote.pt} ${definition.structure.notes.pt}`,
            en: `Inside what lenders buy in this profile (${band.tenorMonths.min}–${band.tenorMonths.max} months). ${bandNote.en} ${definition.structure.notes.en}`,
          },
    ...(tenor.clamped
      ? {
          divergence: {
            requested: {pt: `${input.requestedTermMonths} meses`, en: `${input.requestedTermMonths} months`},
            reason:
              tenor.clamped === "low"
                ? {
                    pt: `Os financiadores deste perfil trabalham entre ${band.tenorMonths.min} e ${band.tenorMonths.max} meses. Prazo apertado sobe a parcela e derruba a cobertura — costuma ser o que faz o fundo recusar, não o valor. ${bandNote.pt}`,
                    en: `Lenders in this profile work between ${band.tenorMonths.min} and ${band.tenorMonths.max} months. A tight tenor raises the instalment and cuts coverage — usually what makes a fund decline, rather than the amount. ${bandNote.en}`,
                  }
                : {
                    pt: `O seu fluxo pode até comportar esse prazo — o problema é outro: os financiadores deste perfil compram de ${band.tenorMonths.min} a ${band.tenorMonths.max} meses. Fundo de crédito tem os próprios cotistas para remunerar num horizonte, e prazo fora disso simplesmente não encontra comprador, por mais que a conta feche. ${bandNote.pt}`,
                    en: `Your cash flow may well carry that tenor — the problem is a different one: lenders in this profile buy ${band.tenorMonths.min} to ${band.tenorMonths.max} months. A credit fund has its own investors to repay on its own horizon, and a tenor outside that simply finds no buyer, however well the arithmetic works. ${bandNote.en}`,
                  },
          },
        }
      : {}),
  });

  const grace = withinBand(input.requestedGraceMonths, definition.structure.gracePeriodMonths.typical);
  terms.push({
    id: "grace",
    labels: {pt: "Carência", en: "Grace period"},
    value: {pt: `${grace.value} meses`, en: `${grace.value} months`},
    basis: input.requestedGraceMonths === undefined ? "playbook" : "company_request",
    origin: input.requestedGraceMonths === undefined ? "proposed" : "requested",
    rationale:
      input.requestedGraceMonths === undefined
        ? {
            pt: `Você não indicou carência, então propomos ${grace.value} meses — a banda usual desta operação é ${definition.structure.gracePeriodMonths.typical.join("–")} meses, e ela existe para cobrir o tempo até o investimento começar a gerar caixa.`,
            en: `You did not state a grace period, so we propose ${grace.value} months — the usual band for this operation is ${definition.structure.gracePeriodMonths.typical.join("–")} months, and it exists to cover the time before the investment starts generating cash.`,
          }
        : {
            pt: `Banda típica: ${definition.structure.gracePeriodMonths.typical.join("–")} meses.`,
            en: `Typical band: ${definition.structure.gracePeriodMonths.typical.join("–")} months.`,
          },
    ...(grace.clamped
      ? {
          divergence: {
            requested: {pt: `${input.requestedGraceMonths} meses`, en: `${input.requestedGraceMonths} months`},
            reason:
              grace.clamped === "low"
                ? {
                    pt: `Curta para esta operação. Começar a amortizar antes de o investimento maturar é o que costuma apertar a cobertura no primeiro ano — e o primeiro ano é o que o comitê olha.`,
                    en: `Short for this operation. Amortising before the investment matures is what usually squeezes coverage in year one — and year one is what a committee looks at.`,
                  }
                : {
                    pt: `Mais longa que o usual (${definition.structure.gracePeriodMonths.typical.join("–")} meses). Carência longa não é de graça: o juro do período corre e entra no saldo, e o financiador cobra por isso.`,
                    en: `Longer than usual (${definition.structure.gracePeriodMonths.typical.join("–")} months). A long grace is not free: interest accrues into the balance over the period, and the lender charges for it.`,
                  },
          },
        }
      : {}),
  });

  terms.push({
    id: "amortization",
    labels: {pt: "Amortização", en: "Amortisation"},
    value: {pt: definition.structure.amortization.join(" · "), en: definition.structure.amortization.join(" · ")},
    basis: "playbook",
    origin: "proposed",
    rationale: {
      pt: "Formatos usuais para esta operação; o definitivo acompanha o perfil de geração.",
      en: "Usual formats for this operation; the final one follows the generation profile.",
    },
  });

  // No rate is stated in the document that reaches an investor. Inventing one is the fastest way
  // to lose the company's trust when the market answers differently, and a term sheet that prices
  // itself is presuming to speak for whoever takes the risk.
  //
  // What the company hoped for is answered separately, on the internal side: a banker tells their
  // client "expect CDI + 5"; they do not put a number in the teaser. That view needs comparables
  // to be worth anything, and the comparables are the fund directory's observed transactions —
  // which is why `expectedRate` is recorded here as an open question rather than argued with.
  terms.push({
    id: "pricing",
    labels: {pt: "Custo", en: "Pricing"},
    value: {pt: "definido pelo investidor", en: "set by the investor"},
    basis: "playbook",
    origin: input.expectedRate === undefined ? "proposed" : "requested",
    rationale: {
      pt: "A Offroad não precifica: o custo sai da conversa com quem toma o risco. O que este documento faz é chegar nessa conversa com os números conciliados e rastreáveis.",
      en: "Offroad does not price: cost comes from the conversation with whoever takes the risk. What this document does is arrive at that conversation with reconciled, traceable numbers.",
    },
    ...(input.expectedRate
      ? {
          divergence: {
            requested: {pt: input.expectedRate, en: input.expectedRate},
            reason: {
              pt: "Este documento não traz taxa, e isso é deliberado — quem precifica é quem toma o risco. A leitura do que o mercado tem pago para este perfil fica no documento interno, sustentada pelas operações comparáveis, não em um número posto aqui.",
              en: "This document carries no rate, deliberately — whoever takes the risk sets the price. Our read on what the market has been paying for this profile belongs in the internal document, supported by comparable transactions rather than by a number asserted here.",
            },
          },
        }
      : {}),
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
