import Decimal from "decimal.js";

import type {CollateralKind, Instrument, ResolvedMandate} from "./mandate";

/**
 * Whether a transaction fits a fund, answered before the data room exists.
 *
 * This is the function the product is actually for. A company arrives knowing four or five
 * things — roughly how much, roughly how long, what it does, what it can pledge — and the most
 * valuable sentence a desk can say at that moment is not "upload your statements". It is
 * "as conceived, this finds no buyer, and here is what changes that". Saying it while the
 * structure can still move is worth more than every document read afterwards.
 *
 * So fit is assessed on partial information by construction, and each criterion returns one of
 * four outcomes rather than a boolean. Two of them are absences, and keeping them apart is the
 * whole point:
 *
 * - `unknown` — the fund's constraint is known and the company's value is not. **The company can
 *   resolve this**, and `resolvedBy` names the exact item that would. This is how the mandate
 *   drives the information request instead of the request being a fixed list: a fund that
 *   underwrites to a DSCR is the reason we ask for the debt schedule, and now the screen can say
 *   so.
 * - `not_assessed` — we do not know the fund's constraint. **The company can do nothing about
 *   this**; it is our gap, and pretending otherwise sends people to gather documents that will
 *   not change the answer. It is also a work queue for whoever keeps the fund relationships.
 *
 * There is no 0–1 fit score. A number would average an exclusion on instrument — which is often
 * a legal impossibility in Brazil, not a preference — with a soft mismatch on collateral, and
 * produce a ranking nobody can defend to either side. Funds are ordered by verdict, then by how
 * little is still unknown, then by how recently we heard from them; every step of that order is
 * a sentence a person can read.
 */

export type CriterionOutcome = "fits" | "excluded" | "unknown" | "not_assessed";

export type CriterionId =
  | "active"
  | "instrument"
  | "ticket"
  | "term"
  | "sector"
  | "geography"
  | "collateral"
  | "leverage"
  | "dscr";

export type CriterionFit = {
  id: CriterionId;
  labels: {pt: string; en: string};
  outcome: CriterionOutcome;
  /** Whether failing this criterion excludes the fund outright. */
  hard: boolean;
  /** The fund's constraint, in words. */
  mandate?: string;
  /** What the transaction says, in words. */
  request?: string;
  explanation: {pt: string; en: string};
  /** For `unknown`: the checklist item that would settle it. */
  resolvedBy?: string;
  /** On this criterion, what the fund does contradicts what it says. */
  divergent: boolean;
};

export type MandateFitVerdict = "fits" | "possible" | "excluded";

export type MandateFit = {
  fundId: string;
  fundName: string;
  verdict: MandateFitVerdict;
  criteria: CriterionFit[];
  /** Why it is out, hard criteria first. Empty unless the verdict is `excluded`. */
  exclusions: CriterionFit[];
  /** Checklist items that would turn the remaining unknowns into answers. */
  unlockedBy: string[];
  /** Criteria we cannot judge because our record of this fund is incomplete. Our gap, not theirs. */
  ourGaps: CriterionId[];
  /** Months since the freshest thing we know about this fund. */
  staleMonths: number | null;
  /** Criteria where behaviour contradicts the statement. */
  divergences: string[];
};

/**
 * What the company has told us so far. Every field optional on purpose: this is answered from a
 * one-page brief, long before anything is reconciled.
 */
export type DealRequest = {
  /** Amount sought, as a decimal string. */
  amount?: string;
  termMonths?: number;
  sector?: string;
  geography?: string;
  /** Instruments the operation could take. Several is normal and good. */
  instruments?: readonly Instrument[];
  collateral?: readonly CollateralKind[];
  /** Net debt / EBITDA after the transaction, once it can be computed. */
  leverage?: string;
  /** Projected DSCR, once it can be computed. */
  dscr?: string;
};

/** Which checklist item settles each unknown. The link that makes the request mandate-driven. */
const resolvedByRequirement: Partial<Record<CriterionId, string>> = {
  leverage: "financials_historical",
  dscr: "debt_schedule",
  collateral: "collateral_schedule",
  sector: "corporate_identity",
};

const money = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `R$ ${parsed.toLocaleString("pt-BR", {maximumFractionDigits: 0})}` : value;
};

const L = (pt: string, en: string) => ({pt, en});

