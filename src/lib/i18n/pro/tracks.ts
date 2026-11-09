/**
 * Timed tracks (src/lib/imu/timed-track.ts, 2026-10-24): the start and
 * finish button beside the scissors, its dialog, and the actions' answers.
 */
const en = {
  /** The button beside the scissors. */
  button: "Start and finish",
  buttonWithTime: (time: string): string =>
    `Start and finish — this run ${time}`,
  title: "Start and finish",
  thisRun: "This run",
  /** The ranking under the duration (2026-10-26): the bold part, then the
   * rest. */
  rank: (n: number): string => {
    if (n === 1) return "Best time";
    const tens = n % 100;
    const suffix =
      tens >= 11 && tens <= 13
        ? "th"
        : n % 10 === 1
          ? "st"
          : n % 10 === 2
            ? "nd"
            : n % 10 === 3
              ? "rd"
              : "th";
    return `${n}${suffix} best time`;
  },
  onTrack: "on this track",
  best: "Best",
  /** A run within the tie of the best, but not the best itself. */
  tied: "Tie",
  noRunHere:
    "This run does not pass the track's start and finish lines in that order.",
  runsTitle: "Runs on this track",
  loadingRuns: "Reading the runs…",
  noOtherRuns: "No other run on this track yet.",
  runFailed: "Could not read this session.",
  tie: "Differences under 0.2 s are a tie: the lines measure no finer.",
  /** The form that draws the lines. */
  name: "Track name",
  namePlaceholder: "e.g. Fonte Ferrea — race track",
  /** A new track's suggested name, editable: the place, when the map has
   * a name for it, then "New track 03". */
  newTrackName: (place: string | null, n: number): string =>
    `${place ? `${place} - ` : ""}New track ${String(n).padStart(2, "0")}`,
  start: "Start",
  finish: "Finish",
  /** A circuit: one line, each crossing a lap. */
  circuit: "Circuit: one finish line",
  finishLine: "Crossing the finish",
  noLaps:
    "No laps there: the bike has to cross that point at least twice, moving, with GPS.",
  lap: (n: number): string => `Lap ${n}`,
  lapsTitle: (n: number): string => (n === 1 ? "1 lap" : `${n} laps`),
  lapsSummary: (n: number, best: string): string =>
    `${n === 1 ? "1 lap" : `${n} laps`} · best ${best}`,
  bestLap: "Best lap",
  /** The laps card. */
  lapsCard: "Laps",
  lapZoom: (n: number): string => `Zoom the plot to lap ${n}`,
  trimWindow: "Trim",
  visibleWindow: "Visible window",
  wholeRecording: "Whole recording",
  hintFormat: "Write the times as mm:ss, with the finish after the start.",
  noLines:
    "No lines could be drawn there: the bike has to be moving at both instants, with GPS.",
  noGps: "This recording has no GPS, so no lines can be drawn on it.",
  create: "Create track",
  /** A new track whose lines lie within 25 m of an existing one's
   * (2026-11-09): offered that track instead. */
  sameTrack: (name: string, startM: number, finishM: number): string =>
    `"${name}" already covers this stretch: its start is ${startM} m and its finish ${finishM} m from these lines. Use it, so the runs are timed between the same lines?`,
  useSameTrack: (name: string): string => `Use "${name}"`,
  createAnyway: "Create a new one anyway",
  save: "Save",
  redefine: "Redraw from this run",
  rename: "Rename",
  delete: "Delete track",
  deleteConfirm:
    "Delete this track? The sessions do not change; only the start and finish lines go.",
  cancel: "Cancel",
  otherTracks: "Other tracks this run passes",
  newTrack: "New track",
  /** The track editor's page (2026-11-09): the map, and the bar under it
   * with the start and finish to drag. */
  editor: {
    newTitle: "New track",
    editTitle: "Edit track",
    altitude: "Altitude",
    speed: "Speed",
    dragStart: "Drag the start",
    dragFinish: "Drag the finish",
    hint: "Drag the flags along the bar, or press the bar where a line should go.",
    loading: "Reading the recording…",
    dragSector: (n: number): string => `Drag sector line ${n}`,
    sectors: "Sectors",
    fewerSectors: "One sector fewer",
    moreSectors: "One sector more",
    evenOut: "Spread evenly",
    /** Under a sector line: how many of the track's runs cross it. */
    crossing: (n: number, total: number): string => `${n}/${total} runs`,
    counting: "Counting the runs that cross each line…",
    sectorsHint:
      "The numbered lines cut the track into sectors for the Perfect Run. Under each, how many of the track's runs cross it: a run that misses one is left out of its rider's Perfect Run.",
    sectorsNotSaved: (message: string): string =>
      `The track was saved, but not its sectors: ${message}`,
    /** A redraw that takes recordings off the track, or brings some back
     * (2026-11-09). */
    runsLost: (names: string[]): string =>
      `With these lines, ${names.length === 1 ? "1 recording no longer passes" : `${names.length} recordings no longer pass`} the track and ${names.length === 1 ? "leaves" : "leave"} its times: ${names.join(", ")}.`,
    runsGained: (names: string[]): string =>
      `With these lines, ${names.length === 1 ? "1 more recording passes" : `${names.length} more recordings pass`} the track: ${names.join(", ")}.`,
  },
  /** Perfect Run (2026-11-09): the best sectors of one rider's runs on
   * the track, added up. */
  perfect: {
    tabTimes: "Times",
    tab: "Perfect Run",
    /** The line under the ranking: the time, then what it would gain. */
    line: (time: string): string => `Perfect Run ${time}`,
    gainShort: (s: string): string => `−${s} s possible`,
    bestActual: "Best actual run",
    perfectRun: "Perfect Run",
    gain: (s: string): string => `${s} s faster in theory`,
    noGain: "No sector beats the best run by more than the lines measure.",
    uncertainty: (s: string): string => `± ${s} s from the lines`,
    sectorsTitle: "Best sectors combined",
    /** Under the map: where the best run loses the most. */
    mostToGain: (n: number, s: string): string =>
      `Most to gain in sector ${n}: the best run is ${s} s off its best.`,
    sector: (n: number): string => `Sector ${n}`,
    /** What the best actual run loses in a sector. */
    potential: (s: string): string => `best run +${s} s`,
    bestRunHere: "from the best run",
    runs: (n: number): string => (n === 1 ? "1 run" : `${n} runs`),
    excluded: (n: number): string =>
      n === 1
        ? "1 sector left out: its GPS or ground did not match the others."
        : `${n} sectors left out: their GPS or ground did not match the others.`,
    missed: (n: number): string =>
      n === 1
        ? "1 run does not cross every sector line and is not counted."
        : `${n} runs do not cross every sector line and are not counted.`,
    loading: "Reading the runs…",
    needsTwo: "The Perfect Run needs at least two runs by this rider on this track.",
    noSectors: "This track could not be cut into sectors.",
    circuit: "Circuits are not split into sectors yet.",
  },
  errors: {
    invalidDefinition: "Invalid start and finish.",
    nameRequired: "The track needs a name.",
    sessionNotFound: "Session not found.",
    trackNotFound: "Track not found.",
    noResponse: "No response.",
  },
};

