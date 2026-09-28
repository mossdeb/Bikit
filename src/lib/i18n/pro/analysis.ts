/**
 * Pro dictionary, namespace `analysis` (2026-09-24): the session's analysis
 * screen — imu-session-analysis.tsx, imu-chart.tsx and imu-session-map.tsx.
 * Grouped by what reads it: the series' names and explanations, the event
 * kinds, the event cards' titles and figure labels, the two filter menus,
 * the résumé tiles, the zoom row, the map, the reading panel, the frame
 * badges and the plot's own labels.
 *
 * Technical words stay as they are in both languages (Roll, Pitch, Yaw,
 * Roughness, Jerk, Lean, Rider, High-G, Drop, IMU): they are the lab's
 * vocabulary, not prose.
 */
const en = {
  loading: "Loading the session…",
  telemetry: "Telemetry",

  /** What the chart can draw: the pill's name, the two-word summary under
   * it, and the full sentence behind the (i). Keyed by the series id. */
  series: {
    gforce: {
      label: "G force",
      summary: "Acceleration",
      description: "Total acceleration magnitude — √(x²+y²+z²)",
    },
    ax: {
      label: "Accel X",
      summary: "Accelerating and braking",
      description: "Longitudinal acceleration — accelerating and braking",
    },
    ay: {
      label: "Accel Y",
      summary: "Corners and lateral movement",
      description: "Lateral acceleration — mostly corners and lateral movement",
    },
    az: {
      label: "Accel Z",
      summary: "Impacts and landings",
      description:
        "Vertical acceleration — impacts, terrain, jumps and landings",
    },
    gx: {
      label: "Roll (X)",
      summary: "Leaning the bike",
      description: "Rotation about the longitudinal axis — leaning the bike",
    },
    gy: {
      label: "Pitch (Y)",
      summary: "Pitching up and diving",
      description: "Rotation about the lateral axis — pitching up and diving",
    },
    gz: {
      label: "Yaw (Z)",
      summary: "Changing direction",
      description: "Rotation about the vertical axis — changing direction",
    },
    roughness: {
      label: "Roughness",
      summary: "Terrain chatter",
      description: "Terrain chatter — RMS of the dynamic G over a 0.5 s window",
    },
    jerk: {
      label: "Jerk",
      summary: "Abrupt movements",
      description:
        "Rate of change of acceleration — transitions and abrupt movements",
    },
    lean: {
      label: "Lean (est.)",
      summary: "Estimated lean",
      description:
        "Estimated lean — roll gyroscope, anchored to the corner's balance angle atan(v·ω/g) from the GPS speed and the yaw; without GPS, the accelerometer's mean tilt",
    },
    speed: {
      label: "Speed",
      summary: "GPS speed",
      description:
        "Speed over ground, measured by the recording's GPS; between fixes, the forward accelerometer draws the shape once the bike's forward is known",
    },
    altitude: {
      label: "Altitude",
      summary: "Elevation profile",
      description: "Altitude above sea level, measured by the recording's GPS",
    },
  },

  /** The event kinds on the events menu, in the plural. */
  kinds: {
    curve: "Corners",
    jump: "Jumps",
    impact: "Impacts",
    rough_section: "Rough sections",
    braking: "Braking",
    crash: "Crashes",
    highg: "High-G",
  },

  /** An impact's severity, as its card's title carries it. */
  severity: {
    light: "Light",
    medium: "Medium",
    hard: "Hard",
  },

  /** The event cards: titles and the labels of their figures. */
  event: {
    duration: "Duration",
    lateralGMax: "Peak lateral G",
    leanMax: "Peak lean (est.)",
    curveSpeed: "Speed in the corner",
    radius: "Radius (est.)",
    theoreticalLean: "Theoretical lean",
    entryMinExit: "Entry → min → exit",
    retention: "Retention",
    elevationDrop: "Elevation drop",
    curveLeft: "Left-hand corner",
    curveRight: "Right-hand corner",
    airtime: "Airtime",
    distance: "Distance",
    landing: "Landing",
    landingHighG: "High-G landing",
    severity: "Severity",
    /** A jump's pitch in the air, takeoff to landing (2026-09-27), and
     * which way the nose went. */
    /** A jump's pitch in the air; which way the nose went goes beside it,
     * two short lines under an arrow (2026-09-28, the layout). */
    airRotation: "Air rotation",
    noseDown: "Nose\nwent down",
    noseUp: "Nose\nwent up",
    /** The hardest compression in the half second before takeoff. */
    lip: "Lip",
    /** The lip's (i) (by request, 2026-09-27). The spread is 191 jumps'
     * across the owner's sessions: median 4.3 G, half of them 3.6–5.6. */
    lipInfo: {
      intro:
        "The hardest hit the bike took in the half second before the wheels left the ground. Across the jumps recorded so far it sits around 4.3 G, half of them between 3.6 and 5.6 G. A high value can mean two different things:",
      points: [
        {
          lead: "You loaded the lip:",
          text: "you compressed the suspension and your legs for a split second to gain height. It usually comes with more airtime.",
        },
        {
          lead: "A sharp hit:",
          text: "an edge, a root or the kick of the lip. A high peak with little airtime is often this.",
        },
      ],
    },
    /** Which wheel met the ground first, under the landing's G. */
    /** The (i)s of the jump's other figures (by request, 2026-09-27). The
     * spreads and medians are the 191–193 jumps across the owner's
     * sessions. */
    airRotationInfo: {
      intro:
        "How far the bike turned nose-down or nose-up between takeoff and landing. Part of it is natural: the bike follows the jump's arc — around 3° on short jumps (under 0.2 s in the air), around 18° on long ones (over 0.35 s).",
      points: [
        {
          lead: "Nose ↓:",
          text: "the front dropped in the air — the usual case, and what lines the bike up with a landing that falls away. On long jumps, more of it went with softer landings.",
        },
        {
          lead: "Nose ↑:",
          text: "the front rose — a manual in the air or the lip kicking the front up; the rear lands first.",
        },
      ],
    },
    landingInfo: {
      intro:
        "The hardest hit in the 0.3 s after the wheels met the ground again. Across the jumps recorded so far it sits around 8 G, half of them between 5.7 and 10.5 G. Under it, the wheel that touched first, read from how the bike rotated right after contact:",
      points: [
        {
          lead: "Front wheel first:",
          text: "the rear came down after it. The most common and the hardest — a median of 8.9 G.",
        },
        {
          lead: "Both wheels:",
          text: "a level landing — 7.1 G.",
        },
        {
          lead: "Rear wheel first:",
          text: "the front settled after it, and the legs and shock soak up more — 5.6 G.",
        },
      ],
    },
    severityInfo: {
      intro:
        "An index from 0 to 100 that combines how hard and how long the landing hit, over the 0.3 s after touchdown: a short spike and a lower but longer blow can score the same. A typical landing reads around 50; near 100, among the hardest recorded. It is relative to Bikit — not a force measured on the components.",
    },
    frontFirst: "front wheel first",
    rearFirst: "rear wheel first",
    bothWheels: "both wheels",
    dropTitle: "Drop",
    jumpTitle: "Jump",
    peak: "Peak",
    peakHighG: "High-G peak",
    /** "Light impact", or just "Impact" when the file gave no severity. */
    impactTitle: (severity: string | null): string =>
      severity ? `${severity} impact` : "Impact",
    brakingTitle: "Braking",
    brakingMax: "Peak braking",
    /** The braking's mean pull against its peak, % (2026-09-27). */
    brakingConsistency: "Consistency",
    /** The mean pull, read off the accelerometer — which does not feel
     * the slope, so the descent is already taken out. */
    brakingMean: "Mean decel. (− gradient)",
    speed: "Speed",
    vibration: "Vibration",
    retainedSpeed: "Speed retained",
    roughTitle: "Very rough section",
    /** A fall (2026-09-26): the speed it was ridden into, how fast the bike
     * turned over, and how long it lay on the ground. */
    crashTitle: "Crash",
    deceleration: "Deceleration",
    /** The deceleration's duration after its unit: "31 → 0 km/h in 2.4 s". */
    inSeconds: (seconds: string): string => `in ${seconds} s`,
    impactPeak: "Impact peak",
    rotationMax: "Max rotation",
    timeDown: "On the ground",
    gforce: "G force",
    shockTitle: "High-G shock",
    width: "Width",
    mainImu: "Main IMU",
  },

  /** The two filter menus on the plot's head. */
  menus: {
    metrics: "Metrics",
    metricsCount: (n: number): string => `${n} metrics`,
    noData: "no data",
    eventsHidden: "Events hidden",
    events: "Events",
    eventsOf: (n: number, total: number): string => `${n} of ${total} events`,
    showEvents: "Show events",
  },

  /** The panel switches above the cards. */
  panels: {
    rider: "Rider",
    map: "Map",
    show: (label: string): string => `Show ${label}`,
  },

  /** The résumé tiles beside the session's identity. */
  resume: {
    duration: "Duration",
    distance: "Distance",
    maxSpeed: "Max speed",
    maxG: "Max G",
    /** Under Max G when the high-g sensor (firmware V15) caught a harder
     * hit than the main IMU can read: "High-G 73 G". */
    highGPeak: (g: string): string => `High-G ${g} G`,
    impacts: "Impacts",
    curves: "Corners",
    jumps: "Jumps",
    airtime: "Airtime",
  },

  /** The zoom row under the plot. */
  zoom: {
    in: "Zoom in",
    out: "Zoom out",
    reset: "Reset zoom",
    values: "Values",
    trimSet: "Session trim",
    trim: "Trim the session",
  },

  /** The map card and its controls. */
  map: {
    title: "Map",
    route: "The session's route on the map",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    frame: "Frame the route",
    resizeWidth: "Resize the map",
    resizeHeight: "Resize the map's height",
    /** Leaflet's credit line takes HTML — the entity stays. */
    namesCredit: "Names &copy; OpenStreetMap",
  },

  /** The reading panel under the plot. */
  reading: {
    prompt: "Tap or drag over the chart to read an instant.",
    derived: "Derived (computed)",
    whatIs: (label: string): string => `What is ${label}`,
    split: "Split the reading",
    min: "Min",
    max: "Max",
    avg: "Mean",
  },

  /** An event's card head. */
  card: {
    confidence: "Confidence",
    now: (value: string): string => `Now ${value}`,
    /** The word before the live reading, the value set bold after it. */
    nowWord: "Now",
    before: (seconds: string): string => `${seconds} s before`,
    after: (seconds: string): string => `${seconds} s after`,
  },

  /** The warning badge for a file whose frames arrived rotated. */
  realignment: {
    text: (pct: number): string => `IMU realigned · ${pct}% of the time`,
    lost: (pct: number): string => ` · ${pct}% unrecoverable`,
    title: (stretches: number, windowS: number): string =>
      `The logger recorded ${stretches} stretch${stretches === 1 ? "" : "es"} with the six words of every sample rotated — gyroscope in the accelerometer channels and vice versa. The app put them back by the physics (1 g on the accelerometer, almost nothing on the gyroscope, in windows of ${windowS} s). Under hard riding the correction is approximate.`,
    lostTitle: (pct: number): string =>
      ` ⚠ For ${pct}% of the time the rotation changes faster than a window can follow and the correction did not take: those stretches are not to be trusted, nor the peaks that come out of them.`,
  },

  /** The frame badge: whose axes the reading is in. */
  mounting: {
    sensor: "Frame: sensor",
    sensorTitle:
      "The file carries no calibration — the angles are the sensor's, not the bike's.",
    frontUndefined: "Bike · forward undetermined",
    frontUndefinedTitle:
      "Gravity aligned by the calibration. No GPS, or not enough accelerating and braking, to find forward.",
    orientationFrom: (from: string, pct: number): string =>
      `Bike · orientation from ${from} (${pct}%)`,
    frontByLogger: (pct: number): string =>
      `Bike · forward by the logger (${pct}%)`,
    loggerTitle: (intervals: number, pct: number, yaw: number): string =>
      `Two-step calibration on the logger: at rest for gravity, riding straight for forward, with ${intervals} accelerating-and-braking votes from the GPS and ${pct}% confidence. The sensor sits ${yaw}° off forward. Axes: X forward, Y left, Z up.`,
    inheritedTitle: (from: string): string =>
      ` This session carried no orientation of its own: it uses the one from "${from}", the sensor having been in the same position.`,
    frontAt: (yaw: number, pct: number): string =>
      `Bike · forward ${yaw}° off the sensor (${pct}%)`,
    gpsTitle: (intervals: number, pct: number): string =>
      `Forward was found over ${intervals} accelerating and braking intervals from the GPS; confidence ${pct}%.`,
    frontUncertain: (pct: number): string =>
      `Bike · forward uncertain (${pct}%)`,
    uncertainTitle: (yaw: number, pct: number, intervals: number): string =>
      `The ride voted ${yaw}° with ${pct}% confidence over ${intervals} intervals — too little to rotate the axes. Forward stays the sensor's.`,
    invertedAxes: " · axes inverted",
    invertedTitle:
      " ⚠ In the corners the yaw gyroscope turns against the GPS heading — the sensor's axes are not a right-handed sensor's. Check the firmware before trusting the lean.",
  },

  /** The small drawing of a high-g shock's window. */
  shockWindow: (ms: string, hz: number): string =>
    `The shock's window: ${ms} ms at ${hz} Hz`,

  /** The plot itself: its slider, the resolution note and the event tabs. */
  chart: {
    cursor: "Session cursor",
    rawData: "raw data",
    envelope: (ms: number): string => `envelope ~${ms} ms`,
    /** A lone event's tab. */
    short: {
      curveLeft: "Corner ←",
      curveRight: "Corner →",
      jump: "Jump",
      drop: "Drop",
      rough_section: "Rough",
      braking: "Braking",
      impact: "Impact",
      crash: "Crash",
    },
    /** Several of one kind in a tab: "3× Corners". */
    plural: {
      curve: "Corners",
      jump: "Jumps",
      drop: "Drops",
      rough_section: "Rough",
      braking: "Braking",
      crash: "Crashes",
    },
  },
};

