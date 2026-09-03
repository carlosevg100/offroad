export type EconomicSituationStatus = "pack_available" | "catalogued";

export type EconomicSituationDefinition = {
  key: string;
  labels: {pt: string; en: string};
  family: "liquidity" | "liability_management" | "growth" | "capital_structure" | "asset_backed" | "special_situations" | "shareholder";
  packId: string | null;
  status: EconomicSituationStatus;
};

/**
 * Broad economic-need vocabulary. It is deliberately wider than the first Pareto packs so the
 * classifier can name an uncovered situation without pretending that the platform already owns
 * a homologated procedure for it.
 */
export const economicSituationCatalog = [
  ["concentrated_maturities", "Vencimentos concentrados", "Concentrated maturities", "liability_management", "objective.refinance-liability-management"],
  ["refinancing", "Refinanciamento", "Refinancing", "liability_management", "objective.refinance-liability-management"],
  ["tenor_extension", "Alongamento de prazo", "Tenor extension", "liability_management", "objective.refinance-liability-management"],
  ["repricing", "Reprecificação", "Repricing", "liability_management", "objective.refinance-liability-management"],
  ["debt_exchange_or_buyback", "Troca, recompra ou tender de dívida", "Debt exchange, buyback or tender", "liability_management", "objective.refinance-liability-management"],
  ["covenant_repair", "Recalibragem, waiver ou cura de covenant", "Covenant reset, waiver or cure", "liability_management", "analysis.covenants"],
  ["collateral_reorganization", "Reorganização ou liberação de garantias", "Collateral reorganization or release", "capital_structure", "analysis.collateral-security"],
  ["funding_source_diversification", "Diversificação de fontes", "Funding source diversification", "capital_structure", "objective.refinance-liability-management"],
  ["expensive_debt_replacement", "Substituição de dívida cara ou inadequada", "Replacement of expensive or unsuitable debt", "liability_management", "objective.refinance-liability-management"],
  ["preventive_liquidity", "Liquidez preventiva", "Preventive liquidity", "liquidity", "objective.liquidity-working-capital"],
  ["seasonal_working_capital", "Capital de giro sazonal", "Seasonal working capital", "liquidity", "objective.liquidity-working-capital"],
  ["structural_working_capital", "Capital de giro estrutural", "Structural working capital", "liquidity", "objective.liquidity-working-capital"],
  ["supplier_or_inventory_cycle", "Financiamento de fornecedores ou estoque", "Supplier or inventory financing", "liquidity", "objective.liquidity-working-capital"],
  ["trade_finance", "Comércio exterior", "Trade finance", "liquidity", null],
  ["supply_chain_finance", "Financiamento de cadeia", "Supply-chain finance", "liquidity", null],
  ["maintenance_capex", "Capex de manutenção", "Maintenance capex", "growth", "objective.capex-expansion"],
  ["expansion_capex", "Expansão de capacidade", "Expansion capex", "growth", "objective.capex-expansion"],
  ["greenfield_or_ramp_up", "Greenfield ou ramp-up", "Greenfield or ramp-up", "growth", "objective.capex-expansion"],
  ["digital_or_product_investment", "Investimento digital ou em produto", "Digital or product investment", "growth", "objective.capex-expansion"],
  ["acquisition_finance", "Aquisição", "Acquisition finance", "growth", "objective.acquisition-finance"],
  ["bridge_to_takeout", "Bridge para take-out", "Bridge to take-out", "growth", "objective.acquisition-finance"],
  ["receivables_monetization", "Monetização de recebíveis", "Receivables monetization", "asset_backed", "instrument.br-receivables"],
  ["inventory_or_asset_monetization", "Monetização de estoque ou ativos", "Inventory or asset monetization", "asset_backed", "analysis.collateral-security"],
  ["contract_backed_financing", "Financiamento lastreado em contratos", "Contract-backed financing", "asset_backed", "analysis.collateral-security"],
  ["project_finance", "Project finance", "Project finance", "growth", null],
  ["equipment_fleet_or_real_estate", "Equipamento, frota ou imóvel", "Equipment, fleet or real estate", "asset_backed", null],
  ["dividend_recap", "Dividend recap", "Dividend recap", "shareholder", null],
  ["shareholder_liquidity", "Liquidez de acionista", "Shareholder liquidity", "shareholder", null],
  ["venture_debt", "Venture debt", "Venture debt", "capital_structure", null],
  ["mezzanine_or_subordinated", "Mezanino ou subordinada", "Mezzanine or subordinated debt", "capital_structure", null],
  ["convertible_or_hybrid", "Conversível ou híbrida", "Convertible or hybrid capital", "capital_structure", null],
  ["restructuring_or_reprofiling", "Reestruturação ou reperfilamento", "Restructuring or reprofiling", "special_situations", null],
  ["rescue_or_dip", "Rescue finance ou DIP", "Rescue finance or DIP", "special_situations", null],
] as const satisfies readonly [string, string, string, EconomicSituationDefinition["family"], string | null][];

export const economicSituations: readonly EconomicSituationDefinition[] = economicSituationCatalog.map(
  ([key, pt, en, family, packId]) => ({key, labels: {pt, en}, family, packId, status: packId ? "pack_available" : "catalogued"}),
);
