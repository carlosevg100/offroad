import Decimal from "decimal.js";

/**
 * The security package, designed from the inventory instead of listed from the playbook.
 *
 * A term sheet that says "alienação fiduciária de imóveis e cessão de recebíveis" has said
 * nothing a fund can price. What it prices is coverage: eligible value after the haircut the
 * asset class carries, over the ticket, asset by asset, with what is already pledged taken
 * out. This module reads the collateral inventory the room states, applies the desk's policy
 * haircut when the room states none, orders the assets by the quality a lender ranks them in,
 * and picks the smallest package that reaches the coverage the archetype asks for. Every asset
 * says what it adds and what was taken off it.
 */

export type CollateralClass = "receivables" | "inventory" | "property" | "equipment" | "vehicles" | "shares" | "financial" | "guarantee" | "other";

export type CollateralAsset = {
  /** As the room names it. */
  description: string;
  type: CollateralClass;
  /** Book or appraisal value, in reais; the appraisal wins when both exist. */
  value: string;
  /** Whether the value comes from an appraisal report rather than the books. */
  appraised?: boolean;
  /** What is already pledged against this asset, in reais. */
  encumbered?: string;
  /** Haircut the room states; absent → the desk's policy by class. */
  haircut?: string;
};

export type PackageLine = {
  asset: CollateralAsset;
  /** The haircut applied, as a fraction, and where it came from. */
  haircut: string;
  haircutSource: "room" | "policy";
  /** Value after encumbrances and haircut. */
  eligible: string;
  /** The lien the desk would take. */
  lien: {pt: string; en: string};
  selected: boolean;
};

export type CollateralPackage = {
  target: {coverage: string; amount: string; required: string};
  lines: PackageLine[];
  /** Eligible value of the selected lines. */
  coverageAchieved: string;
  eligibleSelected: string;
  sufficient: boolean;
  /** What would close the gap, when the package does not reach the target. */
  shortfall: string | null;
  notes: {pt: string; en: string}[];
};

/**
 * The desk's policy haircuts, by class. Written as data: a credit professional who disagrees
 * changes one number and every package is redesigned the same way.
 */
export const policyHaircuts: Record<CollateralClass, {haircut: string; rank: number; lien: {pt: string; en: string}; whyPt: string; whyEn: string}> = {
  financial: {haircut: "0.05", rank: 1, lien: {pt: "cessão fiduciária de aplicações financeiras", en: "fiduciary assignment of financial investments"}, whyPt: "Liquidez imediata; o desconto cobre apenas a variação de marcação.", whyEn: "Immediate liquidity; the discount covers marking only."},
  receivables: {haircut: "0.30", rank: 2, lien: {pt: "cessão fiduciária de recebíveis, com cobertura mínima e conta vinculada", en: "fiduciary assignment of receivables, with minimum coverage and a blocked account"}, whyPt: "Inadimplência, diluição e concentração; a prática de mercado pede 120% a 150% de cobertura.", whyEn: "Delinquency, dilution and concentration; market practice asks for 120% to 150% coverage."},
  property: {haircut: "0.40", rank: 3, lien: {pt: "alienação fiduciária de imóvel, com laudo", en: "fiduciary lien on property, with an appraisal"}, whyPt: "Tempo e custo de execução; o laudo define a base, a liquidez define o desconto.", whyEn: "Time and cost of enforcement; the appraisal sets the base, liquidity sets the discount."},
  vehicles: {haircut: "0.40", rank: 4, lien: {pt: "alienação fiduciária de veículos, com gravame no Detran", en: "fiduciary lien on vehicles, registered with the vehicle registry"}, whyPt: "Mercado secundário líquido, depreciação rápida.", whyEn: "Liquid secondary market, fast depreciation."},
  equipment: {haircut: "0.50", rank: 5, lien: {pt: "alienação fiduciária de máquinas e equipamentos", en: "fiduciary lien on machinery and equipment"}, whyPt: "Valor de liquidação muito abaixo do contábil quando o bem é específico.", whyEn: "Liquidation value well below book when the asset is specific."},
  inventory: {haircut: "0.50", rank: 6, lien: {pt: "alienação fiduciária de estoques, com monitoramento", en: "fiduciary lien on inventory, with monitoring"}, whyPt: "Gira, perece e some; só entra com monitoramento periódico.", whyEn: "It turns over, perishes and disappears; it enters only with periodic monitoring."},
  shares: {haircut: "0.60", rank: 7, lien: {pt: "alienação fiduciária de quotas ou ações da operadora", en: "fiduciary lien on the operating company's shares"}, whyPt: "Vale o que a empresa vale no dia da execução; é controle, não caixa.", whyEn: "Worth what the company is worth on the day of enforcement; it is control, not cash."},
  guarantee: {haircut: "1.00", rank: 8, lien: {pt: "aval ou fiança dos controladores", en: "personal guarantee of the controlling shareholders"}, whyPt: "Alinha incentivos; não conta como cobertura.", whyEn: "Aligns incentives; does not count as coverage."},
  other: {haircut: "0.70", rank: 9, lien: {pt: "garantia a classificar", en: "security to be classified"}, whyPt: "Classe não reconhecida; entra com desconto de desconhecido até ser nomeada.", whyEn: "Unrecognised class; enters at an unknown's discount until named."},
};

