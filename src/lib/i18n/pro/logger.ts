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
      autoStop: "Auto Stop",
      /** The hint follows the switch: what happens with it on, and off. */
      autoStopOn:
        "The logger ends the recording once it confirms you have been still for long enough.",
      autoStopOff:
        "The recording carries on until you press the STOP button, even with the bike standing still.",
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
      autoStop: "Auto Stop",
      autoStopOn:
        "O logger termina a gravação quando confirma que estás parado durante o período necessário.",
      autoStopOff:
        "A gravação continua até carregares no botão STOP, mesmo que a bicicleta esteja parada.",
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
