/**
 * Pro dictionary, namespace `report` (2026-09-24): the session report —
 * the three sections' names, figures and sentences (lib/imu/report.ts and
 * the report page) — and, nested, the setup model and form (`setup`: the
 * summary line, the differences, the spread, the dialog) and the bikes
 * pages under Pro (`bikes`).
 *
 * The technical vocabulary stays as it is in both languages: Harshness,
 * Chassis Movement, Chatter, Rider, Bike, Trail, Bike setup, Stroke,
 * Rebound, SAG, the units. Percentages are handed in already formatted
 * (proPercent), so the Portuguese "30 %" and the English "30%" are the
 * caller's business, not the sentence's.
 */
const en = {
  /** The client component, while the file is on its way. */
  loadingSession: "Loading the session…",
  /** The report page's header. */
  page: {
    report: "Report",
  },
  /** The Bike card's two doors. */
  setupTrigger: "Bike setup for this session",
  compareSetups: "Compare setups",
  /** What each section is, for the "i" beside its name, when the section
   * has no caveat of its own. */
  info: {
    bike: "How the bike responded to the ground, read by the sensor on the frame.",
    rider:
      "How the run was ridden: the speed, the corners and the braking, read from the GPS fused with the accelerometer.",
    trail:
      "What the trail asked for: the distance, the elevation, the ground, the impacts, the corners and the jumps.",
  },
  subtitle: {
    rider: "Riding performance",
    bike: "Bike behaviour",
    trail: "Trail characteristics",
  },
  highlights: {
    rider: "Corners where most was lost",
    bike: "Impacts that went on oscillating the most",
    trail: "Hardest stretches",
  },
  units: {
    perKm: "per km",
    points: "points",
  },
  /** The tiles' names. The band-carrying ones (Chassis Movement 2–12 Hz,
   * Chatter 12–60 Hz) and Harshness are the lab's own words. */
  metric: {
    avgSpeed: "Average speed",
    maxSpeed: "Max speed",
    cornerRetention: "Corner retention",
    rightLeft: "Right · left",
    apexLoss: "Apex loss",
    consistency: "Consistency",
    brakings: "Braking",
    speedKeptInRough: "Speed kept in rough",
    harshness: "Harshness",
    chassisMovement: "Chassis Movement 2–12 Hz",
    chatter: "Chatter 12–60 Hz",
    residualOscillation: "Residual oscillation",
    recovery: "Recovery",
    stability: "Stability",
    distance: "Distance",
    elevation: "Elevation",
    roughness: "Roughness",
    impacts: "Impacts",
    corners: "Corners",
    naturalSpeed: "Natural speed",
    jumps: "Jumps",
  },
  /** One line under each figure saying what it is or how it was read. */
  hint: {
    avgSpeed: "while moving, above 3 km/h",
    retentionCorrected:
      "exit over the exit gravity alone would give, averaged over the corners",
    retention: "exit over entry, averaged over the corners",
    rightLeft: (right: number, left: number): string =>
      `${right} right-hand corners, ${left} left-hand`,
    apexLoss: "how much of the entry speed was lost by the minimum, on average",
    consistency: "spread of the retention across corners; lower is more even",
    brakings: (beforeCurve: number, total: number): string =>
      `${beforeCurve} of ${total} into a corner`,
    speedKeptInRough:
      "speed through the rough sections over the stretch before them",
    /** Appended to the bike hints when the figure is read over the rough
     * sections only, as a suffix with its leading space. */
    inRough: " in the rough sections",
    harshness: (where: string): string =>
      `peak (p99) over RMS of the dynamic force${where}; higher is harsher`,
    chassisMovement: (where: string): string =>
      `RMS of the force in the chassis-movement band${where}; what the compression damping controls`,
    chatter: (where: string): string =>
      `RMS of the force in the chatter band${where}; what gets through from the tyres to the frame`,
    residualOscillation: (ms: number): string =>
      `2–12 Hz energy in the ${ms} ms after an impact over its peak, median; less is the damper closing the hit`,
    recovery: (g: string, s: string, n: number): string =>
      `2–12 Hz energy in the 200 ms before the next hit over the previous one's peak, for hits of ${g} G or more less than ${s} s apart; median of ${n}. Less is the bike arriving settled at the next`,
    stability:
      "spread of the pitch and the lean in the rough sections; less pitch is the frame resisting compressions better",
    gradient: (percent: string, descending: boolean): string =>
      `average gradient ${percent} ${descending ? "downhill" : "uphill"}`,
    roughness: (percent: string): string =>
      `${percent} of the time in rough sections`,
    impacts: (total: number, severity: number | null): string =>
      severity != null
        ? `${total} in total, average severity ${severity}/100`
        : `${total} in total`,
    corners: (total: number, radiusM: number | null): string =>
      radiusM != null
        ? `${total} in total, median radius ~${radiusM} m`
        : `${total} in total`,
    naturalSpeed:
      "median on the straights, outside corners, braking and rough ground",
    jumps: (airtimeS: string | null): string =>
      airtimeS != null
        ? `${airtimeS} s in the air in total`
        : "no jumps detected",
  },
  /** The instants worth going back to. */
  highlight: {
    cornerRight: "Right-hand corner",
    cornerLeft: "Left-hand corner",
    corner: (
      entry: number,
      min: number,
      exit: number,
      retention: string,
    ): string => `${entry} → ${min} → ${exit} km/h · retention ${retention}`,
    impact: "Impact",
    impactDetail: (percent: string): string =>
      `${percent} of the hit went on oscillating`,
    roughSection: "Rough section",
  },
  /** The sections' conclusions, in words. */
  headline: {
    /** `worse` names the side that cost more, "none" when the two sides
     * are within 5 points of each other, null without both sides. */
    corners: (
      avg: string,
      worse: "right" | "left" | "none" | null,
      low: string,
      high: string,
    ): string =>
      `Kept ${avg} on average through the corners` +
      (worse === "none"
        ? ", with no difference between the two sides"
        : worse
          ? `, with the ${worse === "right" ? "right-hand" : "left-hand"} corners costing more (${low} against ${high})`
          : "") +
      ".",
    brakings: (n: number, ratePerKm: string | null, share: string): string =>
      `${n === 1 ? "Braked once" : `Braked ${n} times`}${ratePerKm != null ? `, ${ratePerKm} per km` : ""}, ${share} ${n === 1 ? "of it" : "of them"} into corners.`,
    noGps:
      "Without GPS there are no speeds, and riding is read by speed: the corners have no retention.",
    noRiding: "No corners or braking detected: nothing to judge the riding by.",
    decayOne: (percent: string): string =>
      `After the one impact ${percent} of the hit went on oscillating in the frame.`,
    decay: (percent: string, n: number): string =>
      `After an impact ${percent} of the hit goes on oscillating in the frame, median of ${n}.`,
    bands: (chassisG: string, chatterG: string, rough: boolean): string =>
      `Chassis at ${chassisG} G and chatter at ${chatterG} G${rough ? " on rough ground" : " over the whole recording"}.`,
    bikeUntested:
      "With no impacts or rough ground, the bike was not put to the test.",
    bikeCaveat:
      "A sensor on the frame measures the trail as filtered by the bike. These figures only make sense compared with another run on the same trail, with another setup or another bike.",
    /** The Trail sentence's bits, joined with commas. */
    drop: (m: string, descending: boolean): string =>
      `${m} m ${descending ? "down" : "up"}`,
    cornersCount: (n: number): string =>
      n === 1 ? "1 corner" : `${n} corners`,
    impactsCount: (n: number): string =>
      n === 1 ? "1 impact" : `${n} impacts`,
    roughShare: (percent: string): string =>
      `${percent} of the time on rough ground`,
    noEvents: "A route with no events.",
  },

  /** The setup model (lib/imu/setup.ts) and its form. */
  setup: {
    /** The blocks' headings when the bike has no component names. */
    fork: "Fork",
    shock: "Shock",
    /** The summary line's tyres: "Tyres 24/26 psi". */
    tyres: (front: string, rear: string): string =>
      `Tyres ${front}/${rear} psi`,
    /** The sag with its share of the travel: "sag 40 mm (25%)". */
    sag: (mm: string, share: string | null): string =>
      `sag ${mm} mm${share != null ? ` (${share})` : ""}`,
    /** What each knob is called in a difference and in the spread. */
    knob: {
      pressurePsi: "pressure",
      springRateLbs: "spring",
      travelMm: "travel",
      sagMm: "sag",
      compression: "C",
      compressionHigh: "HSC",
      compressionLow: "LSC",
      rebound: "R",
      reboundHigh: "HSR",
      reboundLow: "LSR",
    },
    /** The block a changed knob belongs to, short, before the knob. */
    diffFork: "fork",
    diffShock: "shock",
    diffTyreFront: "front tyre",
    diffTyreRear: "rear tyre",
    diffRider: "rider",
    /** The direction a change went, in a mechanic's words. */
    direction: {
      clicksUp: "more open",
      clicksDown: "more closed",
      springUp: "firmer",
      springDown: "softer",
      sagUp: "softer",
      sagDown: "firmer",
      tireUp: "harder",
      tireDown: "softer",
    },
    /** The spread of a set of setups: what they hold constant, named with
     * its value, and what varies, named by knob. */
    spread: {
      fork: "fork",
      shock: "shock",
      sagConstant: (name: string, mm: string): string =>
        `the ${name}'s sag at ${mm} mm`,
      travelConstant: (name: string, mm: string): string =>
        `the ${name}'s travel at ${mm} mm`,
      damperConstant: (name: string, value: string): string =>
        `the ${name} at ${value}`,
      knobVaries: (knob: string, name: string): string =>
        `${knob} on the ${name}`,
      tyresConstant: (front: string, rear: string): string =>
        `the tyres at ${front}/${rear} psi`,
      tyreFrontVaries: "front tyre",
      tyreRearVaries: "rear tyre",
      weightConstant: (kg: string): string => `the weight at ${kg} kg`,
      weightVaries: "rider weight",
    },
    /** The dialog. */
    form: {
      title: "Setup for this run",
      triggerTitle: "The bike's setup for this run",
      description:
        "Pressures in psi, clicks counted from fully closed and the rider's weight kitted up in kg. Only what you fill in is kept; a change creates a new setup for the bike, which the next imports inherit.",
      descriptionReadOnly:
        "Pressures in psi, clicks counted from fully closed and the rider's weight kitted up in kg, as they were recorded.",
      tyres: "Tyres",
      front: (label: string): string => `Front · ${label}`,
      frontPressure: "Front pressure",
      rear: (label: string): string => `Rear · ${label}`,
      rearPressure: "Rear pressure",
      riderWeight: "Weight, kitted up",
      notes: "Notes",
      notesPlaceholder: "something to remember about this setup",
      air: "Air",
      coil: "Coil",
      travel: "Travel",
      pressure: "Pressure",
      spring: "Spring",
      compression: "Compression",
      dual: "High/low",
      single: "Single",
      lowSpeed: "Low speed",
      highSpeed: "High speed",
      clicks: "Clicks",
      clicksUnit: "clicks",
      sagShare: (percent: string): string => `${percent} of the travel`,
    },
    /** The server action's refusals. */
    errors: {
      invalidValues: "Invalid setup values.",
      sessionNotFound: "Session not found.",
      noResponse: "No response.",
    },
  },

  /** The bikes pages under Pro. */
  bikes: {
    title: "Bikes",
    empty: "No bikes yet. Register one in Bikit and it shows up here.",
    /** "2 setups in 5 sessions" — the two counts come formatted from
     * common.setup and common.session. */
    setupsInSessions: (setups: string, sessions: string): string =>
      `${setups} in ${sessions}`,
    bikeInApp: "the bike in Bikit",
    noSetups:
      "No session of this bike has a setup recorded. Open a session and record its setup; it shows up here.",
    noValues: "No values",
  },
};

