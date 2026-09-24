/**
 * Pro dictionary, namespace `compare` (2026-09-24): the setups page —
 * the comparison table and the "i"s that explain each of its figures,
 * the detail cards, the best setup at the foot, the dynamics radar with
 * its four axes, and the reasons a report has no earlier setup to set
 * itself against (setup-compare.ts).
 *
 * The columns and the axes are keyed by a name of their own, not by the
 * report's metric labels: those labels are the lookup keys into the
 * report and live in the components, in one table each, so the words
 * can move without the lookups moving.
 */

export type CompareColumnKey =
  | "speed"
  | "retention"
  | "harshness"
  | "chassis"
  | "chatter"
  | "settle"
  | "impacts";

export interface CompareColumnWords {
  /** The heading in full — the popover's title and its aria-label. The
   * band, when there is one, is printed light after the name, so it is
   * part of this. */
  name: string;
  /** The heading over the column. */
  short: string;
  /** What the figure is and which way is better. */
  description: string;
  /** How the figure is computed, under "How it is computed:". */
  method?: string;
  /** A last line for a term the description leans on. */
  footnote?: string;
}

export type CompareAxisKey = "absorption" | "control" | "recovery" | "support";

export interface CompareAxisWords {
  name: string;
  /** What the axis reads, in one line (the supplied layout's). */
  description: string;
  /** The figures it is made of, in words, for the bullet under the
   * description. */
  parts: string;
}

/** RMS, for the "i"s that lean on it (by request, 2026-09-12). */
const RMS_NOTE_EN =
  "*RMS: the root of the mean of the squares — the average level of a force that oscillates, counting what goes up and what goes down alike. A peak value says how high the worst instant was; the RMS says how much there was in all.";
const RMS_NOTE_PT =
  "*RMS: a raiz da média dos quadrados — o nível médio de uma força que oscila, contando igual o que sobe e o que desce. Um valor de pico diz quão alto foi o pior instante; o RMS diz quanto houve ao todo.";

const columnsEn: Record<CompareColumnKey, CompareColumnWords> = {
  speed: {
    name: "Average speed",
    short: "Average speed",
    description:
      "The average speed while moving, above 3 km/h, read off the series that fuses the GPS with the accelerometer. It has no better side: it is the rider's and the day's, not the setup's.",
  },
  retention: {
    name: "Corner retention",
    short: "Retention",
    description:
      "How much of the entry speed is kept at the exit of the corners, correcting for the pull of the descent's gravity. The value is the average over every corner of the run. More is better: it means more speed carried through the corners.",
  },
  harshness: {
    name: "Harshness",
    short: "Harshness",
    description:
      "How much of the trail's hardest hits reaches the frame, relative to the bike's normal vibration in the rough. Less is better: it means the suspension is absorbing the hits rather than passing them on to the frame.",
    method:
      "Compares the 99th percentile of the impacts with the mean level (RMS) of the dynamic force in the rough. A higher value means hits that stand out more from the normal vibration.",
    footnote: RMS_NOTE_EN,
  },
  chassis: {
    name: "Chassis Movement 2–12 Hz",
    short: "Chassis Movement",
    description:
      "How much the bike moves and oscillates in the rough, in the frequencies most associated with the movement of the chassis and the suspension. Less is better: it means a bike that is steadier and more controlled over the terrain.",
    method:
      "Measures the RMS of the dynamic force between 2 and 12 Hz in the rough. This band holds the relatively slow movements of the chassis, where the suspension's compression has the most say.",
    footnote: RMS_NOTE_EN,
  },
  chatter: {
    name: "Chatter 12–60 Hz",
    short: "Chatter",
    description:
      "How much of the trail's fast vibration and small hits reaches the frame in the rough. Less is better: it means tyres and suspension are filtering the trail's fast irregularities better.",
    method:
      "Measures the RMS of the dynamic force between 12 and 60 Hz in the rough. This band holds the fast vibration set off by small rocks, roots, successive irregularities and other sources of chatter.",
    footnote: RMS_NOTE_EN,
  },
  settle: {
    name: "Residual oscillation",
    short: "Residual oscillation",
    description:
      "How much movement goes on in the frame after an impact. Less is better: it means the suspension settles the bike faster after each hit.",
    method:
      "Measures the energy left in the 2–12 Hz band during the 300 ms after each impact, relative to the impact's own intensity. The result is the median over every impact analysed in the run.",
  },
  impacts: {
    name: "Impacts",
    short: "Impacts",
    description:
      "How many hard impacts the bike takes per kilometre. It describes how intense the pass was, but more or fewer impacts does not necessarily mean better or worse.",
    method:
      "Counts the impacts above a threshold set for each run — 1.5× the 99th percentile of the recording itself — and normalises the count by the distance covered. Because the threshold adapts to each run, this metric is more useful for characterising the session than for comparing setups directly.",
  },
};

