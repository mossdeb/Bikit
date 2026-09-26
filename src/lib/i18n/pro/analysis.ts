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
    dropTitle: "Drop",
    jumpTitle: "Jump",
    peak: "Peak",
    peakHighG: "High-G peak",
    /** "Light impact", or just "Impact" when the file gave no severity. */
    impactTitle: (severity: string | null): string =>
      severity ? `${severity} impact` : "Impact",
    brakingTitle: "Braking",
    brakingMax: "Peak braking",
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
    dropTitle: "Drop",
    jumpTitle: "Salto",
    peak: "Pico",
    peakHighG: "Pico high-G",
    impactTitle: (severity) => (severity ? `Impacto ${severity}` : "Impacto"),
    brakingTitle: "Travagem",
    brakingMax: "Travagem máx",
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
