# GC-02 reference products

This directory is the governed reference output for the public-company CFO journey in GC-02. It
does not claim that the product is complete or that the analysis is ready for a live board. It
defines the minimum quality bar for the same economic case across structured objects, a financial
model and a board presentation.

## Files

- `gc02-reference-snapshot.json`: canonical machine-readable state. Its fingerprint changes when
  facts, assumptions, calculations, evidence states, coverage gaps or options change.
- `gc02-decision-artifact-contract.json`: cross-surface identity contract. It binds the claims
  displayed in the conversation, workbook and presentation to signed object paths and records
  source, premise and gap lineage plus the immutable Office file hashes.
- `GC02_Camil_Modelo_Conselho_v1.xlsx`: formula-driven model with one scenario selector, editable
  assumptions, debt service by instrument, liquidity and leverage projections, alternatives,
  sources and terminal checks.
- `GC02_Camil_Estrutura_Capital_Conselho_v1.pptx`: nine-page board discussion deck generated from
  the same snapshot. Charts and tables remain editable.
- `build-reference-products.mjs`: deterministic builder for both files.

## Evidence boundary

The public Camil evidence is frozen at 31 May 2026 and market inputs at 4 September 2026. The
management budget, capex plan, minimum cash policy and contractual amortization schedule are
synthetic fixtures. They exist only to exercise the product workflow and are labelled as such in
the workbook and presentation.

The model can diagnose the current debt and run declared scenarios. It cannot yet recommend or
rank a structure because contractual covenant definitions, exit costs, an observable forward DI
curve, tax treatment, an integrated operating model and intraperiod liquidity remain open.

## Economic conventions

- Contractual principal is reconciled to accounting debt through transaction costs.
- IPCA updates principal for the inflation-linked bullet series; the coupon remains cash paid.
- Refinanced principal is assumed bullet beyond the explicit horizon and starts paying interest in
  the following period.
- Operational liquidity starts with cash and cash equivalents. Financial investments deductible
  under the reported covenant are kept separate until their availability is evidenced.
- DSCR, interest coverage and liquidity coverage are separate metrics.
- Negative closing cash is shown as a funding deficit. The model does not invent an automatic
  revolver or rank a solution.

## Promotion gate

The reference is acceptable only when all of the following hold:

1. the snapshot tests and package typecheck pass;
2. the workbook contains no formula errors and its terminal reconciliations are within tolerance;
3. the deck passes package, layout, font, native chart and native table validation;
4. every slide is rendered and inspected visually;
5. headline numbers agree with the workbook and snapshot;
6. evidence gaps and synthetic inputs remain visible wherever they affect a conclusion.

Changing the case requires regenerating the snapshot before rebuilding the files. Manual edits to
the final workbook or deck do not change the canonical state and therefore do not qualify as a new
reference version.
