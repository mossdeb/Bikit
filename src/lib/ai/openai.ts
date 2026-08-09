import OpenAI from "openai";

/** One model for both searches, overridable so a deprecation or an
 * experiment is an env change, not a deploy. gpt-5.6-luna measured against
 * gpt-5-mini on the same bike search (2026-08-09): 2.5× faster, visibly
 * more precise build extraction, and mini-class token pricing — the cost
 * that actually dominates is the web search tool fee, which is
 * model-independent. */
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";

let openaiClient: OpenAI | null = null;

/** Constructed lazily so the app still runs (just without AI setup) before
 * OPENAI_API_KEY is configured — same arrangement as getStripeClient. Server
 * actions only; the key must never reach the client bundle. */
export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}