type Assessment = {
  outcome: CriterionOutcome;
  mandate?: string;
  request?: string;
  explanation: {pt: string; en: string};
};

/**
 * One criterion, assembled from the four things that decide it: whether the fund's constraint is
 * known, whether the company's value is known, whether they agree, and whether disagreeing is
 * fatal.
 */
function criterion(
  id: CriterionId,
  labels: {pt: string; en: string},
  hard: boolean,
  assessment: Assessment,
  divergent: boolean,
): CriterionFit {
  const resolver = assessment.outcome === "unknown" ? resolvedByRequirement[id] : undefined;
  return {
    id,
    labels,
    hard,
    outcome: assessment.outcome,
    ...(assessment.mandate ? {mandate: assessment.mandate} : {}),
    ...(assessment.request ? {request: assessment.request} : {}),
    explanation: assessment.explanation,
    ...(resolver ? {resolvedBy: resolver} : {}),
    divergent,
  };
}

const weDoNotKnow = (what: {pt: string; en: string}): Assessment => ({
  outcome: "not_assessed",
  explanation: L(
    `Não sabemos ${what.pt} deste fundo. Isso é uma lacuna nossa: nada que você envie resolve. Quem resolve somos nós, falando com eles.`,
    `We do not know this fund's ${what.en}. That is our gap: nothing you send resolves it. We resolve it by asking them.`,
  ),
});

