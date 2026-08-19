# syntax=docker/dockerfile:1.7
#
# Document worker image (P1 plan §13, D-003: AWS ECS Fargate, sa-east-1).
#
# The container is the isolation boundary for hostile documents: it holds no tenant
# credential, no service-role key and no long-lived storage token, and everything it touches
# arrives through a short-lived signed URL. What it *does* carry are the three programs the
# parsers need from the outside world — LibreOffice to convert legacy Office files, Tesseract
# to read scans, poppler to rasterise PDF pages — plus ClamAV, which every file passes before
# a parser sees it.

# ---------------------------------------------------------------------------------------
# Build: compile the workspace with the exact lockfile
# ---------------------------------------------------------------------------------------
FROM node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /repo

# Manifests first, so a change to source code does not re-resolve the dependency graph.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY apps/document-worker/package.json apps/document-worker/
COPY packages/credit-ontology/package.json packages/credit-ontology/
COPY packages/document-intelligence/package.json packages/document-intelligence/
COPY packages/document-parsers/package.json packages/document-parsers/
COPY packages/model-gateway/package.json packages/model-gateway/
COPY packages/domain-contracts/package.json packages/domain-contracts/
COPY packages/financial-core/package.json packages/financial-core/
COPY packages/evidence-compiler/package.json packages/evidence-compiler/
COPY packages/matching-core/package.json packages/matching-core/
COPY packages/testing-fixtures/package.json packages/testing-fixtures/

RUN pnpm install --frozen-lockfile --filter @offroad/document-worker...

COPY packages ./packages
COPY apps/document-worker ./apps/document-worker

RUN pnpm --filter @offroad/document-worker... build \
 && pnpm deploy --filter @offroad/document-worker --prod /out

# ---------------------------------------------------------------------------------------
# Runtime: Node plus the document tooling and the virus scanner
# ---------------------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=3072 \
    SOFFICE_BIN=/usr/bin/soffice \
    TESSERACT_BIN=/usr/bin/tesseract \
    PDFTOPPM_BIN=/usr/bin/pdftoppm \
    CLAMD_HOST=127.0.0.1 \
    CLAMD_PORT=3310 \
    HOME=/tmp

# libreoffice-{writer,calc,impress} rather than the full suite: the worker converts documents,
# spreadsheets and decks and needs nothing else. Language packs for OCR are por + eng, which
# is what this market sends.
RUN apt-get update \
 && apt-get install --no-install-recommends -y \
      libreoffice-writer \
      libreoffice-calc \
      libreoffice-impress \
      libreoffice-java-common \
      default-jre-headless \
      fonts-liberation \
      fonts-dejavu-core \
      tesseract-ocr \
      tesseract-ocr-por \
      tesseract-ocr-eng \
      poppler-utils \
      clamav \
      clamav-daemon \
      ca-certificates \
      tini \
 && rm -rf /var/lib/apt/lists/*

# Virus definitions are baked into the image so a cold task can scan immediately; the
# entrypoint refreshes them in the background afterwards.
RUN freshclam --quiet || true

# clamd listens on loopback only: nothing outside the task can reach it.
RUN printf '%s\n' \
      'TCPSocket 3310' \
      'TCPAddr 127.0.0.1' \
      'LocalSocket /run/clamav/clamd.ctl' \
      'StreamMaxLength 128M' \
      'MaxFileSize 128M' \
      'MaxScanSize 512M' \
      'User clamav' \
      'Foreground false' \
      'LogSyslog false' \
    > /etc/clamav/clamd.conf \
 && mkdir -p /run/clamav && chown clamav:clamav /run/clamav

WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /out/package.json ./package.json
COPY apps/document-worker/docker-entrypoint.sh /usr/local/bin/document-worker-entrypoint
RUN chmod +x /usr/local/bin/document-worker-entrypoint

# The worker itself never needs root. LibreOffice and Tesseract run as this user too, so a
# document that manages to exploit one of them lands as an unprivileged account in a
# container with no credentials and no network route to anything of ours.
RUN useradd --system --create-home --home-dir /home/worker --shell /usr/sbin/nologin worker \
 && chown -R worker:worker /app

# Fails the task if clamd stops answering: a worker that cannot scan must not keep claiming.
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD node -e "require('net').connect(3310,'127.0.0.1').on('connect',p=>process.exit(0)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/document-worker-entrypoint"]
CMD ["node", "dist/main.js"]
