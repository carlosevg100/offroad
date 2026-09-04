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

# The whole workspace, then install. This used to copy each package's manifest by name, for
# layer caching, and the list went stale the first time a package was added: the worker gained
# a dependency, its manifest was not on the list, and the image failed to build on `main` —
# after review, after merge, in the one place the Dockerfile is exercised. A list that must be
# edited whenever the repository changes is a list that will be wrong. The cost is re-running
# `install` when source changes; the benefit is an image that cannot be broken by adding a
# package.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps/document-worker ./apps/document-worker

RUN pnpm install --frozen-lockfile --filter @offroad/document-worker...

# Two flags, each earning its place:
#
#   --legacy             pnpm 10 otherwise refuses to deploy a workspace whose dependencies
#                        are not declared as injected (ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE);
#                        the alternative would change how the whole monorepo installs, to fix
#                        one container.
#   node-linker=hoisted  the worker ships as a bundle of first-party code with third-party
#                        packages left external, so pdfjs, SheetJS and the provider SDKs have
#                        to resolve from the application root rather than from the isolated
#                        store of whichever package declared them.
RUN pnpm --filter @offroad/document-worker... build \
 && pnpm deploy --legacy --filter @offroad/document-worker --prod --config.node-linker=hoisted /out

# A bundle that cannot start has to fail here, in the build, and not forty minutes later as a
# task that boots and dies in CloudWatch. Started with an empty environment the worker must
# reach configuration validation and complain about missing variables: that means every module
# in the graph resolved. Anything about modules — a package Node cannot find, types it refuses
# to strip — is a packaging error, and it stops the image right here.
RUN out=$(cd /out && env -i PATH="$PATH" HOME=/tmp node dist/main.js 2>&1 || true); \
    printf '%s\n' "$out" | head -3; \
    printf '%s' "$out" | grep -q 'worker configuration is invalid or incomplete' \
      || { echo 'the deployed bundle does not boot — see the output above'; exit 1; }

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
 # Security updates of the base image ship between node image rebuilds; take them every build.
 && apt-get upgrade -y \
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

# Production executes the compiled worker directly with Node. npm and npx are build-time
# tooling only; leaving npm's dependency tree in the runtime image needlessly expands the
# attack surface and has previously reintroduced vulnerable archive and URL parsers through
# the upstream Node base image.
RUN rm -rf /usr/local/lib/node_modules/npm \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx

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
