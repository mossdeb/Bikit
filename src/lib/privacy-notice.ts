import type { Locale } from "@/lib/i18n";

/**
 * The notice of the privacy policy's update of 9 November 2026 (by
 * request): the app's use is now summarised per day, with the approximate
 * city (migration 00058), and the policy promises to say so in the app
 * when a change matters this much. Shown in the signed-in app until the
 * account dismisses it; the dismissal is kept in notice_acceptances under
 * this id, beside the confidentiality notice's — a later update gets a
 * new id and is shown anew.
 *
 * Not a gate: nothing is asked of the reader. The tracking rests on
 * legitimate interest, and the notice only tells.
 */
export const PRIVACY_NOTICE_ID = "privacy-2026-11-09";

export const PRIVACY_NOTICE_TEXT: Record<
  Locale,
  { title: string; body: string; read: string; ok: string }
> = {
  pt: {
    title: "Atualizámos a Política de Privacidade",
    body: "A partir de 9 de novembro de 2026, o Bikit guarda um resumo diário de como usas a app: que páginas abres, o tipo de dispositivo e a cidade aproximada de onde acedes. Não guarda o teu endereço IP nem nada no teu dispositivo, e o resumo é apagado ao fim de 12 meses.",
    read: "Ler a política",
    ok: "Entendi",
  },
  en: {
    title: "We updated the Privacy Policy",
    body: "From 9 November 2026, Bikit keeps a daily summary of how you use the app: which pages you open, the type of device and the approximate city you access it from. It does not keep your IP address or anything on your device, and the summary is deleted after 12 months.",
    read: "Read the policy",
    ok: "Got it",
  },
};