const columnsPt: Record<CompareColumnKey, CompareColumnWords> = {
  speed: {
    name: "Velocidade média",
    short: "Velocidade média",
    description:
      "A velocidade média em andamento, acima de 3 km/h, lida da série que funde o GPS com o acelerómetro. Não tem lado melhor: é do rider e do dia, não da afinação.",
  },
  retention: {
    name: "Retenção nas curvas",
    short: "Retenção",
    description:
      "Quanto da velocidade de entrada é mantida à saída das curvas, corrigindo o efeito da gravidade da descida. O valor representa a média de todas as curvas da volta. Mais é melhor: indica maior conservação de velocidade ao longo das curvas.",
  },
  harshness: {
    name: "Harshness",
    short: "Harshness",
    description:
      "Quanto dos impactos mais fortes do terreno chega ao quadro, em relação à vibração normal da bicicleta nas zonas acidentadas. Menos é melhor: significa que a suspensão está a absorver melhor os impactos em vez de os transmitir ao quadro.",
    method:
      "Compara o percentil 99 dos impactos com o nível médio (RMS) da força dinâmica nas zonas acidentadas. Um valor mais alto indica impactos mais destacados em relação à vibração normal.",
    footnote: RMS_NOTE_PT,
  },
  chassis: {
    name: "Chassis Movement 2–12 Hz",
    short: "Chassis Movement",
    description:
      "Quanto a bicicleta se movimenta e oscila nas zonas acidentadas, nas frequências mais associadas ao movimento do chassis e da suspensão. Menos é melhor: significa uma bicicleta mais estável e controlada sobre o terreno.",
    method:
      "Mede o RMS da força dinâmica entre 2 e 12 Hz nas zonas acidentadas. Esta banda representa movimentos relativamente lentos do chassis, onde a compressão da suspensão tem maior influência.",
    footnote: RMS_NOTE_PT,
  },
  chatter: {
    name: "Chatter 12–60 Hz",
    short: "Chatter",
    description:
      "Quanto das vibrações rápidas e dos pequenos impactos do terreno chega ao quadro nas zonas acidentadas. Menos é melhor: significa que pneus e suspensão estão a filtrar melhor as irregularidades rápidas do terreno.",
    method:
      "Mede o RMS da força dinâmica entre 12 e 60 Hz nas zonas acidentadas. Esta banda representa vibrações rápidas provocadas por pequenas pedras, raízes, irregularidades sucessivas e outras fontes de chatter.",
    footnote: RMS_NOTE_PT,
  },
  settle: {
    name: "Oscilação residual",
    short: "Oscilação residual",
    description:
      "Quanto movimento continua no quadro depois de um impacto. Menos é melhor: significa que a suspensão estabiliza a bicicleta mais rapidamente após cada pancada.",
    method:
      "Mede a energia que permanece na banda de 2–12 Hz durante os 300 ms após cada impacto, relativamente à intensidade do próprio impacto. O resultado representa a mediana de todos os impactos analisados na volta.",
  },
  impacts: {
    name: "Impactos",
    short: "Impactos",
    description:
      "Quantos impactos fortes a bicicleta recebe por quilómetro. Este valor descreve a intensidade da passagem, mas mais ou menos impactos não significa necessariamente melhor ou pior.",
    method:
      "Conta os impactos que ultrapassam um limiar definido para cada volta — 1,5× o percentil 99 da própria gravação — e normaliza o resultado pela distância percorrida. Como o limiar se adapta a cada volta, esta métrica é mais útil para caracterizar a sessão do que para comparar diretamente diferentes setups.",
  },
};

/** Clockwise from the top: absorption, control, support, recovery — the
 * supplied layout's compass. The order is setup-dynamics.ts's; these are
 * only the words. */
const axesEn: Record<CompareAxisKey, CompareAxisWords> = {
  absorption: {
    name: "Absorption",
    description: "How much of the trail reaches the chassis and the rider",
    parts: "Harshness and chatter in rough terrain",
  },
  control: {
    name: "Control",
    description: "How well it settles after each hit",
    parts: "Residual oscillation after an impact",
  },
  support: {
    name: "Support",
    description:
      "How much the chassis resists weight transfers and compressions",
    parts: "Frame pitch in rough terrain",
  },
  recovery: {
    name: "Recovery",
    description: "How well it copes with successive impacts",
    parts: "What is left of one impact when the next arrives",
  },
};