const pt: typeof en = {
  loading: "A carregar a sessão…",
  telemetry: "Telemetria",

  series: {
    gforce: {
      label: "Força G",
      summary: "Aceleração",
      description: "Magnitude total da aceleração — √(x²+y²+z²)",
    },
    ax: {
      label: "Acel X",
      summary: "Acelerar e travar",
      description: "Aceleração longitudinal — acelerar e travar",
    },
    ay: {
      label: "Acel Y",
      summary: "Curvas e movimento lateral",
      description:
        "Aceleração lateral — sobretudo curvas e movimentos laterais",
    },
    az: {
      label: "Acel Z",
      summary: "Impactos e aterragens",
      description:
        "Aceleração vertical — impactos, terreno, saltos e aterragens",
    },
    gx: {
      label: "Roll (X)",
      summary: "Inclinar a bicicleta",
      description: "Rotação sobre o eixo longitudinal — inclinar a bicicleta",
    },
    gy: {
      label: "Pitch (Y)",
      summary: "Empinar e mergulhar",
      description: "Rotação sobre o eixo lateral — empinar e mergulhar",
    },
    gz: {
      label: "Yaw (Z)",
      summary: "Mudar de direção",
      description: "Rotação sobre o eixo vertical — mudar de direção",
    },
    roughness: {
      label: "Roughness",
      summary: "Trepidação do terreno",
      description:
        "Trepidação do terreno — RMS do G dinâmico em janela de 0,5 s",
    },
    jerk: {
      label: "Jerk",
      summary: "Movimentos abruptos",
      description: "Variação da aceleração — transições e movimentos abruptos",
    },
    lean: {
      label: "Lean (est.)",
      summary: "Inclinação estimada",
      description:
        "Inclinação estimada — giroscópio de rolamento, ancorado ao ângulo de equilíbrio da curva atan(v·ω/g) da velocidade do GPS e da guinada; sem GPS, a inclinação média do acelerómetro",
    },
    speed: {
      label: "Velocidade",
      summary: "Velocidade GPS",
      description:
        "Velocidade sobre o solo, medida pelo GPS da gravação; entre fixes, o acelerómetro frontal desenha a forma quando a frente da bicicleta é conhecida",
    },
    altitude: {
      label: "Altitude",
      summary: "Perfil de elevação",
      description:
        "Altitude acima do nível do mar, medida pelo GPS da gravação",
    },
  },

  kinds: {
    curve: "Curvas",
    jump: "Saltos",
    impact: "Impactos",
    rough_section: "Zonas acidentadas",
    braking: "Travagens",
    crash: "Quedas",
    highg: "High-G",
  },

  severity: {
    light: "leve",
    medium: "médio",
    hard: "forte",
  },

  event: {
    duration: "Duração",
    lateralGMax: "G lateral máx",
    leanMax: "Inclinação máx (est.)",
    curveSpeed: "Velocidade na curva",
    radius: "Raio (est.)",
    theoreticalLean: "Inclinação teórica",
    entryMinExit: "Entrada → mín → saída",
    retention: "Retenção",
    elevationDrop: "Desnível",
    curveLeft: "Curva à esquerda",
    curveRight: "Curva à direita",
    airtime: "No ar",
    distance: "Distância",
    landing: "Aterragem",
    landingHighG: "Aterragem high-G",
    severity: "Severidade",
    airRotation: "Rotação no ar",
    noseDown: "Frente\ndesceu",
    noseUp: "Frente\nsubiu",
    lip: "Lábio",
    lipInfo: {
      intro:
        "A pancada mais forte que a bicicleta levou no meio segundo antes de as rodas saírem do chão. Nos saltos gravados até agora anda à volta dos 4,3 G, metade entre 3,6 e 5,6 G. Um valor alto pode querer dizer duas coisas diferentes:",
      points: [
        {
          lead: "Carregaste o lábio:",
          text: "comprimiste a suspensão e as pernas durante uma fração de segundo, para ganhar altura. Costuma vir com mais tempo no ar.",
        },
        {
          lead: "Pancada seca:",
          text: "uma aresta, uma raiz ou o bico do lábio. Um pico alto com pouco tempo no ar é, muitas vezes, isto.",
        },
      ],
    },
    airRotationInfo: {
      intro:
        "Quanto a bicicleta rodou de frente para baixo ou para cima entre a descolagem e a aterragem. Uma parte é natural: a bicicleta acompanha o arco do salto — à volta de 3° nos saltos curtos (menos de 0,2 s no ar), à volta de 18° nos longos (mais de 0,35 s).",
      points: [
        {
          lead: "Frente ↓:",
          text: "a frente desceu no ar — o caso habitual, e o que alinha a bicicleta com uma aterragem em descida. Nos saltos longos, rodar mais veio com aterragens mais suaves.",
        },
        {
          lead: "Frente ↑:",
          text: "a frente subiu — um manual no ar ou um coice da frente no lábio; a traseira aterra primeiro.",
        },
      ],
    },
    landingInfo: {
      intro:
        "A pancada mais forte nos 0,3 s depois de as rodas voltarem ao chão. Nos saltos gravados até agora anda à volta dos 8 G, metade entre 5,7 e 10,5 G. Por baixo, a roda que tocou primeiro, lida na rotação da bicicleta logo a seguir ao contacto:",
      points: [
        {
          lead: "Frente primeiro:",
          text: "a traseira caiu a seguir. É o caso mais comum e o mais duro — mediana de 8,9 G.",
        },
        {
          lead: "As duas rodas:",
          text: "uma aterragem nivelada — 7,1 G.",
        },
        {
          lead: "Traseira primeiro:",
          text: "a frente pousou a seguir, e as pernas e o amortecedor absorvem mais — 5,6 G.",
        },
      ],
    },
    severityInfo: {
      intro:
        "Um índice de 0 a 100 que junta a força e a duração da pancada nos 0,3 s depois de aterrar: um pico curto e uma pancada mais baixa mas mais longa podem valer o mesmo. Uma aterragem típica anda pelos 50; perto de 100, das mais duras já gravadas. É relativo ao Bikit — não é uma força medida nos componentes.",
    },
    frontFirst: "frente primeiro",
    rearFirst: "traseira primeiro",
    bothWheels: "as duas rodas",
    dropTitle: "Drop",
    jumpTitle: "Salto",
    peak: "Pico",
    peakHighG: "Pico high-G",
    impactTitle: (severity) => (severity ? `Impacto ${severity}` : "Impacto"),
    brakingTitle: "Travagem",
    brakingMax: "Travagem máx",
    brakingConsistency: "Consistência",
    brakingMean: "Desac. média (− desnível)",
    speed: "Velocidade",
    vibration: "Vibração",
    retainedSpeed: "Vel. retida",
    roughTitle: "Zona muito acidentada",
    crashTitle: "Queda",
    deceleration: "Desaceleração",
    inSeconds: (seconds) => `em ${seconds} s`,
    impactPeak: "Pico do impacto",
    rotationMax: "Rotação máx",
    timeDown: "No chão",
    gforce: "Força G",
    shockTitle: "Choque high-G",
    width: "Largura",
    mainImu: "IMU principal",
  },

  menus: {
    metrics: "Métricas",
    metricsCount: (n) => `${n} métricas`,
    noData: "sem dados",
    eventsHidden: "Eventos ocultos",
    events: "Eventos",
    eventsOf: (n, total) => `${n} de ${total} eventos`,
    showEvents: "Mostrar eventos",
  },

  panels: {
    rider: "Rider",
    map: "Mapa",
    show: (label) => `Mostrar ${label}`,
  },

  resume: {
    duration: "Duração",
    distance: "Distância",
    maxSpeed: "Vel. máx",
    maxG: "G máx",
    highGPeak: (g) => `High-G ${g} G`,
    impacts: "Impactos",
    curves: "Curvas",
    jumps: "Saltos",
    airtime: "No ar",
  },

  zoom: {
    in: "Aproximar",
    out: "Afastar",
    reset: "Repor zoom",
    values: "Valores",
    trimSet: "Recorte da sessão",
    trim: "Recortar a sessão",
  },

  map: {
    title: "Mapa",
    route: "Percurso da sessão no mapa",
    zoomIn: "Aproximar",
    zoomOut: "Afastar",
    frame: "Enquadrar o percurso",
    resizeWidth: "Redimensionar o mapa",
    resizeHeight: "Redimensionar a altura do mapa",
    namesCredit: "Nomes &copy; OpenStreetMap",
  },

  reading: {
    prompt: "Toca ou arrasta sobre o gráfico para ler um instante.",
    derived: "Derivadas (calculadas)",
    whatIs: (label) => `O que é ${label}`,
    split: "Repartir a leitura",
    min: "Mín",
    max: "Máx",
    avg: "Média",
  },

  card: {
    confidence: "Confiança",
    now: (value) => `Agora ${value}`,
    nowWord: "Agora",
    before: (seconds) => `${seconds} s antes`,
    after: (seconds) => `${seconds} s depois`,
  },

  realignment: {
    text: (pct) => `IMU realinhado · ${pct}% do tempo`,
    lost: (pct) => ` · ${pct}% irrecuperável`,
    title: (stretches, windowS) =>
      `O logger gravou ${stretches} troço${stretches === 1 ? "" : "s"} com as seis palavras de cada amostra rodadas — giroscópio nos canais do acelerómetro e vice-versa. A app pô-las no sítio pela física (1 g no acelerómetro, quase nada no giroscópio, em janelas de ${windowS} s). Em andamento forte a correção é aproximada.`,
    lostTitle: (pct) =>
      ` ⚠ Em ${pct}% do tempo a rotação muda mais depressa do que uma janela consegue seguir e a correção não pegou: esses troços não são de confiança, nem os máximos que saem deles.`,
  },

  mounting: {
    sensor: "Referencial: sensor",
    sensorTitle:
      "O ficheiro não traz calibração — os ângulos são os do sensor, não os da bicicleta.",
    frontUndefined: "Bicicleta · frente por definir",
    frontUndefinedTitle:
      "Gravidade alinhada pela calibração. Sem GPS, ou sem acelerações e travagens suficientes, para descobrir a frente.",
    orientationFrom: (from, pct) =>
      `Bicicleta · orientação de ${from} (${pct}%)`,
    frontByLogger: (pct) => `Bicicleta · frente pelo logger (${pct}%)`,
    loggerTitle: (intervals, pct, yaw) =>
      `Calibração em dois passos no logger: parado para a gravidade, a andar a direito para a frente, com ${intervals} votos de aceleração e travagem do GPS e ${pct}% de confiança. O sensor está a ${yaw}° da frente. Eixos: X frente, Y esquerda, Z cima.`,
    inheritedTitle: (from) =>
      ` Esta sessão não trazia orientação própria: usa a de "${from}", por o sensor ter estado na mesma posição.`,
    frontAt: (yaw, pct) => `Bicicleta · frente a ${yaw}° do sensor (${pct}%)`,
    gpsTitle: (intervals, pct) =>
      `A frente foi encontrada em ${intervals} intervalos de aceleração e travagem do GPS; confiança ${pct}%.`,
    frontUncertain: (pct) => `Bicicleta · frente incerta (${pct}%)`,
    uncertainTitle: (yaw, pct, intervals) =>
      `A volta votou ${yaw}° com ${pct}% de confiança em ${intervals} intervalos — pouco para rodar os eixos. A frente fica a do sensor.`,
    invertedAxes: " · eixos invertidos",
    invertedTitle:
      " ⚠ Nas curvas, o giroscópio de guinada roda contra o rumo do GPS — os eixos do sensor não são os de um sensor destro. Verificar o firmware antes de confiar no lean.",
  },

  shockWindow: (ms, hz) => `A janela do choque: ${ms} ms a ${hz} Hz`,

  chart: {
    cursor: "Cursor da sessão",
    rawData: "dados brutos",
    envelope: (ms) => `envelope ~${ms} ms`,
    short: {
      curveLeft: "Curva ←",
      curveRight: "Curva →",
      jump: "Salto",
      drop: "Drop",
      rough_section: "Acidentado",
      braking: "Travagem",
      impact: "Impacto",
      crash: "Queda",
    },
    plural: {
      curve: "Curvas",
      jump: "Saltos",
      drop: "Drops",
      rough_section: "Acidentados",
      braking: "Travagens",
      crash: "Quedas",
    },
  },
};

export const analysis = { en, pt };