const pt: typeof en = {
  button: "Partida e chegada",
  buttonWithTime: (time) => `Partida e chegada — esta run ${time}`,
  title: "Partida e chegada",
  thisRun: "Esta run",
  rank: (n) => (n === 1 ? "Melhor tempo" : `${n}.º melhor tempo`),
  onTrack: "nesta pista",
  best: "Melhor",
  tied: "Empate",
  noRunHere:
    "Esta run não passa pela partida e pela chegada desta pista, por essa ordem.",
  runsTitle: "Runs nesta pista",
  loadingRuns: "A ler as runs…",
  noOtherRuns: "Ainda não há outras runs nesta pista.",
  runFailed: "Não foi possível ler esta sessão.",
  tie: "Diferenças abaixo de 0,2 s são empate: as linhas não medem mais fino.",
  name: "Nome da pista",
  namePlaceholder: "ex. Fonte Ferrea — pista de corrida",
  newTrackName: (place, n) =>
    `${place ? `${place} - ` : ""}Nova pista ${String(n).padStart(2, "0")}`,
  start: "Partida",
  finish: "Chegada",
  circuit: "Circuito: uma só meta",
  finishLine: "Passagem pela meta",
  noLaps:
    "Sem voltas aí: a bicicleta tem de passar nesse ponto pelo menos duas vezes, em movimento e com GPS.",
  lap: (n) => `Volta ${n}`,
  lapsTitle: (n) => (n === 1 ? "1 volta" : `${n} voltas`),
  lapsSummary: (n, best) =>
    `${n === 1 ? "1 volta" : `${n} voltas`} · melhor ${best}`,
  bestLap: "Melhor volta",
  lapsCard: "Voltas",
  lapZoom: (n) => `Aproximar o gráfico à volta ${n}`,
  trimWindow: "Recorte",
  visibleWindow: "Janela visível",
  wholeRecording: "Gravação inteira",
  hintFormat: "Escreve os tempos como mm:ss, com a chegada depois da partida.",
  noLines:
    "Não deu para traçar as linhas aí: a bicicleta tem de estar em andamento nos dois instantes, com GPS.",
  noGps: "Esta gravação não tem GPS, por isso não dá para traçar linhas nela.",
  create: "Criar pista",
  sameTrack: (name, startM, finishM) =>
    `A pista "${name}" já cobre este troço: a partida dela fica a ${startM} m e a chegada a ${finishM} m destas linhas. Usar essa, para as runs serem medidas entre as mesmas linhas?`,
  useSameTrack: (name) => `Usar "${name}"`,
  createAnyway: "Criar uma nova mesmo assim",
  save: "Guardar",
  redefine: "Redesenhar a partir desta run",
  rename: "Mudar nome",
  delete: "Apagar pista",
  deleteConfirm:
    "Apagar esta pista? As sessões não mudam; só saem as linhas de partida e chegada.",
  cancel: "Cancelar",
  otherTracks: "Outras pistas por onde esta run passa",
  newTrack: "Nova pista",
  editor: {
    newTitle: "Nova pista",
    editTitle: "Editar pista",
    altitude: "Altitude",
    speed: "Velocidade",
    dragStart: "Arrastar a partida",
    dragFinish: "Arrastar a chegada",
    hint: "Arrasta as bandeiras ao longo da barra, ou carrega na barra onde deve ficar uma linha.",
    loading: "A ler a gravação…",
    dragSector: (n) => `Arrastar a linha do sector ${n}`,
    sectors: "Sectores",
    fewerSectors: "Menos um sector",
    moreSectors: "Mais um sector",
    evenOut: "Distribuir por igual",
    crossing: (n, total) => `${n}/${total} runs`,
    counting: "A contar as runs que cruzam cada linha…",
    sectorsHint:
      "As linhas numeradas dividem a pista em sectores para a Perfect Run. Por baixo de cada uma, quantas runs da pista a cruzam: uma run que falhe uma fica de fora da Perfect Run do seu rider.",
    sectorsNotSaved: (message) =>
      `A pista ficou guardada, mas os sectores não: ${message}`,
    runsLost: (names) =>
      `Com estas linhas, ${names.length === 1 ? "1 gravação deixa" : `${names.length} gravações deixam`} de passar na pista e ${names.length === 1 ? "sai" : "saem"} dos tempos: ${names.join(", ")}.`,
    runsGained: (names) =>
      `Com estas linhas, ${names.length === 1 ? "mais 1 gravação passa" : `mais ${names.length} gravações passam`} na pista: ${names.join(", ")}.`,
  },
  perfect: {
    tabTimes: "Tempos",
    tab: "Perfect Run",
    line: (time) => `Perfect Run ${time}`,
    gainShort: (s) => `−${s} s possíveis`,
    bestActual: "Melhor run real",
    perfectRun: "Perfect Run",
    gain: (s) => `${s} s mais rápida, em teoria`,
    noGain: "Nenhum sector bate a melhor run por mais do que as linhas medem.",
    uncertainty: (s) => `± ${s} s das linhas`,
    sectorsTitle: "Melhores sectores combinados",
    mostToGain: (n, s) =>
      `Mais a ganhar no sector ${n}: a melhor run fica ${s} s atrás do melhor.`,
    sector: (n) => `Sector ${n}`,
    potential: (s) => `melhor run +${s} s`,
    bestRunHere: "da melhor run",
    runs: (n) => (n === 1 ? "1 run" : `${n} runs`),
    excluded: (n) =>
      n === 1
        ? "1 sector ficou de fora: o GPS ou o percurso não batia com os outros."
        : `${n} sectores ficaram de fora: o GPS ou o percurso não batia com os outros.`,
    missed: (n) =>
      n === 1
        ? "1 run não cruza todas as linhas dos sectores e não conta."
        : `${n} runs não cruzam todas as linhas dos sectores e não contam.`,
    loading: "A ler as runs…",
    needsTwo: "A Perfect Run precisa de pelo menos duas runs deste rider nesta pista.",
    noSectors: "Não foi possível dividir esta pista em sectores.",
    circuit: "Os circuitos ainda não se dividem em sectores.",
  },
  errors: {
    invalidDefinition: "Partida e chegada inválidas.",
    nameRequired: "A pista precisa de um nome.",
    sessionNotFound: "Sessão não encontrada.",
    trackNotFound: "Pista não encontrada.",
    noResponse: "Sem resposta.",
  },
};

export const tracks = { en, pt };
