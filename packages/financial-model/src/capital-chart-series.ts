import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";
import {capitalProcedurePacketOutputSchema} from "./capital-procedure-packet";
import {capitalProcedurePacketV2OutputSchema} from "./capital-procedure-packet-v2";

/**
 * Chart series of the capital decision, derived deterministically from the packet the published
 * executor returns (`capital-procedure-packet.v2`; the v1 packet has the same decision shape and
 * is accepted too).
 *
 * Section T3 of `prepare-capital-structure-decision.md` as a contract: one question per piece, the
 * decisive number with the packet path it comes from, one reference line (a limit or zero, as a
 * code plus a number) and a role per point. There is no field for colour, dash style, line style
 * or size, and every object is strict, so red, dotted lines and thumbnails cannot be expressed:
 * a later renderer maps the roles to graphite (focus), olive (candidate) and grey (context). The
 * conclusion is a code with numbers, never a sentence: the renderer maps each code to a catalogue
 * string the founder approves, because new content sentences are the founder's act.
 *
 * Nothing is estimated. A point exists only where the packet carries a calculated row, its value
 * is the packet value at `path`, and an alternative without calculated rows yields no piece, only
 * an omission with its reason code and the gaps bound to it. Paths are relative to the packet root.
 *
 * Initial pieces, one per question for each alternative with calculated rows, in packet order:
 * - `lowest_available_cash_by_period`: `rows[].closingAvailable` against zero.
 * - `largest_net_financing_outflow_by_period`: `rows[].netFinancingAvailable` against zero. The rows
 *   carry financing net per account (draws netted against interest, principal and cash-paid
 *   charges), not gross debt service, so the piece plots that net flow as the packet states it.
 *
 * Roles: every point of the recommended alternative is `focus`; every other point is `candidate`.
 * `context` is reserved for later pieces (a prior state in a "what if", a sensitivity).
 *
 * Evidence state, first rule that applies:
 * 1. a gap bound to the alternative: `preview_with_gap`;
 * 2. hypotheses behind the projection, or conditional reviews in the packet: `conditional_on_hypothesis`;
 * 3. packet status `prepared_for_human_review`: `complete_in_verified_scope`;
 * 4. otherwise (pending reviews keep the packet partial): `preview_with_gap`.
 * A gap is bound to an alternative when it is decision-wide (null subject), names the alternative,
 * or names one of its ratios or contracts. Identities are free-form keys, so a collision across
 * kinds binds a gap to more than one piece; showing it twice is the safe direction.
 */
export const capitalChartSeriesVersion = "2026.09.24-v1";

export const capitalChartQuestionCodes = ["lowest_available_cash_by_period", "largest_net_financing_outflow_by_period"] as const;
export const capitalChartPointRoles = ["focus", "candidate", "context"] as const;
export const capitalChartReferenceCodes = ["zero"] as const;
export const capitalChartConclusionCodes = ["minimum_below_reference", "minimum_at_reference", "minimum_above_reference"] as const;
export const capitalChartEvidenceStates = ["preview_with_gap", "conditional_on_hypothesis", "complete_in_verified_scope"] as const;
export const capitalChartOmissionCodes = ["projection_rows_absent", "projection_rows_empty"] as const;
export const capitalChartGapOrigins = ["information", "contractual"] as const;

export type CapitalChartQuestionCode = (typeof capitalChartQuestionCodes)[number];
export type CapitalChartPointRole = (typeof capitalChartPointRoles)[number];
export type CapitalChartEvidenceState = (typeof capitalChartEvidenceStates)[number];

/** The row field each question plots. */
const questionFields = {
  lowest_available_cash_by_period: "closingAvailable",
  largest_net_financing_outflow_by_period: "netFinancingAvailable",
} as const satisfies Record<CapitalChartQuestionCode, string>;

const key = z.string().min(1);
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
/** A packet path in dot and bracket notation, such as `decision.alternatives[0].projection`. */
export const capitalPacketPathSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*|\[\d+\])*$/);

const gapSchema = z.strictObject({origin: z.enum(capitalChartGapOrigins), subjectId: key.nullable(), code: key});

export const capitalChartPointSchema = z.strictObject({
  periodLabel: key,
  value: decimal,
  role: z.enum(capitalChartPointRoles),
  sourceIds: z.array(key).min(1),
  path: capitalPacketPathSchema,
});

export const capitalChartPieceSchema = z.strictObject({
  pieceId: key,
  questionCode: z.enum(capitalChartQuestionCodes),
  alternativeId: key,
  /** A currency code or `ratio`. */
  unit: z.union([z.string().regex(/^[A-Z]{3}$/), z.literal("ratio")]),
  points: z.array(capitalChartPointSchema).min(1),
  reference: z.strictObject({code: z.enum(capitalChartReferenceCodes), value: decimal}),
  decisiveNumber: z.strictObject({path: capitalPacketPathSchema, value: decimal}),
  conclusion: z.strictObject({
    code: z.enum(capitalChartConclusionCodes),
    values: z.strictObject({periodLabel: key, value: decimal, periodsBelowReference: z.number().int().nonnegative()}),
  }),
  evidenceState: z.enum(capitalChartEvidenceStates),
  /** Material gaps stay in the piece (T3). */
  gaps: z.array(gapSchema),
  /** Hypotheses behind the numbers stay in the piece (T3). */
  hypothesisIds: z.array(z.uuid()),
});

const omissionSchema = z.strictObject({alternativeId: key, reasonCode: z.enum(capitalChartOmissionCodes), gaps: z.array(gapSchema)});

