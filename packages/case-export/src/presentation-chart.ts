import type {DecisionArtifactContract} from "@offroad/case-understanding";
import {zipStored} from "./zip";
type Series = NonNullable<DecisionArtifactContract["series"]>[number];
const x = (v: string) => v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** The measure is what the series is called; the unit qualifies it. Never the other way around. */
function seriesName(series: Series): string {
  const label = series.label?.trim();
  if (!label) return series.unit ?? "Value";
  return series.unit ? `${label} (${series.unit})` : label;
}

/** Palette a chart is drawn with. Defaults are the Offroad house colours. */
export type ChartPalette = {accent: string; danger: string; gridline: string};
const houseChartPalette: ChartPalette = {accent: "7D9455", danger: "A23B3B", gridline: "E5E8E3"};
const hex = (value: string) => {
  const normalized = value.replace(/^#/, "").toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(normalized)) throw new Error(`invalid chart color ${value}`);
  return normalized;
};

/** Native Office chart data is copied from governed series, never recomputed by the renderer. */
export function chartWorkbook(series: Series): Uint8Array {
  const str = (ref: string, value: string) => `<c r="${ref}" t="inlineStr"><is><t>${x(value)}</t></is></c>`;
  const rows = `<row r="1">${str("A1", "Period")}${str("B1", seriesName(series))}</row>` + series.points.map((point,i) => `<row r="${i+2}">${str(`A${i+2}`,point.label)}${point.value === null ? "" : `<c r="B${i+2}"><v>${point.value}</v></c>`}</row>`).join("");
  return zipStored([
    {name:"[Content_Types].xml",data:`${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`},
    {name:"_rels/.rels",data:`${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {name:"xl/workbook.xml",data:`${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`},
    {name:"xl/_rels/workbook.xml.rels",data:`${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`},
    {name:"xl/worksheets/sheet1.xml",data:`${head}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`},
  ]);
}

export function nativeChartXml(series: Series, palette: ChartPalette = houseChartPalette): string {
  const accent=hex(palette.accent), danger=hex(palette.danger), gridline=hex(palette.gridline);
  const count=series.points.length;
  const cat=`<c:cat><c:strRef><c:f>Data!$A$2:$A$${count+1}</c:f><c:strCache><c:ptCount val="${count}"/>${series.points.map((p,i)=>`<c:pt idx="${i}"><c:v>${x(p.label)}</c:v></c:pt>`).join("")}</c:strCache></c:strRef></c:cat>`;
  const val=`<c:val><c:numRef><c:f>Data!$B$2:$B$${count+1}</c:f><c:numCache><c:formatCode>#,##0.##;(#,##0.##);–</c:formatCode><c:ptCount val="${count}"/>${series.points.map((p,i)=>p.value===null?"":`<c:pt idx="${i}"><c:v>${p.value}</c:v></c:pt>`).join("")}</c:numCache></c:numRef></c:val>`;
  const line=series.chartKind==="line";
  const chartTag=line?"lineChart":"barChart";
  const ser=`<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${x(seriesName(series))}</c:v></c:tx><c:spPr>${line?`<a:ln w="28575"><a:solidFill><a:srgbClr val="${accent}"/></a:solidFill></a:ln>`:`<a:solidFill><a:srgbClr val="${accent}"/></a:solidFill>`}</c:spPr>${!line?'<c:invertIfNegative val="0"/>':""}${!line?series.points.map((p,i)=>p.value!==null&&p.value<0?`<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:spPr><a:solidFill><a:srgbClr val="${danger}"/></a:solidFill></c:spPr></c:dPt>`:"").join(""):""}${cat}${val}${line?'<c:smooth val="0"/>':""}</c:ser>`;
  // The unit travels with the value axis, so the chart still states it when pasted elsewhere.
  const unitTitle=series.unit?`<c:title><c:tx><c:rich><a:bodyPr rot="-5400000" vert="horz"/><a:lstStyle/><a:p><a:r><a:rPr lang="pt-BR" sz="900"/><a:t>${x(series.unit)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`:"";
  return `${head}<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/><c:${chartTag}>${line?'<c:grouping val="standard"/>':`<c:barDir val="${series.chartKind==="bar"?"bar":"col"}"/><c:grouping val="clustered"/>`}${ser}<c:axId val="101"/><c:axId val="102"/></c:${chartTag}><c:catAx><c:axId val="101"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="${series.chartKind==="bar"?"l":"b"}"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:crossAx val="102"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/></c:catAx><c:valAx><c:axId val="102"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="${series.chartKind==="bar"?"b":"l"}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="${gridline}"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>${unitTitle}<c:numFmt formatCode="#,##0.##;(#,##0.##);–" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="101"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
}
export const nativeChartFrame = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="10" name="Editable governed chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="610000" y="1800000"/><a:ext cx="10950000" cy="4300000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId3"/></a:graphicData></a:graphic></p:graphicFrame>';
