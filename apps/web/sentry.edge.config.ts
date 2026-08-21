import * as Sentry from "@sentry/nextjs";

import {scrubSentryEvent} from "./src/lib/observability/privacy";
import {deploymentEnvironment, deploymentRelease} from "./src/lib/observability/deployment";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: deploymentEnvironment(),
  ...(deploymentRelease() ? {release: deploymentRelease()} : {}),
  sendDefaultPii: false,
  enableLogs: false,
  tracesSampleRate: 0.05,
  maxBreadcrumbs: 20,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,
});
