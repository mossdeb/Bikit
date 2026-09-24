/**
 * Pro dictionary, namespace `importing` (2026-09-24): getting a session
 * into the app — the import dialog with its two tabs, the BLE panel that
 * talks to the logger, the fields every session is asked, the last mile
 * to Storage, and the parsers' recusals (the `.BKT` binary and the
 * exporter's JSON), which are written on screen like everything else.
 * The CSC sensor probe under /pro/sensor lives here too.
 *
 * Portuguese is the original copy; English follows it. Technical words
 * stay the same in both: BLE, GPS, IMU, HDOP, CRC, Fix, PIN, Rider, the
 * block magics and the units.
 */
const en = {
  importButton: "Import",
  importingButton: "Importing…",

  /** The import dialog (imu-session-import.tsx). */
  dialog: {
    trigger: "Import session",
    title: "Import IMU session",
    description:
      "From the device, over Bluetooth, or from a .BKT or JSON file. It is validated before it leaves here.",
    tabDevice: "Device",
    tabFile: "File",
    events: (n: number): string => (n === 1 ? "1 event" : `${n} events`),
    highGShocks: (n: number): string =>
      n === 1 ? "1 high-G shock" : `${n} high-G shocks`,
  },

  /** The questions asked of every session (imu-session-details-fields.tsx). */
  fields: {
    name: "Name",
    rider: "Rider",
    bike: "Bike (optional)",
    noBike: "No bike",
    newBike: "New bike…",
    newBikeName: "New bike's name",
    group: "Group (optional)",
    noGroup: "No group",
    newGroup: "New group…",
    newGroupName: "New group's name",
    newRider: "New rider…",
    newRiderName: "New rider's name",
    riderNamePlaceholder: "Rider's name",
  },

  /** The BLE panel of the dialog (bikit-device-import.tsx). */
  device: {
    noWebBluetooth:
      "This browser has no Web Bluetooth. Use Chrome or Edge (or Bluefy on iOS).",
    idleHint:
      "Connect to the logger over Bluetooth and pick the session on the card.",
    connecting: "Connecting…",
    connect: "Connect",
    disconnect: "Disconnect",
    deviceDisconnected: "The device disconnected.",
    savedPinRefused:
      "The saved PIN is no longer accepted — enter the current one.",
    wrongPin: "Wrong PIN.",
    pinLabel: "Device PIN",
    rememberPin: "Save to my account — on the computer and on the phone",
    authenticate: "Authenticate",
    authenticating: "Authenticating…",
    listing: "Reading the session list…",
    emptyCard: "The card has no sessions.",
    transfer: "Transfer",
    refreshList: "Refresh list",
    manualIdLabel: "Or transfer session no.",
    transferring: (label: string): string => `Transferring ${label}`,
    validated: (label: string): string => `${label} · validated`,
    backToList: "Back to the list",
    failedValidation: (error: string): string =>
      `The transfer arrived whole but the file failed validation: ${error}`,
    hideLog: "Hide log",
    bleLog: (n: number): string => `BLE log (${n})`,
    hideDetails: "Hide details",
    transferDetails: "Transfer details",
    /** The device's own report of itself, line by line. */
    info: {
      battery: "Battery",
      noReading: (raw: string): string => `no reading (${raw})`,
      card: "Card",
      gpsFix: "Fix",
      gpsNoFix: "No fix",
      gpsNoData: "No data",
      satellites: (n: number): string => `${n} sat`,
      hdop: (value: string): string => `HDOP ${value}`,
      signalGood: "good signal",
      signalFair: "fair signal",
      signalWeak: "weak signal",
      /** "1.0 s ago" — the seconds already formatted by the caller. */
      ago: (seconds: string): string => `${seconds} s ago`,
    },
    /** The protocol's own counters, behind "Transfer details". */
    diag: {
      packets: "Packets",
      duplicates: "Duplicates",
      windows: "Windows",
      acks: "ACKs",
      reAcks: "Re-ACKs",
      payload: "Payload",
      window: "Window",
      time: "Time",
    },
  },

  /** The last mile: the file into Storage (import-session.ts). */
  upload: {
    failed: (message: string): string => `Upload failed: ${message}`,
  },

  /** A session's file back out of Storage (use-imu-session.ts). */
  load: {
    downloadFailed: (message: string): string =>
      `Could not download the file: ${message}.`,
    noResponse: "no response",
  },

  /** The CSC sensor probe (csc-probe.tsx and /pro/sensor). */
  probe: {
    pageTitle: "Lab · CSC sensor",
    pageDescription: "Reads and shows. Writes nothing — no bike is touched.",
    ready: "Ready.",
    openingPicker: "Opening the browser's picker…",
    unnamed: "(no name)",
    linkDropped:
      "Connection dropped. Spin the wheel and connect again — the first reading is the answer.",
    connecting: "Connecting…",
    noGatt: "The device exposes no GATT.",
    connected: "Connected. SPIN THE WHEEL — the sensor only counts in motion.",
    failed: (error: string): string => `Failed: ${error}`,
    disconnected:
      "Disconnected. Wait 5 min with the wheel still, then connect again.",
    /** The error list's prefixes: where the error came from. */
    notificationError: (error: string): string => `notification: ${error}`,
    connectError: (error: string): string => `connect: ${error}`,
    disconnectError: (error: string): string => `disconnect: ${error}`,
    noWebBluetooth:
      "This browser has no Web Bluetooth. Chrome on Android is needed. Safari does not support it and will not.",
    errors: "Errors",
    connectSensor: "Connect to sensor",
    disconnect: "Disconnect",
    status: "Status:",
    sensor: "Sensor:",
    connectedFor: "Connected for:",
    notifications: (n: number): string => `${n} notifications`,
    distinct: (n: number): string => `${n} distinct`,
    firstReading: "First reading of this connection",
    now: "Now",
    wheel: "wheel",
    crank: "crank",
  },

  /** The `.BKT` parser's recusals (bkt.ts). Every one names what it saw. */
  bkt: {
    tooShort: "The file is smaller than the 64-byte header.",
    badMagic: 'The file does not start with the "BKTL" or "BKT1" signature.',
    headerSize: (bytes: number): string =>
      `Header of unexpected size (${bytes} bytes).`,
    blockSize: (bytes: number): string =>
      `Blocks of unexpected size (${bytes} bytes).`,
    imuSampleSize: (bytes: number): string =>
      `IMU samples of unexpected size (${bytes} bytes).`,
    headerCrc: "The header CRC does not match — corrupt file.",
    zeroRate: "The header declares a sample rate of zero.",
    noScales: "The header carries no sensor scales.",
    calTruncated: "The calibration block is truncated.",
    calMagic: 'The calibration block does not start with "CAL1".',
    calCrc: "The calibration CRC does not match — corrupt file.",
    oriCrc: "The orientation CRC does not match — corrupt file.",
    oriNotOrthonormal: "The logger's orientation is not an orthonormal frame.",
    incomplete: (declared: number, present: number): string =>
      `Incomplete file: the header declares ${declared} blocks and the file carries ${present}.`,
    noImuSamples: "The file has no IMU samples.",
    blockMagic: (b: number): string =>
      `Block ${b} does not start with "BLK1" — corrupt file.`,
    blockSequence: (b: number, sequence: number): string =>
      `Block ${b} is out of sequence (it says it is ${sequence}).`,
    blockHeaderSize: (b: number, bytes: number): string =>
      `Block ${b} has a ${bytes}-byte header.`,
    imuBlockSampleSize: (b: number, bytes: number): string =>
      `Block ${b} (IMU) has ${bytes}-byte samples.`,
    gnssBlockSampleSize: (b: number, bytes: number): string =>
      `Block ${b} (GNSS) has ${bytes}-byte samples.`,
    highGFormat: (b: number, flags: number): string =>
      `Block ${b} (HIGHG) carries an unknown event format (${flags}).`,
    highGRecordSize: (b: number, bytes: number): string =>
      `Block ${b} (HIGHG) has ${bytes}-byte events.`,
    unknownBlockType: (b: number, type: number): string =>
      `Block ${b} is of an unknown type (${type}).`,
    tooManySamples: (b: number, stream: string): string =>
      `Block ${b} (${stream}) declares more samples than fit.`,
    blockCrc: (b: number, stream: string): string =>
      `The CRC of block ${b} (${stream}) does not match — corrupt file.`,
    imuIndexBackwards: (b: number): string =>
      `Block ${b} (IMU) goes back in the sample index.`,
    moreImuThanDeclared:
      "The blocks carry more IMU samples than the header declares.",
    highGIndexHole: (b: number): string =>
      `Block ${b} (HIGHG) leaves a hole in the event index.`,
    highGTooManySamples: (event: number, count: number): string =>
      `High-G event ${event} declares ${count} samples, more than fit.`,
    gnssIndexHole: (b: number): string =>
      `Block ${b} (GNSS) leaves a hole in the sample index.`,
    gnssTimeBackwards: (i: number, t: number, previous: number): string =>
      `Time goes backwards at GNSS sample ${i} (${t} ms after ${previous} ms).`,
    imuCountMismatch: (written: number, declared: number): string =>
      `The blocks carry ${written} IMU samples and the header declares ${declared}.`,
  },

  /** The JSON parser's recusals (format.ts). */
  json: {
    notObject: "The file is not a JSON object.",
    missingSession: 'The "session" block with the metadata is missing.',
    noSamples: 'The file has no samples ("samples").',
    sampleNotObject: (i: number): string => `Sample ${i} is not an object.`,
    sampleFields: (i: number): string =>
      `Sample ${i} has missing or non-numeric fields.`,
    timeBackwards: (i: number, t: number, previous: number): string =>
      `Time goes backwards at sample ${i} (${t} ms after ${previous} ms).`,
    gpsNotList: (key: string): string => `"${key}" is not a list.`,
    gpsSampleNotObject: (i: number): string =>
      `GPS sample ${i} is not an object.`,
    gpsSampleFields: (i: number): string =>
      `GPS sample ${i} has missing or non-numeric fields.`,
    gpsTimeBackwards: (i: number, t: number, previous: number): string =>
      `Time goes backwards at GPS sample ${i} (${t} ms after ${previous} ms).`,
    unknownFormat:
      'Format not recognised. Expected a file with "format": "bikit_imu_session".',
    notJsonNorBkt: "The file is neither valid JSON nor a sensor .BKT.",
  },
};