const axesPt: Record<CompareAxisKey, CompareAxisWords> = {
  absorption: {
    name: "Absorção",
    description: "Quanto do terreno chega ao chassis e ao rider",
    parts: "Harshness e chatter em terreno acidentado",
  },
  control: {
    name: "Controlo",
    description: "Capacidade de estabilizar depois de cada pancada",
    parts: "Oscilação residual depois de um impacto",
  },
  support: {
    name: "Suporte",
    description: "Quanto o chassis resiste a transferências e compressões",
    parts: "Pitch do quadro em terreno acidentado",
  },
  recovery: {
    name: "Recuperação",
    description: "Capacidade de lidar com impactos sucessivos",
    parts: "O que sobra de um impacto quando chega o seguinte",
  },
};

const en = {
  columns: columnsEn,
  axes: axesEn,

  /** The knobs in full, for the detail cards' titles (the supplied layout
   * says "High-Speed Compression", not "HSC"), keyed by the change's
   * `knob` (the setup field), which is the same in every language. The
   * clicks keep their short names: LSC, HSC, C, R… are the names. */
  knobs: {
    compressionLow: "Low-Speed Compression",
    compressionHigh: "High-Speed Compression",
    reboundLow: "Low-Speed Rebound",
    reboundHigh: "High-Speed Rebound",
    compression: "Compression",
    rebound: "Rebound",
    pressurePsi: "Pressure",
    springRateLbs: "Spring",
    travelMm: "Travel",
    sagMm: "SAG",
    frontPsi: "Front tyre",
    rearPsi: "Rear tyre",
    weightKg: "Weight",
  } as Record<string, string>,

  /** What a change is of, when the bike does not name its dampers. */
  parts: {
    fork: "Fork",
    shock: "Shock",
    tires: "Tyres",
    rider: "Rider",
  },
  clicks: (n: number): string => (n === 1 ? "click" : "clicks"),

  /** "Appears once the sessions are read." — the detail cards, the best
   * setup and the radar all wait for the files the same way. */
  waitingForSessions: "Appears once the sessions are read.",

  header: {
    /** The bike's name over the title, when the session has no bike. */
    fallbackBike: "Setups",
    title: "Compare setups",
    reference: "Reference:",
    /** "3 other runs of the same bike and the same rider on the same
     * trail". */
    otherRuns: (n: number, sameRider: boolean): string =>
      `${n === 1 ? "1 other run" : `${n} other runs`} of the same bike${sameRider ? " and the same rider" : ""} on the same trail`,
    leftOutNoGps:
      "this recording has no GPS, so there is no telling which of the other runs were on this trail",
    leftOutOtherTrail: (n: number): string =>
      n === 1
        ? "1 run of this bike was left out for being on another trail or without GPS"
        : `${n} runs of this bike were left out for being on another trail or without GPS`,
    leftOutOtherRider: (n: number): string =>
      n === 1 ? "1 was with another rider" : `${n} were with another rider`,
  },

  filters: {
    setup: "Setup",
    allSetups: "All setups",
    setupOption: (letter: string): string => `Setup ${letter}`,
    noSetup: "No setup",
    order: "Order",
    groupedBySetup: "Grouped by setup",
    newestFirst: "Newest first",
  },

  reading: (done: number, total: number): string =>
    `Reading ${done} of ${total} ${total === 1 ? "session" : "sessions"}…`,

  table: {
    title: "Setup comparison",
    intro:
      "Compare the setups to see which gives the best balance between speed, control and absorption of the terrain.",
    session: "Session",
    setup: "Setup",
    setupDescription:
      "The bike's setup on that run. The same letter is the same set of values; the pills say what differs from the reference and which way. Click the setup to see every value.",
    noOtherWithSetup: "No other run with this setup.",
    onlyThisRun:
      "Only this run, for now. The ones you import of this bike on this trail join on their own.",
  },

  row: {
    fullSetup: (letter: string): string => `The full setup ${letter}`,
    noSetup: "No setup",
  },

  details: {
    title: "In detail",
    intro:
      "Each setup against the reference, knob by knob, and what the two figures the choice rests on did with it.",
    changeOf: "Change of",
    reference: "Reference",
    setupValue: (letter: string): string => `setup ${letter}`,
    medianOf: (n: number): string => `median of ${n}`,
    runsRange: "runs",
    withinSpread: "within the spread between runs",
    /** The noise is already formatted, with its unit. */
    withinNoise: (noise: string): string =>
      `within the noise between runs on one setup (${noise})`,
    aboveBetter: "above the spread between runs · better",
    aboveWorse: "above the spread between runs · worse",
    above: "above the spread between runs",
  },

  best: {
    title: "The best setup so far",
    onlyOne:
      "It is the only setup recorded on this trail. It has not been tested or compared with another yet, so there is no saying whether it is the best.",
    /** The margin and the noise arrive formatted, signed where signed. */
    withinNoise: (
      letter: string,
      other: string,
      margin: string,
      noise: string,
    ): string =>
      `Setup ${letter}, by median corner retention — but the gap to ${other} (${margin} points) does not clear the noise between runs on one setup (${noise} points). It does not separate the two yet.`,
    /** `value` is the percentage, formatted; `over` the runner-up and the
     * signed margin, when there is one. */
    clear: (
      letter: string,
      value: string,
      runs: number,
      over: { letter: string; margin: string } | null,
    ): string =>
      `Setup ${letter}, by median corner retention: ${value} over ${runs === 1 ? "one run" : `${runs} runs`}${over ? `, ${over.margin} points over ${over.letter}` : ""}.${runs === 1 ? " With one run only, the difference may be the day and not the setup." : ""}`,
  },

  metricInfo: {
    whatIs: (label: string): string => `What is ${label}`,
    method: "How it is computed:",
  },

  /** The tiles' blocks: fork and shock keep their English names by the
   * supplied layout; the tyres' block and its cells are prose. */
  blocks: {
    tires: "Tyres",
    pressure: "Pressure",
    front: "Front",
    rear: "Rear",
  },

  dynamics: {
    title: "Setup dynamics",
    subtitle: "Balance and behaviour of the setup",
    firstSetup: "First setup",
    secondSetup: "Second setup",
    vs: "vs",
    noSetups: "Record the setup of this trail's runs to see them here.",
    needTwo:
      "Appears once there are two setups on this trail: each axis measures one setup against the other.",
    scale: (span: number): string =>
      `100% is the best of the setups on each axis. Each ring is one noise between runs on one setup: inside the first in from the rim is a tie; at ${span} noises the axis reaches zero.`,
    explanation: "Explanation",
    /** The chart's aria-label: "Setup dynamics: Setup A vs Setup B". */
    chartLabel: (setups: string[]): string =>
      `Setup dynamics: ${setups.join(" vs ")}`,
    readingSessions: "Reading the sessions…",
  },

  /** Why a report has no earlier setup to set itself against
   * (pickSetupComparison). */
  pick: {
    noSetup:
      "Record this run's setup to compare it with the bike's previous one.",
    noOther: "There is no other run of this bike with a different setup yet.",
    noGps:
      "Without GPS on this recording there is no telling whether the other setups were on the same trail.",
    otherTrail: (name: string): string =>
      `The last run with another setup (${name}) was on another trail, and only the same trail tells the setup from the terrain.`,
  },
};