export function assessMandateFit(mandate: ResolvedMandate, request: DealRequest): MandateFit {
  const criteria: CriterionFit[] = [];

  // ---- is the fund even taking deals ------------------------------------------------------
  criteria.push(
    criterion(
      "active",
      L("Aceitando operações", "Taking new deals"),
      true,
      mandate.active === null
        ? weDoNotKnow(L("se está aceitando operações", "current appetite"))
        : mandate.active.value
          ? {outcome: "fits", explanation: L("O fundo está aceitando operações novas.", "The fund is taking new deals.")}
          : {
              outcome: "excluded",
              explanation: L(
                "O fundo não está alocando agora. Não é sobre a sua operação.",
                "The fund is not deploying right now. This is not about your transaction.",
              ),
            },
      Boolean(mandate.active?.divergent),
    ),
  );

  // ---- instrument: in Brazil this is usually a legal wall, not a preference ----------------
  criteria.push(
    criterion(
      "instrument",
      L("Instrumento", "Instrument"),
      true,
      (() => {
        if (mandate.instruments === null) return weDoNotKnow(L("quais instrumentos compra", "eligible instruments"));
        if (!request.instruments?.length) {
          return {
            outcome: "unknown" as const,
            mandate: mandate.instruments.value.join(", "),
            explanation: L(
              "Ainda não definimos por qual instrumento a operação sairia. É a primeira coisa que exclui um fundo, e frequentemente por regra e não por gosto.",
              "The instrument has not been settled yet. It is the first thing that excludes a fund, and often by rule rather than taste.",
            ),
          };
        }
        const overlap = request.instruments.filter((instrument) => mandate.instruments!.value.includes(instrument));
        return overlap.length > 0
          ? {
              outcome: "fits" as const,
              mandate: mandate.instruments.value.join(", "),
              request: request.instruments.join(", "),
              explanation: L(`Compatível por ${overlap.join(", ")}.`, `Compatible through ${overlap.join(", ")}.`),
            }
          : {
              outcome: "excluded" as const,
              mandate: mandate.instruments.value.join(", "),
              request: request.instruments.join(", "),
              explanation: L(
                "Este fundo não compra nenhum dos instrumentos possíveis para esta operação. No Brasil isso costuma ser regra do próprio veículo, não preferência, e mudar o instrumento muda o conjunto de compradores.",
                "This fund buys none of the instruments this transaction could take. In Brazil that is usually the vehicle's own rule rather than a preference, and changing the instrument changes the buyer set.",
              ),
            };
      })(),
      Boolean(mandate.instruments?.divergent),
    ),
  );

  // ---- ticket ------------------------------------------------------------------------------
  criteria.push(
    criterion(
      "ticket",
      L("Ticket", "Ticket"),
      true,
      (() => {
        if (mandate.ticket === null) return weDoNotKnow(L("a faixa de ticket", "ticket range"));
        const box = `${money(mandate.ticket.value.min)} – ${money(mandate.ticket.value.max)}`;
        if (!request.amount) {
          return {
            outcome: "unknown" as const,
            mandate: box,
            explanation: L("O valor pretendido ainda não foi informado.", "The amount sought has not been stated yet."),
          };
        }
        const amount = new Decimal(request.amount);
        const inside = amount.gte(mandate.ticket.value.min) && amount.lte(mandate.ticket.value.max);
        return inside
          ? {
              outcome: "fits" as const,
              mandate: box,
              request: money(request.amount),
              explanation: L("O valor está dentro da faixa que o fundo escreve.", "The amount is inside the fund's range."),
            }
          : {
              outcome: "excluded" as const,
              mandate: box,
              request: money(request.amount),
              explanation: amount.lt(mandate.ticket.value.min)
                ? L(
                    "Abaixo do menor cheque que este fundo escreve. Fundo grande não faz operação pequena porque o custo de analisar é o mesmo.",
                    "Below the smallest cheque this fund writes. A large fund skips small deals because the analysis costs the same.",
                  )
                : L(
                    "Acima do maior cheque deste fundo sozinho. Pode caber se a operação for dividida entre mais de um financiador.",
                    "Above this fund's largest cheque alone. It may still fit if the transaction is split across lenders.",
                  ),
            };
      })(),
      Boolean(mandate.ticket?.divergent),
    ),
  );

  // ---- term --------------------------------------------------------------------------------
  criteria.push(
    criterion(
      "term",
      L("Prazo", "Tenor"),
      true,
      (() => {
        if (mandate.termMonths === null) return weDoNotKnow(L("a faixa de prazo", "tenor range"));
        const box = `${mandate.termMonths.value.min}–${mandate.termMonths.value.max} meses`;
        if (request.termMonths === undefined) {
          return {outcome: "unknown" as const, mandate: box, explanation: L("O prazo pretendido ainda não foi informado.", "The tenor has not been stated yet.")};
        }
        const inside = request.termMonths >= mandate.termMonths.value.min && request.termMonths <= mandate.termMonths.value.max;
        return inside
          ? {
              outcome: "fits" as const,
              mandate: box,
              request: `${request.termMonths} meses`,
              explanation: L("O prazo cabe no que o fundo carrega.", "The tenor is inside what the fund holds."),
            }
          : {
              outcome: "excluded" as const,
              mandate: box,
              request: `${request.termMonths} meses`,
              explanation: L(
                "O prazo não cabe. Prazo costuma ser o parâmetro mais fácil de renegociar de todos, então vale testar antes de descartar o fundo.",
                "The tenor does not fit. Tenor is usually the easiest parameter to move, so it is worth testing before dropping the fund.",
              ),
            };
      })(),
      Boolean(mandate.termMonths?.divergent),
    ),
  );

  // ---- sector -------------------------------------------------------------------------------
  criteria.push(
    criterion(
      "sector",
      L("Setor", "Sector"),
      true,
      (() => {
        if (mandate.sectors === null) return weDoNotKnow(L("os setores que aceita", "eligible sectors"));
        const box = mandate.sectors.value.join(", ");
        if (!request.sector) {
          return {outcome: "unknown" as const, mandate: box, explanation: L("O setor da companhia ainda não foi identificado.", "The company's sector has not been identified yet.")};
        }
        const sector = request.sector.toLowerCase();
        const accepted = mandate.sectors.value.some((entry) => entry.toLowerCase() === sector);
        return accepted
          ? {outcome: "fits" as const, mandate: box, request: request.sector, explanation: L("Setor dentro do mandato.", "Sector inside the mandate.")}
          : {
              outcome: "excluded" as const,
              mandate: box,
              request: request.sector,
              explanation: L(
                "O setor está fora do mandato. Restrição setorial costuma vir do regulamento do fundo ou do que os cotistas aceitaram, e raramente se negocia.",
                "The sector is outside the mandate. Sector restrictions usually come from the fund's own regulation or its investors, and are rarely negotiable.",
              ),
            };
      })(),
      Boolean(mandate.sectors?.divergent),
    ),
  );

  // ---- geography ----------------------------------------------------------------------------
  criteria.push(
    criterion(
      "geography",
      L("Geografia", "Geography"),
      true,
      (() => {
        if (mandate.geographies === null) return weDoNotKnow(L("onde investe", "geographies"));
        const box = mandate.geographies.value.join(", ");
        if (!request.geography) {
          return {outcome: "unknown" as const, mandate: box, explanation: L("A praça principal da operação ainda não foi informada.", "The transaction's main geography has not been stated yet.")};
        }
        const accepted = mandate.geographies.value.some((entry) => entry.toLowerCase() === request.geography!.toLowerCase());
        return accepted
          ? {outcome: "fits" as const, mandate: box, request: request.geography, explanation: L("Dentro da geografia do fundo.", "Inside the fund's geography.")}
          : {
              outcome: "excluded" as const,
              mandate: box,
              request: request.geography,
              explanation: L("Fora da geografia em que o fundo opera.", "Outside the fund's operating geography."),
            };
      })(),
      Boolean(mandate.geographies?.divergent),
    ),
  );

  // ---- collateral: a preference, not a wall --------------------------------------------------
  criteria.push(
    criterion(
      "collateral",
      L("Garantia", "Collateral"),
      false,
      (() => {
        if (mandate.collateral === null) return weDoNotKnow(L("que garantias exige", "required collateral"));
        const box = mandate.collateral.value.join(", ");
        if (!request.collateral?.length) {
          return {outcome: "unknown" as const, mandate: box, explanation: L("Ainda não sabemos o que a companhia pode dar em garantia.", "We do not yet know what the company can pledge.")};
        }
        const overlap = request.collateral.filter((kind) => mandate.collateral!.value.includes(kind));
        return overlap.length > 0
          ? {outcome: "fits" as const, mandate: box, request: request.collateral.join(", "), explanation: L(`Garantia compatível: ${overlap.join(", ")}.`, `Compatible security: ${overlap.join(", ")}.`)}
          : {
              outcome: "unknown" as const,
              mandate: box,
              request: request.collateral.join(", "),
              explanation: L(
                "A garantia oferecida não é a que este fundo costuma pedir. Não elimina o fundo: muda o preço e a estrutura, e é exatamente o tipo de coisa que se discute.",
                "The security on offer is not what this fund usually asks for. It does not rule the fund out: it moves price and structure, and it is precisely the sort of thing that gets discussed.",
              ),
            };
      })(),
      Boolean(mandate.collateral?.divergent),
    ),
  );

  // ---- leverage and coverage: known only once the numbers are reconciled ----------------------
  criteria.push(
    criterion(
      "leverage",
      L("Alavancagem", "Leverage"),
      true,
      (() => {
        if (mandate.leverageCeiling === null) return weDoNotKnow(L("o teto de alavancagem", "leverage ceiling"));
        const box = `≤ ${mandate.leverageCeiling.value}x`;
        if (!request.leverage) {
          return {
            outcome: "unknown" as const,
            mandate: box,
            explanation: L(
              "A alavancagem pós-operação só é calculável com dívida e EBITDA conciliados. É por isso que pedimos as demonstrações: este fundo tem um teto e precisamos saber de que lado dele você está.",
              "Post-transaction leverage can only be computed from reconciled debt and EBITDA. That is why we ask for the statements: this fund has a ceiling and we need to know which side of it you are on.",
            ),
          };
        }
        const inside = new Decimal(request.leverage).lte(mandate.leverageCeiling.value);
        return inside
          ? {outcome: "fits" as const, mandate: box, request: `${request.leverage}x`, explanation: L("Dentro do teto do fundo.", "Inside the fund's ceiling.")}
          : {
              outcome: "excluded" as const,
              mandate: box,
              request: `${request.leverage}x`,
              explanation: L(
                "A alavancagem pós-operação passa do teto deste fundo. Diminuir o valor, alongar o prazo ou reforçar garantia move este número.",
                "Post-transaction leverage exceeds this fund's ceiling. A smaller amount, a longer tenor, or stronger security moves this number.",
              ),
            };
      })(),
      Boolean(mandate.leverageCeiling?.divergent),
    ),
  );

  criteria.push(
    criterion(
      "dscr",
      L("Cobertura (DSCR)", "Coverage (DSCR)"),
      true,
      (() => {
        if (mandate.minimumDscr === null) return weDoNotKnow(L("o DSCR mínimo", "minimum DSCR"));
        const box = `≥ ${mandate.minimumDscr.value}x`;
        if (!request.dscr) {
          return {
            outcome: "unknown" as const,
            mandate: box,
            explanation: L(
              "A cobertura depende do serviço da dívida existente somado ao da nova. Sem o mapa de dívida não há como calcular.",
              "Coverage depends on existing debt service plus the new facility's. Without the debt schedule there is nothing to compute.",
            ),
          };
        }
        const inside = new Decimal(request.dscr).gte(mandate.minimumDscr.value);
        return inside
          ? {outcome: "fits" as const, mandate: box, request: `${request.dscr}x`, explanation: L("Cobertura acima do mínimo do fundo.", "Coverage above the fund's minimum.")}
          : {
              outcome: "excluded" as const,
              mandate: box,
              request: `${request.dscr}x`,
              explanation: L(
                "A geração de caixa não cobre o serviço da dívida no mínimo que este fundo exige. Carência maior ou amortização mais longa é o caminho usual.",
                "Cash generation does not cover debt service at this fund's minimum. Longer grace or slower amortisation is the usual route.",
              ),
            };
      })(),
      Boolean(mandate.minimumDscr?.divergent),
    ),
  );

  const exclusions = criteria.filter((entry) => entry.hard && entry.outcome === "excluded");
  const unknowns = criteria.filter((entry) => entry.outcome === "unknown");
  const mandateGaps = criteria.filter((entry) => entry.outcome === "not_assessed");
  const verdict: MandateFitVerdict =
    exclusions.length > 0 ? "excluded" : unknowns.length > 0 || mandateGaps.length > 0 ? "possible" : "fits";

  return {
    fundId: mandate.fundId,
    fundName: mandate.fundName,
    verdict,
    criteria,
    exclusions,
    unlockedBy: [...new Set(unknowns.map((entry) => entry.resolvedBy).filter((id): id is string => Boolean(id)))],
    ourGaps: mandateGaps.map((entry) => entry.id),
    staleMonths: mandate.freshestMonths,
    divergences: mandate.divergences,
  };
}

