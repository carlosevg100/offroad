export type SectorModelPack = {
  id: string;
  sector: string;
  maturity: "implemented" | "homologated" | "expert";
  revenueDrivers: readonly string[];
  costDrivers: readonly string[];
  workingCapitalDrivers: readonly string[];
  capexDrivers: readonly string[];
  macroDrivers: readonly string[];
  downsideTests: readonly string[];
  requiredDisclosures: readonly string[];
  qualityGates: readonly string[];
};

/**
 * Sector packs alter the model's coverage and review requirements. They are not prompt snippets
 * and cannot promote themselves to expert without benchmark cases and human sign-off.
 */
export const sectorModelPacks: readonly SectorModelPack[] = [
  {
    id: "sector.food-consumer-staples.br-v1",
    sector: "food_and_consumer_staples",
    maturity: "implemented",
    revenueDrivers: [
      "volume by category and geography",
      "price and contractual pass-through",
      "product, channel and geography mix",
      "foreign-exchange translation and transaction effects",
      "organic growth separated from acquisitions and disposals",
    ],
    costDrivers: [
      "commodity inputs and hedge coverage",
      "freight, energy, packaging and labor",
      "harvest cycle and inventory-cost lag",
      "gross margin bridge by price, volume, mix and cost",
    ],
    workingCapitalDrivers: [
      "receivable days by channel",
      "inventory days by category and harvest cycle",
      "payable days and supplier financing",
      "quarterly seasonality and peak funding requirement",
    ],
    capexDrivers: [
      "maintenance capex separated from growth capex",
      "capacity, utilization and ramp-up by project",
      "cash disbursement schedule separated from accounting depreciation",
    ],
    macroDrivers: ["IPCA", "CDI", "BRL/USD", "commodity curves", "GDP and food-volume demand"],
    downsideTests: [
      "commodity inflation without full pass-through",
      "volume contraction and adverse mix",
      "BRL depreciation and hedge mismatch",
      "working-capital peak combined with refinancing need",
      "growth-project delay or lower utilization",
    ],
    requiredDisclosures: [
      "category and geography revenue bridge when disclosed",
      "commodity and FX sensitivity",
      "quarterly working-capital pattern",
      "maintenance and expansion capex distinction",
      "debt by instrument, indexer, amortization and guarantee",
    ],
    qualityGates: [
      "aggregate revenue growth cannot replace disclosed category drivers without a visible gap",
      "annual averages cannot hide seasonal liquidity peaks",
      "commodity, FX and hedge assumptions must use dated evidence",
      "growth capex cannot create revenue before the governed ramp-up date",
    ],
  },
];

export function sectorModelPack(id: string): SectorModelPack {
  const found = sectorModelPacks.find((candidate) => candidate.id === id);
  if (!found) throw new RangeError(`unknown sector model pack: ${id}`);
  return found;
}