const d = (value: string | number): Decimal => new Decimal(value);

export function designCollateralPackage(input: {assets: CollateralAsset[]; amount: string; coverage?: string}): CollateralPackage {
  const amount = d(input.amount);
  const coverage = d(input.coverage ?? "1.3");
  const required = amount.times(coverage);

  const lines: PackageLine[] = input.assets.map((asset) => {
    const policy = policyHaircuts[asset.type];
    const haircut = asset.haircut !== undefined ? d(asset.haircut) : d(policy.haircut);
    const free = Decimal.max(d(asset.value).minus(d(asset.encumbered ?? "0")), 0);
    return {
      asset,
      haircut: haircut.toFixed(4),
      haircutSource: asset.haircut !== undefined ? "room" : "policy",
      eligible: free.times(new Decimal(1).minus(haircut)).toFixed(2),
      lien: policy.lien,
      selected: false,
    };
  });

  // Best quality first, then the largest eligible value: the package a lender signs is the one
  // with the fewest, most liquid liens, not the one with everything pledged.
  const ordered = [...lines].sort((a, b) => policyHaircuts[a.asset.type].rank - policyHaircuts[b.asset.type].rank || d(b.eligible).minus(a.eligible).toNumber());
  let running = new Decimal(0);
  for (const line of ordered) {
    if (running.gte(required)) break;
    if (d(line.eligible).lte(0)) continue;
    line.selected = true;
    running = running.plus(line.eligible);
  }
  const sufficient = running.gte(required);
  const notes: {pt: string; en: string}[] = [];
  const unappraised = lines.filter((line) => line.selected && (line.asset.type === "property" || line.asset.type === "equipment") && !line.asset.appraised);
  if (unappraised.length > 0) {
    notes.push({
      pt: `${unappraised.length} ativo(s) entram pelo valor contábil sem laudo: ${unappraised.map((line) => line.asset.description).join(", ")}. Um laudo muda a base e costuma mudar a cobertura.`,
      en: `${unappraised.length} asset(s) enter at book value without an appraisal: ${unappraised.map((line) => line.asset.description).join(", ")}. An appraisal changes the base and usually the coverage.`,
    });
  }
  const guaranteeOnly = lines.some((line) => line.asset.type === "guarantee");
  if (guaranteeOnly) notes.push({pt: "Aval dos controladores acompanha o pacote e não conta como cobertura.", en: "The controllers' guarantee accompanies the package and does not count as coverage."});
  if (!sufficient) {
    notes.push({
      pt: `O inventário cobre ${running.div(amount).toFixed(2).replace(".", ",")}x do pedido contra ${coverage.toFixed(2).replace(".", ",")}x exigidos: faltam ${required.minus(running).toFixed(0)} de valor elegível. Ou a empresa nomeia outro ativo, ou o tíquete cai, ou a cobertura se completa com garantia de terceiro.`,
      en: `The inventory covers ${running.div(amount).toFixed(2)}x of the ask against ${coverage.toFixed(2)}x required: ${required.minus(running).toFixed(0)} of eligible value is missing. Either the company names another asset, the ticket comes down, or a third-party guarantee completes the coverage.`,
    });
  }
  return {
    target: {coverage: coverage.toFixed(4), amount: amount.toFixed(2), required: required.toFixed(2)},
    lines: ordered,
    coverageAchieved: amount.gt(0) ? running.div(amount).toFixed(4) : "0",
    eligibleSelected: running.toFixed(2),
    sufficient,
    shortfall: sufficient ? null : required.minus(running).toFixed(2),
    notes,
  };
}
