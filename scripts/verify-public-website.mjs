import assert from "node:assert/strict";
import {publicPages, publicPath} from "../apps/web/src/lib/website-routes.ts";

// Read-only HTTP checks. No credentials, mutations, browser sessions or financial data.
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3000");
assert(["http:", "https:"].includes(base.protocol));
const paths = ["pt-BR", "en-US"].flatMap(locale => publicPages.map(page => publicPath(locale,page)));
let checked = 0;
for (let i = 0; i < paths.length; i += 4) {
  await Promise.all(paths.slice(i,i + 4).map(async path => {
    const response = await fetch(new URL(path,base), {signal: AbortSignal.timeout(30000)});
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert(html.includes("Offroad"), `${path}: missing brand`);
    assert(!html.includes("NEXT_NOT_FOUND"), `${path}: not-found payload`);
    checked++;
  }));
}
for (const path of ["/website/hero-city.png", "/website/product-pt.png", "/website/product-en.png", "/brand/offroad-lockup.png", "/brand/offroad-symbol.png", "/sitemap.xml", "/robots.txt"]) {
  const response = await fetch(new URL(path,base), {signal: AbortSignal.timeout(30000)});
  assert.equal(response.status, 200, path);
  if (path === "/sitemap.xml") assert.equal((await response.text()).match(/<loc>/g)?.length, 42);
}
const missing = await fetch(new URL("/pt-BR/website-route-does-not-exist",base));
assert.equal(missing.status, 404, "unknown public route must remain 404");
console.log(`PASS: ${checked} localized pages, 5 image assets, sitemap, robots and unknown-route boundary at ${base.origin}.`);
