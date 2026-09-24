/**
 * Pro dictionary, namespace `sessions` (2026-09-24): the sessions home
 * and one session's page — the list and its groups, the trash cans and
 * their confirmations, the settings dialog, the trim dialog, the instant
 * dashboard's labels — and the answers of the server actions in
 * src/lib/actions/imu.ts. The analysis card, the import dialog and the
 * report have namespaces of their own.
 *
 * Function entries annotate `: string`, or `typeof en` would infer
 * literal unions and the Portuguese side would not type-check.
 */
const en = {
  /** The sessions home (/pro). */
  list: {
    title: "Sessions",
    subtitle: "Import and analyse sessions recorded by the IMU sensor.",
    empty:
      "No sessions yet. Connect the device or import a .BKT file to get started.",
    /** A card's first line when the session rode on no registered bike. */
    noBike: "No bike",
    /** A group's header line: "Group · Fonte Ferrea · 9/6/26". The day is
     * already formatted (formatGroupDay). */
    groupHeading: (name: string, day: string): string =>
      `Group · ${name} · ${day}`,
    /** The header over the sessions that sit under no group. */
    ungrouped: "No group",
  },
  /** One group's section: the trash can on an empty group, and the line
   * that stands where its cards would. */
  group: {
    deleteTitle: "Delete group?",
    deleteDescription: (name: string): string =>
      `"${name}" has no sessions. The group will no longer exist.`,
    deleteAria: (name: string): string => `Delete the group ${name}`,
    empty: "No sessions in this group.",
  },
  /** Deleting a session — the list's trash can and the settings dialog's
   * foot ask the same question. */
  deleteSession: {
    title: "Delete session?",
    description: (name: string): string =>
      `"${name}" and the original file will no longer exist. There is no way to bring them back.`,
    aria: (name: string): string => `Delete the session ${name}`,
    trigger: "Delete session",
  },
  /** One session's page header. */
  page: {
    report: "Report",
  },
  /** The instant dashboard's three instruments. "Rider" is the lab's word
   * in both languages. */
  dashboard: {
    rider: "Rider",
    accelerateBrake: "Accelerate and brake",
    lateral: "Lateral movement",
    pitch: "Nose up and dive",
  },
  /** The settings dialog behind the three dots. */
  settings: {
    title: "Session settings",
    description:
      "The name, who rode, which bike carried the sensor and which group it belongs to. The recording itself does not change, and can be downloaded exactly as it was stored.",
    preparing: "Preparing…",
    download: (extension: string): string => `Download file (${extension})`,
    downloadFailed: (reason: string): string =>
      `Could not fetch the file: ${reason}.`,
    noStorageResponse: "no response from Storage",
    /** The file name when the session's own name is nothing but characters
     * a file system rejects. */
    fileFallbackName: "session",
  },
  /** The trim dialog. */
  trim: {
    title: "Trim the session",
    description: (fullDuration: string): string =>
      `Only the stretch between the two instants stays: the descent without the hike up or the roll back to the car. The file does not change and the trim can be lifted at any time. The times are the whole recording's, which lasts ${fullDuration}.`,
    start: "Start",
    end: "End",
    visibleWindow: "Visible window",
    suggest: "Suggest",
    wholeRecording: "Whole recording",
    hintFormat: "Write the times as mm:ss, with the end after the start.",
    tooShort: (minimum: string): string =>
      `The stretch has to last at least ${minimum}.`,
    isWhole: "The whole recording — the same as restoring the original.",
    kept: (kept: string, full: string): string =>
      `${kept} of ${full} stay. Time starts counting from the start of the trim.`,
    current: (start: string, end: string): string =>
      `Current trim: ${start}–${end}.`,
    noStretch:
      "The recording has no stretch of riding long enough to suggest one.",
    noGps: "Without GPS there is no speed to guess where the descent starts.",
    suggested:
      "The longest stretch above 3 km/h, with pauses of up to 10 s included.",
    submit: "Trim",
    restore: "Restore original",
  },
  /** The server actions' answers (src/lib/actions/imu.ts). "No access" is
   * common.noAccess. Where a Supabase message is quoted, it rides along
   * untranslated. */
  actions: {
    invalidPath: "Invalid file path.",
    sessionNeedsName: "The session needs a name.",
    invalidMetadata: "Invalid session metadata.",
    invalidTrackIndex: "Invalid track index.",
    bikeNotFound: "Bike not found.",
    bikeNeedsName: "The bike needs a name.",
    planBikeLimit: (plan: string, maxBikes: number): string =>
      `The ${plan} plan allows ${maxBikes} ${maxBikes === 1 ? "bike" : "bikes"}. Pick one from the list or change plan in the settings.`,
    createBikeFailed: "Could not create the bike.",
    groupNotFound: "Group not found.",
    groupNeedsName: "The group needs a name.",
    invalidGroupDay: "Invalid group day.",
    createGroupFailed: "Could not create the group.",
    groupHasSessions: "The group still has sessions.",
    sessionNotFound: "Session not found.",
    deletedButFileStayed: (reason: string): string =>
      `The session was deleted but the file stayed: ${reason}`,
    invalidTrimWindow: "Invalid trim window.",
    invalidSummary: "Invalid session summary.",
    /** The Snapshots whose gates the new window would leave out, by name;
     * the quotes are the language's own. */
    trimLeavesOutSnapshots: (names: string[]): string =>
      `The window leaves out the ${names.length === 1 ? "Snapshot" : "Snapshots"} ${names
        .map((name) => `“${name}”`)
        .join(", ")}. Widen the trim or delete it first.`,
    snapshotDidNotFollow: (name: string, reason: string): string =>
      `The trim was saved, but the Snapshot “${name}” did not follow: ${reason}`,
    invalidOrientation: "Invalid orientation.",
    emptyPin: "Empty PIN.",
  },
};

