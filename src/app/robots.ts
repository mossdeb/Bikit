import type { MetadataRoute } from "next";

const SITE_URL = "https://www.bikit.app";

/**
 * Who may crawl what (2026-11-07). The public pages are open to search —
 * OAI-SearchBot (ChatGPT search) by name, as OpenAI asks — and GPTBot,
 * OpenAI's crawler for training, is kept out by request. Everything behind
 * the login is disallowed: a crawler there only ever met the login page.
 * Served past the proxy (src/proxy.ts), which would otherwise send a
 * signed-out crawler to /login.
 */
const PRIVATE = [
  "/api/",
  "/pro",
  "/bikes",
  "/dashboard",
  "/settings",
  "/help",
  "/legal",
  "/beta",
  "/reset-password",
  "/checkout",
  "/auth",
  "/landing-preview",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "GPTBot", disallow: "/" },
      { userAgent: "OAI-SearchBot", allow: "/", disallow: PRIVATE },
      { userAgent: "*", allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
