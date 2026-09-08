import type {DecisionArtifactContract} from "@offroad/case-understanding";
import {formatPreviewNumber} from "./preview-value-format";

type Props = {
  series: NonNullable<DecisionArtifactContract["series"]>[number];
  locale: "pt-BR" | "en-US";
};

const ink = "var(--ink, #151a20)";
const muted = "var(--muted, #707984)";
const accent = "var(--accent, #7d9455)";

/** Decorative projection of the parent's accessible table. Numbers are used only
 * for plot geometry; no unit conversion, interpolation across gaps or imputation.
 */
export function DecisionSeriesChart({series, locale}: Props) {
  const points = series.points;
  if (points.length === 0) return null;
  const numeric = points.flatMap(({value}) => value !== null && Number.isFinite(value) ? [value] : []);
  if (numeric.length === 0) return null;
  // Normalize before subtracting bounds so opposite-sign finite extremes cannot overflow.
  const magnitude = numeric.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0) || 1;
  const low = Math.min(0, ...numeric.map((value) => value / magnitude));
  const high = Math.max(0, ...numeric.map((value) => value / magnitude));
  const span = high - low || 1;
  const horizontal = series.chartKind === "bar";
  const width = 640;
  const height = horizontal ? Math.max(160, Math.min(640, points.length * 48 + 40)) : 288;
  const left = horizontal ? 160 : 56;
  const right = 76;
  const top = 26;
  const bottom = horizontal ? 24 : 72;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xValue = (value: number) => left + ((value / magnitude - low) / span) * plotWidth;
  const yValue = (value: number) => top + ((high - value / magnitude) / span) * plotHeight;
  const baseline = horizontal ? xValue(0) : yValue(0);
  const slot = (horizontal ? plotHeight : plotWidth) / points.length;
  const center = (index: number) => (horizontal ? top : left) + slot * (index + 0.5);
  const categoryStride = Math.ceil(points.length / (horizontal ? 12 : 6));
  const showValues = points.length <= 4 && numeric.every((value) => formatPreviewNumber(value, locale).length <= 12);
  const label = (value: number) => `${formatPreviewNumber(value, locale)}${series.unit ? ` ${series.unit}` : ""}`;
  // Separate paths at missing values. A null between two observations is not a trend line.
  const segments: string[] = [];
  let segment = "";
  if (series.chartKind === "line") {
    points.forEach((point, index) => {
      if (point.value === null || !Number.isFinite(point.value)) {
        if (segment) segments.push(segment);
        segment = "";
      } else {
        segment += `${segment ? " L" : "M"}${center(index)},${yValue(point.value)}`;
      }
    });
    if (segment) segments.push(segment);
  }

  return <svg className="decision-series-chart" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false" style={{display: "block", width: "100%", height: "auto", overflow: "hidden", fontFamily: "inherit"}}>
    <line x1={horizontal ? baseline : left} x2={horizontal ? baseline : width - right} y1={horizontal ? top : baseline} y2={horizontal ? height - bottom : baseline} stroke={muted} strokeOpacity={0.45} />
    {segments.map((path, index) => <path key={index} d={path} fill="none" stroke={accent} strokeWidth={2.5} />)}
    {points.map((point, index) => {
      const valid = point.value !== null && Number.isFinite(point.value);
      const value = valid ? point.value as number : null;
      const categoryPosition = center(index);
      const position = value === null ? null : horizontal ? xValue(value) : yValue(value);
      const thickness = Math.min(horizontal ? 22 : 48, slot * 0.6);
      return <g key={index} data-point-state={value === null ? "missing" : "value"}>
        <title>{`${point.label}${value === null ? "" : `: ${label(value)}`}`}</title>
        {position !== null && (series.chartKind === "line" ? <circle cx={categoryPosition} cy={position} r={3.5} fill={accent} /> :
          <rect x={horizontal ? Math.min(position, baseline) : categoryPosition - thickness / 2} y={horizontal ? categoryPosition - thickness / 2 : Math.min(position, baseline)} width={horizontal ? Math.abs(position - baseline) : thickness} height={horizontal ? thickness : Math.abs(position - baseline)} rx={2} fill={accent} />)}
        {position !== null && value === 0 && series.chartKind !== "line" ? <line x1={horizontal ? baseline : categoryPosition - thickness / 2} x2={horizontal ? baseline : categoryPosition + thickness / 2} y1={horizontal ? categoryPosition - thickness / 2 : baseline} y2={horizontal ? categoryPosition + thickness / 2 : baseline} stroke={accent} strokeWidth={2} /> : null}
        {index % categoryStride === 0 ? <text x={horizontal ? left - 12 : categoryPosition} y={horizontal ? categoryPosition + 4 : height - bottom + 20} textAnchor={horizontal ? "end" : "middle"} fill={muted} fontSize={11}>
          {point.label.length > (horizontal ? 22 : 16) ? `${point.label.slice(0, horizontal ? 21 : 15)}…` : point.label}
        </text> : null}
        {showValues ? <text x={horizontal ? (position ?? baseline) + (value !== null && value < 0 ? -8 : 8) : categoryPosition} y={horizontal ? categoryPosition + 4 : position === null ? baseline - 10 : position + (value !== null && value < 0 ? 18 : -10)} textAnchor={horizontal ? value !== null && value < 0 ? "end" : "start" : "middle"} fill={ink} fontSize={11}>
          {value === null ? "—" : formatPreviewNumber(value, locale)}
        </text> : null}
      </g>;
    })}
  </svg>;
}
