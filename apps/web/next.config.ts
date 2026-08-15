import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import {withSentryConfig} from "@sentry/nextjs";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
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