const pt: typeof en = {
  importButton: "Importar",
  importingButton: "A importar…",

  dialog: {
    trigger: "Importar sessão",
    title: "Importar sessão IMU",
    description:
      "Do dispositivo, por Bluetooth, ou de um ficheiro .BKT ou JSON. É validada antes de sair daqui.",
    tabDevice: "Dispositivo",
    tabFile: "Ficheiro",
    events: (n) => `${n} eventos`,
    highGShocks: (n) => `${n} ${n === 1 ? "choque" : "choques"} high-G`,
  },

  fields: {
    name: "Nome",
    rider: "Rider",
    bike: "Bicicleta (opcional)",
    noBike: "Sem bicicleta",
    newBike: "Nova bicicleta…",
    newBikeName: "Nome da nova bicicleta",
    group: "Grupo (opcional)",
    noGroup: "Sem grupo",
    newGroup: "Novo grupo…",
    newGroupName: "Nome do novo grupo",
    newRider: "Novo rider…",
    newRiderName: "Nome do novo rider",
    riderNamePlaceholder: "Nome do rider",
  },

  device: {
    noWebBluetooth:
      "Este browser não tem Web Bluetooth. Usa Chrome ou Edge (ou Bluefy em iOS).",
    idleHint: "Liga ao logger por Bluetooth e escolhe a sessão no cartão.",
    connecting: "A ligar…",
    connect: "Ligar",
    disconnect: "Desligar",
    deviceDisconnected: "O dispositivo desligou-se.",
    savedPinRefused: "O PIN guardado deixou de ser aceite — introduz o atual.",
    wrongPin: "PIN incorreto.",
    pinLabel: "PIN do dispositivo",
    rememberPin: "Guardar na minha conta — no computador e no telemóvel",
    authenticate: "Autenticar",
    authenticating: "A autenticar…",
    listing: "A ler a lista de sessões…",
    emptyCard: "O cartão não tem sessões.",
    transfer: "Transferir",
    refreshList: "Atualizar lista",
    manualIdLabel: "Ou transferir a sessão nº",
    transferring: (label) => `A transferir ${label}`,
    validated: (label) => `${label} · validada`,
    backToList: "Voltar à lista",
    failedValidation: (error) =>
      `A transferência chegou inteira mas o ficheiro não passou a validação: ${error}`,
    hideLog: "Ocultar registo",
    bleLog: (n) => `Registo BLE (${n})`,
    hideDetails: "Ocultar detalhes",
    transferDetails: "Detalhes da transferência",
    info: {
      battery: "Bateria",
      noReading: (raw) => `sem leitura (${raw})`,
      card: "Cartão",
      gpsFix: "Fix",
      gpsNoFix: "Sem fix",
      gpsNoData: "Sem dados",
      satellites: (n) => `${n} sat`,
      hdop: (value) => `HDOP ${value}`,
      signalGood: "sinal bom",
      signalFair: "sinal médio",
      signalWeak: "sinal fraco",
      ago: (seconds) => `há ${seconds} s`,
    },
    diag: {
      packets: "Pacotes",
      duplicates: "Duplicados",
      windows: "Janelas",
      acks: "ACKs",
      reAcks: "Re-ACKs",
      payload: "Payload",
      window: "Janela",
      time: "Tempo",
    },
  },

  upload: {
    failed: (message) => `O upload falhou: ${message}`,
  },

  load: {
    downloadFailed: (message) =>
      `Não foi possível descarregar o ficheiro: ${message}.`,
    noResponse: "sem resposta",
  },

  probe: {
    pageTitle: "Lab · Sensor CSC",
    pageDescription:
      "Lê e mostra. Não escreve nada — nenhuma bicicleta é tocada.",
    ready: "Pronto.",
    openingPicker: "A abrir o seletor do browser…",
    unnamed: "(sem nome)",
    linkDropped:
      "Ligação caiu. Gira a roda e liga outra vez — a primeira leitura é a resposta.",
    connecting: "A ligar…",
    noGatt: "O dispositivo não expõe GATT.",
    connected: "Ligado. GIRA A RODA — o sensor só conta em movimento.",
    failed: (error) => `Falhou: ${error}`,
    disconnected:
      "Desligado. Espera 5 min com a roda quieta, depois liga outra vez.",
    notificationError: (error) => `notificação: ${error}`,
    connectError: (error) => `ligar: ${error}`,
    disconnectError: (error) => `desligar: ${error}`,
    noWebBluetooth:
      "Este browser não tem Web Bluetooth. É preciso Chrome em Android. O Safari não suporta e não vai suportar.",
    errors: "Erros",
    connectSensor: "Ligar ao sensor",
    disconnect: "Desligar",
    status: "Estado:",
    sensor: "Sensor:",
    connectedFor: "Ligado há:",
    notifications: (n) => `${n} notificações`,
    distinct: (n) => `${n} distintas`,
    firstReading: "Primeira leitura desta ligação",
    now: "Agora",
    wheel: "roda",
    crank: "pedaleira",
  },

  bkt: {
    tooShort: "O ficheiro é mais pequeno do que o cabeçalho de 64 bytes.",
    badMagic: 'O ficheiro não começa pela assinatura "BKTL" nem "BKT1".',
    headerSize: (bytes) => `Cabeçalho com tamanho inesperado (${bytes} bytes).`,
    blockSize: (bytes) => `Blocos com tamanho inesperado (${bytes} bytes).`,
    imuSampleSize: (bytes) =>
      `Amostras IMU com tamanho inesperado (${bytes} bytes).`,
    headerCrc: "O CRC do cabeçalho não bate certo — ficheiro corrompido.",
    zeroRate: "O cabeçalho declara uma taxa de amostragem de zero.",
    noScales: "O cabeçalho não traz as escalas dos sensores.",
    calTruncated: "O bloco de calibração está truncado.",
    calMagic: 'O bloco de calibração não começa por "CAL1".',
    calCrc: "O CRC da calibração não bate certo — ficheiro corrompido.",
    oriCrc: "O CRC da orientação não bate certo — ficheiro corrompido.",
    oriNotOrthonormal:
      "A orientação do logger não é um referencial ortonormal.",
    incomplete: (declared, present) =>
      `Ficheiro incompleto: o cabeçalho declara ${declared} blocos e o ficheiro traz ${present}.`,
    noImuSamples: "O ficheiro não tem amostras IMU.",
    blockMagic: (b) =>
      `O bloco ${b} não começa por "BLK1" — ficheiro corrompido.`,
    blockSequence: (b, sequence) =>
      `O bloco ${b} está fora de sequência (diz ser o ${sequence}).`,
    blockHeaderSize: (b, bytes) =>
      `O bloco ${b} tem um cabeçalho de ${bytes} bytes.`,
    imuBlockSampleSize: (b, bytes) =>
      `O bloco ${b} (IMU) tem amostras de ${bytes} bytes.`,
    gnssBlockSampleSize: (b, bytes) =>
      `O bloco ${b} (GNSS) tem amostras de ${bytes} bytes.`,
    highGFormat: (b, flags) =>
      `O bloco ${b} (HIGHG) traz um formato de evento desconhecido (${flags}).`,
    highGRecordSize: (b, bytes) =>
      `O bloco ${b} (HIGHG) tem eventos de ${bytes} bytes.`,
    unknownBlockType: (b, type) =>
      `O bloco ${b} é de um tipo desconhecido (${type}).`,
    tooManySamples: (b, stream) =>
      `O bloco ${b} (${stream}) declara mais amostras do que cabem.`,
    blockCrc: (b, stream) =>
      `O CRC do bloco ${b} (${stream}) não bate certo — ficheiro corrompido.`,
    imuIndexBackwards: (b) =>
      `O bloco ${b} (IMU) volta atrás no índice das amostras.`,
    moreImuThanDeclared:
      "Os blocos trazem mais amostras IMU do que o cabeçalho declara.",
    highGIndexHole: (b) =>
      `O bloco ${b} (HIGHG) deixa um buraco no índice dos eventos.`,
    highGTooManySamples: (event, count) =>
      `O evento high-G ${event} declara ${count} amostras, mais do que cabem.`,
    gnssIndexHole: (b) =>
      `O bloco ${b} (GNSS) deixa um buraco no índice das amostras.`,
    gnssTimeBackwards: (i, t, previous) =>
      `O tempo anda para trás na amostra GNSS ${i} (${t} ms após ${previous} ms).`,
    imuCountMismatch: (written, declared) =>
      `Os blocos trazem ${written} amostras IMU e o cabeçalho declara ${declared}.`,
  },

  json: {
    notObject: "O ficheiro não é um objeto JSON.",
    missingSession: 'Falta o bloco "session" com os metadados.',
    noSamples: 'O ficheiro não tem amostras ("samples").',
    sampleNotObject: (i) => `A amostra ${i} não é um objeto.`,
    sampleFields: (i) => `A amostra ${i} tem campos em falta ou não numéricos.`,
    timeBackwards: (i, t, previous) =>
      `O tempo anda para trás na amostra ${i} (${t} ms após ${previous} ms).`,
    gpsNotList: (key) => `"${key}" não é uma lista.`,
    gpsSampleNotObject: (i) => `A amostra GPS ${i} não é um objeto.`,
    gpsSampleFields: (i) =>
      `A amostra GPS ${i} tem campos em falta ou não numéricos.`,
    gpsTimeBackwards: (i, t, previous) =>
      `O tempo anda para trás na amostra GPS ${i} (${t} ms após ${previous} ms).`,
    unknownFormat:
      'Formato não reconhecido. Esperado um ficheiro com "format": "bikit_imu_session".',
    notJsonNorBkt: "O ficheiro não é JSON válido nem um .BKT do sensor.",
  },
};

export const importing = { en, pt };
