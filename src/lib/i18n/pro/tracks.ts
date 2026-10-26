/**
 * Timed tracks (src/lib/imu/timed-track.ts, 2026-10-24): the start and
 * finish button beside the scissors, its dialog, and the actions' answers.
 */
const en = {
  /** The button beside the scissors. */
  button: "Start and finish",
  buttonWithTime: (time: string): string => `Start and finish — this run ${time}`,
  title: "Start and finish",
  thisRun: "This run",
  /** The ranking under the duration (2026-10-26): the bold part, then the
   * rest. */
  rank: (n: number): string => {
    if (n === 1) return "Best run";
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
    return `${n}${suffix} best run`;
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
  start: "Start",
  finish: "Finish",
  trimWindow: "Trim",
  visibleWindow: "Visible window",
  wholeRecording: "Whole recording",
  hintFormat: "Write the times as mm:ss, with the finish after the start.",
  noLines:
    "No lines could be drawn there: the bike has to be moving at both instants, with GPS.",
  noGps: "This recording has no GPS, so no lines can be drawn on it.",
  create: "Create track",
  save: "Save",
  redefine: "Redraw from this run",
  rename: "Rename",
  delete: "Delete track",
  deleteConfirm:
    "Delete this track? The sessions do not change; only the start and finish lines go.",
  cancel: "Cancel",
  otherTracks: "Other tracks this run passes",
  newTrack: "New track",
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
  rank: (n) => (n === 1 ? "Melhor run" : `${n}.ª melhor run`),
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
  start: "Partida",
  finish: "Chegada",
  trimWindow: "Recorte",
  visibleWindow: "Janela visível",
  wholeRecording: "Gravação inteira",
  hintFormat: "Escreve os tempos como mm:ss, com a chegada depois da partida.",
  noLines:
    "Não deu para traçar as linhas aí: a bicicleta tem de estar em andamento nos dois instantes, com GPS.",
  noGps: "Esta gravação não tem GPS, por isso não dá para traçar linhas nela.",
  create: "Criar pista",
  save: "Guardar",
  redefine: "Redesenhar a partir desta run",
  rename: "Mudar nome",
  delete: "Apagar pista",
  deleteConfirm:
    "Apagar esta pista? As sessões não mudam; só saem as linhas de partida e chegada.",
  cancel: "Cancelar",
  otherTracks: "Outras pistas por onde esta run passa",
  newTrack: "Nova pista",
  errors: {
    invalidDefinition: "Partida e chegada inválidas.",
    nameRequired: "A pista precisa de um nome.",
    sessionNotFound: "Sessão não encontrada.",
    trackNotFound: "Pista não encontrada.",
    noResponse: "Sem resposta.",
  },
};

export const tracks = { en, pt };
