import type { FaqItem } from "@/components/faq-accordion";
import type { LandingDictionary } from "./en";

const pt: LandingDictionary = {
  nav: {
    features: "Funcionalidades",
    device: "O dispositivo",
    faq: "FAQ",
    login: "Entrar na beta",
    switchLanguage: "Idioma",
  },
  home: {
    waitlistEmail: {
      subject: "Já estás na lista de espera do BIKIT",
      heading: "Obrigado por te juntares à lista de espera",
      body1: "Já estás na lista. É bom ter-te connosco.",
      body2:
        "O BIKIT está em desenvolvimento e numa beta privada. Damos-te notícias e oportunidades de acesso antecipado assim que houver novidades.",
      cta: "Visitar o BIKIT",
      footer:
        "Recebeste este email porque este endereço entrou na lista de espera em bikit.app. Se não foste tu, podes ignorá-lo.",
    },
    hero: {
      kicker: "Percebe cada descida.",
      titleBold1: "Bike Intelligence",
      titleLight: "and",
      titleBold2: "Telemetry System",
      lead1: "Sê dos primeiros. Recebe novidades em primeira mão,",
      lead2: "benefícios exclusivos e acesso prioritário ao dispositivo BIKIT.",
      emailPlaceholder: "email",
      emailLabel: "O teu endereço de email",
      submit: "Entrar na lista de espera",
      sending: "A enviar…",
      success: "Já estás na lista. Entraremos em contacto.",
      invalid: "Escreve um endereço de email válido.",
      failed: "Não correu bem. Tenta outra vez.",
    },
    features: {
      badge: "Funcionalidades",
      title: "Tira mais de cada volta.",
      lead: "Cada movimento conta uma história. O BIKIT transforma-a em dados que consegues perceber.",
    },
    device: {
      badge: "O dispositivo",
      title: "Dispositivo pequeno. Dados poderosos.",
      lead1: "Um dispositivo de telemetria compacto e inteligente, feito para registar a tua volta com precisão.",
      lead2: "Monta-o, começa a gravar e explora o teu desempenho na plataforma BIKIT.",
      imageAlt: "O dispositivo de telemetria BIKIT",
      hint: "Arrasta para rodar",
      disclaimer: "Não representa design do produto final",
    },
    faq: {
      badge: "O essencial",
      title: "Perguntas frequentes",
      questions: [
        {
          question: "O que é o BIKIT?",
          answer:
            "O BIKIT é um sistema inteligente de telemetria que combina um registador de dados compacto com uma plataforma avançada de análise, ajudando os riders a perceber o comportamento da bicicleta, o desempenho da suspensão e a dinâmica da condução.",
        },
        {
          question: "Como funciona o BIKIT?",
          answer:
            "O dispositivo BIKIT regista dados de movimento e de impacto durante a tua volta. Depois de transferidos para a plataforma, os dados são transformados em visualizações intuitivas e informação sobre o teu desempenho.",
        },
        {
          question: "O BIKIT é compatível com a minha bicicleta?",
          answer:
            "O BIKIT está a ser desenvolvido para bicicletas de montanha e motas de motocross, com foco na versatilidade e na facilidade de instalação.",
        },
        {
          question: "Quando estará disponível o BIKIT?",
          answer:
            "O BIKIT está em desenvolvimento e em testes numa beta privada. Entra na nossa lista de espera para receberes novidades e oportunidades de acesso antecipado.",
        },
        {
          question: "Preciso de conhecimentos técnicos para usar o BIKIT?",
          answer:
            "De todo. O BIKIT foi pensado para tornar a telemetria avançada acessível a todos os riders, transformando dados complexos em informação clara e fácil de perceber.",
        },
      ] as FaqItem[],
    },
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
      {
        question: "Como instalo a Bikit no telemóvel?",
        answer:
          "A Bikit instala-se a partir do browser — não há nada para descarregar de uma loja de aplicações. Escolhe a tua plataforma.",
        sections: [
          {
            heading: "📱 iPhone (iOS)",
            steps: [
              "Abre o Safari — a instalação só funciona a partir do Safari.",
              "Vai a bikit.app.",
              "Toca no botão Partilhar.",
              "Escolhe Adicionar ao ecrã principal.",
              "Toca em Adicionar.",
            ],
          },
          {
            heading: "Requisitos",
            bullets: [
              "Recomenda-se iOS 16.4 ou posterior.",
              "A instalação só funciona a partir do Safari. Se estiveres no Chrome ou noutro browser, abre a Bikit no Safari para instalar — depois disso podes abri-la diretamente do ecrã principal.",
            ],
          },
          {
            heading: "🤖 Android",
            steps: [
              "Abre o browser (recomendamos o Chrome).",
              "Vai a bikit.app.",
              "Toca no menu ⋮.",
              "Escolhe Instalar aplicação ou Adicionar ao ecrã principal.",
              "Segue as instruções no ecrã.",
            ],
          },
          {
            heading: "Se não vires a opção",
            steps: [
              "Abre o Google Chrome.",
              "Vai a bikit.app.",
              "Toca em ⋮ → Adicionar ao ecrã principal → Instalar.",
              "Segue as instruções no ecrã.",
            ],
          },
          {
            heading: "Requisitos",
            intro:
              "Para a melhor experiência recomendamos Android 9.0 ou posterior com Chrome 90+, ou um browser recente baseado em Chromium.",
          },
          {
            heading: "💻 Mac (macOS)",
            steps: [
              "Abre o Safari.",
              "Vai a bikit.app.",
              "Clica em Partilhar na barra de ferramentas.",
              "Escolhe Adicionar à Dock.",
              "Confirma a instalação.",
            ],
          },
          {
            heading: "Requisitos",
            bullets: ["macOS Sonoma (14) ou posterior.", "A instalação só está disponível através do Safari."],
          },
          {
            heading: "Porquê instalar a Bikit?",
            intro: "Depois de instalada, a Bikit funciona como uma aplicação nativa:",
            bullets: [
              "🚴 Abre diretamente do ecrã principal ou da Dock.",
              "⚡ Arranque mais rápido e desempenho mais fluido.",
              "🔔 Recebe lembretes de manutenção e notificações.",
              "🌐 Ecrã inteiro, sem separadores do browser.",
              "📶 Continua a funcionar com ligação fraca, nas partes que o suportam.",
            ],
          },
        ],
      },
    ],
  },
  footer: {
    tagline: "Percebe a tua bicicleta. Liberta o teu potencial.",
    productHeading: "Produto",
    productLinks: [
      { label: "Funcionalidades", href: "#features" },
      { label: "FAQ", href: "#faq" },
    ],
    productSupport: "Ajuda e suporte",
    legalHeading: "Legal",
    legalPrivacy: "Privacidade",
    legalTerms: "Termos",
    copyright:
      "© 2026 BIKIT · Patent Pending · Portugal · INPI Request No. 20262008502041",
    madeFor: "Made by riders",
  },
};

export default pt;
