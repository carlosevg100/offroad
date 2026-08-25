import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

import {isAllowedProductEvent} from "@/lib/observability/events";
import {scrubSentryEvent} from "@/lib/observability/privacy";
import {deploymentEnvironment, deploymentRelease} from "@/lib/observability/deployment";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: deploymentEnvironment(),
    ...(deploymentRelease() ? {release: deploymentRelease()} : {}),
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
    enableLogs: false,
    maxBreadcrumbs: 20,
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryEvent,
  });
}

const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
if (posthogToken) {
  try {
    posthog.init(posthogToken, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      defaults: "2026-05-30",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      person_profiles: "never",
      persistence: "memory",
      // This is a deliberately anonymous product-health stream: no autocapture, replay,
      // persistent identity or free-form properties. DNT still wins. Keeping the SDK opted out
      // here made every allow-listed event below a no-op, so the intake funnel was not measurable.
      opt_out_capturing_by_default: false,
      respect_dnt: true,
      disable_surveys: true,
      before_send(event) {
        return event && isAllowedProductEvent(event.event) ? event : null;
      },
    });
  } catch {
    // Observability must never block the product.
  }
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