/**
 * Orders funds without inventing a score.
 *
 * Verdict first, then how little is still unknown, then how recently we heard from the fund.
 * Every step is a sentence: "these fit, these might once we know more, these are out; among the
 * maybes, the ones we are closest to answering; among equals, the ones we have spoken to most
 * recently." A single 0–1 number would compress all of that into something neither the company
 * nor the fund could argue with — and both of them are entitled to argue with it.
 */
const verdictOrder: Record<MandateFitVerdict, number> = {fits: 0, possible: 1, excluded: 2};

export function rankFits(fits: readonly MandateFit[]): MandateFit[] {
  return [...fits].sort((a, b) => {
    if (verdictOrder[a.verdict] !== verdictOrder[b.verdict]) return verdictOrder[a.verdict] - verdictOrder[b.verdict];
    const unknownA = a.criteria.filter((entry) => entry.outcome === "unknown").length;
    const unknownB = b.criteria.filter((entry) => entry.outcome === "unknown").length;
    if (unknownA !== unknownB) return unknownA - unknownB;
    const staleA = a.staleMonths ?? Number.POSITIVE_INFINITY;
    const staleB = b.staleMonths ?? Number.POSITIVE_INFINITY;
    if (staleA !== staleB) return staleA - staleB;
    return a.fundName.localeCompare(b.fundName);
  });
}

/**
 * What is true across every fund at once — the answer a company most needs early.
 *
 * A per-fund list says "no" fifty times. This says the thing behind the fifty noes: if every
 * fund is out on ticket, the amount is wrong for the market, not for one manager. That is a
 * finding about the operation, deliverable on day one, and it is the single most valuable output
 * of this whole module.
 */
export function structuralExclusions(fits: readonly MandateFit[]): CriterionId[] {
  const considered = fits.filter((fit) => fit.verdict === "excluded");
  if (considered.length === 0 || considered.length !== fits.length) return [];
  const counts = new Map<CriterionId, number>();
  for (const fit of considered) {
    for (const exclusion of fit.exclusions) {
      counts.set(exclusion.id, (counts.get(exclusion.id) ?? 0) + 1);
    }
  }
  // Only a criterion that excluded *every* fund is structural; anything less is a fund's taste.
  return [...counts.entries()].filter(([, count]) => count === fits.length).map(([id]) => id);
}
