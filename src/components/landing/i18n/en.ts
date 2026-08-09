const en = {
  nav: {
    features: "Features",
    howItWorks: "How it works",
    pricing: "Pricing",
    faq: "FAQ",
    login: "Log in",
    getStarted: "Get started free",
    switchLanguage: "Switch to Portuguese",
  },
  hero: {
    badge: "YOUR BIKE COMPANION",
    titleLine1: "All your bike maintenance",
    titleLine2: "In a single place",
    subtitle:
      "Log every bike, track component wear, and get alerted before problems come up. Fewer surprise breakdowns, more time riding.",
    alerts: "Alerts",
    services: "Services",
    smart: "Smart Management",
    ctaPrimary: "Get started free",
    ctaSecondary: "View plans",
    strava: "Connect Strava",
    slideLabel: "Show bike {n}",
    slides: [
      {
        alt: "Enduro mountain bike",
        name: "My Enduro Bike",
        stats: "180km  ·  20h",
        metrics: [
          { label: "Service in 35 hours", percent: 90 },
          { label: "Service in 20 km", percent: 10 },
        ],
      },
      {
        alt: "Road bike",
        name: "My Road Bike",
        stats: "1 240km  ·  48h",
        metrics: [{ label: "Spokes tension", percent: 90 }],
      },
      {
        alt: "Cross-country mountain bike",
        name: "My XC Bike",
        stats: "620km  ·  36h",
        metrics: [{ label: "Brake pads", percent: 70 }],
      },
    ],
  },
  features: {
    badge: "Features",
    title: "Everything you need to take care of your bike",
    subtitle:
      "No spreadsheets, no sticky notes in the garage. One place for your bikes, your components, and the history of everything you've done to them.",
    card1: {
      panelTitle: "Components — My Bike",
      row1Title: "Rear shock — Fox Float X2",
      row1Sub: "Installed 8 months ago",
      row2Title: "Brakes — Shimano XT",
      row2Sub: "Installed 2 months ago",
      row3Title: "Chain — SRAM GX",
      row3Sub: "Installed 3 months ago",
      heading: "Every bike, every component, in one place",
      body: "Create a profile for each bike and log suspension, brakes, drivetrain, wheels — everything. You'll always know what's installed and for how long.",
    },
    card2: {
      heading: "Alerts before it's too late",
      body: "Set maintenance intervals per component. Bikit tracks kilometers and months, and warns you when something's approaching its limit.",
      panelTitle: "Needs attention",
      alert1Title: "Tires — Trek Domane",
      alert1Sub: "OK, checked 1 month ago",
      alert1Status: "On track",
      alert2Title: "Chain — Peugeot Gravel",
      alert2Sub: "Wear at 0.5% of limit",
      alert2Status: "Due soon",
      alert3Title: "Brakes — Canyon Spectral",
      alert3Sub: "Service overdue by 12 days",
      alert3Status: "Overdue",
    },
    card3: {
      heading: "Complete intervention history",
      body: "Service, repair, or replacement — every intervention is logged, with date, distance, and notes. Your bike's history is never lost.",
    },
  },
  howItWorks: {
    badge: "How it works",
    title: "Up and running in three steps",
    subtitle: "Get going in under two minutes.",
    // The closing half of the subtitle, set in bold. Kept as its own string
    // because these dictionaries carry no markup — the component decides what
    // is emphasised, the same way the landing already splits its other copy.
    subtitleStrong: "BIKIT takes it from there.",
    steps: [
      {
        title: "Add your bike",
        description: "Create a profile for each bike and start tracking all of its maintenance.",
      },
      {
        title: "Connect Strava",
        description: "Your distance updates automatically after every ride.",
      },
      {
        title: "Get alerts",
        description: "Hear about the next service before it is due, and keep the bike ready to ride.",
      },
    ],
  },
  pricing: {
    badge: "Pricing",
    title: "Choose the plan for your bike fleet",
    subtitle: "Start free. Upgrade when you have more than one bike to look after.",
    monthly: "Monthly",
    yearly: "Yearly",
    yearlySaving: "Save 16%",
    plans: [
      {
        name: "Free",
        description: "To try it out, no strings attached.",
        price: "€0",
        period: "forever",
        priceYearly: "€0",
        periodYearly: "forever",
        // Nothing to strike through on a plan that costs nothing.
        priceYearlyFull: "",
        featuresLead: "",
        features: ["1 bike", "Up to 2 components", "Limited intervention history", "Maintenance alerts"],
        // Empty on Free: its CTA has nothing to buy and goes straight to signup.
        checkoutPlan: "",
        cta: "Get started free",
        highlighted: false,
      },
      {
        name: "Personal",
        description: "For those with more than one bike.",
        price: "€2.99",
        period: "/ month",
        priceYearly: "€29.99",
        periodYearly: "/ year",
        // 12 × the monthly price, struck through next to the yearly one.
        priceYearlyFull: "€35.88",
        featuresLead: "",
        features: [
          "Up to 3 bikes",
          "Unlimited components",
          "Intervention history",
          "Bike timeline",
          "Maintenance alerts",
        ],
        checkoutPlan: "personal",
        cta: "Choose Personal",
        highlighted: true,
        badge: "Most popular",
      },
      {
        name: "Pro",
        description: "For unlimited collections and more control.",
        price: "€5.99",
        period: "/ month",
        priceYearly: "€59.99",
        periodYearly: "/ year",
        priceYearlyFull: "€71.88",
        // Pro repeated four of Personal's lines. Saying it in one shortens the
        // card and leaves only what this plan actually adds.
        featuresLead: "Everything in Personal, plus:",
        features: [
          "Unlimited bikes",
          "Detailed reports (coming soon)",
          "PDF/CSV export (coming soon)",
        ],
        checkoutPlan: "pro",
        cta: "Choose Pro",
        highlighted: false,
      },
    ],
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
    ],
  },
  cta: {
    title: "Ready to stop guessing when the last service was?",
    subtitle: "Create your account and log your first bike in under two minutes.",
    button: "Get started free",
    footer: "Free forever · 1 bike included",
  },
  footer: {
    tagline: "Bike maintenance, without spreadsheets. The ultimate tool for cyclists who take care of their machines.",
    productHeading: "Product",
    productLinks: [
      { label: "Features", href: "#funcionalidades" },
      { label: "Pricing", href: "#precos" },
      { label: "FAQ", href: "#faq" },
    ],
    productSupport: "Help & Support",
    accountHeading: "Account",
    accountLogin: "Log in",
    accountSignup: "Create account",
    legalHeading: "Legal",
    legalPrivacy: "Privacy",
    legalTerms: "Terms",
    copyright: "© 2026 Bikit. All rights reserved.",
    madeFor: "Made for people who love taking care of their own bike.",
  },
};

export default en;
export type LandingDictionary = typeof en;