const pt: typeof en = {
  columns: columnsPt,
  axes: axesPt,

  knobs: {
    compressionLow: "Low-Speed Compression",
    compressionHigh: "High-Speed Compression",
    reboundLow: "Low-Speed Rebound",
    reboundHigh: "High-Speed Rebound",
    compression: "Compressão",
    rebound: "Rebound",
    pressurePsi: "Pressão",
    springRateLbs: "Mola",
    travelMm: "Curso",
    sagMm: "SAG",
    frontPsi: "Pneu da frente",
    rearPsi: "Pneu de trás",
    weightKg: "Peso",
  },

  parts: {
    fork: "Garfo",
    shock: "Amortecedor",
    tires: "Pneus",
    rider: "Rider",
  },
  clicks: (n) => (n === 1 ? "clique" : "cliques"),

  waitingForSessions: "Aparece quando as sessões estiverem lidas.",

  header: {
    fallbackBike: "Afinações",
    title: "Comparar afinações",
    reference: "Referência:",
    otherRuns: (n, sameRider) =>
      `${n === 1 ? "1 outra volta" : `${n} outras voltas`} da mesma bicicleta${sameRider ? " e do mesmo rider" : ""} na mesma pista`,
    leftOutNoGps:
      "esta gravação não tem GPS, por isso não há como saber quais das outras voltas foram nesta pista",
    leftOutOtherTrail: (n) =>
      n === 1
        ? "1 volta desta bicicleta ficou de fora por ser noutra pista ou sem GPS"
        : `${n} voltas desta bicicleta ficaram de fora por serem noutra pista ou sem GPS`,
    leftOutOtherRider: (n) =>
      n === 1 ? "1 foi com outro rider" : `${n} foram com outro rider`,
  },

  filters: {
    setup: "Afinação",
    allSetups: "Todas as afinações",
    setupOption: (letter) => `Afinação ${letter}`,
    noSetup: "Sem afinação",
    order: "Ordem",
    groupedBySetup: "Agrupadas por afinação",
    newestFirst: "Mais recentes primeiro",
  },

  reading: (done, total) =>
    `A ler ${done} de ${total} ${total === 1 ? "sessão" : "sessões"}…`,

  table: {
    title: "Comparação dos setups",
    intro:
      "Compara os setups para perceber qual oferece o melhor equilíbrio entre velocidade, controlo e absorção do terreno.",
    session: "Sessão",
    setup: "Afinação",
    setupDescription:
      "A afinação da bicicleta nessa volta. A mesma letra é o mesmo conjunto de valores; as cápsulas dizem o que difere da referência e para que lado. Clica no setup para ver todos os valores.",
    noOtherWithSetup: "Nenhuma outra volta com esta afinação.",
    onlyThisRun:
      "Só esta volta, por enquanto. As que importares desta bicicleta nesta pista entram sozinhas.",
  },

  row: {
    fullSetup: (letter) => `A afinação ${letter} completa`,
    noSetup: "Sem afinação",
  },

  details: {
    title: "Em detalhe",
    intro:
      "Cada afinação face à referência, botão a botão, e o que as duas figuras da escolha fizeram com ela.",
    changeOf: "Alteração de",
    reference: "Referência",
    setupValue: (letter) => `setup ${letter}`,
    medianOf: (n) => `mediana de ${n}`,
    runsRange: "voltas",
    withinSpread: "dentro da variação entre voltas",
    withinNoise: (noise) => `dentro do ruído entre voltas iguais (${noise})`,
    aboveBetter: "acima da variação entre voltas · melhor",
    aboveWorse: "acima da variação entre voltas · pior",
    above: "acima da variação entre voltas",
  },

  best: {
    title: "O melhor setup até agora",
    onlyOne:
      "É a única afinação registada nesta pista. Ainda não foi testada nem comparada com outra, por isso não há como dizer se é a melhor.",
    withinNoise: (letter, other, margin, noise) =>
      `Setup ${letter}, pela retenção mediana nas curvas — mas a diferença para o ${other} (${margin} pontos) não passa o ruído entre voltas iguais (${noise} pontos). Ainda não separa os dois.`,
    clear: (letter, value, runs, over) =>
      `Setup ${letter}, pela retenção mediana nas curvas: ${value} em ${runs === 1 ? "uma volta" : `${runs} voltas`}${over ? `, ${over.margin} pontos sobre o ${over.letter}` : ""}.${runs === 1 ? " Com uma volta só, a diferença pode ser o dia e não a afinação." : ""}`,
  },

  metricInfo: {
    whatIs: (label) => `O que é ${label}`,
    method: "Como é calculado:",
  },

  blocks: {
    tires: "Pneus",
    pressure: "Pressão",
    front: "Frente",
    rear: "Trás",
  },

  dynamics: {
    title: "Dinâmica do setup",
    subtitle: "Equilíbrio e comportamento do setup",
    firstSetup: "Primeiro setup",
    secondSetup: "Segundo setup",
    vs: "vs",
    noSetups: "Regista a afinação das voltas desta pista para as ver aqui.",
    needTwo:
      "Aparece quando houver duas afinações nesta pista: cada eixo mede um setup contra o outro.",
    scale: (span) =>
      `100 % é o melhor dos setups em cada eixo. Cada anel é um ruído entre voltas iguais: dentro do primeiro a contar do aro é empate; a ${span} ruídos o eixo chega a zero.`,
    explanation: "Explicação",
    chartLabel: (setups) => `Dinâmica do setup: ${setups.join(" contra ")}`,
    readingSessions: "A ler as sessões…",
  },

  pick: {
    noSetup:
      "Regista a afinação desta volta para a comparar com a anterior da bicicleta.",
    noOther:
      "Ainda não há outra volta desta bicicleta com uma afinação diferente.",
    noGps:
      "Sem GPS nesta gravação não há como saber se as outras afinações foram na mesma pista.",
    otherTrail: (name) =>
      `A última volta com outra afinação (${name}) foi noutra pista, e só a mesma pista separa a afinação do terreno.`,
  },
};

export const compare = { en, pt };
