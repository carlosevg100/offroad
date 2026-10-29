import {z} from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const role = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const pin = z.object({role, methodId: z.string().min(1).max(80), executionId: z.uuid(), resultFingerprint: hash, moneyScale: z.enum(["reais", "millions"])}).strict();
/** The reviewed results a board material card (C47) was proposed over, in the order its basis names them. */
const pinsSchema = z.array(pin).min(1).max(16);
export type BoardMaterialPins = z.infer<typeof pinsSchema>;
/** The latest completed execution the server returns for each role. */
export type BoardMaterialLatest = {role: string; methodId: string; executionId: string; resultFingerprint: string; moneyScale: "reais" | "millions" | null};

/** The card pins the exact executions and packets it showed. Confirmation goes ahead only when, for every pinned role,
 * the latest completed execution is that same execution with that same packet, and no role is pinned twice; a newer
 * result of any source makes the card superseded and asks for a new one. It never moves silently to other results.
 * A source that was not executed when the card was proposed and has been since does not supersede it: the card says
 * it was left out, and the person may ask again. */
export function checkBoardMaterialPins(summary: Record<string, unknown>, latest: readonly BoardMaterialLatest[]): {ok: true; pins: BoardMaterialPins} | {ok: false; error: "superseded"} {
  const parsed = pinsSchema.safeParse(summary.boardSources);
  if (!parsed.success || new Set(parsed.data.map((p) => p.role)).size !== parsed.data.length) return {ok: false, error: "superseded"};
  for (const p of parsed.data) {
    const now = latest.filter((x) => x.role === p.role);
    if (now.length !== 1 || now[0]!.executionId !== p.executionId || now[0]!.resultFingerprint !== p.resultFingerprint || now[0]!.methodId !== p.methodId
      // The scale the card was read in is the one the database records now for the method; anything else asks for a new card.
      || now[0]!.moneyScale !== p.moneyScale) return {ok: false, error: "superseded"};
  }
  return {ok: true, pins: parsed.data};
}
