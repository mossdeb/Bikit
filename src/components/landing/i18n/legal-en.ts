/**
 * Legal pages (/privacy and /terms). Kept apart from the marketing dictionary
 * because the two move for different reasons and at different times.
 *
 * A section is a list of blocks rather than a fixed shape, because the two
 * documents need paragraphs, lists and titled sub-sections interleaved in
 * whatever order the text calls for.
 *
 * In a `ul`, the renderer bolds whatever comes before the first " — ", so a
 * list item reads as `Term — explanation` without any markup in here.
 */
export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "term"; title: string; paragraphs: string[]; items?: string[] };

export type LegalSection = { heading: string; blocks: LegalBlock[] };

/**
 * The responsible-party card. It lives per document rather than shared,
 * because the two label the same person differently on purpose: "Data
 * Controller" is the GDPR term, "Operator" the contractual one.
 */
export type LegalController = {
  heading: string;
  nameLabel: string;
  emailLabel: string;
  countryLabel: string;
};

export type LegalDocument = {
  metaTitle: string;
  metaDescription: string;
  title: string;
  intro: string[];
  controller: LegalController;
  sections: LegalSection[];
};

const en = {
  updated: "30 October 2026",
  updatedLabel: "Last updated",
  backToHome: "Back to home",

  privacy: {
    metaTitle: "Privacy Policy — Bikit",
    metaDescription: "What Bikit stores about you, why it stores it, and what your rights are.",
    title: "Privacy Policy",
    intro: [
      "Bikit is an independent bike telemetry and maintenance service created and operated by a single developer, not a company. This Privacy Policy explains what information Bikit stores, why it stores it, and what your rights are.",
      "This policy applies to bikit.app and the Bikit app installed on your device.",
    ],
    controller: {
      heading: "Who is responsible",
      nameLabel: "Data Controller",
      emailLabel: "Contact",
      countryLabel: "Country",
    },
    sections: [
      {
        heading: "What Bikit stores",
        blocks: [
          {
            kind: "p",
            text: "Bikit only stores the information needed to provide the service. Everything listed below is either information you entered yourself or data returned by a service you chose to connect.",
          },
          {
            kind: "term",
            title: "Account",
            paragraphs: [
              "Your email address, your name (if you provided one), and your preferences, including language, distance unit and notification settings.",
              "If you sign in using email and password, authentication is securely managed by Supabase. Bikit never has access to your password.",
            ],
          },
          {
            kind: "term",
            title: "Sign in with Google",
            paragraphs: [
              "If you choose to sign in with Google, Google provides your name, email address and a stable account identifier. Your Google password is never shared with Bikit.",
            ],
          },
          {
            kind: "term",
            title: "Your bikes",
            paragraphs: [
              "Information about your bikes, including their name, brand, model, year, type, colour, serial number, frame and wheel size, purchase date, warranty information, photos and notes.",
              "Most of this information is optional and only stored if you choose to provide it.",
            ],
          },
          {
            kind: "term",
            title: "Components and maintenance",
            paragraphs: [
              "Information about your components, including category, brand, model, serial number, installation date, maintenance intervals and reminders.",
              "Bikit also stores every maintenance event, repair or replacement you log, including the date, notes, and the bike mileage or usage at the time.",
            ],
          },
          {
            kind: "term",
            title: "Usage totals",
            paragraphs: [
              "The accumulated kilometres and hours for each bike, entered manually by you.",
            ],
          },
          {
            kind: "term",
            title: "Push notifications (optional)",
            paragraphs: [
              "If you enable push notifications, Bikit stores the device endpoint assigned by your browser, the associated encryption keys, and your browser's user agent in order to deliver notifications.",
            ],
          },
          {
            kind: "term",
            title: "Payments (optional)",
            paragraphs: [
              "If you subscribe to a paid plan, Bikit stores your Stripe customer ID, subscription ID, subscription plan and subscription status.",
              "Your payment card details never reach Bikit. Payments are processed entirely by Stripe.",
            ],
          },
          {
            kind: "term",
            title: "Waitlist (optional)",
            paragraphs: [
              "If you join the waitlist on the home page, Bikit stores your email address, the language of the page and the date you joined. You do not need an account to join.",
            ],
          },
          {
            kind: "term",
            title: "Notification history",
            paragraphs: [
              "Bikit stores a history of maintenance notifications that have already been sent so the same notification is not delivered multiple times.",
            ],
          },
        ],
      },
      {
        heading: "How your data is used",
        blocks: [
          {
            kind: "p",
            text: "Your information is used only to provide the service you signed up for, including:",
          },
          {
            kind: "ul",
            items: [
              "managing your account;",
              "storing your bikes and maintenance history;",
              "calculating maintenance schedules;",
              "sending maintenance reminders you requested;",
              "sending the waitlist thank-you email and updates about BIKIT and early access (if you joined the waitlist);",
              "processing subscriptions (if applicable);",
              "keeping the service secure and reliable.",
            ],
          },
          { kind: "p", text: "These are the only purposes for which your data is used." },
          {
            kind: "p",
            text: "Bikit does not sell your personal information, does not share it for advertising purposes, does not build advertising profiles, and does not use analytics, advertising trackers or third-party profiling tools.",
          },
        ],
      },
      {
        heading: "Legal basis (GDPR)",
        blocks: [
          {
            kind: "p",
            text: "Under the General Data Protection Regulation (GDPR), Bikit processes your information on the following legal bases:",
          },
          {
            kind: "term",
            title: "Performance of a contract",
            paragraphs: [
              "Providing your account, storing your data and delivering the core maintenance features. Without this processing, the service cannot function.",
            ],
          },
          {
            kind: "term",
            title: "Consent",
            paragraphs: [
              "Enabling push notifications and subscribing to the optional weekly summary email.",
              "You can withdraw your consent at any time through the app settings without affecting the rest of the service.",
              "Joining the waitlist. To withdraw this consent and be removed from the list, write to the contact address above.",
            ],
          },
          {
            kind: "term",
            title: "Legal obligation",
            paragraphs: [
              "Keeping billing and accounting records where required by applicable tax laws.",
            ],
          },
          {
            kind: "term",
            title: "Legitimate interest",
            paragraphs: ["Protecting the service, preventing abuse and maintaining security."],
          },
        ],
      },
      {
        heading: "Service providers",
        blocks: [
          {
            kind: "p",
            text: "Bikit relies on a small number of trusted service providers that process data only to deliver the services Bikit depends on.",
          },
          {
            kind: "ul",
            items: [
              "Supabase — authentication and database hosting.",
              "Vercel — website and application hosting, and cookieless audience measurement on the public pages.",
              "Stripe — subscription and payment processing.",
              "Resend — sending emails.",
              "Google — Sign in with Google (only if you choose it).",
              "Apple, Google and Mozilla Push Services — delivery of push notifications (only if enabled). These providers receive only the encrypted notification payload and the device endpoint required for delivery.",
            ],
          },
        ],
      },
      {
        heading: "Where your data is stored",
        blocks: [
          {
            kind: "p",
            text: "Your primary database is hosted in the European Union (Ireland).",
          },
          {
            kind: "p",
            text: "Some service providers may process limited information outside the European Union. Where this happens, they rely on appropriate safeguards such as the European Commission's Standard Contractual Clauses or other recognised legal transfer mechanisms.",
          },
        ],
      },
      {
        heading: "How long your data is kept",
        blocks: [
          { kind: "p", text: "Your information is kept for as long as your account exists." },
          {
            kind: "p",
            text: "Waitlist entries are kept until you ask to be removed or until the waitlist ends, whichever comes first.",
          },
          {
            kind: "p",
            text: "If you delete a bike, component or maintenance record, it is removed from the active database.",
          },
          {
            kind: "p",
            text: "If you delete your account, your personal data is permanently removed, except where certain records must be retained to comply with legal obligations.",
          },
          {
            kind: "p",
            text: "Encrypted backups may temporarily contain deleted information until they are automatically overwritten.",
          },
          {
            kind: "p",
            text: "Stripe may retain billing records independently for the period required by applicable tax laws.",
          },
        ],
      },
      {
        heading: "Your rights",
        blocks: [
          { kind: "p", text: "Under the GDPR, you have the right to:" },
          {
            kind: "ul",
            items: [
              "access your personal data;",
              "correct inaccurate information;",
              "request deletion of your data;",
              "receive a portable copy of your data;",
              "object to certain processing activities;",
              "withdraw consent at any time where processing is based on consent.",
            ],
          },
          {
            kind: "p",
            text: "Many of these actions can be performed directly within the app. For anything else, contact the email address above and you will receive a response within 30 days.",
          },
          {
            kind: "p",
            text: "If you believe your personal data has been handled unlawfully, you may lodge a complaint with the Portuguese Data Protection Authority (CNPD) or with the supervisory authority in your country of residence.",
          },
        ],
      },
      {
        heading: "Security",
        blocks: [
          {
            kind: "p",
            text: "Bikit uses industry-standard security measures to protect your data, including encrypted HTTPS connections, secure authentication and restricted access to production systems.",
          },
          {
            kind: "p",
            text: "While no online service can guarantee absolute security, reasonable technical and organisational measures are in place to protect your information.",
          },
        ],
      },
      {
        heading: "Cookies",
        blocks: [
          { kind: "p", text: "Bikit uses only essential cookies. These include:" },
          {
            kind: "ul",
            items: [
              "a session cookie that keeps you signed in;",
              "a language preference cookie for the website.",
            ],
          },
          {
            kind: "p",
            text: "Your light or dark theme preference is stored locally in your browser and is never transmitted to Bikit.",
          },
          {
            kind: "p",
            text: "Bikit does not use advertising cookies or analytics cookies, and does not follow you across other websites.",
          },
          {
            kind: "p",
            text: "On the public pages — the home page, these documents and the sign-in and sign-up screens — Vercel, which hosts Bikit, carries out cookieless audience measurement. It records the page visited, where the visit came from and the type of device, in aggregate, without storing anything on your device and without identifying you. Once you are signed in there is no measurement at all: what you do with your bikes and components is not observed.",
          },
        ],
      },
      {
        heading: "Children's Privacy",
        blocks: [
          {
            kind: "p",
            text: "Bikit is not intended for children under the age of 16, and accounts should not be created for them.",
          },
        ],
      },
      {
        heading: "Changes to this Privacy Policy",
        blocks: [
          { kind: "p", text: "This Privacy Policy may be updated from time to time." },
          {
            kind: "p",
            text: "When changes are made, the Last updated date at the top of this page will be updated. If any changes materially affect your rights or how your information is processed, Bikit will notify you through the app or by email where appropriate.",
          },
        ],
      },
    ],
  } satisfies LegalDocument,


  terms: {
    metaTitle: "Terms of Service — Bikit",
    metaDescription: "The agreement between you and the operator of Bikit.",
    title: "Terms of Service",
    intro: [
      "These Terms of Service form the agreement between you and the operator of Bikit. By creating an account or using Bikit, you agree to these Terms.",
      "These Terms apply to bikit.app and the Bikit app.",
    ],
    controller: {
      heading: "Who is responsible",
      nameLabel: "Operator",
      emailLabel: "Contact",
      countryLabel: "Country",
    },
    sections: [
      {
        heading: "What Bikit is",
        blocks: [
          {
            kind: "p",
            text: "Bikit is a tool for recording your bikes, their components and their maintenance, and for reminding you when a service is due.",
          },
          {
            kind: "p",
            text: "It is intended solely as a record-keeping and maintenance reminder tool.",
          },
        ],
      },
      {
        heading: "Bikit does not inspect your bike",
        blocks: [
          {
            kind: "p",
            text: "Every maintenance reminder shown by Bikit is based entirely on the information available to the app: the maintenance intervals you configured and the mileage or usage reported by you.",
          },
          {
            kind: "p",
            text: "Bikit has no way of determining the actual condition of any bicycle or component.",
          },
          {
            kind: "p",
            text: "A component may require maintenance before its scheduled interval, and a component that has exceeded its interval may still be in good condition. A green status or a full health bar must never be interpreted as a safety inspection or professional assessment.",
          },
          {
            kind: "p",
            text: "You remain solely responsible for inspecting, maintaining and using your bicycle safely. If a component affects your safety, such as brakes, steering, frame or suspension, it should be inspected by a qualified mechanic.",
          },
        ],
      },
      {
        heading: "Your account",
        blocks: [
          { kind: "p", text: "You must be at least 16 years old to create a Bikit account." },
          {
            kind: "p",
            text: "You are responsible for maintaining the confidentiality of your login credentials and for all activity carried out through your account.",
          },
          {
            kind: "p",
            text: "If you believe your account has been accessed without your permission, please contact Bikit immediately.",
          },
        ],
      },
      {
        heading: "Plans and payments",
        blocks: [
          { kind: "p", text: "Bikit offers a free plan and optional paid subscriptions." },
          {
            kind: "p",
            text: "Current subscription prices are displayed before you complete your purchase.",
          },
          { kind: "p", text: "Subscriptions renew automatically each month until cancelled." },
          {
            kind: "p",
            text: "If you cancel a subscription, it remains active until the end of the current billing period and will not renew afterwards.",
          },
          {
            kind: "p",
            text: "Payments are processed securely by Stripe. Your payment card details are never received or stored by Bikit.",
          },
          {
            kind: "p",
            text: "If you are a consumer in the European Union, any statutory cancellation or refund rights apply in accordance with applicable consumer protection laws.",
          },
        ],
      },
      {
        heading: "Your content",
        blocks: [
          {
            kind: "p",
            text: "The bikes, components, maintenance records, notes and other information you add remain yours.",
          },
          {
            kind: "p",
            text: "Bikit stores this information solely to provide the service and claims no ownership over your content.",
          },
          {
            kind: "p",
            text: "You may edit or delete your information at any time, and you may request a copy of your data as described in the Privacy Policy.",
          },
          {
            kind: "p",
            text: "You are responsible for ensuring that the information you upload is accurate and that you have the right to upload it.",
          },
        ],
      },
      {
        heading: "Acceptable use",
        blocks: [
          { kind: "p", text: "You agree not to:" },
          {
            kind: "ul",
            items: [
              "access another user's account or data without permission;",
              "interfere with, overload or disrupt the service;",
              "attempt to reverse engineer or compromise the application;",
              "use automated tools to abuse or interfere with the service;",
              "resell, copy or present Bikit as your own product;",
              "use Bikit for any unlawful activity.",
            ],
          },
        ],
      },
      {
        heading: "Availability",
        blocks: [
          {
            kind: "p",
            text: "Bikit is an independent project maintained by a single developer.",
          },
          {
            kind: "p",
            text: "The service is provided on an “as is” and “as available” basis.",
          },
          {
            kind: "p",
            text: "Although every reasonable effort is made to keep Bikit available and reliable, uninterrupted availability, error-free operation and specific response times cannot be guaranteed.",
          },
          { kind: "p", text: "Features may be modified, replaced or removed over time." },
        ],
      },
      {
        heading: "Limitation of liability",
        blocks: [
          {
            kind: "p",
            text: "Nothing in these Terms excludes or limits liability where the law does not permit it, including liability for fraud or for death or personal injury caused by negligence.",
          },
          {
            kind: "p",
            text: "To the fullest extent permitted by law, Bikit's total liability arising from your use of the service is limited to the amount you paid for Bikit during the twelve months immediately preceding the event giving rise to the claim.",
          },
        ],
      },
      {
        heading: "Intellectual property",
        blocks: [
          {
            kind: "p",
            text: "Bikit, including its software, design, branding, logos and website content, is protected by intellectual property laws.",
          },
          {
            kind: "p",
            text: "These Terms do not grant you ownership of Bikit or any of its intellectual property rights.",
          },
        ],
      },
      {
        heading: "Suspension and termination",
        blocks: [
          { kind: "p", text: "You may delete your account at any time." },
          {
            kind: "p",
            text: "Bikit may suspend or terminate accounts that seriously or repeatedly breach these Terms.",
          },
          {
            kind: "p",
            text: "Where reasonably possible, you will be informed before permanent action is taken and given an opportunity to resolve the issue.",
          },
        ],
      },
      {
        heading: "Changes to these Terms",
        blocks: [
          { kind: "p", text: "These Terms may be updated from time to time." },
          {
            kind: "p",
            text: "Whenever changes are made, the Last updated date at the top of this page will be updated.",
          },
          {
            kind: "p",
            text: "If changes materially affect your rights, Bikit will provide reasonable notice before they take effect.",
          },
          {
            kind: "p",
            text: "Continuing to use Bikit after the updated Terms become effective constitutes acceptance of the revised Terms.",
          },
        ],
      },
      {
        heading: "Governing law",
        blocks: [
          { kind: "p", text: "These Terms are governed by the laws of Portugal." },
          {
            kind: "p",
            text: "If you are a consumer, you continue to benefit from any mandatory consumer protection rights available under the laws of your country of residence.",
          },
        ],
      },
      {
        heading: "Disputes",
        blocks: [
          {
            kind: "p",
            text: "If you have any questions or concerns, please contact Bikit first. Most issues can be resolved quickly and informally.",
          },
          {
            kind: "p",
            text: "If a dispute cannot be resolved, you may use any alternative dispute resolution body available under the consumer protection laws applicable in your country.",
          },
        ],
      },
      {
        heading: "Entire agreement",
        blocks: [
          {
            kind: "p",
            text: "These Terms of Service, together with the Privacy Policy, constitute the entire agreement between you and Bikit regarding your use of the service.",
          },
        ],
      },
    ],
  } satisfies LegalDocument,
};

export default en;
export type LegalDictionary = typeof en;
