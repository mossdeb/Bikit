/**
 * Pro dictionary, namespace `snapshots` (i18n pass, 2026-09-24): the
 * Snapshot page and the comparison opened from an event's card
 * (imu-snapshot-view, imu-snapshot-create), the Snapshot cards under the
 * report (imu-report-snapshots), the kinds' names (lib/imu/snapshot) and
 * the server actions' messages (actions/imu-snapshots).
 *
 * "Snapshot" itself is the lab's word in both languages, as are Rider,
 * GPS and the units; the Portuguese keeps its typography (the space
 * before a unit, the ordinal's "ª").
 */
const en = {
  /** The kinds in words, for names and headings — a Snapshot's suggested
   * name is "Corner · 12:34". */
  kind: {
    curve: "Corner",
    jump: "Jump",
    rough_section: "Rough section",
    braking: "Braking",
  },

  /** The figures' labels, by column key (see SNAPSHOT_COLUMNS). */
  columns: {
    time: "Time",
    entry: "Entry",
    min: "Minimum",
    exit: "Exit",
    retention: "Retention",
    retentionCorrected: "Corr. retention (− drop)",
    decel: "Max braking",
    speedLost: "Speed lost",
    takeoff: "Takeoff",
    impacts: "Impacts",
    peakG: "Peak G",
    landingG: "Landing G",
    lipG: "Lip G",
    airtime: "Airtime",
  },

  /** The replay under the passes (imu-snapshot-simulation, 2026-10-28). */
  simulation: {
    title: "Simulation",
    intro: "Every pass replayed from the entry gate on one clock.",
    reference: "REF",
    vsReference: "vs. reference",
    tie: "≈ reference",
    atCursor: "At cursor",
    speed: "km/h",
    gForce: "G force",
    play: "Play",
    pause: "Pause",
    timeline: "Time from the entry gate",
    /** How the map lays the passes out (2026-11-05). */
    /** A jump's two clocks (2026-11-06): every pass leaving the lip
     * together, or each from the entry gate as it rode. */
    sync: {
      label: "Start the passes",
      takeoff: "At take-off",
      entry: "From the entry gate",
    },
    layout: {
      label: "Drawing",
      /** The map's two view buttons (2026-11-05). */
      views: {
        label: "Map view",
        alignedTrail: "Lines",
        ghost: "Ghosts",
      },
      names: {
        lane: "Reference lane",
        laneSmooth: "Reference lane, smooth",
        gps: "Raw GPS",
        aligned: "Aligned (mean offset)",
        alignedTrail: "Aligned, widened trail",
        gates: "Pinned to the gates",
        ghost: "Ghosts",
      },
      hints: {
        lane: "Along the reference's line by share of ground, beside it by the line ridden, within the trail.",
        laneSmooth:
          "The reference lane with its direction read over 10 m, each line's offset averaged over 8 m and the trail's edge reached gradually: no steps, no corners.",
        gps: "Where each run's GPS put it. Runs from different days sit a few metres apart.",
        aligned:
          "Each whole line shifted by its mean offset from the reference. In a tight corner it can start before or after the gate.",
        alignedTrail:
          "The aligned lines as they are, and the trail opened out where they leave it, up to 5 m either side of the reference.",
        gates:
          "Shifted to start and end where the reference crossed the gates, blended between. Lines can leave the trail.",
        ghost:
          "Every pass a dot on the reference's line, by share of ground. Who is ahead, not the line ridden.",
      },
    },
    deltaAxis: "Δ time (s)",
    /** The corner timeline's label (2026-11-05). */
    timelineAxis: "Time",
    deltaChart:
      "The gap to the reference along the stretch: above the line behind it, below ahead.",
    select: (name: string): string => `Follow ${name}`,
    /** The box beside each pass that takes it off the map and the chart. */
    showOnMap: (name: string): string => `Show ${name} on the map`,
    /** The "…" after the readout's pills. */
    morePasses: (n: number): string =>
      n === 1 ? "1 more pass" : `${n} more passes`,
    /** A jump's side view (2026-10-29). */
    jump: {
      takeoff: "Take-off",
      apex: "Apex",
      landing: "Landing",
      distance: "Distance",
      height: "Height",
      airtime: "Airtime",
      speed: "km/h",
      noFlight: "No flight was found in this pass.",
      estimate:
        "≈ estimated from the time in the air and the speed off the lip, as if the landing were as high as the lip; a lower landing makes it read high. The ramps are drawn, not measured.",
    },
    notShown: (n: number): string =>
      n === 1
        ? "1 more pass is not replayed — narrow them with the filters."
        : `${n} more passes are not replayed — narrow them with the filters.`,
  },

  /** The Snapshot's page (imu-snapshot-view). */
  view: {
    /** The header's small line over the kind, in the comparison that is
     * not saved yet (2026-10-29, from a sketch). A saved one says
     * "Snapshot". */
    comparison: "Side by Side",
    /** "Reference: {session link} at 12:34 · " — the link sits between
     * the two, so the sentence is two keys. */
    referenceLabel: "Reference:",
    atTime: (time: string): string => `at ${time}`,
    referenceDeleted: "The reference session was deleted",
    gatesFromEvent: (metres: number): string =>
      `gates ${metres} m from the event`,
    /** The stopwatch beside the map: the reference pass's time
     * (2026-10-29, from a sketch; the fastest on show until then). */
    referenceTime: "Reference Time",
    /** Pills reading "Bike: All" (2026-10-28), so the options are short —
     * the label stands outside the list. */
    filters: {
      track: "Tracks",
      allTracks: "All",
      group: "Group",
      allGroups: "All",
      bike: "Bike",
      allBikes: "All",
      rider: "Rider",
      allRiders: "All",
      setup: "Setup",
      allSetups: "All",
      noSetup: "No setup",
      order: "Order",
      newestFirst: "Newest first",
      fastestFirst: "Fastest first",
      groupedBySetup: "Grouped by setup",
    },
    /** "Setup A", or plain "Setup" when the passes are not lettered. */
    setupLetter: (letter: string | null): string =>
      letter ? `Setup ${letter}` : "Setup",
    /** The setup pill's accessible name: the whole setup on a click. */
    setupFull: (title: string): string => `Full ${title}`,
    reading: (done: number, total: number): string =>
      `Reading ${done} of ${total} ${total === 1 ? "session" : "sessions"}…`,
    referenceLost:
      "The reference pass no longer exists; the oldest stands in its place.",
    noSessions: "No session passes through these gates.",
    onlyReference:
      "Only the reference pass, for now. Sessions you import that come through here join on their own.",
    noOtherWithFilters: "No other pass with these filters.",
    dayAndGatesTitle:
      "The day of the recording, and when it crossed the entry gate and the exit gate on the session's clock",
    passOf: (index: number, count: number): string =>
      `pass ${index} of ${count}`,
    between: (entry: string, exit: string): string =>
      `between ${entry} and ${exit}`,
    referencePill: "Reference",
    stopped: "stopped",
    noSetupRecorded: "No setup recorded",
    sameAsReference: "same as the reference",
    /** The "…" pill that holds the setup changes past the first two
     * (by request, 2026-10-28). */
    moreChanges: (n: number): string =>
      n === 1 ? "1 more change" : `${n} more changes`,
    /** The note under a pass whose speed was read another way than the
     * reference's; `source` is one of the two below. */
    speedOtherWay: (source: string): string =>
      `Speed read another way (${source}) — the speeds do not compare with the reference's.`,
    speedSourceGps: "straight-line GPS",
    speedSourceFused: "fused with the accelerometer",
    tieTitle: "Within the gates' precision — counts as a tie",
    /** Under a jump's Landing G: which wheel touched first (2026-11-06). */
    firstWheel: {
      front: "Front first",
      rear: "Rear first",
      both: "Both wheels",
    },
    settings: {
      title: "Snapshot settings",
      description:
        "The name. The gates and the reference pass stay as they were created.",
      name: "Name",
      deleteTitle: "Delete this Snapshot?",
      deleteDescription:
        "The gates cease to exist. The sessions and their recordings stay as they are.",
      deleteSnapshot: "Delete Snapshot",
    },
  },

  /** "Compare" on an event's card, and the save at the foot of it
   * (imu-snapshot-create). */
  create: {
    compare: "Compare",
    compareTitle: "Compare every pass through this stretch",
    dialogTitle: "Compare the passes through this stretch",
    dialogDescription:
      "Every pass through this stretch's two gates, in this session and in the others, side by side.",
    cannotCompare: (metres: number): string =>
      `This event cannot be compared: it needs a GPS track about ${metres} m to each side, and the recording does not have one here.`,
    searching: "Looking for the sessions that pass through here…",
    saved: "Saved as a Snapshot. Sessions you import later join on their own.",
    openSnapshot: "Open the Snapshot",
    alreadySaved: "This stretch is already saved:",
    madeFrom: (session: string): string => `made from ${session}`,
    andMore: (n: number): string => `and ${n} more`,
    saveAnother: "Save another",
    open: "Open",
    saveAsSnapshot: "Save this stretch as a Snapshot",
  },

  /** The Snapshot cards under the report (imu-report-snapshots). */
  report: {
    count: (n: number): string =>
      n === 1
        ? "1 reference stretch in this recording"
        : `${n} reference stretches in this recording`,
    hide: "Hide the Snapshots",
    show: "Show the Snapshots",
    readingReference: "Reading the reference session…",
    referenceGone: "The reference pass no longer exists",
    sessionsCompared: "Sessions compared",
    /** Which pass of the recording's, before its pill: "2nd · ". */
    ordinal: (n: number): string => {
      const mod100 = n % 100;
      if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
      switch (n % 10) {
        case 1:
          return `${n}st`;
        case 2:
          return `${n}nd`;
        case 3:
          return `${n}rd`;
        default:
          return `${n}th`;
      }
    },
    passTimes: (own: string, reference: string): string =>
      `${own} s on this run, ${reference} s on the reference`,
    tieReference: "≈ reference",
  },

  /** The server actions' messages (actions/imu-snapshots). */
  errors: {
    invalidDefinition: "Invalid Snapshot definition.",
    nameRequired: "The Snapshot needs a name.",
    invalidReference: "Invalid reference pass.",
    sessionNotFound: "Session not found.",
    noResponse: "No response.",
    snapshotNotFound: "Snapshot not found.",
  },
};