const bodyShape = {
  schemaVersion: z.literal("capital-chart-series.v1"),
  version: z.literal(capitalChartSeriesVersion),
  packet: z.strictObject({
    schemaVersion: z.enum(["capital-procedure-packet.v1", "capital-procedure-packet.v2"]),
    status: z.enum(["framed", "partial", "prepared_for_human_review"]),
    fingerprint: hash,
  }),
  recommendedAlternativeId: key.nullable(),
  pieces: z.array(capitalChartPieceSchema),
  omissions: z.array(omissionSchema),
};
const bodySchema = z.strictObject(bodyShape);
export const capitalChartSeriesSchema = z.strictObject({...bodyShape, fingerprint: hash});

export type CapitalChartPoint = z.infer<typeof capitalChartPointSchema>;
export type CapitalChartPiece = z.infer<typeof capitalChartPieceSchema>;
export type CapitalChartSeries = z.infer<typeof capitalChartSeriesSchema>;

const packetSchema = z.discriminatedUnion("schemaVersion", [capitalProcedurePacketOutputSchema, capitalProcedurePacketV2OutputSchema]);
type Packet = z.infer<typeof packetSchema>;
type Gap = z.infer<typeof gapSchema>;

const Exact = Decimal.clone({precision: 100, rounding: Decimal.ROUND_HALF_UP});
const referenceValue = "0";

export function deriveCapitalChartSeries(raw: unknown): CapitalChartSeries {
  const packet = packetSchema.parse(raw);
  const decision = packet.decision;
  const recommendedAlternativeId = decision.recommendation?.alternativeId ?? null;
  const pieces: CapitalChartPiece[] = [];
  const omissions: z.infer<typeof omissionSchema>[] = [];
  decision.alternatives.forEach((alternative, alternativeIndex) => {
    const projection = alternative.projection;
    const gaps = gapsBoundTo(packet, alternative.id);
    if (projection.rows === null || projection.rows.length === 0) {
      omissions.push({alternativeId: alternative.id, reasonCode: projection.rows === null ? "projection_rows_absent" : "projection_rows_empty", gaps});
      return;
    }
    const rows = projection.rows;
    const role: CapitalChartPointRole = alternative.id === recommendedAlternativeId ? "focus" : "candidate";
    const evidenceState = evidenceStateOf(packet, gaps, projection.hypothesisIds);
    for (const questionCode of capitalChartQuestionCodes) {
      const field = questionFields[questionCode];
      const points: CapitalChartPoint[] = rows.map((row, rowIndex) => ({
        periodLabel: row.periodId,
        value: row[field],
        role,
        sourceIds: [projection.basisFingerprint, projection.calculationFingerprint],
        path: `decision.alternatives[${alternativeIndex}].projection.rows[${rowIndex}].${field}`,
      }));
      const decisive = lowest(points);
      const position = new Exact(decisive.value).cmp(referenceValue);
      pieces.push({
        pieceId: `${questionCode}:${alternative.id}`,
        questionCode,
        alternativeId: alternative.id,
        unit: projection.currency,
        points,
        reference: {code: "zero", value: referenceValue},
        decisiveNumber: {path: decisive.path, value: decisive.value},
        conclusion: {
          code: position < 0 ? "minimum_below_reference" : position === 0 ? "minimum_at_reference" : "minimum_above_reference",
          values: {
            periodLabel: decisive.periodLabel,
            value: decisive.value,
            periodsBelowReference: points.filter((point) => new Exact(point.value).lt(referenceValue)).length,
          },
        },
        evidenceState,
        gaps,
        hypothesisIds: [...projection.hypothesisIds],
      });
    }
  });
  const body = bodySchema.parse({
    schemaVersion: "capital-chart-series.v1",
    version: capitalChartSeriesVersion,
    packet: {schemaVersion: packet.schemaVersion, status: packet.status, fingerprint: packet.fingerprint},
    recommendedAlternativeId,
    pieces,
    omissions,
  });
  return capitalChartSeriesSchema.parse({...body, fingerprint: createHash("sha256").update(JSON.stringify(body)).digest("hex")});
}

/** The first point with the lowest value, so ties resolve to the earliest period. */
function lowest(points: readonly CapitalChartPoint[]): CapitalChartPoint {
  return points.reduce((low, point) => (new Exact(point.value).lt(low.value) ? point : low));
}

function gapsBoundTo(packet: Packet, alternativeId: string): Gap[] {
  const ratioOwners = new Map(packet.decision.ratios.map((ratio) => [ratio.id, ratio.alternativeId]));
  const contractOwners = new Map(packet.contracts.map((contract) => [contract.id, contract.alternativeId]));
  const information = packet.decision.informationGaps
    .filter((gap) => gap.subjectId === null || gap.subjectId === alternativeId || ratioOwners.get(gap.subjectId) === alternativeId)
    .map((gap): Gap => ({origin: "information", subjectId: gap.subjectId, code: gap.code}));
  const contractual = packet.contractualGaps
    .filter((gap) => contractOwners.get(gap.subjectId) === alternativeId || ratioOwners.get(gap.subjectId) === alternativeId)
    .map((gap): Gap => ({origin: "contractual", subjectId: gap.subjectId, code: gap.code}));
  return [...information, ...contractual];
}

function evidenceStateOf(packet: Packet, gaps: readonly Gap[], hypothesisIds: readonly string[]): CapitalChartEvidenceState {
  if (gaps.length > 0) return "preview_with_gap";
  if (hypothesisIds.length > 0 || packet.decision.conditionalReviews.length > 0) return "conditional_on_hypothesis";
  if (packet.status === "prepared_for_human_review") return "complete_in_verified_scope";
  return "preview_with_gap";
}