const pt: typeof en = {
  loadingSession: "A carregar a sessão…",
  page: {
    report: "Relatório",
  },
  setupTrigger: "Afinação da bicicleta nesta sessão",
  compareSetups: "Comparar afinações",
  info: {
    bike: "Como a bicicleta respondeu ao terreno, lido pelo sensor no quadro.",
    rider:
      "Como a volta foi conduzida: a velocidade, as curvas e as travagens, lidas do GPS fundido com o acelerómetro.",
    trail:
      "O que o percurso pediu: a distância, o desnível, o terreno, os impactos, as curvas e os saltos.",
  },
  subtitle: {
    rider: "Performance de condução",
    bike: "Comportamento da bicicleta",
    trail: "Características do percurso",
  },
  highlights: {
    rider: "Curvas onde mais se perdeu",
    bike: "Impactos que mais ficaram a oscilar",
    trail: "Troços mais duros",
  },
  units: {
    perKm: "por km",
    points: "pontos",
  },
  metric: {
    avgSpeed: "Velocidade média",
    maxSpeed: "Velocidade máx",
    cornerRetention: "Retenção nas curvas",
    rightLeft: "Direita · esquerda",
    apexLoss: "Perda no ápice",
    consistency: "Consistência",
    brakings: "Travagens",
    speedKeptInRough: "Vel. retida em acidentado",
    harshness: "Harshness",
    chassisMovement: "Chassis Movement 2–12 Hz",
    chatter: "Chatter 12–60 Hz",
    residualOscillation: "Oscilação residual",
    recovery: "Recuperação",
    stability: "Estabilidade",
    distance: "Distância",
    elevation: "Desnível",
    roughness: "Rugosidade",
    impacts: "Impactos",
    corners: "Curvas",
    naturalSpeed: "Velocidade natural",
    jumps: "Saltos",
  },
  hint: {
    avgSpeed: "em andamento, acima de 3 km/h",
    retentionCorrected:
      "saída sobre a saída que a gravidade daria, média das curvas",
    retention: "saída sobre entrada, média das curvas",
    rightLeft: (right, left) => `${right} curvas à direita, ${left} à esquerda`,
    apexLoss: "quanto da entrada se perdeu até ao mínimo, média",
    consistency: "desvio da retenção entre curvas; menor é mais regular",
    brakings: (beforeCurve, total) =>
      `${beforeCurve} de ${total} à entrada de uma curva`,
    speedKeptInRough:
      "velocidade dentro das zonas acidentadas sobre a do troço antes",
    inRough: " nas zonas acidentadas",
    harshness: (where) =>
      `pico (p99) sobre RMS da força dinâmica${where}; maior é mais seco`,
    chassisMovement: (where) =>
      `RMS da força na banda do movimento do quadro${where}; o que a compressão controla`,
    chatter: (where) =>
      `RMS da força na banda do chatter${where}; o que passa dos pneus ao quadro`,
    residualOscillation: (ms) =>
      `energia de 2–12 Hz nos ${ms} ms após um impacto sobre o pico dele, mediana; menos é o amortecedor a fechar a pancada`,
    recovery: (g, s, n) =>
      `energia de 2–12 Hz nos 200 ms antes da pancada seguinte sobre o pico da anterior, para pancadas de ${g} G ou mais a menos de ${s} s uma da outra; mediana de ${n}. Menos é a bicicleta a chegar assente à próxima`,
    stability:
      "desvio do pitch e da inclinação nas zonas acidentadas; menos pitch é o quadro a resistir melhor às compressões",
    gradient: (percent, descending) =>
      `gradiente médio ${percent} ${descending ? "a descer" : "a subir"}`,
    roughness: (percent) => `${percent} do tempo em zonas acidentadas`,
    impacts: (total, severity) =>
      severity != null
        ? `${total} no total, severidade média ${severity}/100`
        : `${total} no total`,
    corners: (total, radiusM) =>
      radiusM != null
        ? `${total} no total, raio mediano ~${radiusM} m`
        : `${total} no total`,
    naturalSpeed: "mediana nas retas, fora de curvas, travagens e acidentado",
    jumps: (airtimeS) =>
      airtimeS != null
        ? `${airtimeS} s no ar no total`
        : "nenhum salto detetado",
  },
  highlight: {
    cornerRight: "Curva à direita",
    cornerLeft: "Curva à esquerda",
    corner: (entry, min, exit, retention) =>
      `${entry} → ${min} → ${exit} km/h · retenção ${retention}`,
    impact: "Impacto",
    impactDetail: (percent) => `${percent} da pancada ficou a oscilar`,
    roughSection: "Zona acidentada",
  },
  headline: {
    corners: (avg, worse, low, high) =>
      `Reteve em média ${avg} nas curvas` +
      (worse === "none"
        ? ", sem diferença entre os dois lados"
        : worse
          ? `, com as curvas ${worse === "right" ? "à direita" : "à esquerda"} a custar mais (${low} contra ${high})`
          : "") +
      ".",
    brakings: (n, ratePerKm, share) =>
      `Travou ${n} ${n === 1 ? "vez" : "vezes"}${ratePerKm != null ? `, ${ratePerKm} por km` : ""}, ${share} ${n === 1 ? "dela" : "delas"} à entrada de curvas.`,
    noGps:
      "Sem GPS não há velocidades, e a condução lê-se pela velocidade: as curvas ficam sem retenção.",
    noRiding:
      "Sem curvas nem travagens detetadas: nada para avaliar na condução.",
    decayOne: (percent) =>
      `Depois do único impacto ${percent} da pancada ficou a oscilar no quadro.`,
    decay: (percent, n) =>
      `Depois de um impacto ${percent} da pancada fica a oscilar no quadro, mediana de ${n}.`,
    bands: (chassisG, chatterG, rough) =>
      `Chassis a ${chassisG} G e chatter a ${chatterG} G${rough ? " em terreno acidentado" : " ao longo da gravação"}.`,
    bikeUntested:
      "Sem impactos nem terreno acidentado, a bicicleta não foi posta à prova.",
    bikeCaveat:
      "Um sensor no quadro mede o trilho filtrado pela bicicleta. Estes valores só ganham sentido comparados com outra passagem na mesma pista, com outra afinação ou outra bicicleta.",
    drop: (m, descending) => `${m} m ${descending ? "a descer" : "a subir"}`,
    // The Portuguese sentence has always counted "1 curvas, 1 impactos":
    // kept as it was, the copy is not rewritten here.
    cornersCount: (n) => `${n} curvas`,
    impactsCount: (n) => `${n} impactos`,
    roughShare: (percent) => `${percent} do tempo em terreno acidentado`,
    noEvents: "Um percurso sem eventos.",
  },

  setup: {
    fork: "Garfo",
    shock: "Amortecedor",
    tyres: (front, rear) => `Pneus ${front}/${rear} psi`,
    sag: (mm, share) => `sag ${mm} mm${share != null ? ` (${share})` : ""}`,
    knob: {
      pressurePsi: "pressão",
      springRateLbs: "mola",
      travelMm: "curso",
      sagMm: "sag",
      compression: "C",
      compressionHigh: "HSC",
      compressionLow: "LSC",
      rebound: "R",
      reboundHigh: "HSR",
      reboundLow: "LSR",
    },
    diffFork: "garfo",
    diffShock: "amort.",
    diffTyreFront: "pneu dt.",
    diffTyreRear: "pneu tr.",
    diffRider: "rider",
    direction: {
      clicksUp: "mais aberto",
      clicksDown: "mais fechado",
      springUp: "mais firme",
      springDown: "mais macio",
      sagUp: "mais macio",
      sagDown: "mais firme",
      tireUp: "mais duro",
      tireDown: "mais mole",
    },
    spread: {
      fork: "garfo",
      shock: "amortecedor",
      sagConstant: (name, mm) => `o sag do ${name} a ${mm} mm`,
      travelConstant: (name, mm) => `o curso do ${name} a ${mm} mm`,
      damperConstant: (name, value) => `o ${name} a ${value}`,
      knobVaries: (knob, name) => `${knob} do ${name}`,
      tyresConstant: (front, rear) => `os pneus a ${front}/${rear} psi`,
      tyreFrontVaries: "pneu da frente",
      tyreRearVaries: "pneu de trás",
      weightConstant: (kg) => `o peso a ${kg} kg`,
      weightVaries: "peso do rider",
    },
    form: {
      title: "Afinação nesta volta",
      triggerTitle: "A afinação da bicicleta nesta volta",
      description:
        "Pressões em psi, cliques contados a partir de fechado e o peso do rider equipado em kg. Só o que preencheres fica guardado; uma alteração cria uma afinação nova para a bicicleta, que as próximas importações herdam.",
      descriptionReadOnly:
        "Pressões em psi, cliques contados a partir de fechado e o peso do rider equipado em kg, tal como foram registados.",
      tyres: "Pneus",
      front: (label) => `À frente · ${label}`,
      frontPressure: "Pressão à frente",
      rear: (label) => `Atrás · ${label}`,
      rearPressure: "Pressão atrás",
      riderWeight: "Peso equipado",
      notes: "Notas",
      notesPlaceholder: "algo a lembrar desta afinação",
      air: "Ar",
      coil: "Mola",
      travel: "Curso",
      pressure: "Pressão",
      spring: "Mola",
      compression: "Compressão",
      dual: "Alta/baixa",
      single: "Simples",
      lowSpeed: "Baixa velocidade",
      highSpeed: "Alta velocidade",
      clicks: "Cliques",
      clicksUnit: "cliques",
      sagShare: (percent) => `${percent} do curso`,
    },
    errors: {
      invalidValues: "Valores da afinação inválidos.",
      sessionNotFound: "Sessão não encontrada.",
      noResponse: "Sem resposta.",
    },
  },

  bikes: {
    title: "Bicicletas",
    empty: "Ainda não há bicicletas. Regista uma no Bikit e ela aparece aqui.",
    setupsInSessions: (setups, sessions) => `${setups} em ${sessions}`,
    bikeInApp: "a bicicleta no Bikit",
    noSetups:
      "Nenhuma sessão desta bicicleta tem afinação registada. Abre uma sessão e regista o setup dela; aparece aqui.",
    noValues: "Sem valores",
  },
};

export const report = { en, pt };
