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
    retentionCorrected: "Corr. retention",
    decel: "Max braking",
    speedLost: "Speed lost",
    takeoff: "Takeoff",
    impacts: "Impacts",
    peakG: "Peak G",
    airtime: "Airtime",
  },

  /** The Snapshot's page (imu-snapshot-view). */
  view: {
    /** The header's small line over the name, in the comparison that is
     * not saved yet: "Comparison · Corner". A saved one says "Snapshot". */
    comparison: "Comparison",
    /** "Reference: {session link} at 12:34 · " — the link sits between
     * the two, so the sentence is two keys. */
    referenceLabel: "Reference:",
    atTime: (time: string): string => `at ${time}`,
    referenceDeleted: "The reference session was deleted",
    gatesFromEvent: (metres: number): string =>
      `gates ${metres} m from the event`,
    filters: {
      bike: "Bike",
      allBikes: "All bikes",
      rider: "Rider",
      allRiders: "All riders",
      setup: "Setup",
      allSetups: "All setups",
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
    /** The note under a pass whose speed was read another way than the
     * reference's; `source` is one of the two below. */
    speedOtherWay: (source: string): string =>
      `Speed read another way (${source}) — the speeds do not compare with the reference's.`,
    speedSourceGps: "straight-line GPS",
    speedSourceFused: "fused with the accelerometer",
    tieTitle: "Within the gates' precision — counts as a tie",
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
    retentionCorrected: "Ret. corrigida",
    decel: "Travagem máx",
    speedLost: "Vel. perdida",
    takeoff: "Descolagem",
    impacts: "Impactos",
    peakG: "G máx",
    airtime: "No ar",
  },

  view: {
    comparison: "Comparação",
    referenceLabel: "Referência:",
    atTime: (time) => `aos ${time}`,
    referenceDeleted: "A sessão de referência foi apagada",
    gatesFromEvent: (metres) => `portas a ${metres} m do evento`,
    filters: {
      bike: "Bicicleta",
      allBikes: "Todas as bicicletas",
      rider: "Rider",
      allRiders: "Todos os riders",
      setup: "Afinação",
      allSetups: "Todas as afinações",
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
    speedOtherWay: (source) =>
      `Velocidade lida de outra forma (${source}) — as velocidades não se comparam com a referência.`,
    speedSourceGps: "GPS em linha reta",
    speedSourceFused: "fundida com o acelerómetro",
    tieTitle: "Dentro da precisão das portas — conta como empate",
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
