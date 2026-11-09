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
    body: "O BIKIT recolhe estatísticas diárias de utilização da app, incluindo as páginas visitadas, o tipo de dispositivo e a localização aproximada. Não são guardados endereços IP, nada fica guardado no teu dispositivo, e os registos são apagados ao fim de 12 meses.",
    read: "Ler a política",
    ok: "Entendi",
  },
  en: {
    title: "We updated the Privacy Policy",
    body: "BIKIT collects daily app usage statistics, including pages visited, device type and approximate location. No IP addresses are stored, nothing is stored on your device, and records are deleted after 12 months.",
    read: "Read the policy",
    ok: "Got it",
  },
};
