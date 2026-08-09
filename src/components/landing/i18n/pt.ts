import type { LandingDictionary } from "./en";

const pt: LandingDictionary = {
  nav: {
    features: "Funcionalidades",
    howItWorks: "Como funciona",
    pricing: "Preços",
    faq: "FAQ",
    login: "Entrar",
    getStarted: "Começar grátis",
    switchLanguage: "Mudar para inglês",
  },
  hero: {
    badge: "O TEU COMPANHEIRO DE PEDAL",
    titleLine1: "Toda a manutenção da tua bicicleta",
    titleLine2: "Num único lugar",
    subtitle:
      "Regista cada bicicleta, acompanha o desgaste dos componentes e recebe alertas antes de surgir um problema. Menos avarias inesperadas, mais tempo a pedalar.",
    alerts: "Alertas",
    services: "Manutenções",
    smart: "Gestão Automática",
    ctaPrimary: "Começar grátis",
    ctaSecondary: "Ver planos",
    strava: "Ligar ao Strava",
    slideLabel: "Ver bicicleta {n}",
    slides: [
      {
        alt: "Bicicleta de enduro",
        name: "A minha Enduro",
        stats: "180km  ·  20h",
        metrics: [
          { label: "Revisão em 35 horas", percent: 90 },
          { label: "Revisão em 20 km", percent: 10 },
        ],
      },
      {
        alt: "Bicicleta de estrada",
        name: "A minha Estrada",
        stats: "1 240km  ·  48h",
        metrics: [{ label: "Tensão dos raios", percent: 90 }],
      },
      {
        alt: "Bicicleta de cross-country",
        name: "A minha XC",
        stats: "620km  ·  36h",
        metrics: [{ label: "Pastilhas", percent: 70 }],
      },
    ],
  },
  features: {
    badge: "Funcionalidades",
    title: "Tudo o que precisas para cuidar da tua bicicleta",
    subtitle:
      "Sem folhas de cálculo, sem post-its na garagem. Um sítio só para as tuas bicicletas, os teus componentes e o histórico de tudo o que lhes fizeste.",
    card1: {
      panelTitle: "Componentes — A minha Bicicleta",
      row1Title: "Amortecedor — Fox Float X2",
      row1Sub: "Instalado há 8 meses",
      row2Title: "Travões — Shimano XT",
      row2Sub: "Instalado há 2 meses",
      row3Title: "Corrente — SRAM GX",
      row3Sub: "Instalada há 3 meses",
      heading: "Cada bicicleta, cada componente, num só sítio",
      body: "Cria um perfil para cada bicicleta e regista suspensão, travões, transmissão, rodas — tudo. Sabes sempre o que tens montado e há quanto tempo está lá.",
    },
    card2: {
      heading: "Alertas antes que seja tarde",
      body: "Define intervalos de manutenção por componente. O Bikit acompanha os quilómetros e os meses, e avisa-te quando algo se aproxima do limite.",
      panelTitle: "Precisa de atenção",
      alert1Title: "Pneus — Trek Domane",
      alert1Sub: "Ok, revisto há 1 mês",
      alert1Status: "Em dia",
      alert2Title: "Corrente — Peugeot Gravel",
      alert2Sub: "Desgaste a 0.5% do limite",
      alert2Status: "Em breve",
      alert3Title: "Travões — Canyon Spectral",
      alert3Sub: "Serviço vencido há 12 dias",
      alert3Status: "Atrasado",
    },
    card3: {
      heading: "Histórico completo de intervenções",
      body: "Serviço, reparação ou substituição — cada intervenção fica registada, com data, quilómetros e notas. O histórico da tua bicicleta nunca se perde.",
    },
  },
  howItWorks: {
    badge: "Como funciona",
    title: "A postos em três passos",
    subtitle: "Começa em menos de dois minutos.",
    // The closing half of the subtitle, set in bold. Kept as its own string
    // because these dictionaries carry no markup — the component decides what
    // is emphasised, the same way the landing already splits its other copy.
    subtitleStrong: "A BIKIT trata do resto.",
    steps: [
      {
        title: "Adiciona a tua bicicleta",
        description: "Cria uma ficha para cada bicicleta e começa a acompanhar toda a manutenção.",
      },
      {
        title: "Liga ao Strava",
        description: "Os quilómetros são atualizados automaticamente após cada atividade.",
      },
      {
        title: "Recebe alertas",
        description: "Recebe alertas antes do próximo serviço e mantém a bicicleta sempre pronta.",
      },
    ],
  },
  pricing: {
    badge: "Preços",
    title: "Escolhe o plano para o teu parque de bicicletas",
    subtitle: "Começa grátis. Sobe de plano quando tiveres mais que uma bicicleta para cuidar.",
    monthly: "Mensal",
    yearly: "Anual",
    yearlySaving: "Poupa 16%",
    plans: [
      {
        name: "Grátis",
        description: "Para experimentar sem compromisso.",
        price: "€0",
        period: "para sempre",
        priceYearly: "€0",
        periodYearly: "para sempre",
        // Nothing to strike through on a plan that costs nothing.
        priceYearlyFull: "",
        featuresLead: "",
        features: ["1 bicicleta", "Até 2 componentes", "Histórico de intervenções limitado", "Alertas de manutenção"],
        // Empty on Free: its CTA has nothing to buy and goes straight to signup.
        checkoutPlan: "",
        cta: "Começar grátis",
        highlighted: false,
      },
      {
        name: "Pessoal",
        description: "Para quem tem mais que uma bicicleta.",
        price: "€2,99",
        period: "/ mês",
        priceYearly: "€29,99",
        periodYearly: "/ ano",
        // 12 × the monthly price, struck through next to the yearly one.
        priceYearlyFull: "€35,88",
        featuresLead: "",
        features: [
          "Até 3 bicicletas",
          "Componentes ilimitados",
          "Histórico de intervenções",
          "Timeline da bicicleta",
          "Alertas de manutenção",
        ],
        checkoutPlan: "personal",
        cta: "Escolher Pessoal",
        highlighted: true,
        badge: "Mais popular",
      },
      {
        name: "Pro",
        description: "Para coleções sem limites e mais controlo.",
        price: "€5,99",
        period: "/ mês",
        priceYearly: "€59,99",
        periodYearly: "/ ano",
        priceYearlyFull: "€71,88",
        // O Pro repetia quatro linhas do Pessoal. Dizê-lo numa só encurta o
        // card e deixa à vista o que é mesmo exclusivo deste plano.
        featuresLead: "Os mesmos benefícios do Pessoal, mais:",
        features: [
          "Bicicletas ilimitadas",
          "Relatórios detalhados (brevemente)",
          "Exportação PDF/CSV (brevemente)",
        ],
        checkoutPlan: "pro",
        cta: "Escolher Pro",
        highlighted: false,
      },
    ],
  },
  faq: {
    badge: "FAQ",
    title: "Perguntas frequentes",
    questions: [
      {
        question: "Posso mudar de plano mais tarde?",
        answer: "Sim. Podes subir ou descer de plano a qualquer momento, sem perder o teu histórico.",
      },
      {
        question: 'O que conta como "componente"?',
        answer: "Qualquer peça que queiras acompanhar — suspensão, travões, transmissão, rodas, entre outras.",
      },
      {
        question: "Os meus dados ficam sincronizados entre dispositivos?",
        answer: "Sim. A tua conta e todas as bicicletas ficam sincronizadas em qualquer dispositivo onde inicies sessão.",
      },
      {
        question: "O plano Grátis expira?",
        answer: "Não. O plano Grátis é grátis para sempre, com um limite de 1 bicicleta e 2 componentes.",
      },
      {
        question: "Posso cancelar quando quiser?",
        answer: "Sim, sem compromisso. Podes cancelar a qualquer momento diretamente na tua conta.",
      },
    ],
  },
  cta: {
    title: "Pronto para deixar de adivinhar quando foi a última manutenção?",
    subtitle: "Cria a tua conta e regista a tua primeira bicicleta em menos de dois minutos.",
    button: "Começar grátis",
    footer: "Grátis para sempre · 1 bicicleta incluída",
  },
  footer: {
    tagline: "Manutenção de bicicletas, sem folhas de cálculo. A ferramenta definitiva para ciclistas que cuidam das suas máquinas.",
    productHeading: "Produto",
    productLinks: [
      { label: "Funcionalidades", href: "#funcionalidades" },
      { label: "Preços", href: "#precos" },
      { label: "FAQ", href: "#faq" },
    ],
    productSupport: "Ajuda e suporte",
    accountHeading: "Conta",
    accountLogin: "Entrar",
    accountSignup: "Criar conta",
    legalHeading: "Legal",
    legalPrivacy: "Privacidade",
    legalTerms: "Termos",
    copyright: "© 2026 Bikit. Todos os direitos reservados.",
    madeFor: "Feito para quem gosta de cuidar da própria bicicleta.",
  },
};

export default pt;