const pt: typeof en = {
  list: {
    title: "Sessões",
    subtitle: "Importe e analise sessões gravadas pelo sensor IMU.",
    empty:
      "Ainda não há sessões. Ligue o dispositivo ou importe um ficheiro .BKT para começar.",
    noBike: "Sem bicicleta",
    groupHeading: (name, day) => `Grupo · ${name} · ${day}`,
    ungrouped: "Sem grupo",
  },
  group: {
    deleteTitle: "Apagar grupo?",
    deleteDescription: (name) =>
      `"${name}" não tem sessões. O grupo deixa de existir.`,
    deleteAria: (name) => `Apagar o grupo ${name}`,
    empty: "Sem sessões neste grupo.",
  },
  deleteSession: {
    title: "Apagar sessão?",
    description: (name) =>
      `"${name}" e o ficheiro original deixam de existir. Não há forma de os repor.`,
    aria: (name) => `Apagar a sessão ${name}`,
    trigger: "Apagar sessão",
  },
  page: {
    report: "Relatório",
  },
  dashboard: {
    rider: "Rider",
    accelerateBrake: "Acelerar e travar",
    lateral: "Movimento lateral",
    pitch: "Empinar e mergulhar",
  },
  settings: {
    title: "Definições da sessão",
    description:
      "O nome, quem pedalou, que bicicleta levou o sensor e a que grupo pertence. A gravação em si não muda, e pode ser descarregada tal como foi guardada.",
    preparing: "A preparar…",
    download: (extension) => `Descarregar ficheiro (${extension})`,
    downloadFailed: (reason) => `Não foi possível obter o ficheiro: ${reason}.`,
    noStorageResponse: "sem resposta do Storage",
    fileFallbackName: "sessao",
  },
  trim: {
    title: "Recortar a sessão",
    description: (fullDuration) =>
      `Fica só o troço entre os dois instantes: a descida sem a subida a pé nem o rolar até ao carro. O ficheiro não muda e o recorte pode ser reposto a qualquer altura. Os tempos são os da gravação inteira, que dura ${fullDuration}.`,
    start: "Início",
    end: "Fim",
    visibleWindow: "Janela visível",
    suggest: "Sugerir",
    wholeRecording: "Gravação inteira",
    hintFormat: "Escreve os tempos como mm:ss, com o fim depois do início.",
    tooShort: (minimum) => `O troço tem de durar pelo menos ${minimum}.`,
    isWhole: "A gravação inteira — o mesmo que repor o original.",
    kept: (kept, full) =>
      `Ficam ${kept} de ${full}. O tempo passa a contar do início do recorte.`,
    current: (start, end) => `Recorte atual: ${start}–${end}.`,
    noStretch:
      "A gravação não tem um troço em andamento longo o suficiente para sugerir.",
    noGps: "Sem GPS não há velocidade para adivinhar onde a descida começa.",
    suggested:
      "O troço mais longo acima de 3 km/h, com pausas até 10 s incluídas.",
    submit: "Recortar",
    restore: "Repor original",
  },
  actions: {
    invalidPath: "Caminho de ficheiro inválido.",
    sessionNeedsName: "A sessão precisa de um nome.",
    invalidMetadata: "Metadados da sessão inválidos.",
    invalidTrackIndex: "Índice do traçado inválido.",
    bikeNotFound: "Bicicleta não encontrada.",
    bikeNeedsName: "A bicicleta precisa de um nome.",
    planBikeLimit: (plan, maxBikes) =>
      `O plano ${plan} permite ${maxBikes} ${maxBikes === 1 ? "bicicleta" : "bicicletas"}. Escolhe uma da lista ou muda de plano nas definições.`,
    createBikeFailed: "Não foi possível criar a bicicleta.",
    groupNotFound: "Grupo não encontrado.",
    groupNeedsName: "O grupo precisa de um nome.",
    invalidGroupDay: "Dia do grupo inválido.",
    createGroupFailed: "Não foi possível criar o grupo.",
    groupHasSessions: "O grupo ainda tem sessões.",
    sessionNotFound: "Sessão não encontrada.",
    deletedButFileStayed: (reason) =>
      `A sessão foi apagada mas o ficheiro ficou: ${reason}`,
    invalidTrimWindow: "Janela de recorte inválida.",
    invalidSummary: "Resumo da sessão inválido.",
    trimLeavesOutSnapshots: (names) =>
      `A janela deixa de fora ${names.length === 1 ? "o Snapshot" : "os Snapshots"} ${names
        .map((name) => `«${name}»`)
        .join(", ")}. Alarga o recorte ou apaga-o primeiro.`,
    snapshotDidNotFollow: (name, reason) =>
      `O recorte ficou guardado, mas o Snapshot «${name}» não acompanhou: ${reason}`,
    invalidOrientation: "Orientação inválida.",
    emptyPin: "PIN vazio.",
  },
};

export const sessions = { en, pt };
