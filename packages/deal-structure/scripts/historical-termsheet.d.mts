import type {buildTermSheet} from "../src/termsheet";
export const historicalTermSheetSourceCommit:string;
export const historicalTermSheetSnapshotHash:string;
export function loadHistoricalTermSheet():Promise<{buildTermSheet:typeof buildTermSheet}>;
