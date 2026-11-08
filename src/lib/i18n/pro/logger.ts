/**
 * Pro dictionary, namespace `logger` (2026-11-08): the Logger area — its
 * header (the device card, whose words stay in `importing.device`), its
 * tabs, and the Settings tab's two groups.
 */
const en = {
  title: "Logger",
  description: "Connect to the logger to see its state and change how it records.",
  idleHint: "Connect to the logger over Bluetooth to see and change its settings.",
  simulated: "Simulated logger — nothing is sent to a real device.",
  connectSimulated: "Connect to the simulator",
  tabs: {
    settings: "Settings",
  },
  settings: {
    /** Shown before connecting. */
    disconnected: "Connect to the logger to read its settings.",
    loading: "Reading the logger's settings…",
    /** CONFIG answered ERROR UNKNOWN_COMMAND. */
    unsupported:
      "This logger's firmware has no settings yet. Update the firmware to change them here.",
    readError: (error: string): string => `Could not read the settings: ${error}`,
    saved: "Saved on the logger.",
    notSent: "The logger did not send this setting.",
    power: {
      title: "Power & Recording",
      autoStop: "Auto Stop Recording",
      autoStopHint:
        "Ends a recording when the bike stops moving: after at least 60 s of recording, and 90 s still with GPS or 120 s without.",
      autoSleep: "Auto Sleep",
      autoSleepHint: "Lets the logger go into low-power mode by itself.",
      sleepAfter: "Sleep on Inactivity",
      sleepAfterHint: "Time without movement before the logger sleeps.",
      minutes: (n: number): string => `${n} min`,
    },
    vehicle: {
      title: "Vehicle Type",
      hint: "Saved with each session as metadata. The logger applies no filter.",
      bicycle: "Bicycle / E-MTB",
      bicycleHint: "Conventional and electric bikes",
      motorcycle: "Motorcycle",
      motorcycleHint: "Motorbikes, with the engine's added vibration",
    },
  },
};

const pt: typeof en = {
  title: "Logger",
  description: "Liga ao logger para ver o estado dele e mudar a forma como grava.",
  idleHint: "Liga ao logger por Bluetooth para ver e mudar as definições.",
  simulated: "Logger simulado — nada é enviado para um dispositivo real.",
  connectSimulated: "Ligar ao simulador",
  tabs: {
    settings: "Definições",
  },
  settings: {
    disconnected: "Liga ao logger para ler as definições.",
    loading: "A ler as definições do logger…",
    unsupported:
      "O firmware deste logger ainda não tem definições. Atualiza o firmware para as mudares aqui.",
    readError: (error: string): string => `Não foi possível ler as definições: ${error}`,
    saved: "Guardado no logger.",
    notSent: "O logger não enviou esta definição.",
    power: {
      title: "Energia e gravação",
      autoStop: "Parar gravação automaticamente",
      autoStopHint:
        "Termina a gravação quando a bicicleta deixa de se mexer: com pelo menos 60 s gravados, e 90 s parada com GPS ou 120 s sem.",
      autoSleep: "Suspensão automática",
      autoSleepHint: "Deixa o logger entrar sozinho em modo de baixo consumo.",
      sleepAfter: "Suspender após inatividade",
      sleepAfterHint: "Tempo sem movimento antes de o logger suspender.",
      minutes: (n: number): string => `${n} min`,
    },
    vehicle: {
      title: "Tipo de veículo",
      hint: "Fica guardado em cada sessão como metadado. O logger não aplica nenhum filtro.",
      bicycle: "Bicicleta / E-MTB",
      bicycleHint: "Bicicletas convencionais e elétricas",
      motorcycle: "Mota",
      motorcycleHint: "Motas, com a vibração adicional do motor",
    },
  },
};

export const logger = { en, pt };