const pt: typeof en = {
  kind: {
    curve: "Curva",
    jump: "Salto",
    rough_section: "Zona acidentada",
    braking: "Travagem",
  },

  columns: {
    time: "Tempo",
    entry: "Entrada",
    min: "Mínima",
    exit: "Saída",
    retention: "Retenção",
    retentionCorrected: "Ret. corrigida (− desnível)",
    decel: "Travagem máx",
    speedLost: "Vel. perdida",
    takeoff: "Descolagem",
    impacts: "Impactos",
    peakG: "G máx",
    landingG: "G aterragem",
    lipG: "G no lábio",
    airtime: "No ar",
  },

  simulation: {
    title: "Simulação",
    intro:
      "Todas as passagens repetidas a partir da porta de entrada, no mesmo relógio.",
    reference: "REF",
    vsReference: "vs. referência",
    tie: "≈ referência",
    atCursor: "No cursor",
    speed: "km/h",
    gForce: "Força G",
    play: "Reproduzir",
    pause: "Pausa",
    timeline: "Tempo desde a porta de entrada",
    sync: {
      label: "Começar as passagens",
      takeoff: "Na descolagem",
      entry: "Da porta de entrada",
    },
    layout: {
      label: "Desenho",
      views: {
        label: "Vista do mapa",
        alignedTrail: "Linhas",
        ghost: "Fantasmas",
      },
      names: {
        lane: "Faixa da referência",
        laneSmooth: "Faixa da referência, suave",
        gps: "GPS em bruto",
        aligned: "Alinhado (desvio médio)",
        alignedTrail: "Alinhado, trilho alargado",
        gates: "Preso às portas",
        ghost: "Fantasmas",
      },
      hints: {
        lane: "Ao longo da linha da referência pela fração do troço, ao lado dela pelo traçado, dentro do trilho.",
        laneSmooth:
          "A faixa da referência com a direção medida em 10 m, o desvio de cada linha em média de 8 m e a borda do trilho alcançada aos poucos: sem degraus nem esquinas.",
        gps: "Onde o GPS de cada volta a pôs. Voltas de dias diferentes ficam alguns metros ao lado.",
        aligned:
          "Cada linha inteira deslocada pelo seu desvio médio em relação à referência. Numa curva apertada pode começar antes ou depois da porta.",
        alignedTrail:
          "As linhas alinhadas tal como estão, e o trilho alargado onde elas saem dele, até 5 m para cada lado da referência.",
        gates:
          "Deslocada para começar e acabar onde a referência cruzou as portas, aos poucos pelo meio. As linhas podem sair do trilho.",
        ghost:
          "Cada passagem é um ponto sobre a linha da referência, pela fração do troço. Mostra quem vai à frente, não o traçado.",
      },
    },
    deltaAxis: "Δ tempo (s)",
    timelineAxis: "Tempo",
    deltaChart:
      "A diferença para a referência ao longo do troço: acima da linha atrás dela, abaixo à frente.",
    select: (name) => `Seguir ${name}`,
    showOnMap: (name) => `Mostrar ${name} no mapa`,
    morePasses: (n) => (n === 1 ? "Mais 1 passagem" : `Mais ${n} passagens`),
    jump: {
      takeoff: "Saída",
      apex: "Topo",
      landing: "Receção",
      distance: "Distância",
      height: "Altura",
      airtime: "No ar",
      speed: "km/h",
      noFlight: "Não foi encontrado nenhum voo nesta passagem.",
      estimate:
        "≈ estimado pelo tempo no ar e pela velocidade de saída, como se a receção estivesse à altura do kicker; uma receção mais baixa dá valores por excesso. As rampas são desenhadas, não medidas.",
    },
    notShown: (n) =>
      n === 1
        ? "Mais 1 passagem não é repetida — reduz com os filtros."
        : `Mais ${n} passagens não são repetidas — reduz com os filtros.`,
  },

  view: {
    comparison: "Lado a lado",
    referenceLabel: "Referência:",
    atTime: (time) => `aos ${time}`,
    referenceDeleted: "A sessão de referência foi apagada",
    gatesFromEvent: (metres) => `portas a ${metres} m do evento`,
    referenceTime: "Tempo de referência",
    filters: {
      track: "Pistas",
      allTracks: "Todas",
      group: "Grupo",
      allGroups: "Todos",
      bike: "Bicicleta",
      allBikes: "Todas",
      rider: "Rider",
      allRiders: "Todos",
      setup: "Afinação",
      allSetups: "Todas",
      noSetup: "Sem afinação",
      order: "Ordem",
      newestFirst: "Mais recentes primeiro",
      fastestFirst: "Mais rápidas primeiro",
      groupedBySetup: "Agrupadas por afinação",
    },
    setupLetter: (letter) => (letter ? `Afinação ${letter}` : "Afinação"),
    setupFull: (title) => `${title} completa`,
    reading: (done, total) =>
      `A ler ${done} de ${total} ${total === 1 ? "sessão" : "sessões"}…`,
    referenceLost:
      "A passagem de referência já não existe; a mais antiga fica no seu lugar.",
    noSessions: "Nenhuma sessão passa por estas portas.",
    onlyReference:
      "Só a passagem de referência, por enquanto. As sessões que importares por aqui entram sozinhas.",
    noOtherWithFilters: "Nenhuma outra passagem com estes filtros.",
    dayAndGatesTitle:
      "O dia da gravação e quando atravessou a porta de entrada e a de saída, no relógio da sessão",
    passOf: (index, count) => `passagem ${index} de ${count}`,
    between: (entry, exit) => `entre ${entry} e ${exit}`,
    referencePill: "Referência",
    stopped: "parou",
    noSetupRecorded: "Sem afinação registada",
    sameAsReference: "igual à referência",
    moreChanges: (n) => (n === 1 ? "mais 1 alteração" : `mais ${n} alterações`),
    speedOtherWay: (source) =>
      `Velocidade lida de outra forma (${source}) — as velocidades não se comparam com a referência.`,
    speedSourceGps: "GPS em linha reta",
    speedSourceFused: "fundida com o acelerómetro",
    tieTitle: "Dentro da precisão das portas — conta como empate",
    firstWheel: {
      front: "Frente primeiro",
      rear: "Traseira primeiro",
      both: "As duas rodas",
    },
    settings: {
      title: "Definições do Snapshot",
      description:
        "O nome. As portas e a passagem de referência ficam como foram criadas.",
      name: "Nome",
      deleteTitle: "Apagar este Snapshot?",
      deleteDescription:
        "As portas deixam de existir. As sessões e as suas gravações ficam como estão.",
      deleteSnapshot: "Apagar Snapshot",
    },
  },

  create: {
    compare: "Comparar",
    compareTitle: "Comparar todas as passagens por este troço",
    dialogTitle: "Comparar as passagens por este troço",
    dialogDescription:
      "Todas as passagens pelas duas portas deste troço, nesta sessão e nas outras, lado a lado.",
    cannotCompare: (metres) =>
      `Não dá para comparar este evento: precisa de trilho GPS uns ${metres} m para cada lado, e a gravação não os tem aqui.`,
    searching: "A procurar as sessões que passam por aqui…",
    saved:
      "Guardado como Snapshot. As sessões que importares depois entram sozinhas.",
    openSnapshot: "Abrir o Snapshot",
    alreadySaved: "Este troço já está guardado:",
    madeFrom: (session) => `feito de ${session}`,
    andMore: (n) => `e mais ${n}`,
    saveAnother: "Guardar outro",
    open: "Abrir",
    saveAsSnapshot: "Guardar este troço como Snapshot",
  },

  report: {
    count: (n) =>
      n === 1
        ? "1 troço de referência nesta gravação"
        : `${n} troços de referência nesta gravação`,
    hide: "Esconder os Snapshots",
    show: "Mostrar os Snapshots",
    readingReference: "A ler a sessão de referência…",
    referenceGone: "A passagem de referência já não existe",
    sessionsCompared: "Sessões em comparação",
    ordinal: (n) => `${n}.ª`,
    passTimes: (own, reference) =>
      `${own} s nesta volta, ${reference} s na referência`,
    tieReference: "≈ referência",
  },

  errors: {
    invalidDefinition: "Definição do Snapshot inválida.",
    nameRequired: "O Snapshot precisa de um nome.",
    invalidReference: "Passagem de referência inválida.",
    sessionNotFound: "Sessão não encontrada.",
    noResponse: "Sem resposta.",
    snapshotNotFound: "Snapshot não encontrado.",
  },
};

export const snapshots = { en, pt };
