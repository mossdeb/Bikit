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
  /** The GPS detail under the header, behind "Show more" (GPS_STATUS,
   * firmware V18.10, 2026-11-09). */
  gps: {
    show: "GPS details",
    hide: "Hide GPS details",
    unsupported: "This logger's firmware does not report GPS details yet.",
    reading: "Reading the GPS…",
    status: "Status",
    fix: "Fix",
    fixNone: "None",
    satellites: "Satellites",
    satellitesValue: (used: string, visible: string): string =>
      `${used} used · ${visible} visible`,
    accuracy: "Accuracy",
    age: "Last reading",
    ageValue: (seconds: string): string => `${seconds} s ago`,
    na: "–",
    states: {
      READY: "Ready",
      NO_DATA: "No data",
      NO_PVT: "No position",
      STALE: "Stale",
      NO_FIX: "No fix",
      LOW_SATS: "Few satellites",
      HIGH_HACC: "Low accuracy",
    } as Record<string, string>,
    explain: {
      READY: "The GPS meets the criteria to start recording.",
      NO_DATA: "No recent messages from the GPS.",
      NO_PVT: "Messages arrive, but no position solution has come yet.",
      STALE: "The position data expired or reception was poor.",
      NO_FIX: "No valid 2D or 3D fix.",
      LOW_SATS: "Fewer than 4 satellites in use.",
      HIGH_HACC: "Estimated accuracy worse than 30 m.",
    } as Record<string, string>,
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
      /** GPS_FIX_PROTECTION (firmware V18.10, 2026-11-09): the hint
       * follows the switch, as Auto Stop's does. */
      gpsFix: "GPS Fix Protection",
      gpsFixOn:
        "The recording only starts once the GPS has a good fix. Without one, START is refused.",
      gpsFixOff:
        "The recording starts with or without a GPS fix. For bench tests.",
      /** AUTO_SLEEP: 1 = Timed, 0 = Motion-Aware (2026-11-08). */
      sleepMode: "Sleep Mode",
      sleepModeHint: "How the logger goes to sleep when it is not recording.",
      timedSleep: "Timed Sleep",
      timedSleepHint:
        "Sleeps once the Sleep Timer runs out, even while it detects movement.",
      motionSleep: "Motion-Aware Sleep",
      motionSleepHint:
        "Stays awake while it detects movement, even when not recording. The Sleep Timer starts once movement stops.",
      sleepAfter: "Sleep Timer",
      sleepAfterHint: "Time before the logger goes to sleep.",
      minutes: (n: number): string => `${n} min`,
    },
    vehicle: {
      title: "Vehicle Type",
      hint: "Saved with each session as metadata. The logger applies no filter.",
      bicycle: "Bicycle / E-MTB",
      bicycleHint: "Conventional and electric bikes",
      motorcycle: "Dirt Bike",
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
  gps: {
    show: "Detalhes do GPS",
    hide: "Esconder detalhes do GPS",
    unsupported: "O firmware deste logger ainda não envia os detalhes do GPS.",
    reading: "A ler o GPS…",
    status: "Estado",
    fix: "Fix",
    fixNone: "Nenhum",
    satellites: "Satélites",
    satellitesValue: (used, visible) => `${used} usados · ${visible} visíveis`,
    accuracy: "Precisão",
    age: "Última leitura",
    ageValue: (seconds) => `há ${seconds} s`,
    na: "–",
    states: {
      READY: "Pronto",
      NO_DATA: "Sem dados",
      NO_PVT: "Sem posição",
      STALE: "Desatualizado",
      NO_FIX: "Sem fix",
      LOW_SATS: "Poucos satélites",
      HIGH_HACC: "Pouca precisão",
    },
    explain: {
      READY: "O GPS cumpre os critérios para começar a gravar.",
      NO_DATA: "Sem mensagens recentes do GPS.",
      NO_PVT: "Chegam mensagens, mas ainda nenhuma solução de posição.",
      STALE: "Os dados de posição expiraram ou a receção foi fraca.",
      NO_FIX: "Sem fix 2D ou 3D válido.",
      LOW_SATS: "Menos de 4 satélites em uso.",
      HIGH_HACC: "Precisão estimada pior que 30 m.",
    },
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
      gpsFix: "GPS Fix Protection",
      gpsFixOn:
        "A gravação só começa quando o GPS tem um bom fix. Sem ele, o START é recusado.",
      gpsFixOff:
        "A gravação começa com ou sem fix de GPS. Para testes de bancada.",
      sleepMode: "Sleep Mode",
      sleepModeHint: "Como o logger entra em suspensão quando não está a gravar.",
      timedSleep: "Timed Sleep",
      timedSleepHint:
        "Entra em suspensão quando acaba o Sleep Timer, mesmo que esteja a detetar movimento.",
      motionSleep: "Motion-Aware Sleep",
      motionSleepHint:
        "Mantém-se acordado enquanto detetar movimento, mesmo sem gravar. Quando o movimento para, começa a contagem do Sleep Timer.",
      sleepAfter: "Sleep Timer",
      sleepAfterHint: "Tempo até o logger entrar em suspensão.",
      minutes: (n: number): string => `${n} min`,
    },
    vehicle: {
      title: "Tipo de veículo",
      hint: "Fica guardado em cada sessão como metadado. O logger não aplica nenhum filtro.",
      bicycle: "Bicicleta / E-MTB",
      bicycleHint: "Bicicletas convencionais e elétricas",
      motorcycle: "Mota de cross",
      motorcycleHint: "Motas, com a vibração adicional do motor",
    },
  },
};

export const logger = { en, pt };
