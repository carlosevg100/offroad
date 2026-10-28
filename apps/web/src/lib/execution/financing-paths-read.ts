import {capitalPathsPacketOutputSchema} from "@offroad/financial-model";
import {financingPathsPacketBlocks, readFinancingPathsPacketBlocks, type FinancingPathsPacketLike, type FinancingPathsResultBlocksView}
  from "../../../../../packages/domain-contracts/src/lote4-financing-paths-result-blocks";

/** The committed bytes of a financing paths evaluation, read through the same blocks its revision carries. */
export function readFinancingPathsResult(canonicalResult: string): FinancingPathsResultBlocksView | null {
  try {
    const parsed = capitalPathsPacketOutputSchema.safeParse(JSON.parse(canonicalResult));
    return parsed.success ? readFinancingPathsPacketBlocks(financingPathsPacketBlocks(parsed.data as unknown as FinancingPathsPacketLike)) : null;
  } catch { return null; }
}
