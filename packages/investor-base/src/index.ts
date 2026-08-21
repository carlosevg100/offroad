import Decimal from "decimal.js";

/**
 * Who buys this paper: the investor base as data, and the shortlist as arithmetic.
 *
 * A sounding starts with a list, and the list is the first place a desk shows its worth: the
 * funds that buy this archetype at this ticket, at this tenor, in this sector, at this rating,
 * and why each one is on or off the list. The appetite is declared per investor and matched
 * mechanically; the desk's judgement enters as the appetite it declares, never as a hidden
 * preference in the matching.
 *
 * No real investor lives in this package. The product's base is the tenant's own, entered and
 * maintained by the desk; the fixtures here are labelled synthetic and exist for tests.
 */

export type InvestorKind = "credit_fund" | "bank_treasury" | "family_office" | "fidc_manager" | "venture_debt_fund" | "insurer" | "development_bank";
export type RatingBand = "strong" | "adequate" | "watch" | "weak" | "distressed";

export type InvestorAppetite = {
  archetypes: readonly string[];
  instruments: readonly string[];
  /** Ticket range in reais. */
  ticket: {min: string; max: string};
  tenorMonths: {min: number; max: number};
  /** Worst rating band accepted. */
  minimumRating: RatingBand;
  excludedSectors?: readonly string[];
  preferredSectors?: readonly string[];
  requiresSecurity?: boolean;
  ventureBacked?: boolean;
};

export type Investor = {
  id: string;
  name: string;
  kind: InvestorKind;
  appetite: InvestorAppetite;
  /** Who the desk talks to; never shown outside the tenant. */
  contact?: string;
  /** Last time the appetite was confirmed with the investor, ISO date. */
  confirmedOn?: string;
  synthetic?: boolean;
};

export type DealProfile = {
  archetypeId: string;
  instrument: string;
  amount: string;
  tenorMonths: number;
  rating: RatingBand;
  sector: string;
  secured: boolean;
  ventureBacked?: boolean;
};

export type ShortlistEntry = {
  investor: Investor;
  /** 0 to 100; the ordering of the list, never a probability. */
  fit: number;
  eligible: boolean;
  reasons: {pt: string; en: string}[];
};

const ratingOrder: Record<RatingBand, number> = {strong: 0, adequate: 1, watch: 2, weak: 3, distressed: 4};
const fold = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const millions = (value: string) => new Decimal(value).div(1e6).toFixed(0);

