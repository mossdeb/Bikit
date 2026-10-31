import type { LegalDictionary } from "./legal-en";

const pt: LegalDictionary = {
  updated: "30 de outubro de 2026",
  updatedLabel: "Última atualização",
  backToHome: "Voltar ao início",

  privacy: {
    metaTitle: "Política de Privacidade — Bikit",
    metaDescription: "O que o Bikit guarda sobre ti, porque o guarda, e quais são os teus direitos.",
    title: "Política de Privacidade",
    intro: [
      "O Bikit é um serviço independente de telemetria e manutenção de bicicletas, criado e mantida por um único programador, não por uma empresa. Esta Política de Privacidade explica que informação o Bikit guarda, porque a guarda, e quais são os teus direitos.",
      "Esta política aplica-se ao bikit.app e à aplicação Bikit instalada no teu dispositivo.",
    ],
    controller: {
      heading: "Quem é o responsável",
      nameLabel: "Responsável pelo tratamento",
      emailLabel: "Contacto",
      countryLabel: "País",
    },
    sections: [
      {
        heading: "O que o Bikit guarda",
        blocks: [
          {
            kind: "p",
            text: "O Bikit guarda apenas a informação necessária para prestar o serviço. Tudo o que se segue é informação introduzida por ti ou dados devolvidos por um serviço que escolheste ligar.",
          },
          {
            kind: "term",
            title: "Conta",
            paragraphs: [
              "O teu email, o teu nome (caso o tenhas indicado) e as tuas preferências, incluindo idioma, unidade de distância e definições de notificação.",
              "Se entrares com email e palavra-passe, a autenticação é gerida com segurança pelo Supabase. O Bikit nunca tem acesso à tua palavra-passe.",
            ],
          },
          {
            kind: "term",
            title: "Entrar com a Google",
            paragraphs: [
              "Se escolheres entrar com a Google, a Google fornece o teu nome, o teu email e um identificador estável da conta. A tua palavra-passe da Google nunca é partilhada com o Bikit.",
            ],
          },
          {
            kind: "term",
            title: "As tuas bicicletas",
            paragraphs: [
              "Informação sobre as tuas bicicletas, incluindo nome, marca, modelo, ano, tipo, cor, número de série, tamanho de quadro e de roda, data de compra, informação de garantia, fotografias e notas.",
              "A maior parte desta informação é opcional e só é guardada se optares por a fornecer.",
            ],
          },
          {
            kind: "term",
            title: "Componentes e manutenção",
            paragraphs: [
              "Informação sobre os teus componentes, incluindo categoria, marca, modelo, número de série, data de instalação, intervalos de manutenção e lembretes.",
              "O Bikit guarda também cada manutenção, reparação ou substituição que registas, incluindo a data, as notas e a quilometragem ou utilização da bicicleta nesse momento.",
            ],
          },
          {
            kind: "term",
            title: "Totais de utilização",
            paragraphs: [
              "Os quilómetros e as horas acumulados de cada bicicleta, introduzidos manualmente por ti.",
            ],
          },
          {
            kind: "term",
            title: "Notificações push (opcional)",
            paragraphs: [
              "Se ativares as notificações push, o Bikit guarda o endereço do dispositivo atribuído pelo teu browser, as chaves de encriptação associadas e o user agent do browser, para poder entregar as notificações.",
            ],
          },
          {
            kind: "term",
            title: "Pagamentos (opcional)",
            paragraphs: [
              "Se subscreveres um plano pago, o Bikit guarda o teu identificador de cliente no Stripe, o identificador da subscrição, o plano e o respetivo estado.",
              "Os dados do teu cartão nunca chegam ao Bikit. Os pagamentos são processados inteiramente pelo Stripe.",
            ],
          },
          {
            kind: "term",
            title: "Lista de espera (opcional)",
            paragraphs: [
              "Se entrares na lista de espera na página inicial, o Bikit guarda o teu endereço de email, o idioma da página e a data de inscrição. Não precisas de conta para te inscreveres.",
            ],
          },
          {
            kind: "term",
            title: "Histórico de notificações",
            paragraphs: [
              "O Bikit guarda um registo das notificações de manutenção já enviadas, para a mesma notificação não ser entregue várias vezes.",
            ],
          },
        ],
      },
      {
        heading: "Como são usados os teus dados",
        blocks: [
          {
            kind: "p",
            text: "A tua informação é usada apenas para prestar o serviço que subscreveste, nomeadamente:",
          },
          {
            kind: "ul",
            items: [
              "gerir a tua conta;",
              "guardar as tuas bicicletas e o historial de manutenção;",
              "calcular os planos de manutenção;",
              "enviar os lembretes de manutenção que pediste;",
              "enviar o email de agradecimento da lista de espera e novidades sobre o BIKIT e o acesso antecipado (se entraste na lista de espera);",
              "processar subscrições (quando aplicável);",
              "manter o serviço seguro e fiável.",
            ],
          },
          { kind: "p", text: "São estas as únicas finalidades para que os teus dados são usados." },
          {
            kind: "p",
            text: "O Bikit não vende a tua informação pessoal, não a partilha para fins publicitários, não constrói perfis publicitários, e não usa ferramentas de análise, rastreadores publicitários ou instrumentos de perfilagem de terceiros.",
          },
        ],
      },
      {
        heading: "Fundamento legal (RGPD)",
        blocks: [
          {
            kind: "p",
            text: "Ao abrigo do Regulamento Geral sobre a Proteção de Dados (RGPD), o Bikit trata a tua informação com base nos seguintes fundamentos legais:",
          },
          {
            kind: "term",
            title: "Execução de um contrato",
            paragraphs: [
              "Disponibilizar a tua conta, guardar os teus dados e prestar as funcionalidades centrais de manutenção. Sem este tratamento, o serviço não pode funcionar.",
            ],
          },
          {
            kind: "term",
            title: "Consentimento",
            paragraphs: [
              "Ativar as notificações push e subscrever o resumo semanal por email, que é opcional.",
              "Podes retirar o teu consentimento a qualquer momento nas definições da aplicação, sem afetar o resto do serviço.",
              "Entrar na lista de espera. Para retirares este consentimento e saíres da lista, escreve para o contacto indicado acima.",
            ],
          },
          {
            kind: "term",
            title: "Obrigação legal",
            paragraphs: [
              "Conservar registos de faturação e contabilidade quando a legislação fiscal aplicável o exigir.",
            ],
          },
          {
            kind: "term",
            title: "Interesse legítimo",
            paragraphs: ["Proteger o serviço, prevenir abusos e manter a segurança."],
          },
        ],
      },
      {
        heading: "Prestadores de serviços",
        blocks: [
          {
            kind: "p",
            text: "O Bikit assenta num pequeno número de prestadores de confiança, que tratam dados apenas para entregar os serviços de que o Bikit depende.",
          },
          {
            kind: "ul",
            items: [
              "Supabase — autenticação e alojamento da base de dados.",
              "Vercel — alojamento do site e da aplicação, e medição de audiência sem cookies nas páginas públicas.",
              "Stripe — processamento de subscrições e pagamentos.",
              "Resend — envio de emails.",
              "Google — entrar com a Google (apenas se o escolheres).",
              "Serviços de push da Apple, Google e Mozilla — entrega das notificações push (apenas se estiverem ativas). Estes prestadores recebem apenas o conteúdo encriptado da notificação e o endereço do dispositivo necessário à entrega.",
            ],
          },
        ],
      },
      {
        heading: "Onde ficam guardados os teus dados",
        blocks: [
          {
            kind: "p",
            text: "A base de dados principal está alojada na União Europeia (Irlanda).",
          },
          {
            kind: "p",
            text: "Alguns prestadores podem tratar informação limitada fora da União Europeia. Quando isso acontece, fazem-no ao abrigo de garantias adequadas, como as Cláusulas Contratuais-Tipo da Comissão Europeia ou outros mecanismos legais de transferência reconhecidos.",
          },
        ],
      },
      {
        heading: "Durante quanto tempo são conservados",
        blocks: [
          { kind: "p", text: "A tua informação é conservada enquanto a tua conta existir." },
          {
            kind: "p",
            text: "As inscrições na lista de espera são conservadas até pedires para ser removido ou até a lista terminar, consoante o que acontecer primeiro.",
          },
          {
            kind: "p",
            text: "Se apagares uma bicicleta, um componente ou um registo de manutenção, este é removido da base de dados ativa.",
          },
          {
            kind: "p",
            text: "Se apagares a tua conta, os teus dados pessoais são removidos definitivamente, exceto quando determinados registos tiverem de ser conservados para cumprir obrigações legais.",
          },
          {
            kind: "p",
            text: "As cópias de segurança encriptadas podem conter temporariamente informação já apagada, até serem automaticamente substituídas.",
          },
          {
            kind: "p",
            text: "O Stripe pode conservar registos de faturação de forma autónoma, durante o período exigido pela legislação fiscal aplicável.",
          },
        ],
      },
      {
        heading: "Os teus direitos",
        blocks: [
          { kind: "p", text: "Ao abrigo do RGPD, tens o direito de:" },
          {
            kind: "ul",
            items: [
              "aceder aos teus dados pessoais;",
              "corrigir informação inexata;",
              "pedir o apagamento dos teus dados;",
              "receber uma cópia portátil dos teus dados;",
              "opor-te a determinadas operações de tratamento;",
              "retirar o consentimento a qualquer momento, quando o tratamento se basear em consentimento.",
            ],
          },
          {
            kind: "p",
            text: "Muitas destas ações podem ser feitas diretamente na aplicação. Para as restantes, escreve para o endereço de email indicado acima e terás resposta no prazo de 30 dias.",
          },
          {
            kind: "p",
            text: "Se considerares que os teus dados pessoais foram tratados de forma ilícita, podes apresentar reclamação à Comissão Nacional de Proteção de Dados (CNPD) ou à autoridade de controlo do país onde resides.",
          },
        ],
      },
      {
        heading: "Segurança",
        blocks: [
          {
            kind: "p",
            text: "O Bikit usa medidas de segurança correntes na indústria para proteger os teus dados, incluindo ligações HTTPS encriptadas, autenticação segura e acesso restrito aos sistemas de produção.",
          },
          {
            kind: "p",
            text: "Nenhum serviço em linha pode garantir segurança absoluta, mas estão implementadas medidas técnicas e organizativas razoáveis para proteger a tua informação.",
          },
        ],
      },
      {
        heading: "Cookies",
        blocks: [
          { kind: "p", text: "O Bikit usa apenas cookies essenciais. São eles:" },
          {
            kind: "ul",
            items: [
              "um cookie de sessão que te mantém com sessão iniciada;",
              "um cookie de preferência de idioma para o site.",
            ],
          },
          {
            kind: "p",
            text: "A tua preferência de tema claro ou escuro fica guardada localmente no teu browser e nunca é transmitida ao Bikit.",
          },
          {
            kind: "p",
            text: "O Bikit não usa cookies de publicidade nem cookies de análise, e não te segue por outros sites.",
          },
          {
            kind: "p",
            text: "Nas páginas públicas — a página inicial, estes documentos e os ecrãs de entrada e de registo — é feita uma medição de audiência sem cookies, pela Vercel, que aloja o Bikit. Regista de forma agregada a página visitada, a origem da visita e o tipo de dispositivo, sem guardar nada no teu dispositivo e sem te identificar. Depois de entrares na aplicação não há medição nenhuma: o que fazes com as tuas bicicletas e componentes não é observado.",
          },
        ],
      },
      {
        heading: "Privacidade de menores",
        blocks: [
          {
            kind: "p",
            text: "O Bikit não se destina a menores de 16 anos, e não devem ser criadas contas em nome deles.",
          },
        ],
      },
      {
        heading: "Alterações a esta Política de Privacidade",
        blocks: [
          { kind: "p", text: "Esta Política de Privacidade pode ser atualizada periodicamente." },
          {
            kind: "p",
            text: "Quando houver alterações, a data de Última atualização no topo desta página é atualizada. Se alguma alteração afetar de forma relevante os teus direitos ou a forma como a tua informação é tratada, o Bikit avisa-te através da aplicação ou por email, conforme for adequado.",
          },
        ],
      },
    ],
  },

  terms: {
    metaTitle: "Termos de Serviço — Bikit",
    metaDescription: "O acordo entre ti e quem mantém o Bikit.",
    title: "Termos de Serviço",
    intro: [
      "Estes Termos de Serviço constituem o acordo entre ti e quem mantém o Bikit. Ao criares uma conta ou ao usares o Bikit, aceitas estes Termos.",
      "Estes Termos aplicam-se ao bikit.app e à aplicação Bikit.",
    ],
    controller: {
      heading: "Quem é o responsável",
      nameLabel: "Responsável",
      emailLabel: "Contacto",
      countryLabel: "País",
    },
    sections: [
      {
        heading: "O que é o Bikit",
        blocks: [
          {
            kind: "p",
            text: "O Bikit é uma ferramenta para registares as tuas bicicletas, os seus componentes e a sua manutenção, e para te lembrar quando um serviço está a chegar.",
          },
          {
            kind: "p",
            text: "Destina-se exclusivamente a servir de registo e de lembrete de manutenção.",
          },
        ],
      },
      {
        heading: "O Bikit não inspeciona a tua bicicleta",
        blocks: [
          {
            kind: "p",
            text: "Todos os lembretes de manutenção que o Bikit mostra assentam inteiramente na informação de que a aplicação dispõe: os intervalos de manutenção que configuraste e a quilometragem ou utilização reportada por ti.",
          },
          {
            kind: "p",
            text: "O Bikit não tem forma de determinar o estado real de qualquer bicicleta ou componente.",
          },
          {
            kind: "p",
            text: "Um componente pode precisar de manutenção antes do intervalo previsto, e um componente que já ultrapassou o intervalo pode continuar em bom estado. Um estado verde ou uma barra de saúde cheia nunca devem ser interpretados como uma inspeção de segurança ou uma avaliação profissional.",
          },
          {
            kind: "p",
            text: "Continuas a ser o único responsável por inspecionar, manter e usar a tua bicicleta em segurança. Se um componente afeta a tua segurança, como travões, direção, quadro ou suspensão, deve ser inspecionado por um mecânico qualificado.",
          },
        ],
      },
      {
        heading: "A tua conta",
        blocks: [
          { kind: "p", text: "Tens de ter pelo menos 16 anos para criares uma conta Bikit." },
          {
            kind: "p",
            text: "És responsável por manter a confidencialidade das tuas credenciais de acesso e por toda a atividade realizada através da tua conta.",
          },
          {
            kind: "p",
            text: "Se achares que a tua conta foi acedida sem a tua autorização, contacta o Bikit de imediato.",
          },
        ],
      },
      {
        heading: "Planos e pagamentos",
        blocks: [
          { kind: "p", text: "O Bikit tem um plano gratuito e subscrições pagas opcionais." },
          {
            kind: "p",
            text: "Os preços em vigor das subscrições são apresentados antes de concluíres a compra.",
          },
          { kind: "p", text: "As subscrições renovam automaticamente todos os meses até serem canceladas." },
          {
            kind: "p",
            text: "Se cancelares uma subscrição, esta mantém-se ativa até ao fim do período de faturação em curso e não renova depois disso.",
          },
          {
            kind: "p",
            text: "Os pagamentos são processados com segurança pelo Stripe. Os dados do teu cartão nunca são recebidos nem guardados pelo Bikit.",
          },
          {
            kind: "p",
            text: "Se fores consumidor na União Europeia, aplicam-se os direitos legais de cancelamento ou reembolso previstos na legislação de defesa do consumidor aplicável.",
          },
        ],
      },
      {
        heading: "O teu conteúdo",
        blocks: [
          {
            kind: "p",
            text: "As bicicletas, componentes, registos de manutenção, notas e restante informação que acrescentas continuam a ser teus.",
          },
          {
            kind: "p",
            text: "O Bikit guarda esta informação exclusivamente para prestar o serviço e não reivindica qualquer propriedade sobre o teu conteúdo.",
          },
          {
            kind: "p",
            text: "Podes editar ou apagar a tua informação a qualquer momento, e podes pedir uma cópia dos teus dados nos termos descritos na Política de Privacidade.",
          },
          {
            kind: "p",
            text: "És responsável por garantir que a informação que carregas é exata e que tens o direito de a carregar.",
          },
        ],
      },
      {
        heading: "Utilização aceitável",
        blocks: [
          { kind: "p", text: "Comprometes-te a não:" },
          {
            kind: "ul",
            items: [
              "aceder à conta ou aos dados de outro utilizador sem autorização;",
              "interferir com o serviço, sobrecarregá-lo ou perturbá-lo;",
              "tentar fazer engenharia inversa ou comprometer a aplicação;",
              "usar ferramentas automatizadas para abusar do serviço ou interferir com ele;",
              "revender, copiar ou apresentar o Bikit como produto teu;",
              "usar o Bikit para qualquer atividade ilícita.",
            ],
          },
        ],
      },
      {
        heading: "Disponibilidade",
        blocks: [
          {
            kind: "p",
            text: "O Bikit é um projeto independente mantido por um único programador.",
          },
          {
            kind: "p",
            text: "O serviço é prestado no estado em que se encontra e conforme a disponibilidade existente.",
          },
          {
            kind: "p",
            text: "Embora seja feito todo o esforço razoável para manter o Bikit disponível e fiável, não é possível garantir disponibilidade ininterrupta, funcionamento sem erros nem tempos de resposta determinados.",
          },
          {
            kind: "p",
            text: "As funcionalidades podem ser alteradas, substituídas ou removidas ao longo do tempo.",
          },
        ],
      },
      {
        heading: "Limitação de responsabilidade",
        blocks: [
          {
            kind: "p",
            text: "Nada nestes Termos exclui ou limita a responsabilidade nos casos em que a lei não o permite, incluindo a responsabilidade por dolo ou por morte ou danos pessoais causados por negligência.",
          },
          {
            kind: "p",
            text: "Na medida máxima permitida por lei, a responsabilidade total do Bikit decorrente da tua utilização do serviço fica limitada ao valor que pagaste pelo Bikit nos doze meses imediatamente anteriores ao facto que dá origem à reclamação.",
          },
        ],
      },
      {
        heading: "Propriedade intelectual",
        blocks: [
          {
            kind: "p",
            text: "O Bikit, incluindo o seu software, design, marca, logótipos e conteúdos do site, está protegido pelas leis de propriedade intelectual.",
          },
          {
            kind: "p",
            text: "Estes Termos não te conferem a propriedade do Bikit nem de qualquer dos seus direitos de propriedade intelectual.",
          },
        ],
      },
      {
        heading: "Suspensão e cessação",
        blocks: [
          { kind: "p", text: "Podes apagar a tua conta a qualquer momento." },
          {
            kind: "p",
            text: "O Bikit pode suspender ou encerrar contas que violem estes Termos de forma grave ou repetida.",
          },
          {
            kind: "p",
            text: "Sempre que for razoavelmente possível, serás informado antes de ser tomada uma medida definitiva e ser-te-á dada oportunidade de resolver a situação.",
          },
        ],
      },
      {
        heading: "Alterações a estes Termos",
        blocks: [
          { kind: "p", text: "Estes Termos podem ser atualizados periodicamente." },
          {
            kind: "p",
            text: "Sempre que houver alterações, a data de Última atualização no topo desta página é atualizada.",
          },
          {
            kind: "p",
            text: "Se as alterações afetarem de forma relevante os teus direitos, o Bikit dará aviso prévio razoável antes de produzirem efeitos.",
          },
          {
            kind: "p",
            text: "Continuar a usar o Bikit depois de os Termos atualizados entrarem em vigor constitui aceitação da versão revista.",
          },
        ],
      },
      {
        heading: "Lei aplicável",
        blocks: [
          { kind: "p", text: "Estes Termos regem-se pela lei portuguesa." },
          {
            kind: "p",
            text: "Se fores consumidor, continuas a beneficiar dos direitos imperativos de defesa do consumidor previstos na lei do país onde resides.",
          },
        ],
      },
      {
        heading: "Litígios",
        blocks: [
          {
            kind: "p",
            text: "Se tiveres dúvidas ou preocupações, contacta primeiro o Bikit. A maioria das questões resolve-se de forma rápida e informal.",
          },
          {
            kind: "p",
            text: "Se um litígio não puder ser resolvido, podes recorrer a qualquer entidade de resolução alternativa de litígios disponível ao abrigo da legislação de defesa do consumidor aplicável no teu país.",
          },
        ],
      },
      {
        heading: "Acordo integral",
        blocks: [
          {
            kind: "p",
            text: "Estes Termos de Serviço, em conjunto com a Política de Privacidade, constituem o acordo integral entre ti e o Bikit quanto à tua utilização do serviço.",
          },
        ],
      },
    ],
  },
};

export default pt;
