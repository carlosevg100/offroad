import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import {withSentryConfig} from "@sentry/nextjs";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  /**
   * Browser source maps are served, so a stack trace from a real user is readable.
   *
   * Sentry symbolicates a minified trace one of two ways: somebody uploads the maps with a
   * write token, or Sentry fetches the script from the site and follows its
   * `sourceMappingURL`. The second needs no credential at all, and this project already has
   * scraping enabled, so serving the maps is the whole fix for the browser half.
   *
   * The usual objection is that this publishes the client source. It does, and here that costs
   * nothing: `carlosevg100/offroad` is a public repository, so the same code is already
   * readable by anyone who wants it, in nicer form, with history.
   *
   * The server half is not solved by this. Server bundles are never served, so nothing can
   * scrape them, and a readable server trace does require `SENTRY_AUTH_TOKEN` and the upload
   * that `withSentryConfig` turns on when it is present.
   */
  productionBrowserSourceMaps: true,
  transpilePackages: [
    "@offroad/financial-core",
    "@offroad/matching-core",
    "@offroad/testing-fixtures",
  ],
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{type: "host", value: "www.offroad.capital"}],
        destination: "https://offroad.capital/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {key: "X-Content-Type-Options", value: "nosniff"},
          {key: "X-Frame-Options", value: "DENY"},
          {key: "Referrer-Policy", value: "strict-origin-when-cross-origin"},
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  telemetry: false,
  sourcemaps: {disable: !process.env.SENTRY_AUTH_TOKEN},
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
  },
});