export function shortlist(investors: readonly Investor[], deal: DealProfile): ShortlistEntry[] {
  const amount = new Decimal(deal.amount);
  const entries = investors.map((investor): ShortlistEntry => {
    const a = investor.appetite;
    const reasons: {pt: string; en: string}[] = [];
    let eligible = true;
    let fit = 100;
    if (!a.archetypes.includes(deal.archetypeId)) { eligible = false; reasons.push({pt: "Não compra esta operação.", en: "Does not buy this operation."}); }
    if (!a.instruments.includes(deal.instrument)) { eligible = false; reasons.push({pt: `Não compra ${deal.instrument}.`, en: `Does not buy ${deal.instrument}.`}); }
    if (amount.lt(a.ticket.min) || amount.gt(a.ticket.max)) { eligible = false; reasons.push({pt: `Tíquete fora da faixa (R$ ${millions(a.ticket.min)}M a R$ ${millions(a.ticket.max)}M).`, en: `Ticket outside the range (R$ ${millions(a.ticket.min)}M to R$ ${millions(a.ticket.max)}M).`}); }
    if (deal.tenorMonths < a.tenorMonths.min || deal.tenorMonths > a.tenorMonths.max) { eligible = false; reasons.push({pt: `Prazo fora da faixa (${a.tenorMonths.min} a ${a.tenorMonths.max} meses).`, en: `Tenor outside the range (${a.tenorMonths.min} to ${a.tenorMonths.max} months).`}); }
    if (ratingOrder[deal.rating] > ratingOrder[a.minimumRating]) { eligible = false; reasons.push({pt: `Rating abaixo do mínimo aceito (${a.minimumRating}).`, en: `Rating below the minimum accepted (${a.minimumRating}).`}); }
    if (a.excludedSectors?.some((sector) => fold(deal.sector).includes(fold(sector)))) { eligible = false; reasons.push({pt: "Setor excluído pela política do investidor.", en: "Sector excluded by the investor's policy."}); }
    if (a.requiresSecurity && !deal.secured) { eligible = false; reasons.push({pt: "Exige garantia real; a operação é quirografária.", en: "Requires real security; the deal is unsecured."}); }
    if (a.ventureBacked === true && !deal.ventureBacked) { eligible = false; reasons.push({pt: "Só compra papel de empresa com investidor de equity.", en: "Only buys paper from sponsor-backed companies."}); }
    if (eligible) {
      // Fit: how central the deal sits in the appetite, not how good the deal is.
      const ticketMid = new Decimal(a.ticket.min).plus(a.ticket.max).div(2);
      const halfRange = new Decimal(a.ticket.max).minus(a.ticket.min).div(2).plus(1);
      fit -= Math.round(Math.min(amount.minus(ticketMid).abs().div(halfRange).toNumber(), 1) * 25);
      if (a.preferredSectors?.length && !a.preferredSectors.some((sector) => fold(deal.sector).includes(fold(sector)))) { fit -= 15; reasons.push({pt: "Setor fora da preferência declarada.", en: "Sector outside the stated preference."}); }
      else if (a.preferredSectors?.some((sector) => fold(deal.sector).includes(fold(sector)))) reasons.push({pt: "Setor na preferência declarada.", en: "Sector in the stated preference."});
      fit -= ratingOrder[deal.rating] * 5;
      if (investor.confirmedOn === undefined) { fit -= 10; reasons.push({pt: "Apetite nunca confirmado com o investidor.", en: "Appetite never confirmed with the investor."}); }
      if (reasons.length === 0) reasons.push({pt: "Dentro do apetite declarado em todos os critérios.", en: "Inside the stated appetite on every criterion."});
    } else {
      fit = 0;
    }
    return {investor, fit: Math.max(0, fit), eligible, reasons};
  });
  return entries.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.fit - a.fit || a.investor.name.localeCompare(b.investor.name));
}

/** Synthetic investors for tests and previews. No real institution is described here. */
export const syntheticInvestors: readonly Investor[] = [
  {id: "inv-1", name: "Fundo Alfa Crédito Privado (fictício)", kind: "credit_fund", synthetic: true, confirmedOn: "2026-08-01", appetite: {archetypes: ["growth_expansion", "working_capital", "refinance"], instruments: ["ccb", "debenture_476", "cra"], ticket: {min: "20000000", max: "150000000"}, tenorMonths: {min: 24, max: 84}, minimumRating: "watch", preferredSectors: ["distribuição", "varejo", "alimentos"], requiresSecurity: true}},
  {id: "inv-2", name: "Tesouraria Banco Beta (fictício)", kind: "bank_treasury", synthetic: true, confirmedOn: "2026-07-15", appetite: {archetypes: ["working_capital", "refinance", "equipment_finance"], instruments: ["ccb", "nce", "finame"], ticket: {min: "5000000", max: "80000000"}, tenorMonths: {min: 12, max: 60}, minimumRating: "adequate"}},
  {id: "inv-3", name: "Gama Venture Debt (fictício)", kind: "venture_debt_fund", synthetic: true, confirmedOn: "2026-06-30", appetite: {archetypes: ["venture_debt"], instruments: ["venture_debt", "ccb"], ticket: {min: "5000000", max: "60000000"}, tenorMonths: {min: 18, max: 48}, minimumRating: "watch", ventureBacked: true}},
  {id: "inv-4", name: "Family Office Delta (fictício)", kind: "family_office", synthetic: true, appetite: {archetypes: ["growth_expansion", "refinance", "acquisition"], instruments: ["debenture_476", "cra", "cri"], ticket: {min: "30000000", max: "500000000"}, tenorMonths: {min: 36, max: 120}, minimumRating: "adequate", excludedSectors: ["tabaco", "armas"]}},
  {id: "inv-5", name: "Gestora Épsilon FIDC (fictício)", kind: "fidc_manager", synthetic: true, confirmedOn: "2026-08-10", appetite: {archetypes: ["working_capital"], instruments: ["fidc"], ticket: {min: "20000000", max: "300000000"}, tenorMonths: {min: 12, max: 48}, minimumRating: "weak", requiresSecurity: true}},
];
