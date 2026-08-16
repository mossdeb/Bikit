import { Resend } from "resend";
import { getDictionary, type Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";

const FROM = "Bikit <hello@mail.bikit.app>";
// Absolute and hardcoded rather than derived from the request's origin.
//
// Everything in an email is read somewhere else, on a host the sender never
// sees, so nothing in here may depend on where the request came from. That was
// already true of the logo — a local run pointed it at localhost and the image
// came through broken — and it is just as true of the links: the daily cron is
// invoked by Vercel at the deployment's own URL, which sits behind Deployment
// Protection, so every link built from that origin landed the reader on a
// Vercel login page.
//
// www because bikit.app 308s to it, and a link that starts one hop late costs
// nothing to write correctly.
const SITE_URL = "https://www.bikit.app";
const LOGO_URL = "https://bikit.app/icons/icon-192.png";

// Constructed lazily (and only once RESEND_API_KEY exists) so the app and
// the cron route still run — just without sending — before it's configured.
function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY is not set — skipping email send.");
    return null;
  }
  return new Resend(process.env.RESEND_API_KEY);
}

function wrapEmail(heading: string, bodyHtml: string, ctaLabel: string, ctaHref: string, footer: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#efefef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#101014;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;">
      <!-- Remote PNG rather than inline SVG: SVG is unsupported in Outlook
           and stripped by Gmail. Width/height are set as attributes as well
           as styles because Outlook ignores CSS sizing on images, and the alt
           text carries the brand for clients that block remote images by
           default. -->
      <img src="${LOGO_URL}" alt="Bikit" width="40" height="40"
           style="display:block;width:40px;height:40px;border:0;border-radius:10px;margin:0 0 20px;" />
      <h1 style="font-size:20px;margin:0 0 16px;">${heading}</h1>
      ${bodyHtml}
      <a href="${ctaHref}" style="display:inline-block;margin-top:24px;padding:10px 22px;background:#43f3af;color:#062a20;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px;">${ctaLabel}</a>
      <p style="margin-top:32px;font-size:12px;color:#8a8d93;">${footer}</p>
    </div>
  </body>
</html>`;
}

/** Returns whether the email actually sent, so callers only log a episode/
 * dedupe entry for sends that really happened (e.g. not when RESEND_API_KEY
 * is unset). */
export async function sendDueSoonEmail(params: {
  to: string;
  locale: Locale;
  componentName: string;
  bikeName: string;
  detail: { kind: "date"; date: string } | { kind: "amount"; amount: string };
  componentUrl: string;
}): Promise<boolean> {
  const client = getResendClient();
  if (!client) return false;

  const dict = getDictionary(params.locale).email;
  const detailText =
    params.detail.kind === "date"
      ? dict.dueSoon.bodyByDate(params.componentName, params.bikeName, formatDate(params.detail.date))
      : dict.dueSoon.bodyByAmount(params.componentName, params.bikeName, params.detail.amount);
  const html = wrapEmail(
    dict.dueSoon.heading,
    `<p style="margin:0;font-size:15px;line-height:1.5;">${detailText}</p>`,
    dict.cta,
    `${SITE_URL}${params.componentUrl}`,
    dict.footer
  );
  const { error } = await client.emails.send({
    from: FROM,
    to: params.to,
    subject: dict.dueSoon.subject(params.componentName),
    html,
  });
  return !error;
}

export async function sendOverdueEmail(params: {
  to: string;
  locale: Locale;
  componentName: string;
  bikeName: string;
  detail: { kind: "days"; days: number } | { kind: "amount"; amount: string };
  isPastDue: boolean;
  componentUrl: string;
}): Promise<boolean> {
  const client = getResendClient();
  if (!client) return false;

  const dict = getDictionary(params.locale).email;
  const detailText =
    params.detail.kind === "days"
      ? dict.overdue.bodyByDays(params.componentName, params.bikeName, params.detail.days, params.isPastDue)
      : dict.overdue.bodyByAmount(params.componentName, params.bikeName, params.detail.amount, params.isPastDue);
  const html = wrapEmail(
    dict.overdue.heading,
    `<p style="margin:0;font-size:15px;line-height:1.5;">${detailText}</p>`,
    dict.cta,
    `${SITE_URL}${params.componentUrl}`,
    dict.footer
  );
  const { error } = await client.emails.send({
    from: FROM,
    to: params.to,
    subject: dict.overdue.subject(params.componentName),
    html,
  });
  return !error;
}

export interface WeeklySummaryItem {
  componentName: string;
  bikeName: string;
  detail: string;
  url: string;
}

export async function sendWeeklySummaryEmail(params: {
  to: string;
  locale: Locale;
  overdue: WeeklySummaryItem[];
  dueSoon: WeeklySummaryItem[];
}): Promise<boolean> {
  const client = getResendClient();
  if (!client) return false;

  const dict = getDictionary(params.locale).email;

  function renderSection(title: string, items: WeeklySummaryItem[]): string {
    if (items.length === 0) return "";
    const rows = items
      .map(
        (item) =>
          `<li style="margin-bottom:8px;"><a href="${SITE_URL}${item.url}" style="color:#101014;text-decoration:none;font-weight:600;">${item.componentName}</a> — ${item.bikeName} <span style="color:#8a8d93;">(${item.detail})</span></li>`
      )
      .join("");
    return `<h2 style="font-size:14px;margin:20px 0 8px;">${title}</h2><ul style="margin:0;padding-left:18px;font-size:14px;">${rows}</ul>`;
  }

  const hasItems = params.overdue.length > 0 || params.dueSoon.length > 0;
  const body = hasItems
    ? `<p style="margin:0;font-size:15px;line-height:1.5;">${dict.weeklySummary.intro}</p>
       ${renderSection(dict.weeklySummary.overdueSection, params.overdue)}
       ${renderSection(dict.weeklySummary.dueSoonSection, params.dueSoon)}`
    : `<p style="margin:0;font-size:15px;line-height:1.5;">${dict.weeklySummary.noneNeedAttention}</p>`;

  const html = wrapEmail(
    dict.weeklySummary.heading,
    body,
    dict.cta,
    `${SITE_URL}/dashboard`,
    dict.footer
  );

  const { error } = await client.emails.send({
    from: FROM,
    to: params.to,
    subject: dict.weeklySummary.subject,
    html,
  });
  return !error;
}

/**
 * The hard-ride alert.
 *
 * Sent by the daily cron and never by the webhook, which is where this project
 * keeps email on purpose: a ride finished at 23:30 would otherwise buzz an
 * inbox at 23:31. The push carries the same news within seconds; this is the
 * copy for people who asked to also have it in writing.
 */
export async function sendHardRideEmail(params: {
  to: string;
  locale: Locale;
  bikeName: string;
  score: number;
  distance: string;
  rideLoadUrl: string;
}): Promise<boolean> {
  const client = getResendClient();
  if (!client) return false;

  const dict = getDictionary(params.locale).email;
  const html = wrapEmail(
    dict.hardRide.heading,
    `<p style="margin:0;font-size:15px;line-height:1.5;">${dict.hardRide.body(params.bikeName, params.score, params.distance)}</p>`,
    dict.hardRide.cta,
    `${SITE_URL}${params.rideLoadUrl}`,
    // Its own footer, not the shared maintenance one: this email is not a
    // maintenance alert and telling the reader they signed up for maintenance
    // alerts would send them to the wrong switch to turn it off.
    dict.hardRide.footer
  );
  const { error } = await client.emails.send({
    from: FROM,
    to: params.to,
    subject: dict.hardRide.subject(params.bikeName),
    html,
  });
  return !error;
}
