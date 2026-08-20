import Decimal from "decimal.js";
import {z} from "zod";

import {resolveCriterion, type Resolved, type ResolveOptions, type Sourced} from "./provenance";

/**
 * A fund's box, in the vocabulary of the Brazilian private credit market.
 *
 * The instrument list is not decoration and not translated from an American template. Which
 * instrument a fund can hold is often the first thing that excludes a deal, and in Brazil that
 * question has a legal answer rather than a stylistic one: an FIDC buys credit rights and cannot
 * simply hold a debenture; a CRI or CRA needs the credit to qualify as real-estate or
 * agribusiness under Lei 14.430; a nota comercial and a debênture reach different investor sets
 * under different distribution rules. Modelling this as "structure: senior_secured | unitranche"
 * would erase the constraint that most often kills a Brazilian transaction.
 */

export const instrumentSchema = z.enum([
  "debenture",
  "nota_comercial",
  "ccb",
  "cri",
  "cra",
  "fidc",
  "direct_loan",
  "receivables_purchase",
  "project_finance",
  "equity_kicker_debt",
]);
export type Instrument = z.infer<typeof instrumentSchema>;

export const collateralKindSchema = z.enum([
  "recebiveis",
  "imovel",
  "equipamento",
  "estoque",
  "aval_fianca",
  "cessao_fiduciaria",
  "alienacao_fiduciaria_quotas",
  "conta_reserva",
  "quirografario",
]);
export type CollateralKind = z.infer<typeof collateralKindSchema>;

export type MoneyRange = {min: string; max: string};
export type MonthRange = {min: number; max: number};

/**
 * Everything about a fund that can vary by source and by date.
 *
 * Each criterion is a list rather than a value. An empty list is not "no restriction" — it is
 * "we do not know", and `assessFit` treats those two very differently, because telling a company
 * a fund has no sector restriction when nobody ever asked is how a platform sends a healthcare
 * deal to an agribusiness fund and burns the relationship.
 */
export type Mandate = {
  fundId: string;
  fundName: string;
  ticket: readonly Sourced<MoneyRange>[];
  termMonths: readonly Sourced<MonthRange>[];
  /** Free-form sector labels; empty means unknown, never "all". */
  sectors: readonly Sourced<readonly string[]>[];
  instruments: readonly Sourced<readonly Instrument[]>[];
  collateral: readonly Sourced<readonly CollateralKind[]>[];
  geographies: readonly Sourced<readonly string[]>[];
  /** Maximum net debt / EBITDA the fund will underwrite, as a decimal string. */
  leverageCeiling: readonly Sourced<string>[];
  /** Minimum DSCR the fund underwrites to, as a decimal string. */
  minimumDscr: readonly Sourced<string>[];
  /** Whether the fund is taking new deals at all right now. */
  active: readonly Sourced<boolean>[];
};

export type ResolvedMandate = {
  fundId: string;
  fundName: string;
  ticket: Resolved<MoneyRange> | null;
  termMonths: Resolved<MonthRange> | null;
  sectors: Resolved<readonly string[]> | null;
  instruments: Resolved<readonly Instrument[]> | null;
  collateral: Resolved<readonly CollateralKind[]> | null;
  geographies: Resolved<readonly string[]> | null;
  leverageCeiling: Resolved<string> | null;
  minimumDscr: Resolved<string> | null;
  active: Resolved<boolean> | null;
  /** Criteria where behaviour contradicts what the fund says. Shown, never silently resolved. */
  divergences: string[];
  /** Months since the freshest observation of any kind. How current our picture of this fund is. */
  freshestMonths: number | null;
};

const midpoint = (range: MoneyRange): Decimal =>
  new Decimal(range.min).plus(range.max).dividedBy(2);

/** Two ranges differ materially when their midpoints are apart by more than the tolerance. */
const rangesDiffer = (accepted: MoneyRange, other: MoneyRange, tolerance: number): boolean => {
  const a = midpoint(accepted);
  const b = midpoint(other);
  if (!a.isFinite() || !b.isFinite() || a.isZero()) return !a.equals(b);
  return b.minus(a).dividedBy(a).abs().gt(tolerance);
};

const monthRangesDiffer = (accepted: MonthRange, other: MonthRange, tolerance: number): boolean => {
  const a = (accepted.min + accepted.max) / 2;
  const b = (other.min + other.max) / 2;
  if (a === 0) return a !== b;
  return Math.abs((b - a) / a) > tolerance;
};

const numbersDiffer = (accepted: string, other: string, tolerance: number): boolean => {
  const a = new Decimal(accepted);
  const b = new Decimal(other);
  if (!a.isFinite() || !b.isFinite() || a.isZero()) return !a.equals(b);
  return b.minus(a).dividedBy(a).abs().gt(tolerance);
};

/** Lists differ when either side holds something the other does not. */
const listsDiffer = <T>(accepted: readonly T[], other: readonly T[]): boolean => {
  const left = new Set(accepted);
  const right = new Set(other);
  return [...left].some((value) => !right.has(value)) || [...right].some((value) => !left.has(value));
};

/**
 * Collapses every criterion to the observation the desk acts on, keeping the rest.
 *
 * `freshestMonths` deliberately looks across all criteria and all provenances: a fund whose most
 * recent evidence of any kind is fourteen months old is a fund we have lost touch with, and that
 * is worth saying on the screen next to any match it produces.
 */
export function resolveMandate(mandate: Mandate, options: ResolveOptions): ResolvedMandate {
  const ticket = resolveCriterion(mandate.ticket, options, rangesDiffer);
  const termMonths = resolveCriterion(mandate.termMonths, options, monthRangesDiffer);
  const sectors = resolveCriterion(mandate.sectors, options, (a, b) => listsDiffer(a, b));
  const instruments = resolveCriterion(mandate.instruments, options, (a, b) => listsDiffer(a, b));
  const collateral = resolveCriterion(mandate.collateral, options, (a, b) => listsDiffer(a, b));
  const geographies = resolveCriterion(mandate.geographies, options, (a, b) => listsDiffer(a, b));
  const leverageCeiling = resolveCriterion(mandate.leverageCeiling, options, numbersDiffer);
  const minimumDscr = resolveCriterion(mandate.minimumDscr, options, numbersDiffer);
  const active = resolveCriterion(mandate.active, options);

  const named: Array<[string, Resolved<unknown> | null]> = [
    ["ticket", ticket],
    ["prazo", termMonths],
    ["setor", sectors],
    ["instrumento", instruments],
    ["garantia", collateral],
    ["geografia", geographies],
    ["alavancagem", leverageCeiling],
    ["dscr", minimumDscr],
    ["atividade", active],
  ];

  const ages = named
    .map(([, resolved]) => resolved?.ageMonths)
    .filter((age): age is number => typeof age === "number");

  return {
    fundId: mandate.fundId,
    fundName: mandate.fundName,
    ticket,
    termMonths,
    sectors,
    instruments,
    collateral,
    geographies,
    leverageCeiling,
    minimumDscr,
    active,
    divergences: named.filter(([, resolved]) => resolved?.divergent).map(([name]) => name),
    freshestMonths: ages.length > 0 ? Math.min(...ages) : null,
  };
}
