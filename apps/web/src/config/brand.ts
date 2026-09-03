export const brand = {
  name: "Offroad Capital",
  slug: "offroadcapital",
  domain: "offroad.capital",
  url: "https://offroad.capital",
  browserTitle: "Offroad Capital | AI for Debt Capital Markets",
  description: "Offroad brings specialist financial intelligence, market context, and institutional execution capacity to debt capital markets.",
  category: "AI Platform for Debt Capital Markets",
  socialHeadline: "Powering a smarter, more efficient and connected debt market.",
  signatureLead: "Powering",
  signatureSubject: "Debt Capital Markets",
  capabilities: [
    "Investigate companies, sectors, debt markets, and financing alternatives",
    "Analyze financials, capital structures, debt capacity, risks, and scenarios",
    "Compare and recommend indicative debt structures",
    "Prepare evidence-linked analysis, models, term sheets, and presentation materials",
    "Match relevant financing providers and support authorized qualified introductions",
  ],
  email: "hello@offroad.capital",
} as const;

export type Brand = typeof brand;
