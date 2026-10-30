// Annotated rather than inferred: one question carries a structured answer and
// the rest do not, so `typeof en` would hand the Portuguese file a union it
// has to reproduce shape for shape. Naming the type keeps both dictionaries
// answering to the same contract.
import type { FaqItem } from "@/components/faq-accordion";

const en = {
  nav: {
    features: "Features",
    device: "The Device",
    faq: "FAQ",
    login: "Beta Login",
    switchLanguage: "Language",
  },
  home: {
    waitlistEmail: {
      subject: "You're on the BIKIT waitlist",
      heading: "Thanks for joining the waitlist",
      body1: "You're on the list. We're glad to have you with us.",
      body2:
        "BIKIT is in development and in private beta. We'll let you know about updates and early access opportunities as soon as there's news to share.",
      cta: "Visit BIKIT",
      footer:
        "You're receiving this because this address joined the waitlist at bikit.app. If that wasn't you, you can ignore this email.",
    },
    hero: {
      kicker: "Understand every ride.",
      titleBold1: "Bike Intelligence",
      titleLight: "and",
      titleBold2: "Telemetry System",
      leadBold: "Be first in line.",
      lead1: "Get early updates, exclusive benefits,",
      lead2: "and priority access to the BIKIT device.",
      emailPlaceholder: "email",
      emailLabel: "Your email address",
      submit: "Join the Waitlist",
      sending: "Joining…",
      success: "You're on the list. We'll be in touch.",
      invalid: "Enter a valid email address.",
      failed: "That didn't work. Please try again.",
    },
    features: {
      badge: "Features",
      title: "Get more from every ride.",
      lead: "Every movement tells a story. BIKIT turns it into data you can understand.",
    },
    device: {
      badge: "The Device",
      title: "Small device. Powerful insights.",
      lead1: "A compact, intelligent telemetry device designed to capture your ride with precision.",
      lead2: "Mount it, start recording, and explore your performance through the BIKIT platform.",
      imageAlt: "The BIKIT telemetry device",
      disclaimer: "Does not represent the final product design",
    },
    faq: {
      badge: "The essentials",
      title: "Frequently asked questions",
      questions: [
        {
          question: "What is BIKIT?",
          answer:
            "BIKIT is an intelligent telemetry system that combines a compact data logger with an advanced analysis platform, helping riders understand their bike’s behavior, suspension performance, and riding dynamics.",
        },
        {
          question: "How does BIKIT work?",
          answer:
            "The BIKIT device captures motion and impact data during your ride. Once transferred to the platform, the data is processed into intuitive visualizations and performance insights.",
        },
        {
          question: "Is BIKIT compatible with my bike?",
          answer:
            "BIKIT is being developed for mountain bikes and motocross motorcycles, with a focus on versatility and easy installation.",
        },
        {
          question: "When will BIKIT be available?",
          answer:
            "BIKIT is currently in development and undergoing private beta testing. Join our waitlist to receive updates and early access opportunities.",
        },
        {
          question: "Do I need technical knowledge to use BIKIT?",
          answer:
            "Not at all. BIKIT is designed to make advanced telemetry accessible to every rider, turning complex data into clear, understandable insights.",
        },
      ] as FaqItem[],
    },
  },
  faq: {
    badge: "FAQ",
    title: "Frequently asked questions",
    questions: [
      {
        question: "Can I change plans later?",
        answer: "Yes. You can upgrade or downgrade at any time, without losing your history.",
      },
      {
        question: 'What counts as a "component"?',
        answer: "Any part you want to track — suspension, brakes, drivetrain, wheels, and more.",
      },
      {
        question: "Is my data synced across devices?",
        answer: "Yes. Your account and all your bikes stay in sync on any device you sign into.",
      },
      {
        question: "Does the Free plan expire?",
        answer: "No. The Free plan is free forever, with a limit of 1 bike and 2 components.",
      },
      {
        question: "Can I cancel anytime?",
        answer: "Yes, no strings attached. You can cancel at any time directly from your account.",
      },
      {
        question: "How can I install Bikit on my phone?",
        answer:
          "Bikit installs straight from the browser — there is nothing to download from an app store. Pick your platform below.",
        sections: [
          {
            heading: "📱 iPhone (iOS)",
            steps: [
              "Open Safari — installing only works from Safari.",
              "Go to bikit.app.",
              "Tap the Share button.",
              "Select Add to Home Screen.",
              "Tap Add.",
            ],
          },
          {
            heading: "Requirements",
            bullets: [
              "iOS 16.4 or later is recommended.",
              "Installing only works from Safari. If you are using Chrome or another browser, open Bikit in Safari to install it — after that you can launch it straight from your Home Screen.",
            ],
          },
          {
            heading: "🤖 Android",
            steps: [
              "Open your browser (Chrome recommended).",
              "Go to bikit.app.",
              "Tap the ⋮ menu.",
              "Select Install app or Add to Home screen.",
              "Follow the on-screen instructions.",
            ],
          },
          {
            heading: "If you don't see the option",
            steps: [
              "Open Google Chrome.",
              "Go to bikit.app.",
              "Tap ⋮ → Add to Home screen → Install.",
              "Follow the on-screen instructions.",
            ],
          },
          {
            heading: "Requirements",
            intro:
              "For the best experience we recommend Android 9.0 or later with Chrome 90+, or a recent Chromium-based browser.",
          },
          {
            heading: "💻 Mac (macOS)",
            steps: [
              "Open Safari.",
              "Go to bikit.app.",
              "Click Share in the toolbar.",
              "Choose Add to Dock.",
              "Confirm the installation.",
            ],
          },
          {
            heading: "Requirements",
            bullets: ["macOS Sonoma (14) or later.", "Installing is only available through Safari."],
          },
          {
            heading: "Why install Bikit?",
            intro: "Once installed, Bikit works just like a native app:",
            bullets: [
              "🚴 Launch it straight from your Home Screen or Dock.",
              "⚡ Faster startup and smoother performance.",
              "🔔 Receive maintenance reminders and notifications.",
              "🌐 A full-screen experience, without browser tabs.",
              "📶 Keeps working on a poor connection, for the parts that support it.",
            ],
          },
        ],
      },
    ] as FaqItem[],
  },
  footer: {
    tagline: "Understand your bike. Unlock your potential.",
    productHeading: "Product",
    productLinks: [
      { label: "Features", href: "#features" },
      { label: "FAQ", href: "#faq" },
    ],
    productSupport: "Help & Support",
    legalHeading: "Legal",
    legalPrivacy: "Privacy",
    legalTerms: "Terms",
    copyright:
      "© 2026 BIKIT · Patent Pending · Portugal · INPI Request No. 20262008502041",
    madeFor: "Made by Riders for Riders",
  },
};

export default en;
export type LandingDictionary = typeof en;
