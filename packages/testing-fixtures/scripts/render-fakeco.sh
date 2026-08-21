#!/usr/bin/env bash
# Renders the three documents that are not spreadsheets or Word files.
#
# Nothing in this workspace writes a PDF, and a browser already does it properly, so the
# generator emits HTML and this renders it. The contract is deliberately a photograph rather
# than a PDF: that document arrives as a scan in real life, and it is the only thing in the
# room that exercises the OCR path.
set -euo pipefail

B="${HOME}/.claude/skills/gstack/browse/dist/browse"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HTML="${ROOT}/assets/fakeco/.html"
OUT="${ROOT}/assets/fakeco"

"$B" viewport 1240x1754 >/dev/null

"$B" goto "file://${HTML}/02_Demonstracoes_Auditadas_2023_2025.html" >/dev/null
"$B" pdf "${OUT}/02_Demonstracoes_Auditadas_2023_2025.pdf" --format a4 --print-background >/dev/null

"$B" goto "file://${HTML}/06_Memorial_CD_Jacarei.html" >/dev/null
"$B" pdf "${OUT}/06_Memorial_CD_Jacarei.pdf" --format a4 --print-background >/dev/null

# A photograph of a page: the OCR path, at the scale a phone camera produces. The page is
# framed to the paper, because half an image of a desk teaches the OCR nothing and costs the
# vision model the same as text would.
"$B" viewport 860x1120 --scale 2 >/dev/null
"$B" goto "file://${HTML}/07_Contrato_Social_Consolidado.html" >/dev/null
"$B" screenshot "${OUT}/07_Contrato_Social_Consolidado.png" >/dev/null

for f in 02_Demonstracoes_Auditadas_2023_2025.pdf 06_Memorial_CD_Jacarei.pdf 07_Contrato_Social_Consolidado.png; do
  printf '  %-44s %7s bytes\n' "$f" "$(wc -c < "${OUT}/${f}" | tr -d ' ')"
done
