#!/usr/bin/env bash
# The scanned room: Aurora's statements, debt map and articles as a scanner or a phone produces
# them. Image-only PDFs carry no text layer, so every number has to come through OCR, which is
# the path this room exists to measure.
set -euo pipefail

CHROME="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HTML="${ROOT}/assets/fakeco/.html"
OUT="${ROOT}/assets/fakeco-scan"
TMP="$(mktemp -d)"
mkdir -p "$OUT"

shoot() { # html -> png (a4 proportion at 150 dpi: 1240x1754, tall enough for the page)
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1240,1754 --screenshot="$2" "file://$1" >/dev/null 2>&1
}
wrap() { # png -> image-only pdf via a page that holds nothing but the image
  local html="$TMP/$(basename "$1" .png).html"
  printf '<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:0}body{margin:0}img{width:210mm;display:block;filter:contrast(0.92) brightness(1.03) blur(0.2px);transform:rotate(0.35deg)}</style></head><body><img src="file://%s"></body></html>' "$1" > "$html"
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="$2" "file://$html" >/dev/null 2>&1
}

shoot "${HTML}/02_Demonstracoes_Auditadas_2023_2025.html" "$TMP/dfs.png"
wrap "$TMP/dfs.png" "${OUT}/02_Demonstracoes_Auditadas_2023_2025_digitalizado.pdf"
shoot "${HTML}/04_Mapa_Divida_Jul2026.html" "$TMP/mapa.png"
wrap "$TMP/mapa.png" "${OUT}/04_Mapa_Divida_Jul2026_digitalizado.pdf"
cp "${ROOT}/assets/fakeco/07_Contrato_Social_Consolidado.png" "${OUT}/07_Contrato_Social_Consolidado.png"
rm -rf "$TMP"
for f in "$OUT"/*; do printf '  %-52s %8s bytes\n' "$(basename "$f")" "$(wc -c < "$f" | tr -d ' ')"; done
