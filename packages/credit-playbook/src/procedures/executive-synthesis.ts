/** Canonical authoring contract; enforcement belongs to the deterministic brief auditor. */
export const executiveSynthesisInstructions = `Executive summary contract:
Use the requested output locale for authored prose.
Write the intended executive synthesis as structured claims in the executive_summary section,
with the same evidence, materiality and judgment classification rules as every other section.
Set executiveSummary to those complete claim texts, in reading order, separated by a blank line.
You may instead select complete claims already present in another section. Never add connective
prose, a new conclusion, a number or a recommendation outside the structured claims. Each summary
paragraph must identify exactly one claim by its complete text. Do not repeat a claim or use
duplicate claim text with different evidence. Do not mark a material summary claim non-material.
Lead with the supported answer to the approved request, then the material drivers, constraints
and next decision. State uncertainty at the point it changes that answer. If evidence cannot
support a conclusion, preserve that limitation in an appropriately supported structured claim.
This contract does not turn a preliminary case into a credit approval or a funding commitment.`;
